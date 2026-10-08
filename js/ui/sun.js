// 今天页的「日出」圆盘（手机和电脑都有）：这一天计过时的每一段画在 24 小时的圆盘上——
// 外圈 6→18（白天，底色暖）、内圈 18→6（夜里，底色冷），6 点在左边、顺时针（几何在 js/day.js）。
// 通勤日的固定时段画灰，正在计时的那段画到现在；「现在」是横在当前那圈上的一道短线。
// 平时它是屏幕下方一个半透明的半圆（在计时浮条上面）；往上拖，它跟着手指升起、变大，时间段从 6 点起一段段亮起；
// 松手过了三分之一就升到屏幕中间，不然落回去；甩一下也行（看松手前的速度）。点一下也能升起 / 落下；升起时点外面、往下拖、按 Esc 落回。

import * as store from "../store.js";
import * as D from "../day.js";
import { parseTimes } from "../times.js";
import { esc, on } from "../dom.js";
import { fmtDay, fmtMin } from "../dates.js";
import { colorOf } from "./common.js";

const RO = 98, RI = 72;   // 外圈、内圈的半径（viewBox ±120，圈宽 18）；两圈之间的缝里画「日出」那道光
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

// 这一天要画的：通勤固定时段（灰）、计过时的段（计划颜色）、正在跑的那段（到现在）
function collect(c, d) {
  const list = [];
  if (store.isCommuteDay(d)) D.COMMUTE_BLOCKS.forEach((b) => list.push({ ...b, kind: "fixed", color: "" }));
  const run = store.timer();
  for (const t of store.tasksOn(d)) {
    for (const s of parseTimes(t.times)) if (s.from && s.to) list.push({ from: s.from, to: s.to, min: s.min, label: t.title, kind: "time", color: colorOf(t) });
    if (run?.taskId === t.id && d === c.today) list.push({ from: store.clockOf(Number(run.start)), to: store.clockNow(), label: t.title, kind: "live", color: colorOf(t) });
  }
  return D.arcs(list);
}

function centerHTML(c, d) {
  const x = pieces[picked];
  if (x) {
    return "<b>" + esc(x.label) + "</b><span class=\"num\">" + esc(x.from) + "–" + esc(x.to) + "</span>" +
      (x.kind === "fixed" ? "<em>Commute day</em>" : x.kind === "live" ? "<em>Running</em>" : "<em class=\"num\">" + fmtMin(x.min) + "</em>");
  }
  const total = store.tasksOn(d).reduce((a, t) => a + parseTimes(t.times).reduce((s, x) => s + x.min, 0), 0);
  return "<b>" + esc(fmtDay(d)) + "</b><span class=\"num\">" + (total ? fmtMin(total) + " timed" : "Nothing timed yet") + "</span>" +
    (store.isCommuteDay(d) ? "<em>Commute day</em>" : "");
}

function sunHTML(c, d) {
  pieces = collect(c, d);
  const labels = [[180, "6", RO + 16], [270, "9", RO + 16], [0, "12", RO + 16], [90, "15", RO + 16], [180, "18", RI - 23], [270, "21", RI - 23], [0, "0", RI - 23], [90, "3", RI - 23]]
    .map(([deg, txt, r]) => { const [x, y] = pt(r, deg); return '<text x="' + f1(x) + '" y="' + f1(y) + '">' + txt + "</text>"; }).join("");
  let now = "";
  if (d === c.today) {
    const m = D.dialMin(store.clockNow()), r = m < 720 ? RO : RI;
    const [x1, y1] = pt(r - 13, D.angleOf(m)), [x2, y2] = pt(r + 13, D.angleOf(m));
    now = '<line class="now" x1="' + f1(x1) + '" y1="' + f1(y1) + '" x2="' + f1(x2) + '" y2="' + f1(y2) + '"/>';
  }
  const arcs = pieces.map((x, i) =>
    '<path class="arc ' + x.kind + (i === picked ? " on" : "") + '" data-i="' + i + '" data-t="' + x.a + '" d="' + arcPath(x.ring === "outer" ? RO : RI, x.a, x.b) + '"' +
    (x.color ? ' style="--c:' + esc(x.color) + '"' : "") + "><title>" + esc(x.label + " · " + x.from + "–" + x.to) + "</title></path>").join("");
  return '<div class="sun" role="button" tabindex="0" aria-label="Your day on a clock — drag up or press Enter">' +
    '<svg viewBox="-120 -120 240 240" aria-hidden="true">' +
    '<circle class="trk day" r="' + RO + '"/><circle class="trk night" r="' + RI + '"/>' +
    '<path class="sweep" data-ring="outer" d=""/><path class="sweep" data-ring="inner" d=""/>' +
    '<g class="arcs">' + arcs + "</g>" + now + '<g class="hours">' + labels + "</g></svg>" +
    '<div class="sun-c">' + centerHTML(c, d) + "</div></div>";
}

// 按 p 点亮：从 6 点起，已经「升过」的时间段亮起来；扫过的那一截画一道光
function paint() {
  const el = host?.querySelector(".sun");
  if (!el) return;
  el.style.setProperty("--p", p.toFixed(3));
  const lit = p * 1440;
  el.querySelectorAll(".arc").forEach((a) => a.classList.toggle("lit", Number(a.dataset.t) < lit || p >= 0.999));
  const outer = Math.min(lit, 720), inner = Math.max(lit, 720);
  el.querySelector('.sweep[data-ring="outer"]').setAttribute("d", outer > 1 ? arcPath(RO - 13, 0, outer) : "");
  el.querySelector('.sweep[data-ring="inner"]').setAttribute("d", inner > 721 ? arcPath(RI - 13, 720, inner) : "");
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
