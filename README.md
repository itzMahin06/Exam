# Exam | MAHIN'S CLASSROOM

A user-based online exam website: Google sign-in, profile setup, courses
(free + paid with a manual bKash/Nagad/Rocket enrollment approval flow),
timed MCQ exams with a locked-answer OMR-style interface, instant results,
a leaderboard, and an admin panel to manage all of it — backed by Firebase
(Auth + Firestore), read-optimised with browser caching, and deployed on
**Vercel** so the Firebase keys never sit inside the GitHub repo.

## 1. Create your Firebase project

1. Go to https://console.firebase.google.com → **Add project**.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.**
3. **Build → Firestore Database → Create database** → **production mode** →
   pick a region close to Bangladesh (e.g. `asia-south1`).
4. **Project settings (gear icon) → General → Your apps → Web (`</>`)** →
   register an app → copy the six values shown (`apiKey`, `authDomain`,
   `projectId`, `storageBucket`, `messagingSenderId`, `appId`). You'll paste
   these into Vercel in step 2, **not** into any file in this repo.
5. **Authentication → Settings → Authorized domains** → add your Vercel
   domain once you have it (e.g. `your-project.vercel.app`, plus any custom
   domain you attach later).

The admin email is fixed to **info.itzmahin@gmail.com** — the first time
that Google account signs in, it's automatically given the `admin` role and
can open `admin.html`. Everyone else signs up as a normal student.

## 2. Deploy to Vercel with environment variables (no keys in GitHub)

This project deliberately keeps `apiKey` etc. **out of the repository**.
Instead, one tiny serverless function — `api/config.js` — reads them from
Vercel's Environment Variables at request time and hands them to the
browser. Nothing secret is ever committed to GitHub.

1. Push this whole folder to a GitHub repository as usual.
2. On https://vercel.com → **Add New → Project** → import that repo.
   Framework preset: **Other** (it's a static site + one API route, no
   build step needed — leave Build Command / Output Directory empty).
3. Before the first deploy (or right after, then redeploy), go to
   **Settings → Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `FIREBASE_API_KEY` | from step 1.4 |
   | `FIREBASE_AUTH_DOMAIN` | from step 1.4 |
   | `FIREBASE_PROJECT_ID` | from step 1.4 |
   | `FIREBASE_STORAGE_BUCKET` | from step 1.4 |
   | `FIREBASE_MESSAGING_SENDER_ID` | from step 1.4 |
   | `FIREBASE_APP_ID` | from step 1.4 |
   | `ADMIN_EMAIL` | `info.itzmahin@gmail.com` (optional — this is the default) |
   | `PAYMENT_NUMBER` | `01931923910` (optional — this is the default) |

4. Redeploy. Visit the assigned `*.vercel.app` URL, then add that exact
   domain to Firebase's **Authorized domains** (step 1.5) or Google
   sign-in will be blocked with an `auth/unauthorized-domain` error.

That's it — `assets/js/firebase-init.js` calls `/api/config` once per
page load (the result is memoised in memory) to get the config, so every
page works without ever hard-coding a key.

## 3. Add the Firestore security rules

Firestore console → **Rules** tab → replace the contents with
`firestore.rules` from this project → **Publish**. Highlights:

- Students can only read/edit their own profile.
- Only the admin account can write exams, courses, or edit/delete users.
- A **paid** exam's questions are only readable once the student's own
  profile lists that course inside `enrolledCourses` (set the moment the
  admin approves their enrollment). Free-category exams are readable by
  any signed-in user. This is enforced at the database level — the
  friendly "enroll to unlock" screen in the UI is on top of this, not
  instead of it.
- An enrollment request can only be created by the student it belongs to,
  always starting as `status: "pending"`; only the admin can approve or
  decline it.
- A result can only be created by the signed-in student it belongs to, and
  only stores the aggregate `score / correct / wrong / unanswered` fields —
  never the individual answers, keeping writes small.

## 4. Composite indexes

None needed. The leaderboard and "my results" queries deliberately use a
single equality filter (no `orderBy` combined with it) and sort the small
result set in the browser instead — so Firebase never asks you to create a
composite index for this site, and those pages can't get stuck on a
missing-index error.

