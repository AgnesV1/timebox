// 手机：在今天页顶上往下拉，记账面板像一滴水从灵动岛那里落下来（面板里面是 money.js 的手机版）。
// 拉：手指落在屏幕上面 40% 里、页面滚在最顶上才算。岛下面长出一颗黑色玻璃水滴（带一点高光），越拉越长，和岛之间连着一截细颈
//   （SVG 模糊再收边，几块黑融在一起）；拉约 90px 过线：细颈断开、「+」变蓝 = 松手就开；拉着往回推，细颈又连上，松手就缩回去。往下快速一甩也开。
// 开：水滴往下落，面板跟在它后面像水一样从顶上流下来，底边是一道软的水面弧线（不是圆角卡片），停在屏幕约 88% 高——
//   水滴正好落在水面停下的地方，被水面收进去。底下露出一条压暗的今天页，点它就收。里面的东西从上往下淡入，每块隔 20ms，不用模糊。
// 收：点底下那条，或把底边的小横条往上推 → 水面退回岛里；这次记过 / 改过的话，岛上停一下「今天花了多少 ✓」，宽度跟着字。
// 面板整块只动位置和透明度。灵动岛那一条本身归 iPhone（往下拉会开通知中心），网页收不到——所以要从页面顶上那一块开始拉。

import * as store from "../store.js";
import * as M from "../money.js";
import * as SP from "../spend.js";
import { createView } from "./money.js";

// 和 money.js 同一套：进场快出来慢慢停稳（不冲过头），出场干脆、越走越快；小东西用只冲过头一点点的弹簧
const ENTER = "cubic-bezier(.16, 1, .3, 1)", EXIT = "cubic-bezier(.4, 0, 1, 1)", FALL = "cubic-bezier(.45, 0, .85, .55)";
const SPR = "linear(0, .029, .099, .192, .296, .399, .498, .588, .668, .737, .795, .844, .883, .915, .939, .959, .973, .984, .992, .997, 1.001, 1.003, 1.004, 1.005, 1.005, 1.005, 1.004, 1.004, 1)";
const quiet = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ARM = 80;        // 拉过这么多就算要开（加上开始的 10px，手指大约走 90px）
const LEVEL = 0.88;    // 水面停在屏幕多高
const OPEN_MS = 480, CLOSE_MS = 300;

let view = null, panel = null, inner = null, veil = null, goo = null, top = null, neck = null, blob = null, drop = null, plus = null, live = null;
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
const box = (el, l, t, w, h, r) => Object.assign(el.style, { left: l + "px", top: t + "px", width: w + "px", height: h + "px", borderRadius: r });

// 顶上那一条的颜色：拉的时候先换成纯黑，和水滴、面板接上；收起再换回去
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
  inner = panel.querySelector(".mn-inner");
  veil = panel.querySelector(".mn-veil");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.innerHTML = '<defs><filter id="mn-goo-f"><feGaussianBlur in="SourceGraphic" stdDeviation="6"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"/></filter></defs>';
  document.body.appendChild(svg);
  // 拉的时候：岛、细颈、水滴三块黑在一层里融在一起
  goo = document.createElement("div");
  goo.id = "mn-goo";
  goo.innerHTML = "<i></i><i></i><i></i>";
  [top, neck, blob] = goo.children;
  goo.hidden = true;
  document.body.appendChild(goo);
  // 水滴上的高光、中间的「+」（不能放在上面那层里，模糊会把它们糊成灰）；松手以后往下落的也是它（落的时候不用再融）
  drop = document.createElement("div");
  drop.id = "mn-drop";
  drop.innerHTML = "<b></b><i>+</i>";
  plus = drop.querySelector("i");
  document.body.appendChild(drop);
  live = document.createElement("div");
  live.id = "mn-live";
  live.innerHTML = '<span class="t"></span><svg viewBox="0 0 18 18" aria-hidden="true"><circle class="ring" cx="9" cy="9" r="6.5"/><path class="ok" d="M5.6 9.2l2.2 2.2 4.4-4.6"/></svg>';
  document.body.appendChild(live);
  veil.addEventListener("click", () => close());
  // 收起：底边的小横条，点一下 / 往上推
  const grab = panel.querySelector("[data-grab]");
  let g = null;
  grab.addEventListener("pointerdown", (e) => { if (state !== "open") return; g = { y: e.clientY, d: 0, t: [[e.clientY, performance.now()]] }; grab.setPointerCapture(e.pointerId); inner.style.transition = "none"; });
  grab.addEventListener("pointermove", (e) => {
    if (!g) return;
    g.t.push([e.clientY, performance.now()]); if (g.t.length > 4) g.t.shift();
    const dy = e.clientY - g.y;
    g.d = dy < 0 ? dy : 8 * Math.log(1 + dy / 8);   // 往下拉有阻力
    inner.style.transform = "translateY(" + g.d + "px)";
    veil.style.opacity = String(Math.max(0, Math.min(1, 1 + g.d / (innerHeight * LEVEL))));
  });
  const up = () => {
    if (!g) return;
    const d = g.d, a = g.t[0], b = g.t[g.t.length - 1], v = (b[0] - a[0]) / Math.max(8, b[1] - a[1]);
    g = null;
    if (Math.abs(d) < 6 || d < -70 || v < -0.45) close();
    else { inner.style.transition = "transform .28s " + SPR; inner.style.transform = "none"; veil.style.transition = "opacity .28s"; veil.style.opacity = "1"; }
  };
  grab.addEventListener("pointerup", up);
  grab.addEventListener("pointercancel", up);
}

