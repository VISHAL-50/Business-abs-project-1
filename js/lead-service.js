// ============================================================
//  Everything that talks to the outside world:
//    • Firestore  – save the lead, update it, record OTP progress, mark it verified
//    • SMS        – send the OTP through the Render server
//
//  The popup (lead-form.js) only calls these functions, so it never
//  needs to know how Firestore or the SMS service work.
//
//  A lead document has the same fields as the expl page's leads
//  (name/phone variants, attribution, OTP progress, status flags), so the
//  admin page and the Cloud Function can read it the same way.
// ============================================================
import {
  collection, doc, setDoc, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db, DEMO_MODE, LEADS_COLLECTION, LANDING_PAGE_ID, SEND_OTP_URL } from "./firebase-config.js";

const PRODUCT_NAME = "Business ScaleUp Blueprint";
const FIRESTORE_TIMEOUT_MS = 15000;
// The Render server may be asleep and need time to wake up.
const SMS_TIMEOUT_MS = 60000;

/* ---------------- Firestore ---------------- */

const leadDoc = (id) => doc(db, LEADS_COLLECTION, id);

/** A new, unused document id. No network call. */
export function newLeadId() {
  if (DEMO_MODE) return "demo-" + Date.now();
  return doc(collection(db, LEADS_COLLECTION)).id;
}

/**
 * First save: creates the lead as UNVERIFIED.
 * An unverified lead stays in Firestore only (the admin page can still push it by hand).
 */
export async function createLead(id, details) {
  const attribution = getAttribution();
  const lead = {
    ...contactFields(details),
    product: PRODUCT_NAME,
    ...attribution,
    currentUrl: attribution.landingPageUrl,
    pageUrl: attribution.landingPageUrl,
    landingPageId: LANDING_PAGE_ID,
    leadStatus: "lead_submitted",
    leadSource: "landing_page",
    source: "index-popup",
    isVerified: false,
    verifiedAt: null,
    otpVerificationAttempts: 0,
    crmPushed: false, // the Cloud Function sets it to true after a successful push
    detailsSubmittedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdAtIso: new Date().toISOString(),
  };
  if (DEMO_MODE) return console.info("[DEMO MODE] would create lead", id, lead);
  await withTimeout(setDoc(leadDoc(id), lead));
}

/** The visitor went back ("Change number") and edited their details: update the same lead. */
export async function updateLeadDetails(id, details) {
  const changes = { ...contactFields(details), updatedAt: serverTimestamp() };
  if (DEMO_MODE) return console.info("[DEMO MODE] would update lead", id, changes);
  await withTimeout(updateDoc(leadDoc(id), changes));
}

/** A new code was sent: store when it expires (never the code itself) and reset the attempt count. */
export async function recordOtpSent(id, otpExpiresAt) {
  const changes = { otpExpiresAt, otpVerificationAttempts: 0, otpCreatedAt: serverTimestamp(), updatedAt: serverTimestamp() };
  if (DEMO_MODE) return console.info("[DEMO MODE] would record OTP sent", id, changes);
  await withTimeout(updateDoc(leadDoc(id), changes));
}

/** A wrong code was typed: keep the count on the lead so the admin page can see it. */
export async function recordWrongOtp(id, attempts) {
  const changes = { otpVerificationAttempts: attempts, updatedAt: serverTimestamp() };
  if (DEMO_MODE) return console.info("[DEMO MODE] would record wrong OTP", id, changes);
  await withTimeout(updateDoc(leadDoc(id), changes));
}

/**
 * The OTP was correct: set isVerified to true.
 * This change is what fires the Cloud Function that pushes the lead to the CRM.
 */
export async function markLeadVerified(id) {
  const changes = {
    isVerified: true,
    verifiedAt: serverTimestamp(),
    leadStatus: "otp_verified",
    updatedAt: serverTimestamp(),
  };
  if (DEMO_MODE) return console.info("[DEMO MODE] would mark lead verified", id, changes);
  await withTimeout(updateDoc(leadDoc(id), changes));
}

/** Name / phone are stored under several names, the same way the expl page stores them. */
function contactFields({ name, email, phone, gstRegistered, turnover2Cr }) {
  return {
    name,
    fullName: name,
    email,
    phone,
    phoneNumber: phone,
    whatsappNumber: phone,
    gstRegistered,  // "Yes" | "No"
    turnover2Cr,    // "Yes" | "No"
  };
}

