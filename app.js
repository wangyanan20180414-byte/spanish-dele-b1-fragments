const searchInput = document.querySelector("#chapterSearch");
const chapterList = document.querySelector("#chapterList");
const chapterDetail = document.querySelector("#chapterDetail");
const statsGrid = document.querySelector("#statsGrid");
const heroSummary = document.querySelector("#heroSummary");
const sidebar = document.querySelector(".sidebar");
const workspace = document.querySelector(".workspace");
const sprintPanel = document.querySelector(".sprint-panel");
const sprintCard = document.querySelector("#sprintCard");
const sprintButton = document.querySelector("#startSprint");
const mobileNavToggle = document.querySelector("#mobileNavToggle");
const mobileBottomNav = document.querySelector("#mobileBottomNav");
const sidebarOverlay = document.querySelector("#sidebarOverlay");
const toast = document.querySelector("#toast");

const defaultState = {
  selectedChapter: STUDY_DATA.chapters[0].slug,
  search: "",
  progress: {},
  chapterFilter: "all",
  mobileTab: "study",
  mobileCardMode: "single",
  cardDirection: "es-zh",
  hardOnly: false,
  chapterCardCursor: {},
  sprintReveal: false,
  sprintCardId: null,
};

let state = loadState();
let toastTimer = null;
let mobileNavScrollY = 0;
let lastViewportWidth = window.innerWidth;
let lastPhoneLayout = isPhoneLayout();

function cloneDefaultState() {
  return {
    selectedChapter: defaultState.selectedChapter,
    search: defaultState.search,
    progress: {},
    chapterFilter: defaultState.chapterFilter,
    mobileTab: defaultState.mobileTab,
    mobileCardMode: defaultState.mobileCardMode,
    cardDirection: defaultState.cardDirection,
    hardOnly: defaultState.hardOnly,
    chapterCardCursor: {},
    sprintReveal: defaultState.sprintReveal,
    sprintCardId: defaultState.sprintCardId,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STUDY_DATA.storageKey);
    if (!raw) return cloneDefaultState();
    const parsed = JSON.parse(raw);
    return {
      ...cloneDefaultState(),
      ...parsed,
      progress: parsed.progress || {},
      chapterCardCursor: parsed.chapterCardCursor || {},
    };
  } catch {
    return cloneDefaultState();
  }
}

function saveState() {
  localStorage.setItem(STUDY_DATA.storageKey, JSON.stringify(state));
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!(location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch (error) {
    console.error("Service worker registration failed", error);
  }
}

function isPhoneLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function handleViewportResize() {
  const nextWidth = window.innerWidth;
  const nextPhoneLayout = isPhoneLayout();

  if (nextWidth === lastViewportWidth && nextPhoneLayout === lastPhoneLayout) {
    return;
  }

  lastViewportWidth = nextWidth;
  lastPhoneLayout = nextPhoneLayout;
  render();
}

function clampIndex(index, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(index, total - 1));
}

function chapterCardCursor(chapterSlug, total) {
  const next = clampIndex(state.chapterCardCursor?.[chapterSlug] || 0, total);
  state.chapterCardCursor[chapterSlug] = next;
  return next;
}

function setChapterCardCursor(chapterSlug, index, total) {
  state.chapterCardCursor[chapterSlug] = clampIndex(index, total);
}

function generatedCardsForChapter(chapter) {
  const generated = window.GENERATED_CARDS?.[chapter.slug] || [];
  return generated.map((card, index) => ({
    ...card,
    id: `${chapter.slug}-point-${index + 1}`,
    chapterSlug: chapter.slug,
    chapterTitle: chapter.title,
    accent: chapter.accent,
    source: "generated",
  }));
}

function manualCardsForChapter(chapter) {
  return (chapter.cards || []).map((card, index) => ({
    ...card,
    id: `${chapter.slug}-card-${index + 1}`,
    chapterSlug: chapter.slug,
    chapterTitle: chapter.title,
    accent: chapter.accent,
    source: "manual",
  }));
}

function cardsForChapter(chapter) {
  const generated = generatedCardsForChapter(chapter);
  if (generated.length) return generated;
  return manualCardsForChapter(chapter);
}

function flattenCards() {
  return STUDY_DATA.chapters.flatMap((chapter) => cardsForChapter(chapter));
}

const allCards = flattenCards();

