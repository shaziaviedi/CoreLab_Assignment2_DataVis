// spread out same-year points, tooltip keeps the real year
function getYearJitter(cardId) {
  let hash = 0;
  for (const char of cardId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return (((hash >>> 0) % 1000) / 1000) * 0.7 - 0.35;
}
// draw collected and selected points last so they stay on top
function buildExplorePoints() {
  const drawOrder = (card) =>
    card.id === state.selectedCard?.id ? 2 : isCollected(card.id) ? 1 : 0;
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
// fewer log ticks so prices stay readable
const LOG_PRICE_TICKS = [
  0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
];

function setLogPriceTicks(scale) {
  if (scale.type !== "logarithmic") return;
  scale.ticks = LOG_PRICE_TICKS.filter((v) => v >= scale.min && v <= scale.max).map((value) => ({
    value,
  }));
}
// padding leaves fractional edges, labels stay on whole years
function setYearTicks(scale) {
  const ticks = [];
  for (let year = Math.ceil(scale.min); year <= Math.floor(scale.max); year++)
    ticks.push({ value: year });
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
      datasets: [
        {
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
          hoverBorderColor: (ctx) =>
            getPointState(ctx) === "normal" ? CHART_COLORS.text : undefined,
          borderWidth: (ctx) => POINT_STYLES[getPointState(ctx)].borderWidth,
          pointRadius: (ctx) => POINT_STYLES[getPointState(ctx)].radius,
          pointHoverRadius: (ctx) => POINT_STYLES[getPointState(ctx)].hoverRadius,
          pointHitRadius: 5,
          pointStyle: (ctx) => POINT_STYLES[getPointState(ctx)].style,
        },
      ],
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
          title: {
            display: true,
            text: "Set Release Year",
            color: CHART_COLORS.text,
            font: PIXEL_FONT,
          },
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
          title: {
            display: true,
            text: "Market Price (USD)",
            color: CHART_COLORS.text,
            font: PIXEL_FONT,
          },
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
              return [
                formatCurrency(card.priceUsd),
                card.rarity,
                `${card.setName} · ${card.releaseYear}`,
              ];
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
  // redraw canvas text once the web fonts are ready
  document.fonts?.ready.then(() => exploreChart.update("none"));
}
// change the axis only, prices stay in dollars
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
    `Scatter plot of ${state.filteredCards.length} Pokémon cards: market price (${scaleName} scale) by set release year, coloured by rarity.`,
  );
}
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
      const members =
        group === OTHER_RARITY
          ? uniqueSorted(
              state.allCards
                .filter((c) => getRarityGroup(c.rarity) === OTHER_RARITY)
                .map((c) => c.rarity),
            )
          : group.rarities;
      return createLegendItem(
        [legendSpan("legend-swatch", "", group.color), document.createTextNode(group.label)],
        counts.get(group) || 0,
        `Includes: ${members.join(", ")}`,
      );
    });

  const divider = document.createElement("li");
  divider.className = "legend-divider";
  divider.setAttribute("aria-hidden", "true");

  els.rarityLegend.replaceChildren(
    ...items,
    divider,
    createLegendItem([legendSpan("legend-marker collected"), document.createTextNode("Collected")]),
    createLegendItem([legendSpan("legend-marker selected"), document.createTextNode("Selected")]),
  );
}
