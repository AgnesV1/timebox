// 网页本身（SHELL 里那些：页面、脚本、样式、字体）按版本整套存着，打开时直接用存着的，不上网等——手机打开不卡（她 2026-10-24 说的）。
// 新版靠下面的 CACHE 版本号：每次推送改它 → 浏览器打开时发现 sw.js 变了 → 新的这个装上时把整套重新下载一遍（不零碎更新，免得新旧脚本混着用）
//   → 马上接管；页面那边（js/main.js）没碰过屏幕就自己刷新，碰过了弹一句 New version ready。
// 你的数据不在这里：任务、记账都在本机 localStorage，同步照旧在后台跑。不在 SHELL 里的：照旧先上网拿，4 秒拿不到用存着的。
// 发给 Apps Script 的请求不经过这里。
const CACHE = "kuzhouduan-v79";
const SHELL = ["./", "index.html", "css/app.css", "css/money.css", "manifest.json", "icon-180.png", "favicon.png",
  "js/main.js", "js/store.js", "js/store/series.js", "js/store/timer.js", "js/store/friends.js", "js/store/goals.js", "js/store/readplan.js", "js/store/meals.js", "js/store/ideas.js", "js/store/side.js", "js/store/scores.js", "js/store/quads.js", "js/store/lists.js", "js/sync.js", "js/engine.js", "js/stats.js", "js/routines.js", "js/times.js", "js/reading.js", "js/meals.js", "js/goals.js", "js/groups.js", "js/friends.js", "js/ideas.js", "js/day.js", "js/dates.js", "js/dom.js", "js/patterns.js", "js/fx.js", "js/sky.js", "js/motion.js", "js/scores.js", "js/offdays.js", "js/quads.js", "js/money.js", "js/spend.js", "js/lists.js", "js/plantext.js",
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

// 这一版存着的：有就直接给（页面本身 = index.html）
function fromShell(req) {
  return caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === "navigate" ? c.match("index.html") : undefined)));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(fromShell(req).then((hit) => hit || networkFirst(req)).catch(() => networkFirst(req)));
});

// 存着的里没有：先上网拿（顺便存一份），4 秒拿不到就用别处存着的
function networkFirst(req) {
  return new Promise((resolve) => {
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
  });
}
