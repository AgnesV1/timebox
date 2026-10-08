// 今天页的「日出」螺旋（手机和电脑都有）：一圈 = 一天，6 点在左、中午在上、18 点在右、半夜在下；
// 昨天、今天（中间、最粗）、明天三圈连成一条螺旋，越往外越晚（时间几何在 js/day.js）。
// 画上去的：计过时的每一段（计划颜色）、通勤日的固定时段（灰斜纹）、正在计时的那段（到现在），「现在」是一颗小太阳。
// 平时它是计时浮条上面一个半透明的半圆；往上拖，它跟着手指升起、变大，螺旋从昨天早上一路「画」到明天；
// 松手时甩得快就照方向飞上去 / 落下，慢慢拖的过了三分之一才升到屏幕中间；用弹簧收尾，到位轻轻回弹。
// 点一下也能升起 / 落下；升起时点某一段看详情，点外面、往下拖、按 Esc 落回。

import * as store from "../store.js";
import * as D from "../day.js";
import { parseTimes } from "../times.js";
import { esc, on } from "../dom.js";
import { addDays, fmtDay, fmtMin, fmtShort, todayIso, weekday, WEEKDAYS } from "../dates.js";
import { colorOf } from "./common.js";

const SPAN = 3 * D.TURN;        // 三圈：昨天、今天、明天
const R0 = 56, GAP = 23;        // 螺旋起点的半径、每圈往外多少（viewBox ±150）
const W_DAY = 16, W_SIDE = 7;   // 今天那圈的宽度、前后两天的宽度
const STEP = 8;                 // 画带子时每 8 分钟（2°）取一个点
const MIN_LEN = 10;             // 太短的段至少画这么长，不然看不见
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

let host = null;
let date = "";
let risen = false;
let p = 0;           // 0 = 落着，1 = 升起来了；拖的时候在中间，弹簧收尾时会稍微冲过头
let drag = null;
let picked = "";     // 升起时点了哪一段（它的 key）
let pieces = [];     // 这三天的段（render 时算好）
let anim = 0;
let els = null;      // 每帧要改的几个元素，render 时取好

const f1 = (v) => Math.round(v * 10) / 10;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (x) => { const v = clamp01(x); return v * v * (3 - 2 * v); };

// 螺旋分钟 t 处带子的宽度：今天那圈粗，6 点交界前后各 45 分钟慢慢变；螺旋两头收成尖
function widthAt(t) {
  const k = smooth((t - D.TURN + 45) / 90) - smooth((t - 2 * D.TURN + 45) / 90);
  const tip = Math.min(1, 0.15 + 0.85 * smooth(t / 240), 0.15 + 0.85 * smooth((SPAN - t) / 240));
  return (W_SIDE + (W_DAY - W_SIDE) * k) * tip;
}

// 螺旋分钟 t 的方向上、半径 r 的点；at(t, dr) = 螺旋上那一点再往外偏 dr
const radiusAt = (t) => R0 + (GAP * t) / D.TURN;
function polar(t, r) { const a = (D.angleAt(t) * Math.PI) / 180; return [r * Math.cos(a), r * Math.sin(a)]; }
const at = (t, dr = 0) => polar(t, radiusAt(t) + dr);
const xy = ([x, y]) => f1(x) + " " + f1(y);

// 螺旋上从 t1 到 t2 的一截带子（填充的多边形）；half(t) = 那里的半宽
function ribbon(t1, t2, half = (t) => widthAt(t) / 2) {
  const n = Math.max(2, Math.ceil((t2 - t1) / STEP) + 1), out = [], inn = [];
  for (let i = 0; i < n; i++) {
    const t = t1 + ((t2 - t1) * i) / (n - 1), h = Math.max(0.4, half(t));
    out.push(at(t, h));
    inn.push(at(t, -h));
  }
  return "M" + out.map(xy).join("L") + "L" + inn.reverse().map(xy).join("L") + "Z";
}

// 螺旋的中线（升起时的「笔」沿着它走）；dr 可以是函数
function line(t1, t2, dr = 0) {
  const n = Math.ceil((t2 - t1) / STEP) + 1, pts = [];
  for (let i = 0; i < n; i++) { const t = t1 + ((t2 - t1) * i) / (n - 1); pts.push(at(t, typeof dr === "function" ? dr(t) : dr)); }
  return "M" + pts.map(xy).join("L");
}

// 某个时刻（毫秒）在螺旋上是第几分钟
const minAt = (origin, ms) => { const d = new Date(ms); return D.absMin(origin, todayIso("00:00", d), store.clockOf(ms), "00:00"); };

