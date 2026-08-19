import {
  getFirebase, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, query, where, serverTimestamp, arrayUnion
} from "./firebase-init.js";
import { guardPage } from "./auth.js";
import { Cache } from "./cache.js";

const { user } = await guardPage({ needAuth: true, needProfile: true, needAdmin: true });
if (!user) throw new Error("redirecting");

const { db } = await getFirebase();

function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }
const catLabels = { varsity: "ভার্সিটি", engineering: "ইঞ্জিনিয়ারিং", medical: "মেডিকেল", free: "ফ্রি" };

// ---------------- tabs ----------------
document.querySelectorAll(".tabs .tab-btn[data-tab]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs .tab-btn[data-tab]").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "exams") loadExamsAdmin();
    if (btn.dataset.tab === "courses") loadCoursesAdmin();
    if (btn.dataset.tab === "enrollments") loadEnrollments();
    if (btn.dataset.tab === "users") loadUsersAdmin();
  });
});

// =================================================================
// COURSES
// =================================================================
const coursesAdminList = document.getElementById("coursesAdminList");
const exCourseSelect = document.getElementById("exCourse");
let coursesCache = [];

async function loadCoursesAdmin(force = false) {
  let list = force ? null : Cache.get("coursesIndex");
  if (!list) {
    const snap = await getDoc(doc(db, "meta", "coursesIndex"));
    list = snap.exists() ? (snap.data().courses || []) : [];
    Cache.set("coursesIndex", list);
  }
  coursesCache = list;
  renderCoursesAdmin(list);
  populateCourseSelect(list);
}

function renderCoursesAdmin(list) {
  if (!list.length) {
    coursesAdminList.innerHTML = `<div class="empty-state"><div class="ico">📭</div><p>এখনো কোনো কোর্স তৈরি করা হয়নি।</p></div>`;
    return;
  }
  coursesAdminList.innerHTML = list.map(c => `
    <div class="course-card" style="cursor:default;">
      <div class="course-banner">
        ${c.imageUrl ? `<img src="${escapeHtml(c.imageUrl)}" alt="">` : ""}
        <span class="cat-badge ${c.category === "free" ? "free" : ""}">${catLabels[c.category] || c.category}</span>
      </div>
      <div class="course-card-body">
        <h3>${escapeHtml(c.name)}</h3>
        <div class="course-price-row">
          <span class="price-tag ${c.category === "free" || !c.price ? "free" : ""}">${c.category === "free" || !c.price ? "ফ্রি" : "৳ " + c.price}</span>
          <span class="small-note">${c.examCount || 0} টি পরীক্ষা</span>
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-outline btn-sm" style="flex:1" data-edit-course="${c.id}">সম্পাদনা</button>
          <button class="btn btn-danger btn-sm" data-del-course="${c.id}">ডিলিট</button>
        </div>
      </div>
    </div>
  `).join("");

  coursesAdminList.querySelectorAll("[data-edit-course]").forEach(b => b.addEventListener("click", () => openCourseModal(b.dataset.editCourse)));
  coursesAdminList.querySelectorAll("[data-del-course]").forEach(b => b.addEventListener("click", () => deleteCourse(b.dataset.delCourse)));
}

