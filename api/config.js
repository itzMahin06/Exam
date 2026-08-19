// Vercel serverless function.
// Reads Firebase config from Environment Variables set in the Vercel
// project dashboard (Settings → Environment Variables) instead of
// committing them to the GitHub repo.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    adminEmail: process.env.ADMIN_EMAIL || "info.itzmahin@gmail.com",
    paymentNumber: process.env.PAYMENT_NUMBER || "01931923910"
  });
}