// 这三天要画的：通勤固定时段、计过时的段、正在跑的那段（到现在）；裁到三圈里
function collect(origin) {
  const ds = store.prefs().dayStartsAt, list = [];
  const put = (x, s) => {
    if (!s) return;
    const a = Math.max(0, s.a), b = Math.min(SPAN, s.b);
    if (b > a) list.push({ ...x, a, b, key: x.kind + "|" + x.date + "|" + x.from + "|" + (x.label || "") });
  };
  for (let k = -1; k <= 3; k++) {
    const day = addDays(origin, k);
    if (store.isCommuteDay(day)) D.COMMUTE_BLOCKS.forEach((b) => put({ ...b, date: day, kind: "fixed" }, D.blockSpan(origin, day, b.from, b.to)));
    for (const t of store.tasksOn(day)) {
      for (const s of parseTimes(t.times)) {
        if (s.from && s.to) put({ from: s.from, to: s.to, min: s.min, label: t.title, date: day, kind: "time", color: colorOf(t) }, D.stretch(origin, day, s.from, s.to, ds));
      }
    }
  }
  const run = store.timer(), rt = run && store.get("tasks", run.taskId);
  if (rt) put({ from: store.clockOf(Number(run.start)), to: store.clockNow(), label: rt.title, date: rt.date, kind: "live", color: colorOf(rt) }, { a: minAt(origin, Number(run.start)), b: minAt(origin, Date.now()) });
  // 固定时段垫在底下，计时的盖在上面
  return list.sort((x, y) => (x.kind === "fixed") === (y.kind === "fixed") ? x.a - y.a : x.kind === "fixed" ? -1 : 1);
}

// 三圈的名字：今天前后用 Yesterday / Today / Tomorrow，再远写星期几和日期
function dayName(x) {
  const t = store.today();
  if (x === t) return "Today";
  if (x === addDays(t, -1)) return "Yesterday";
  if (x === addDays(t, 1)) return "Tomorrow";
  return WEEKDAYS[weekday(x)] + " " + Number(x.slice(8));
}

function centerHTML(d) {
  const x = pieces.find((y) => y.key === picked);
  if (x) {
    return "<b>" + esc(x.label) + "</b><span class=\"num\">" + esc(x.from) + "–" + esc(x.to) + (x.date !== d ? " · " + esc(fmtShort(x.date)) : "") + "</span>" +
      (x.kind === "fixed" ? "<em>Commute day</em>" : x.kind === "live" ? "<em>Running</em>" : "<em class=\"num\">" + fmtMin(x.min) + "</em>");
  }
  const total = store.tasksOn(d).reduce((a, t) => a + parseTimes(t.times).reduce((s, y) => s + y.min, 0), 0);
  return "<b>" + esc(fmtDay(d)) + "</b><span class=\"num\">" + (total ? fmtMin(total) + " timed" : "Nothing timed yet") + "</span>" +
    (store.isCommuteDay(d) ? "<em>Commute day</em>" : "");
}

function segPath(x) {
  const pad = Math.max(0, MIN_LEN - (x.b - x.a)) / 2;
  return ribbon(Math.max(0, x.a - pad), Math.min(SPAN, x.b + pad));
}

