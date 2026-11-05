"use strict";
/* ---------- core: state, helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CUR = "ر.س";
const ROLES = { admin: "مدير", custodian: "أمين عهدة", pending: "بانتظار التفعيل" };
const CATS = ["مشتريات ومستلزمات", "نقل ومواصلات", "ضيافة", "صيانة", "اتصالات وإنترنت", "رسوم حكومية", "سفر وإقامة", "أخرى"];
const TABS = [
  ["home", "لوحة التحكم", '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
  ["custodies", "العهد", '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M3 13h18"/>'],
  ["vouchers", "السندات", '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"/>'],
  ["statement", "كشف الحساب", '<path d="M4 4h16v16H4zM4 9h16M9 9v11"/>'],
  ["users", "المستخدمون", '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.8.6 3 2.3 3 5.2"/>']
];
const PALS = [["teal", "أخضر مزرق", "#0F5257"], ["blue", "أزرق", "#1F4E9C"], ["green", "أخضر", "#2F6B2A"], ["plum", "بنفسجي", "#6B2D7A"], ["rust", "برتقالي محروق", "#A34A1E"]];

const S = { session: null, me: null, profiles: {}, custodies: [], entries: [], loaded: false, err: "", adminExists: true };
const ui = { tab: "home", period: "month", custody: "all", sheet: null, q: "", kind: "all", from: "", to: "", stmtCustody: "", showVoucher: null, confirm: null, created: null, signup: false, busy: false, prefill: "" };
let curPal = "teal";

const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const fmt = n => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n, cls = "") => `<span class="num ${cls}">${fmt(n)}</span><span class="cur">${CUR}</span>`;
const dnum = d => `<span class="num">${esc(d)}</span>`;
const pad = (n, w = 4) => String(n).padStart(w, "0");
const vno = e => { const c = S.custodies.find(x => x.id === e.custodyId); return (c && c.cn ? "ع" + c.cn + "/" : "") + (e.kind === "topup" ? "إ-" : "س-") + pad(e.seq || 0); };
const roleOf = () => (S.me && S.me.active ? S.me.role : null);
const isAdminRole = () => roleOf() === "admin";
const canWrite = () => true;
const nameOf = id => (id && S.profiles[id] && S.profiles[id].name) || (id ? "مستخدم" : "");
const custodyById = id => S.custodies.find(c => c.id === id);
const visibleCustodies = () => {
  const r = roleOf();
  if (r === "admin") return S.custodies;
  if (r === "custodian") return S.custodies.filter(c => c.holderId === S.me.id);
  return [];
};
const visibleIds = () => new Set(visibleCustodies().map(c => c.id));
function totals(custodyId) {
  let rec = 0, sp = 0, n = 0;
  for (const e of S.entries) {
    if (e.custodyId !== custodyId || e.status === "cancelled") continue;
    if (e.kind === "topup") rec += e.amount; else { sp += e.amount; n++; }
  }
  return { rec, sp, n, bal: rec - sp };
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 3000);
}
function errMsg(e) {
  const m = String((e && e.message) || e || "");
  if (m.includes("insufficient_balance")) return "المبلغ أكبر من رصيد العهدة المتاح";
  if (m.includes("would_overdraw")) return "لا يمكن إلغاء هذا المبلغ لأن الرصيد سيصبح سالباً";
  if (m.includes("forbidden") || m.includes("row-level security")) return "ليست لديك صلاحية لهذه العملية";
  if (m.includes("foreign key")) return "لا يمكن الحذف لوجود حركات أو عهد مرتبطة";
  if (m.includes("Invalid login")) return "اسم المستخدم أو كلمة المرور غير صحيحة";
  if (m.includes("Email not confirmed")) return "الحساب غير مفعّل. عطّل خيار Confirm email في إعدادات Supabase.";
  if (m.includes("already registered") || m.includes("already been registered")) return "اسم المستخدم مستخدم من قبل";
  if (m.includes("Password should be")) return "كلمة المرور قصيرة. استخدم ٦ أحرف على الأقل.";
  if (m.includes("Failed to fetch") || m.includes("NetworkError")) return "تعذر الاتصال. تحقق من الإنترنت.";
  return "تعذر تنفيذ العملية. " + m;
}
function nextSeq(kind, cid) {
  let m = 0; for (const e of S.entries) if (e.kind === kind && e.custodyId === cid && (e.seq || 0) > m) m = e.seq;
  return m + 1;
}
function periodRange(p) {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  const s = x => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  if (p === "month") return [s(new Date(y, m, 1)), "9999"];
  if (p === "q") return [s(new Date(y, m - 2, 1)), "9999"];
  if (p === "year") return [s(new Date(y, 0, 1)), "9999"];
  return ["0000", "9999"];
}
function csvCell(v) { v = String(v ?? ""); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
const APP_URL = () => location.origin + location.pathname;
function genPassword() {
  const a = "abcdefghjkmnpqrstuvwxyz", n = "23456789", all = a + a.toUpperCase() + n;
  const rnd = k => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] % k; };
  let p = ""; for (let i = 0; i < 9; i++) p += all[rnd(all.length)];
  return p + n[rnd(n.length)];
}