// ---------- 拉 ----------
let pull = null;
function begin() {
  build();
  ST = safeTop();
  state = "pulling";
  statusBar(true);
  goo.hidden = false;
  drop.getAnimations().forEach((a) => a.cancel());
  [top, neck, blob, drop, plus].forEach((x) => { x.style.transition = "none"; });
  plus.classList.remove("armed");
  drop.style.opacity = "0";
  drop.classList.remove("falling");
  drop.classList.add("on");
  box(top, CX() - 60, -20, 120, ST + 26, "18px");
  box(blob, CX() - 9, ST + 2, 18, 18, "50%");
  box(neck, CX() - 6, ST - 4, 12, 0, "6px");
}
// 拉到 dy：水滴越拉越大、越长（上窄下圆）；没过线时和岛之间连着细颈，过线细颈断开
function move(dy) {
  const eff = dy < 140 ? dy : 140 + (dy - 140) * 0.3, p = Math.min(1, eff / ARM);
  const w = 18 + 18 * p, h = 18 + 26 * p + Math.max(0, eff - ARM) * 0.12, y = ST + 6 + eff * 0.5;
  pull.eff = eff;
  pull.at = { x: CX() - w / 2, y, w, h };
  const armed = eff > ARM;
  box(blob, CX() - w / 2, y, w, h, "50% 50% 50% 50% / 58% 58% 42% 42%");
  const nw = 12 - 5 * p;
  if (armed !== pull.armed) {
    pull.armed = armed;
    neck.style.transition = "height .16s " + (armed ? EXIT : ENTER);
    plus.classList.toggle("armed", armed);
    if (armed && !quiet()) blob.animate([{ transform: "scale(1)" }, { transform: "scale(1.05, .96)" }, { transform: "scale(1)" }], { duration: 280, easing: SPR });
    if (armed) navigator.vibrate?.(8);
  }
  box(neck, CX() - nw / 2, ST - 4, nw, armed ? 0 : Math.max(0, y - ST + 12), nw / 2 + "px");
  // 高光、「+」：跟着水滴
  Object.assign(drop.style, { left: pull.at.x + "px", top: y + "px", width: w + "px", height: h + "px", opacity: String(Math.min(1, eff / 30)) });
  plus.style.opacity = String(Math.max(0, Math.min(1, (eff - 30) / 30)));
  const app = document.querySelector(".app");
  if (app) { app.style.transition = "none"; app.style.transform = "translateY(" + eff * 0.1 + "px)"; app.style.opacity = String(1 - p * 0.2); }
}
function settleApp(dur) {
  const app = document.querySelector(".app");
  if (!app) return;
  app.style.transition = "transform " + dur + " " + ENTER + ", opacity " + dur;
  app.style.transform = "";
  app.style.opacity = "";
}
// 没过线松手：水滴缩回岛里
function retract() {
  state = "closed";
  [blob, neck].forEach((x) => { x.style.transition = "all .42s " + ENTER; });
  drop.style.transition = "all .42s " + ENTER;
  box(blob, CX() - 9, ST + 2, 18, 18, "50%");
  box(neck, CX() - 6, ST - 4, 12, 0, "6px");
  Object.assign(drop.style, { left: CX() - 9 + "px", top: ST + 2 + "px", width: "18px", height: "18px", opacity: "0" });
  settleApp(".42s");
  setTimeout(() => { if (state === "closed") { goo.hidden = true; drop.classList.remove("on"); statusBar(false); } }, 460);
}