function sunHTML(d) {
  const origin = addDays(d, -1);
  pieces = collect(origin);
  if (picked && !pieces.some((x) => x.key === picked)) picked = "";
  const now = minAt(origin, Date.now());

  // 底轨：白天（6–18）和夜里（18–6）两种底色，「现在」之后的淡一些
  let track = "";
  for (let k = 0; k < 6; k++) {
    const a = k * 720, b = a + 720, cls = "trk " + (k % 2 ? "night" : "day");
    const cut = Math.max(a, Math.min(b, now));
    if (cut > a) track += '<path class="' + cls + '" d="' + ribbon(a, cut) + '"/>';
    if (cut < b) track += '<path class="' + cls + ' later" d="' + ribbon(cut, b) + '"/>';
  }

  const seg = (x) => '<path class="seg ' + x.kind + (x.key === picked ? " on" : "") + '" data-k="' + esc(x.key) + '" d="' + segPath(x) + '"' + (x.color ? ' style="--c:' + esc(x.color) + '"' : "") + "/>";
  const segs = pieces.map(seg).join("");
  // 透明的宽点击带：细的昨天 / 明天段也点得中
  const hits = pieces.map((x) => '<path data-k="' + esc(x.key) + '" d="' + ribbon(Math.max(0, x.a - 6), Math.min(SPAN, x.b + 6), () => GAP / 2) + '"><title>' + esc(x.label + " · " + x.from + "–" + x.to) + "</title></path>").join("");

  // 外圈刻度和钟点：6 / 12 / 18 / 0 粗，3 / 9 / 15 / 21 细；数字随升起按顺时针一个个出来
  const rOut = radiusAt(SPAN) + 6;
  let ticks = "", hours = "";
  for (let h = 0; h < 24; h++) {
    const t = h * 60, major = h % 6 === 0, mid = h % 3 === 0;
    const [x1, y1] = polar(t, rOut), [x2, y2] = polar(t, rOut + (mid ? 5 : 2.5));
    ticks += '<line class="tick' + (major ? " major" : "") + '" x1="' + f1(x1) + '" y1="' + f1(y1) + '" x2="' + f1(x2) + '" y2="' + f1(y2) + '"/>';
    if (mid) {
      const [x, y] = polar(t, rOut + 15);
      hours += '<text class="' + (major ? "major" : "") + '" x="' + f1(x) + '" y="' + f1(y) + '" style="--k:' + (h / 24) * 0.45 + '">' + ((6 + h) % 24) + "</text>";
    }
  }

  // 三圈的名字写在圈和圈之间的缝里，沿着螺旋、在中午那一段的正中
  const gapAt = (t) => (GAP + widthAt(t) / 2 - (t + D.TURN <= SPAN ? widthAt(t + D.TURN) : W_SIDE) / 2) / 2;
  let defs = "", names = "";
  for (let k = 0; k < 3; k++) {
    const x = addDays(origin, k);
    defs += '<path id="sun-name-' + k + '" d="' + line(k * D.TURN + 60, k * D.TURN + 660, gapAt) + '"/>';
    names += '<text class="' + (x === d ? "cur" : "") + '" dy="0.35em"><textPath href="#sun-name-' + k + '" startOffset="50%">' + esc(dayName(x)) + "</textPath></text>";
  }

  const sun = now >= 0 && now <= SPAN ? (() => { const [x, y] = at(now); return '<circle class="glow" cx="' + f1(x) + '" cy="' + f1(y) + '" r="15"/><circle class="now" cx="' + f1(x) + '" cy="' + f1(y) + '" r="5"/>'; })() : "";

  return '<div class="sun' + (picked ? " picking" : "") + '" role="button" tabindex="0" aria-label="Yesterday, today and tomorrow on a spiral clock — drag up or press Enter">' +
    '<svg viewBox="-150 -150 300 300" aria-hidden="true"><defs>' +
    '<pattern id="sun-hatch" class="hatch" width="3.5" height="3.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.5" height="3.5"/></pattern>' +
    '<radialGradient id="sun-glow"><stop offset="0" class="g0"/><stop offset="1" class="g1"/></radialGradient>' +
    '<mask id="sun-reveal" maskUnits="userSpaceOnUse" x="-150" y="-150" width="300" height="300"><path class="guide" d="' + line(0, SPAN) + '"/></mask>' + defs + "</defs>" +
    '<g class="ticks">' + ticks + "</g>" +
    '<g class="track">' + track + "</g>" +
    '<g class="segs base">' + segs + "</g>" +
    '<g class="segs lit" mask="url(#sun-reveal)">' + segs + "</g>" +
    '<g class="names">' + names + "</g>" + sun + '<circle class="pen" r="3.2" cx="0" cy="0"/>' +
    '<g class="hits">' + hits + "</g>" +
    '<g class="hours">' + hours + "</g></svg>" +
    '<div class="sun-c">' + centerHTML(d) + "</div></div>";
}

// 按 p 画：背景压暗、位置大小（--q 带回弹）、笔沿螺旋走到 p 的地方，走过的地方亮起来
function paint() {
  if (!host) return;
  const v = clamp01(p);
  host.style.setProperty("--p", v.toFixed(3));
  host.style.setProperty("--q", Math.max(-0.06, Math.min(1.08, p)).toFixed(3));
  if (!els) return;
  const { guide, pen, len } = els;
  guide.style.strokeDashoffset = f1(len * (1 - v));
  const pt = v > 0.005 && v < 0.995 ? guide.getPointAtLength(len * v) : null;
  pen.style.opacity = pt ? Math.sin(Math.PI * v).toFixed(3) : "0";
  if (pt) { pen.setAttribute("cx", f1(pt.x)); pen.setAttribute("cy", f1(pt.y)); }
}

