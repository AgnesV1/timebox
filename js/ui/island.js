// 手机：在今天页最顶上往下拉，记账面板从灵动岛那里长出来（面板里面是 money.js 的手机版）。
// 拉的时候：顶上中间滴出一滴墨，和顶上那一截连着（SVG 模糊再收边，两块黑融在一起），越拉越大；拉过线「+」转一下变蓝 = 松手就开。
// 没过线松手：墨滴缩回去。过线松手 / 往下一甩：墨滴长成整屏（横着带一点弹、竖着不冲过头），里面的东西一块块浮出来。
// 收起：拖底下那条小横条往上、或点一下它 → 面板缩回顶上中间那一小块；这次记过 / 改过的话，那一小块往两边伸开，
// 左边今天花了多少、右边转一圈打个勾，两秒多以后收回去。
// 灵动岛那一条本身归 iPhone（往下拉会开通知中心），网页收不到——所以要从页面最顶上那一行开始拉。

import * as store from "../store.js";
import * as M from "../money.js";
import * as SP from "../spend.js";
import { createView } from "./money.js";

// 和 money.js 同一套：慢一点、只冲过头一点点
const POP = "linear(0, .03, .106, .208, .322, .438, .548, .649, .737, .812, .873, .922, .959, .987, 1.007, 1.02, 1.027, 1.031, 1.032, 1.03, 1.028, 1.024, 1.021, 1.017, 1.014, 1.01, 1.008, 1.006, 1.004, 1.002, 1.001, 1, 1)";
const SPR = "linear(0, .029, .099, .192, .296, .399, .498, .588, .668, .737, .795, .844, .883, .915, .939, .959, .973, .984, .992, .997, 1.001, 1.003, 1.004, 1.005, 1.005, 1.005, 1.004, 1.004, 1)";
const quiet = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ARM = 110;   // 拉过这么多（已经算上阻力）就算要开

let view = null, panel = null, goo = null, top = null, neck = null, blob = null, plus = null, live = null;
let state = "closed", phoneOK = () => false, pageTop = () => true;

function safeTop() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden";
  document.body.appendChild(probe);
  const h = probe.offsetHeight;
  probe.remove();
  return h;
}
let ST = 0;
const CX = () => innerWidth / 2;
const box = (el, l, t, w, h, r) => Object.assign(el.style, { left: l + "px", top: t + "px", width: w + "px", height: h + "px", borderRadius: r + "px" });

// 顶上那一条的颜色：拉的时候先换成纯黑，和墨滴、面板接上；收起再换回去
function statusBar(black) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  if (black) { if (!meta.dataset.was) meta.dataset.was = meta.getAttribute("content"); meta.setAttribute("content", "#000000"); }
  else if (meta.dataset.was) { meta.setAttribute("content", document.documentElement.dataset.theme === "dark" ? "#0C0C13" : "#FFFFFF"); delete meta.dataset.was; }
}

function build() {
  if (panel) return;
  view = createView("phone");
  panel = view.el;
  document.body.appendChild(panel);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.innerHTML = '<defs><filter id="mn-goo-f"><feGaussianBlur in="SourceGraphic" stdDeviation="7"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"/></filter></defs>';
  document.body.appendChild(svg);
  goo = document.createElement("div");
  goo.id = "mn-goo";
  goo.innerHTML = "<i></i><i></i><i></i>";
  [top, neck, blob] = goo.children;
  goo.hidden = true;
  document.body.appendChild(goo);
  plus = document.createElement("div");
  plus.id = "mn-plus";
  plus.textContent = "+";
  document.body.appendChild(plus);
  live = document.createElement("div");
  live.id = "mn-live";
  live.innerHTML = '<span class="t"></span><svg viewBox="0 0 18 18" aria-hidden="true"><circle class="ring" cx="9" cy="9" r="6.5"/><path class="ok" d="M5.6 9.2l2.2 2.2 4.4-4.6"/></svg>';
  document.body.appendChild(live);
  // 收起：底下那条小横条（点一下 / 往上拖）
  const grab = panel.querySelector("[data-grab]");
  let g = null;
  grab.addEventListener("pointerdown", (e) => { if (state !== "open") return; g = { y: e.clientY, d: 0, t: [[e.clientY, performance.now()]] }; grab.setPointerCapture(e.pointerId); panel.style.transition = "none"; });
  grab.addEventListener("pointermove", (e) => {
    if (!g) return;
    g.t.push([e.clientY, performance.now()]); if (g.t.length > 4) g.t.shift();
    g.d = Math.min(0, e.clientY - g.y);
    clip(0, 0, Math.max(30, innerHeight + g.d * 1.15), 0, Math.min(34, -g.d / 8));
    view.el.querySelector(".mn-inner").style.opacity = String(Math.max(0, 1 + g.d / 260));
  });
  const up = () => {
    if (!g) return;
    const d = g.d, a = g.t[0], b = g.t[g.t.length - 1], v = (b[0] - a[0]) / Math.max(8, b[1] - a[1]);
    g = null;
    if (d > -6 || d < -120 || v < -0.45) close();
    else { panel.style.transition = "clip-path .6s " + SPR; clip(0, 0, innerHeight, 0, 0); view.el.querySelector(".mn-inner").style.opacity = ""; }
  };
  grab.addEventListener("pointerup", up);
  grab.addEventListener("pointercancel", up);
}

