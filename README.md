# Exam | MAHIN'S CLASSROOM

A user-based online exam website: Google sign-in, profile setup, timed MCQ
exams with a locked-answer OMR-style interface, instant results, a
leaderboard, and an admin panel to upload exams and manage students —
all backed by Firebase (Auth + Firestore), read-optimised with browser
caching, and deployable as a static site on GitHub Pages.

## 1. Create your Firebase project

1. Go to https://console.firebase.google.com → **Add project** → follow the wizard.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.**
   Set a support email and save.
3. **Build → Firestore Database → Create database** → start in **production mode**
   (rules are provided below) → pick a region close to Bangladesh (e.g. `asia-south1`).
4. **Project settings (gear icon) → General → Your apps → Web (`</>`)** → register
   an app (no need for Hosting) → copy the `firebaseConfig` object shown.
5. Paste those values into `assets/js/firebase-config.js` in this project,
   replacing the placeholder strings.
6. **Authentication → Settings → Authorized domains** → add your GitHub Pages
   domain, e.g. `yourusername.github.io`.

The admin email is already wired to **info.itzmahin@gmail.com** — the first
time that Google account signs in, it is automatically given the `admin`
role and can open `admin.html`. Everyone else signs up as a normal student.

## 2. Add the security rules

Firestore console → **Rules** tab → replace the contents with the file
`firestore.rules` from this project → **Publish**.

The rules make sure:
- Students can only read/edit their own profile.
- Only the admin account can write exams or edit/delete other users.
- A result can only be created by the signed-in student it belongs to,
  and only stores the aggregate `score / correct / wrong / unanswered`
  fields — never the individual answers, keeping writes small.

## 3. Composite indexes

Two queries (the leaderboard and "my results") need composite indexes.
The easiest way: just use the site — Firestore will show a red error in
the browser console with a **direct link** that creates the exact index
needed, the first time each query runs. Click it, wait ~1 minute, retry.

Alternatively, if you use the Firebase CLI, `firestore.indexes.json` in
this project already lists both indexes and can be deployed with
`firebase deploy --only firestore:indexes`.

## 4. How reads are minimised (per your request)

- The exam list is **not** one read per exam — a single document
  `meta/examsIndex` stores the summary (title, duration, question count)
  for every exam, so listing exams costs exactly **one read**.
- Every read (exam list, a specific exam's questions, leaderboard, "my
  results") is cached in the browser's `localStorage` the first time it's
  fetched. Every later visit reads from the cache — Firestore is not hit
  again until the person taps a **🔄 রিফ্রেশ** button, which clears just
  that cached key first.
- While taking an exam, the questions are read from Firestore once (or
  from cache if already read before) and everything else — locking
  answers, the navigator, the timer, scoring — happens entirely in the
  browser. Only one small `results` document is written at the end.
- The full review (question-by-question correct/wrong + explanations) is
  kept in `sessionStorage` for the result page — it is never written to
  Firestore, only the aggregate score is.

## 5. Upload your first exam

1. Sign in with the admin Google account → open **অ্যাডমিন** in the nav.
2. Go to **পরীক্ষা আপলোড**, fill in the title/subject/duration, and choose
   a JSON file where each question looks like:

```json
{
  "question": "<span style=\"font-family: SutonnyMJ\">...</span>",
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "correct_answer": "C",
  "explanation": "...",
  "uddipok": ""
}
```

   `assets/data/sample-exam.json` (a copy of the file you uploaded) is
   included in this project as a ready-to-use example — just pick it in
   the upload form.

## 6. Deploy to GitHub Pages

1. Create a new GitHub repository and push this entire folder to it.
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** →
   branch `main`, folder `/ (root)` → **Save**.
3. Wait a minute, then visit `https://yourusername.github.io/your-repo/`.
4. Don't forget step 1.6 above — add that exact domain to Firebase's
   authorized domains, or Google sign-in will be blocked.

## Fonts

- Bangla body text uses **SolaimanLipi** everywhere by default.
- Any question/option/explanation text copied from Bijoy that already
  contains `style="font-family: SutonnyMJ"` (as in the sample file)
  renders in **SutonnyMJ** automatically, because both fonts are loaded
  site-wide as web fonts — you don't need to change anything when
  uploading Bijoy-formatted questions.

## Notes & limits

- Deleting a user from the admin panel removes their profile/result data
  from this site, but does **not** delete their actual Google/Firebase
  Auth account (that requires a server-side Admin SDK / Cloud Function,
  which a static GitHub Pages site can't run on its own). Disabling the
  account (the toggle in the edit form) is the recommended way to block
  someone — they'll be signed out immediately on their next visit.
- This is a fully static site (no backend server), so everything runs in
  the visitor's browser talking directly to Firebase.

©MAHIN'S CLASSROOM
