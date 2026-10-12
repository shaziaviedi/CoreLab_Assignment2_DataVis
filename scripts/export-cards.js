// npm run export-data, optional POKEMON_TCG_API_KEY
import { writeFile, stat } from "node:fs/promises";
import { fetchRawCards } from "./fetch-cards.js";
import { cleanCard, sampleAcrossSeries } from "./prepare-cards.js";
const OUTPUT_PATH = new URL("../data/cards.json", import.meta.url);
const TARGET_CARDS = 2000;

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

async function main() {
  const rawCards = await fetchRawCards();

  // keep one usable record per id before sampling
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
      a.name.localeCompare(b.name),
  );

  // check before replacing the saved dataset
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
