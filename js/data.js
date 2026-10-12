// skip unusable records, keep missing optional details as null
function normalizeCard(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = textOrNull(raw.id);
  const name = textOrNull(raw.name);
  const supertype = textOrNull(raw.supertype);
  const rarity = textOrNull(raw.rarity);
  const releaseYear = Number(raw.releaseYear);
  const priceUsd = Number(raw.priceUsd);
  if (!id || !name || !supertype || !rarity) return null;
  if (!Number.isInteger(releaseYear) || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;

  const types = Array.isArray(raw.types) ? raw.types.map(textOrNull).filter(Boolean) : [];
  if (types.length === 0 && textOrNull(raw.type)) types.push(textOrNull(raw.type));
  const hp = Number.parseInt(raw.hp, 10);

  return {
    id,
    name,
    supertype,
    subtype: textOrNull(raw.subtype),
    type: types[0] ?? null,
    types,
    hp: Number.isFinite(hp) ? hp : null,
    rarity,
    artist: textOrNull(raw.artist),
    setId: textOrNull(raw.setId),
    setName: textOrNull(raw.setName) ?? "Unknown set",
    setSeries: textOrNull(raw.setSeries) ?? "Unknown",
    releaseDate: textOrNull(raw.releaseDate),
    releaseYear,
    priceUsd,
    priceKind: textOrNull(raw.priceKind),
    imageSmall: textOrNull(raw.imageSmall),
    imageLarge: textOrNull(raw.imageLarge),
  };
}
// dropdowns come from the cards, eras ordered by their first release year
function deriveFilterOptions(cards) {
  const firstYearByEra = new Map();
  for (const card of cards) {
    const year = firstYearByEra.get(card.setSeries);
    if (year === undefined || card.releaseYear < year)
      firstYearByEra.set(card.setSeries, card.releaseYear);
  }

  return {
    supertypes: uniqueSorted(cards.map((c) => c.supertype)),
    rarities: uniqueSorted(cards.map((c) => c.rarity)),
    types: uniqueSorted(cards.flatMap((c) => c.types)),
    eras: [...firstYearByEra.keys()].sort((a, b) => firstYearByEra.get(a) - firstYearByEra.get(b)),
  };
}

async function loadCards() {
  setStatus("Loading card data…", "loading");
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`${DATA_URL} returned HTTP ${response.status}.`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(`${DATA_URL} should contain a JSON array of cards.`);
    }

    for (const raw of data) {
      const card = normalizeCard(raw);
      if (card && !state.cardsById.has(card.id)) state.cardsById.set(card.id, card);
    }
    state.allCards = [...state.cardsById.values()];
    if (state.allCards.length === 0) {
      throw new Error(`${DATA_URL} did not contain any usable cards.`);
    }

    state.filterOptions = deriveFilterOptions(state.allCards);
    populateFilterSelects();
    createExploreChart();
    createCollectionChart();
    applyExploreFilters();
    renderCollection();

    if (typeof Chart !== "undefined") setStatus("");
  } catch (error) {
    console.error(error);
    const hint =
      location.protocol === "file:"
        ? " The page was opened directly from disk; fetch() needs a local server (e.g. `python3 -m http.server`)."
        : "";
    setStatus(`Could not load card data. ${error.message}${hint}`, "error");
  }
}
