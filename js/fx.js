// 点哪里冒一圈细细的涟漪；标 Done 时在按钮上放一把（白天丝网印纸片、夜里一朵烟花），守住安全线时白天满屏纸片、夜里三发烟花。纯装饰，不接收点击。
// 系统开了「减弱动态效果」或设置里关掉时，全都不放。
// 还有整站的底图（#sky，样子在 css 里）：白天蓝天白云，夜里三层星星；天色跟着钟点走；关掉动效时停住不动。
// 底图上偶尔经过的飞机、花瓣、流星雨在 js/sky.js。

import { initSky, setSky, clearSky } from "./sky.js";
import { skyAt } from "./day.js";

let layer = null, live = 0, enabled = true;
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

let palette = null;
function colors() {
  if (palette) return palette;
  const cs = getComputedStyle(document.documentElement);
  return (palette = ["--c-Main", "--c-Work", "--c-Fun", "--c-Chore", "--accent"].map((n) => cs.getPropertyValue(n).trim()));
}

// 换了白天/夜间主题后重新取颜色；天上正经过的那样也拿掉（白天的飞机不该飞进夜里）
export function refreshFxColors() { palette = null; clearSky(); tintSky(); flashLoop(); }

function spawn(el, x, y, frames, ms, easing) {
  el.style.left = x + "px";
  el.style.top = y + "px";
  layer.appendChild(el);
  live++;
  el.animate(frames, { duration: ms, easing: easing || "linear" }).onfinish = () => { el.remove(); live--; };
}

export function setFx(on) { enabled = on; document.documentElement.classList.toggle("fx-off", !on); document.getElementById("sky")?.classList.toggle("still", !on); setSky(on); }

// 底图：一层云（白天）；夜里的星星分三层——最远一层又小又暗、不动（两块大小不同的 SVG 平铺叠在一起，看不出重复）；
// 中间一层是一颗颗小白点，各闪各的（每颗自己的快慢和起点）；最近一层只有几颗小星芒，闪得慢。另外每隔一两秒挑一到三颗亮一下（flashLoop）。
// 还有地平线：白天底边正中一片横线地面，夜里底边一层霓虹网格地面，只在计时的时候出现（样子在 css 里）。天的颜色跟着钟点走（tintSky）
const SPARK = '<svg viewBox="-10 -10 20 20"><path d="M0 -10Q0 0 10 0Q0 0 0 10Q0 0 -10 0Q0 0 0 -10Z" fill="#fff"/></svg>';
let stars = [];   // 中、近两层每颗星在哪（屏幕的百分比），亮一下的时候从里面挑
function sky() {
  const el = document.createElement("div"), R = Math.random;
  el.id = "sky";
  el.setAttribute("aria-hidden", "true");
  const far = (w, h, n) => {
    let dots = "";
    for (let i = 0; i < n; i++) dots += "<circle cx='" + (R() * w).toFixed(0) + "' cy='" + (R() * h).toFixed(0) + "' r='" + (0.35 + R() * 0.2).toFixed(2) + "' fill-opacity='" + (0.2 + R() * 0.25).toFixed(2) + "'/>";
    return "url(&quot;data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='" + w + "' height='" + h + "'><g fill='#cfd6ff'>" + dots + "</g></svg>") + "&quot;)";
  };
  let near = "";
  stars = [];
  for (let i = 0; i < 46; i++) {
    const x = R() * 100, y = R() * 96, z = (0.9 + R() * 0.5).toFixed(2);
    stars.push([x, y]);
    near += '<b style="left:' + x.toFixed(2) + "%;top:" + y.toFixed(2) + "%;width:" + z + "px;height:" + z + "px;--d:" + (3 + R() * 6).toFixed(1) + "s;--dl:-" + (R() * 9).toFixed(1) + 's"></b>';
  }
  for (let i = 0; i < 6; i++) {
    const x = 4 + R() * 92, y = 4 + R() * 84, z = (4 + R() * 2.5).toFixed(1);
    stars.push([x, y]);
    near += '<b class="sp" style="left:' + x.toFixed(2) + "%;top:" + y.toFixed(2) + "%;width:" + z + "px;height:" + z + "px;--d:" + (6 + R() * 5).toFixed(1) + "s;--dl:-" + (R() * 9).toFixed(1) + 's">' + SPARK + "</b>";
  }
  el.innerHTML = '<i class="cloud"></i><i class="st-far" style="background-image:' + far(520, 560, 62) + "," + far(730, 690, 90) + '"></i><i class="st-near">' + near + "</i>" +
    '<i class="hz-lines"><b></b></i><i class="hz-grid"><b></b></i>';
  document.body.prepend(el);
  tintSky();
  initSky(el);
  flashLoop();
}

