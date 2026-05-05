const STATS_STORAGE_KEY = "quizHubStats";
const LIBRARY_STORAGE_KEY = "quizHubLibrary";
const AUTO_ADDED_STORAGE_KEY = "quizHubAutoAdded";
const CUSTOM_QUIZZES_STORAGE_KEY = "quizHubCustomQuizzes";
const DELETED_QUIZZES_STORAGE_KEY = "quizHubDeletedQuizzes";
const DELETE_QUIZ_PASSWORD = "delete";

let sharedQuizzes = [];

async function loadSharedQuizzes() {
  try {
    const { db } = await import("./js/firebase-config.js");

    const {
      collection,
      getDocs
    } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

    const snapshot = await getDocs(collection(db, "sharedQuizzes"));

    sharedQuizzes = snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id
    }));
  } catch (error) {
    console.error("Could not load shared quizzes:", error);
    sharedQuizzes = [];
  }
}

function getStats() {
  return JSON.parse(localStorage.getItem(STATS_STORAGE_KEY) || "{}");
}

function setStats(stats) {
  localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
}

function getCustomQuizzes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_QUIZZES_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setCustomQuizzes(customQuizzes) {
  localStorage.setItem(CUSTOM_QUIZZES_STORAGE_KEY, JSON.stringify(customQuizzes));
}

function getDeletedQuizIds() {
  return getStoredIds(DELETED_QUIZZES_STORAGE_KEY);
}

function setDeletedQuizIds(ids) {
  localStorage.setItem(DELETED_QUIZZES_STORAGE_KEY, JSON.stringify([...new Set(ids)]));
}

function getAllQuizzes() {
  const localCustomQuizzes = getCustomQuizzes();
  const onlineCustomQuizzes = sharedQuizzes;

  const customQuizzes = [...localCustomQuizzes, ...onlineCustomQuizzes];

  const customIds = new Set(customQuizzes.map((quiz) => quiz.id));
  const deletedIds = new Set(getDeletedQuizIds());

  return [...quizzes.filter((quiz) => !customIds.has(quiz.id)), ...customQuizzes]
    .filter((quiz) => !deletedIds.has(quiz.id));
}

function getQuizById(id) {
  return getAllQuizzes().find((quiz) => quiz.id === id);
}

function isLocalCustomQuiz(id) {
  return getCustomQuizzes().some((quiz) => quiz.id === id);
}

function isSharedQuiz(id) {
  return sharedQuizzes.some((quiz) => quiz.id === id);
}

function isEditableQuiz(id) {
  return isLocalCustomQuiz(id) || isSharedQuiz(id);
}

function goToQuizEditor(id) {
  window.location.href = `builder.html?edit=${encodeURIComponent(id)}`;
}

function deleteQuizFromCatalogue(id) {
  if (isLocalCustomQuiz(id)) {
    setCustomQuizzes(getCustomQuizzes().filter((quiz) => quiz.id !== id));
  } else {
    setDeletedQuizIds([...getDeletedQuizIds(), id]);
  }
  removeQuizFromLibrary(id);
  const autoAdded = getStoredIds(AUTO_ADDED_STORAGE_KEY).filter((quizId) => quizId !== id);
  localStorage.setItem(AUTO_ADDED_STORAGE_KEY, JSON.stringify(autoAdded));
}

function getCategoryById(id) {
  return quizCategories.find((category) => category.id === id);
}

function normaliseText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’.]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getStoredIds(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function uniqueValidQuizIds(ids) {
  return [...new Set(ids)].filter((id) => Boolean(getQuizById(id)));
}

function getLibraryIds() {
  return uniqueValidQuizIds(getStoredIds(LIBRARY_STORAGE_KEY));
}

function setLibraryIds(ids) {
  localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(uniqueValidQuizIds(ids)));
}

function addQuizToLibrary(quizId) {
  const libraryIds = getLibraryIds();
  if (!libraryIds.includes(quizId)) {
    libraryIds.push(quizId);
    setLibraryIds(libraryIds);
  }
}

function removeQuizFromLibrary(quizId) {
  setLibraryIds(getLibraryIds().filter((id) => id !== quizId));
}