// 面板露出来的那一块：clip-path 一个圆角矩形（上、左、宽、高都是屏幕坐标）
function clip(t, l, h, r0, rad, w = innerWidth) {
  const right = innerWidth - l - w, bottom = innerHeight - t - h;
  panel.style.clipPath = "inset(" + t + "px " + right + "px " + bottom + "px " + l + "px round " + rad + "px)";
}

// ---------- 拉 ----------
let pull = null;
function begin() {
  build();
  ST = safeTop();
  state = "pulling";
  statusBar(true);
  goo.hidden = false;
  [top, neck, blob, plus].forEach((x) => { x.style.transition = "none"; });
  plus.classList.remove("armed");
  plus.style.opacity = "0";
  box(top, CX() - 60, -20, 120, ST + 26, 18);
  box(blob, CX() - 9, ST + 2, 18, 18, 9);
  box(neck, CX() - 7, ST, 14, 0, 7);
}
function move(dy) {
  const eff = dy < 150 ? dy : 150 + (dy - 150) * 0.35, p = Math.min(1, eff / 150), s = 20 + 44 * p, y = ST + 8 + eff * 0.55, nw = 14 - 4 * p;
  pull.eff = eff;
  box(blob, CX() - s / 2, y, s, s, s / 2);
  box(neck, CX() - nw / 2, ST - 4, nw, Math.max(0, y + s / 2 - ST + 4), nw / 2);
  plus.style.left = CX() + "px";
  plus.style.top = y + s / 2 + "px";
  plus.style.opacity = String(Math.max(0, Math.min(1, (eff - 36) / 40)));
  const armed = eff > ARM;
  if (armed !== pull.armed) {
    pull.armed = armed;
    plus.style.transition = "";
    plus.classList.toggle("armed", armed);
    if (armed && !quiet()) blob.animate([{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 520, easing: POP });
    if (armed) navigator.vibrate?.(8);
  }
  const app = document.querySelector(".app");
  if (app) { app.style.transition = "none"; app.style.transform = "translateY(" + eff * 0.12 + "px)"; app.style.opacity = String(1 - p * 0.25); }
}
function settleApp(dur) {
  const app = document.querySelector(".app");
  if (!app) return;
  app.style.transition = "transform " + dur + " " + SPR + ", opacity " + dur;
  app.style.transform = "";
  app.style.opacity = "";
}
function retract() {
  state = "closed";
  [blob, neck].forEach((x) => { x.style.transition = "all .6s " + POP; });
  plus.style.transition = "opacity .15s";
  plus.style.opacity = "0";
  box(blob, CX() - 9, ST + 2, 18, 18, 9);
  box(neck, CX() - 7, ST, 14, 0, 7);
  settleApp(".55s");
  setTimeout(() => { if (state === "closed") { goo.hidden = true; statusBar(false); } }, 620);
}

// ---------- 开 ----------
function open() {
  state = "opening";
  const r = blob.getBoundingClientRect();
  panel.classList.add("on");
  panel.classList.remove("shown");
  panel.style.transition = "none";
  // 从墨滴（连着顶上那一截）那一块开始长
  clip(0, r.left, r.bottom, 0, r.width / 2, r.width);
  void panel.offsetWidth;
  goo.hidden = true;
  plus.style.opacity = "0";
  const dur = quiet() ? ".01s" : ".95s";
  panel.style.transition = "clip-path " + dur + " " + POP;
  clip(0, 0, innerHeight, 0, 0);
  settleApp(".7s");
  view.reset();
  view.show();
  setTimeout(() => {
    panel.classList.add("shown");
    if (!quiet()) [...panel.querySelectorAll('.mn-home > *')].forEach((el, i) => el.animate([{ opacity: 0, transform: "translateY(-10px) scale(.98)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], { duration: 700, delay: i * 55, easing: "cubic-bezier(.22,.9,.28,1)", fill: "backwards" }));
  }, quiet() ? 0 : 220);
  setTimeout(() => { if (state === "opening") { state = "open"; panel.style.clipPath = "none"; } }, quiet() ? 20 : 1000);
  if (store.setting("spend")?.url && SP.wantFull()) import("../sync.js").then((s) => s.queue());
}

// ---------- 收 ----------
function close() {
  if (state !== "open" && state !== "opening") return;
  state = "closing";
  const inner = panel.querySelector(".mn-inner");
  if (!quiet()) [...panel.querySelectorAll(".mn-home > *")].reverse().forEach((el, i) => el.animate([{ opacity: 1, filter: "blur(0)" }, { opacity: 0, transform: "translateY(-6px) scale(.97)", filter: "blur(4px)" }], { duration: 220, delay: i * 16, fill: "forwards" }));
  const w = 120, h = Math.max(30, ST + 6);
  panel.style.transition = "clip-path " + (quiet() ? ".01s" : ".62s") + " " + SPR;
  if (!panel.style.clipPath || panel.style.clipPath === "none") { clip(0, 0, innerHeight, 0, 0); void panel.offsetWidth; }
  setTimeout(() => clip(0, CX() - w / 2, h, 0, h / 2, w), quiet() ? 0 : 160);
  setTimeout(() => {
    panel.classList.remove("on", "shown");
    panel.querySelectorAll(".mn-home > *").forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    inner.style.opacity = "";
    view.hide();
    state = "closed";
    if (view.tookChange()) showLive(); else statusBar(false);
  }, quiet() ? 30 : 800);
}

// 收起以后在顶上停一下：今天的总数 + 转圈变勾
function showLive() {
  const g = M.sumOf(M.index(SP.entries(), SP.cats()), M.parts(store.today()), "day");
  live.querySelector(".t").innerHTML = "−" + M.money(g.out) + "<small>today</small>";
  const ring = live.querySelector(".ring"), ok = live.querySelector(".ok");
  ring.style.strokeDasharray = "12 29"; ring.classList.add("spin"); ok.style.strokeDashoffset = "10";
  live.style.top = Math.max(8, ST - 34) + "px";
  live.classList.add("on");
  setTimeout(() => { ring.classList.remove("spin"); ring.style.strokeDasharray = "41 0"; ok.style.strokeDashoffset = "0"; }, 1000);
  setTimeout(() => { live.classList.remove("on"); setTimeout(() => statusBar(false), 400); }, 2700);
}

// ---------- 手势 ----------
// 只在手机的今天页、页面滚在最顶上时；从输入框、计时浮条、弹层上开始的不算
const SKIP = "input, textarea, select, [contenteditable], #dock, #modal, #toast, .mn, [draggable=true]";
function onStart(x, y, target) {
  if (state !== "closed" || !phoneOK() || !pageTop() || scrollY > 0 || target.closest?.(SKIP)) return false;
  pull = { x, y, active: false, armed: false, eff: 0, t: [[y, performance.now()]] };
  return true;
}
function onMove(x, y) {
  if (!pull) return false;
  const dx = x - pull.x, dy = y - pull.y;
  if (!pull.active) {
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { pull = null; return false; }
    if (dy < -6) { pull = null; return false; }
    if (dy < 10 || scrollY > 0) return false;
    pull.active = true;
    pull.y += 10;
    begin();
  }
  pull.t.push([y, performance.now()]);
  if (pull.t.length > 4) pull.t.shift();
  move(Math.max(0, y - pull.y));
  return true;
}
function onEnd() {
  if (!pull) return;
  const p = pull;
  pull = null;
  if (!p.active) return;
  const a = p.t[0], b = p.t[p.t.length - 1], v = (b[0] - a[0]) / Math.max(8, b[1] - a[1]);
  if (p.armed || (v > 0.45 && p.eff > 30)) open(); else retract();
}

export function initIsland({ isPhone, onToday }) {
  phoneOK = isPhone;
  pageTop = onToday;
  addEventListener("touchstart", (e) => { if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY, e.target); }, { passive: true });
  addEventListener("touchmove", (e) => { if (pull && onMove(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault(); }, { passive: false });
  addEventListener("touchend", onEnd);
  addEventListener("touchcancel", onEnd);
  // 用鼠标也能拉（电脑上把窗口拉窄了试）
  let mouse = false;
  addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse" && e.button === 0) mouse = onStart(e.clientX, e.clientY, e.target); });
  addEventListener("pointermove", (e) => { if (mouse && e.pointerType === "mouse" && onMove(e.clientX, e.clientY)) e.preventDefault(); });
  addEventListener("pointerup", (e) => { if (mouse && e.pointerType === "mouse") { mouse = false; onEnd(); } });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && state === "open" && !view.sheetOpen()) close(); });
}

export const refreshIsland = () => { if (view && state !== "closed") view.refresh(); };
export const islandOpen = () => state !== "closed";
// 手机变成电脑宽度（转屏、拉窗口）：收起来
export function closeIsland() { if (state === "open") close(); }
