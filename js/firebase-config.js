
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// const firebaseConfig = {
//   apiKey: "YOUR_API_KEY",
//   authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
//   projectId: "YOUR_PROJECT_ID",
//   storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
//   messagingSenderId: "YOUR_SENDER_ID",
//   appId: "YOUR_APP_ID",
// };
const firebaseConfig = {
  apiKey: "AIzaSyAYaapYNFYyaYdMjSPvWATNJWlmADVMMP4",
  authDomain: "business-labs.firebaseapp.com",
  projectId: "business-labs",
  storageBucket: "business-labs.firebasestorage.app",
  messagingSenderId: "236065431433",
  appId: "1:236065431433:web:bc293dede0e88eef8a8b58",
  measurementId: "G-F07DNBNQW4",
};
// Firestore collection every lead from this page is saved in.
// The same name is used in BusniessLab-Server/functions/service/project-1.js. If you rename it, rename it there too.
export const LEADS_COLLECTION = "google-leads-project-1";

// Saved on each lead so you can always tell which page it came from.
export const LANDING_PAGE_ID = "bsb-mumbai-22nov-project-1";

// SMS service on the Render server (the same one the expl page uses).
export const SEND_OTP_URL = "https://busniesslab-server.onrender.com/api/sms/send-otp";

export const DEMO_MODE = firebaseConfig.projectId === "YOUR_PROJECT_ID";

export const db = DEMO_MODE ? null : getFirestore(initializeApp(firebaseConfig));
