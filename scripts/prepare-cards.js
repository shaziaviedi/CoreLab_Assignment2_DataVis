// keep priced cards and sample across series
const RANDOM_SEED = 151; // repeatable sample
// first available market price wins, keep the finish with it
const PRICE_PRIORITY = [
  "holofoil",
  "reverseHolofoil",
  "normal",
  "1stEditionHolofoil",
  "1stEditionNormal",
];

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

// year comes from the API date, no guessed dates
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

export function cleanCard(card) {
  if (!card || typeof card !== "object") return null;

  const id = textOrNull(card.id);
  const name = textOrNull(card.name);
  const supertype = textOrNull(card.supertype);
  const rarity = textOrNull(card.rarity);
  const date = parseReleaseDate(card.set?.releaseDate);
  const price = getMarketPrice(card);
  if (!id || !name || !supertype || !rarity || !date || !price) return null;

  // missing extras stay empty, the card can still be used
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

// mulberry32, same seed gives the same shuffle for the same input
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

// take turns across shuffled series so smaller eras get included too
export function sampleAcrossSeries(cards, target) {
  const random = createRandom(RANDOM_SEED);
  const queues = [...groupBy(cards, (c) => c.setSeries).values()].map((group) =>
    shuffle(group, random),
  );

  const sample = [];
  while (sample.length < target && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      if (sample.length >= target) break;
      if (queue.length > 0) sample.push(queue.pop());
    }
  }
  return sample;
}
