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
