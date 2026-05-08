import { loadUserData, getStatsData, setStatsData, getIdList, setIdList, getCustomQuizzesData, setCustomQuizzesData } from "./js/user-data.js";

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
  return getStatsData();
}

function setStats(stats) {
  setStatsData(stats);
}


function formatStatTime(seconds) {
  if (!Number.isFinite(Number(seconds))) return "--";
  const totalSeconds = Math.max(0, Math.floor(Number(seconds)));
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function normaliseHistoryItem(item, index = 0) {
  if (typeof item === "number") {
    return {
      score: item,
      timeTaken: null,
      playedAt: null,
      playNumber: index + 1
    };
  }

  return {
    score: Number(item?.score) || 0,
    timeTaken: Number.isFinite(Number(item?.timeTaken)) ? Number(item.timeTaken) : null,
    playedAt: item?.playedAt || null,
    reason: item?.reason || "",
    playNumber: index + 1
  };
}

function getQuizStatsRecord(quizId) {
  const stats = getStats();
  const current = stats[quizId] || { bestScore: 0, plays: 0, history: [] };
  const history = Array.isArray(current.history) ? current.history.map(normaliseHistoryItem) : [];
  return {
    bestScore: Number(current.bestScore) || 0,
    bestTimeTaken: Number.isFinite(Number(current.bestTimeTaken)) ? Number(current.bestTimeTaken) : null,
    plays: Number(current.plays) || history.length || 0,
    history,
    recentPlays: Array.isArray(current.recentPlays) ? current.recentPlays : []
  };
}

function buildMiniBarChart(items, getValue, options = {}) {
  const values = items.map((item) => Number(getValue(item)) || 0);
  const maxValue = Math.max(1, options.maxValue || 0, ...values);
  if (!items.length) return `<div class="empty-state">No plays yet.</div>`;

  return items.map((item, index) => {
    const value = values[index];
    const height = Math.max(8, Math.round((value / maxValue) * 100));
    const label = options.getLabel ? options.getLabel(item, index) : value;
    const title = options.getTitle ? options.getTitle(item, index) : label;
    return `<span class="mini-chart-bar" style="height:${height}%" title="${title}"><small>${label}</small></span>`;
  }).join("");
}

async function saveLeaderboardScore(quiz, score, timeTaken) {
  try {
    const { auth, db } = await import("./js/firebase-config.js");
    const user = auth.currentUser;
    if (!user) return;

    const { doc, getDoc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const scoreRef = doc(db, "quizLeaderboards", quiz.id, "scores", user.uid);
    const scoreSnap = await getDoc(scoreRef);
    const old = scoreSnap.exists() ? scoreSnap.data() : null;

    const oldScore = Number(old?.score) || 0;
    const oldTime = Number.isFinite(Number(old?.timeTaken)) ? Number(old.timeTaken) : null;
    const shouldUpdate = !old || score > oldScore || (score === oldScore && (oldTime === null || timeTaken < oldTime));

    if (!shouldUpdate) return;

    await setDoc(scoreRef, {
      quizId: quiz.id,
      quizTitle: quiz.title,
      userId: user.uid,
      name: user.displayName || user.email || "Anonymous",
      email: user.email || "",
      photo: user.photoURL || "",
      score,
      total: quiz.answers.length,
      timeTaken,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("Could not save leaderboard score:", error);
  }
}

async function loadLeaderboard(quiz) {
  const leaderboardList = document.getElementById("leaderboardList");

  try {
    const { db } = await import("./js/firebase-config.js");
    const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

    // Read scores first, then sort in JavaScript.
    // This avoids the Firestore composite index problem caused by ordering by score + timeTaken together.
    const snapshot = await getDocs(collection(db, "quizLeaderboards", quiz.id, "scores"));
    const rows = snapshot.docs
      .map((doc) => doc.data())
      .sort((a, b) => {
        const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return (Number(a.timeTaken) || Number.MAX_SAFE_INTEGER) - (Number(b.timeTaken) || Number.MAX_SAFE_INTEGER);
      })
      .slice(0, 10);

    if (leaderboardList) {
      if (!rows.length) {
        leaderboardList.innerHTML = `<div class="empty-state">No leaderboard scores yet.</div>`;
      } else {
        leaderboardList.innerHTML = rows.map((row, index) => `
          <div class="leaderboard-row">
            <span class="leaderboard-rank">#${index + 1}</span>
            <span class="leaderboard-name">${row.name || "Anonymous"}</span>
            <strong>${Number(row.score) || 0} / ${Number(row.total) || quiz.answers.length}</strong>
            <small>${formatStatTime(row.timeTaken)}</small>
          </div>
        `).join("");
      }
    }

    return rows;
  } catch (error) {
    console.error("Could not load leaderboard:", error);
    if (leaderboardList) {
      leaderboardList.innerHTML = `<div class="empty-state">Leaderboard unavailable. Check the browser console for the exact Firebase error.</div>`;
    }
    return [];
  }
}

function renderQuizPerformancePanel(quiz) {
  const highScoreText = document.getElementById("personalHighScoreText");
  const highScoreTime = document.getElementById("personalHighScoreTime");
  const scoreChart = document.getElementById("scoreProgressionChart");
  const playChart = document.getElementById("playHistoryChart");
  const scoreSummary = document.getElementById("scoreProgressionSummary");
  const playSummary = document.getElementById("playHistorySummary");
  if (!highScoreText || !scoreChart || !playChart) return;

  const record = getQuizStatsRecord(quiz.id);
  const recentHistory = record.history.slice(-12);

  highScoreText.textContent = `${record.bestScore} / ${quiz.answers.length}`;
  highScoreTime.textContent = record.bestTimeTaken !== null ? `Time: ${formatStatTime(record.bestTimeTaken)}` : "Time: --";
  scoreSummary.textContent = record.history.length ? `${record.history.length} recorded play${record.history.length === 1 ? "" : "s"}` : "No plays yet";
  playSummary.textContent = `${record.plays} total play${record.plays === 1 ? "" : "s"}`;

  scoreChart.innerHTML = buildMiniBarChart(recentHistory, (item) => item.score, {
    maxValue: quiz.answers.length,
    getLabel: (item) => item.score,
    getTitle: (item, index) => `Play ${record.history.length - recentHistory.length + index + 1}: ${item.score}/${quiz.answers.length}`
  });

  playChart.innerHTML = buildMiniBarChart(recentHistory, (_, index) => index + 1, {
    maxValue: Math.max(1, recentHistory.length),
    getLabel: (_, index) => index + 1,
    getTitle: (item, index) => `Play ${record.history.length - recentHistory.length + index + 1}${item.playedAt ? ` - ${new Date(item.playedAt).toLocaleDateString()}` : ""}`
  });
}

function getCustomQuizzes() {
  return getCustomQuizzesData();
}

function setCustomQuizzes(customQuizzes) {
  setCustomQuizzesData(customQuizzes);
}

function getDeletedQuizIds() {
  return getIdList("deletedQuizIds");
}

function setDeletedQuizIds(ids) {
  setIdList("deletedQuizIds", ids);
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
  const autoAdded = getIdList("autoAddedIds").filter((quizId) => quizId !== id);
  setIdList("autoAddedIds", autoAdded);
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

function uniqueValidQuizIds(ids) {
  return [...new Set(ids)].filter((id) => Boolean(getQuizById(id)));
}

function getLibraryIds() {
  return uniqueValidQuizIds(getIdList("libraryIds"));
}

function setLibraryIds(ids) {
  setIdList("libraryIds", uniqueValidQuizIds(ids));
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
  const alreadyAutoAdded = new Set(getIdList("autoAddedIds"));
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
    setIdList("autoAddedIds", [...alreadyAutoAdded]);
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
  const quizStats = getQuizStatsRecord(quiz.id);
  return {
    bestScore: quizStats.bestScore || 0,
    bestTimeTaken: quizStats.bestTimeTaken,
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
  const paceStatBox = document.getElementById("paceStatBox");
  const paceBoxLabel = document.getElementById("paceBoxLabel");
  const paceBoxSubtext = document.getElementById("paceBoxSubtext");
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
  renderQuizPerformancePanel(quiz);

  let globalPaceTarget = null;
  loadLeaderboard(quiz).then((rows) => {
    globalPaceTarget = Array.isArray(rows) && rows.length ? rows[0] : null;
    updatePaceTracker();
  });

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


  function setPaceBoxState(state) {
    if (!paceStatBox) return;
    paceStatBox.classList.remove("pace-good", "pace-bad", "pace-neutral");
    paceStatBox.classList.add(state);
  }

  function updatePaceTracker() {
    if (!timesPlayed || !paceBoxLabel) return;

    if (!started || finished) {
      paceBoxLabel.textContent = "Played";
      timesPlayed.textContent = getQuizStatsRecord(quiz.id).plays;
      if (paceBoxSubtext) paceBoxSubtext.textContent = globalPaceTarget
        ? `#1 pace: ${Number(globalPaceTarget.score) || 0} in ${formatStatTime(globalPaceTarget.timeTaken)}`
        : "No global high score yet";
      setPaceBoxState("pace-neutral");
      return;
    }

    const targetScore = Number(globalPaceTarget?.score) || 0;
    const targetTime = Number(globalPaceTarget?.timeTaken) || 0;

    if (!targetScore || !targetTime) {
      paceBoxLabel.textContent = "Pace";
      timesPlayed.textContent = "--";
      if (paceBoxSubtext) paceBoxSubtext.textContent = "No global target yet";
      setPaceBoxState("pace-neutral");
      return;
    }

    const elapsed = Math.max(0, quiz.timeLimit - timeLeft);
    const secondsPerAnswer = targetTime / targetScore;
    const expectedScoreNow = Math.min(targetScore, Math.floor(elapsed / secondsPerAnswer));
    const paceDifference = found.length - expectedScoreNow;

    paceBoxLabel.textContent = "Pace";
    timesPlayed.textContent = paceDifference >= 0 ? `+${paceDifference}` : `${paceDifference}`;
    if (paceBoxSubtext) paceBoxSubtext.textContent = `Target now: ${expectedScoreNow}`;
    setPaceBoxState(paceDifference >= 0 ? "pace-good" : "pace-bad");
  }

  function getMapCoordinate(entry, primaryKey, fallbackKeys = []) {
    const keys = [primaryKey, ...fallbackKeys];
    for (const key of keys) {
      if (entry[key] === undefined || entry[key] === null || entry[key] === "") continue;
      const value = Number(entry[key]);
      if (Number.isFinite(value)) return value;
    }
    return null;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function updateDisplay() {
    correctCount.textContent = found.length;
    updatePaceTracker();
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
      const columns = Math.min(8, Math.max(1, Number(quiz.tableColumns) || 2));
      const totalAnswers = quiz.answers.length;
      const rows = Math.max(1, Math.ceil(totalAnswers / columns));

      const fontSize = Math.max(7, Math.min(13, Math.floor(230 / rows)));
      const cellPadding = rows >= 28 ? 3 : rows >= 20 ? 4 : 6;

      quizTable.style.setProperty("--quiz-table-columns", columns);
      quizTable.style.setProperty("--quiz-table-rows", rows);
      quizTable.style.setProperty("--quiz-table-font-size", `${fontSize}px`);
      quizTable.style.setProperty("--quiz-table-cell-padding", `${cellPadding}px`);

      quizTable.innerHTML = Array.from({ length: columns }, (_, columnIndex) => {
        const startIndex = columnIndex * rows;
        const columnAnswers = quiz.answers.slice(startIndex, startIndex + rows);

        return `
          <div class="table-answer-column">
            ${columnAnswers.map((entry) => {
              const isFound = found.includes(entry.answer);
              const showAnswer = isFound || finished;
              const answerClass = isFound ? "table-answer-cell found" : (finished ? "table-answer-cell missed" : "table-answer-cell");
              const hintText = entry.hint || "";

              return `
                <div class="table-answer-pair">
                  <div class="table-hint-cell" title="${hintText}">${hintText}</div>
                  <div class="${answerClass}" title="${entry.answer}">${showAnswer ? entry.answer : ""}</div>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }).join("");

      if (labelLayer) labelLayer.innerHTML = "";
      return;
    }

    if (!labelLayer) return;

    labelLayer.style.position = "absolute";
    labelLayer.style.inset = "0";
    labelLayer.style.display = "block";
    labelLayer.style.pointerEvents = "none";
    labelLayer.style.zIndex = "20";

    const placeholderSize = Math.max(6, Number(quiz.placeholderSize) || 18);

    const mapAnswersWithCoordinates = quiz.answers
      .map((entry) => ({
        entry,
        x: getMapCoordinate(entry, "x", ["left", "coordX", "markerX"]),
        y: getMapCoordinate(entry, "y", ["top", "coordY", "markerY"])
      }))
      .filter((item) => item.x !== null && item.y !== null);

    if (!isTableQuiz && quiz.answers.length && !mapAnswersWithCoordinates.length) {
      console.warn(`No map marker coordinates found for quiz: ${quiz.id || quiz.title}. Each answer needs numeric x and y values.`);
    }

    labelLayer.innerHTML = mapAnswersWithCoordinates
      .map(({ entry, x, y }) => {
        const isFound = found.includes(entry.answer);
        const labelSize = typeof entry.labelSize === "number" ? entry.labelSize : 12;

        if (!isFound && !finished) {
          return `
            <span
              class="map-unanswered-marker"
              aria-label="Unanswered marker"
              title="Unanswered marker"
              style="left:${x}%; top:${y}%; --quiz-placeholder-size:${placeholderSize}px;"
            ></span>
          `;
        }

        const labelClass = isFound ? "map-label" : "map-label missed-answer";

        return `
          <div
            class="${labelClass}"
            style="left:${x}%; top:${y}%; --quiz-label-size:${labelSize}px;"
          >
            ${escapeHtml(entry.answer)}
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

    const score = found.length;
    const timeTaken = Math.max(0, quiz.timeLimit - timeLeft);
    const playedAt = new Date().toISOString();
    const stats = getStats();
    const current = getQuizStatsRecord(quiz.id);
    const previousBest = current.bestScore || 0;
    const previousBestTime = current.bestTimeTaken;
    const isNewBest = score > previousBest || (score === previousBest && (previousBestTime === null || timeTaken < previousBestTime));

    current.plays += 1;
    current.bestScore = isNewBest ? score : previousBest;
    current.bestTimeTaken = isNewBest ? timeTaken : previousBestTime;
    current.history = [...(current.history || []), { score, timeTaken, playedAt, reason }].slice(-50);
    current.recentPlays = [...(current.recentPlays || []), { quizId: quiz.id, title: quiz.title, score, total: quiz.answers.length, timeTaken, playedAt }].slice(-5);
    stats[quiz.id] = current;

    const globalRecent = Array.isArray(stats.__recentPlays) ? stats.__recentPlays : [];
    stats.__recentPlays = [{ quizId: quiz.id, title: quiz.title, score, total: quiz.answers.length, timeTaken, playedAt }, ...globalRecent]
      .filter((item, index, arr) => index === arr.findIndex((other) => other.quizId === item.quizId && other.playedAt === item.playedAt))
      .slice(0, 5);

    setStats(stats);

    bestScore.textContent = current.bestScore;
    timesPlayed.textContent = current.plays;
    updatePaceTracker();
    renderQuizPerformancePanel(quiz);
    saveLeaderboardScore(quiz, score, timeTaken).then(() => loadLeaderboard(quiz));
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
    updatePaceTracker();

    timer = setInterval(() => {
      timeLeft -= 1;
      timerDisplay.textContent = formatTime(timeLeft);
      updatePaceTracker();

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
      updatePaceTracker();

      if (timeLeft <= 0) {
        finishQuiz("time");
      }
    }, 1000);
  });

  showPlayButton();
  answerInput.disabled = true;

  timerDisplay.textContent = formatTime(timeLeft);
  updatePaceTracker();
  updateDisplay();
}

async function initPage() {
  await Promise.all([loadUserData(), loadSharedQuizzes()]);

  syncAutoAddedQuizzes();

  const page = document.body.dataset.page;

  if (page === "home") renderHomePage();
  if (page === "marketplace") renderMarketplacePage();
  if (page === "category") renderCategoryPage();
  if (page === "quiz") renderQuizPage();
}

initPage();
 
