import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, query, where, orderBy, limit,
  serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let _ready = null; // memoised promise so /api/config + initializeApp only ever run once

async function boot() {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("Firebase config could not be loaded from /api/config");
  const cfg = await res.json();

  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const googleProvider = new GoogleAuthProvider();

  return {
    app, auth, db, googleProvider,
    adminEmail: cfg.adminEmail || "info.itzmahin@gmail.com",
    paymentNumber: cfg.paymentNumber || "01931923910"
  };
}

// Call this at the top of any async function that needs Firebase.
// Safe to call many times — the network request only happens once.
export function getFirebase() {
  if (!_ready) _ready = boot();
  return _ready;
}

export {
  signInWithPopup, signOut, onAuthStateChanged,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, query, where, orderBy, limit,
  serverTimestamp, arrayUnion
};
