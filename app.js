const DATA_URL = "data/cards.json";
const MAX_COLLECTION = 10;

const state = {
  allCards: [],
  filteredCards: [],
  selectedCard: null,
  collection: [],
  activeTab: "explore",
  filters: {
    search: "",
    type: "all",
    rarity: "all",
    series: "all",
  },
  priceScale: "logarithmic",
};

const els = {
  status: document.getElementById("status-message"),
  tabs: document.querySelectorAll('[role="tab"]'),
  panels: {
    explore: document.getElementById("panel-explore"),
    collection: document.getElementById("panel-collection"),
  },
  filterForm: document.getElementById("explore-filters"),
  filterSearch: document.getElementById("filter-search"),
  filterType: document.getElementById("filter-type"),
  filterRarity: document.getElementById("filter-rarity"),
  filterSeries: document.getElementById("filter-series"),
  filterPriceScale: document.getElementById("filter-price-scale"),
  resultCount: document.getElementById("result-count"),
  preview: document.getElementById("card-preview"),
  addButton: document.getElementById("add-to-collection"),
  tray: document.getElementById("collection-tray"),
  trayCount: document.getElementById("tray-count"),
  tabCollectionCount: document.getElementById("tab-collection-count"),
  collectionGrid: document.getElementById("collection-grid"),
  collectionSummary: document.getElementById("collection-summary"),
  backButton: document.getElementById("back-to-explore"),
};

/* ---------- Data loading ---------- */

async function loadCards() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`${DATA_URL} returned HTTP ${response.status}. Has the cleaned dataset been added to the data/ folder?`);
    }
    const cards = await response.json();
    if (!Array.isArray(cards)) {
      throw new Error(`${DATA_URL} should contain a JSON array of card objects.`);
    }

    state.allCards = cards;
    populateFilterOptions();
    applyFilters();
    setStatus(`Loaded ${cards.length} cards.`);
  } catch (error) {
    console.error(error);
    const hint = location.protocol === "file:"
      ? " The page was opened directly from disk; fetch() needs a local server (e.g. VS Code Live Server or `python3 -m http.server`)."
      : "";
    setStatus(`Could not load card data. ${error.message}${hint}`, true);
  }
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
}

/* ---------- Helpers ---------- */

function getTypes(card) {
  if (Array.isArray(card.types)) return card.types;
  if (typeof card.types === "string" && card.types) return card.types.split(/,\s*/);
  return card.type ? [card.type] : [];
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function fillSelect(select, values) {
  for (const value of values) {
    select.add(new Option(value, value));
  }
}

function formatPrice(card) {
  return typeof card.priceUsd === "number" ? `$${card.priceUsd.toFixed(2)}` : "No price data";
}

/* ---------- Filters ---------- */

function populateFilterOptions() {
  fillSelect(els.filterType, uniqueSorted(state.allCards.flatMap(getTypes)));
  fillSelect(els.filterRarity, uniqueSorted(state.allCards.map((c) => c.rarity)));
  fillSelect(els.filterSeries, uniqueSorted(state.allCards.map((c) => c.setSeries)));
}

function applyFilters() {
  const { search, type, rarity, series } = state.filters;
  const query = search.trim().toLowerCase();

  state.filteredCards = state.allCards.filter((card) =>
    (!query || (card.name || "").toLowerCase().includes(query)) &&
    (type === "all" || getTypes(card).includes(type)) &&
    (rarity === "all" || card.rarity === rarity) &&
    (series === "all" || card.setSeries === series)
  );

  els.resultCount.textContent = state.filteredCards.length;
  // TODO: update the Chart.js scatter plot with state.filteredCards
}

function readFilters() {
  state.filters.search = els.filterSearch.value;
  state.filters.type = els.filterType.value;
  state.filters.rarity = els.filterRarity.value;
  state.filters.series = els.filterSeries.value;
  state.priceScale = els.filterPriceScale.value;
  applyFilters();
}

/* ---------- Tabs ---------- */

function showTab(tabName) {
  state.activeTab = tabName;
  els.tabs.forEach((tab) => {
    const isActive = tab.id === `tab-${tabName}`;
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });
  for (const [name, panel] of Object.entries(els.panels)) {
    panel.hidden = name !== tabName;
  }
}

function handleTabKeys(event) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const next = state.activeTab === "explore" ? "collection" : "explore";
  showTab(next);
  document.getElementById(`tab-${next}`).focus();
}

/* ---------- Selection and collection ---------- */

function selectCard(card) {
  state.selectedCard = card;
  renderPreview();
}

function isCollected(card) {
  return state.collection.some((c) => c.id === card.id);
}

function addToCollection(card) {
  if (!card || isCollected(card)) return;
  if (state.collection.length >= MAX_COLLECTION) {
    setStatus(`Your collection is full (${MAX_COLLECTION} cards). Remove a card first.`, true);
    return;
  }
  state.collection.push(card);
  renderCollection();
  renderPreview();
}

function removeFromCollection(cardId) {
  state.collection = state.collection.filter((c) => c.id !== cardId);
  renderCollection();
  renderPreview();
}

/* ---------- Rendering ---------- */

function renderPreview() {
  const card = state.selectedCard;
  if (!card) {
    els.addButton.disabled = true;
    return;
  }

  els.preview.innerHTML = "";
  const img = document.createElement("img");
  img.src = card.imageLarge || card.imageSmall;
  img.alt = `${card.name} card from ${card.setName}`;

  const details = document.createElement("dl");
  const rows = [
    ["Name", card.name],
    ["Set", `${card.setName} (${card.releaseYear ?? "unknown year"})`],
    ["Rarity", card.rarity || "Unknown"],
    ["Type", getTypes(card).join(", ") || card.supertype],
    ["Price", formatPrice(card)],
  ];
  for (const [label, value] of rows) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    details.append(dt, dd);
  }
  els.preview.append(img, details);

  const full = state.collection.length >= MAX_COLLECTION;
  els.addButton.disabled = isCollected(card) || full;
  els.addButton.textContent = isCollected(card) ? "Already in collection" : full ? "Collection full" : "Add to collection";
}

function createThumbnail(card) {
  const li = document.createElement("li");
  const img = document.createElement("img");
  img.src = card.imageSmall;
  img.alt = `${card.name} (${card.setName})`;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  remove.setAttribute("aria-label", `Remove ${card.name} from collection`);
  remove.addEventListener("click", () => removeFromCollection(card.id));

  li.append(img, remove);
  return li;
}

function renderCollection() {
  const count = state.collection.length;
  els.trayCount.textContent = count;
  els.tabCollectionCount.textContent = count;

  els.tray.replaceChildren(...state.collection.map(createThumbnail));
  els.collectionGrid.replaceChildren(...state.collection.map(createThumbnail));

  els.collectionSummary.innerHTML = count
    ? `<p>${count} of ${MAX_COLLECTION} cards collected.</p>`
    : `<p class="placeholder">Your collection is empty. Add cards from the Explore tab.</p>`;
  // TODO: summary statistics and collection chart
}

/* ---------- Events ---------- */

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => showTab(tab.id.replace("tab-", "")));
  tab.addEventListener("keydown", handleTabKeys);
});
els.backButton.addEventListener("click", () => showTab("explore"));
els.filterForm.addEventListener("input", readFilters);
els.filterForm.addEventListener("submit", (event) => event.preventDefault());
els.filterForm.addEventListener("reset", () => setTimeout(readFilters));
els.addButton.addEventListener("click", () => addToCollection(state.selectedCard));

loadCards();