function syncAutoAddedQuizzes() {
  const alreadyAutoAdded = new Set(getStoredIds(AUTO_ADDED_STORAGE_KEY));
  const libraryIds = getLibraryIds();
  let changed = false;

  getAllQuizzes().forEach((quiz) => {
    if (quiz.autoAddToLibrary && !alreadyAutoAdded.has(quiz.id)) {
      alreadyAutoAdded.add(quiz.id);
      if (!libraryIds.includes(quiz.id)) {
        libraryIds.push(quiz.id);
      }
      changed = true;
    }
  });

  if (changed) {
    setLibraryIds(libraryIds);
    localStorage.setItem(AUTO_ADDED_STORAGE_KEY, JSON.stringify([...alreadyAutoAdded]));
  }
}

function getLibraryQuizzes() {
  const libraryIdSet = new Set(getLibraryIds());
  return getAllQuizzes().filter((quiz) => libraryIdSet.has(quiz.id));
}

function getMarketplaceQuizzes() {
  const libraryIdSet = new Set(getLibraryIds());
  return getAllQuizzes().filter((quiz) => !libraryIdSet.has(quiz.id));
}

function getQuizProgressFromStats(quiz) {
  const stats = getStats();
  const quizStats = stats[quiz.id] || { bestScore: 0, plays: 0, history: [] };
  return {
    bestScore: quizStats.bestScore || 0,
    plays: quizStats.plays || 0,
    total: quiz.answers.length,
    percentage: quiz.answers.length ? Math.round(((quizStats.bestScore || 0) / quiz.answers.length) * 100) : 0,
    history: quizStats.history || []
  };
}

function getOverallProgress(quizList = getAllQuizzes()) {
  const stats = getStats();
  const totalAnswers = quizList.reduce((sum, quiz) => sum + quiz.answers.length, 0);
  const totalBest = quizList.reduce((sum, quiz) => sum + ((stats[quiz.id] && stats[quiz.id].bestScore) || 0), 0);
  const totalPlays = quizList.reduce((sum, quiz) => sum + ((stats[quiz.id] && stats[quiz.id].plays) || 0), 0);
  return {
    totalAnswers,
    totalBest,
    totalPlays,
    percentage: totalAnswers ? Math.round((totalBest / totalAnswers) * 100) : 0
  };
}

function createQuizCardMarkup(quiz, options = {}) {
  const progress = getQuizProgressFromStats(quiz);
  const actionHtml = options.actionHtml || "";
  const href = options.href || `quiz.html?id=${quiz.id}`;

  return `
    <article class="quiz-card quiz-row-card">
      <a class="quiz-card-link quiz-row-link" href="${href}">
        <div class="quiz-row-main">
          <h3>${quiz.title}</h3>
          <p>${quiz.description || "Timed text-input quiz."}</p>
          ${quiz.createdByName ? `<p class="subtle">Created by ${quiz.createdByName}</p>` : ""}        </div>
        <div class="quiz-row-stats">
          <span class="quiz-row-stat"><strong>${quiz.answers.length}</strong><small>Answers</small></span>
          <span class="quiz-row-stat"><strong>${quiz.timeLimit}s</strong><small>Timer</small></span>
          <span class="quiz-row-stat"><strong>${progress.bestScore}</strong><small>Best</small></span>
          <span class="quiz-row-stat"><strong>${progress.plays}</strong><small>Played</small></span>
        </div>
      </a>
      ${actionHtml ? `<div class="quiz-card-actions">${actionHtml}</div>` : ""}
    </article>
  `;
}

function attachLibraryActionHandlers(scope = document) {
  scope.querySelectorAll("[data-add-quiz]").forEach((button) => {
    button.addEventListener("click", () => {
      addQuizToLibrary(button.dataset.addQuiz);
      initPage();
    });
  });

  scope.querySelectorAll("[data-remove-quiz]").forEach((button) => {
    button.addEventListener("click", () => {
      removeQuizFromLibrary(button.dataset.removeQuiz);
      initPage();
    });
  });
}

