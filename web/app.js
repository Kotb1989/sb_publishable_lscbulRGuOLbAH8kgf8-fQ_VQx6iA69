"use strict";
(function(){
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

/* ---------- data layer (Supabase) ---------- */
const CFG = window.APP_CONFIG || {};
const configured = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && !/YOUR_|xxxx/i.test(CFG.supabaseUrl + CFG.supabaseAnonKey));
const EMAIL_DOMAIN = "@athr-custody.com";
const toEmail = u => { u = String(u).trim(); return u.includes("@") ? u : u.toLowerCase() + EMAIL_DOMAIN; };
const validUser = u => /^[a-z0-9._-]{3,30}$/i.test(String(u).trim());
let sb = null;

const mapP = r => ({ id: r.id, username: r.username, name: r.full_name || r.username, role: r.role, active: r.active !== false });
const mapC = r => ({ id: r.id, cn: r.cn, name: r.name, holderId: r.holder_id, holderLabel: r.holder_label || "", note: r.note || "" });
const mapE = r => ({ id: r.id, custodyId: r.custody_id, kind: r.kind, amount: Number(r.amount), date: r.entry_date, category: r.category || "", beneficiary: r.beneficiary || "", desc: r.description || "", seq: r.seq, status: r.status, by: r.created_by, byName: r.created_by_name || "", createdAt: Date.parse(r.created_at) || 0 });

async function fetchAll(table, col, asc) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select("*").order(col, { ascending: asc }).order("id").range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
async function loadAll() {
  const uid = S.session.user.id;
  const { data: me, error } = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (error) throw error;
  S.me = me ? mapP(me) : null;
  S.custodies = []; S.entries = []; S.profiles = {};
  if (S.me) S.profiles[S.me.id] = S.me;
  if (S.me && S.me.active && S.me.role !== "pending") {
    const admin = S.me.role === "admin";
    const [cs, es, ps] = await Promise.all([
      fetchAll("custodies", "cn", true),
      fetchAll("entries", "created_at", false),
      admin ? fetchAll("profiles", "created_at", true) : Promise.resolve([])
    ]);
    S.custodies = cs.map(mapC);
    S.entries = es.map(mapE);
    ps.forEach(p => { S.profiles[p.id] = mapP(p); });
  }
  S.loaded = true;
}
/* ---------- auth ---------- */
async function checkAdminExists() {
  try {
    const { data, error } = await sb.rpc("admin_exists");
    if (error) throw error;
    S.adminExists = !!data;
  } catch (e) { S.adminExists = true; }
}
async function doLogin(username, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email: toEmail(username), password });
  if (error) throw error;
  S.session = data.session;
}
async function doSignup(username, fullName, password) {
  const { data, error } = await sb.auth.signUp({ email: toEmail(username), password, options: { data: { full_name: fullName } } });
  if (error) throw error;
  if (!data.session) throw new Error("Email not confirmed");
  S.session = data.session;
}
async function doLogout() {
  try { await sb.auth.signOut(); } catch (e) { /* ignore */ }
  S.session = null; S.me = null; S.custodies = []; S.entries = []; S.profiles = {}; S.loaded = false;
  ui.tab = "home"; ui.sheet = null; ui.showVoucher = null; ui.created = null;
  await checkAdminExists();
  render();
}
/* المدير ينشئ مستخدماً: عميل مؤقت لا يحفظ جلسة حتى لا يُسجَّل خروج المدير */
async function createUser(username, fullName, password, role) {
  const tmp = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "tmp-" + Date.now() }
  });
  const { data, error } = await tmp.auth.signUp({ email: toEmail(username), password, options: { data: { full_name: fullName } } });
  if (error) throw error;
  if (!data.user) throw new Error("تعذر إنشاء المستخدم");
  const { error: e2 } = await sb.from("profiles").update({ role, full_name: fullName, active: true }).eq("id", data.user.id);
  if (e2) throw e2;
  return data.user.id;
}

