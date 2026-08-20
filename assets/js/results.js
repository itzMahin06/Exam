import { getFirebase, collection, getDocs, query, where, limit } from "./firebase-init.js";
import { Cache } from "./cache.js";

export function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

// Cache-first fetch of every saved (first-attempt) result belonging to this
// student, newest first. Shared across dashboard.html (display) and
// course.html (to know which exams already have a solve sheet unlocked) so
// both pages read the same cached list instead of querying twice.
export async function getMyResults(uid, force = false) {
  const key = "myresults_" + uid;
  let results = force ? null : Cache.get(key);
  if (!results) {
    const { db } = await getFirebase();
    const q = query(collection(db, "results"), where("uid", "==", uid), limit(300));
    const snap = await getDocs(q);
    results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    results.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
    Cache.set(key, results);
  }
  return results;
}