// ---------- 开 ----------
function open() {
  state = "opening";
  panel.classList.add("on");
  view.reset();
  view.show();
  const H = innerHeight, at = pull?.at || { x: CX() - 18, y: ST + 40, w: 36, h: 44 };
  // 水滴脱开（融的那层收掉），往下落到水面停下的地方；面板跟在后面流下来，同一条曲线，最后正好接上
  goo.hidden = true;
  const fall = H * LEVEL - (at.y + at.h);
  if (quiet()) { drop.classList.remove("on"); inner.style.transition = "none"; inner.style.transform = "none"; veil.style.transition = "none"; veil.style.opacity = "1"; }
  else {
    drop.style.transition = "none";
    drop.classList.add("falling");
    drop.animate([{ transform: "none", opacity: 1 }, { transform: "translateY(" + fall * 0.6 + "px) scale(.92, 1.12)", opacity: 1, offset: 0.55 }, { transform: "translateY(" + fall + "px) scale(1.25, .55)", opacity: 0 }], { duration: OPEN_MS, easing: FALL, fill: "forwards" });
    inner.style.transition = "none";
    inner.style.transform = "translateY(-101%)";
    void inner.offsetWidth;
    inner.style.transition = "transform " + OPEN_MS + "ms " + ENTER;
    inner.style.transform = "none";
    veil.style.transition = "opacity " + OPEN_MS + "ms";
    veil.style.opacity = "1";
    [...inner.querySelectorAll(".mn-home > *")].forEach((el, i) => el.animate([{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], { duration: 360, delay: 140 + i * 20, easing: ENTER, fill: "backwards" }));
  }
  settleApp(".42s");
  setTimeout(() => {
    if (state !== "opening") return;
    state = "open";
    drop.classList.remove("on", "falling");
    drop.getAnimations().forEach((a) => a.cancel());
  }, quiet() ? 20 : OPEN_MS + 20);
  if (store.setting("spend")?.url && SP.wantFull()) import("../sync.js").then((s) => s.queue());
}

// ---------- 收 ----------
function close() {
  if (state !== "open" && state !== "opening") return;
  state = "closing";
  const dur = quiet() ? 10 : CLOSE_MS;
  if (!quiet()) inner.querySelectorAll(".mn-home > *").forEach((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" }));
  inner.style.transition = "transform " + dur + "ms " + EXIT;
  inner.style.transform = "translateY(-101%)";
  veil.style.transition = "opacity " + dur + "ms";
  veil.style.opacity = "0";
  setTimeout(() => {
    panel.classList.remove("on");
    inner.querySelectorAll(".mn-home > *").forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    view.hide();
    state = "closed";
    if (view.tookChange()) showLive(); else statusBar(false);
  }, dur + 20);
}

// 收起以后在岛上停一下：今天的总数 + 转圈变勾。宽度先量字再长到那么宽
function showLive() {
  const g = M.sumOf(M.index(SP.entries(), SP.cats()), M.parts(store.today()), "day");
  live.querySelector(".t").innerHTML = "−" + M.money(g.out) + "<small>today</small>";
  const ring = live.querySelector(".ring"), ok = live.querySelector(".ok");
  ring.style.strokeDasharray = "12 29"; ring.classList.add("spin"); ok.style.strokeDashoffset = "10";
  live.style.top = Math.max(8, ST - 34) + "px";
  live.style.setProperty("--w", Math.ceil(live.querySelector(".t").scrollWidth + 18 + 14 + 8 + 10) + "px");
  live.classList.add("on");
  setTimeout(() => { ring.classList.remove("spin"); ring.style.strokeDasharray = "41 0"; ok.style.strokeDashoffset = "0"; }, 1000);
  setTimeout(() => { live.classList.remove("on"); setTimeout(() => statusBar(false), 400); }, 2700);
}

// ---------- 手势 ----------
// 只在手机的今天页、页面滚在最顶上、手指落在屏幕上面 40% 里时；从输入框、计时浮条、弹层上开始的不算
const SKIP = "input, textarea, select, [contenteditable], #dock, #modal, #toast, .mn, [draggable=true]";
function onStart(x, y, target) {
  if (state !== "closed" || !phoneOK() || !pageTop() || scrollY > 0 || y > innerHeight * 0.4 || target.closest?.(SKIP)) return false;
  pull = { x, y, active: false, armed: false, eff: 0, at: null, t: [[y, performance.now()]] };
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
  if (!p.active) { pull = null; return; }
  const a = p.t[0], b = p.t[p.t.length - 1], v = (b[0] - a[0]) / Math.max(8, b[1] - a[1]);
  if (p.armed || (v > 0.45 && p.eff > 30)) open(); else retract();
  pull = null;
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