/* ---------- dashboard ---------- */
function monthKey(d) { return String(d).slice(0, 7); }
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  try { return new Date(y, m - 1, 1).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { month: "short" }); } catch (e) { return String(m); }
}
function short(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + "م" : n >= 1e3 ? Math.round(n / 1e3) + "ك" : String(Math.round(n)); }
function monthlyChart(entries) {
  const keys = [], d = new Date();
  for (let i = 5; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); keys.push(x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0")); }
  const rec = Object.fromEntries(keys.map(k => [k, 0])), sp = { ...rec };
  entries.forEach(e => { const k = monthKey(e.date); if (k in rec) (e.kind === "topup" ? rec : sp)[k] += e.amount; });
  const max = Math.max(1, ...keys.map(k => Math.max(rec[k], sp[k])));
  const W = 360, H = 190, R = 40, T = 12, B = 28, pw = W - R - 8, ph = H - T - B, step = pw / 6, bw = step * 0.32;
  const y = v => T + ph - (v / max) * ph;
  let g = "";
  [0, 0.5, 1].forEach(f => { const yy = y(max * f); g += `<line class="g" x1="8" x2="${W - R}" y1="${yy}" y2="${yy}"/><text x="${W - R + 6}" y="${yy + 4}" text-anchor="start">${short(max * f)}</text>`; });
  keys.forEach((k, i) => {
    const x0 = W - R - step * (i + 0.5);
    const hr = (rec[k] / max) * ph, hs = (sp[k] / max) * ph;
    g += `<rect x="${x0 - bw - 1}" y="${T + ph - hr}" width="${bw}" height="${hr}" rx="2" fill="var(--accent)"><title>${monthLabel(k)}: ${fmt(rec[k])}</title></rect>`;
    g += `<rect x="${x0 + 1}" y="${T + ph - hs}" width="${bw}" height="${hs}" rx="2" fill="var(--c2)"><title>${monthLabel(k)}: ${fmt(sp[k])}</title></rect>`;
    g += `<text x="${x0}" y="${H - 8}" text-anchor="middle">${esc(monthLabel(k))}</text>`;
  });
  return `<svg class="ch" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="المبالغ المضافة والمصروفة خلال آخر ستة أشهر">${g}</svg>`;
}
function dashHtml() {
  const vis = visibleCustodies();
  if (!vis.length) {
    return emptyBlock("لا توجد عهد بعد. أنشئ أول عهدة ثم أضف إليها مبلغاً وابدأ بسندات الصرف.",
      isAdminRole() && canWrite() ? `<div class="row"><button class="btn primary" data-act="sheet" data-type="custody">إنشاء عهدة</button></div>` : "");
  }
  const sel = ui.custody !== "all" && vis.some(c => c.id === ui.custody) ? ui.custody : "all";
  const ids = sel === "all" ? new Set(vis.map(c => c.id)) : new Set([sel]);
  const [from, to] = periodRange(ui.period);
  const all = S.entries.filter(e => e.status !== "cancelled" && ids.has(e.custodyId));
  const inP = all.filter(e => e.date >= from && e.date < to);
  const rec = inP.filter(e => e.kind === "topup").reduce((a, e) => a + e.amount, 0);
  const vs = inP.filter(e => e.kind === "voucher");
  const sp = vs.reduce((a, e) => a + e.amount, 0);
  const bal = [...ids].reduce((a, id) => a + totals(id).bal, 0);
  const cats = {}; vs.forEach(e => { const k = e.category || "أخرى"; cats[k] = (cats[k] || 0) + e.amount; });
  const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const maxC = catRows.length ? catRows[0][1] : 1;
  const low = vis.filter(c => { const t = totals(c.id); return t.rec > 0 && t.bal / t.rec < 0.15; });
  const recent = all.filter(e => e.kind === "voucher").sort((a, b) => (b.date + pad(b.seq)).localeCompare(a.date + pad(a.seq))).slice(0, 6);
  const per = [["month", "هذا الشهر"], ["q", "٣ أشهر"], ["year", "هذه السنة"], ["all", "الكل"]];
  return `
  <div class="title"><h2>لوحة التحكم</h2>
    <div class="row">${isAdminRole() && canWrite() ? `<button class="btn sm primary" data-act="sheet" data-type="custody">+ عهدة جديدة</button>` : ""}<select id="dashCustody" aria-label="العهدة" style="width:auto"><option value="all">كل العهد</option>${custodyOptions(sel)}</select></div></div>
  <div class="chips" role="group" aria-label="الفترة">${per.map(([k, l]) => `<button class="chip" data-act="period" data-p="${k}" aria-pressed="${ui.period === k}">${l}</button>`).join("")}</div>
  ${low.length ? `<div class="note">تنبيه: رصيد ${low.map(c => esc(c.name)).join("، ")} أقل من ١٥٪ من المبالغ المستلمة.</div>` : ""}
  <div class="grid">
    <div class="card kpi main"><small>الرصيد الحالي</small><b>${money(bal)}</b></div>
    <div class="card kpi"><small>المضاف في الفترة</small><b>${money(rec)}</b></div>
    <div class="card kpi"><small>المصروف في الفترة</small><b>${money(sp)}</b></div>
    <div class="card kpi"><small>عدد السندات</small><b><span class="num">${vs.length}</span></b></div>
  </div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))">
    <div class="card"><div class="title"><h3>آخر ٦ أشهر</h3><span class="sub"><b style="color:var(--accent)">■</b> مضاف &nbsp;<b style="color:var(--c2)">■</b> مصروف</span></div>${monthlyChart(all)}</div>
    <div class="card"><h3 style="margin-bottom:10px">المصروف حسب البند</h3>${catRows.length ? catRows.map(([k, v]) => `
      <div style="margin-bottom:10px"><div class="row" style="justify-content:space-between;gap:8px"><span>${esc(k)}</span><span class="amt">${money(v)}</span></div>
      <div class="bar"><i style="width:${Math.max(3, v / maxC * 100)}%"></i></div></div>`).join("") : `<div class="empty">لا توجد سندات في هذه الفترة.</div>`}</div>
  </div>
  <div class="card"><h3>أرصدة العهد</h3><div class="list">${vis.filter(c => sel === "all" || c.id === sel).map(c => {
    const t = totals(c.id), pct = t.rec ? Math.min(100, t.sp / t.rec * 100) : 0, cls = pct > 90 ? "bad" : pct > 75 ? "warn" : "";
    return `<div class="item"><div class="grow"><div class="t">${esc(c.name)}</div><div class="s">${esc(c.holderId ? nameOf(c.holderId) : c.holderLabel || "بدون أمين")}</div>
      <div class="bar ${cls}" style="margin-top:6px"><i style="width:${pct}%"></i></div></div><div class="amt">${money(t.bal)}</div></div>`;
  }).join("")}</div></div>
  <div class="card"><h3>آخر السندات</h3>${recent.length ? `<div class="list">${recent.map(voucherRow).join("")}</div>` : `<div class="empty">لا توجد سندات صرف بعد.</div>`}</div>`;
}
function voucherRow(e) {
  const c = custodyById(e.custodyId);
  return `<div class="item"><div class="grow"><div class="t"><span class="num">${vno(e)}</span> · ${esc(e.beneficiary || e.desc || "سند صرف")}</div>
    <div class="s">${esc(c ? c.name : "")} · ${esc(e.category || "")} · ${dnum(e.date)}</div></div>
    <div class="amt bad">${money(e.amount)}</div><button class="btn sm" data-act="showv" data-id="${esc(e.id)}">عرض</button></div>`;
}
/* ---------- custodies, vouchers, forms ---------- */
function canSpendFrom(c) { const r = roleOf(); return canWrite() && (r === "admin" || (r === "custodian" && c.holderId === S.me.id)); }
function custodiesHtml() {
  const vis = visibleCustodies(), adm = isAdminRole() && canWrite();
  return `<div class="title"><h2>العهد</h2>${adm ? `<div class="row"><button class="btn primary" data-act="sheet" data-type="custody">عهدة جديدة</button></div>` : ""}</div>` +
    (vis.length ? vis.map(c => {
      const t = totals(c.id), pct = t.rec ? Math.min(100, t.sp / t.rec * 100) : 0, cls = pct > 90 ? "bad" : pct > 75 ? "warn" : "";
      const holder = c.holderId ? nameOf(c.holderId) : (c.holderLabel || "بدون أمين عهدة");
      return `<div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start">
        <div style="min-width:0"><h3>${esc(c.name)}</h3><div class="sub">أمين العهدة: ${esc(holder)}</div>${c.note ? `<div class="sub">${esc(c.note)}</div>` : ""}</div>
        <div style="text-align:end"><div class="sub">الرصيد</div><div class="amt" style="font-size:22px">${money(t.bal)}</div></div></div>
        <div class="bar ${cls}" style="margin:12px 0 6px"><i style="width:${pct}%"></i></div>
        <div class="row sub" style="justify-content:space-between"><span>المستلم: ${money(t.rec)}</span><span>المصروف: ${money(t.sp)} · <span class="num">${t.n}</span> سند</span></div>
        <div class="row" style="margin-top:12px">
          ${adm ? `<button class="btn sm" data-act="sheet" data-type="topup" data-id="${esc(c.id)}">إضافة مبلغ</button>` : ""}
          ${canSpendFrom(c) ? `<button class="btn sm primary" data-act="sheet" data-type="voucher" data-id="${esc(c.id)}">سند صرف</button>` : ""}
          <button class="btn sm" data-act="stmt" data-id="${esc(c.id)}">كشف الحساب</button>
          ${adm ? `<button class="btn sm" data-act="sheet" data-type="custody" data-id="${esc(c.id)}">تعديل</button>` : ""}
          ${adm && !S.entries.some(e => e.custodyId === c.id) ? `<button class="btn sm danger" data-act="delcustody" data-id="${esc(c.id)}">حذف</button>` : ""}
        </div></div>`;
    }).join("") : emptyBlock("لا توجد عهد لعرضها.", adm ? `<button class="btn primary" data-act="sheet" data-type="custody">إنشاء عهدة</button>` : ""));
}
function vouchersHtml() {
  const ids = visibleIds();
  const q = ui.q.trim().toLowerCase();
  let list = S.entries.filter(e => ids.has(e.custodyId) && (ui.kind === "all" || e.kind === ui.kind) && (ui.custody === "all" || e.custodyId === ui.custody));
  if (q) list = list.filter(e => [vno(e), e.beneficiary, e.desc, e.category].join(" ").toLowerCase().includes(q));
  list.sort((a, b) => (b.date + pad(b.seq)).localeCompare(a.date + pad(a.seq)));
  const kinds = [["voucher", "سندات الصرف"], ["topup", "المبالغ المضافة"], ["all", "الكل"]];
  const canNew = visibleCustodies().some(canSpendFrom);
  return `<div class="title"><h2>السندات</h2>${canNew ? `<button class="btn primary" data-act="sheet" data-type="voucher">سند صرف جديد</button>` : ""}</div>
    <div class="row"><input id="q" type="search" placeholder="بحث بالرقم أو المستفيد أو البيان" value="${esc(ui.q)}" style="flex:1;min-width:200px">
      <select id="vCustody" style="width:auto" aria-label="العهدة"><option value="all">كل العهد</option>${custodyOptions(ui.custody)}</select></div>
    <div class="chips">${kinds.map(([k, l]) => `<button class="chip" data-act="kind" data-k="${k}" aria-pressed="${ui.kind === k}">${l}</button>`).join("")}</div>
    <div class="card">${list.length ? `<div class="list">${list.map(entryRow).join("")}</div>` : `<div class="empty">لا توجد نتائج.</div>`}</div>`;
}
function entryRow(e) {
  const c = custodyById(e.custodyId), top = e.kind === "topup", x = e.status === "cancelled";
  return `<div class="item"><div class="grow"><div class="t"><span class="num">${vno(e)}</span> · ${esc(top ? (e.desc || "إضافة مبلغ للعهدة") : (e.beneficiary || e.desc || "سند صرف"))} ${x ? '<span class="pill bad">ملغي</span>' : ""}</div>
    <div class="s">${esc(c ? c.name : "")}${top ? "" : " · " + esc(e.category || "")} · ${dnum(e.date)}</div></div>
    <div class="amt ${top ? "good" : "bad"}" ${x ? 'style="text-decoration:line-through;opacity:.6"' : ""}>${top ? "+" : "−"}${money(e.amount)}</div>
    <button class="btn sm" data-act="showv" data-id="${esc(e.id)}">عرض</button></div>`;
}
function voucherCard(e) {
  const c = custodyById(e.custodyId), top = e.kind === "topup", x = e.status === "cancelled";
  const mine = e.by === S.me.id, canCancel = !x && canWrite() && (isAdminRole() || (mine && !top));
  return `<div class="voucher">${x ? '<div class="stamp">ملغي</div>' : ""}
    <div class="row" style="justify-content:space-between"><h3>${top ? "إيصال إضافة مبلغ" : "سند صرف"} <span class="num">${vno(e)}</span></h3><button class="btn sm" data-act="closev">إغلاق</button></div>
    <dl><dt>العهدة</dt><dd>${esc(c ? c.name : "—")}</dd><dt>التاريخ</dt><dd>${dnum(e.date)}</dd><dt>المبلغ</dt><dd>${money(e.amount)}</dd>
    ${top ? "" : `<dt>المستفيد</dt><dd>${esc(e.beneficiary || "—")}</dd><dt>البند</dt><dd>${esc(e.category || "—")}</dd>`}
    <dt>البيان</dt><dd>${esc(e.desc || "—")}</dd><dt>سجّله</dt><dd>${esc(e.byName || nameOf(e.by) || "—")}</dd></dl>
    ${canCancel ? (ui.confirm === e.id
      ? `<div class="row"><span class="sub">سيُستبعد هذا السند من الرصيد ويبقى ظاهراً كملغي.</span><button class="btn sm danger" data-act="cancelv" data-id="${esc(e.id)}">تأكيد الإلغاء</button><button class="btn sm" data-act="noconfirm">تراجع</button></div>`
      : `<div><button class="btn sm danger" data-act="askcancel" data-id="${esc(e.id)}">إلغاء السند</button></div>`) : ""}</div>`;
}
function sheetHtml() {
  let out = "";
  if (ui.showVoucher) { const e = S.entries.find(x => x.id === ui.showVoucher); if (e) out += voucherCard(e); }
  const s = ui.sheet; if (!s) return out;
  const close = `<button type="button" class="btn sm" data-act="closesheet">إغلاق</button>`;
  if (s.type === "custody") {
    const c = s.id ? custodyById(s.id) : null;
    const memberOpts = Object.values(S.profiles).filter(p => p.active && p.role !== "pending").map(p => p.id);
    return out + `<form class="card form" data-form="custody" data-id="${esc(s.id || "")}">
      <div class="full title"><h3>${c ? "تعديل العهدة" : "عهدة جديدة"}</h3>${close}</div>
      <div class="field"><label for="f_name">اسم العهدة</label><input id="f_name" name="name" required maxlength="80" value="${esc(c?.name || "")}" placeholder="مثال: عهدة المشاريع"></div>
      <div class="field"><label for="f_holder">أمين العهدة</label><select id="f_holder" name="holderId"><option value="">— بدون مستخدم —</option>
        ${memberOpts.map(id => `<option value="${esc(id)}"${c?.holderId === id ? " selected" : ""}>${esc(nameOf(id) || "مستخدم")}${id === S.me.id ? " (أنا)" : ""}</option>`).join("")}</select></div>
      <div class="field"><label for="f_label">أو اسم أمين العهدة (نص)</label><input id="f_label" name="holderLabel" maxlength="60" value="${esc(c?.holderLabel || "")}"></div>
      ${c ? "" : `<div class="field"><label for="f_open">المبلغ الافتتاحي (${CUR})</label><input id="f_open" name="opening" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div>`}
      <div class="field full"><label for="f_note">ملاحظات</label><input id="f_note" name="note" maxlength="140" value="${esc(c?.note || "")}"></div>
      <div class="full"><button class="btn primary" type="submit">حفظ</button></div></form>`;
  }
  if (s.type === "topup") {
    const sel = s.id || visibleCustodies()[0]?.id;
    return out + `<form class="card form" data-form="topup"><div class="full title"><h3>إضافة مبلغ للعهدة</h3>${close}</div>
      <div class="field"><label for="f_c">العهدة</label><select id="f_c" name="custodyId" required>${custodyOptions(sel)}</select></div>
      <div class="field"><label for="f_amt">المبلغ (${CUR})</label><input id="f_amt" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></div>
      <div class="field"><label for="f_date">التاريخ</label><input id="f_date" name="date" type="date" required value="${todayStr()}"></div>
      <div class="field"><label for="f_desc">مصدر المبلغ / البيان</label><input id="f_desc" name="desc" maxlength="140" placeholder="مثال: تحويل بنكي من الخزينة"></div>
      <div class="full"><button class="btn primary" type="submit">إضافة المبلغ</button></div></form>`;
  }
  if (s.type === "voucher") {
    const list = visibleCustodies().filter(canSpendFrom), sel = s.id || list[0]?.id;
    if (!list.length) return out;
    return out + `<form class="card form" data-form="voucher"><div class="full title"><h3>سند صرف جديد <span class="sub num">${"س-" + pad(nextSeq("voucher", sel))}</span></h3>${close}</div>
      <div class="field"><label for="f_c">العهدة</label><select id="f_c" name="custodyId" required>${list.map(c => `<option value="${esc(c.id)}"${c.id === sel ? " selected" : ""}>${esc(c.name)} — الرصيد ${fmt(totals(c.id).bal)}</option>`).join("")}</select></div>
      <div class="field"><label for="f_amt">المبلغ (${CUR})</label><input id="f_amt" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></div>
      <div class="field"><label for="f_date">التاريخ</label><input id="f_date" name="date" type="date" required value="${todayStr()}"></div>
      <div class="field"><label for="f_cat">البند</label><select id="f_cat" name="category">${CATS.map(k => `<option>${esc(k)}</option>`).join("")}</select></div>
      <div class="field"><label for="f_ben">المستفيد</label><input id="f_ben" name="beneficiary" maxlength="80" required placeholder="اسم المورد أو الجهة"></div>
      <div class="field"><label for="f_desc">البيان</label><input id="f_desc" name="desc" maxlength="160" placeholder="تفاصيل المصروف"></div>
      <div class="full"><button class="btn primary" type="submit">حفظ السند</button></div></form>`;
  }
  return out;
}
function stmtRows(custodyId, from, to) {
  const all = S.entries.filter(e => e.custodyId === custodyId && e.status !== "cancelled")
    .sort((a, b) => (a.date + pad(a.createdAt || 0, 14) + pad(a.seq)).localeCompare(b.date + pad(b.createdAt || 0, 14) + pad(b.seq)));
  const sgn = e => e.kind === "topup" ? e.amount : -e.amount;
  const opening = all.filter(e => from && e.date < from).reduce((a, e) => a + sgn(e), 0);
  const rows = all.filter(e => (!from || e.date >= from) && (!to || e.date <= to));
  let run = opening, rec = 0, sp = 0;
  const out = rows.map(e => { run += sgn(e); if (e.kind === "topup") rec += e.amount; else sp += e.amount; return { e, bal: run }; });
  return { opening, rows: out, rec, sp, closing: run };
}
function stmtCustodyId() {
  const vis = visibleCustodies();
  return vis.some(c => c.id === ui.stmtCustody) ? ui.stmtCustody : (vis[0]?.id || "");
}
function statementHtml() {
  const vis = visibleCustodies();
  if (!vis.length) return `<div class="title"><h2>كشف الحساب</h2></div>` + emptyBlock("لا توجد عهد لعرض كشف حسابها.");
  const id = stmtCustodyId(), c = custodyById(id), st = stmtRows(id, ui.from, ui.to);
  const cancelled = S.entries.filter(e => e.custodyId === id && e.status === "cancelled").length;
  return `<div class="title"><h2>كشف حساب العهدة</h2><button class="btn" data-act="csv">تصدير CSV</button></div>
  <div class="card form"><div class="field"><label for="sCustody">العهدة</label><select id="sCustody">${custodyOptions(id)}</select></div>
    <div class="field"><label for="sFrom">من تاريخ</label><input id="sFrom" type="date" value="${esc(ui.from)}"></div>
    <div class="field"><label for="sTo">إلى تاريخ</label><input id="sTo" type="date" value="${esc(ui.to)}"></div></div>
  <div class="card"><div class="row" style="justify-content:space-between"><div><h3>${esc(c.name)}</h3><div class="sub">أمين العهدة: ${esc(c.holderId ? nameOf(c.holderId) : c.holderLabel || "—")}</div></div>
    <div style="text-align:end"><div class="sub">الرصيد الختامي</div><div class="amt" style="font-size:22px">${money(st.closing)}</div></div></div></div>
  <div class="tbl"><table><thead><tr><th>التاريخ</th><th>المرجع</th><th>البيان</th><th>وارد</th><th>منصرف</th><th>الرصيد</th></tr></thead><tbody>
    <tr><td colspan="5"><b>الرصيد الافتتاحي</b></td><td class="amt">${money(st.opening)}</td></tr>
    ${st.rows.map(({ e, bal }) => `<tr><td>${dnum(e.date)}</td><td><span class="num">${vno(e)}</span></td>
      <td class="wrapc">${esc(e.kind === "topup" ? (e.desc || "إضافة مبلغ") : [e.beneficiary, e.desc].filter(Boolean).join(" — ") || "سند صرف")}</td>
      <td class="good">${e.kind === "topup" ? money(e.amount) : ""}</td><td class="bad">${e.kind === "voucher" ? money(e.amount) : ""}</td><td class="amt">${money(bal)}</td></tr>`).join("")}
    </tbody><tfoot><tr><td colspan="3">الإجمالي</td><td>${money(st.rec)}</td><td>${money(st.sp)}</td><td>${money(st.closing)}</td></tr></tfoot></table></div>
  ${cancelled ? `<div class="sub">لا يشمل الكشف <span class="num">${cancelled}</span> سنداً ملغياً.</div>` : ""}`;
}

/* ---------- shell, auth screens, users ---------- */
const brandHtml = `<div class="brand"><i><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></svg></i><span>دفتر العهد</span></div>`;

function setupHtml() {
  return `<div class="auth">${brandHtml}<div class="card"><h2 style="margin-bottom:8px">الإعداد غير مكتمل</h2>
    <div class="sub">افتح الملف <b class="num">config.js</b> وضع فيه رابط مشروع Supabase والمفتاح العام (anon key)، ثم أعد تحميل الصفحة. الخطوات في ملف README.</div></div></div>`;
}
function loginHtml() {
  const first = !S.adminExists;
  return `<div class="auth">${brandHtml}
    <div class="card"><h2 style="margin-bottom:12px">${first && ui.signup ? "إنشاء حساب المدير" : "تسجيل الدخول"}</h2>
    ${first && ui.signup ? `
      <form data-form="signup"><div class="field"><label for="a_name">الاسم</label><input id="a_name" name="name" required maxlength="60" autocomplete="name"></div>
      <div class="field"><label for="a_user">اسم المستخدم (إنجليزي)</label><input id="a_user" name="username" required maxlength="30" autocapitalize="none" autocomplete="username" style="direction:ltr" placeholder="admin"></div>
      <div class="field"><label for="a_pass">كلمة المرور</label><input id="a_pass" name="password" type="password" required minlength="6" autocomplete="new-password" style="direction:ltr"></div>
      <button class="btn primary" type="submit"${ui.busy ? " disabled" : ""}>إنشاء الحساب</button>
      <button type="button" class="linkbtn" data-act="showlogin">لدي حساب بالفعل</button></form>` : `
      <form data-form="login"><div class="field"><label for="l_user">اسم المستخدم</label><input id="l_user" name="username" required autocapitalize="none" autocomplete="username" style="direction:ltr" value="${esc(ui.prefill)}"></div>
      <div class="field"><label for="l_pass">كلمة المرور</label><input id="l_pass" name="password" type="password" required autocomplete="current-password" style="direction:ltr"></div>
      <button class="btn primary" type="submit"${ui.busy ? " disabled" : ""}>دخول</button>
      ${first ? `<div class="note">لم يُنشأ حساب المدير بعد.</div><button type="button" class="linkbtn" data-act="showsignup">إنشاء حساب المدير الأول</button>` : ""}</form>`}
    </div><div class="sub" style="text-align:center">حسابات المستخدمين ينشئها المدير. إن نسيت كلمة المرور فاطلب من المدير.</div></div>`;
}

function viewHtml() {
  if (S.err && !S.loaded) return `<div class="card empty"><div>${esc(S.err)}</div><button class="btn" data-act="retry">إعادة المحاولة</button></div>`;
  if (!S.loaded) return `<div class="empty">جارٍ تحميل البيانات…</div>`;
  if (!S.me) return `<div class="card empty"><h2>الحساب غير مكتمل</h2><div>لم يُنشأ ملفك الشخصي بعد. تواصل مع المدير.</div></div>`;
  if (!S.me.active) return `<div class="card empty"><h2>الحساب موقوف</h2><div>أوقف المدير هذا الحساب. تواصل معه لإعادة التفعيل.</div></div>`;
  if (S.me.role === "pending") return `<div class="card empty"><h2>حسابك بانتظار التفعيل</h2><div>سيحدد المدير دورك ثم تظهر لك عهدتك هنا.</div></div>`;
  if (ui.tab === "users" && !isAdminRole()) ui.tab = "home";
  const body = { home: dashHtml, custodies: custodiesHtml, vouchers: vouchersHtml, statement: statementHtml, users: usersHtml }[ui.tab]();
  const banner = S.err ? `<div class="note">${esc(S.err)}</div>` : "";
  return banner + sheetHtml2() + body;
}
function sheetHtml2() {
  if (ui.sheet && ui.sheet.type === "pw") {
    return `<form class="card form" data-form="pw"><div class="full title"><h3>تغيير كلمة المرور</h3><button type="button" class="btn sm" data-act="closesheet">إغلاق</button></div>
      <div class="field"><label for="p_new">كلمة المرور الجديدة</label><input id="p_new" name="password" type="password" required minlength="6" autocomplete="new-password" style="direction:ltr"></div>
      <div class="field"><label for="p_new2">تأكيد كلمة المرور</label><input id="p_new2" name="password2" type="password" required minlength="6" autocomplete="new-password" style="direction:ltr"></div>
      <div class="full"><button class="btn primary" type="submit">حفظ</button></div></form>`;
  }
  return sheetHtml();
}
function emptyBlock(msg, btn) { return `<div class="card empty"><div>${msg}</div>${btn || ""}</div>`; }
function custodyOptions(sel, onlyWritable) {
  let list = visibleCustodies();
  if (onlyWritable && roleOf() === "custodian") list = list.filter(c => c.holderId === S.me.id);
  return list.map(c => `<option value="${esc(c.id)}"${c.id === sel ? " selected" : ""}>${esc(c.name)}</option>`).join("");
}

let rendering = false;
function render() {
  if (rendering) return; rendering = true;
  try {
    const authEl = $("#authView"), appEl = $("#app");
    if (!configured || !S.session) {
      appEl.hidden = true; authEl.hidden = false;
      authEl.innerHTML = configured ? loginHtml() : setupHtml();
      return;
    }
    authEl.hidden = true; appEl.hidden = false;
    const r = roleOf();
    $("#whoName").textContent = S.me ? S.me.name : "";
    const wr = $("#whoRole"); wr.textContent = r ? ROLES[r] : (S.me ? "موقوف" : "");
    wr.className = "pill" + (r === "admin" || r === "custodian" ? "" : " warn");
    $("#pal").innerHTML = PALS.map(([k, label, col]) => `<button type="button" data-act="pal" data-p="${k}" style="background:${col}" title="${label}" aria-label="${label}" aria-pressed="${curPal === k}"></button>`).join("");
    $("#nav").innerHTML = TABS.filter(t => t[0] !== "users" || isAdminRole()).map(([k, label, ic]) =>
      `<button data-act="tab" data-tab="${k}"${ui.tab === k ? ' aria-current="page"' : ""}><svg viewBox="0 0 24 24">${ic}</svg><span>${label}</span></button>`).join("");
    $("#view").innerHTML = viewHtml();
  } catch (e) {
    console.error(e);
    $("#view").innerHTML = `<div class="empty">حدث خطأ أثناء العرض.</div>`;
  } finally { rendering = false; }
}

/* ---------- users (admin) ---------- */
function usersHtml() {
  const list = Object.values(S.profiles).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const created = ui.created;
  const msgOf = c => "مرحباً " + c.name + "\nرابط دفتر العهد: " + APP_URL() + "?u=" + c.username + "\nاسم المستخدم: " + c.username + "\nكلمة المرور: " + c.password + "\nيمكنك تغيير كلمة المرور بعد الدخول.";
  return `<div class="title"><h2>المستخدمون</h2></div>
  ${created ? `<div class="card"><div class="title"><h3>تم إنشاء حساب ${esc(created.name)}</h3><button class="btn sm" data-act="closecreated">إغلاق</button></div>
    <div class="credbox" style="margin:10px 0"><div>اسم المستخدم: <code>${esc(created.username)}</code></div><div>كلمة المرور: <code>${esc(created.password)}</code></div><div>الرابط: <code>${esc(APP_URL())}</code></div></div>
    <div class="row"><button class="btn" data-act="copycreated">نسخ البيانات</button><a class="btn primary" style="text-decoration:none" href="https://wa.me/?text=${encodeURIComponent(msgOf(created))}" target="_blank" rel="noopener">إرسال واتساب</a></div>
    <div class="note" style="margin-top:10px">كلمة المرور تظهر هنا مرة واحدة فقط. انسخها وأرسلها الآن.</div></div>` : ""}
  <div class="card"><div class="list">${list.map(p => {
    const mine = p.id === S.me.id;
    const held = S.custodies.filter(c => c.holderId === p.id).map(c => c.name).join("، ");
    return `<div class="item"><div class="grow"><div class="t">${esc(p.name)}${mine ? " (أنا)" : ""} <span class="pill ${p.role === "pending" || !p.active ? "warn" : ""}">${p.active ? esc(ROLES[p.role] || "") : "موقوف"}</span></div>
      <div class="s"><span class="num">${esc(p.username)}</span>${p.role === "custodian" ? " · العهد: " + esc(held || "لا توجد عهدة مسندة") : ""}</div></div>
      ${mine ? "" : `<select data-act="setrole" data-id="${esc(p.id)}" style="width:auto" aria-label="الدور"><option value="custodian"${p.role === "custodian" ? " selected" : ""}>أمين عهدة</option><option value="admin"${p.role === "admin" ? " selected" : ""}>مدير</option>${p.role === "pending" ? `<option value="pending" selected>بانتظار التفعيل</option>` : ""}</select>
      <button class="btn sm" data-act="toggleactive" data-id="${esc(p.id)}">${p.active ? "إيقاف" : "تفعيل"}</button>
      <a class="btn sm" style="text-decoration:none" href="https://wa.me/?text=${encodeURIComponent("مرحباً " + p.name + "، رابط دفتر العهد: " + APP_URL() + "?u=" + p.username + "\nاسم المستخدم: " + p.username)}" target="_blank" rel="noopener">إرسال الرابط</a>`}</div>`;
  }).join("")}</div></div>
  <div class="card"><h3 style="margin-bottom:6px">إضافة مستخدم</h3>
    <div class="sub" style="margin-bottom:10px">ينشئ المدير الحساب بكلمة مرور، ثم يرسل بيانات الدخول للمستخدم برابط خاص به. أمين العهدة لا يرى إلا عهدته ولا يستطيع إضافة رصيد.</div>
    <form data-form="createuser" class="form">
      <div class="field"><label for="u_name">الاسم</label><input id="u_name" name="name" required maxlength="60" placeholder="مثال: أحمد العلي"></div>
      <div class="field"><label for="u_user">اسم المستخدم (إنجليزي)</label><input id="u_user" name="username" required maxlength="30" autocapitalize="none" style="direction:ltr" placeholder="ahmed"></div>
      <div class="field"><label for="u_pass">كلمة المرور</label><div class="row" style="flex-wrap:nowrap"><input id="u_pass" name="password" required minlength="6" style="direction:ltr" value="${esc(genPassword())}"><button type="button" class="btn" data-act="genpw">توليد</button></div></div>
      <div class="field"><label for="u_role">الدور</label><select id="u_role" name="role"><option value="custodian">أمين عهدة</option><option value="admin">مدير</option></select></div>
      <div class="full"><button class="btn primary" type="submit"${ui.busy ? " disabled" : ""}>إنشاء الحساب</button></div></form></div>`;
}

/* ---------- actions ---------- */
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
async function q(p) { const r = await p; if (r.error) throw r.error; return r.data; }
function setPal(p, persist = true) {
  if (!PALS.some(x => x[0] === p)) p = "teal";
  curPal = p;
  if (p === "teal") document.documentElement.removeAttribute("data-pal"); else document.documentElement.setAttribute("data-pal", p);
  if (persist) { try { localStorage.setItem("pal", p); } catch (e) { /* optional */ } }
  render();
}
async function refresh(quiet) {
  if (!S.session || refresh.busy) return;
  refresh.busy = true;
  try { await loadAll(); S.err = ""; } catch (e) { if (!quiet) S.err = errMsg(e); }
  finally { refresh.busy = false; }
  const a = document.activeElement;
  const typing = quiet && (ui.sheet || (a && a.closest && a.closest("#view") && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)));
  if (!typing) render();
}
function go(tab) {
  ui.tab = tab; ui.sheet = null; ui.showVoucher = null; ui.confirm = null;
  try { history.replaceState(null, "", "#" + tab); } catch (e) { /* optional */ }
  render(); window.scrollTo(0, 0);
}
async function run(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); return true; }
  catch (e) { toast(errMsg(e)); return false; }
}
function adminCount() { return Object.values(S.profiles).filter(p => p.role === "admin" && p.active).length; }

