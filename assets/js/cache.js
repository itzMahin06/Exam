// ============================================================
// Simple localStorage cache.
// Rule used across the site: read Firestore ONCE, then always
// serve from this cache until the user taps a refresh button
// (which clears the relevant key before refetching).
// ============================================================
const PREFIX = "mc_";

export const Cache = {
  get(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) { /* storage full / disabled — fail silently */ }
  },
  remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) {}
  },
  removePrefixed(prefix) {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(PREFIX + prefix))
        .forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  }
};
