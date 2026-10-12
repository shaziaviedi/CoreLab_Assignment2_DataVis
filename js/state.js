const DATA_URL = "data/cards.json";
const MAX_COLLECTION = 10;
const MIN_TO_ANALYZE = 2;
// group similar rarities so the legend doesn't need 29 colours
const RARITY_GROUPS = [
  { label: "Common", color: "#8a94b8", rarities: ["Common"] },
  { label: "Uncommon", color: "#3fbf7f", rarities: ["Uncommon"] },
  { label: "Rare", color: "#3d9bff", rarities: ["Rare"] },
  { label: "Holo Rare", color: "#9b7bff", rarities: ["Rare Holo"] },
  {
    label: "Ultra Rare",
    color: "#ff8a3d",
    rarities: [
      "Rare Ultra",
      "Ultra Rare",
      "Double Rare",
      "Rare Holo EX",
      "Rare Holo GX",
      "Rare Holo V",
      "Rare Holo VMAX",
      "Rare Holo VSTAR",
      "Rare Holo LV.X",
    ],
  },
  {
    label: "Special Rare",
    color: "#ff5a5f",
    rarities: [
      "Rare Prime",
      "LEGEND",
      "Rare Shining",
      "Rare Holo Star",
      "Rare Prism Star",
      "Rare ACE",
      "ACE SPEC Rare",
      "Radiant Rare",
    ],
  },
  {
    label: "Secret Rare",
    color: "#ff4fd8",
    rarities: ["Rare Secret", "Rare Rainbow", "Hyper Rare", "Black White Rare"],
  },
  {
    label: "Art Rare",
    color: "#ffcb05",
    rarities: ["Illustration Rare", "Special Illustration Rare", "Trainer Gallery Rare Holo"],
  },
  { label: "Promo", color: "#5fe3d0", rarities: ["Promo"] },
];
const OTHER_RARITY = { label: "Other", color: "#6b7280", rarities: [] };
const rarityGroupByName = new Map(
  RARITY_GROUPS.flatMap((group) => group.rarities.map((r) => [r, group])),
);

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
// clearer small numbers than Pixelify, especially the 5
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

// shared by the page scripts, collection stores ids rather than card copies
const state = {
  allCards: [],
  cardsById: new Map(),
  filteredCards: [],
  selectedCard: null,
  collection: [], // ids in add order
  activeTab: "explore",
  priceScale: "log",
  collectionView: "value",

  filterOptions: {
    supertypes: [],
    rarities: [],
    types: [],
    eras: [],
  },

  exploreFilters: {
    search: "",
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