async function submitForm(f) {
  const d = Object.fromEntries(new FormData(f).entries()), kind = f.dataset.form;
  if (kind === "login" || kind === "signup") {
    if (kind === "signup" && !validUser(d.username)) return toast("اسم المستخدم: ٣ إلى ٣٠ حرفاً إنجليزياً أو أرقاماً");
    ui.busy = true; render();
    try {
      if (kind === "login") await doLogin(d.username, d.password); else await doSignup(d.username, d.name.trim(), d.password);
      ui.busy = false; ui.signup = false; S.loaded = false; render(); await refresh();
    } catch (e) { ui.busy = false; render(); toast(errMsg(e)); }
    return;
  }
  if (kind === "pw") {
    if (d.password !== d.password2) return toast("كلمتا المرور غير متطابقتين");
    if (await run(async () => { const { error } = await sb.auth.updateUser({ password: d.password }); if (error) throw error; }, "تم تغيير كلمة المرور")) { ui.sheet = null; render(); }
    return;
  }
  if (kind === "createuser") {
    if (!validUser(d.username)) return toast("اسم المستخدم: ٣ إلى ٣٠ حرفاً إنجليزياً أو أرقاماً");
    ui.busy = true; render();
    const ok = await run(async () => { await createUser(d.username.trim(), d.name.trim(), d.password, d.role); ui.created = { name: d.name.trim(), username: d.username.trim().toLowerCase(), password: d.password }; }, "تم إنشاء الحساب");
    ui.busy = false;
    if (ok) await refresh(); else render();
    return;
  }
  if (kind === "custody") {
    const base = { name: d.name.trim(), holder_id: d.holderId || null, holder_label: d.holderId ? "" : (d.holderLabel || "").trim(), note: (d.note || "").trim() };
    const ok = await run(async () => {
      if (f.dataset.id) { await q(sb.from("custodies").update(base).eq("id", f.dataset.id)); return; }
      const row = await q(sb.from("custodies").insert(base).select("id").single());
      const op = r2(d.opening);
      if (op > 0) await q(sb.from("entries").insert({ custody_id: row.id, kind: "topup", amount: op, entry_date: todayStr(), description: "رصيد افتتاحي" }));
    }, f.dataset.id ? "تم تحديث العهدة" : "تم إنشاء العهدة");
    if (ok) { ui.sheet = null; await refresh(); }
    return;
  }
  const amount = r2(d.amount);
  if (!(amount > 0)) return toast("أدخل مبلغاً صحيحاً");
  if (kind === "topup") {
    const ok = await run(() => q(sb.from("entries").insert({ custody_id: d.custodyId, kind: "topup", amount, entry_date: d.date, description: (d.desc || "").trim() })), "تمت إضافة المبلغ");
    if (ok) { ui.sheet = null; await refresh(); }
  } else if (kind === "voucher") {
    if (amount > totals(d.custodyId).bal + 0.0001) return toast("المبلغ أكبر من رصيد العهدة المتاح");
    const ok = await run(() => q(sb.from("entries").insert({ custody_id: d.custodyId, kind: "voucher", amount, entry_date: d.date, category: d.category, beneficiary: d.beneficiary.trim(), description: (d.desc || "").trim() })), "تم حفظ سند الصرف");
    if (ok) { ui.sheet = null; await refresh(); }
  }
}
function exportCsv() {
  const id = stmtCustodyId(); if (!id) return;
  const st = stmtRows(id, ui.from, ui.to), c = custodyById(id);
  const lines = [["التاريخ", "المرجع", "البيان", "وارد", "منصرف", "الرصيد"]];
  lines.push(["", "", "الرصيد الافتتاحي", "", "", st.opening.toFixed(2)]);
  st.rows.forEach(({ e, bal }) => lines.push([e.date, vno(e), e.kind === "topup" ? e.desc || "إضافة مبلغ" : [e.beneficiary, e.desc].filter(Boolean).join(" — "), e.kind === "topup" ? e.amount.toFixed(2) : "", e.kind === "voucher" ? e.amount.toFixed(2) : "", bal.toFixed(2)]));
  lines.push(["", "", "الإجمالي", st.rec.toFixed(2), st.sp.toFixed(2), st.closing.toFixed(2)]);
  const blob = new Blob(["﻿" + lines.map(r => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "statement-" + (c ? c.cn : "") + "-" + todayStr() + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast("تم النسخ"); } catch (e) { toast("تعذر النسخ تلقائياً. حدد النص وانسخه."); }
}

/* ---------- events ---------- */
document.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-act]"); if (!b || b.tagName === "SELECT") return;
  const a = b.dataset.act, id = b.dataset.id;
  if (a === "pal") return setPal(b.dataset.p);
  if (a === "tab") return go(b.dataset.tab);
  if (a === "logout") return doLogout();
  if (a === "retry") { S.err = ""; render(); return refresh(); }
  if (a === "showsignup") { ui.signup = true; return render(); }
  if (a === "showlogin") { ui.signup = false; return render(); }
  if (a === "pw") { ui.sheet = { type: "pw" }; ui.showVoucher = null; render(); return window.scrollTo(0, 0); }
  if (a === "sheet") { ui.sheet = { type: b.dataset.type, id }; ui.showVoucher = null; render(); return window.scrollTo(0, 0); }
  if (a === "closesheet") { ui.sheet = null; return render(); }
  if (a === "period") { ui.period = b.dataset.p; return render(); }
  if (a === "kind") { ui.kind = b.dataset.k; return render(); }
  if (a === "showv") { ui.showVoucher = id; ui.sheet = null; ui.confirm = null; render(); return window.scrollTo(0, 0); }
  if (a === "closev") { ui.showVoucher = null; ui.confirm = null; return render(); }
  if (a === "askcancel") { ui.confirm = id; return render(); }
  if (a === "noconfirm") { ui.confirm = null; return render(); }
  if (a === "cancelv") { if (await run(() => q(sb.rpc("cancel_entry", { p_id: id })), "تم إلغاء السند")) ui.confirm = null; return refresh(); }
  if (a === "stmt") { ui.stmtCustody = id; return go("statement"); }
  if (a === "csv") return exportCsv();
  if (a === "genpw") { const i = $("#u_pass"); if (i) i.value = genPassword(); return; }
  if (a === "closecreated") { ui.created = null; return render(); }
  if (a === "copycreated") { const c = ui.created; if (c) copyText("مرحباً " + c.name + "\nرابط دفتر العهد: " + APP_URL() + "?u=" + c.username + "\nاسم المستخدم: " + c.username + "\nكلمة المرور: " + c.password); return; }
  if (a === "toggleactive") {
    const p = S.profiles[id]; if (!p) return;
    if (p.active && p.role === "admin" && adminCount() <= 1) return toast("لا يمكن إيقاف المدير الوحيد");
    return void (await run(() => q(sb.from("profiles").update({ active: !p.active }).eq("id", id)), p.active ? "تم إيقاف الحساب" : "تم تفعيل الحساب"), await refresh());
  }
  if (a === "delcustody") {
    if (ui.confirm !== "d:" + id) { ui.confirm = "d:" + id; toast("اضغط مرة أخرى لتأكيد حذف العهدة"); setTimeout(() => { if (ui.confirm === "d:" + id) ui.confirm = null; }, 4000); return; }
    ui.confirm = null;
    return void (await run(() => q(sb.from("custodies").delete().eq("id", id)), "تم حذف العهدة"), await refresh());
  }
});
document.addEventListener("change", async ev => {
  const t = ev.target, i = t.id;
  if (i === "dashCustody" || i === "vCustody") { ui.custody = t.value; render(); }
  else if (i === "sCustody") { ui.stmtCustody = t.value; render(); }
  else if (i === "sFrom") { ui.from = t.value; render(); }
  else if (i === "sTo") { ui.to = t.value; render(); }
  else if (t.dataset && t.dataset.act === "setrole") {
    const p = S.profiles[t.dataset.id]; if (!p) return;
    if (p.role === "admin" && t.value !== "admin" && adminCount() <= 1) { toast("لا يمكن تغيير دور المدير الوحيد"); return render(); }
    await run(() => q(sb.from("profiles").update({ role: t.value }).eq("id", p.id)), "تم تحديث الدور"); await refresh();
  }
});
document.addEventListener("input", ev => {
  const t = ev.target;
  if (t.id === "q") { ui.q = t.value; const pos = t.selectionStart; render(); const el = $("#q"); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }
});
document.addEventListener("submit", ev => { const f = ev.target.closest("form[data-form]"); if (f) { ev.preventDefault(); submitForm(f); } });

/* ---------- boot ---------- */
(async function boot() {
  try { const sp = localStorage.getItem("pal"); if (sp) { curPal = PALS.some(x => x[0] === sp) ? sp : "teal"; if (curPal !== "teal") document.documentElement.setAttribute("data-pal", curPal); } } catch (e) { /* optional */ }
  ui.prefill = (new URLSearchParams(location.search).get("u") || "").replace(/[^a-z0-9._-]/gi, "");
  const h = (location.hash || "").slice(1); if (TABS.some(t => t[0] === h)) ui.tab = h;
  if (!configured || !window.supabase) { render(); return; }
  sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  try { const { data } = await sb.auth.getSession(); S.session = data.session; } catch (e) { S.session = null; }
  sb.auth.onAuthStateChange((evn, session) => { if (session) S.session = session; });
  if (S.session) { render(); await refresh(); } else { await checkAdminExists(); render(); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.session) refresh(true); });
  setInterval(() => { if (!document.hidden && S.session) refresh(true); }, 60000);
})();

})();
