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
  els.status.hidden = !message;
  els.status.classList.toggle("loading", kind === "loading");
  els.status.classList.toggle("error", kind === "error");
  els.main.setAttribute("aria-busy", String(kind === "loading"));
}