function selectedChapter() {
  const byHash = location.hash.replace("#", "");
  const slug = byHash || state.selectedChapter;
  return STUDY_DATA.chapters.find((chapter) => chapter.slug === slug) || STUDY_DATA.chapters[0];
}

function setChapter(slug) {
  state.selectedChapter = slug;
  if (isPhoneLayout()) {
    state.mobileTab = "study";
  }
  location.hash = slug;
  saveState();
  setMobileNav(false);
  render();
}

function setMobileTab(tab) {
  if (isPhoneLayout()) {
    state.mobileTab = tab;
    saveState();
    render();

    if (tab === "chapters") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (tab === "sprint") {
      sprintPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    chapterDetail.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (tab === "chapters") {
    const isOpen = document.body.classList.contains("mobile-nav-open");
    setMobileNav(!isOpen);
    return;
  }

  state.mobileTab = tab;
  setMobileNav(false);
  saveState();
  render();

  if (tab === "sprint") {
    sprintPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  chapterDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setMobileCardMode(mode) {
  state.mobileCardMode = mode;
  saveState();
  renderChapter();
}

function setCardDirection(direction) {
  state.cardDirection = direction;
  if (direction !== "zh-es") {
    state.hardOnly = false;
  }
  state.sprintReveal = false;
  saveState();
  renderChapter();
  renderSprint();
}

function setHardOnly() {
  state.hardOnly = !state.hardOnly;
  state.sprintReveal = false;
  saveState();
  renderChapter();
  renderSprint();
}

function setChapterFilter(filter) {
  state.chapterFilter = state.chapterFilter === filter ? "all" : filter;
  saveState();
  renderChapter();
}

function applyStudyPreset(preset) {
  state.mobileCardMode = "single";

  if (preset === "new") {
    state.chapterFilter = "new";
    state.cardDirection = "es-zh";
    state.hardOnly = false;
  } else if (preset === "again") {
    state.chapterFilter = "again";
    state.cardDirection = "es-zh";
    state.hardOnly = false;
  } else if (preset === "hard") {
    state.chapterFilter = "all";
    state.cardDirection = "zh-es";
    state.hardOnly = true;
  } else {
    state.chapterFilter = "all";
    state.cardDirection = "es-zh";
    state.hardOnly = false;
  }

  state.sprintReveal = false;
  saveState();
  renderChapter();
  renderSprint();
}

function setCardMark(cardId, mark) {
  const chapter = selectedChapter();
  const previousVisibleCards = visibleCardsForChapter(chapter);
  const previousIndex = previousVisibleCards.findIndex((card) => card.id === cardId);
  const nextMark = cardMark(cardId) === mark ? "new" : mark;
  if (nextMark === "new") {
    delete state.progress[cardId];
  } else {
    state.progress[cardId] = nextMark;
  }
  maybeAdvanceSingleCard(cardId, previousIndex);
  saveState();
  renderStats();
  renderHero();
  renderChapter();
  renderSprint();
  const card = allCards.find((item) => item.id === cardId);
  if (!card) return;
  if (isPhoneLayout() && state.mobileCardMode === "single") return;
  if (nextMark === "known") showToast(`已标记为记住: ${card.chapterTitle}`);
  else if (nextMark === "again") showToast(`已标记为再看: ${card.chapterTitle}`);
  else showToast(`已清除标记: ${card.chapterTitle}`);
}

function cardMark(cardId) {
  return state.progress[cardId] || "new";
}

function chapterSubtitle(chapter) {
  return chapter.subtitle || "";
}

function splitCardBack(back) {
  const marker = "。例：";
  const text = back || "";
  const index = text.indexOf(marker);
  if (index === -1) {
    return {
      gloss: text.trim(),
      example: "",
    };
  }

  return {
    gloss: text
      .slice(0, index)
      .replace(/[。.\s]+$/u, "")
      .trim(),
    example: text.slice(index + marker.length).trim(),
  };
}

function cardPrompt(card, direction = state.cardDirection) {
  const { gloss } = splitCardBack(card.back);
  return direction === "zh-es" ? gloss || card.back : card.front;
}

function cardAnswerMarkup(card, direction = state.cardDirection) {
  const { gloss, example } = splitCardBack(card.back);

  if (direction === "zh-es") {
    return `
      <div class="answer-copy answer-copy-reverse">
        <p class="answer-head">${card.front}</p>
        ${gloss ? `<p class="answer-gloss">${gloss}</p>` : ""}
        ${example ? `<p class="answer-example">例：${example}</p>` : ""}
      </div>
    `;
  }

  return `
    <div class="answer-copy">
      ${gloss ? `<p class="answer-head">${gloss}</p>` : ""}
      ${example ? `<p class="answer-example">例：${example}</p>` : ""}
    </div>
  `;
}

function filteredChapters() {
  const query = state.search.trim().toLowerCase();
  if (!query) return STUDY_DATA.chapters;

  return STUDY_DATA.chapters.filter((chapter) => {
    const haystack = [
      chapter.number,
      chapter.title,
      chapterSubtitle(chapter),
      chapter.level,
      chapter.why,
      ...(chapter.points || []),
      ...chapter.core,
      ...chapter.focus,
      ...cardsForChapter(chapter).flatMap((card) => [card.tag, card.front, card.back]),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

function pickSprintCard() {
  const chapter = selectedChapter();
  const candidates = allCards.filter((card) => card.chapterSlug === chapter.slug);
  const hardPool =
    state.cardDirection === "zh-es" && state.hardOnly
      ? candidates.filter((card) => cardMark(card.id) === "again")
      : [];
  if (hardPool.length) {
    const chosen = hardPool[Math.floor(Math.random() * hardPool.length)];
    state.sprintCardId = chosen?.id || null;
    state.sprintReveal = false;
    saveState();
    return;
  }
  const weak = candidates.filter((card) => cardMark(card.id) !== "known");
  const pool = weak.length ? weak : candidates;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  state.sprintCardId = chosen?.id || null;
  state.sprintReveal = false;
  saveState();
}

function progressStats() {
  const total = allCards.length;
  const known = allCards.filter((card) => cardMark(card.id) === "known").length;
  const review = allCards.filter((card) => cardMark(card.id) === "again").length;
  const fresh = total - known - review;
  return { total, known, review, fresh };
}

function chapterProgress(chapter) {
  const ids = cardsForChapter(chapter).map((card) => card.id);
  const known = ids.filter((id) => cardMark(id) === "known").length;
  const review = ids.filter((id) => cardMark(id) === "again").length;
  const fresh = ids.length - known - review;
  return { total: ids.length, known, review, fresh };
}

function visibleCardsForChapter(chapter) {
  let cards = cardsForChapter(chapter);
  const filter = state.chapterFilter || "all";

  if (state.cardDirection === "zh-es" && state.hardOnly) {
    cards = cards.filter((card) => cardMark(card.id) === "again");
  }

  if (filter === "known") {
    return cards.filter((card) => cardMark(card.id) === "known");
  }

  if (filter === "again") {
    return cards.filter((card) => cardMark(card.id) === "again");
  }

  if (filter === "new") {
    return cards.filter((card) => cardMark(card.id) === "new");
  }

  return cards;
}

function maybeAdvanceSingleCard(cardId, previousIndex) {
  if (!isPhoneLayout() || state.mobileCardMode !== "single") return;

  const card = allCards.find((item) => item.id === cardId);
  if (!card || card.chapterSlug !== selectedChapter().slug) return;

  const chapter = selectedChapter();
  const visible = visibleCardsForChapter(chapter);
  const currentIndex = visible.findIndex((item) => item.id === cardId);

  if (currentIndex === -1) {
    setChapterCardCursor(chapter.slug, previousIndex, visible.length);
    return;
  }

  setChapterCardCursor(chapter.slug, currentIndex + 1, visible.length);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("visible");
  }, 1800);
}

function setMobileNav(open) {
  if (open) {
    mobileNavScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = "fixed";
    document.body.style.top = `-${mobileNavScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  } else {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
  }

  document.body.classList.toggle("mobile-nav-open", open);
  if (mobileNavToggle) {
    mobileNavToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }
  renderMobileShell();

  if (!open) {
    window.scrollTo(0, mobileNavScrollY);
  }
}

function renderNav() {
  const currentSlug = selectedChapter().slug;
  const chapters = filteredChapters();

  chapterList.innerHTML = chapters
    .map((chapter) => {
      const progress = chapterProgress(chapter);
      const percent = progress.total ? Math.round((progress.known / progress.total) * 100) : 0;
      const hint = progress.review
        ? `再看 ${progress.review}`
        : progress.fresh
          ? `新卡 ${progress.fresh}`
          : "已完成";
      return `
        <button
          class="chapter-link ${chapter.slug === currentSlug ? "active" : ""}"
          data-slug="${chapter.slug}"
          style="--chapter-accent:${chapter.accent};"
        >
          <span class="chapter-number">${chapter.number}</span>
          <span class="chapter-copy">
            <strong>${chapter.title}</strong>
            <small>${chapterSubtitle(chapter)}</small>
            <span class="chapter-progress">
              <span class="chapter-progress-fill" style="width:${percent}%"></span>
            </span>
          </span>
          <span class="chapter-state">
            <strong>${progress.known}/${progress.total}</strong>
            <small>${hint}</small>
          </span>
        </button>
      `;
    })
    .join("");

  chapterList.querySelectorAll("[data-slug]").forEach((node) => {
    node.addEventListener("click", () => setChapter(node.dataset.slug));
  });
}

function renderHero() {
  const chapter = selectedChapter();
  const progress = chapterProgress(chapter);
  const percent = progress.total ? Math.round((progress.known / progress.total) * 100) : 0;
  const phone = isPhoneLayout();

  if (phone) {
    heroSummary.innerHTML = `
      <div class="hero-card hero-card-compact" style="--chapter-accent:${chapter.accent};">
        <div class="hero-card-top">
          <span class="hero-stage">主题 ${chapter.number}</span>
          <span class="hero-pages">${chapter.pages}</span>
        </div>
        <h2>${chapter.title}</h2>
        <p class="hero-subtitle">${chapterSubtitle(chapter)}</p>
        <div class="hero-track" aria-hidden="true">
          <span class="hero-track-fill" style="width:${percent}%"></span>
        </div>
        <p class="hero-compact-meta">${progress.known}/${progress.total} 已记住 · 新卡 ${progress.fresh} · 再看 ${progress.review}</p>
      </div>
    `;
    return;
  }

  heroSummary.innerHTML = `
    <div class="hero-card" style="--chapter-accent:${chapter.accent};">
      <div class="hero-card-top">
        <span class="hero-stage">主题 ${chapter.number}</span>
        <span class="hero-pages">${chapter.pages}</span>
      </div>
      <h2>${chapter.title}</h2>
      <p class="hero-subtitle">${chapterSubtitle(chapter)}</p>
      <div class="hero-track" aria-hidden="true">
        <span class="hero-track-fill" style="width:${percent}%"></span>
      </div>
      <div class="hero-metrics">
        <span>${progress.known}/${progress.total} 已记住</span>
        <span>${progress.fresh} 新卡</span>
        <span>${progress.review} 再看</span>
      </div>
    </div>
  `;
}

function renderStats() {
  const stats = progressStats();
  if (isPhoneLayout()) {
    statsGrid.innerHTML = `
      <article class="stat-card stat-card-compact">
        <strong>${stats.total}</strong>
        <span class="stat-label">总词卡</span>
      </article>
      <article class="stat-card stat-card-compact">
        <strong>${stats.known}</strong>
        <span class="stat-label">已记住</span>
      </article>
      <article class="stat-card stat-card-compact">
        <strong>${stats.review}</strong>
        <span class="stat-label">再看</span>
      </article>
    `;
    return;
  }

  statsGrid.innerHTML = `
    <article class="stat-card">
      <strong>${STUDY_DATA.chapters.length}</strong>
      <span class="stat-label">主题</span>
    </article>
    <article class="stat-card">
      <strong>${stats.total}</strong>
      <span class="stat-label">词卡</span>
    </article>
    <article class="stat-card">
      <strong>${stats.known}</strong>
      <span class="stat-label">已记住</span>
    </article>
    <article class="stat-card">
      <strong>${stats.review}</strong>
      <span class="stat-label">再看</span>
    </article>
  `;
}

function renderMobileShell() {
  const phone = isPhoneLayout();
  const chapterActive = phone && state.mobileTab === "chapters";
  const studyActive = !phone || state.mobileTab === "study";
  const sprintActive = !phone || state.mobileTab === "sprint";

  if (phone && document.body.classList.contains("mobile-nav-open")) {
    document.body.classList.remove("mobile-nav-open");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
  }

  if (sidebar) {
    sidebar.classList.toggle("mobile-section-hidden", phone && !chapterActive);
  }
  if (workspace) {
    workspace.classList.toggle("mobile-section-hidden", phone && chapterActive);
  }
  chapterDetail.classList.toggle("mobile-section-hidden", !studyActive);
  sprintPanel.classList.toggle("mobile-section-hidden", phone && !sprintActive);
  document.body.classList.toggle("mobile-sidebar-active", chapterActive);

  if (!mobileBottomNav) return;
  mobileBottomNav.querySelectorAll("[data-mobile-action]").forEach((button) => {
    const action = button.dataset.mobileAction;
    const active = state.mobileTab === action;
    button.classList.toggle("is-active", active);
  });
}

function memoryCardMarkup(card) {
  const id = card.id;
  const mark = cardMark(id);
  const reverse = state.cardDirection === "zh-es";
  return `
    <article class="memory-card ${mark}" data-card-id="${id}">
      <div class="memory-top">
        <span class="tag">${card.tag}</span>
        <span class="mark-label">${markLabel(mark)}</span>
      </div>
      ${reverse ? `<p class="memory-direction">中文提示，先自己想西语。</p>` : ""}
      <p class="memory-front">${cardPrompt(card)}</p>
      <details class="memory-answer">
        <summary>显示答案</summary>
        ${cardAnswerMarkup(card)}
      </details>
      <div class="memory-actions">
        <button class="button button-ghost ${mark === "again" ? "is-active" : ""}" data-mark="again" data-card-id="${id}">再看</button>
        <button class="button button-tint ${mark === "known" ? "is-active" : ""}" data-mark="known" data-card-id="${id}">记住</button>
      </div>
    </article>
  `;
}

function renderChapter() {
  const chapter = selectedChapter();
  const progress = chapterProgress(chapter);
  const hardCount = cardsForChapter(chapter).filter((card) => cardMark(card.id) === "again").length;
  const chapterCards = visibleCardsForChapter(chapter);
  const filter = state.chapterFilter || "all";
  const singleMode = isPhoneLayout() && state.mobileCardMode === "single";
  const hardOnlyActive = state.cardDirection === "zh-es" && state.hardOnly;
  const filterLabel = {
    all: hardOnlyActive ? `只显示中→西难词 ${chapterCards.length} 张` : `显示 ${progress.total} 张词卡`,
    new: `显示新卡 ${chapterCards.length} 张`,
    known: `显示记住 ${chapterCards.length} 张`,
    again: `显示再看 ${chapterCards.length} 张`,
  }[filter];
  const viewToggle = `
    <div class="card-toolbar">
      <div class="card-view-toggle">
        <button class="view-pill ${state.mobileCardMode === "single" ? "is-active" : ""}" data-view-mode="single">单卡</button>
        <button class="view-pill ${state.mobileCardMode === "all" ? "is-active" : ""}" data-view-mode="all">全部</button>
      </div>
      <div class="card-direction-toggle">
        <button class="view-pill ${state.cardDirection === "es-zh" ? "is-active" : ""}" data-card-direction="es-zh">西→中</button>
        <button class="view-pill ${state.cardDirection === "zh-es" ? "is-active" : ""}" data-card-direction="zh-es">中→西</button>
      </div>
      <div class="card-hard-toggle">
        <button class="view-pill ${hardOnlyActive ? "is-active" : ""}" data-hard-only="toggle">难词</button>
      </div>
    </div>
  `;
  const shortcutMarkup = `
    <div class="study-shortcuts">
      <button class="shortcut-card ${filter === "new" && state.cardDirection === "es-zh" && !hardOnlyActive ? "is-active" : ""}" data-study-preset="new" ${progress.fresh ? "" : "disabled"}>
        <span class="shortcut-label">新卡</span>
        <span class="shortcut-count">${progress.fresh} 张</span>
      </button>
      <button class="shortcut-card ${filter === "again" && state.cardDirection === "es-zh" && !hardOnlyActive ? "is-active" : ""}" data-study-preset="again" ${progress.review ? "" : "disabled"}>
        <span class="shortcut-label">再看</span>
        <span class="shortcut-count">${progress.review} 张</span>
      </button>
      <button class="shortcut-card ${hardOnlyActive ? "is-active" : ""}" data-study-preset="hard" ${hardCount ? "" : "disabled"}>
        <span class="shortcut-label">中→西难词</span>
        <span class="shortcut-count">${hardCount} 张</span>
      </button>
      <button class="shortcut-card ${filter === "all" && state.cardDirection === "es-zh" && !hardOnlyActive ? "is-active" : ""}" data-study-preset="all" ${progress.total ? "" : "disabled"}>
        <span class="shortcut-label">全章顺刷</span>
        <span class="shortcut-count">${progress.total} 张</span>
      </button>
    </div>
  `;

  let cardsMarkup = `<p class="empty-cards">这个筛选下暂时没有词卡。</p>`;

  if (chapterCards.length) {
    if (singleMode) {
      const cursor = chapterCardCursor(chapter.slug, chapterCards.length);
      const card = chapterCards[cursor];
      cardsMarkup = `
        ${viewToggle}
        <div class="card-focus-shell">
          <div class="card-focus-meta">
            <span class="focus-counter">第 ${cursor + 1} / ${chapterCards.length} 张</span>
          </div>
          ${memoryCardMarkup(card)}
          <div class="card-carousel-actions">
            <button class="button button-secondary" data-card-nav="prev">上一张</button>
            <button class="button button-primary" data-card-nav="next">下一张</button>
          </div>
        </div>
      `;
    } else {
      cardsMarkup = `
        ${viewToggle}
        <div class="card-grid">
          ${chapterCards.map((card) => memoryCardMarkup(card)).join("")}
        </div>
      `;
    }
  } else if (isPhoneLayout()) {
    cardsMarkup = `${viewToggle}<p class="empty-cards">这个筛选下暂时没有词卡。</p>`;
  }

  chapterDetail.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">词卡</p>
          <h4>词卡</h4>
        </div>
        <div class="panel-status">
          <button class="status-pill status-filter status-fresh ${filter === "all" ? "is-active" : ""}" data-filter="all">共 ${progress.total} 张</button>
          <button class="status-pill status-filter status-fresh ${filter === "new" ? "is-active" : ""}" data-filter="new">新卡 ${progress.fresh}</button>
          <button class="status-pill status-filter status-known ${filter === "known" ? "is-active" : ""}" data-filter="known">记住 ${progress.known}</button>
          <button class="status-pill status-filter status-review ${filter === "again" ? "is-active" : ""}" data-filter="again">再看 ${progress.review}</button>
        </div>
      </div>
      <p class="panel-note">${filterLabel}</p>
      ${shortcutMarkup}
      ${
        progress.known === progress.total && filter === "all"
          ? `<p class="panel-note">本主题现有词卡已全部标记为记住。</p>`
          : ""
      }
      ${cardsMarkup}
    </section>

    <article class="chapter-hero" style="--chapter-accent:${chapter.accent};">
      <div class="chapter-title-block">
        <p class="eyebrow">主题 ${chapter.number}</p>
        <h3>${chapter.title}</h3>
        <p class="chapter-subtitle">${chapterSubtitle(chapter)}</p>
      </div>
      <div class="meta-stack">
        <span class="meta-pill">范围 ${chapter.pages}</span>
      </div>
    </article>
  `;

  chapterDetail.querySelectorAll("[data-mark]").forEach((button) => {
    button.addEventListener("click", () => setCardMark(button.dataset.cardId, button.dataset.mark));
  });

  chapterDetail.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => setChapterFilter(button.dataset.filter));
  });

  chapterDetail.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.addEventListener("click", () => setMobileCardMode(button.dataset.viewMode));
  });

  chapterDetail.querySelectorAll("[data-card-direction]").forEach((button) => {
    button.addEventListener("click", () => setCardDirection(button.dataset.cardDirection));
  });

  chapterDetail.querySelectorAll("[data-hard-only]").forEach((button) => {
    button.addEventListener("click", () => setHardOnly());
  });

  chapterDetail.querySelectorAll("[data-study-preset]").forEach((button) => {
    button.addEventListener("click", () => applyStudyPreset(button.dataset.studyPreset));
  });

  chapterDetail.querySelectorAll("[data-card-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const current = chapterCardCursor(chapter.slug, chapterCards.length);
      const delta = button.dataset.cardNav === "next" ? 1 : -1;
      setChapterCardCursor(chapter.slug, current + delta, chapterCards.length);
      saveState();
      renderChapter();
    });
  });
}

