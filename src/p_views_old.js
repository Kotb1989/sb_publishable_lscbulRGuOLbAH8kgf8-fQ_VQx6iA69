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
