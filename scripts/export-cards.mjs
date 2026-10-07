// Builds data/cards.json from the Pokémon TCG API (https://pokemontcg.io/).
//
// Run with:  npm run export-data
//       or:  node scripts/export-cards.mjs
// Optional:  POKEMON_TCG_API_KEY=your-key npm run export-data
//
// Strategy:
//   1. Get the list of set series (Base, Neo, XY, Scarlet & Violet, ...), then
//      fetch up to PAGES_PER_SERIES pages spread across each series, so every
//      era is represented without downloading every card.
//   2. Keep only cards with all required fields and a TCGplayer market price.
//   3. Group by set series, shuffle each group, then take one card from each
//      series in turn (round-robin) until we reach TARGET_CARDS.
//   4. Sort and write a flat JSON array.

import { writeFile, stat } from "node:fs/promises";

const API_URL = "https://api.pokemontcg.io/v2";
const OUTPUT_PATH = new URL("../data/cards.json", import.meta.url);

const PAGE_SIZE = 250;
const PAGES_PER_SERIES = 5; // at most 1,250 raw cards per series
const TARGET_CARDS = 2000;
const MAX_RETRIES = 8;
const REQUEST_TIMEOUT_MS = 60_000;
const RANDOM_SEED = 151; // fixed seed so re-running gives the same sample

const PRICE_PRIORITY = [
  "holofoil",
  "reverseHolofoil",
  "normal",
  "1stEditionHolofoil",
  "1stEditionNormal",
];

const API_FIELDS = "id,name,supertype,subtypes,types,hp,rarity,artist,set,tcgplayer,images";

/* ---------- Fetching ---------- */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetches one page from an API endpoint. Returns the parsed body, or null
// if every retry failed. The API often returns random 500/502 errors, so
// failed requests are retried with a growing delay.
async function fetchPage(endpoint, params) {
  const url = `${API_URL}/${endpoint}?${new URLSearchParams(params)}`;
  const label = `${endpoint} ${params.q ?? ""} page ${params.page ?? 1}`.replace(/\s+/g, " ");
  const headers = {};
  if (process.env.POKEMON_TCG_API_KEY) {
    headers["X-Api-Key"] = process.env.POKEMON_TCG_API_KEY;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 429) {
        const waitSeconds = Number(response.headers.get("retry-after")) || 15 * attempt;
        console.warn(`  Rate limited (${label}). Waiting ${waitSeconds}s...`);
        await sleep(waitSeconds * 1000);
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = await response.json();
      if (!body || !Array.isArray(body.data)) {
        throw new Error("Response did not contain a data array");
      }
      return body;
    } catch (error) {
      console.warn(`  ${label}: attempt ${attempt} failed (${error.message})`);
      if (attempt < MAX_RETRIES) await sleep(2000 * attempt);
    }
  }
  console.warn(`  Giving up on ${label}.`);
  return null;
}

async function fetchCardPage(series, page) {
  return fetchPage("cards", {
    q: `set.series:"${series}"`,
    page: String(page),
    pageSize: String(PAGE_SIZE),
    orderBy: "set.releaseDate,id",
    select: API_FIELDS,
  });
}

async function fetchSeriesNames() {
  const body = await fetchPage("sets", { pageSize: String(PAGE_SIZE), select: "series" });
  if (!body) throw new Error("Could not load the list of sets from the Pokémon TCG API.");
  return [...new Set(body.data.map((set) => textOrNull(set?.series)).filter(Boolean))];
}

// Page numbers spread evenly from the first page to the last.
function spreadPages(totalPages, count) {
  if (totalPages <= count) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set();
  for (let i = 0; i < count; i++) {
    pages.add(1 + Math.round((i * (totalPages - 1)) / (count - 1)));
  }
  return [...pages];
}

async function fetchRawCards() {
  const seriesNames = await fetchSeriesNames();
  console.log(`Found ${seriesNames.length} set series: ${seriesNames.join(", ")}\n`);

  const rawCards = [];
  for (const series of seriesNames) {
    // Page 1 also tells us how many cards (and pages) this series has.
    const first = await fetchCardPage(series, 1);
    if (!first || first.data.length === 0) {
      console.warn(`${series}: no cards fetched; skipping.`);
      continue;
    }

    const totalPages = Math.ceil((first.totalCount || first.data.length) / PAGE_SIZE);
    const pages = spreadPages(totalPages, PAGES_PER_SERIES);
    let seriesCount = first.data.length;
    rawCards.push(...first.data);

    for (const page of pages) {
      if (page === 1) continue;
      const body = await fetchCardPage(series, page);
      if (!body || body.data.length === 0) continue;
      rawCards.push(...body.data);
      seriesCount += body.data.length;
    }
    console.log(`${series}: ${seriesCount} of ${first.totalCount} cards (pages ${pages.join(", ")})`);
  }
  return rawCards;
}

/* ---------- Cleaning ---------- */

function getMarketPrice(card) {
  const prices = card?.tcgplayer?.prices;
  if (!prices || typeof prices !== "object") return null;

  for (const kind of PRICE_PRIORITY) {
    const market = prices[kind]?.market;
    if (typeof market === "number" && Number.isFinite(market) && market > 0) {
      return { priceUsd: market, priceKind: kind };
    }
  }
  return null;
}

