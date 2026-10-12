// wire up the controls
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
els.collection.viewToggle.addEventListener("change", (event) =>
  setCollectionView(event.target.value),
);

els.addButton.addEventListener("click", () => {
  addToCollection(state.selectedCard);
});

loadCards();
