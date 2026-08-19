import {
  getFirebase, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, serverTimestamp
} from "./firebase-init.js";
import { Cache } from "./cache.js";

// Fetch (cache-first) the Firestore profile doc for a uid.
export async function getProfile(uid, forceRefresh = false) {
  const key = "profile_" + uid;
  if (!forceRefresh) {
    const cached = Cache.get(key);
    if (cached) return cached;
  }
  const { db } = await getFirebase();
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.exists() ? snap.data() : null;
  if (data) Cache.set(key, data);
  return data;
}

// Create the user doc on first-ever Google sign in.
export async function ensureUserDoc(user) {
  const { db, adminEmail } = await getFirebase();
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    Cache.set("profile_" + user.uid, data);
    return data;
  }
  const isAdmin = (user.email || "").toLowerCase() === adminEmail.toLowerCase();
  const fresh = {
    uid: user.uid,
    name: user.displayName || "শিক্ষার্থী",
    email: user.email || "",
    photoURL: user.photoURL || "",
    hscBatch: "",
    secondTimer: "",
    preparedFor: "",
    profileComplete: false,
    role: isAdmin ? "admin" : "student",
    disabled: false,
    enrolledCourses: [],
    enrollmentStatus: {},
    createdAt: serverTimestamp()
  };
  await setDoc(ref, fresh);
  Cache.set("profile_" + user.uid, fresh);
  return fresh;
}

export function saveProfileCache(uid, data) {
  Cache.set("profile_" + uid, data);
}

// Resolve current auth state as a Promise (one-shot).
async function waitForAuth(auth) {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

/**
 * Guard a page. Options:
 *  - needAuth: redirect to login.html if not signed in
 *  - needProfile: redirect to profile.html if profile incomplete
 *  - needAdmin: redirect to courses.html if not admin
 *  - guestOnly: redirect signed-in users away (login page)
 */
export async function guardPage(opts = {}) {
  wireChrome(); // hamburger + active-link highlight work regardless of auth state

  const { auth } = await getFirebase();
  const user = await waitForAuth(auth);

  if (opts.guestOnly) {
    if (user) location.replace("courses.html");
    return { user: null, profile: null };
  }

  if (!user) {
    if (opts.needAuth) location.replace("login.html");
    return { user: null, profile: null };
  }

  const profile = await ensureUserDoc(user);

  if (profile.disabled) {
    alert("আপনার অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।");
    await signOut(auth);
    location.replace("login.html");
    return { user: null, profile: null };
  }

  if (opts.needProfile && !profile.profileComplete) {
    location.replace("profile.html");
    return { user, profile };
  }

  if (opts.needAdmin && profile.role !== "admin") {
    location.replace("courses.html");
    return { user, profile };
  }

  wireNav(user, profile);
  return { user, profile };
}

// Hamburger toggle + active-link highlight — always wired, regardless of auth state.
let chromeWired = false;
export function wireChrome() {
  if (chromeWired) return;
  chromeWired = true;

  const toggle = document.querySelector("[data-nav-toggle]");
  const links = document.querySelector("[data-nav-links]");
  if (toggle && links) {
    toggle.addEventListener("click", () => links.classList.toggle("open"));
  }

  const here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("[data-nav-links] a").forEach(a => {
    if (a.getAttribute("href") === here) a.classList.add("active");
  });
}

// Fill in header avatar / name / admin link / logout button, if present on page.
export function wireNav(user, profile) {
  wireChrome();

  const avatar = document.querySelector("[data-nav-avatar]");
  const name = document.querySelector("[data-nav-name]");
  const adminLink = document.querySelector("[data-nav-admin]");
  const logoutBtn = document.querySelector("[data-nav-logout]");
  const guestArea = document.querySelector("[data-nav-guest]");
  const userArea = document.querySelector("[data-nav-user]");

  if (user && profile) {
    if (avatar) avatar.src = profile.photoURL || user.photoURL || "";
    if (name) name.textContent = profile.name || user.displayName || "";
    if (adminLink) adminLink.style.display = profile.role === "admin" ? "" : "none";
    if (guestArea) guestArea.style.display = "none";
    if (userArea) userArea.style.display = "";
  } else {
    if (guestArea) guestArea.style.display = "";
    if (userArea) userArea.style.display = "none";
  }

  if (logoutBtn && !logoutBtn.dataset.wired) {
    logoutBtn.dataset.wired = "1";
    logoutBtn.addEventListener("click", async () => {
      const { auth } = await getFirebase();
      await signOut(auth);
      Cache.removePrefixed("profile_");
      location.replace("index.html");
    });
  }
}

// ---------------------------------------------------------------
// Course-access helpers
// ---------------------------------------------------------------

export function courseIsFree(course) {
  return course.category === "free" || Number(course.price) <= 0;
}

// True if the given profile grants access to a course (free course, or approved enrollment).
export function hasCourseAccess(profile, course) {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  if (courseIsFree(course)) return true;
  return Array.isArray(profile.enrolledCourses) && profile.enrolledCourses.includes(course.id);
}