function markLabel(mark) {
  if (mark === "known") return "已记住";
  if (mark === "again") return "再看";
  return "新卡";
}

function renderSprint() {
  if (!state.sprintCardId) pickSprintCard();
  const card = allCards.find((item) => item.id === state.sprintCardId) || allCards[0];
  if (!card) return;
  const reverse = state.cardDirection === "zh-es";

  sprintCard.innerHTML = `
    <article class="sprint-frame" style="--chapter-accent:${card.accent};">
      <div class="sprint-meta">
        <span class="tag">${card.chapterTitle}</span>
        <span class="mark-label">${markLabel(cardMark(card.id))}</span>
      </div>
      <div class="card-direction-toggle sprint-direction-toggle">
        <button class="view-pill ${state.cardDirection === "es-zh" ? "is-active" : ""}" data-card-direction="es-zh">西→中</button>
        <button class="view-pill ${state.cardDirection === "zh-es" ? "is-active" : ""}" data-card-direction="zh-es">中→西</button>
        <button class="view-pill ${state.cardDirection === "zh-es" && state.hardOnly ? "is-active" : ""}" data-hard-only="toggle">难词</button>
      </div>
      ${reverse ? `<p class="memory-direction">中文提示，先自己想西语。</p>` : ""}
      <p class="sprint-front">${cardPrompt(card)}</p>
      <div class="sprint-answer ${state.sprintReveal ? "revealed" : ""}">
        ${cardAnswerMarkup(card)}
      </div>
      <div class="memory-actions">
        <button id="revealSprint" class="button button-secondary">
          ${state.sprintReveal ? "收起答案" : "显示答案"}
        </button>
        <button class="button button-ghost ${cardMark(card.id) === "again" ? "is-active" : ""}" data-sprint-mark="again">再看</button>
        <button class="button button-tint ${cardMark(card.id) === "known" ? "is-active" : ""}" data-sprint-mark="known">记住</button>
        <button id="nextSprint" class="button button-primary">下一张</button>
      </div>
    </article>
  `;

  document.querySelector("#revealSprint").addEventListener("click", () => {
    state.sprintReveal = !state.sprintReveal;
    saveState();
    renderSprint();
  });

  document.querySelector("#nextSprint").addEventListener("click", () => {
    pickSprintCard();
    renderSprint();
  });

  sprintCard.querySelectorAll("[data-card-direction]").forEach((button) => {
    button.addEventListener("click", () => setCardDirection(button.dataset.cardDirection));
  });

  sprintCard.querySelectorAll("[data-hard-only]").forEach((button) => {
    button.addEventListener("click", () => setHardOnly());
  });

  sprintCard.querySelectorAll("[data-sprint-mark]").forEach((button) => {
    button.addEventListener("click", () => {
      setCardMark(card.id, button.dataset.sprintMark);
      pickSprintCard();
      renderSprint();
    });
  });
}

