// ============================================================
//  Registration popup:
//    Step 1 (GST?) → Step 2 (turnover?) → Step 3 (details) → Step 4 (OTP) → thank-you page
//
//  What happens to the data:
//    Step 3 submitted → lead saved in Firestore with isVerified: false   (stays in Firestore only)
//    Step 4 correct   → same lead updated to isVerified: true
//                       → that change fires the Cloud Function that pushes it to the CRM
//                         (BusniessLab-Server/functions/service/project-1.js)
// ============================================================
import {
  newLeadId, createLead, updateLeadDetails, markLeadVerified, recordOtpSent, recordWrongOtp,
  generateOtp, sendOtpSms, rememberAttribution,
} from "./lead-service.js";

// If the visitor arrived from an ad, keep that ad's details for when they register.
rememberAttribution();

const THANK_YOU_URL = "thank-you.html";
const RESEND_SECONDS = 30;
const OTP_VALID_MINUTES = 10;
const MAX_WRONG_ATTEMPTS = 5;

/* ---------------- Page elements ---------------- */
const modal = document.getElementById("qualifyModal");
const form = document.getElementById("qualifyForm");
const steps = form.querySelectorAll(".q");
const otpInputs = form.querySelectorAll("[data-otp] input");
const resendBtn = form.querySelector("[data-resend]");
const resendLabel = form.querySelector("[data-resend-timer]");

/* ---------------- What we remember while the visitor fills the popup ---------------- */
const state = {
  leadId: null,       // Firestore document id, set once the lead is really saved
  details: null,      // { name, email, phone, gstRegistered, turnover2Cr }
  otp: null,          // the code we sent
  otpExpiresAt: 0,
  wrongAttempts: 0,
};
let resendTimer = null;

/* ---------------- Small UI helpers ---------------- */
const field = (name) => form.elements.namedItem(name);
const stepEl = (n) => form.querySelector(`.q[data-step="${n}"]`);
const setError = (n, message) => { stepEl(n).querySelector(".q-error").textContent = message || ""; };

function showStep(n) {
  steps.forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
  const firstInput = stepEl(n).querySelector("input:not([type=radio])");
  if (firstInput) setTimeout(() => firstInput.focus(), 50);
}

function setLoading(btn, on, text) {
  if (on) {
    btn.dataset.label = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.label || btn.textContent;
    btn.disabled = false;
  }
}

/* ---------------- Open / close ---------------- */
function openModal(e) {
  if (e) e.preventDefault();
  form.reset();
  form.querySelectorAll(".q-error").forEach((el) => { el.textContent = ""; });
  showStep(1);
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.classList.remove("open");
  document.body.style.overflow = "";
}

document.querySelectorAll("[data-popup]").forEach((btn) => btn.addEventListener("click", openModal));
modal.querySelector(".modal-close").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

/* ---------------- Steps 1 & 2: Yes / No questions ---------------- */
function answered(step, name) {
  if (!field(name).value) {
    setError(step, "Please select Yes or No to continue.");
    return false;
  }
  setError(step, "");
  return true;
}

stepEl(1).querySelector("[data-next]").addEventListener("click", () => { if (answered(1, "gst")) showStep(2); });
stepEl(2).querySelector("[data-next]").addEventListener("click", () => { if (answered(2, "turnover")) showStep(3); });

/* ---------------- Step 3: details → save lead → send OTP ---------------- */
field("phone").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10); });

/** Reads and checks step 3. Returns the details, or null (and shows an error) if something is wrong. */
function readDetails() {
  const name = field("name").value.trim().replace(/\s+/g, " ");
  const email = field("email").value.trim().toLowerCase();
  const phone = field("phone").value.trim();

  if (name.length < 2) { setError(3, "Please enter your full name."); return null; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError(3, "Please enter a valid email address."); return null; }
  if (!/^[6-9]\d{9}$/.test(phone)) { setError(3, "Please enter a valid 10-digit mobile number."); return null; }

  setError(3, "");
  return { name, email, phone, gstRegistered: yesNo(field("gst").value), turnover2Cr: yesNo(field("turnover").value) };
}

/** The radios say "yes" / "no"; leads store "Yes" / "No" (same as the expl page). */
const yesNo = (value) => (value === "yes" ? "Yes" : "No");

