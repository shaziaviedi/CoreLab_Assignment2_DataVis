function fillSelect(select, values) {
  for (const value of values) {
    const label = select.name === "type" && value === "Colorless" ? "Normal" : value;
    select.add(new Option(label, value));
  }
}

function populateFilterSelects() {
  const { supertypes, rarities, types, eras } = state.filterOptions;
  const form = els.exploreForm;
  fillSelect(form.elements.supertype, supertypes);
  fillSelect(form.elements.rarity, rarities);
  fillSelect(form.elements.type, types);
  fillSelect(form.elements.era, eras);
}
// only collected values here, reset a choice if its last card was removed
function updateCollectionFilterOptions(cards) {
  const options = deriveFilterOptions(cards);
  const valuesByKey = {
    supertype: options.supertypes,
    rarity: options.rarities,
    type: options.types,
    era: options.eras,
  };

  for (const [key, values] of Object.entries(valuesByKey)) {
    const select = els.collectionForm.elements[key];
    const current = state.collectionFilters[key];
    while (select.options.length > 1) select.remove(1);
    fillSelect(select, values);
    state.collectionFilters[key] = values.includes(current) ? current : "all";
    select.value = state.collectionFilters[key];
  }
}

// all active filters must match, multi-type cards can match either type
function matchesFilters(card, filters) {
  return (
    (!filters.search ||
      (card.supertype === "Pokémon" && card.name.toLowerCase().includes(filters.search))) &&
    (filters.supertype === "all" || card.supertype === filters.supertype) &&
    (filters.rarity === "all" || card.rarity === filters.rarity) &&
    (filters.type === "all" || card.types.includes(filters.type)) &&
    (filters.era === "all" || card.setSeries === filters.era)
  );
}
function readFilterForm(form, filters) {
  for (const key of Object.keys(filters)) {
    const value = form.elements[key].value;
    // ignore case and extra spaces in name searches
    filters[key] = key === "search" ? value.trim().toLowerCase() : value;
  }
}
function applyExploreFilters() {
  readFilterForm(els.exploreForm, state.exploreFilters);
  state.filteredCards = state.allCards.filter((card) => matchesFilters(card, state.exploreFilters));

  // clear the preview if its point is no longer visible
  if (state.selectedCard && !state.filteredCards.includes(state.selectedCard)) {
    state.selectedCard = null;
    renderSelectedCard();
  }

  const count = state.filteredCards.length;
  els.resultCount.textContent = count.toLocaleString();
  els.resultLabel.textContent = count === 1 ? "card" : "cards";

  updateExploreChart();
  renderRarityLegend();
}
function resetExploreFilters() {
  for (const key of Object.keys(state.exploreFilters)) {
    els.exploreForm.elements[key].value = key === "search" ? "" : "all";
  }
  applyExploreFilters();
}

function setPriceScale(scale) {
  state.priceScale = scale === "linear" ? "linear" : "log";
  updateExploreScale();
}

function handleExploreFormInput(event) {
  if (event.target.name === "priceScale") {
    setPriceScale(event.target.value);
  } else {
    applyExploreFilters();
  }
}

function getCollectionCards() {
  return state.collection.map(getCardById).filter(Boolean);
}

function getFilteredCollection() {
  return getCollectionCards().filter((card) => matchesFilters(card, state.collectionFilters));
}

function applyCollectionFilters() {
  readFilterForm(els.collectionForm, state.collectionFilters);
  renderCollectionView();
}
