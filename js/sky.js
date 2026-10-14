// 底图上偶尔经过的小东西（挂在 #sky 里，从侧栏和卡片后面过；#sky 是 js/fx.js 建的）：
//   飞机，3–5 分钟一趟：白天是高空的一个小点拖两道长尾迹；夜里是红眼航班——一闪一闪的红灯加一颗小白灯
//   另一样，10–15 分钟一次：白天飘几片花瓣；夜里一阵流星雨
// 天上一次只放一样：轮到时还有东西没走完，就等它走完再隔一分钟。
// 平时只挂一个定时器，没有常驻的动画；东西只动 transform / opacity，放完就拿掉。
// 不放：页面在后台、系统要求减少动态、设置里关了动效、手机上（手机的任务是直接铺在底色上的）。

// ---------- 排班（只算数，test/sky.test.mjs） ----------

export const PLANE_GAP = [180, 300], RARE_GAP = [600, 900], FIRST_PLANE = [20, 60], QUIET = 60;   // 都是秒
const between = ([a, b], rnd) => (a + (b - a) * rnd()) * 1000;

// 刚打开：第一趟飞机来得早一点（看一两分钟就走的人也见得到），之后才是 3–5 分钟一趟；另一样照常排
export const firstDue = (now, rnd = Math.random) => ({ plane: now + between(FIRST_PLANE, rnd), rare: now + between(RARE_GAP, rnd) });

// 现在该不该放、放哪样 → { kind: "plane" | "rare" | "", due, wait }
//   kind 为空 = 现在不放，wait 毫秒后再来看；放了哪样，返回的 due 里那样已经排到下一趟
//   clearAt = 天上那样什么时候走完（没有 = 0）：没走完、或走完还不到一分钟，都先等。两样都到点了，先放少见的那样
export function turn(now, due, clearAt, rnd = Math.random) {
  const kind = due.rare <= now ? "rare" : "plane";
  if (now < due[kind]) return { kind: "", due, wait: Math.min(due.plane, due.rare) - now };
  const free = clearAt ? clearAt + QUIET * 1000 : 0;
  if (now < free) return { kind: "", due, wait: free - now };
  return { kind, due: { ...due, [kind]: now + between(kind === "plane" ? PLANE_GAP : RARE_GAP, rnd) }, wait: 0 };
}

// ---------- 画 ----------

const reduce = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
const R = Math.random;
let host = null, timer = 0, due = null, clearAt = 0, enabled = true;

const night = () => document.documentElement.dataset.theme === "dark";
const allowed = () => enabled && !reduce.matches && document.visibilityState === "visible" && !document.body.classList.contains("phone");

function piece(cls, html = "") {
  const el = document.createElement("span");
  el.className = "sky-ev " + cls;
  el.innerHTML = html;
  host.appendChild(el);
  return el;
}

// 一样东西沿一条略斜的直线横穿，头朝前（尾迹拖在后面），speed 是每秒多少像素；返回要多久（毫秒）。
// 元素本身头在右端、绕着头转向（css 的 transform-origin），所以位置都按「头在哪」算：从一边屏幕外进来，整个出了另一边才算完
function cross(cls, html, speed) {
  const el = piece(cls, html), W = innerWidth, H = innerHeight, w = el.offsetWidth, ltr = R() < 0.5;
  const y0 = H * (0.1 + R() * 0.45), y1 = y0 + (R() * 0.12 - 0.09) * H;
  const x0 = ltr ? -20 : W + 20, x1 = ltr ? W + w + 20 : -w - 20;
  const turnTo = " rotate(" + (Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI).toFixed(2) + "deg)";
  const at = (x, y) => ({ transform: "translate(" + (x - w).toFixed(0) + "px," + y.toFixed(0) + "px)" + turnTo });
  const ms = Math.round(Math.hypot(x1 - x0, y1 - y0) / speed * 1000);
  el.animate([at(x0, y0), at(x1, y1)], { duration: ms, easing: "linear" }).onfinish = () => el.remove();
  return ms;
}