## 5. How reads are minimised

- The exam list is **not** one read per exam — `meta/examsIndex` stores a
  summary (title, duration, question count, course, free/paid) for every
  exam, so listing/filtering exams by course costs exactly **one read**.
  `meta/coursesIndex` does the same for the course catalogue.
- Every read is cached in the browser's `localStorage` the first time it's
  fetched — exam list, a specific exam's questions, course list, a course's
  detail, leaderboard, "my results", the admin's user/enrollment lists.
  Firestore is not hit again until the person taps a **🔄 রিফ্রেশ** button.
- Course access is checked from the student's own cached profile document
  (`enrolledCourses` / `enrollmentStatus`) — no extra query — except for a
  fresh one-document re-check right before opening a **paid** exam, so an
  admin's approval takes effect immediately.
- Only one small `results` document is written per exam attempt. The full
  question-by-question review (with explanations) lives in the browser's
  `sessionStorage` for the result page — it is **never** written to
  Firestore, only the aggregate score is.

- Only the **first** attempt at an exam is written to Firestore. Every
  attempt after that is free practice — the result page shows the score
  normally, it's just never saved, so re-practicing an exam never touches
  the leaderboard, "my results", or Firestore write quota.
- The leaderboard is **course-wise**: pick a course you have access to and
  see every student ranked by their combined score across all of that
  course's exams (not just one exam at a time, and not just a top-N slice)
  — computed client-side from a single equality-filtered read.
- Course descriptions, banners, prices, and the meta index documents are
  publicly readable (no sign-in needed) so anyone can browse what's on
  offer — only the actual exam questions require sign-in + enrollment.

## 6. Set up courses, upload exams

1. Sign in with the admin Google account → open **অ্যাডমিন**.
2. **কোর্স** tab → **+ নতুন কোর্স** → set name, description, a banner image
   URL (paste any image link — a 16:9 "YouTube thumbnail" size like
   1280×720 works best), category (`ইঞ্জিনিয়ারিং` / `ভার্সিটি` /
   `মেডিকেল` / `ফ্রি`), and price (₹0 for the free category). Every course
   card also shows how many students have been approved into it.
3. **পরীক্ষা আপলোড** tab → pick the course you just created, fill in
   title/subject/duration, optional negative marking (see below), and
   choose a JSON file where each question looks like:

```json
{
  "question": "<span style=\"font-family: SutonnyMJ\">...</span>",
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "correct_answer": "C",
  "explanation": "...",
  "uddipok": ""
}
```

   `assets/data/sample-exam.json` (your originally uploaded file) is
   included as a ready-to-use example.
4. **পরীক্ষা পরিচালনা** tab → every exam has a **সম্পাদনা** (edit) button:
   change its title, subject, duration, course, or negative marking at any
   time, and optionally upload a new JSON file to replace its questions
   entirely (leave the file field empty to keep the existing questions).

Every exam belongs to exactly one course and is only visible on that
course's page (`course.html`). **Free**-category courses are open to every
signed-in student immediately. Any other category requires an **approved**
enrollment first. Course *browsing* itself (banner, description, price,
exam titles) is open to everyone, signed in or not — only starting an exam
requires signing in, and only a paid exam's questions require enrollment.

### Negative marking

Each exam can optionally have:
- **প্রতি ভুল উত্তরে নেগেটিভ মার্ক** — a flat deduction applied to every
  wrong answer for every student (e.g. `0.25`).
- **২য় টাইমারদের জন্য অতিরিক্ত নেগেটিভ মার্ক** — an *extra* deduction
  applied on top of the above, but only for students whose profile has
  "সেকেন্ড টাইমার" set to হ্যাঁ.

The exam page shows a banner with the exact penalty that applies to the
signed-in student before they start, and the final score is
`correct − (wrong × penalty)`, saved with up to 2 decimal places.

### First attempt vs. practice

Only a student's **first** attempt at a given exam is written to Firestore
— that's the score that counts on the leaderboard and shows up on their
"আমার ফলাফল" page (grouped there by course, with a **১ম চেষ্টার ফলাফল**
button that reopens that first attempt's correct/wrong/skipped breakdown
without spending another Firestore read). Every attempt after that is
treated as free practice: the score/review still shows normally on the
result page, it's just never saved. The result page tells them plainly
which case they're in.

