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
