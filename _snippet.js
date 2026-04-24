function renderFilters() {
  const categoryList = $("categoryList");
  const qualityList = $("qualityList");
  if (!categoryList || !qualityList) return;

  const categories = [...new Set(state.items.map(item => item.category).filter(Boolean))];
  const qualities = [...new Set(state.items.map(item => item.quality).filter(Boolean))];

  // 褰撳墠绛涢€夊鏋滃凡缁忎笉瀛樺湪浜嗭紝灏遍噸缃?
  if (state.currentCategory && !categories.includes(state.currentCategory)) {
    state.currentCategory = "";
  }

  if (state.currentQuality && !qualities.includes(state.currentQuality)) {
    state.currentQuality = "";
  }

  categoryList.innerHTML =
    `<div class="filter-item ${state.currentCategory === "" ? "active" : ""}" data-type="category" data-value="">全部</div>` +
    categories.map(category => `
      <div class="filter-item ${state.currentCategory === category ? "active" : ""}" data-type="category" data-value="${escapeHtml(category)}">
        ${escapeHtml(category)}
      </div>
    `).join("");

  qualityList.innerHTML =
    `<div class="filter-item ${state.currentQuality === "" ? "active" : ""}" data-type="quality" data-value="">全部</div>` +
    qualities.map(quality => `
      <div class="filter-item ${state.currentQuality === quality ? "active" : ""}" data-type="quality" data-value="${escapeHtml(quality)}">
        ${escapeHtml(quality)}
      </div>
    `).join("");

  bindFilterClick();
}

function bindFilterClick() {
  document.querySelectorAll(".filter-item").forEach(element => {
    element.addEventListener("click", () => {
      const { type, value } = element.dataset;