function populateCourseSelect(list) {
  const current = exCourseSelect.value;
  exCourseSelect.innerHTML = `<option value="">নির্বাচন করো</option>` +
    list.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${catLabels[c.category] || c.category})</option>`).join("");
  if (current) exCourseSelect.value = current;
}

document.getElementById("coursesRefreshBtn").addEventListener("click", () => {
  Cache.remove("coursesIndex");
  loadCoursesAdmin(true);
});

// course modal (create + edit)
const courseModalBackdrop = document.getElementById("courseModalBackdrop");
const courseForm = document.getElementById("courseForm");
const courseModalBanner = document.getElementById("courseModalBanner");
let editingCourseId = null;

function openCourseModal(courseId = null) {
  editingCourseId = courseId;
  courseModalBanner.innerHTML = "";
  courseForm.reset();
  document.getElementById("cPrice").value = 0;
  if (courseId) {
    const c = coursesCache.find(x => x.id === courseId);
    document.getElementById("courseModalTitle").textContent = "কোর্স সম্পাদনা";
    document.getElementById("cName").value = c?.name || "";
    document.getElementById("cDesc").value = c?.description || "";
    document.getElementById("cImage").value = c?.imageUrl || "";
    document.getElementById("cCategory").value = c?.category || "";
    document.getElementById("cPrice").value = c?.price || 0;
  } else {
    document.getElementById("courseModalTitle").textContent = "নতুন কোর্স";
  }
  courseModalBackdrop.classList.add("open");
}
document.getElementById("newCourseBtn").addEventListener("click", () => openCourseModal(null));
document.getElementById("courseModalClose").addEventListener("click", () => courseModalBackdrop.classList.remove("open"));
courseModalBackdrop.addEventListener("click", (e) => { if (e.target === courseModalBackdrop) courseModalBackdrop.classList.remove("open"); });

courseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("cName").value.trim();
  const description = document.getElementById("cDesc").value.trim();
  const imageUrl = document.getElementById("cImage").value.trim();
  const category = document.getElementById("cCategory").value;
  const price = category === "free" ? 0 : (Number(document.getElementById("cPrice").value) || 0);

  if (!name || !category) {
    courseModalBanner.innerHTML = `<div class="banner error">নাম ও ক্যাটাগরি আবশ্যক।</div>`;
    return;
  }

  const btn = document.getElementById("courseSaveBtn");
  btn.disabled = true;
  btn.textContent = "সংরক্ষণ হচ্ছে...";

  try {
    const metaRef = doc(db, "meta", "coursesIndex");

    if (editingCourseId) {
      await updateDoc(doc(db, "courses", editingCourseId), { name, description, imageUrl, category, price, updatedAt: serverTimestamp() });
      const metaSnap = await getDoc(metaRef);
      const courses = (metaSnap.data()?.courses || []).map(c =>
        c.id === editingCourseId ? { ...c, name, description, imageUrl, category, price } : c
      );
      await setDoc(metaRef, { courses });
    } else {
      const ref = await addDoc(collection(db, "courses"), {
        name, description, imageUrl, category, price, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      const metaSnap = await getDoc(metaRef);
      const courses = metaSnap.exists() ? (metaSnap.data().courses || []) : [];
      courses.push({ id: ref.id, name, description, imageUrl, category, price, examCount: 0 });
      await setDoc(metaRef, { courses });
    }

    Cache.remove("coursesIndex");
    Cache.remove("course_" + editingCourseId);
    courseModalBackdrop.classList.remove("open");
    loadCoursesAdmin(true);
  } catch (err) {
    courseModalBanner.innerHTML = `<div class="banner error">${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "সংরক্ষণ করো";
  }
});

async function deleteCourse(courseId) {
  const hasExams = (Cache.get("examsIndex") || []).some(e => e.courseId === courseId);
  if (hasExams && !confirm("এই কোর্সের অধীনে পরীক্ষা আছে। কোর্সটি ডিলিট করলে সেই পরীক্ষাগুলো আর কোনো কোর্সের সাথে যুক্ত থাকবে না। এগিয়ে যেতে চাও?")) return;
  if (!hasExams && !confirm("এই কোর্সটি স্থায়ীভাবে মুছে ফেলতে চাও?")) return;

  await deleteDoc(doc(db, "courses", courseId));
  const metaRef = doc(db, "meta", "coursesIndex");
  const metaSnap = await getDoc(metaRef);
  const courses = (metaSnap.data()?.courses || []).filter(c => c.id !== courseId);
  await setDoc(metaRef, { courses });
  Cache.remove("coursesIndex");
  Cache.remove("course_" + courseId);
  loadCoursesAdmin(true);
}