// API dates look like "1999/01/09".
function parseReleaseDate(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return { releaseDate: `${year}-${month}-${day}`, releaseYear: Number(year) };
}

function textOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanCard(card) {
  if (!card || typeof card !== "object") return null;

  const id = textOrNull(card.id);
  const name = textOrNull(card.name);
  const supertype = textOrNull(card.supertype);
  const rarity = textOrNull(card.rarity);
  const date = parseReleaseDate(card.set?.releaseDate);
  const price = getMarketPrice(card);
  if (!id || !name || !supertype || !rarity || !date || !price) return null;

  const types = Array.isArray(card.types) ? card.types.filter((t) => typeof t === "string") : [];
  const hp = Number.parseInt(card.hp, 10);

  return {
    id,
    name,
    supertype,
    subtype: Array.isArray(card.subtypes) ? textOrNull(card.subtypes[0]) : null,
    type: types[0] ?? null,
    types,
    hp: Number.isFinite(hp) ? hp : null,
    rarity,
    artist: textOrNull(card.artist),

    setId: textOrNull(card.set?.id),
    setName: textOrNull(card.set?.name),
    setSeries: textOrNull(card.set?.series) ?? "Unknown",
    releaseDate: date.releaseDate,
    releaseYear: date.releaseYear,

    priceUsd: Math.round(price.priceUsd * 100) / 100,
    priceKind: price.priceKind,

    imageSmall: textOrNull(card.images?.small),
    imageLarge: textOrNull(card.images?.large),
  };
}

/* ---------- Sampling ---------- */

// Small seeded random number generator (mulberry32) for repeatable shuffles.
function createRandom(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function groupBy(items, getKey) {
  const groups = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

// Take one card from each set series in turn until we have `target` cards.
// Each series is shuffled first so rarities, categories and types stay mixed.
function sampleAcrossSeries(cards, target) {
  const random = createRandom(RANDOM_SEED);
  const queues = [...groupBy(cards, (c) => c.setSeries).values()].map((group) => shuffle(group, random));

  const sample = [];
  while (sample.length < target && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      if (sample.length >= target) break;
      if (queue.length > 0) sample.push(queue.pop());
    }
  }
  return sample;
}

/* ---------- Validation and report ---------- */

function validate(cards) {
  const problems = [];
  const ids = new Set();
  for (const card of cards) {
    if (ids.has(card.id)) problems.push(`Duplicate id: ${card.id}`);
    ids.add(card.id);
    if (!card.name) problems.push(`Missing name: ${card.id}`);
    if (!(card.priceUsd > 0)) problems.push(`Invalid price: ${card.id}`);
    if (!card.releaseYear) problems.push(`Missing releaseYear: ${card.id}`);
    if (!card.rarity) problems.push(`Missing rarity: ${card.id}`);
    if (!card.supertype) problems.push(`Missing supertype: ${card.id}`);
  }
  return problems;
}

function countBy(cards, getKey) {
  const counts = {};
  for (const card of cards) {
    const key = getKey(card);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

/* ---------- Main ---------- */

async function main() {
  const rawCards = await fetchRawCards();

  const validById = new Map();
  for (const raw of rawCards) {
    const card = cleanCard(raw);
    if (card && !validById.has(card.id)) validById.set(card.id, card);
  }
  const validCards = [...validById.values()];

  const finalCards = sampleAcrossSeries(validCards, TARGET_CARDS).sort(
    (a, b) =>
      a.releaseYear - b.releaseYear ||
      (a.setName ?? "").localeCompare(b.setName ?? "") ||
      a.name.localeCompare(b.name)
  );

  const problems = validate(finalCards);
  if (problems.length > 0) {
    console.error("Validation failed:\n" + problems.slice(0, 20).join("\n"));
    process.exit(1);
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(finalCards, null, 2) + "\n");
  const { size } = await stat(OUTPUT_PATH);

  const years = finalCards.map((c) => c.releaseYear);
  const supertypes = countBy(finalCards, (c) => c.supertype);
  const pokemonTypes = new Set(finalCards.flatMap((c) => c.types));

  console.log(`
Raw cards fetched: ${rawCards.length}
Valid priced cards: ${validCards.length}
Final cards exported: ${finalCards.length}

Release year range: ${Math.min(...years)}–${Math.max(...years)}
Unique set series: ${new Set(finalCards.map((c) => c.setSeries)).size}
Unique rarities: ${new Set(finalCards.map((c) => c.rarity)).size}

Supertypes:
Pokémon: ${supertypes["Pokémon"] || 0}
Trainer: ${supertypes["Trainer"] || 0}
Energy: ${supertypes["Energy"] || 0}

Pokémon types represented: ${pokemonTypes.size}
JSON file size: ${(size / 1024 / 1024).toFixed(2)} MB

Checks passed: no duplicate IDs, names, prices > 0, release years, rarities and supertypes all present.
Wrote ${OUTPUT_PATH.pathname}`);
}

main().catch((error) => {
  console.error(`Export failed: ${error.message}`);
  process.exit(1);
});
