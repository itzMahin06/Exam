// ============================================================
// Theme: day / night / system.
// The actual data-theme attribute is set as early as possible by a small
// inline script in each page's <head> (before this module even loads) to
// avoid a flash of the wrong theme. This file only wires up the dropdown
// UI so the person can change/see their preference.
// ============================================================
const KEY = "mc_theme"; // 'day' | 'night' | 'system'

function applyTheme(pref) {
  const dark = pref === "night" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

export function wireThemeToggle() {
  const btn = document.querySelector("[data-theme-btn]");
  const menu = document.querySelector("[data-theme-menu]");
  if (!btn || !menu || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  const pref = localStorage.getItem(KEY) || "system";
  menu.querySelectorAll("[data-theme-choice]").forEach(item => {
    item.classList.toggle("active", item.dataset.themeChoice === pref);
    item.addEventListener("click", () => {
      const choice = item.dataset.themeChoice;
      localStorage.setItem(KEY, choice);
      applyTheme(choice);
      menu.querySelectorAll("[data-theme-choice]").forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      menu.classList.remove("open");
    });
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".account-menu.open").forEach(m => m.classList.remove("open"));
    menu.classList.toggle("open");
  });
  document.addEventListener("click", () => menu.classList.remove("open"));
  menu.addEventListener("click", (e) => e.stopPropagation());

  // Live-update if the OS theme changes while "system" is selected.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((localStorage.getItem(KEY) || "system") === "system") applyTheme("system");
  });
}
