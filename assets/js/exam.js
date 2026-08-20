import {
  getFirebase, doc, getDoc, collection, addDoc, getDocs, query, where, limit, serverTimestamp
} from "./firebase-init.js";
import { guardPage, getProfile } from "./auth.js";
import { Cache } from "./cache.js";

const params = new URLSearchParams(location.search);
const examId = params.get("id");
const examBody = document.getElementById("examBody");

function backToCourses(msg, extraLinkHtml = "") {
  examBody.innerHTML = `<div class="empty-state"><div class="ico"><i class="fa-solid fa-lock"></i></div><p>${msg}</p>
    <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
      ${extraLinkHtml}
      <a class="btn btn-outline" href="courses.html">কোর্সসমূহ দেখো</a>
    </div></div>`;
}

if (!examId) {
  backToCourses("কোনো পরীক্ষা নির্বাচন করা হয়নি।");
  throw new Error("missing exam id");
}

const { user, profile: cachedProfile } = await guardPage({ needAuth: true, needProfile: true });
if (!user) throw new Error("redirecting");

const { db } = await getFirebase();

// ---------- find this exam's summary (course + free/paid) in the light index ----------
async function loadExamIndexEntry() {
  let list = Cache.get("examsIndex");
  if (!list) {
    const snap = await getDoc(doc(db, "meta", "examsIndex"));
    list = snap.exists() ? (snap.data().exams || []) : [];
    Cache.set("examsIndex", list);
  }
  return list.find(e => e.id === examId) || null;
}

const indexEntry = await loadExamIndexEntry();

// ---------- access check (before spending a read on the full exam doc) ----------
// Only bother re-checking with a fresh profile read when the course is paid —
// free-course exams never need it, saving a read on the common case.
const needsFreshCheck = indexEntry && !indexEntry.isFree;
const freshProfile = needsFreshCheck ? await getProfile(user.uid, true) : cachedProfile;

if (needsFreshCheck) {
  const allowed = freshProfile?.role === "admin" ||
    (Array.isArray(freshProfile?.enrolledCourses) && freshProfile.enrolledCourses.includes(indexEntry.courseId));
  if (!allowed) {
    backToCourses(
      "এই পরীক্ষাটি দিতে হলে আগে এই কোর্সে ভর্তি হতে হবে।",
      indexEntry.courseId ? `<a class="btn btn-primary" href="course.html?id=${encodeURIComponent(indexEntry.courseId)}">কোর্সটি দেখো</a>` : ""
    );
    throw new Error("not enrolled");
  }
}

async function loadExam() {
  const key = "exam_" + examId;
  let exam = Cache.get(key);
  if (!exam) {
    try {
      const snap = await getDoc(doc(db, "exams", examId));
      if (!snap.exists()) return null;
      exam = { id: examId, ...snap.data() };
      Cache.set(key, exam);
    } catch (err) {
      // Firestore security rules block reads for un-enrolled paid courses too —
      // this is the real gate, the UI check above is just a nicer experience.
      return "denied";
    }
  }
  return exam;
}

const exam = await loadExam();
if (exam === "denied") {
  backToCourses(
    "এই পরীক্ষাটি দিতে হলে আগে এই কোর্সে ভর্তি হতে হবে।",
    indexEntry?.courseId ? `<a class="btn btn-primary" href="course.html?id=${encodeURIComponent(indexEntry.courseId)}">কোর্সটি দেখো</a>` : ""
  );
  throw new Error("permission denied");
}
if (!exam || !Array.isArray(exam.questions) || !exam.questions.length) {
  backToCourses("এই পরীক্ষাটি খুঁজে পাওয়া যায়নি।");
  throw new Error("exam not found");
}

const questions = exam.questions;
const answers = new Array(questions.length).fill(null); // stores 'A' | 'B' | 'C' | 'D' | null
let submitted = false;

document.getElementById("examTitle").textContent = exam.title || "পরীক্ষা";

