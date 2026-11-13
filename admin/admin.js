// ============================================================
//  Leads admin for the project-1 landing page.
//
//  Reads every lead in LEADS_COLLECTION and keeps the list LIVE (onSnapshot):
//  when the Cloud Function writes a CRM result, the page updates by itself.
//
//  "Push to CRM" does NOT call the CRM from the browser. It only sets
//  `retryRequestedAt` on the lead. That change fires the Cloud Function
//  (BusniessLab-Server/functions/service/project-1.js), which does the push
//  and writes crmPushed / crmError back on the lead.
// ============================================================
import { db, DEMO_MODE, LEADS_COLLECTION, LANDING_PAGE_ID } from "../js/firebase-config.js";
import {
  collection, doc, onSnapshot, serverTimestamp, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const PAGE_SIZE = 25;

/* ---------------- Page elements ---------------- */
const $ = (id) => document.getElementById(id);
const statCards = $("stat-cards");
const qualifyPanel = $("qualify-panel");
const utmPanel = $("utm-panel");
const statusPanel = $("status-panel");
const tbody = $("leads-table-body");
const pager = $("pagination");
const searchInput = $("lead-search");
const channelSelect = $("channel-select");
const filterTabs = document.querySelectorAll(".filter-tab");
const modal = $("lead-modal");
const modalTitle = $("lead-modal-title");
const modalBody = $("lead-modal-body");
const crmPushBtn = $("crm-push-btn");
const crmPushMsg = $("crm-push-msg");

$("landing-page-id").textContent = LANDING_PAGE_ID;

/* ---------------- State ---------------- */
let allLeads = [];
let channel = "all";     // all | google | meta | other
let filter = "all";      // all | verified | unverified | not-in-crm | crm-failed
let search = "";
let page = 1;
let openLeadId = null;   // lead shown in the modal
let pushMessage = null;  // { ok, text } shown under the modal after clicking Push

/* ---------------- Formatting helpers ---------------- */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate(); // Firestore Timestamp
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDateTime(value) {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
  }).format(d);
}

function display(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value.toDate === "function") return fmtDateTime(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
};
const badge = (label, tone = "slate") =>
  `<span class="inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${TONES[tone]}">${escapeHtml(label)}</span>`;

/* ---------------- Lead status ---------------- */
const isVerified = (l) => l.isVerified === true;

/** "synced" | "failed" | "not-pushed" — written by the Cloud Function. */
function crmState(l) {
  if (l.crmPushed === true) return "synced";
  if (l.crmError) return "failed";
  return "not-pushed";
}

const verificationBadge = (l) => (isVerified(l) ? badge("Verified (OTP)", "green") : badge("Not verified", "amber"));
function crmBadge(l) {
  const state = crmState(l);
  if (state === "synced") return badge(`CRM: Synced${l.crmPushedAs === "unverified" ? " (unverified)" : ""}`, "green");
  if (state === "failed") return badge("CRM: Failed", "red");
  return badge("CRM: Not pushed", "slate");
}
function answerBadge(label, value) {
  if (value === "Yes") return badge(`${label}: Yes`, "green");
  if (value === "No") return badge(`${label}: No`, "amber");
  return badge(`${label}: —`);
}

/** Which ad channel a lead came from: utm_source first, then click ids, otherwise "other". */
function channelOf(l) {
  const source = String(l.utmSource || "").toLowerCase();
  if (/(^|[^a-z])(meta|facebook|fb|instagram|ig)([^a-z]|$)/.test(source)) return "meta";
  if (/(^|[^a-z])(google|gads|adwords)([^a-z]|$)/.test(source)) return "google";
  if (l.fbclid) return "meta";
  if (l.gclid) return "google";
  return "other";
}

/* ---------------- Filtering ---------------- */
const channelLeads = () => (channel === "all" ? allLeads : allLeads.filter((l) => channelOf(l) === channel));

