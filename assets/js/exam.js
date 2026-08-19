import { db, doc, getDoc, collection, addDoc, serverTimestamp } from "./firebase-init.js";
import { guardPage } from "./auth.js";
import { Cache } from "./cache.js";

const params = new URLSearchParams(location.search);
const examId = params.get("id");
const examBody = document.getElementById("examBody");

if (!examId) {
  examBody.innerHTML = `<div class="empty-state"><div class="ico">⚠️</div><p>কোনো পরীক্ষা নির্বাচন করা হয়নি।</p><a class="btn btn-primary" href="dashboard.html">পরীক্ষার তালিকায় ফিরে যাও</a></div>`;
  throw new Error("missing exam id");
}

const { user, profile } = await guardPage({ needAuth: true, needProfile: true });
if (!user) throw new Error("redirecting");

async function loadExam() {
  const key = "exam_" + examId;
  let exam = Cache.get(key);
  if (!exam) {
    const snap = await getDoc(doc(db, "exams", examId));
    if (!snap.exists()) return null;
    exam = { id: examId, ...snap.data() };
    Cache.set(key, exam);
  }
  return exam;
}

const exam = await loadExam();
if (!exam || !Array.isArray(exam.questions) || !exam.questions.length) {
  examBody.innerHTML = `<div class="empty-state"><div class="ico">⚠️</div><p>এই পরীক্ষাটি খুঁজে পাওয়া যায়নি।</p><a class="btn btn-primary" href="dashboard.html">পরীক্ষার তালিকায় ফিরে যাও</a></div>`;
  throw new Error("exam not found");
}

const questions = exam.questions;
const answers = new Array(questions.length).fill(null); // stores 'A' | 'B' | 'C' | 'D' | null
let submitted = false;

document.getElementById("examTitle").textContent = exam.title || "পরীক্ষা";

// ---------- render questions ----------
examBody.innerHTML = questions.map((q, i) => `
  <div class="qcard" id="q-${i}" data-qi="${i}">
    <span class="qno">প্রশ্ন ${i + 1} / ${questions.length}</span>
    ${q.uddipok ? `<div class="uddipok">${q.uddipok}</div>` : ""}
    <div class="qtext">${q.question || ""}</div>
    <div class="opt-list" data-opts>
      ${["A", "B", "C", "D"].filter(k => q.options && q.options[k] !== undefined).map(k => `
        <div class="opt" data-key="${k}">
          <span class="opt-bubble">${k}</span>
          <span class="opt-text">${q.options[k]}</span>
        </div>
      `).join("")}
    </div>
  </div>
`).join("");

document.getElementById("bottomActions").style.display = "flex";
document.getElementById("navFab").style.display = "flex";

// wire option clicks (lock after first pick)
questions.forEach((q, i) => {
  const card = document.getElementById(`q-${i}`);
  card.querySelectorAll(".opt").forEach(optEl => {
    optEl.addEventListener("click", () => {
      if (submitted) return;
      const opts = card.querySelectorAll(".opt");
      const alreadyAnswered = answers[i] !== null;
      if (alreadyAnswered) return; // locked — cannot change
      const key = optEl.dataset.key;
      answers[i] = key;
      opts.forEach(o => {
        o.classList.add("locked");
        if (o.dataset.key === key) o.classList.add("selected");
      });
      updateProgress();
      renderGrid();
    });
  });
});

// ---------- progress ----------
function updateProgress() {
  const answeredCount = answers.filter(a => a !== null).length;
  document.getElementById("examProgressText").textContent = `${answeredCount} / ${questions.length} উত্তর দেওয়া হয়েছে`;
  document.getElementById("progressFill").style.width = `${(answeredCount / questions.length) * 100}%`;
  document.getElementById("navFabCount").textContent = `${answeredCount}/${questions.length}`;
}

// ---------- navigator popup ----------
const qgrid = document.getElementById("qgrid");
function renderGrid() {
  qgrid.innerHTML = questions.map((_, i) => `
    <button data-i="${i}" class="${answers[i] !== null ? "answered" : ""}">${i + 1}</button>
  `).join("");
  qgrid.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = btn.dataset.i;
      document.getElementById("navBackdrop").classList.remove("open");
      const target = document.getElementById(`q-${i}`);
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      document.querySelectorAll(".qcard").forEach(c => c.style.outline = "none");
      target.style.outline = "2.5px solid var(--amber)";
      setTimeout(() => target.style.outline = "none", 1600);
    });
  });
}
renderGrid();
updateProgress();

