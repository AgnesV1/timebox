// 今天页的「日出」圆盘（手机和电脑都有）：这一天计过时的每一段画在 24 小时的圆盘上——
// 外圈 6→18（白天）、内圈 18→6（夜里），6 点在左边、顺时针（几何在 js/day.js）。
// 底盘是灰的，没做事的时间就是这层灰；最左边（6 点 / 18 点，一圈的头和尾）横着切开一道细缝（两个主题都有）。
// 夜里底盘是镜面铬（白天那圈亮银、夜里那圈深灰），任务是发光的整块，颜色用项目颜色的霓虹版（groups.js 的 neon）。
// 白天整个是丝网印的画法：两圈平涂的灰，底下各垫一版错开一点的粉和青蓝（套印没对准露出来的边，.reg），整盘压一层颗粒（.sun-grain）；
// 任务是平涂的霓虹色块、底下垫一版错开的藏青（print()），整块的那条弧只留着接手指、标选中。
// 每天晚上 11 点到早上 8 点是休息，通勤日再加来回路上的两段：这些不可用的时段先盖一层磨砂把反光压下去、再压深色细纹；
// 正在计时的那段画到现在；升起来以后整个圆盘外面有一圈和金属同色的柔光（css 里 .sun 的 box-shadow，压在阴影上面）；
// 「现在」是从圆心伸出去的一根指针（白天电光蓝、夜里青柠），指到当前那一圈的外沿——升起来以后指针从中间那几行字外面起。
// 平时它是屏幕下方一个半透明的半圆（在计时浮条上面）；往上拖，它跟着手指升起、变大，时间段从 6 点起一段段亮起；
// 松手过了三分之一就升到屏幕中间，不然落回去；甩一下也行（看松手前的速度）。点一下也能升起 / 落下；升起时点外面、往下拖、按 Esc 落回。
// 落着的时候只有两圈环本身接手指（样式里 pointer-events: stroke），别的地方的点击穿过去给下面的列表；
// 圆盘正下方（浮条上沿）一个小签：这一天做了多少深度（◆ Deep），设了每天的目标就带上目标。

import * as store from "../store.js";
import * as D from "../day.js";
import * as E from "../engine.js";
import { lifeOf } from "../stats.js";
import { parseTimes } from "../times.js";
import { esc, on } from "../dom.js";
import { fmtDay, fmtMin, fmtHours } from "../dates.js";
import { colorOf } from "./common.js";
import { neon } from "../groups.js";

const RO = 98, RI = 72;   // 外圈、内圈的半径（viewBox ±120，圈宽 18）
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

let host = null;
let date = "";
let risen = false;
let p = 0;           // 0 = 落着，1 = 升起来了；拖的时候在中间
let drag = null;
let picked = -1;     // 升起时点了哪一段
let pieces = [];     // 这一天的弧（render 时算好）
let anim = 0;

const pt = (r, deg) => { const t = (deg * Math.PI) / 180; return [r * Math.cos(t), r * Math.sin(t)]; };
const f1 = (v) => Math.round(v * 10) / 10;

// 一圈上从 a 到 b（圆盘分钟）的弧
function arcPath(r, a, b) {
  const t1 = D.angleOf(a), span = ((b - a) / 720) * 360;
  if (span >= 359.9) return "M" + -r + " 0A" + r + " " + r + " 0 1 1 " + r + " 0A" + r + " " + r + " 0 1 1 " + -r + " 0";
  const [x1, y1] = pt(r, t1), [x2, y2] = pt(r, t1 + span);
  return "M" + f1(x1) + " " + f1(y1) + "A" + r + " " + r + " 0 " + (span > 180 ? 1 : 0) + " 1 " + f1(x2) + " " + f1(y2);
}

// 白天的一块：丝网印——平涂的色块（ink），底下错开一点垫一版藏青（sh，像套印没对准露出来的那一版）。颜色在 css 里从 --c 给
function print(x, color, boost) {
  const d = arcPath(x.ring === "outer" ? RO : RI, x.a, x.b);
  return '<g class="print' + (boost ? " boost" : "") + '" style="--c0:' + esc(color) + '"><path class="sh" transform="translate(1.6 1.6)" d="' + d + '"/><path class="ink" d="' + d + '"/></g>';
}

// 这一天要画的：通勤固定时段（灰）、计过时的段（计划颜色）、正在跑的那段（到现在）
function collect(c, d) {
  const list = [];
  // 每天晚上 11 点到早上 8 点是休息；通勤日再加上来回路上的两段
  (store.isCommuteDay(d) ? D.COMMUTE_BLOCKS : [D.REST_BLOCK]).forEach((b) => list.push({ ...b, kind: "fixed", color: "", rest: b === D.REST_BLOCK }));
  const run = store.timer();
  for (const t of store.tasksOn(d)) {
    for (const s of parseTimes(t.times)) if (s.from && s.to) list.push({ from: s.from, to: s.to, min: s.min, label: t.title, kind: "time", color: colorOf(t) });
    if (run?.taskId === t.id && d === c.today) list.push({ from: store.clockOf(Number(run.start)), to: store.clockNow(), label: t.title, kind: "live", color: colorOf(t) });
  }
  return D.arcs(list);
}

