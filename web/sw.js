// service worker: يحفظ ملفات التطبيق ليفتح بسرعة وبدون إنترنت. بيانات العهد لا تُخزَّن هنا.
const V = "custody-v1";
const SHELL = ["./", "index.html", "styles.css", "app.js", "config.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  const sameOrigin = u.origin === location.origin;
  const lib = u.hostname === "cdn.jsdelivr.net";
  if (!sameOrigin && !lib) return; // طلبات Supabase تذهب للشبكة مباشرة
  e.respondWith(
    fetch(r).then(res => { if (res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(r, copy)); } return res; })
      .catch(() => caches.match(r).then(m => m || (r.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
