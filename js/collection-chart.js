// rows stay in chart order so tooltips can find the right card or group
let collectionChartRows = [];

function shortenLabel(name, max = 14) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function formatCardCount(count) {
  return `${count} ${count === 1 ? "card" : "cards"}`;
}
function countCardsBy(cards, getKey) {
  const counts = new Map();
  for (const card of cards) {
    const key = getKey(card);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([label, value]) => ({ label, value }));
}
// lighter fills separate rarities sharing a family colour
const RARITY_SHADES = ["cc", "80", "4d"];
// each view builds its rows from the filtered collection
const COLLECTION_VIEWS = {
  value: {
    chartType: "bar",
    title: "Your Cards by Market Value",
    note: "One bar per card, highest price first.",
    xTitle: "Card",
    yTitle: "Market Price (USD)",
    buildRows: (cards) =>
      [...cards]
        .sort((a, b) => b.priceUsd - a.priceUsd)
        .map((card) => ({
          label: card.name,
          value: card.priceUsd,
          color: getRarityColor(card.rarity),
          card,
        })),
    describe: (cards) =>
      `Bar chart of ${cards.length} collected cards by market price, highest first.`,
  },
  rarity: {
    chartType: "doughnut",
    title: "Your Cards by Rarity",
    note: "Number of visible cards with each rarity.",
    buildRows: (cards) => {
      const seen = new Map();
      return countCardsBy(cards, (card) => card.rarity)
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
        .map((row) => {
          const color = getRarityColor(row.label);
          const repeat = seen.get(color) ?? 0;
          seen.set(color, repeat + 1);
          return {
            ...row,
            color,
            alpha: RARITY_SHADES[Math.min(repeat, RARITY_SHADES.length - 1)],
          };
        });
    },
    describe: (cards, rows) =>
      `Doughnut chart of ${cards.length} collected cards across ${rows.length} rarities.`,
  },
  era: {
    chartType: "bar",
    title: "Your Cards by Era",
    note: "Number of visible cards from each set era, oldest first.",
    xTitle: "Set Era",
    yTitle: "Number of Collected Cards",
    buildRows: (cards) => {
      const counts = new Map(
        countCardsBy(cards, (card) => card.setSeries).map((row) => [row.label, row.value]),
      );
      return deriveFilterOptions(cards).eras.map((era) => ({
        label: era,
        value: counts.get(era),
        color: CHART_COLORS.blue,
      }));
    },
    describe: (cards, rows) =>
      `Bar chart of ${cards.length} collected cards across ${rows.length} set eras.`,
  },
};

function getChartRow(context) {
  return collectionChartRows[context.dataIndex] ?? null;
}
function generateCountLegendLabels(chart) {
  const defaults = Chart.overrides.doughnut.plugins.legend.labels.generateLabels(chart);
  return defaults.map((item) => ({
    ...item,
    text: `${item.text}: ${chart.data.datasets[0].data[item.index]}`,
  }));
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
            if (row.card)
              return [formatCurrency(row.card.priceUsd), row.card.rarity, row.card.setName];
            return formatCardCount(row.value);
          },
        },
      },
    },
  };

  if (view.chartType === "doughnut") {
    Object.assign(dataset, { borderColor: CHART_COLORS.panel, borderWidth: 2, hoverOffset: 6 });
    options.cutout = "55%";
    options.layout.padding = 12;
    options.plugins.legend = {
      display: true,
      // keep the circle centred, legend underneath at every width
      position: "bottom",
      align: "center",
      labels: {
        color: CHART_COLORS.text,
        font: { ...PIXEL_FONT, size: 11 },
        boxWidth: 14,
        padding: 12,
        generateLabels: generateCountLegendLabels,
      },
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
        ticks:
          viewKey === "value"
            ? { font: TICK_FONT, callback: formatPriceTick }
            : { font: TICK_FONT, precision: 0, stepSize: 1 },
      },
    };
  }

  return { type: view.chartType, data: { labels: [], datasets: [dataset] }, options };
}
function createCollectionChart() {
  if (typeof Chart === "undefined") return;

  // rebuild for bar/doughnut switching, free the canvas first
  collectionChart?.destroy();
  collectionChart = new Chart(
    els.collection.canvas,
    buildCollectionChartConfig(state.collectionView),
  );
  document.fonts?.ready.then(() => collectionChart?.update("none"));
}

function updateCollectionChart(cards) {
  if (!collectionChart) return;

  const view = COLLECTION_VIEWS[state.collectionView];
  collectionChartRows = view.buildRows(cards);
  collectionChart.data.labels = collectionChartRows.map((row) => row.label);
  collectionChart.data.datasets[0].data = collectionChartRows.map((row) => row.value);
  // old tooltip indexes may point to different rows after filtering
  collectionChart.tooltip.setActiveElements([], { x: 0, y: 0 });
  collectionChart.update("none");

  els.collection.chartNote.textContent = view.note;
  els.collection.chartEmpty.hidden = cards.length > 0;
  els.collection.canvas.setAttribute("aria-label", view.describe(cards, collectionChartRows));
}
function setCollectionView(viewKey) {
  if (!COLLECTION_VIEWS[viewKey] || viewKey === state.collectionView) return;
  state.collectionView = viewKey;
  createCollectionChart();
  updateCollectionChart(getFilteredCollection());
}