// 这一天的深度分钟：标了 Deep 的任务花掉的时间；正在计时的那个算到现在
function deepMin(c, d) {
  const run = store.timer();
  return store.tasksOn(d).reduce((a, t) => a + (t.deep ? E.spentMin(t) + (run?.taskId === t.id && d === c.today && t.status !== "done" ? Math.floor((Date.now() - Number(run.start)) / 60000) : 0) : 0), 0);
}

function deepText(c, d) {
  const min = deepMin(c, d), goal = lifeOf(c).deepGoal;
  return min > 0 || (goal > 0 && d === c.today) ? "◆ Deep " + fmtHours(min) + (goal > 0 ? " / " + fmtHours(goal) : "") : "";
}

function centerHTML(c, d) {
  const x = pieces[picked];
  if (x) {
    return "<b>" + esc(x.label) + "</b><span class=\"num\">" + esc(x.from) + "–" + esc(x.to) + "</span>" +
      (x.kind === "fixed" ? "<em>" + (x.rest ? "Rest" : "Commute day") + "</em>" : x.kind === "live" ? "<em>Running</em>" : "<em class=\"num\">" + fmtMin(x.min) + "</em>");
  }
  const total = store.tasksOn(d).reduce((a, t) => a + parseTimes(t.times).reduce((s, x) => s + x.min, 0), 0);
  const deep = deepText(c, d);
  return "<b>" + esc(fmtDay(d)) + "</b><span class=\"num\">" + (total ? fmtHours(total) + " timed" : "Nothing timed yet") + "</span>" +
    (deep ? "<span class=\"num\">" + esc(deep) + "</span>" : "") + (store.isCommuteDay(d) ? "<em>Commute day</em>" : "");
}

function sunHTML(c, d) {
  pieces = collect(c, d);
  const labels = [[180, "6", RO + 16], [270, "9", RO + 16], [0, "12", RO + 16], [90, "15", RO + 16], [180, "18", RI - 23], [270, "21", RI - 23], [0, "0", RI - 23], [90, "3", RI - 23]]
    .map(([deg, txt, r]) => { const [x, y] = pt(r, deg); return '<text x="' + f1(x) + '" y="' + f1(y) + '">' + txt + "</text>"; }).join("");
  let now = "";
  if (d === c.today) {
    const m = D.dialMin(store.clockNow()), r = (m < 720 ? RO : RI) + 13;
    const [x2, y2] = pt(r, D.angleOf(m));
    // --cut：升起来以后指针从离圆心 46 的地方起（占全长的百分之几），让开中间的字
    now = '<line class="now" pathLength="100" style="--cut:' + f1((46 / r) * 100) + '" x1="0" y1="0" x2="' + f1(x2) + '" y2="' + f1(y2) + '"/><circle class="now-dot" r="3.6"/>';
  }
  // 镜面铬：一条斜着的明暗渐变，七个颜色在 css 里按主题和哪一圈给（--m1 … --m7）
  const chrome = (ring) => '<linearGradient id="sun-g-' + ring + '" class="chrome ' + ring + '" x1="0" y1="0" x2="1" y2="1">' +
    [1, 2, 3, 4, 5, 6, 7].map((n, i) => '<stop offset="' + (i / 6).toFixed(3) + '" style="stop-color:var(--m' + n + ')"/>').join("") + "</linearGradient>";
  const edges = [RO + 9, RO - 9, RI + 9, RI - 9].map((r, i) => '<circle class="trk-e' + (i % 2 ? " in" : "") + '" r="' + r + '"/>').join("");
  const arcs = pieces.map((x, i) =>
    (x.kind === "fixed" ? '<path class="frost ' + x.ring + '" d="' + arcPath(x.ring === "outer" ? RO : RI, x.a, x.b) + '"/>' : "") +
    '<path class="arc ' + x.kind + (i === picked ? " on" : "") + (x.color && !neon(x.color) ? " boost" : "") + '" data-i="' + i + '" data-t="' + x.a + '" d="' + arcPath(x.ring === "outer" ? RO : RI, x.a, x.b) + '"' +
    (x.color ? ' style="--c:' + esc(neon(x.color) || x.color) + '"' : "") + "><title>" + esc(x.label + " · " + x.from + "–" + x.to) + "</title></path>" +
    (x.kind === "fixed" ? "" : print(x, neon(x.color) || x.color || "#B4B4BC", Boolean(x.color) && !neon(x.color)))).join("");
  // 圆盘后面那一大片很虚的彩虹（白天）/ 极光（夜里）：跟着圆盘升起来的程度（--p）浮现，收下去就没了（她 2026-10-17 要的，取代天上随机出现的那两样）
  return '<i class="sun-halo" aria-hidden="true"></i><div class="sun" role="button" tabindex="0" aria-label="Your day on a clock — drag up or press Enter">' +
    '<svg viewBox="-120 -120 240 240" aria-hidden="true">' +
    "<defs>" + chrome("day") + chrome("night") +
    '<mask id="sun-cut" maskUnits="userSpaceOnUse" x="-120" y="-120" width="240" height="240"><rect x="-120" y="-120" width="240" height="240" fill="#fff"/><rect x="-120" y="-1.7" width="120" height="3.4" fill="#000"/></mask></defs>' +
    // 白天垫在两圈底下、各错开一点的两版（粉往右下、青蓝往左上）；夜里不画
    '<g mask="url(#sun-cut)"><g class="reg">' + [RO, RI].map((r) => '<circle class="p" r="' + r + '" transform="translate(2.6 1.9)"/><circle class="c" r="' + r + '" transform="translate(-2.2 -1.5)"/>').join("") + "</g>" +
    '<circle class="trk day" r="' + RO + '" stroke="url(#sun-g-day)"/><circle class="trk night" r="' + RI + '" stroke="url(#sun-g-night)"/>' + edges +
    '<g class="arcs">' + arcs + "</g></g>" +
    now + '<g class="hours">' + labels + '</g></svg><i class="sun-grain"></i><i class="sun-grain w"></i>' +
    '<div class="sun-c">' + centerHTML(c, d) + "</div></div>" +
    (deepText(c, d) ? '<p class="sun-deep num">' + esc(deepText(c, d)) + "</p>" : "");
}

