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