/* ---------------- OTP / SMS ---------------- */

/** A random 6-digit code, e.g. "482913". */
export function generateOtp() {
  const random = crypto.getRandomValues(new Uint32Array(1))[0];
  return String(100000 + (random % 900000));
}

/** Sends the code by SMS. `phone` is the 10-digit number without +91. */
export async function sendOtpSms(phone, otp) {
  if (DEMO_MODE) return console.info(`[DEMO MODE] SMS not sent. Your code is ${otp}`);

  const response = await fetch(SEND_OTP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: "91" + phone, otp }),
    signal: AbortSignal.timeout(SMS_TIMEOUT_MS),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true) {
    throw new Error("SMS service failed: " + (result.error || response.status));
  }
}

/* ---------------- Attribution (where the visitor came from) ---------------- */

const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid",
];
const ATTRIBUTION_KEY = "project-1:attribution";

/**
 * When the visitor lands from an ad, remember that URL. If they browse around and
 * register later (the ad parameters are gone from the address bar), the lead still
 * gets the ad's attribution. Called once when the page loads.
 */
export function rememberAttribution() {
  const params = new URLSearchParams(window.location.search);
  if (!TRACKING_PARAMS.some((key) => getParam(params, key))) return;
  try {
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({
      search: window.location.search,
      url: window.location.href,
      referrer: document.referrer,
      at: Date.now(),
    }));
  } catch { /* storage blocked: the live URL is used instead */ }
}

/** The ad/visit data saved on the lead. Same field names as the expl page. */
function getAttribution() {
  const { params, url, referrer, at } = attributionSource();
  const fbclid = getParam(params, "fbclid");
  return {
    landingPageUrl: url,
    landingPagePath: window.location.pathname,
    landingPageHost: window.location.host,
    landingPageParams: Object.fromEntries(params.entries()),
    referrer,
    userAgent: navigator.userAgent,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    utmSource: getParam(params, "utm_source") || "direct",
    utmMedium: getParam(params, "utm_medium") || "organic",
    utmCampaign: getParam(params, "utm_campaign") || "none",
    utmTerm: getParam(params, "utm_term"),
    utmContent: getParam(params, "utm_content"),
    gclid: getParam(params, "gclid"),          // Google Ads click id
    fbclid,                                     // Meta (Facebook / Instagram) click id
    fbp: getCookie("_fbp"),                     // Meta browser id (set by the Meta pixel)
    fbc: getCookie("_fbc") || (fbclid ? `fb.1.${at}.${fbclid}` : ""),
    msclkid: getParam(params, "msclkid"),       // Microsoft Ads
    ttclid: getParam(params, "ttclid"),         // TikTok
    clickId: getParam(params, "click_id", "clickid", "cid"),
    adsetId: getParam(params, "adset_id", "adsetid"),
    campaignId: getParam(params, "campaign_id", "campaignid"),
    adId: getParam(params, "ad_id", "adid"),
  };
}

/** The current URL if it has ad parameters, otherwise the remembered ad URL, otherwise the current URL. */
function attributionSource() {
  const live = { params: new URLSearchParams(window.location.search), url: window.location.href, referrer: document.referrer, at: Date.now() };
  if (TRACKING_PARAMS.some((key) => getParam(live.params, key))) return live;
  try {
    const saved = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || "null");
    if (saved?.search) {
      return { params: new URLSearchParams(saved.search), url: saved.url, referrer: saved.referrer || "", at: saved.at || Date.now() };
    }
  } catch { /* nothing saved */ }
  return live;
}

/** First non-empty value among `keys`, ignoring upper/lower case ("UTM_Source" works too). */
function getParam(params, ...keys) {
  for (const key of keys) {
    for (const [k, v] of params.entries()) {
      if (k.toLowerCase() === key && v) return v;
    }
  }
  return "";
}

function getCookie(name) {
  const hit = document.cookie.split("; ").find((part) => part.startsWith(name + "="));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : "";
}

/* ---------------- Helpers ---------------- */

/** Firestore waits forever when offline. This gives up after a while so the button never hangs. */
function withTimeout(promise) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Firestore did not answer in time")), FIRESTORE_TIMEOUT_MS));
  return Promise.race([promise, timeout]);
}
