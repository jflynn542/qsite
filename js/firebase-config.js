import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBHHDQnz3MjtMT0zm1RGj8MV387aib0DTQ",
  authDomain: "qsite-1c1db.firebaseapp.com",
  projectId: "qsite-1c1db",
  storageBucket: "qsite-1c1db.firebasestorage.app",
  messagingSenderId: "316836326732",
  appId: "1:316836326732:web:76ce3839ef2231834033e9",
  measurementId: "G-ECVP84B1TZ"
};
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);




