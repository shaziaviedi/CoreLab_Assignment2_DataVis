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
  // hidden panels have no chart size, resize when shown again
  if (tabName === "collection") collectionChart?.resize();
  else exploreChart?.resize();
}

function handleTabKeys(event) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const next = state.activeTab === "explore" ? "collection" : "explore";
  showTab(next);
  document.getElementById(`tab-${next}`).focus();
}
// guard here too, even if the add button is already disabled
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
