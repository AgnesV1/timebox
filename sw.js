// 离线：页面、脚本、样式、字体都先上网拿最新的（顺便存一份），4 秒拿不到就用存着的那份。
// 发给 Apps Script 的请求不经过这里。
const CACHE = "kuzhouduan-v59";
const SHELL = ["./", "index.html", "css/app.css", "css/money.css", "manifest.json", "icon-180.png", "favicon.png",
  "js/main.js", "js/store.js", "js/store/series.js", "js/store/timer.js", "js/store/friends.js", "js/store/goals.js", "js/store/readplan.js", "js/store/meals.js", "js/store/ideas.js", "js/store/side.js", "js/store/scores.js", "js/store/quads.js", "js/sync.js", "js/engine.js", "js/stats.js", "js/routines.js", "js/times.js", "js/reading.js", "js/meals.js", "js/goals.js", "js/groups.js", "js/friends.js", "js/ideas.js", "js/day.js", "js/dates.js", "js/dom.js", "js/patterns.js", "js/fx.js", "js/sky.js", "js/motion.js", "js/scores.js", "js/offdays.js", "js/quads.js", "js/money.js", "js/spend.js",
  "js/ui/common.js", "js/ui/today.js", "js/ui/calendar.js", "js/ui/projects.js", "js/ui/goals.js", "js/ui/links.js", "js/ui/ideas.js", "js/ui/friends.js", "js/ui/settings.js", "js/ui/editor.js", "js/ui/modal.js", "js/ui/select.js", "js/ui/dnd.js", "js/ui/stats.js", "js/ui/timer.js", "js/ui/chores.js", "js/ui/scores.js", "js/ui/reading.js", "js/ui/meals.js", "js/ui/sun.js", "js/ui/quads.js", "js/ui/money.js", "js/ui/spending.js", "js/ui/island.js",
  "fonts/unbounded.woff2", "fonts/space-grotesk.woff2", "fonts/jetbrains-mono.woff2"];
const TIMEOUT = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function fromCache(req) {
  return caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : undefined));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(new Promise((resolve) => {
    let done = false;
    const finish = (res) => { if (!done) { done = true; resolve(res); } };
    const timer = setTimeout(() => fromCache(req).then((hit) => { if (hit) finish(hit); }), TIMEOUT);
    fetch(req, { cache: "no-cache" }).then((res) => {
      clearTimeout(timer);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      finish(res);
    }).catch(() => {
      clearTimeout(timer);
      fromCache(req).then((hit) => finish(hit || Response.error()));
    });
  }));
});