async function submitDetails(btn) {
  const details = readDetails();
  if (!details) return;

  setLoading(btn, true, "Saving your details…");
  try {
    if (state.leadId) {
      // Came back with "Change number": update the SAME lead instead of creating a second one.
      await updateLeadDetails(state.leadId, details);
    } else {
      const id = newLeadId();
      await createLead(id, details);
      state.leadId = id; // remember it only once the save really worked
    }
    state.details = details;

    btn.textContent = "Sending code…";
    await sendNewOtp();

    form.querySelector("[data-phone-label]").textContent = "+91 " + details.phone;
    otpInputs.forEach((input) => { input.value = ""; });
    setError(4, "");
    showStep(4);
  } catch (err) {
    console.error(err);
    setError(3, "Something went wrong. Please check your connection and try again.");
  } finally {
    setLoading(btn, false);
  }
}

stepEl(3).querySelector("[data-next]").addEventListener("click", (e) => submitDetails(e.currentTarget));
form.querySelector("[data-back]").addEventListener("click", () => showStep(3));

/* ---------------- OTP: create, send, resend ---------------- */
async function sendNewOtp() {
  state.otp = generateOtp();
  state.otpExpiresAt = Date.now() + OTP_VALID_MINUTES * 60 * 1000;
  state.wrongAttempts = 0;
  await sendOtpSms(state.details.phone, state.otp);
  startResendTimer();
  // Bookkeeping for the admin page. If it fails, the visitor can still continue.
  recordOtpSent(state.leadId, state.otpExpiresAt).catch((err) => console.warn("recordOtpSent failed", err));
}

function startResendTimer() {
  let left = RESEND_SECONDS;
  resendBtn.disabled = true;
  resendLabel.textContent = `(${left}s)`;
  clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    left -= 1;
    resendLabel.textContent = left > 0 ? `(${left}s)` : "";
    if (left <= 0) {
      clearInterval(resendTimer);
      resendBtn.disabled = false;
    }
  }, 1000);
}

resendBtn.addEventListener("click", async () => {
  resendBtn.disabled = true;
  try {
    await sendNewOtp();
    setError(4, "");
  } catch (err) {
    console.error(err);
    setError(4, "Could not send a new code. Please try again.");
    resendBtn.disabled = false;
  }
});

/* ---------------- OTP boxes: auto-advance, backspace, paste ---------------- */
otpInputs.forEach((input, i) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(-1);
    if (input.value && otpInputs[i + 1]) otpInputs[i + 1].focus();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !input.value && otpInputs[i - 1]) otpInputs[i - 1].focus();
  });
  input.addEventListener("paste", (e) => {
    const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    digits.split("").forEach((d, k) => { if (otpInputs[k]) otpInputs[k].value = d; });
    otpInputs[digits.length - 1].focus();
  });
});

/* ---------------- Step 4: check the code → mark verified → thank-you page ---------------- */

/** Returns an error message, or "" when the code is correct. */
function checkCode(code) {
  if (code.length !== 6) return "Please enter the 6-digit code.";
  if (Date.now() > state.otpExpiresAt) return "This code has expired. Tap “Resend code” to get a new one.";
  if (state.wrongAttempts >= MAX_WRONG_ATTEMPTS) return "Too many wrong attempts. Tap “Resend code” to get a new one.";
  if (code !== state.otp) {
    state.wrongAttempts += 1;
    recordWrongOtp(state.leadId, state.wrongAttempts).catch((err) => console.warn("recordWrongOtp failed", err));
    const left = MAX_WRONG_ATTEMPTS - state.wrongAttempts;
    return left > 0
      ? `That code is incorrect. ${left} attempt${left === 1 ? "" : "s"} left.`
      : "Too many wrong attempts. Tap “Resend code” to get a new one.";
  }
  return "";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (stepEl(4).hidden) return; // pressing Enter on earlier steps does nothing

  const code = Array.from(otpInputs, (input) => input.value).join("");
  const problem = checkCode(code);
  if (problem) return setError(4, problem);

  const btn = form.querySelector("button[type=submit]");
  setLoading(btn, true, "Verifying…");
  try {
    await markLeadVerified(state.leadId);

    // The thank-you page reads this to personalise its message.
    const { name, email, phone } = state.details;
    try { sessionStorage.setItem("bsb_lead", JSON.stringify({ name, email, phone: "+91" + phone })); } catch { /* storage blocked */ }
    window.location.href = `${THANK_YOU_URL}?name=${encodeURIComponent(name.split(" ")[0])}`;
  } catch (err) {
    console.error(err);
    setLoading(btn, false);
    setError(4, "Your code is correct, but we couldn't confirm it. Please tap Verify again.");
  }
});