// =================================================================
// UPLOAD EXAM
// =================================================================
const uploadForm = document.getElementById("uploadForm");
const uploadBanner = document.getElementById("uploadBanner");

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const courseId = exCourseSelect.value;
  const title = document.getElementById("exTitle").value.trim();
  const subject = document.getElementById("exSubject").value.trim();
  const duration = Number(document.getElementById("exDuration").value) || 60;
  const file = document.getElementById("exFile").files[0];

  if (!courseId) {
    uploadBanner.innerHTML = `<div class="banner error">দয়া করে একটি কোর্স নির্বাচন করো।</div>`;
    return;
  }
  if (!file) return;

  const course = coursesCache.find(c => c.id === courseId);
  const isFree = course ? (course.category === "free" || !course.price) : false;

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
      courseId, courseName: course ? course.name : "", isFree,
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
    exams.push({ id: ref.id, title, subject, duration, totalQuestions: questions.length, courseId, courseName: course ? course.name : "", isFree });
    await setDoc(metaRef, { exams });

    // bump the course's exam count in meta/coursesIndex
    const coursesMetaRef = doc(db, "meta", "coursesIndex");
    const coursesMetaSnap = await getDoc(coursesMetaRef);
    const courses = (coursesMetaSnap.data()?.courses || []).map(c =>
      c.id === courseId ? { ...c, examCount: (c.examCount || 0) + 1 } : c
    );
    await setDoc(coursesMetaRef, { courses });

    Cache.remove("examsIndex");
    Cache.remove("exam_" + ref.id);
    Cache.remove("coursesIndex");

    uploadBanner.innerHTML = `<div class="banner ok">"${escapeHtml(title)}" সফলভাবে যোগ করা হয়েছে।</div>`;
    uploadForm.reset();
    document.getElementById("exDuration").value = 60;
    loadCoursesAdmin(true);
  } catch (err) {
    uploadBanner.innerHTML = `<div class="banner error">${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "পরীক্ষা যোগ করো";
  }
});

// =================================================================
// MANAGE EXAMS
// =================================================================
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
          ${ex.courseName ? `<span class="chip">${escapeHtml(ex.courseName)}</span>` : `<span class="small-note">কোনো কোর্স নেই</span>`}
          ${ex.isFree ? `<span class="chip" style="background:var(--amber-soft); color:#8A5D0F;">ফ্রি</span>` : ""}
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
  const list = Cache.get("examsIndex") || [];
  const target = list.find(e => e.id === examId);

  await deleteDoc(doc(db, "exams", examId));
  const metaRef = doc(db, "meta", "examsIndex");
  const metaSnap = await getDoc(metaRef);
  const exams = (metaSnap.data()?.exams || []).filter(e => e.id !== examId);
  await setDoc(metaRef, { exams });

  if (target?.courseId) {
    const coursesMetaRef = doc(db, "meta", "coursesIndex");
    const coursesMetaSnap = await getDoc(coursesMetaRef);
    const courses = (coursesMetaSnap.data()?.courses || []).map(c =>
      c.id === target.courseId ? { ...c, examCount: Math.max(0, (c.examCount || 0) - 1) } : c
    );
    await setDoc(coursesMetaRef, { courses });
    Cache.remove("coursesIndex");
  }

  Cache.remove("examsIndex");
  Cache.remove("exam_" + examId);
  loadExamsAdmin(true);
}

document.getElementById("examsRefreshBtn").addEventListener("click", () => {
  Cache.remove("examsIndex");
  loadExamsAdmin(true);
});

// =================================================================
// ENROLLMENT REQUESTS
// =================================================================
const enrollTableBody = document.getElementById("enrollTableBody");
const pendingCountBadge = document.getElementById("pendingCountBadge");
let enrollCache = [];
let enrollStatusFilter = "pending";

async function loadEnrollments(force = false) {
  let list = force ? null : Cache.get("adminEnrollments");
  if (!list) {
    enrollTableBody.innerHTML = `<tr><td colspan="8">লোড হচ্ছে...</td></tr>`;
    const snap = await getDocs(collection(db, "enrollments"));
    list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    Cache.set("adminEnrollments", list);
  }
  enrollCache = list;
  updatePendingBadge();
  renderEnrollments();
}

function updatePendingBadge() {
  const pending = enrollCache.filter(e => e.status === "pending").length;
  if (pending > 0) {
    pendingCountBadge.style.display = "inline-flex";
    pendingCountBadge.textContent = pending;
  } else {
    pendingCountBadge.style.display = "none";
  }
}

function renderEnrollments() {
  const list = enrollStatusFilter === "all" ? enrollCache : enrollCache.filter(e => e.status === enrollStatusFilter);
  const methodLabels = { bkash: "bKash", nagad: "Nagad", rocket: "Rocket" };
  const statusLabels = { pending: "পর্যালোচনাধীন", approved: "অনুমোদিত", declined: "প্রত্যাখ্যাত" };

  if (!list.length) {
    enrollTableBody.innerHTML = `<tr><td colspan="8">কোনো অনুরোধ নেই।</td></tr>`;
    return;
  }

  enrollTableBody.innerHTML = list.map(en => `
    <tr>
      <td>${escapeHtml(en.userName)}<br><span class="small-note">${escapeHtml(en.userEmail || "")}</span></td>
      <td>${escapeHtml(en.courseName)}</td>
      <td>৳ ${en.coursePrice || 0}</td>
      <td>${methodLabels[en.paymentMethod] || en.paymentMethod}</td>
      <td>${escapeHtml(en.senderNumber || "-")}</td>
      <td>${escapeHtml(en.transactionId || "-")}</td>
      <td>${statusLabels[en.status] || en.status}</td>
      <td>
        ${en.status === "pending" ? `
          <button class="btn btn-primary btn-sm" data-approve="${en.id}">অনুমোদন</button>
          <button class="btn btn-danger btn-sm" data-decline="${en.id}">প্রত্যাখ্যান</button>
        ` : ""}
      </td>
    </tr>
  `).join("");

  enrollTableBody.querySelectorAll("[data-approve]").forEach(b => b.addEventListener("click", () => reviewEnrollment(b.dataset.approve, "approved")));
  enrollTableBody.querySelectorAll("[data-decline]").forEach(b => b.addEventListener("click", () => reviewEnrollment(b.dataset.decline, "declined")));
}

document.querySelectorAll('#tab-enrollments .tabs .tab-btn[data-estatus]').forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('#tab-enrollments .tabs .tab-btn[data-estatus]').forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    enrollStatusFilter = btn.dataset.estatus;
    renderEnrollments();
  });
});

document.getElementById("enrollRefreshBtn").addEventListener("click", () => {
  Cache.remove("adminEnrollments");
  loadEnrollments(true);
});

async function reviewEnrollment(enrollId, decision) {
  const en = enrollCache.find(x => x.id === enrollId);
  if (!en) return;
  if (!confirm(decision === "approved" ? "এই ভর্তি অনুরোধ অনুমোদন করতে চাও?" : "এই ভর্তি অনুরোধ প্রত্যাখ্যান করতে চাও?")) return;

  await updateDoc(doc(db, "enrollments", enrollId), { status: decision, reviewedAt: serverTimestamp() });

  const userPatch = { [`enrollmentStatus.${en.courseId}`]: decision };
  if (decision === "approved") userPatch.enrolledCourses = arrayUnion(en.courseId);
  await updateDoc(doc(db, "users", en.uid), userPatch);

  Cache.remove("adminEnrollments");
  Cache.remove("adminUsers");
  Cache.remove("profile_" + en.uid); // best-effort; the student's own browser cache updates on their next visit
  loadEnrollments(true);
}

// =================================================================
// MANAGE USERS
// =================================================================
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

// initial load
await loadCoursesAdmin();
loadExamsAdmin();
