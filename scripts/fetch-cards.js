// fetch a spread of pages from each series
const API_URL = "https://api.pokemontcg.io/v2";
const PAGE_SIZE = 250;
const PAGES_PER_SERIES = 5; // max 1,250 per series
const MAX_RETRIES = 8;
const REQUEST_TIMEOUT_MS = 60_000;
const API_FIELDS = "id,name,supertype,subtypes,types,hp,rarity,artist,set,tcgplayer,images";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

      // use the API wait time, or wait longer on each retry
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

// spread requests across the series, not just its earliest cards
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

export async function fetchRawCards() {
  const seriesNames = await fetchSeriesNames();
  console.log(`Found ${seriesNames.length} set series: ${seriesNames.join(", ")}\n`);

  const rawCards = [];
  for (const series of seriesNames) {
    // page 1 also gives the total needed to choose the other pages
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
    console.log(
      `${series}: ${seriesCount} of ${first.totalCount} cards (pages ${pages.join(", ")})`,
    );
  }
  return rawCards;
}

function textOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
