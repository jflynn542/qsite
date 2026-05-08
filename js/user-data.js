import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const LOCAL_KEYS = {
  stats: "quizHubStats",
  libraryIds: "quizHubLibrary",
  autoAddedIds: "quizHubAutoAdded",
  deletedQuizIds: "quizHubDeletedQuizzes",
  builderDraft: "quizHubBuilderDraft",
  customQuizzes: "quizHubCustomQuizzes"
};

const DEFAULT_DATA = {
  stats: {},
  libraryIds: [],
  autoAddedIds: [],
  deletedQuizIds: [],
  builderDraft: null,
  customQuizzes: []
};

let currentUser = null;
let userData = { ...DEFAULT_DATA };
let loaded = false;
let loadPromise = null;
let saveTimer = null;

function readLocalJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try {
    if (value === null || typeof value === "undefined") {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Local fallback failed. Firestore will still be attempted for signed-in users.
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
    customQuizzes: Array.isArray(data.customQuizzes) ? data.customQuizzes : []
  };
}

function getLocalData() {
  return normaliseUserData({
    stats: readLocalJson(LOCAL_KEYS.stats, {}),
    libraryIds: readLocalJson(LOCAL_KEYS.libraryIds, []),
    autoAddedIds: readLocalJson(LOCAL_KEYS.autoAddedIds, []),
    deletedQuizIds: readLocalJson(LOCAL_KEYS.deletedQuizIds, []),
    builderDraft: readLocalJson(LOCAL_KEYS.builderDraft, null),
    customQuizzes: readLocalJson(LOCAL_KEYS.customQuizzes, [])
  });
}

function saveLocalMirror() {
  writeLocalJson(LOCAL_KEYS.stats, userData.stats || {});
  writeLocalJson(LOCAL_KEYS.libraryIds, userData.libraryIds || []);
  writeLocalJson(LOCAL_KEYS.autoAddedIds, userData.autoAddedIds || []);
  writeLocalJson(LOCAL_KEYS.deletedQuizIds, userData.deletedQuizIds || []);
  writeLocalJson(LOCAL_KEYS.builderDraft, userData.builderDraft || null);
  writeLocalJson(LOCAL_KEYS.customQuizzes, userData.customQuizzes || []);
}

function waitForAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

async function saveNow() {
  if (!currentUser) {
    saveLocalMirror();
    return;
  }

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
    updatedAt: serverTimestamp()
  }, { merge: true });

  saveLocalMirror();
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
    currentUser = await waitForAuth();
    const localData = getLocalData();

    if (!currentUser) {
      userData = localData;
      loaded = true;
      return userData;
    }

    try {
      const userRef = doc(db, "users", currentUser.uid);
      const snap = await getDoc(userRef);
      const cloudData = snap.exists() ? normaliseUserData(snap.data()) : normaliseUserData();

      // Merge local browser data into the account once, so existing progress/library is not lost.
      userData = normaliseUserData({
        stats: { ...localData.stats, ...cloudData.stats },
        libraryIds: [...localData.libraryIds, ...cloudData.libraryIds],
        autoAddedIds: [...localData.autoAddedIds, ...cloudData.autoAddedIds],
        deletedQuizIds: [...localData.deletedQuizIds, ...cloudData.deletedQuizIds],
        builderDraft: cloudData.builderDraft || localData.builderDraft,
        customQuizzes: [...localData.customQuizzes, ...cloudData.customQuizzes].filter((quiz, index, arr) => quiz && quiz.id && index === arr.findIndex((other) => other && other.id === quiz.id))
      });

      await saveNow();
    } catch (error) {
      console.error("Could not load account data from Firestore. Using local fallback:", error);
      userData = localData;
      saveLocalMirror();
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
