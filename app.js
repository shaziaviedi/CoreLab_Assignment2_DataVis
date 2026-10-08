const DATA_URL = "data/cards.json";
const MAX_COLLECTION = 10;
const MIN_TO_ANALYZE = 2;

// 29 raw rarity values are too many distinct colours to read, so each rarity
// belongs to one family colour. Unknown rarities fall back to OTHER_RARITY.
const RARITY_GROUPS = [
  { label: "Common", color: "#8a94b8", rarities: ["Common"] },
  { label: "Uncommon", color: "#3fbf7f", rarities: ["Uncommon"] },
  { label: "Rare", color: "#3d9bff", rarities: ["Rare"] },
  { label: "Holo Rare", color: "#9b7bff", rarities: ["Rare Holo"] },
  {
    label: "Ultra Rare",
    color: "#ff8a3d",
    rarities: [
      "Rare Ultra", "Ultra Rare", "Double Rare", "Rare Holo EX", "Rare Holo GX",
      "Rare Holo V", "Rare Holo VMAX", "Rare Holo VSTAR", "Rare Holo LV.X",
    ],
  },
  {
    label: "Special Rare",
    color: "#ff5a5f",
    rarities: [
      "Rare Prime", "LEGEND", "Rare Shining", "Rare Holo Star", "Rare Prism Star",
      "Rare ACE", "ACE SPEC Rare", "Radiant Rare",
    ],
  },
  { label: "Secret Rare", color: "#ff4fd8", rarities: ["Rare Secret", "Rare Rainbow", "Hyper Rare", "Black White Rare"] },
  { label: "Art Rare", color: "#ffcb05", rarities: ["Illustration Rare", "Special Illustration Rare", "Trainer Gallery Rare Holo"] },
  { label: "Promo", color: "#5fe3d0", rarities: ["Promo"] },
];
const OTHER_RARITY = { label: "Other", color: "#6b7280", rarities: [] };
const rarityGroupByName = new Map(RARITY_GROUPS.flatMap((group) => group.rarities.map((r) => [r, group])));

const CHART_COLORS = {
  text: "#f3efe4",
  muted: "#9ea7c4",
  tick: "#b8c0da",
  grid: "rgba(158, 167, 196, 0.09)",
  axis: "rgba(158, 167, 196, 0.35)",
  panel: "#131b33",
  tooltip: "#070b17",
  gold: "#ffcb05",
  blue: "#3d9bff",
  pointEdge: "rgba(10, 15, 31, 0.55)",
};

// Silkscreen for numbers: Pixelify's 5 looks like an S at small sizes.
const PIXEL_FONT = { family: '"Silkscreen", monospace' };
const TICK_FONT = { ...PIXEL_FONT, size: 10 };

const TOOLTIP_STYLE = {
  backgroundColor: CHART_COLORS.tooltip,
  borderColor: CHART_COLORS.gold,
  borderWidth: 2,
  cornerRadius: 6,
  padding: 12,
  caretSize: 6,
  titleMarginBottom: 8,
  displayColors: false,
  titleColor: CHART_COLORS.gold,
  titleFont: { ...PIXEL_FONT, size: 13 },
  bodyColor: CHART_COLORS.text,
  bodyFont: { ...PIXEL_FONT, size: 11 },
  bodySpacing: 4,
};

const PRICE_KIND_LABELS = {
  holofoil: "Holofoil",
  reverseHolofoil: "Reverse Holofoil",
  normal: "Normal",
  "1stEditionHolofoil": "1st Edition Holofoil",
  "1stEditionNormal": "1st Edition Normal",
};

let exploreChart = null;
let collectionChart = null;

const state = {
  allCards: [],
  cardsById: new Map(),
  filteredCards: [],
  selectedCard: null,
  collection: [], // card ids, in the order they were added
  activeTab: "explore",
  priceScale: "log",
  collectionView: "value", // "value" | "rarity" | "era"

  filterOptions: {
    supertypes: [],
    rarities: [],
    types: [],
    eras: [],
  },

  exploreFilters: {
    supertype: "all",
    rarity: "all",
    type: "all",
    era: "all",
  },

  collectionFilters: {
    supertype: "all",
    rarity: "all",
    type: "all",
    era: "all",
  },
};

