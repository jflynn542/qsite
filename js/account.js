import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const STATS_STORAGE_KEY = "quizHubStats";
const accountBox = document.getElementById("accountBox");
const logoutBtn = document.getElementById("logoutBtn");

function getStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function formatStatTime(seconds) {
  if (!Number.isFinite(Number(seconds))) return "--";
  const totalSeconds = Math.max(0, Math.floor(Number(seconds)));
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function getQuizTitle(quizId, fallback = "Unknown quiz") {
  if (typeof quizzes === "undefined") return fallback;
  const quiz = quizzes.find((item) => item.id === quizId);
  return quiz ? quiz.title : fallback;
}

function getAccountStats() {
  const stats = getStats();
  const quizEntries = Object.entries(stats).filter(([quizId, value]) => !quizId.startsWith("__") && value && typeof value === "object");
  const totalPlays = quizEntries.reduce((sum, [, value]) => sum + (Number(value.plays) || 0), 0);
  const quizzesWithPlays = quizEntries.filter(([, value]) => (Number(value.plays) || 0) > 0).length;
  const bestScores = quizEntries
    .map(([quizId, value]) => ({
      quizId,
      title: getQuizTitle(quizId, quizId),
      bestScore: Number(value.bestScore) || 0,
      bestTimeTaken: Number.isFinite(Number(value.bestTimeTaken)) ? Number(value.bestTimeTaken) : null,
      plays: Number(value.plays) || 0
    }))
    .filter((item) => item.plays > 0)
    .sort((a, b) => b.bestScore - a.bestScore || a.bestTimeTaken - b.bestTimeTaken)
    .slice(0, 5);

  const recentPlays = Array.isArray(stats.__recentPlays) ? stats.__recentPlays.slice(0, 5) : [];

  return { totalPlays, quizzesWithPlays, bestScores, recentPlays };
}

function renderRecentPlays(recentPlays) {
  if (!recentPlays.length) {
    return `<div class="empty-state">No quizzes played yet.</div>`;
  }

  return recentPlays.map((play) => `
    <a class="account-list-row" href="quiz.html?id=${encodeURIComponent(play.quizId)}">
      <span>
        <strong>${play.title || getQuizTitle(play.quizId, play.quizId)}</strong>
        <small>${play.playedAt ? new Date(play.playedAt).toLocaleString() : "Recently played"}</small>
      </span>
      <b>${Number(play.score) || 0} / ${Number(play.total) || 0}</b>
    </a>
  `).join("");
}

function renderBestScores(bestScores) {
  if (!bestScores.length) {
    return `<div class="empty-state">No best scores yet.</div>`;
  }

  return bestScores.map((score) => `
    <a class="account-list-row" href="quiz.html?id=${encodeURIComponent(score.quizId)}">
      <span>
        <strong>${score.title}</strong>
        <small>${score.plays} play${score.plays === 1 ? "" : "s"}</small>
      </span>
      <b>${score.bestScore}${score.bestTimeTaken !== null ? ` · ${formatStatTime(score.bestTimeTaken)}` : ""}</b>
    </a>
  `).join("");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await setDoc(userRef, {
      name: user.displayName,
      email: user.email,
      photo: user.photoURL,
      createdAt: new Date().toISOString()
    });
  }

  const accountStats = getAccountStats();

  accountBox.innerHTML = `
    <div class="account-profile-card">
      <img src="${user.photoURL || ""}" width="80" alt="Profile photo">
      <div>
        <h2>${user.displayName || "Signed in user"}</h2>
        <p>${user.email || ""}</p>
      </div>
    </div>

    <div class="account-stat-grid">
      <div class="overview-card"><span>Total plays</span><strong>${accountStats.totalPlays}</strong></div>
      <div class="overview-card"><span>Quizzes played</span><strong>${accountStats.quizzesWithPlays}</strong></div>
    </div>

    <div class="account-section-grid">
      <section class="account-section-card">
        <h3>Recently played</h3>
        <div class="account-list">${renderRecentPlays(accountStats.recentPlays)}</div>
      </section>

      <section class="account-section-card">
        <h3>Best scores</h3>
        <div class="account-list">${renderBestScores(accountStats.bestScores)}</div>
      </section>
    </div>
  `;
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