// 弹簧：从现在的 p 和速度 v0（每秒多少）弹到 0 或 1，到位稍微冲过头一点再回来
function settle(up, v0 = 0) {
  risen = up;
  host.classList.toggle("up", up);
  cancelAnimationFrame(anim);
  if (!up && picked) setPicked("");
  const to = up ? 1 : 0;
  if (reduce.matches) { p = to; paint(); return; }
  const K = 230, C = 2 * Math.sqrt(K) * 0.72;
  let v = Math.max(-8, Math.min(8, v0)), last = performance.now();
  const step = (now) => {
    const dt = Math.min(0.032, (now - last) / 1000) / 2;
    last = now;
    for (let i = 0; i < 2; i++) { v += (-K * (p - to) - C * v) * dt; p += v * dt; }
    if (Math.abs(p - to) < 0.002 && Math.abs(v) < 0.02) p = to;
    paint();
    if (p !== to) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

// 点了某一段：其他的变淡，中间换成这一段的详情（淡入、往上浮一点）
function setPicked(k) {
  picked = k;
  const el = host.querySelector(".sun");
  el.classList.toggle("picking", Boolean(k));
  el.querySelectorAll(".seg").forEach((s) => s.classList.toggle("on", s.dataset.k === k));
  const c = el.querySelector(".sun-c");
  c.innerHTML = centerHTML(date);
  if (!reduce.matches) c.animate([{ opacity: 0, transform: "translate(-50%, -42%)" }, { opacity: 1, transform: "translate(-50%, -50%)" }], { duration: 180, easing: "ease-out" });
}

// 今天页显示的那一天（d）；别的页传空，圆盘收起来
export function renderSun(c, d) {
  host = host || document.getElementById("sun");
  if (!host) return;
  if (!d) {
    if (host.innerHTML) { cancelAnimationFrame(anim); host.innerHTML = ""; host.className = ""; risen = false; p = 0; picked = ""; els = null; paint(); }
    return;
  }
  if (drag) return;   // 正在拖：别换掉
  if (d !== date) { picked = ""; date = d; }
  host.classList.toggle("up", risen);
  host.innerHTML = sunHTML(d);
  const guide = host.querySelector(".guide");
  const len = guide.getTotalLength();
  guide.style.strokeDasharray = f1(len) + " " + f1(len + 10);
  els = { guide, pen: host.querySelector(".pen"), len };
  paint();
}

export function initSun() {
  on(document, "pointerdown", "#sun .sun", (e, el) => {
    if (e.button > 0) return;
    e.preventDefault();
    cancelAnimationFrame(anim);
    p = clamp01(p);
    drag = { y0: e.clientY, p0: p, moved: false, el, hit: e.target.closest("[data-k]"), hist: [[e.timeStamp, p]] };
    el.classList.add("dragging");
    el.setPointerCapture?.(e.pointerId);
  });
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dy = drag.y0 - e.clientY;
    if (Math.abs(dy) > 6) drag.moved = true;
    if (!drag.moved) return;
    const dock = parseFloat(getComputedStyle(document.body).getPropertyValue("--dock-h")) || 0;
    const L = Math.max(120, innerHeight / 2 - dock);
    let x = drag.p0 + dy / L;
    if (x > 1) x = 1 + (x - 1) * 0.25; else if (x < 0) x *= 0.25;   // 拉过头：橡皮筋
    p = x;
    paint();
    drag.hist.push([e.timeStamp, p]);
    if (drag.hist.length > 12) drag.hist.shift();
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.el.classList.remove("dragging");
    if (!d.moved) {
      // 点一下：升起时点某一段 = 看它；别的地方 = 升起 / 落下
      if (risen && d.hit) { setPicked(d.hit.dataset.k === picked ? "" : d.hit.dataset.k); return; }
      settle(!risen);
      return;
    }
    // 松手前 100ms 里的速度：甩得够快就照方向走，不然看停在哪
    const h = d.hist.filter(([t]) => e.timeStamp - t <= 100);
    const v = h.length > 1 && h[h.length - 1][0] > h[0][0] ? ((h[h.length - 1][1] - h[0][1]) / (h[h.length - 1][0] - h[0][0])) * 1000 : 0;
    settle(Math.abs(v) > 1.4 ? v > 0 : d.p0 < 0.5 ? p > 0.33 : p > 0.67, v);
  };
  addEventListener("pointerup", end);
  addEventListener("pointercancel", end);
  // 升起时点外面（压暗的背景）落回
  on(document, "click", "#sun.up", (e) => { if (e.target.id === "sun") settle(false); });
  on(document, "keydown", "#sun .sun", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); settle(!risen); } });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && risen && !document.querySelector("#modal:not([hidden])")) settle(false); });
}