// 天的颜色跟着钟点（js/day.js 的 skyAt）：写成 #sky 上的几个 css 变量，css 拿它们画渐变。换白天夜里时、每分钟各看一次
export function tintSky() {
  const el = document.getElementById("sky");
  if (!el) return;
  const t = skyAt(document.documentElement.dataset.theme === "dark");
  for (const [k, v] of [["top", t.top], ["mid", t.mid], ["hor", t.hor], ["pk", t.pink], ["bl", t.blue], ["stars", t.stars]]) el.style.setProperty("--sk-" + k, v);
}

// 夜里每隔一两秒挑一到三颗星亮一下：把天分成 4 × 3 格，前五次亮过的那几格这次不挑（每次亮的地方都不一样）；
// 亮法分三档，大多是小小一闪，偶尔一颗中等的，很少来一颗带青柠光的大的。页面在后台、白天、关了动效、减少动态时都不放
const recent = [];
let flashTimer = 0;
function flashOne() {
  const host = document.getElementById("sky");
  if (!host) return;
  const R = Math.random, free = [...Array(12).keys()].filter((c) => !recent.includes(c)), c = free[R() * free.length | 0];
  recent.push(c);
  if (recent.length > 5) recent.shift();
  const cx = c % 4, cy = c / 4 | 0, inCell = stars.filter(([x, y]) => x >= cx * 25 && x < cx * 25 + 25 && y >= cy * 33.4 && y < cy * 33.4 + 33.4);
  const [x, y] = inCell.length ? inCell[R() * inCell.length | 0] : [(cx + R()) * 25, (cy + R()) * 33.4];
  const lv = R(), z = lv < 0.6 ? 5 + R() * 2 : lv < 0.9 ? 8 + R() * 3 : 12 + R() * 3;
  const f = document.createElement("span");
  f.className = "st-flash" + (lv < 0.6 ? "" : lv < 0.9 ? " mid" : " big");
  f.style.cssText = "left:calc(" + x.toFixed(2) + "% - " + (z / 2).toFixed(1) + "px);top:calc(" + y.toFixed(2) + "% - " + (z / 2).toFixed(1) + "px);width:" + z.toFixed(1) + "px;height:" + z.toFixed(1) + "px";
  f.innerHTML = SPARK;
  host.appendChild(f);
  f.animate([{ transform: "scale(0) rotate(0deg)", opacity: 0 }, { transform: "scale(1) rotate(20deg)", opacity: lv < 0.6 ? 0.75 : 1, offset: 0.35 }, { transform: "scale(.15) rotate(40deg)", opacity: 0 }],
    { duration: 900 + R() * 700, easing: "ease-out" }).onfinish = () => f.remove();
}
function flashLoop() {
  clearTimeout(flashTimer);
  const on = enabled && !reduce() && document.visibilityState === "visible" && document.documentElement.dataset.theme === "dark";
  if (on) { const n = 1 + (Math.random() * 3 | 0); for (let j = 0; j < n; j++) setTimeout(flashOne, j * (150 + Math.random() * 350)); }
  flashTimer = setTimeout(flashLoop, on ? 900 + Math.random() * 1100 : 20000);
}

// ---------- 点 Done 撒的东西（2026-10-17 她挑的）：白天一把丝网印纸片，夜里一朵烟花 ----------
const night = () => document.documentElement.dataset.theme === "dark";
const R = Math.random;
const live1 = (el, frames, opt, done) => { layer.appendChild(el); live++; el.animate(frames, opt).onfinish = () => { el.remove(); live--; done?.(); }; };