function renderHomePage() {
  const categoryGrid = document.getElementById("categoryGrid");
  const progressText = document.getElementById("overallProgressText");
  const progressBar = document.getElementById("overallProgressBar");
  const overallStats = document.getElementById("overallStats");
  const homeCategorySummary = document.getElementById("homeCategorySummary");

  if (!categoryGrid) return;

  const libraryQuizzes = getLibraryQuizzes();
  const overall = getOverallProgress(libraryQuizzes);

  progressText.textContent = `${overall.percentage}%`;
  progressBar.style.width = `${overall.percentage}%`;

  overallStats.innerHTML = `
    <div class="overview-card"><span>Total answers</span><strong>${overall.totalBest} / ${overall.totalAnswers}</strong></div>
    <div class="overview-card"><span>Total plays</span><strong>${overall.totalPlays}</strong></div>
    <div class="overview-card"><span>Quizzes in library</span><strong>${libraryQuizzes.length}</strong></div>
  `;

  const categoriesInLibrary = quizCategories
    .map((category) => ({
      category,
      quizzes: libraryQuizzes.filter((quiz) => quiz.categoryId === category.id)
    }))
    .filter((entry) => entry.quizzes.length > 0);

  homeCategorySummary.textContent = libraryQuizzes.length
    ? `${categoriesInLibrary.length} categories in your library`
    : "Library is empty";

  if (!libraryQuizzes.length) {
    categoryGrid.innerHTML = `
      <div class="empty-state panel-like-empty">
        <h3>Library is empty.</h3>
        <a class="primary-link inline-action-link" href="add-quizzes.html">Go to Add Quizzes</a>
      </div>
    `;
    return;
  }

  categoryGrid.innerHTML = categoriesInLibrary.map(({ category, quizzes: categoryQuizzes }) => {
    const bestInCategory = categoryQuizzes.reduce((sum, quiz) => sum + getQuizProgressFromStats(quiz).bestScore, 0);
    const totalInCategory = categoryQuizzes.reduce((sum, quiz) => sum + quiz.answers.length, 0);
    const percentage = totalInCategory ? Math.round((bestInCategory / totalInCategory) * 100) : 0;
    return `
      <a class="category-card" href="category.html?category=${encodeURIComponent(category.id)}">
        <div class="card-top">
          <div>
            <h3>${category.title}</h3>
            <p>${category.description || "Library category"}</p>
          </div>
        </div>
        <div class="card-meta">
          <span class="meta-pill">${categoryQuizzes.length} quizzes</span>
          <span class="meta-pill">${percentage}% complete</span>
        </div>
      </a>
    `;
  }).join("");
}


function attachEditQuizHandlers(scope = document) {
  scope.querySelectorAll("[data-edit-quiz]").forEach((button) => {
    button.addEventListener("click", () => {
      goToQuizEditor(button.dataset.editQuiz);
    });
  });
}

function attachMarketplaceDeleteHandlers(scope = document) {
  scope.querySelectorAll("[data-delete-quiz]").forEach((button) => {
    button.addEventListener("click", () => {
      const quizId = button.dataset.deleteQuiz;
      const password = window.prompt("Enter the delete password to remove this quiz.");
      if (password === null) return;
      if (password !== DELETE_QUIZ_PASSWORD) {
        window.alert("Incorrect password. Quiz was not deleted.");
        return;
      }
      deleteQuizFromCatalogue(quizId);
      initPage();
    });
  });
}