// 按 p 点亮：从 6 点起，已经「升过」的时间段亮起来
function paint() {
  const el = host?.querySelector(".sun");
  if (!el) return;
  el.style.setProperty("--p", p.toFixed(3));
  host.style.setProperty("--p", p.toFixed(3));   // 小签跟着淡出
  const lit = p * 1440;
  el.querySelectorAll(".arc").forEach((a) => a.classList.toggle("lit", Number(a.dataset.t) < lit || p >= 0.999));
}

function settle(up) {
  risen = up;
  host.classList.toggle("up", up);
  cancelAnimationFrame(anim);
  const from = p, to = up ? 1 : 0;
  if (!up) picked = -1;
  if (reduce.matches || Math.abs(to - from) < 0.01) { p = to; paint(); return; }
  const t0 = performance.now(), ms = 520 * Math.abs(to - from) + 120;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    p = from + (to - from) * e;
    paint();
    if (k < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

// 今天页显示的那一天（d）；别的页传空，圆盘收起来
export function renderSun(c, d) {
  host = host || document.getElementById("sun");
  if (!host) return;
  if (!d) {
    if (host.innerHTML) { host.innerHTML = ""; host.className = ""; risen = false; p = 0; picked = -1; }
    return;
  }
  if (drag) return;   // 正在拖：别换掉
  if (d !== date) { picked = -1; date = d; }
  host.classList.toggle("up", risen);
  host.innerHTML = sunHTML(c, d);
  paint();
}

export function initSun() {
  on(document, "pointerdown", "#sun .sun", (e, el) => {
    if (e.button > 0) return;
    e.preventDefault();
    cancelAnimationFrame(anim);
    drag = { y0: e.clientY, p0: p, moved: false, el, arc: e.target.closest(".arc"), hist: [[e.timeStamp, p]] };
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
    p = Math.max(0, Math.min(1, drag.p0 + dy / L));
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
      if (risen && d.arc) {
        picked = Number(d.arc.dataset.i) === picked ? -1 : Number(d.arc.dataset.i);
        host.querySelectorAll(".arc").forEach((a) => a.classList.toggle("on", Number(a.dataset.i) === picked));
        host.querySelector(".sun-c").innerHTML = centerHTML(store.ctx(), date);
        return;
      }
      settle(!risen);
      return;
    }
    // 松手前 100ms 甩得够快：照方向升起 / 落下；不然看停在哪
    const h = d.hist.filter(([t]) => e.timeStamp - t <= 100), a = h[0], b = h[h.length - 1];
    const v = h.length > 1 && b[0] > a[0] ? ((b[1] - a[1]) / (b[0] - a[0])) * 1000 : 0;
    settle(Math.abs(v) > 1.4 ? v > 0 : d.p0 < 0.5 ? p > 0.33 : p > 0.67);
  };
  addEventListener("pointerup", end);
  addEventListener("pointercancel", end);
  // 升起时点外面（压暗的背景）落回
  on(document, "click", "#sun.up", (e) => { if (e.target.id === "sun") settle(false); });
  on(document, "keydown", "#sun .sun", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); settle(!risen); } });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && risen && !document.querySelector("#modal:not([hidden])")) settle(false); });
}