document.getElementById("navFab").addEventListener("click", () => document.getElementById("navBackdrop").classList.add("open"));
document.getElementById("navClose").addEventListener("click", () => document.getElementById("navBackdrop").classList.remove("open"));
document.getElementById("navBackdrop").addEventListener("click", (e) => { if (e.target.id === "navBackdrop") e.currentTarget.classList.remove("open"); });

document.getElementById("topBtn").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

// ---------- timer ----------
const durationMin = Number(exam.duration) || 30;
let remaining = durationMin * 60;
const timerEl = document.getElementById("timer");
function tick() {
  if (submitted) return;
  const m = Math.floor(remaining / 60).toString().padStart(2, "0");
  const s = (remaining % 60).toString().padStart(2, "0");
  timerEl.textContent = `⏱️ ${m}:${s}`;
  if (remaining <= 60) timerEl.classList.add("low");
  if (remaining <= 0) {
    finishExam(true);
    return;
  }
  remaining--;
}
tick();
const timerInterval = setInterval(tick, 1000);

// ---------- submit ----------
function openConfirm(auto) {
  const answeredCount = answers.filter(a => a !== null).length;
  document.getElementById("confirmText").textContent = auto
    ? "সময় শেষ — পরীক্ষা স্বয়ংক্রিয়ভাবে জমা দেওয়া হচ্ছে।"
    : `তুমি ${answeredCount} / ${questions.length} প্রশ্নের উত্তর দিয়েছো। এখন জমা দিলে আর ফিরে আসা যাবে না।`;
  document.getElementById("confirmBackdrop").classList.add("open");
  document.getElementById("confirmCancel").style.display = auto ? "none" : "";
}

document.getElementById("submitBtn").addEventListener("click", () => openConfirm(false));
document.getElementById("navSubmitBtn").addEventListener("click", () => {
  document.getElementById("navBackdrop").classList.remove("open");
  openConfirm(false);
});
document.getElementById("confirmCancel").addEventListener("click", () => document.getElementById("confirmBackdrop").classList.remove("open"));
document.getElementById("confirmOk").addEventListener("click", () => finishExam(false));

async function finishExam(auto) {
  if (submitted) return;
  submitted = true;
  clearInterval(timerInterval);
  document.getElementById("confirmBackdrop").classList.remove("open");

  let correct = 0, wrong = 0, unanswered = 0;
  const review = questions.map((q, i) => {
    const given = answers[i];
    if (given === null) { unanswered++; }
    else if (given === q.correct_answer) { correct++; }
    else { wrong++; }
    return {
      question: q.question, options: q.options, uddipok: q.uddipok || "",
      correct_answer: q.correct_answer, explanation: q.explanation || "", given
    };
  });

  const total = questions.length;
  const score = correct; // 1 mark per correct question
  const percentage = total ? Math.round((correct / total) * 1000) / 10 : 0;

  const resultDoc = {
    uid: user.uid,
    userName: profile.name || user.displayName || "শিক্ষার্থী",
    examId,
    examTitle: exam.title || "পরীক্ষা",
    correct, wrong, unanswered, total, score, percentage,
    timestamp: serverTimestamp()
  };

  examBody.innerHTML = `<div class="loader"><span class="spinner"></span> ফলাফল সংরক্ষণ হচ্ছে...</div>`;
  document.getElementById("bottomActions").style.display = "none";
  document.getElementById("navFab").style.display = "none";

  try {
    await addDoc(collection(db, "results"), resultDoc);
  } catch (err) {
    console.error("Failed to save result:", err);
  }

  // Invalidate cached "my results" so dashboard reflects the new attempt.
  Cache.remove("myresults_" + user.uid);
  Cache.remove("leaderboard_" + examId);

  sessionStorage.setItem("mc_review", JSON.stringify({
    examTitle: exam.title, correct, wrong, unanswered, total, score, percentage, review
  }));

  location.href = `result.html?examId=${encodeURIComponent(examId)}`;
}

window.addEventListener("beforeunload", (e) => {
  if (!submitted) { e.preventDefault(); e.returnValue = ""; }
});