function filteredLeads() {
  const list = channelLeads().filter((l) => {
    if (filter === "verified") return isVerified(l);
    if (filter === "unverified") return !isVerified(l);
    if (filter === "not-in-crm") return crmState(l) !== "synced";
    if (filter === "crm-failed") return crmState(l) === "failed";
    return true;
  });
  if (!search) return list;
  return list.filter((l) =>
    [l.name, l.email, l.phone, l.utmSource, l.utmMedium, l.utmCampaign, l.gclid, l.fbclid, l.crmError, l.id]
      .join(" ").toLowerCase().includes(search));
}

/* ---------------- Stats and panels ---------------- */
function tally(list, pick) {
  const counts = {};
  list.forEach((l) => {
    const key = String(pick(l) ?? "").trim() || "—";
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function statCard(label, value, sub, accent = "text-slate-900") {
  return `
    <div class="rounded-xl border border-slate-200 bg-white p-5">
      <p class="text-sm font-medium text-slate-500">${escapeHtml(label)}</p>
      <p class="mt-1 text-2xl font-extrabold ${accent}">${value}</p>
      <p class="mt-1 text-xs text-slate-400">${escapeHtml(sub)}</p>
    </div>`;
}

function tallyColumn(title, entries) {
  const rows = entries.slice(0, 6).map(([label, count]) => `
    <li class="flex items-center justify-between gap-2 text-sm">
      <span class="truncate text-slate-600" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
      <span class="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">${count}</span>
    </li>`).join("");
  return `
    <div class="min-w-0">
      <h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-[#0B1340]">${escapeHtml(title)}</h3>
      <ul class="space-y-1.5">${rows || '<li class="text-xs italic text-slate-400">No data</li>'}</ul>
    </div>`;
}

function renderStats() {
  const list = channelLeads();
  const verified = list.filter(isVerified).length;
  const synced = list.filter((l) => crmState(l) === "synced").length;
  const failed = list.filter((l) => crmState(l) === "failed").length;
  const verifiedNotSynced = list.filter((l) => isVerified(l) && crmState(l) !== "synced").length;

  statCards.innerHTML = [
    statCard("Total Leads", list.length, "Everyone who submitted their details"),
    statCard("Verified (OTP)", verified, `${list.length ? Math.round((verified / list.length) * 100) : 0}% of leads`, "text-emerald-600"),
    statCard("Unverified", list.length - verified, "Stay in Firestore unless pushed by hand", "text-amber-600"),
    statCard("In CRM", `${synced} / ${list.length}`,
      failed || verifiedNotSynced ? `${failed} failed · ${verifiedNotSynced} verified not yet in CRM` : "All verified leads synced",
      failed ? "text-red-600" : "text-emerald-600"),
  ].join("");

  qualifyPanel.innerHTML = [
    tallyColumn("GST registered", tally(list, (l) => l.gstRegistered)),
    tallyColumn("Turnover ₹2 Cr+", tally(list, (l) => l.turnover2Cr)),
  ].join("");
  utmPanel.innerHTML = [
    tallyColumn("Sources", tally(list, (l) => l.utmSource)),
    tallyColumn("Mediums", tally(list, (l) => l.utmMedium)),
    tallyColumn("Campaigns", tally(list, (l) => l.utmCampaign)),
  ].join("");
  statusPanel.innerHTML = [
    tallyColumn("Verification", tally(list, (l) => (isVerified(l) ? "Verified" : "Unverified"))),
    tallyColumn("CRM", tally(list, crmState)),
  ].join("");
}

/* ---------------- Table ---------------- */
function leadRow(l) {
  return `
    <tr class="cursor-pointer align-top transition hover:bg-amber-50/50" data-lead-id="${escapeHtml(l.id)}">
      <td class="px-4 py-3.5">
        <div class="font-bold">${escapeHtml(l.name || "N/A")}</div>
        <div class="mt-0.5 text-xs text-slate-500">${escapeHtml(l.email || "—")}</div>
        <div class="text-xs text-slate-500">${escapeHtml(l.phone || "—")}</div>
      </td>
      <td class="px-4 py-3.5">
        <div class="flex flex-wrap gap-1.5">${answerBadge("GST", l.gstRegistered)} ${answerBadge("₹2 Cr+", l.turnover2Cr)}</div>
      </td>
      <td class="px-4 py-3.5 text-xs leading-relaxed text-slate-500">
        <div class="max-w-[200px] truncate"><b class="text-slate-600">S:</b> ${escapeHtml(l.utmSource || "—")}</div>
        <div class="max-w-[200px] truncate"><b class="text-slate-600">M:</b> ${escapeHtml(l.utmMedium || "—")}</div>
        <div class="max-w-[200px] truncate" title="${escapeHtml(l.utmCampaign || "")}"><b class="text-slate-600">C:</b> ${escapeHtml(l.utmCampaign || "—")}</div>
      </td>
      <td class="px-4 py-3.5">
        <div class="flex flex-wrap gap-1.5">${verificationBadge(l)} ${crmBadge(l)}</div>
        <div class="mt-1.5 text-xs text-slate-500">${isVerified(l) ? `Verified ${escapeHtml(fmtDateTime(l.verifiedAt))}` : "OTP not completed"}</div>
      </td>
      <td class="whitespace-nowrap px-4 py-3.5 text-xs text-slate-500">${escapeHtml(fmtDateTime(l.createdAt))}</td>
    </tr>`;
}

function renderTable() {
  const list = filteredLeads();
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  page = Math.min(Math.max(page, 1), pages);
  const start = (page - 1) * PAGE_SIZE;
  const rows = list.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = rows.length
    ? rows.map(leadRow).join("")
    : `<tr><td colspan="5" class="px-4 py-14 text-center text-sm font-medium text-slate-500">No leads found${search ? ` for “${escapeHtml(search)}”` : ""}.</td></tr>`;

  pager.innerHTML = !list.length ? "" : `
    <span class="text-slate-500">Showing <b>${start + 1}</b>–<b>${start + rows.length}</b> of <b>${list.length}</b></span>
    <div class="flex items-center gap-1.5">
      <button data-page="-1" ${page <= 1 ? "disabled" : ""} class="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold transition hover:bg-slate-50 disabled:opacity-40">Prev</button>
      <span class="px-2 font-semibold text-slate-600">Page ${page} / ${pages}</span>
      <button data-page="1" ${page >= pages ? "disabled" : ""} class="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold transition hover:bg-slate-50 disabled:opacity-40">Next</button>
    </div>`;
}

function updateChannelCounts() {
  const count = (ch) => (ch === "all" ? allLeads.length : allLeads.filter((l) => channelOf(l) === ch).length);
  const labels = { all: "All Leads", google: "Google Leads", meta: "Meta Leads", other: "Organic / Other" };
  channelSelect.querySelectorAll("option").forEach((opt) => { opt.textContent = `${labels[opt.value]} (${count(opt.value)})`; });
}

function renderAll() {
  updateChannelCounts();
  renderStats();
  renderTable();
  if (openLeadId) renderModal();
}

/* ---------------- Lead details modal ---------------- */
function row(label, value) {
  const text = display(value);
  const long = text.includes("\n") || text.length > 80;
  return `
    <div class="grid grid-cols-1 gap-1 px-4 py-2.5 sm:grid-cols-[170px_1fr] sm:gap-4">
      <dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(label)}</dt>
      <dd class="${long ? "max-h-56 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 font-mono text-xs" : "break-words text-sm"}">${
        text === "—" ? '<span class="text-slate-400">—</span>' : escapeHtml(text)}</dd>
    </div>`;
}
const htmlRow = (label, html) => `
  <div class="grid grid-cols-1 gap-1 px-4 py-2.5 sm:grid-cols-[170px_1fr] sm:gap-4">
    <dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(label)}</dt>
    <dd class="text-sm">${html}</dd>
  </div>`;
const section = (title, rows) => `
  <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <h3 class="border-b border-slate-100 px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-[#0B1340]">${escapeHtml(title)}</h3>
    <dl class="divide-y divide-slate-100">${rows.join("")}</dl>
  </div>`;

function urlParamRows(l) {
  const entries = Object.entries(l.landingPageParams || {});
  return entries.length
    ? entries.map(([k, v]) => row(k, v))
    : ['<div class="px-4 py-3 text-sm text-slate-400">Direct — no query parameters on the landing URL.</div>'];
}

function renderModal() {
  const l = allLeads.find((lead) => lead.id === openLeadId);
  if (!l) return closeModal();
  modalTitle.textContent = l.name || "Lead";

  modalBody.innerHTML = [
    section("Contact", [row("Name", l.name), row("Email", l.email), row("Phone / WhatsApp", l.phone), row("Product", l.product)]),
    section("Qualification (popup questions)", [
      htmlRow("GST-registered business", answerBadge("GST", l.gstRegistered)),
      htmlRow("Turnover ₹2 crore or more", answerBadge("₹2 Cr+", l.turnover2Cr)),
    ]),
    section("Verification", [
      htmlRow("Status", verificationBadge(l)),
      row("Verified At", l.verifiedAt),
      row("Wrong OTP Attempts", l.otpVerificationAttempts),
      row("Last Code Sent", l.otpCreatedAt),
      row("Lead Status", l.leadStatus),
    ]),
    section("CRM Sync", [
      htmlRow("Status", crmBadge(l)),
      row("Pushed At", l.crmPushedAt),
      row("Pushed As", l.crmPushedAs),
      row("Contact ID", l.crmContactId),
      row("Error", l.crmError),
      row("Failed Attempts", l.crmAttempts),
      row("Manual Push Requested", l.retryRequestedAt ? new Date(l.retryRequestedAt) : ""),
    ]),
    section("Attribution", [
      row("UTM Source", l.utmSource), row("UTM Medium", l.utmMedium), row("UTM Campaign", l.utmCampaign),
      row("UTM Term", l.utmTerm), row("UTM Content", l.utmContent),
      row("gclid", l.gclid), row("fbclid", l.fbclid), row("fbp", l.fbp), row("fbc", l.fbc),
      row("Ad ID", l.adId), row("Ad Set ID", l.adsetId), row("Campaign ID", l.campaignId),
      row("Referrer", l.referrer),
    ]),
    section("URL Parameters", urlParamRows(l)),
    section("Technical", [
      row("Lead ID", l.id), row("Landing Page ID", l.landingPageId), row("Landing Page URL", l.landingPageUrl),
      row("Created At", l.createdAt), row("Updated At", l.updatedAt), row("Timezone", l.timezone), row("User Agent", l.userAgent),
    ]),
  ].join("");

  // Push button: works for every lead. An unverified one gets a warning first.
  crmPushBtn.textContent = crmState(l) === "not-pushed" ? "Push to CRM" : "Re-push to CRM";
  if (pushMessage) {
    crmPushMsg.textContent = pushMessage.text;
    crmPushMsg.className = `text-xs font-semibold sm:mr-auto ${pushMessage.ok ? "text-emerald-700" : "text-red-600"}`;
  } else {
    crmPushMsg.textContent = isVerified(l) ? "" : "This lead has not verified their phone. Push only if it looks relevant.";
    crmPushMsg.className = "text-xs font-semibold text-slate-500 sm:mr-auto";
  }
}

function openModal(id) {
  openLeadId = id;
  pushMessage = null;
  crmPushBtn.disabled = false;
  renderModal();
  modal.classList.replace("hidden", "flex");
  modalBody.scrollTop = 0;
}

function closeModal() {
  openLeadId = null;
  pushMessage = null;
  modal.classList.replace("flex", "hidden");
}

/** Asks the Cloud Function to push this lead: it watches for retryRequestedAt to change. */
async function requestCrmPush() {
  const l = allLeads.find((lead) => lead.id === openLeadId);
  if (!l) return;
  if (!isVerified(l) && !confirm(`${l.name || "This lead"} has NOT verified their phone number.\n\nPush to the CRM anyway?`)) return;

  crmPushBtn.disabled = true;
  crmPushBtn.textContent = "Requesting…";
  try {
    await updateDoc(doc(db, LEADS_COLLECTION, l.id), { retryRequestedAt: Date.now(), updatedAt: serverTimestamp() });
    pushMessage = { ok: true, text: "Push requested. The CRM status updates here within a few seconds." };
  } catch (err) {
    console.error("Push request failed:", err);
    pushMessage = { ok: false, text: "Couldn't request the push. Check the Firestore rules for this collection." };
  }
  crmPushBtn.disabled = false;
  renderModal();
}

/* ---------------- CSV export ---------------- */
function exportCsv() {
  const columns = [
    ["Lead ID", (l) => l.id], ["Name", (l) => l.name], ["Email", (l) => l.email], ["Phone", (l) => l.phone],
    ["GST Registered", (l) => l.gstRegistered], ["Turnover ₹2 Cr+", (l) => l.turnover2Cr],
    ["Verified", (l) => (isVerified(l) ? "Yes" : "No")], ["Verified At", (l) => fmtDateTime(l.verifiedAt)],
    ["CRM Status", crmState], ["CRM Pushed As", (l) => l.crmPushedAs], ["CRM Error", (l) => l.crmError],
    ["UTM Source", (l) => l.utmSource], ["UTM Medium", (l) => l.utmMedium], ["UTM Campaign", (l) => l.utmCampaign],
    ["UTM Term", (l) => l.utmTerm], ["UTM Content", (l) => l.utmContent], ["gclid", (l) => l.gclid], ["fbclid", (l) => l.fbclid],
    ["Referrer", (l) => l.referrer], ["Landing URL", (l) => l.landingPageUrl], ["Created At", (l) => fmtDateTime(l.createdAt)],
  ];
  const lines = [columns.map(([header]) => header), ...filteredLeads().map((l) => columns.map(([, pick]) => pick(l)))]
    .map((cells) => cells.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","));

  const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" }));
  const a = Object.assign(document.createElement("a"), {
    href: url, download: `${LANDING_PAGE_ID}_${channel}_${filter}_${new Date().toISOString().slice(0, 10)}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------------- Wiring ---------------- */
function paintFilterTabs() {
  filterTabs.forEach((btn) => {
    const on = btn.dataset.filter === filter;
    btn.classList.toggle("bg-[#0B1340]", on);
    btn.classList.toggle("text-white", on);
    btn.classList.toggle("text-slate-600", !on);
  });
}

filterTabs.forEach((btn) => btn.addEventListener("click", () => {
  filter = btn.dataset.filter;
  page = 1;
  paintFilterTabs();
  renderTable();
}));
channelSelect.addEventListener("change", () => { channel = channelSelect.value; page = 1; renderAll(); });

let searchTimer = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { search = searchInput.value.trim().toLowerCase(); page = 1; renderTable(); }, 180);
});

pager.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-page]");
  if (btn && !btn.disabled) { page += Number(btn.dataset.page); renderTable(); }
});
tbody.addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-lead-id]");
  if (tr) openModal(tr.dataset.leadId);
});
modal.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", closeModal));
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openLeadId) closeModal(); });
crmPushBtn.addEventListener("click", requestCrmPush);
$("export-csv").addEventListener("click", exportCsv);
paintFilterTabs();

/* ---------------- Load leads (live) ---------------- */
function showLoadError(message) {
  tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-14 text-center text-sm font-medium text-red-600">${escapeHtml(message)}</td></tr>`;
  statCards.innerHTML = "";
}

if (DEMO_MODE) {
  showLoadError("Firebase is not connected yet. Fill in the config in js/firebase-config.js.");
} else {
  // Every lead, newest first. Sorted in the browser, so no Firestore index is needed.
  onSnapshot(
    collection(db, LEADS_COLLECTION),
    (snapshot) => {
      allLeads = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
      renderAll();
    },
    (err) => {
      console.error("Loading leads failed:", err);
      showLoadError("Unable to load leads. Check the Firestore rules allow reading this collection.");
    },
  );
}
