import {
  db, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, serverTimestamp
} from "./firebase-init.js";
import { guardPage } from "./auth.js";
import { Cache } from "./cache.js";

const { user } = await guardPage({ needAuth: true, needProfile: true, needAdmin: true });
if (!user) throw new Error("redirecting");

function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

// ---------------- tabs ----------------
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "exams") loadExamsAdmin();
    if (btn.dataset.tab === "users") loadUsersAdmin();
  });
});

// ---------------- upload exam ----------------
const uploadForm = document.getElementById("uploadForm");
const uploadBanner = document.getElementById("uploadBanner");

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("exTitle").value.trim();
  const subject = document.getElementById("exSubject").value.trim();
  const duration = Number(document.getElementById("exDuration").value) || 60;
  const file = document.getElementById("exFile").files[0];

  if (!file) return;
  const btn = document.getElementById("uploadBtn");
  btn.disabled = true;
  btn.textContent = "আপলোড হচ্ছে...";
  uploadBanner.innerHTML = "";

  try {
    const text = await file.text();
    let questions;
    try {
      questions = JSON.parse(text);
    } catch (err) {
      throw new Error("ফাইলটি সঠিক ফরম্যাটে নেই।");
    }
    if (!Array.isArray(questions) || !questions.length) {
      throw new Error("ফাইলে কোনো প্রশ্ন পাওয়া যায়নি।");
    }
    for (const q of questions) {
      if (!q.question || !q.options || !q.correct_answer) {
        throw new Error("কিছু প্রশ্নে প্রয়োজনীয় তথ্য নেই (question / options / correct_answer)।");
      }
    }

    const examData = {
      title, subject, duration,
      totalQuestions: questions.length,
      questions,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const ref = await addDoc(collection(db, "exams"), examData);

    // update meta/examsIndex (fresh read — this is a rare admin-only action)
    const metaRef = doc(db, "meta", "examsIndex");
    const metaSnap = await getDoc(metaRef);
    const exams = metaSnap.exists() ? (metaSnap.data().exams || []) : [];
    exams.push({ id: ref.id, title, subject, duration, totalQuestions: questions.length });
    await setDoc(metaRef, { exams });

    Cache.remove("examsIndex");
    Cache.remove("exam_" + ref.id);

    uploadBanner.innerHTML = `<div class="banner ok">"${escapeHtml(title)}" সফলভাবে যোগ করা হয়েছে।</div>`;
    uploadForm.reset();
    document.getElementById("exDuration").value = 60;
  } catch (err) {
    uploadBanner.innerHTML = `<div class="banner error">${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "পরীক্ষা যোগ করো";
  }
});

// ---------------- manage exams ----------------
const examsAdminList = document.getElementById("examsAdminList");

async function loadExamsAdmin(force = false) {
  let list = force ? null : Cache.get("examsIndex");
  if (!list) {
    examsAdminList.innerHTML = `<div class="loader"><span class="spinner"></span> লোড হচ্ছে...</div>`;
    const snap = await getDoc(doc(db, "meta", "examsIndex"));
    list = snap.exists() ? (snap.data().exams || []) : [];
    Cache.set("examsIndex", list);
  }
  if (!list.length) {
    examsAdminList.innerHTML = `<div class="empty-state"><div class="ico">📭</div><p>এখনো কোনো পরীক্ষা যোগ করা হয়নি।</p></div>`;
    return;
  }
  examsAdminList.innerHTML = list.map(ex => `
    <div class="exam-item">
      <div>
        <h3>${escapeHtml(ex.title)}</h3>
        <div class="exam-meta">
          <span>❓ ${ex.totalQuestions || 0} টি প্রশ্ন</span>
          <span>⏱️ ${ex.duration || 0} মিনিট</span>
        </div>
      </div>
      <button class="btn btn-danger btn-sm" data-del="${ex.id}">ডিলিট করো</button>
    </div>
  `).join("");

  examsAdminList.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => deleteExam(btn.dataset.del));
  });
}

async function deleteExam(examId) {
  if (!confirm("এই পরীক্ষাটি স্থায়ীভাবে মুছে ফেলতে চাও?")) return;
  await deleteDoc(doc(db, "exams", examId));
  const metaRef = doc(db, "meta", "examsIndex");
  const metaSnap = await getDoc(metaRef);
  const exams = (metaSnap.data()?.exams || []).filter(e => e.id !== examId);
  await setDoc(metaRef, { exams });
  Cache.remove("examsIndex");
  Cache.remove("exam_" + examId);
  loadExamsAdmin(true);
}

document.getElementById("examsRefreshBtn").addEventListener("click", () => {
  Cache.remove("examsIndex");
  loadExamsAdmin(true);
});

// ---------------- manage users ----------------
const usersTableBody = document.getElementById("usersTableBody");
let usersCache = [];

async function loadUsersAdmin(force = false) {
  let list = force ? null : Cache.get("adminUsers");
  if (!list) {
    usersTableBody.innerHTML = `<tr><td colspan="8">লোড হচ্ছে...</td></tr>`;
    const snap = await getDocs(collection(db, "users"));
    list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    Cache.set("adminUsers", list);
  }
  usersCache = list;
  renderUsers(list);
}

function renderUsers(list) {
  if (!list.length) {
    usersTableBody.innerHTML = `<tr><td colspan="8">কোনো ব্যবহারকারী নেই।</td></tr>`;
    return;
  }
  const labels = { engineering: "ইঞ্জিনিয়ারিং", varsity: "ভার্সিটি", medical: "মেডিকেল" };
  usersTableBody.innerHTML = list.map(u => `
    <tr>
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.hscBatch || "-")}</td>
      <td>${u.secondTimer === "yes" ? "হ্যাঁ" : u.secondTimer === "no" ? "না" : "-"}</td>
      <td>${labels[u.preparedFor] || "-"}</td>
      <td>${escapeHtml(u.role || "student")}</td>
      <td>${u.disabled ? "নিষ্ক্রিয়" : "সক্রিয়"}</td>
      <td>
        <button class="btn btn-outline btn-sm" data-edit="${u.id}">সম্পাদনা</button>
        <button class="btn btn-danger btn-sm" data-del="${u.id}">ডিলিট</button>
      </td>
    </tr>
  `).join("");

  usersTableBody.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => openEdit(btn.dataset.edit)));
  usersTableBody.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", () => deleteUser(btn.dataset.del)));
}

document.getElementById("usersRefreshBtn").addEventListener("click", () => {
  Cache.remove("adminUsers");
  loadUsersAdmin(true);
});

// edit modal
const editBackdrop = document.getElementById("editUserBackdrop");
let editingId = null;

function openEdit(uid) {
  const u = usersCache.find(x => x.id === uid);
  if (!u) return;
  editingId = uid;
  document.getElementById("editUserName").textContent = `${u.name} — ${u.email}`;
  document.getElementById("editBatch").value = u.hscBatch || "";
  document.getElementById("editSecondTimer").value = u.secondTimer || "";
  document.getElementById("editPreparedFor").value = u.preparedFor || "";
  document.getElementById("editRole").value = u.role || "student";
  document.getElementById("editDisabled").checked = !!u.disabled;
  editBackdrop.classList.add("open");
}
document.getElementById("editUserClose").addEventListener("click", () => editBackdrop.classList.remove("open"));
editBackdrop.addEventListener("click", (e) => { if (e.target === editBackdrop) editBackdrop.classList.remove("open"); });

document.getElementById("editSaveBtn").addEventListener("click", async () => {
  if (!editingId) return;
  const patch = {
    hscBatch: document.getElementById("editBatch").value,
    secondTimer: document.getElementById("editSecondTimer").value,
    preparedFor: document.getElementById("editPreparedFor").value,
    role: document.getElementById("editRole").value,
    disabled: document.getElementById("editDisabled").checked
  };
  await updateDoc(doc(db, "users", editingId), patch);
  Cache.remove("adminUsers");
  Cache.remove("profile_" + editingId);
  editBackdrop.classList.remove("open");
  loadUsersAdmin(true);
});

async function deleteUser(uid) {
  if (!confirm("এই ব্যবহারকারীর তথ্য মুছে ফেলতে চাও? (এটি শুধু ওয়েবসাইটের তথ্য মুছবে, গুগল অ্যাকাউন্ট নয়)")) return;
  await deleteDoc(doc(db, "users", uid));
  Cache.remove("adminUsers");
  Cache.remove("profile_" + uid);
  loadUsersAdmin(true);
}

// initial tab load
loadExamsAdmin();