const PETALS = ["#FFB3D1", "#FF8FBF", "#FFC9DE"];
function petals() {
  const W = innerWidth, H = innerHeight;
  let longest = 0;
  for (let i = 0; i < 6; i++) {
    const el = piece("sky-petal"), s = 6 + R() * 4, x = W * (0.05 + R() * 0.7), dx = H * (0.18 + R() * 0.2), r = R() * 360;
    el.style.cssText = "width:" + s.toFixed(1) + "px;height:" + (s * 0.7).toFixed(1) + "px;background:" + PETALS[i % 3];
    const at = (k, sway, turn) => ({ transform: "translate(" + (x + dx * k + sway).toFixed(0) + "px," + (-12 + (H + 24) * k).toFixed(0) + "px) rotate(" + (r + turn).toFixed(0) + "deg)" });
    const ms = (H + 24) / (50 + R() * 20) * 1000, delay = i * 800;
    el.animate([at(0, 0, 0), at(0.33, 18, 140), at(0.66, -10, 250), at(1, 0, 400)], { duration: ms, delay, easing: "linear", fill: "backwards" }).onfinish = () => el.remove();
    longest = Math.max(longest, ms + delay);
  }
  return Math.round(longest);
}

// 流星雨：十颗左右，都朝左下，八九秒里陆续划过
function meteors() {
  const W = innerWidth, H = innerHeight, a = 150 * Math.PI / 180, cx = Math.cos(a), cy = Math.sin(a);
  let longest = 0;
  for (let i = 0; i < 10; i++) {
    const el = piece("sky-meteor"), len = 46 + R() * 60, x = W * (0.25 + R() * 0.8), y = -10 + R() * H * 0.45, d = 200 + R() * 140;
    el.style.width = len.toFixed(0) + "px";
    const ms = 900 + R() * 500, delay = i * 800 + R() * 500;
    el.animate([{ transform: "translate(" + x.toFixed(0) + "px," + y.toFixed(0) + "px) rotate(150deg)", opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.7 },
      { transform: "translate(" + (x + cx * d).toFixed(0) + "px," + (y + cy * d).toFixed(0) + "px) rotate(150deg)", opacity: 0 }], { duration: ms, delay, easing: "ease-in", fill: "both" }).onfinish = () => el.remove();
    longest = Math.max(longest, ms + delay);
  }
  return Math.round(longest);
}

const SHOWS = {
  plane: () => cross("sky-plane", '<span class="sky-trails"><b></b><b></b></span><span class="sky-dot"></span>', 45),
  redeye: () => cross("sky-redeye", '<span class="sky-red"></span><span class="sky-white"></span>', 38),
  petals, meteors
};

// 放一样（"plane" / "redeye" / "petals" / "meteors"），返回要多久。平时由下面的 tick 按白天夜里挑；预览里也可以手动叫它看样子
export function show(kind) {
  if (!host || !SHOWS[kind]) return 0;
  const ms = SHOWS[kind]();
  clearAt = Date.now() + ms;
  return ms;
}

function arm(ms) {
  clearTimeout(timer);
  timer = setTimeout(tick, Math.max(1000, ms));
}

function tick() {
  if (!allowed()) { if (enabled && document.visibilityState === "visible") arm(60000); return; }   // 手机上、减少动态：一分钟后再看一眼
  const t = turn(Date.now(), due, clearAt);
  due = t.due;
  if (t.kind) show(t.kind === "plane" ? (night() ? "redeye" : "plane") : (night() ? "meteors" : "petals"));
  arm(t.kind ? Math.min(due.plane, due.rare) - Date.now() : t.wait);
}

// 天上那样直接拿掉（换了白天 / 夜里、关了动效）
export function clearSky() {
  if (!host) return;
  host.querySelectorAll(".sky-ev").forEach((el) => el.remove());
  if (clearAt > Date.now()) clearAt = Date.now();
}

// 设置里的 Sparkles and confetti：关了就不放，天上那样也拿掉
export function setSky(on) {
  enabled = on;
  if (!host) return;
  if (on) arm(Math.min(due.plane, due.rare) - Date.now());
  else { clearTimeout(timer); clearSky(); }
}

export function initSky(el) {
  host = el;
  due = firstDue(Date.now());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") clearTimeout(timer);   // 在后台：定时器也不挂
    else if (enabled) arm(Math.min(due.plane, due.rare) - Date.now());
  });
  if (enabled) arm(due.plane - Date.now());
}