// ---------- negative marking notice ----------
const isSecondTimerForNotice = freshProfile?.secondTimer === "yes";
const noticePenalty = (Number(exam.negativeMark) || 0) + (isSecondTimerForNotice ? (Number(exam.secondTimerNegative) || 0) : 0);
const negativeNoticeHtml = noticePenalty > 0
  ? `<div class="banner error" style="margin:14px 0 0;">
      <i class="fa-solid fa-triangle-exclamation"></i>
      প্রতিটি ভুল উত্তরে <b>-${noticePenalty}</b> নম্বর কাটা যাবে
      ${isSecondTimerForNotice && exam.secondTimerNegative ? ` (এর মধ্যে ২য় টাইমার হিসেবে বাড়তি -${exam.secondTimerNegative} অন্তর্ভুক্ত)` : ""}।
    </div>`
  : "";

// ---------- render questions ----------
examBody.innerHTML = negativeNoticeHtml + questions.map((q, i) => `
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

// ---------- block copying question/option text ----------
// (client-side only — deters casual copying, not a hard security boundary)
["copy", "cut", "contextmenu", "selectstart", "dragstart"].forEach(evt => {
  examBody.addEventListener(evt, (e) => e.preventDefault());
});
examBody.addEventListener("keydown", (e) => {
  const k = e.key?.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && (k === "c" || k === "x" || k === "a" || k === "p")) {
    e.preventDefault();
  }
});

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
const timerTextEl = document.getElementById("timerText");
function tick() {
  if (submitted) return;
  const m = Math.floor(remaining / 60).toString().padStart(2, "0");
  const s = (remaining % 60).toString().padStart(2, "0");
  timerTextEl.textContent = `${m}:${s}`;
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
  const isSecondTimer = freshProfile?.secondTimer === "yes";
  const perWrongPenalty = (Number(exam.negativeMark) || 0) + (isSecondTimer ? (Number(exam.secondTimerNegative) || 0) : 0);
  const rawScore = correct - (wrong * perWrongPenalty);
  const score = Math.round(rawScore * 100) / 100; // keep up to 2 decimals, e.g. -0.25 marks
  const percentage = total ? Math.round((score / total) * 1000) / 10 : 0;

  const resultDoc = {
    uid: user.uid,
    userName: freshProfile?.name || user.displayName || "শিক্ষার্থী",
    examId,
    examTitle: exam.title || "পরীক্ষা",
    courseId: exam.courseId || "",
    correct, wrong, unanswered, total, score, percentage,
    negativeMarkApplied: perWrongPenalty,
    timestamp: serverTimestamp()
  };

  examBody.innerHTML = `<div class="loader"><span class="spinner"></span> ফলাফল যাচাই হচ্ছে...</div>`;
  document.getElementById("bottomActions").style.display = "none";
  document.getElementById("navFab").style.display = "none";

  // Only the FIRST attempt at an exam is saved to Firestore (and therefore
  // counted on the leaderboard / "my results"). Every attempt after that is
  // free practice — the score still shows on the result page, it just isn't
  // written anywhere.
  let isFirstAttempt = true;
  try {
    const dupSnap = await getDocs(query(
      collection(db, "results"),
      where("uid", "==", user.uid),
      where("examId", "==", examId),
      limit(1)
    ));
    isFirstAttempt = dupSnap.empty;
  } catch (err) {
    console.error("Could not check previous attempts:", err);
    // If we can't tell, err on the side of NOT double-counting a score.
    isFirstAttempt = false;
  }

  if (isFirstAttempt) {
    try {
      await addDoc(collection(db, "results"), resultDoc);
      Cache.remove("myresults_" + user.uid);
      Cache.remove("leaderboard_" + examId);
    } catch (err) {
      console.error("Failed to save result:", err);
    }
  }

  sessionStorage.setItem("mc_review", JSON.stringify({
    examTitle: exam.title, correct, wrong, unanswered, total, score, percentage, review, isFirstAttempt
  }));

  location.href = `result.html?examId=${encodeURIComponent(examId)}&courseId=${encodeURIComponent(exam.courseId || "")}`;
}

window.addEventListener("beforeunload", (e) => {
  if (!submitted) { e.preventDefault(); e.returnValue = ""; }
});
