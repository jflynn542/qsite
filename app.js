import { loadUserData, getStatsData, setStatsData, getIdList, setIdList, getCustomQuizzesData, setCustomQuizzesData, getPlaylistsData, setPlaylistsData } from "./js/user-data.js";

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


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createPlaylistId() {
  return `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getPlaylists() {
  return getPlaylistsData()
    .filter((playlist) => playlist && playlist.id && playlist.name)
    .map((playlist) => ({
      ...playlist,
      quizIds: uniqueValidQuizIds(Array.isArray(playlist.quizIds) ? playlist.quizIds : [])
    }));
}

function setPlaylists(playlists) {
  setPlaylistsData(playlists.map((playlist) => ({
    ...playlist,
    name: String(playlist.name || "Untitled playlist").trim() || "Untitled playlist",
    quizIds: uniqueValidQuizIds(Array.isArray(playlist.quizIds) ? playlist.quizIds : [])
  })));
}

function createPlaylist(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return;

  setPlaylists([
    ...getPlaylists(),
    {
      id: createPlaylistId(),
      name: cleanName,
      quizIds: [],
      createdAt: new Date().toISOString()
    }
  ]);
}

function deletePlaylist(playlistId) {
  setPlaylists(getPlaylists().filter((playlist) => playlist.id !== playlistId));
}

function addQuizToPlaylist(playlistId, quizId) {
  setPlaylists(getPlaylists().map((playlist) => {
    if (playlist.id !== playlistId) return playlist;
    return { ...playlist, quizIds: uniqueValidQuizIds([...(playlist.quizIds || []), quizId]) };
  }));
}

function removeQuizFromPlaylist(playlistId, quizId) {
  setPlaylists(getPlaylists().map((playlist) => {
    if (playlist.id !== playlistId) return playlist;
    return { ...playlist, quizIds: (playlist.quizIds || []).filter((id) => id !== quizId) };
  }));
}

function removeQuizFromAllPlaylists(quizId) {
  setPlaylists(getPlaylists().map((playlist) => ({
    ...playlist,
    quizIds: (playlist.quizIds || []).filter((id) => id !== quizId)
  })));
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
  removeQuizFromAllPlaylists(quizId);
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

function renderHomePlaylists(libraryQuizzes) {
  const playlistList = document.getElementById("playlistList");
  const playlistForm = document.getElementById("playlistForm");
  const playlistNameInput = document.getElementById("playlistNameInput");
  const playlistSummary = document.getElementById("playlistSummary");
  if (!playlistList) return;

  const playlists = getPlaylists();
  if (playlistSummary) {
    playlistSummary.textContent = playlists.length
      ? `${playlists.length} playlist${playlists.length === 1 ? "" : "s"}`
      : "No playlists yet";
  }

  if (playlistForm && !playlistForm.dataset.ready) {
    playlistForm.dataset.ready = "true";
    playlistForm.addEventListener("submit", (event) => {
      event.preventDefault();
      createPlaylist(playlistNameInput.value);
      playlistNameInput.value = "";
      renderHomePage();
    });
  }

  if (!playlists.length) {
    playlistList.innerHTML = `<div class="empty-state panel-like-empty"><h3>No playlists yet.</h3><p>Create a playlist to group your quizzes together.</p></div>`;
    return;
  }

  playlistList.innerHTML = playlists.map((playlist) => {
    const playlistQuizzes = playlist.quizIds.map(getQuizById).filter(Boolean);
    const playlistQuizIds = new Set(playlistQuizzes.map((quiz) => quiz.id));
    const addableQuizzes = libraryQuizzes.filter((quiz) => !playlistQuizIds.has(quiz.id));
    const progress = getOverallProgress(playlistQuizzes);

    return `
      <article class="playlist-card">
        <div class="playlist-card-head">
          <div>
            <h3>${escapeHtml(playlist.name)}</h3>
            <p>${playlistQuizzes.length} quiz${playlistQuizzes.length === 1 ? "" : "zes"} • ${progress.percentage}% complete</p>
          </div>
          <button class="ghost-button danger-button small-button" type="button" data-delete-playlist="${playlist.id}">Delete</button>
        </div>

        <div class="playlist-quiz-list">
          ${playlistQuizzes.length ? playlistQuizzes.map((quiz) => `
            <div class="playlist-quiz-row">
              <a href="quiz.html?id=${encodeURIComponent(quiz.id)}">${escapeHtml(quiz.title)}</a>
              <button class="ghost-button small-button" type="button" data-remove-playlist-quiz="${playlist.id}" data-quiz-id="${quiz.id}">Remove</button>
            </div>
          `).join("") : `<div class="empty-state">No quizzes in this playlist yet.</div>`}
        </div>

        <div class="playlist-add-row">
          <select data-playlist-select="${playlist.id}" ${addableQuizzes.length ? "" : "disabled"}>
            <option value="">${addableQuizzes.length ? "Add a quiz from your library" : "All library quizzes added"}</option>
            ${addableQuizzes.map((quiz) => `<option value="${quiz.id}">${escapeHtml(quiz.title)}</option>`).join("")}
          </select>
          <button class="primary-link small-button" type="button" data-add-playlist-quiz="${playlist.id}" ${addableQuizzes.length ? "" : "disabled"}>Add</button>
        </div>
      </article>
    `;
  }).join("");

  playlistList.querySelectorAll("[data-delete-playlist]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!window.confirm("Delete this playlist? The quizzes will stay in your library.")) return;
      deletePlaylist(button.dataset.deletePlaylist);
      renderHomePage();
    });
  });

  playlistList.querySelectorAll("[data-remove-playlist-quiz]").forEach((button) => {
    button.addEventListener("click", () => {
      removeQuizFromPlaylist(button.dataset.removePlaylistQuiz, button.dataset.quizId);
      renderHomePage();
    });
  });

  playlistList.querySelectorAll("[data-add-playlist-quiz]").forEach((button) => {
    button.addEventListener("click", () => {
      const select = playlistList.querySelector(`[data-playlist-select="${button.dataset.addPlaylistQuiz}"]`);
      if (!select || !select.value) return;
      addQuizToPlaylist(button.dataset.addPlaylistQuiz, select.value);
      renderHomePage();
    });
  });
}

function renderHomePage() {
  const categoryGrid = document.getElementById("categoryGrid");
  const progressText = document.getElementById("overallProgressText");
  const progressBar = document.getElementById("overallProgressBar");
  const overallStats = document.getElementById("overallStats");
  const homeCategorySummary = document.getElementById("homeCategorySummary");
  const recentQuizList = document.getElementById("recentQuizList");

  if (!categoryGrid) return;

  const libraryQuizzes = getLibraryQuizzes();
  renderHomePlaylists(libraryQuizzes);
  const libraryIdSet = new Set(libraryQuizzes.map((quiz) => quiz.id));
  const recentPlays = (Array.isArray(getStats().__recentPlays) ? getStats().__recentPlays : [])
    .filter((item) => libraryIdSet.has(item.quizId))
    .slice(0, 5);

  if (recentQuizList) {
    recentQuizList.innerHTML = recentPlays.length
      ? recentPlays.map((item) => {
          const quiz = getQuizById(item.quizId);
          if (!quiz) return "";
          return `
            <a class="recent-quiz-card" href="quiz.html?id=${encodeURIComponent(quiz.id)}">
              <div>
                <h3>${quiz.title}</h3>
                <p>${Number(item.score) || 0} / ${Number(item.total) || quiz.answers.length} in ${formatStatTime(item.timeTaken)}</p>
              </div>
              <span class="meta-pill">Play again</span>
            </a>
          `;
        }).join("")
      : `<div class="empty-state panel-like-empty"><h3>No recently played quizzes yet.</h3><p>Play a quiz and it will appear here.</p></div>`;
  }

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
  const summary = document.getElementById("marketplaceSumma