const els = {
  main: document.querySelector("main"),
  status: document.getElementById("status-message"),
  tabs: document.querySelectorAll('[role="tab"]'),
  panels: {
    explore: document.getElementById("panel-explore"),
    collection: document.getElementById("panel-collection"),
  },
  exploreForm: document.getElementById("explore-filters"),
  collectionForm: document.getElementById("collection-filters"),
  resultCount: document.getElementById("result-count"),
  resultLabel: document.getElementById("result-label"),
  resetFiltersButton: document.getElementById("reset-filters"),
  exploreCanvas: document.getElementById("market-chart"),
  chartEmpty: document.getElementById("chart-empty"),
  rarityLegend: document.getElementById("rarity-legend"),
  preview: {
    image: document.getElementById("preview-image"),
    noImage: document.getElementById("preview-no-image"),
    placeholder: document.getElementById("preview-placeholder"),
    info: document.getElementById("preview-info"),
    name: document.getElementById("preview-name"),
    price: document.getElementById("preview-price"),
    set: document.getElementById("preview-set"),
    year: document.getElementById("preview-year"),
    rarity: document.getElementById("preview-rarity"),
    supertype: document.getElementById("preview-supertype"),
    typeRow: document.getElementById("preview-type-row"),
    type: document.getElementById("preview-type"),
    hp: document.getElementById("preview-hp"),
    artist: document.getElementById("preview-artist"),
    finish: document.getElementById("preview-finish"),
  },
  addButton: document.getElementById("add-to-collection"),
  addButtonLabel: document.getElementById("add-button-label"),
  analyzeButton: document.getElementById("analyze-collection"),
  tray: document.getElementById("collection-tray"),
  trayCount: document.getElementById("tray-count"),
  collectionFull: document.getElementById("collection-full"),
  tabCollectionCount: document.getElementById("tab-collection-count"),
  collection: {
    gate: document.getElementById("collection-gate"),
    gateButton: document.getElementById("gate-explore"),
    summary: document.getElementById("collection-summary"),
    filtersPanel: document.getElementById("collection-filters-panel"),
    chartPanel: document.getElementById("collection-chart-panel"),
    cardsPanel: document.getElementById("collection-cards"),
    canvas: document.getElementById("collection-chart"),
    chartNote: document.getElementById("collection-chart-note"),
    viewToggle: document.getElementById("collection-view"),
    chartEmpty: document.getElementById("collection-chart-empty"),
    resultCount: document.getElementById("collection-result-count"),
    resultTotal: document.getElementById("collection-result-total"),
    grid: document.getElementById("collection-grid"),
    gridEmpty: document.getElementById("collection-empty"),
  },
  stats: {
    count: document.getElementById("stat-count"),
    total: document.getElementById("stat-total"),
    average: document.getElementById("stat-average"),
    topImage: document.getElementById("top-card-image"),
    topName: document.getElementById("top-card-name"),
    topPrice: document.getElementById("top-card-price"),
  },
  backButton: document.getElementById("back-to-explore"),
};

/* ---------- Helpers ---------- */

const currencyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatCurrency(value) {
  return typeof value === "number" ? currencyFormat.format(value) : "No price data";
}

function getCardById(id) {
  return state.cardsById.get(id) ?? null;
}

function isCollected(cardId) {
  return state.collection.includes(cardId);
}

function textOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function getRarityGroup(rarity) {
  return rarityGroupByName.get(rarity) ?? OTHER_RARITY;
}

function getRarityColor(rarity) {
  return getRarityGroup(rarity).color;
}

function setStatus(message, kind = "info") {
  els.status.textContent = message;
  els.status.classList.toggle("loading", kind === "loading");
  els.status.classList.toggle("error", kind === "error");
  els.main.setAttribute("aria-busy", String(kind === "loading"));
}

/* ---------- Data loading ---------- */

