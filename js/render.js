function createTypeBadge(type) {
  const badge = document.createElement("span");
  badge.className = "type-badge";
  badge.dataset.type = type;
  badge.textContent = type === "Colorless" ? "Normal" : type;
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
  els.addButtonLabel.textContent = collected
    ? "Added ✓"
    : full
      ? "Collection Full"
      : "+ Add to Collection";
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
    // ignore an old image error if another card was picked meanwhile
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
  const imageUrl = card.imageSmall || card.imageLarge;
  img.onerror = () => {
    img.onerror = null; // don't retry if the fallback also fails
    img.src = "assets/icons/card.svg";
  };
  img.src = imageUrl || "assets/icons/card.svg";
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
// totals use the whole collection, even with filters on
function renderCollectionStats(cards) {
  const total = cards.reduce((sum, card) => sum + card.priceUsd, 0);
  const top = cards.reduce(
    (best, card) => (!best || card.priceUsd > best.priceUsd ? card : best),
    null,
  );
  const s = els.stats;

  s.count.textContent = cards.length;
  s.total.textContent = cards.length ? formatCurrency(total) : "—";
  s.average.textContent = cards.length ? formatCurrency(total / cards.length) : "—";

  s.topName.textContent = top?.name ?? "—";
  s.topPrice.textContent = top ? formatCurrency(top.priceUsd) : "—";
  const topImage = top?.imageSmall || top?.imageLarge;
  s.topImage.hidden = !topImage;
  if (topImage) {
    s.topImage.onerror = () => {
      s.topImage.onerror = null;
      s.topImage.src = "assets/icons/card.svg";
    };
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
  // with filters hidden, keep the single card visible so it can be removed
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