function render() {
  const available = filteredChapters();
  if (!available.some((chapter) => chapter.slug === selectedChapter().slug)) {
    const fallback = available[0] || STUDY_DATA.chapters[0];
    state.selectedChapter = fallback.slug;
    saveState();
  }

  if (mobileNavToggle) {
    const chapter = selectedChapter();
    mobileNavToggle.textContent = `主题 ${chapter.number}`;
  }

  renderNav();
  renderHero();
  renderStats();
  renderChapter();
  renderSprint();
  renderMobileShell();
}

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  saveState();
  render();
});

sprintButton.addEventListener("click", () => {
  if (isPhoneLayout()) {
    state.mobileTab = "sprint";
  }
  pickSprintCard();
  saveState();
  render();
  sprintPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

if (mobileNavToggle) {
  mobileNavToggle.addEventListener("click", () => {
    if (isPhoneLayout()) {
      setMobileTab("chapters");
      return;
    }
    const isOpen = document.body.classList.contains("mobile-nav-open");
    setMobileNav(!isOpen);
  });
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", () => setMobileNav(false));
}

if (mobileBottomNav) {
  mobileBottomNav.querySelectorAll("[data-mobile-action]").forEach((button) => {
    button.addEventListener("click", () => setMobileTab(button.dataset.mobileAction));
  });
}

window.addEventListener("hashchange", render);
window.addEventListener("resize", handleViewportResize);

searchInput.value = state.search;
render();
registerServiceWorker();