// Returns a clean card object, or null if the record is not usable.
function normalizeCard(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = textOrNull(raw.id);
  const name = textOrNull(raw.name);
  const supertype = textOrNull(raw.supertype);
  const rarity = textOrNull(raw.rarity);
  const releaseYear = Number(raw.releaseYear);
  const priceUsd = Number(raw.priceUsd);
  if (!id || !name || !supertype || !rarity) return null;
  if (!Number.isInteger(releaseYear) || !(priceUsd > 0)) return null;

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

// Eras are ordered by their earliest release year instead of alphabetically.
function deriveFilterOptions(cards) {
  const firstYearByEra = new Map();
  for (const card of cards) {
    const year = firstYearByEra.get(card.setSeries);
    if (year === undefined || card.releaseYear < year) firstYearByEra.set(card.setSeries, card.releaseYear);
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

    const { rarities, types, eras } = state.filterOptions;
    console.log(`Loaded ${state.allCards.length} valid cards`);
    console.log(`Rarities: ${rarities.length}, Pokémon types: ${types.length}, Set series: ${eras.length}`);

    setStatus(`Loaded ${state.allCards.length.toLocaleString()} cards.`);
  } catch (error) {
    console.error(error);
    const hint = location.protocol === "file:"
      ? " The page was opened directly from disk; fetch() needs a local server (e.g. `python3 -m http.server`)."
      : "";
    setStatus(`Could not load card data. ${error.message}${hint}`, "error");
  }
}

/* ---------- Filters ---------- */

function fillSelect(select, values) {
  for (const value of values) {
    select.add(new Option(value, value));
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

// Collection dropdowns list only values found in the collected cards. A chosen
// value that no longer exists (after a removal) falls back to "all".
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

function matchesFilters(card, filters) {
  return (
    (filters.supertype === "all" || card.supertype === filters.supertype) &&
    (filters.rarity === "all" || card.rarity === filters.rarity) &&
    (filters.type === "all" || card.types.includes(filters.type)) &&
    (filters.era === "all" || card.setSeries === filters.era)
  );
}

// Copies each select's value into the matching key of `filters`.
function readFilterForm(form, filters) {
  for (const key of Object.keys(filters)) {
    filters[key] = form.elements[key].value;
  }
}

// Filters combine with AND: a card must pass every active filter.
function applyExploreFilters() {
  readFilterForm(els.exploreForm, state.exploreFilters);
  state.filteredCards = state.allCards.filter((card) => matchesFilters(card, state.exploreFilters));

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

// Sets every Explore filter back to "all". The price scale and collection are kept.
function resetExploreFilters() {
  for (const key of Object.keys(state.exploreFilters)) {
    els.exploreForm.elements[key].value = "all";
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

/* ---------- Collection data (built only from state.collection) ---------- */

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

/* ---------- Explore chart ---------- */

// Cards share whole-number years, so each point gets a small fixed sideways
// offset (from its id) to spread out the vertical stacks. Tooltips show the real year.
function getYearJitter(cardId) {
  let hash = 0;
  for (const char of cardId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return (((hash >>> 0) % 1000) / 1000) * 0.7 - 0.35;
}

// Collected and selected cards are drawn last so they sit on top.
function buildExplorePoints() {
  const drawOrder = (card) => (card.id === state.selectedCard?.id ? 2 : isCollected(card.id) ? 1 : 0);
  return [...state.filteredCards]
    .sort((a, b) => drawOrder(a) - drawOrder(b))
    .map((card) => ({
      x: card.releaseYear + getYearJitter(card.id),
      y: card.priceUsd,
      cardId: card.id,
    }));
}

function getPointCard(context) {
  return getCardById(context.raw?.cardId);
}

function getPointState(context) {
  const card = getPointCard(context);
  if (!card) return "normal";
  if (card.id === state.selectedCard?.id) return "selected";
  return isCollected(card.id) ? "collected" : "normal";
}

const POINT_STYLES = {
  normal: { radius: 3.5, hoverRadius: 6, borderWidth: 1, style: "circle" },
  collected: { radius: 6, hoverRadius: 8, borderWidth: 2, style: "rectRot" },
  selected: { radius: 9, hoverRadius: 10, borderWidth: 3, style: "circle" },
};

function formatPriceTick(value) {
  if (value === 0) return "$0";
  if (value >= 1000) return `$${value / 1000}K`;
  if (value >= 1) return `$${value}`;
  return `$${value.toFixed(2)}`;
}

// Evenly spaced 1-2-5 ticks for the log axis, instead of Chart.js's crowded defaults.
const LOG_PRICE_TICKS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

function setLogPriceTicks(scale) {
  if (scale.type !== "logarithmic") return;
  scale.ticks = LOG_PRICE_TICKS.filter((v) => v >= scale.min && v <= scale.max).map((value) => ({ value }));
}

// The axis is padded by half a year, so place ticks on the whole years only.
function setYearTicks(scale) {
  const ticks = [];
  for (let year = Math.ceil(scale.min); year <= Math.floor(scale.max); year++) ticks.push({ value: year });
  scale.ticks = ticks;
}

function getYearRange() {
  const years = state.allCards.map((card) => card.releaseYear);
  return { min: Math.min(...years) - 0.5, max: Math.max(...years) + 0.5 };
}

function createExploreChart() {
  if (typeof Chart === "undefined") {
    setStatus("Chart.js could not be loaded, so the chart is unavailable.", "error");
    return;
  }

  Chart.defaults.color = CHART_COLORS.muted;
  Chart.defaults.font.family = '"Pixelify Sans", system-ui, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.scale.ticks.color = CHART_COLORS.tick;
  Chart.defaults.scale.border.color = CHART_COLORS.axis;

  const yearRange = getYearRange();

  exploreChart = new Chart(els.exploreCanvas, {
    type: "scatter",
    data: {
      datasets: [{
        label: "Cards",
        data: [],
        backgroundColor: (ctx) => `${getRarityColor(getPointCard(ctx)?.rarity)}cc`,
        hoverBackgroundColor: (ctx) => getRarityColor(getPointCard(ctx)?.rarity),
        borderColor: (ctx) => {
          const pointState = getPointState(ctx);
          if (pointState === "selected") return CHART_COLORS.gold;
          if (pointState === "collected") return CHART_COLORS.text;
          return CHART_COLORS.pointEdge;
        },
        hoverBorderColor: (ctx) => (getPointState(ctx) === "normal" ? CHART_COLORS.text : undefined),
        borderWidth: (ctx) => POINT_STYLES[getPointState(ctx)].borderWidth,
        pointRadius: (ctx) => POINT_STYLES[getPointState(ctx)].radius,
        pointHoverRadius: (ctx) => POINT_STYLES[getPointState(ctx)].hoverRadius,
        pointHitRadius: 5,
        pointStyle: (ctx) => POINT_STYLES[getPointState(ctx)].style,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "nearest", intersect: true },
      layout: { padding: 4 },
      scales: {
        x: {
          type: "linear",
          min: yearRange.min,
          max: yearRange.max,
          title: { display: true, text: "Set Release Year", color: CHART_COLORS.text, font: PIXEL_FONT },
          grid: { color: CHART_COLORS.grid },
          afterBuildTicks: setYearTicks,
          ticks: {
            font: TICK_FONT,
            maxRotation: 0,
            autoSkipPadding: 12,
            callback: (value) => String(value),
          },
        },
        y: {
          type: "logarithmic",
          title: { display: true, text: "Market Price (USD)", color: CHART_COLORS.text, font: PIXEL_FONT },
          grid: { color: CHART_COLORS.grid },
          afterBuildTicks: setLogPriceTicks,
          ticks: { font: TICK_FONT, callback: formatPriceTick },
        },
      },
      plugins: {
        title: {
          display: true,
          text: "Pokémon TCG Market Explorer",
          color: CHART_COLORS.gold,
          font: { ...PIXEL_FONT, size: 14 },
          padding: { bottom: 12 },
        },
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_STYLE,
          filter: (item, index) => index === 0,
          callbacks: {
            title: (items) => getPointCard(items[0])?.name ?? "",
            label: (item) => {
              const card = getPointCard(item);
              if (!card) return "";
              return [formatCurrency(card.priceUsd), card.rarity, `${card.setName} · ${card.releaseYear}`];
            },
          },
        },
      },
      onHover: (event, elements) => {
        event.native.target.style.cursor = elements.length ? "pointer" : "default";
      },
      onClick: (event, elements) => {
        if (!elements.length) return;
        const { datasetIndex, index } = elements[0];
        const point = exploreChart.data.datasets[datasetIndex].data[index];
        const card = getCardById(point.cardId);
        if (!card) return;
        state.selectedCard = card;
        renderSelectedCard();
        updateExploreChart();
      },
    },
  });

  // Redraw once the pixel fonts have loaded so canvas text uses them.
  document.fonts?.ready.then(() => exploreChart.update("none"));
}

// Only the axis options change; the price data itself is never modified.
function applyPriceScaleOptions() {
  const yScale = exploreChart.options.scales.y;
  const useLog = state.priceScale === "log";
  yScale.type = useLog ? "logarithmic" : "linear";
  yScale.beginAtZero = !useLog;
}

function updateExploreAriaLabel() {
  const scaleName = state.priceScale === "log" ? "logarithmic" : "linear";
  els.exploreCanvas.setAttribute(
    "aria-label",
    `Scatter plot of ${state.filteredCards.length} Pokémon cards: market price (${scaleName} scale) by set release year, coloured by rarity.`
  );
}

// Updates the existing chart in place (data, point states, price scale).
function updateExploreChart() {
  if (!exploreChart) return;

  applyPriceScaleOptions();
  exploreChart.data.datasets[0].data = buildExplorePoints();
  exploreChart.update("none");

  els.chartEmpty.hidden = state.filteredCards.length > 0;
  updateExploreAriaLabel();
}

function updateExploreScale() {
  if (!exploreChart) return;
  applyPriceScaleOptions();
  exploreChart.update("none");
  updateExploreAriaLabel();
}

function createLegendItem(content, count, title) {
  const li = document.createElement("li");
  li.append(...content);
  if (count !== undefined) {
    const countEl = document.createElement("span");
    countEl.className = "legend-count";
    countEl.textContent = count;
    li.append(countEl);
    li.classList.toggle("is-empty", count === 0);
  }
  if (title) li.title = title;
  return li;
}

function legendSpan(className, text, swatchColor) {
  const span = document.createElement("span");
  span.className = className;
  if (text) span.textContent = text;
  if (swatchColor) span.style.setProperty("--swatch", swatchColor);
  return span;
}

// One entry per rarity family present in the dataset, with filtered counts.
function renderRarityLegend() {
  const counts = new Map();
  for (const card of state.filteredCards) {
    const group = getRarityGroup(card.rarity);
    counts.set(group, (counts.get(group) || 0) + 1);
  }

  const groupsInData = new Set(state.allCards.map((card) => getRarityGroup(card.rarity)));
  const items = [...RARITY_GROUPS, OTHER_RARITY]
    .filter((group) => groupsInData.has(group))
    .map((group) => {
      const members = group === OTHER_RARITY
        ? uniqueSorted(state.allCards.filter((c) => getRarityGroup(c.rarity) === OTHER_RARITY).map((c) => c.rarity))
        : group.rarities;
      return createLegendItem(
        [legendSpan("legend-swatch", "", group.color), document.createTextNode(group.label)],
        counts.get(group) || 0,
        `Includes: ${members.join(", ")}`
      );
    });

  const divider = document.createElement("li");
  divider.className = "legend-divider";
  divider.setAttribute("aria-hidden", "true");

  els.rarityLegend.replaceChildren(
    ...items,
    divider,
    createLegendItem([legendSpan("legend-marker collected"), document.createTextNode("Collected")]),
    createLegendItem([legendSpan("legend-marker selected"), document.createTextNode("Selected")])
  );
}

/* ---------- Collection chart ---------- */

// The rows behind the current bars or slices, in chart order. A row is
// { label, value, color }, plus `card` in Market Value mode and `alpha` in Rarity mode.
let collectionChartRows = [];

function shortenLabel(name, max = 14) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function formatCardCount(count) {
  return `${count} ${count === 1 ? "card" : "cards"}`;
}

// Groups cards by a key and returns one { label, value } row per group, value = count.
function countCardsBy(cards, getKey) {
  const counts = new Map();
  for (const card of cards) {
    const key = getKey(card);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([label, value]) => ({ label, value }));
}

// Hex alpha suffixes: the usual fill, then lighter shades for repeated colours.
const RARITY_SHADES = ["cc", "80", "4d"];

// Each view turns the visible (filtered) collected cards into chart rows.
const COLLECTION_VIEWS = {
  value: {
    chartType: "bar",
    title: "Your Cards by Market Value",
    note: "One bar per card, highest price first.",
    xTitle: "Card",
    yTitle: "Market Price (USD)",
    buildRows: (cards) => [...cards]
      .sort((a, b) => b.priceUsd - a.priceUsd)
      .map((card) => ({ label: card.name, value: card.priceUsd, color: getRarityColor(card.rarity), card })),
    describe: (cards) => `Bar chart of ${cards.length} collected cards by market price, highest first.`,
  },
  rarity: {
    chartType: "doughnut",
    title: "Your Cards by Rarity",
    note: "Number of visible cards with each rarity.",
    buildRows: (cards) => {
      // Rarities in the same family share a colour, so repeats get a fainter shade.
      const seen = new Map();
      return countCardsBy(cards, (card) => card.rarity)
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
        .map((row) => {
          const color = getRarityColor(row.label);
          const repeat = seen.get(color) ?? 0;
          seen.set(color, repeat + 1);
          return { ...row, color, alpha: RARITY_SHADES[Math.min(repeat, RARITY_SHADES.length - 1)] };
        });
    },
    describe: (cards, rows) => `Doughnut chart of ${cards.length} collected cards across ${rows.length} rarities.`,
  },
  era: {
    chartType: "bar",
    title: "Your Cards by Era",
    note: "Number of visible cards from each set era, oldest first.",
    xTitle: "Set Era",
    yTitle: "Number of Collected Cards",
    buildRows: (cards) => {
      const counts = new Map(countCardsBy(cards, (card) => card.setSeries).map((row) => [row.label, row.value]));
      return deriveFilterOptions(cards).eras.map((era) => ({ label: era, value: counts.get(era), color: CHART_COLORS.blue }));
    },
    describe: (cards, rows) => `Bar chart of ${cards.length} collected cards across ${rows.length} set eras.`,
  },
};

function getChartRow(context) {
  return collectionChartRows[context.dataIndex] ?? null;
}

// Doughnut legend entries show the count, e.g. "Rare Holo: 3".
function generateCountLegendLabels(chart) {
  const defaults = Chart.overrides.doughnut.plugins.legend.labels.generateLabels(chart);
  return defaults.map((item) => ({ ...item, text: `${item.text}: ${chart.data.datasets[0].data[item.index]}` }));
}

function getLegendPosition(width) {
  return width < 520 ? "bottom" : "right";
}

function buildCollectionChartConfig(viewKey) {
  const view = COLLECTION_VIEWS[viewKey];

  const dataset = {
    label: view.yTitle ?? "Collected cards",
    data: [],
    backgroundColor: (ctx) => {
      const row = getChartRow(ctx);
      return `${row?.color ?? OTHER_RARITY.color}${row?.alpha ?? "cc"}`;
    },
    hoverBackgroundColor: (ctx) => getChartRow(ctx)?.color ?? OTHER_RARITY.color,
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    layout: { padding: 4 },
    plugins: {
      title: {
        display: true,
        text: view.title,
        color: CHART_COLORS.gold,
        font: { ...PIXEL_FONT, size: 14 },
        padding: { bottom: 12 },
      },
      legend: { display: false },
      tooltip: {
        ...TOOLTIP_STYLE,
        callbacks: {
          title: (items) => getChartRow(items[0])?.label ?? "",
          label: (item) => {
            const row = getChartRow(item);
            if (!row) return "";
            if (row.card) return [formatCurrency(row.card.priceUsd), row.card.rarity, row.card.setName];
            return formatCardCount(row.value);
          },
        },
      },
    },
  };

  if (view.chartType === "doughnut") {
    Object.assign(dataset, { borderColor: CHART_COLORS.panel, borderWidth: 2, hoverOffset: 6 });
    options.cutout = "55%";
    options.plugins.legend = {
      display: true,
      position: getLegendPosition(els.collection.canvas.parentElement.clientWidth),
      labels: {
        color: CHART_COLORS.text,
        font: { ...PIXEL_FONT, size: 11 },
        boxWidth: 14,
        padding: 12,
        generateLabels: generateCountLegendLabels,
      },
    };
    options.onResize = (chart, size) => {
      chart.options.plugins.legend.position = getLegendPosition(size.width);
    };
  } else {
    Object.assign(dataset, { borderRadius: 4, minBarLength: 3, maxBarThickness: 64 });
    options.interaction = { mode: "index", intersect: false };
    options.scales = {
      x: {
        title: { display: true, text: view.xTitle, color: CHART_COLORS.text, font: PIXEL_FONT },
        grid: { display: false },
        ticks: {
          font: TICK_FONT,
          autoSkip: false,
          maxRotation: 45,
          callback(value) {
            return shortenLabel(this.getLabelForValue(value));
          },
        },
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: view.yTitle, color: CHART_COLORS.text, font: PIXEL_FONT },
        grid: { color: CHART_COLORS.grid },
        ticks: viewKey === "value"
          ? { font: TICK_FONT, callback: formatPriceTick }
          : { font: TICK_FONT, precision: 0, stepSize: 1 },
      },
    };
  }

  return { type: view.chartType, data: { labels: [], datasets: [dataset] }, options };
}

// Replaces only the collection chart instance; the Explore chart is never touched.
function createCollectionChart() {
  if (typeof Chart === "undefined") return;

  collectionChart?.destroy();
  collectionChart = new Chart(els.collection.canvas, buildCollectionChartConfig(state.collectionView));
  document.fonts?.ready.then(() => collectionChart?.update("none"));
}

function updateCollectionChart(cards) {
  if (!collectionChart) return;

  const view = COLLECTION_VIEWS[state.collectionView];
  collectionChartRows = view.buildRows(cards);
  collectionChart.data.labels = collectionChartRows.map((row) => row.label);
  collectionChart.data.datasets[0].data = collectionChartRows.map((row) => row.value);
  // Bar positions change with the data, so an open tooltip would point at the wrong card.
  collectionChart.tooltip.setActiveElements([], { x: 0, y: 0 });
  collectionChart.update("none");

  els.collection.chartNote.textContent = view.note;
  els.collection.chartEmpty.hidden = cards.length > 0;
  els.collection.canvas.setAttribute("aria-label", view.describe(cards, collectionChartRows));
}

// Bar and doughnut charts cannot be swapped in place, so a new instance is built.
function setCollectionView(viewKey) {
  if (!COLLECTION_VIEWS[viewKey] || viewKey === state.collectionView) return;
  state.collectionView = viewKey;
  createCollectionChart();
  updateCollectionChart(getFilteredCollection());
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
  // A chart created inside a hidden panel has no size until it is shown.
  if (tabName === "collection") collectionChart?.resize();
}

function handleTabKeys(event) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const next = state.activeTab === "explore" ? "collection" : "explore";
  showTab(next);
  document.getElementById(`tab-${next}`).focus();
}

/* ---------- Selection and collection ---------- */

function selectCard(cardId) {
  state.selectedCard = getCardById(cardId);
  renderSelectedCard();
  updateExploreChart();
}

// Returns true only when the card was actually added.
function addToCollection(card) {
  if (!card || !state.cardsById.has(card.id)) return false;
  if (isCollected(card.id)) return false;
  if (state.collection.length >= MAX_COLLECTION) {
    renderCollection();
    return false;
  }
  state.collection.push(card.id);
  renderCollection();
  renderSelectedCard();
  return true;
}

function removeFromCollection(cardId) {
  if (!isCollected(cardId)) return false;
  state.collection = state.collection.filter((id) => id !== cardId);
  renderCollection();
  renderSelectedCard();
  return true;
}

/* ---------- Rendering ---------- */

function createTypeBadge(type) {
  const badge = document.createElement("span");
  badge.className = "type-badge";
  badge.dataset.type = type;
  badge.textContent = type;
  return badge;
}

function showNoImage() {
  els.preview.image.hidden = true;
  els.preview.image.removeAttribute("src");
  els.preview.noImage.hidden = false;
}

function resetSelectedCardPanel() {
  const p = els.preview;
  p.image.hidden = true;
  p.image.removeAttribute("src");
  p.image.alt = "";
  p.noImage.hidden = true;
  p.placeholder.hidden = false;
  p.info.hidden = true;
  els.addButton.disabled = true;
  els.addButtonLabel.textContent = "+ Add to Collection";
}

function renderAddButton(card) {
  const collected = isCollected(card.id);
  const full = state.collection.length >= MAX_COLLECTION;
  els.addButton.disabled = collected || full;
  els.addButtonLabel.textContent = collected ? "Added ✓" : full ? "Collection Full" : "+ Add to Collection";
}

function renderSelectedCard() {
  const card = state.selectedCard;
  const p = els.preview;
  if (!card) {
    resetSelectedCardPanel();
    return;
  }

  p.placeholder.hidden = true;
  p.info.hidden = false;

  const imageUrl = card.imageLarge || card.imageSmall;
  if (imageUrl) {
    p.noImage.hidden = true;
    p.image.hidden = false;
    p.image.alt = `${card.name} Pokémon trading card`;
    // A broken link shows the placeholder, unless another card was picked meanwhile.
    p.image.onerror = () => {
      if (state.selectedCard?.id === card.id) showNoImage();
    };
    p.image.src = imageUrl;
  } else {
    showNoImage();
  }

  p.name.textContent = card.name;
  p.price.textContent = formatCurrency(card.priceUsd);

  p.set.textContent = card.setName;
  p.year.textContent = card.releaseYear;
  p.rarity.textContent = card.rarity;
  p.supertype.textContent = card.supertype;
  p.typeRow.hidden = card.types.length === 0;
  p.type.replaceChildren(...card.types.map(createTypeBadge));

  p.hp.textContent = card.hp ?? "—";
  p.artist.textContent = card.artist ?? "Unknown";
  p.finish.textContent = PRICE_KIND_LABELS[card.priceKind] ?? card.priceKind ?? "—";

  renderAddButton(card);
}

function createThumbnail(card) {
  const li = document.createElement("li");
  li.className = "slot filled";
  const img = document.createElement("img");
  img.src = card.imageSmall;
  img.alt = `${card.name} (${card.setName})`;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "slot-remove";
  remove.textContent = "x";
  remove.setAttribute("aria-label", `Remove ${card.name} from collection`);
  remove.addEventListener("click", () => removeFromCollection(card.id));

  li.append(img, remove);
  return li;
}

function createEmptySlot() {
  const li = document.createElement("li");
  li.className = "slot";
  return li;
}

// Summary always describes the whole collection; filters only narrow the chart and grid.
function renderCollectionStats(cards) {
  const total = cards.reduce((sum, card) => sum + card.priceUsd, 0);
  const top = cards.reduce((best, card) => (!best || card.priceUsd > best.priceUsd ? card : best), null);
  const s = els.stats;

  s.count.textContent = cards.length;
  s.total.textContent = cards.length ? formatCurrency(total) : "—";
  s.average.textContent = cards.length ? formatCurrency(total / cards.length) : "—";

  s.topName.textContent = top?.name ?? "—";
  s.topPrice.textContent = top ? formatCurrency(top.priceUsd) : "—";
  const topImage = top?.imageSmall || top?.imageLarge;
  s.topImage.hidden = !topImage;
  if (topImage) {
    s.topImage.src = topImage;
    s.topImage.alt = `${top.name} Pokémon trading card`;
  } else {
    s.topImage.removeAttribute("src");
    s.topImage.alt = "";
  }
}

function renderCollectionView() {
  const c = els.collection;
  const cards = getCollectionCards();
  const canCompare = cards.length >= MIN_TO_ANALYZE;

  c.gate.hidden = canCompare;
  c.summary.hidden = !canCompare;
  c.filtersPanel.hidden = !canCompare;
  c.chartPanel.hidden = !canCompare;
  c.cardsPanel.hidden = cards.length === 0;

  updateCollectionFilterOptions(cards);
  const filtered = getFilteredCollection();
  c.resultCount.textContent = filtered.length;
  c.resultTotal.textContent = cards.length;

  renderCollectionStats(cards);
  updateCollectionChart(filtered);

  // With the filters hidden, a single card is always shown so it can be removed.
  const gridCards = canCompare ? filtered : cards;
  c.grid.replaceChildren(...gridCards.map(createThumbnail));
  c.gridEmpty.hidden = gridCards.length > 0;
}

function renderCollection() {
  const cards = getCollectionCards();
  const count = cards.length;
  els.trayCount.textContent = count;
  els.tabCollectionCount.textContent = count;
  els.analyzeButton.disabled = count < MIN_TO_ANALYZE;
  els.collectionFull.hidden = count < MAX_COLLECTION;

  const emptySlots = Array.from({ length: MAX_COLLECTION - count }, createEmptySlot);
  els.tray.replaceChildren(...cards.map(createThumbnail), ...emptySlots);

  renderCollectionView();
  updateExploreChart();
}

/* ---------- Events ---------- */

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => showTab(tab.id.replace("tab-", "")));
  tab.addEventListener("keydown", handleTabKeys);
});
els.backButton.addEventListener("click", () => showTab("explore"));
els.collection.gateButton.addEventListener("click", () => showTab("explore"));
els.analyzeButton.addEventListener("click", () => showTab("collection"));

els.exploreForm.addEventListener("input", handleExploreFormInput);
els.exploreForm.addEventListener("submit", (event) => event.preventDefault());
els.resetFiltersButton.addEventListener("click", resetExploreFilters);

els.collectionForm.addEventListener("input", applyCollectionFilters);
els.collectionForm.addEventListener("submit", (event) => event.preventDefault());
els.collection.viewToggle.addEventListener("change", (event) => setCollectionView(event.target.value));

els.addButton.addEventListener("click", () => {
  addToCollection(state.selectedCard);
});

loadCards();