// 白天的一片纸：随机三到五条边的小多边形，平涂颜色、压一道黑边（白昼酸的丝网印）
function shardEl(color, z) {
  const k = 3 + (R() * 3 | 0), pts = [];
  for (let i = 0; i < k; i++) { const a = i / k * 6.283 + R() * 0.9, r = 0.55 + R() * 0.45; pts.push((50 + Math.cos(a) * 50 * r).toFixed(0) + "," + (50 + Math.sin(a) * 50 * r).toFixed(0)); }
  const el = document.createElement("i");
  el.className = "bit";
  el.style.cssText = "width:" + z.toFixed(1) + "px;height:" + z.toFixed(1) + "px;margin:" + (-z / 2).toFixed(1) + "px 0 0 " + (-z / 2).toFixed(1) + "px";
  el.innerHTML = '<svg viewBox="-4 -4 108 108"><polygon points="' + pts.join(" ") + '" fill="' + color + '" stroke="#0B0B0B" stroke-width="7" stroke-linejoin="round"/></svg>';
  return el;
}

// 一把纸片从 (x, y) 往上、往两边炸开，带着空气阻力慢下来，翻着面往下飘（rotateX 翻面、rotateZ 打转）
function shards(x, y, n, spread) {
  const p = [...colors(), "#FFFFFF"];
  for (let i = 0; i < n && live < 140; i++) {
    const z = 7 + R() * 8, el = shardEl(p[i % p.length], z);
    const a = -Math.PI / 2 + (R() - 0.5) * Math.PI * 1.5, v = spread * (0.5 + R() * 0.6), vx = Math.cos(a) * v, vy = Math.sin(a) * v, g = spread * 1.6, rx = 360 + R() * 720, rz = (R() - 0.5) * 540, K = 14, frames = [];
    for (let k = 0; k <= K; k++) {
      const t = k / K * 1.4, drag = (1 - Math.exp(-2.2 * t)) / 2.2;
      frames.push({ transform: "translate(" + (vx * drag).toFixed(1) + "px," + (vy * drag + g * t * t * 0.5).toFixed(1) + "px) rotateX(" + (rx * k / K).toFixed(0) + "deg) rotateZ(" + (rz * k / K).toFixed(0) + "deg)", opacity: k < K * 0.7 ? 1 : 1 - (k - K * 0.7) / (K * 0.3) });
    }
    el.style.left = x + "px"; el.style.top = y + "px";
    live1(el, frames, { duration: 1500 + R() * 500, easing: "linear" });
  }
}

// 夜里的一朵烟花：先闪一下，火星拖着光尾往外散，慢下来往下垂，三成多最后在落点零星闪一下。颜色每朵挑两种霓虹，掺几颗白的
function firework(x, y, n, spread) {
  const flash = document.createElement("i");
  flash.className = "boom";
  flash.style.left = x + "px"; flash.style.top = y + "px";
  live1(flash, [{ transform: "scale(.2)", opacity: 1 }, { transform: "scale(1.4)", opacity: 0 }], { duration: 380, easing: "ease-out" });
  const p = colors(), pair = [p[R() * p.length | 0], p[R() * p.length | 0]];
  for (let i = 0; i < n && live < 140; i++) {
    const c = i % 5 === 0 ? "#FFFFFF" : pair[i % 2], el = document.createElement("i");
    el.className = "spark";
    el.style.cssText = "left:" + x + "px;top:" + y + "px;--c:" + c;
    const a = i / n * 6.283 + (R() - 0.5) * 0.25, v = spread * (0.75 + R() * 0.35), K = 16, frames = [];
    let lx = 0, ly = 0;
    for (let k = 0; k <= K; k++) {
      const t = k / K * 1.3, drag = (1 - Math.exp(-3.2 * t)) / 3.2, px = Math.cos(a) * v * drag, py = Math.sin(a) * v * drag + spread * 0.55 * t * t;
      const ang = k ? Math.atan2(py - ly, px - lx) * 180 / Math.PI : a * 180 / Math.PI, sp = k ? Math.hypot(px - lx, py - ly) / 6 : 1.2;
      frames.push({ transform: "translate(" + px.toFixed(1) + "px," + py.toFixed(1) + "px) rotate(" + ang.toFixed(0) + "deg) scaleX(" + Math.max(0.15, Math.min(1.6, sp)).toFixed(2) + ")", opacity: k < K * 0.6 ? 1 : Math.max(0, 1 - (k - K * 0.6) / (K * 0.4)) });
      lx = px; ly = py;
    }
    const ex = x + lx, ey = y + ly;
    live1(el, frames, { duration: 1300 + R() * 300, easing: "linear" }, () => {
      if (R() > 0.35 || live > 140) return;
      const s = document.createElement("i");
      s.className = "crackle";
      s.style.left = ex + "px"; s.style.top = ey + "px";
      live1(s, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: "translateY(6px)", opacity: 0 }], { duration: 400 + R() * 300 });
    });
  }
}

