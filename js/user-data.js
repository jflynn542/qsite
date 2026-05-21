import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// These are only here so old browser-stored data can be removed.
// User-specific website data should now come from Firestore only.
const LEGACY_LOCAL_KEYS = [
  "quizHubStats",
  "quizHubLibrary",
  "quizHubAutoAdded",
  "quizHubDeletedQuizzes",
  "quizHubBuilderDraft",
  "quizHubCustomQuizzes",
  "quizHubPlaylists"
];

const DEFAULT_DATA = {
  stats: {},
  libraryIds: [],
  autoAddedIds: [],
  deletedQuizIds: [],
  builderDraft: null,
  customQuizzes: [],
  playlists: []
};

let currentUser = null;
let userData = cloneDefaultData();
let loaded = false;
let loadPromise = null;
let saveTimer = null;

function cloneDefaultData() {
  return {
    stats: {},
    libraryIds: [],
    autoAddedIds: [],
    deletedQuizIds: [],
    builderDraft: null,
    customQuizzes: [],
    playlists: []
  };
}

function clearLegacyLocalStorage() {
  try {
    LEGACY_LOCAL_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore storage errors. The site must still work from Firestore.
  }
}

function uniqueArray(value) {
  return Array.isArray(value) ? [...new Set(value.filter(Boolean))] : [];
}

function normaliseUserData(data = {}) {
  return {
    stats: data.stats && typeof data.stats === "object" ? data.stats : {},
    libraryIds: uniqueArray(data.libraryIds),
    autoAddedIds: uniqueArray(data.autoAddedIds),
    deletedQuizIds: uniqueArray(data.deletedQuizIds),
    builderDraft: data.builderDraft && typeof data.builderDraft === "object" ? data.builderDraft : null,
    customQuizzes: Array.isArray(data.customQuizzes) ? data.customQuizzes : [],
    playlists: Array.isArray(data.playlists) ? data.playlists : []
  };
}

function waitForAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

// If the Firebase auth user changes while the page is open, immediately drop
// the old in-memory data so it cannot be shown under another account.
onAuthStateChanged(auth, (user) => {
  const oldUid = currentUser?.uid || null;
  const newUid = user?.uid || null;

  if (loaded && oldUid !== newUid) {
    clearTimeout(saveTimer);
    currentUser = user || null;
    userData = cloneDefaultData();
    loaded = false;
    loadPromise = null;
    clearLegacyLocalStorage();
  }
});

async function saveNow() {
  clearLegacyLocalStorage();

  // Signed-out data should not be persisted anywhere. This prevents the next
  // signed-in account from inheriting saved quizzes, stats, or draft data.
  if (!currentUser) return;

  const userRef = doc(db, "users", currentUser.uid);
  await setDoc(userRef, {
    name: currentUser.displayName || "",
    email: currentUser.email || "",
    photo: currentUser.photoURL || "",
    stats: userData.stats || {},
    libraryIds: uniqueArray(userData.libraryIds),
    autoAddedIds: uniqueArray(userData.autoAddedIds),
    deletedQuizIds: uniqueArray(userData.deletedQuizIds),
    builderDraft: userData.builderDraft || null,
    customQuizzes: Array.isArray(userData.customQuizzes) ? userData.customQuizzes : [],
    playlists: Array.isArray(userData.playlists) ? userData.playlists : [],
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveNow().catch((error) => console.error("Could not save user data:", error));
  }, 250);
}

export async function loadUserData() {
  if (loaded) return userData;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    clearLegacyLocalStorage();
    currentUser = await waitForAuth();

    if (!currentUser) {
      userData = cloneDefaultData();
      loaded = true;
      return userData;
    }

    try {
      const userRef = doc(db, "users", currentUser.uid);
      const snap = await getDoc(userRef);
      userData = snap.exists() ? normaliseUserData(snap.data()) : cloneDefaultData();
    } catch (error) {
      console.error("Could not load account data from Firestore:", error);
      userData = cloneDefaultData();
    }

    loaded = true;
    return userData;
  })();

  return loadPromise;
}

export function getCurrentAccountUser() {
  return currentUser;
}

export function isUserDataCloudBacked() {
  return Boolean(currentUser);
}

export function getStatsData() {
  return userData.stats || {};
}

export function setStatsData(stats) {
  userData.stats = stats && typeof stats === "object" ? stats : {};
  queueSave();
}

export function getIdList(name) {
  return uniqueArray(userData[name]);
}

export function setIdList(name, ids) {
  userData[name] = uniqueArray(ids);
  queueSave();
}

export function getBuilderDraft() {
  return userData.builderDraft || null;
}

export function setBuilderDraft(draft) {
  userData.builderDraft = draft && typeof draft === "object" ? draft : null;
  queueSave();
}

export async function flushUserData() {
  clearTimeout(saveTimer);
  await saveNow();
}

export function getCustomQuizzesData() {
  return Array.isArray(userData.customQuizzes) ? userData.customQuizzes : [];
}

export function setCustomQuizzesData(customQuizzes) {
  userData.customQuizzes = Array.isArray(customQuizzes) ? customQuizzes : [];
  queueSave();
}

export function getPlaylistsData() {
  return Array.isArray(userData.playlists) ? userData.playlists : [];
}

export function setPlaylistsData(playlists) {
  userData.playlists = Array.isArray(playlists) ? playlists : [];
  queueSave();
}
