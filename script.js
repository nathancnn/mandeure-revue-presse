document.addEventListener("DOMContentLoaded", () => {
  initPressReview();
  initScrollReveal();
});

function normalize(str) {
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlight(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;
  try {
    const re = new RegExp("(" + query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
    return safe.replace(re, "<mark>$1</mark>");
  } catch (e) {
    return safe;
  }
}

const PAGE_SIZE = 24;

const SORT_OPTIONS = [
  { id: "date-desc", label: "Plus récents d’abord" },
  { id: "date-asc", label: "Plus anciens d’abord" },
  { id: "title-asc", label: "Titre (A à Z)" },
  { id: "source-asc", label: "Source (A à Z)" },
];

function initPressReview() {
  const filtersEl = document.getElementById("filters");
  const gridEl = document.getElementById("article-grid");
  const searchInput = document.getElementById("search-input");
  const searchClear = document.getElementById("search-clear");
  const periodSelect = document.getElementById("period-select");
  const sortSelect = document.getElementById("sort-select");
  const filterMenuTrigger = document.getElementById("filter-menu-trigger");
  const filterMenuPanel = document.getElementById("filter-menu-panel");
  const filterMenuReset = document.getElementById("filter-menu-reset");
  const resultsMeta = document.getElementById("results-meta");
  const emptyState = document.getElementById("empty-state");
  const loadMoreEl = document.getElementById("load-more");
  const loadMoreBtn = document.getElementById("load-more-btn");
  if (!filtersEl || !gridEl) return;

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

  let activeFilter = "all";
  let activePeriod = "all";
  let query = "";
  let sortBy = "date-desc";
  let visibleCount = PAGE_SIZE;

  // --- Period options (years present in the data, most recent first) ---
  const years = Array.from(new Set(ARTICLES.map((a) => a.date.slice(0, 4)))).sort((a, b) => b.localeCompare(a));
  if (periodSelect) {
    periodSelect.innerHTML =
      '<option value="all">Toute la période</option>' +
      years.map((y) => '<option value="' + y + '">' + y + "</option>").join("");
    periodSelect.addEventListener("change", () => {
      activePeriod = periodSelect.value;
      visibleCount = PAGE_SIZE;
      updateFilterBadge();
      render();
    });
  }

  if (sortSelect) {
    sortSelect.innerHTML = SORT_OPTIONS.map((o) => '<option value="' + o.id + '">' + o.label + "</option>").join("");
    sortSelect.addEventListener("change", () => {
      sortBy = sortSelect.value;
      visibleCount = PAGE_SIZE;
      updateFilterBadge();
      render();
    });
  }

  // --- Filter menu (période + tri), dropdown panel ---
  function updateFilterBadge() {
    if (!filterMenuTrigger) return;
    const isActive = activePeriod !== "all" || sortBy !== "date-desc";
    filterMenuTrigger.classList.toggle("has-active-filters", isActive);
  }

  function setFilterMenuOpen(open) {
    if (!filterMenuTrigger || !filterMenuPanel) return;
    filterMenuTrigger.setAttribute("aria-expanded", String(open));
    filterMenuPanel.classList.toggle("is-open", open);
    filterMenuPanel.setAttribute("aria-hidden", String(!open));
  }

  if (filterMenuTrigger && filterMenuPanel) {
    filterMenuTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      setFilterMenuOpen(filterMenuTrigger.getAttribute("aria-expanded") !== "true");
    });
    filterMenuPanel.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => setFilterMenuOpen(false));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setFilterMenuOpen(false);
    });
  }

  if (filterMenuReset) {
    filterMenuReset.addEventListener("click", () => {
      activePeriod = "all";
      sortBy = "date-desc";
      if (periodSelect) periodSelect.value = "all";
      if (sortSelect) sortSelect.value = "date-desc";
      visibleCount = PAGE_SIZE;
      updateFilterBadge();
      render();
    });
  }

  // --- Build filter pills ---
  function countFor(catId) {
    if (catId === "all") return ARTICLES.length;
    return ARTICLES.filter((a) => a.categories.includes(catId)).length;
  }

  function renderFilters() {
    filtersEl.innerHTML = "";
    const all = [{ id: "all", label: "Toutes", short: "Toutes", color: null }, ...CATEGORIES];
    all.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-pill" + (cat.id === activeFilter ? " is-active" : "");
      btn.setAttribute("aria-pressed", String(cat.id === activeFilter));
      btn.dataset.filter = cat.id;
      if (cat.color) btn.style.setProperty("--dot-color", cat.color);
      btn.innerHTML =
        (cat.color ? '<span class="filter-pill__dot" aria-hidden="true"></span>' : "") +
        "<span>" + cat.short + "</span>" +
        '<span class="filter-pill__count">' + countFor(cat.id) + "</span>";
      btn.addEventListener("click", () => {
        if (activeFilter === cat.id) return;
        activeFilter = cat.id;
        visibleCount = PAGE_SIZE;
        renderFilters();
        render();
      });
      filtersEl.appendChild(btn);
    });
  }

  // --- Cards ---
  function cardHtml(article, index) {
    const tags = article.categories
      .map((id) => catById[id])
      .filter(Boolean)
      .map((cat) => '<span class="tag" style="--tag-color:' + cat.color + '">' + cat.short + "</span>")
      .join("");

    return (
      '<a class="article-card reveal" href="' + article.url + '" target="_blank" rel="noopener noreferrer" ' +
      'style="--reveal-delay:' + Math.min(index, 8) * 40 + 'ms" ' +
      'aria-label="' + escapeHtml(article.title) + ", " + escapeHtml(article.source) + ", " + escapeHtml(article.displayDate) + ', ouvre un nouvel onglet">' +
        '<div class="article-card__meta">' + tags + '<span class="article-card__date">' + article.displayDate + "</span></div>" +
        '<p class="article-card__title">' + highlight(article.title, query) + "</p>" +
        '<p class="article-card__summary">' + highlight(article.summary, query) + "</p>" +
        '<div class="article-card__footer">' +
          '<span class="article-card__source">' + article.source + "</span>" +
          '<span class="article-card__link">Lire l’article' +
            '<svg class="article-card__link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>' +
          "</span>" +
        "</div>" +
      "</a>"
    );
  }

  function matchesQuery(article, normQuery) {
    if (!normQuery) return true;
    return (
      normalize(article.title).includes(normQuery) ||
      normalize(article.summary).includes(normQuery) ||
      normalize(article.source).includes(normQuery)
    );
  }

  function sortList(list) {
    const collator = new Intl.Collator("fr", { sensitivity: "base" });
    return list.slice().sort((a, b) => {
      switch (sortBy) {
        case "date-asc":
          return a.date.localeCompare(b.date);
        case "title-asc":
          return collator.compare(a.title, b.title);
        case "source-asc":
          return collator.compare(a.source, b.source) || b.date.localeCompare(a.date);
        case "date-desc":
        default:
          return b.date.localeCompare(a.date);
      }
    });
  }

  function render() {
    const normQuery = normalize(query.trim());
    let list = ARTICLES.filter(
      (a) =>
        (activeFilter === "all" || a.categories.includes(activeFilter)) &&
        (activePeriod === "all" || a.date.slice(0, 4) === activePeriod) &&
        matchesQuery(a, normQuery)
    );
    list = sortList(list);

    const displayList = list.slice(0, visibleCount);

    gridEl.innerHTML = displayList.map((a, i) => cardHtml(a, i)).join("");

    if (emptyState) emptyState.hidden = list.length > 0;

    if (loadMoreEl) loadMoreEl.hidden = list.length <= visibleCount;

    if (resultsMeta) {
      const count = list.length;
      const parts = [];
      if (activeFilter !== "all") parts.push(catById[activeFilter].label);
      if (activePeriod !== "all") parts.push(activePeriod);
      if (normQuery) parts.push("pour « " + query.trim() + " »");
      resultsMeta.textContent =
        count === 0
          ? "Aucun article ne correspond à votre recherche."
          : count + (count > 1 ? " articles trouvés" : " article trouvé") + (parts.length ? " (" + parts.join(", ") + ")" : "");
    }

    if (prefersReduced) {
      gridEl.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
    } else {
      requestAnimationFrame(() => {
        gridEl.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
      });
    }
  }

  // --- Search ---
  let debounceTimer = null;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      query = searchInput.value;
      if (searchClear) searchClear.classList.toggle("is-visible", query.length > 0);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(render, 120);
    });
  }
  if (searchClear) {
    searchClear.addEventListener("click", () => {
      query = "";
      searchInput.value = "";
      searchClear.classList.remove("is-visible");
      searchInput.focus();
      render();
    });
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      visibleCount += PAGE_SIZE;
      render();
    });
  }

  // --- Last updated + refresh ---
  const lastUpdatedEl = document.getElementById("last-updated");
  if (lastUpdatedEl && ARTICLES.length) {
    const maxDate = ARTICLES.reduce((max, a) => (a.date > max ? a.date : max), ARTICLES[0].date);
    const formatted = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(
      new Date(maxDate + "T00:00:00")
    );
    lastUpdatedEl.textContent = "Dernier article ajouté le " + formatted;
  }
  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      refreshBtn.classList.add("is-refreshing");
      refreshBtn.disabled = true;
      window.location.reload();
    });
  }

  renderFilters();
  render();
}

function initScrollReveal() {
  const items = document.querySelectorAll(".reveal:not(.article-card)");
  if (!items.length) return;

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0, rootMargin: "0px 0px -40px 0px" }
  );

  items.forEach((el) => {
    if (el.getBoundingClientRect().top < window.innerHeight) {
      el.classList.add("is-visible");
    } else {
      observer.observe(el);
    }
  });
}