const quiet = () => !layer || !enabled || reduce();
export function burst(x, y, big = true) {
  if (quiet()) return;
  if (night()) firework(x, y, big ? 26 : 12, big ? 80 : 46);
  else shards(x, y, big ? 20 : 8, big ? 150 : 90);
}

// 守住今天的线：白天满屏纸片从上面翻着落下来；夜里从底下升起三发烟花，在天上炸开
export function confetti() {
  if (quiet()) return;
  const w = innerWidth, h = innerHeight;
  if (night()) {
    [0, 500, 1000].forEach((d) => setTimeout(() => {
      const x = w * (0.2 + R() * 0.6), y = h * (0.18 + R() * 0.3), el = document.createElement("i");
      el.className = "rocket";
      el.style.left = x + "px"; el.style.top = "0px";
      live1(el, [{ transform: "translateY(" + h + "px)", opacity: 1 }, { transform: "translateY(" + y + "px)", opacity: 0.8 }], { duration: 700, easing: "cubic-bezier(.2,.6,.4,1)" }, () => firework(x, y, 28, Math.min(130, w * 0.09)));
    }, d));
    return;
  }
  const p = [...colors(), "#FFFFFF"];
  for (let i = 0; i < 70; i++) setTimeout(() => {
    if (live > 140) return;
    const z = 7 + R() * 8, el = shardEl(p[i % p.length], z), x = R() * w, dx = (R() - 0.5) * 80, rx = 720 + R() * 720;
    el.style.left = x + "px"; el.style.top = "-20px";
    live1(el, [{ transform: "translate(0,0) rotateX(0) rotateZ(0)" }, { transform: "translate(" + (dx * 0.5 + Math.sin(i) * 18).toFixed(0) + "px," + (h * 0.5).toFixed(0) + "px) rotateX(" + rx / 2 + "deg) rotateZ(" + dx * 3 + "deg)" },
      { transform: "translate(" + dx.toFixed(0) + "px," + (h + 40).toFixed(0) + "px) rotateX(" + rx + "deg) rotateZ(" + dx * 6 + "deg)" }], { duration: 2800 + R() * 1500, easing: "ease-in" });
  }, R() * 1100);
}

// 标了 Done：在按的那个按钮上放
export function cheer(el, status) {
  if (status !== "done") return;
  const b = el.getBoundingClientRect();
  burst(b.left + b.width / 2, b.top + b.height / 2, true);
}

export function initFx() {
  sky();
  layer = document.createElement("div");
  layer.className = "fx";
  document.body.appendChild(layer);
  let lx = 0, ly = 0, lt = 0;
  addEventListener("pointerdown", (e) => {
    if (!enabled || reduce() || e.target.closest("input,textarea,select,[data-drag],[data-drag-row]")) return;
    if (e.timeStamp - lt < 50 && Math.hypot(e.clientX - lx, e.clientY - ly) < 10) return;
    lx = e.clientX; ly = e.clientY; lt = e.timeStamp;
    const o = document.createElement("i");
    o.className = "ring";
    spawn(o, lx, ly, [{ transform: "scale(.3)", opacity: 0.6 }, { transform: "scale(1.4)", opacity: 0 }], 450, "cubic-bezier(.2,.7,.3,1)");
  }, { passive: true });
}