## 7. How the course purchase / enrollment flow works

1. A student opens a paid course and taps **এখনই এনরোল করো**.
2. A popup shows the number to send money to (`01931923910` by default,
   or your `PAYMENT_NUMBER` env var), the course price, and a small form:
   payment method (bKash / Nagad / Rocket), the number they paid from, and
   the transaction ID.
3. Submitting creates a `pending` request in the `enrollments` collection
   and instantly shows "⏳ অনুরোধ পর্যালোচনাধীন" on the course page — the
   exams stay locked until approval.
4. Admin → **এনরোলমেন্ট রিকোয়েস্ট** tab lists every request (filterable by
   pending / approved / declined / all) with the student's name, course,
   payment method, sender number and transaction ID, with **অনুমোদন**
   (approve) / **প্রত্যাখ্যান** (decline) buttons.
5. On approval, the course id is added to that student's `enrolledCourses`
   array — their exams unlock the next time their profile is (re)read
   (the course page also offers a manual "🔄 স্ট্যাটাস যাচাই করো" button so
   they can check without waiting).

## 8. Solve sheet (print / download)

Once a student has attempted an exam at least once, a **সমাধান শীট**
(solve sheet) button appears next to it — on the course page, the result
page right after finishing, and "আমার ফলাফল". It opens `solve-sheet.html`,
a print-ready A4 page with:

- The exam name and course name at the top.
- Every question in a two-column layout with the correct option marked and
  its explanation underneath.
- A repeating `©MAHIN'S CLASSROOM` watermark on every page.
- A **প্রিন্ট / ডাউনলোড করো** button that calls the browser's native print
  dialog — choosing "Save as PDF" there is how students download it; there's
  no separate PDF generation step to maintain.

The page is gated the same way the exam itself is: it queries Firestore
directly for a saved result before showing anything, so it can't be opened
just by guessing an exam's URL — a student must have completed that exam
at least once first, and if they haven't enrolled in its course, the same
Firestore rules that protect `exam.html` block the question data here too.

## 9. Copy protection on exam questions

While taking an exam, the question/option text can't be selected, copied,
cut, or right-click-inspected via the normal browser affordances (CSS
`user-select:none` plus blocked `copy`/`cut`/`contextmenu`/`Ctrl+C` events).
This is a deterrent for casual copying, not a hardened security boundary —
anyone determined enough with browser dev tools can still get at the text,
same as any other client-rendered web page.

## 10. Profile page

The profile page now shows a read-only **profile card** (photo, name,
email, HSC batch, second-timer status, prepared-for) with a pencil icon in
the corner. Tapping it swaps in the same editable form as before, pre-filled
— save to go back to the card view, or "বাতিল" to discard changes.

## 11. Static info pages

`about.html`, `contact.html`, `privacy-policy.html`, and `refund-policy.html`
are plain informational pages, linked from every page's footer, viewable by
anyone without signing in. The refund policy states plainly that approved
enrollments are non-refundable (digital access is granted immediately on
approval); edit the text in these files directly if your actual policies
differ.

## Fonts

- Bangla body text uses **SolaimanLipi** everywhere by default.
- Any question/option/explanation text copied from Bijoy that already
  contains `style="font-family: SutonnyMJ"` (as in the sample file) renders
  in **SutonnyMJ** automatically — both fonts are loaded site-wide, so
  uploading Bijoy-formatted questions needs no extra step.

## Notes & limits

- Deleting a user from the admin panel removes their profile/result data
  from this site but does **not** delete their actual Google/Firebase Auth
  account (that needs a server-side Admin SDK, which a Vercel serverless
  function *could* add later). Disabling the account (toggle in the edit
  form) is the recommended way to block someone — they're signed out on
  their next visit.
- Payment collection here is manual/offline (bKash/Nagad/Rocket + admin
  review) — there is no payment gateway integration, matching how these
  numbers are verified in practice.
- The contact page's email/phone are placeholders (`info.itzmahin@gmail.com`
  and the payment number) — swap in real support contacts if different.

©MAHIN'S CLASSROOM