function renderMarketplacePage() {
  const list = document.getElementById("marketplaceQuizList");
  const searchInput = document.getElementById("marketplaceSearchInput");
  const categoryFilter = document.getElementById("marketplaceCategoryFilter");
  const summary = document.getElementById("marketplaceSummary");
  if (!list || !searchInput || !categoryFilter) return;

  categoryFilter.innerHTML = [
    '<option value="all">All categories</option>',
    ...quizCategories.map((category) => `<option value="${category.id}">${category.title}</option>`)
  ].join("");

  function draw() {
    const searchTerm = normaliseText(searchInput.value || "");
    const selectedCategory = categoryFilter.value;

    const filtered = getMarketplaceQuizzes().filter((quiz) => {
      const matchesCategory = selectedCategory === "all" || quiz.categoryId === selectedCategory;
      const searchableText = normaliseText(`${quiz.title} ${quiz.description || ""}`);
      const matchesSearch = !searchTerm || searchableText.includes(searchTerm);
      return matchesCategory && matchesSearch;
    });

    summary.textContent = `${filtered.length} available quiz${filtered.length === 1 ? "" : "zes"}`;

    if (!filtered.length) {
      list.innerHTML = `
        <div class="empty-state panel-like-empty">
          <h3>No quizzes match your filters.</h3>
          <p>Try another category or search term. If you already added everything, your catalogue is currently empty.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = filtered.map((quiz) => createQuizCardMarkup(quiz, {
      actionHtml: `
        <button class="primary-link add-remove-button" type="button" data-add-quiz="${quiz.id}">Add to library</button>
        ${isEditableQuiz(quiz.id) ? `<button class="ghost-button add-remove-button" type="button" data-edit-quiz="${quiz.id}">Edit</button>` : ""}
        <button class="ghost-button danger-button add-remove-button" type="button" data-delete-quiz="${quiz.id}">Delete</button>
      `
    })).join("");

    attachLibraryActionHandlers(list);
    attachEditQuizHandlers(list);
    attachMarketplaceDeleteHandlers(list);
  }

  searchInput.addEventListener("input", draw);
  categoryFilter.addEventListener("change", draw);
  draw();
}

function renderCategoryPage() {
  const params = new URLSearchParams(window.location.search);
  const categoryId = params.get("category");
  const category = getCategoryById(categoryId) || quizCategories[0];
  const list = document.getElementById("quizList");
  if (!list) return;

  document.getElementById("categoryLabel").textContent = "Category";
  document.getElementById("categoryTitle").textContent = category.title;
  document.getElementById("categoryDescription").textContent = category.description || "";
  document.title = `${category.title} | Quiz Site`;

  const categoryQuizzes = getLibraryQuizzes().filter((quiz) => quiz.categoryId === category.id);
  if (!categoryQuizzes.length) {
    list.innerHTML = `
      <div class="empty-state panel-like-empty">
        <h3>No quizzes from this category are in your library.</h3>
        <p>Add a quiz from the catalogue to make this category appear again.</p>
        <a class="primary-link inline-action-link" href="add-quizzes.html">Add Quizzes</a>
      </div>
    `;
    return;
  }

  list.innerHTML = categoryQuizzes.map((quiz) => createQuizCardMarkup(quiz, {
    actionHtml: `
      ${isEditableQuiz(quiz.id) ? `<button class="ghost-button add-remove-button" type="button" data-edit-quiz="${quiz.id}">Edit</button>` : ""}
      <button class="ghost-button add-remove-button" type="button" data-remove-quiz="${quiz.id}">Remove</button>
    `
  })).join("");

  attachLibraryActionHandlers(list);
  attachEditQuizHandlers(list);
}

function renderQuizPage() {
  const params = new URLSearchParams(window.location.search);
  const quizId = params.get("id");
  const quiz = getQuizById(quizId) || quizzes[0];
  if (!quiz) return;

  const category = getCategoryById(quiz.categoryId);
  const answerForm = document.getElementById("answerForm");
  const answerInput = document.getElementById("answerInput");
  const foundAnswers = document.getElementById("foundAnswers");
  const correctCount = document.getElementById("correctCount");
  const totalCount = document.getElementById("totalCount");
  const remainingCount = document.getElementById("remainingCount");
  const progressBar = document.getElementById("quizProgressBar");
  const timerDisplay = document.getElementById("timerDisplay");
  const bestScore = document.getElementById("bestScore");
  const timesPlayed = document.getElementById("timesPlayed");
  const startBtn = document.getElementById("startBtn");
  const endBtn = document.getElementById("endBtn");
  const labelLayer = document.getElementById("labelLayer");
  const quizImage = document.getElementById("quizImage");
  const mapQuizSection = document.getElementById("mapQuizSection");
  const tableQuizSection = document.getElementById("tableQuizSection");
  const quizTable = document.getElementById("quizTable");
  const pauseBtn = document.getElementById("pauseBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const pauseOverlay = document.getElementById("pauseOverlay");

  document.getElementById("quizCategory").textContent = category ? category.title : "Quiz";
  document.getElementById("quizTitle").textContent = quiz.title;
  document.getElementById("quizDescription").textContent = quiz.description || "";
  document.getElementById("quizBackLink").href = `category.html?category=${encodeURIComponent(quiz.categoryId)}`;
  document.title = `${quiz.title} | Quiz Site`;
  const quizType = quiz.type || "map";
  const isTableQuiz = quizType === "table";

  if (mapQuizSection) mapQuizSection.classList.toggle("hidden", isTableQuiz);
  if (tableQuizSection) tableQuizSection.classList.toggle("hidden", !isTableQuiz);

  if (quizImage && !isTableQuiz) {
    quizImage.src = quiz.image || quiz.imagePath || "";
    quizImage.alt = quiz.title;
  }

  const progress = getQuizProgressFromStats(quiz);
  bestScore.textContent = progress.bestScore;
  timesPlayed.textContent = progress.plays;
  totalCount.textContent = quiz.answers.length;

  let found = [];
  let timeLeft = quiz.timeLimit;
  let timer = null;
  let started = false;
  let finished = false;
  let paused = false;

  const answerMap = new Map();
  quiz.answers.forEach((entry) => {
    const variants = [entry.answer, ...(entry.aliases || [])].map(normaliseText);
    variants.forEach((variant) => answerMap.set(variant, entry.answer));
  });

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function updateDisplay() {
    correctCount.textContent = found.length;
    remainingCount.textContent = `${quiz.answers.length - found.length} remaining`;

    const percentage = quiz.answers.length ? Math.round((found.length / quiz.answers.length) * 100) : 0;
    progressBar.style.width = `${percentage}%`;

    foundAnswers.innerHTML = found.length
      ? found
          .slice()
          .sort((a, b) => a.localeCompare(b))
          .map((answer) => `<span class="found-pill">${answer}</span>`)
          .join("")
      : `<div class="empty-state">No correct answers yet.</div>`;

    if (isTableQuiz && quizTable) {
      const selectedColumns = Math.min(8, Math.max(1, Number(quiz.tableColumns) || 2));
      const totalAnswers = quiz.answers.length || 1;
      const rowsNeeded = Math.ceil(totalAnswers / selectedColumns);
      const shouldUseCompactCells = totalAnswers >= 120 || rowsNeeded >= 16;
      const shouldUseTinyCells = totalAnswers >= 220 || rowsNeeded >= 28;

      quizTable.style.setProperty("--quiz-table-columns", selectedColumns);
      quizTable.classList.toggle("compact-table", shouldUseCompactCells);
      quizTable.classList.toggle("tiny-table", shouldUseTinyCells);

      const columnFirstAnswers = [];

      for (let row = 0; row < rowsNeeded; row += 1) {
        for (let column = 0; column < selectedColumns; column += 1) {
          const answerIndex = column * rowsNeeded + row;
          if (answerIndex < quiz.answers.length) {
            columnFirstAnswers.push(quiz.answers[answerIndex]);
          }
        }
      }

      quizTable.innerHTML = columnFirstAnswers.map((entry) => {
        const isFound = found.includes(entry.answer);
        const showAnswer = isFound || finished;
        const answerClass = isFound ? "table-answer-cell found" : (finished ? "table-answer-cell missed" : "table-answer-cell");
        const hintText = entry.hint || "";

        return `
          <div class="table-answer-pair">
            <div class="table-hint-cell">${hintText}</div>
            <div class="${answerClass}">${showAnswer ? entry.answer : ""}</div>
          </div>
        `;
      }).join("");
      if (labelLayer) labelLayer.innerHTML = "";
      return;
    }

    labelLayer.innerHTML = quiz.answers
      .map((entry) => {
        if (typeof entry.x !== "number" || typeof entry.y !== "number") return "";

        const isFound = found.includes(entry.answer);
        const labelSize = typeof entry.labelSize === "number" ? entry.labelSize : 12;
        const dotSize = typeof entry.dotSize === "number" ? entry.dotSize : 10;
        const placeholderSize = typeof entry.placeholderSize === "number"
          ? entry.placeholderSize
          : (typeof quiz.placeholderSize === "number" ? quiz.placeholderSize : 18);
        const placeholderImage = quiz.placeholderImage || "assets/placeholder.png";

        if (!isFound && !finished) {
          return `
            <img
              class="map-placeholder-image"
              src="${placeholderImage}"
              alt=""
              style="left:${entry.x}%; top:${entry.y}%; --quiz-placeholder-size:${placeholderSize}px;"
            />
          `;
        }

        const labelClass = isFound ? "map-label" : "map-label missed-answer";

        return `
          <div
            class="${labelClass}"
            style="left:${entry.x}%; top:${entry.y}%; --quiz-label-size:${labelSize}px; --quiz-dot-size:${dotSize}px;"
          >
            ${entry.answer}
          </div>
        `;
      })
      .join("");
  }

  function showAnswerBox() {
    startBtn.style.display = "none";
    answerForm.classList.add("active");
  }

  function showPlayButton() {
    startBtn.style.display = "block";
    answerForm.classList.remove("active");
  }

  function finishQuiz(reason) {
    if (finished) return;

    finished = true;
    started = false;
    clearInterval(timer);

    answerInput.disabled = true;
    showPlayButton();

    startBtn.disabled = false;
    endBtn.disabled = true;
    pauseBtn.disabled = true;
    pauseOverlay.classList.add("hidden");
    paused = false;

    const stats = getStats();
    const current = stats[quiz.id] || { bestScore: 0, plays: 0, history: [] };
    current.plays += 1;
    current.bestScore = Math.max(current.bestScore, found.length);
    current.history = [...(current.history || []), found.length].slice(-20);
    stats[quiz.id] = current;
    setStats(stats);

    bestScore.textContent = current.bestScore;
    timesPlayed.textContent = current.plays;
    updateDisplay();
  }

  function startQuiz() {
    clearInterval(timer);

    found = [];
    timeLeft = quiz.timeLimit;
    started = true;
    finished = false;

    answerInput.disabled = false;
    startBtn.disabled = true;
    endBtn.disabled = false;
    pauseBtn.disabled = false;

    showAnswerBox();

    answerInput.value = "";
    answerInput.focus();

    updateDisplay();
    timerDisplay.textContent = formatTime(timeLeft);

    timer = setInterval(() => {
      timeLeft -= 1;
      timerDisplay.textContent = formatTime(timeLeft);

      if (timeLeft <= 0) {
        finishQuiz("time");
      }
    }, 1000);
  }

  function tryAnswer(rawValue) {
    if (!started || finished) return;

    const rawAnswer = rawValue.trim();
    const cleaned = normaliseText(rawAnswer);
    if (!cleaned) return;

    const matchedAnswer = answerMap.get(cleaned);

    if (!matchedAnswer) {
      return;
    }

    if (found.includes(matchedAnswer)) {
      return;
    }

    found.push(matchedAnswer);
    answerInput.value = "";
    updateDisplay();

    if (found.length === quiz.answers.length) {
      finishQuiz("complete");
    }
  }

  answerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    tryAnswer(answerInput.value);
  });

  answerInput.addEventListener("input", function () {
    const currentValue = answerInput.value;
    tryAnswer(currentValue);
  });

  startBtn.addEventListener("click", startQuiz);

  endBtn.addEventListener("click", () => {
    if (!started || finished) return;
    finishQuiz("manual");
  });
  pauseBtn.addEventListener("click", () => {
  if (!started || finished || paused) return;

  paused = true;
  clearInterval(timer);
  pauseOverlay.classList.remove("hidden");
  });

  resumeBtn.addEventListener("click", () => {
    if (!paused) return;

    paused = false;
    pauseOverlay.classList.add("hidden");

    timer = setInterval(() => {
      timeLeft -= 1;
      timerDisplay.textContent = formatTime(timeLeft);

      if (timeLeft <= 0) {
        finishQuiz("time");
      }
    }, 1000);
  });

  showPlayButton();
  answerInput.disabled = true;

  timerDisplay.textContent = formatTime(timeLeft);
  updateDisplay();
}

async function initPage() {
  await loadSharedQuizzes();

  syncAutoAddedQuizzes();

  const page = document.body.dataset.page;

  if (page === "home") renderHomePage();
  if (page === "marketplace") renderMarketplacePage();
  if (page === "category") renderCategoryPage();
  if (page === "quiz") renderQuizPage();
}

initPage();
 
