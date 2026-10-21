// 今天页的四象限便签（电脑；画在左边任务卡片下面，只在看今天的时候；内容一直留着、过了一天也不变，见 js/ui/today.js）：
// 紧急 / 不紧急 × 重要 / 不重要，四格里贴几张便签，拖来拖去。样子和日历的便签一样（纸、顶上一道胶条），只用一种纸色；
// 字跟着格子变（css 里按 data-q）：左上粗体、右上正常、左下细体、右下斜体。数据只存在这台电脑上（js/store/quads.js）。
// 拖、写、打勾、删：这里先把页面挪好再存（存的时候不整页重画），动画才接得上——
//   拿起：原位留一个虚线空位，纸浮起来跟着鼠标，有一点弹簧的滞后，往哪边甩就往哪边歪；
//   经过的那一格亮起来，空位挪到要落的地方，别的纸让开；松手：纸飞进空位、摆正，胶条按一下；拖到窗外松手 = 飞回原处。
// 点一下便签 = 改字（回车存、Esc 不改），右边出现 ✓、挪到别的格（不用拖的做法：挑四格里的另一格）和删除；每格底下的 + 新写一张，回车接着写下一张，Esc 收起。
// 整页重画的时候（同步拉下来之类）照这里记着的画回来：开着的「新写」框、正在改的那张、正拖着 / 正落下的那张（画成空位）。

import * as store from "../store.js";
import * as Q from "../quads.js";
import { esc, on, icon } from "../dom.js";
import { toast } from "./common.js";
import { openMenu } from "./select.js";

const SPRING = "linear(0, .035, .121, .233, .354, .473, .582, .679, .761, .829, .883, .924, .956, .979, .994, 1.005, 1.011, 1.014, 1.015, 1.015, 1.014, 1.012, 1.01, 1.008, 1.007, 1.005, 1.004, 1.003, 1)";   // 同 css 的 --spring
const POP = "linear(0, .053, .183, .351, .527, .693, .833, .944, 1.024, 1.074, 1.101, 1.108, 1.103, 1.089, 1.071, 1.051, 1.033, 1.018, 1.006, .998, .992, .989, .988, .989, .99, .992, .994, .996, 1)";   // 同 css 的 --spring-pop
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const calm = () => reduce.matches || document.documentElement.classList.contains("fx-off");   // 歪一下、压一下这些装饰也不放
const NAMES = { do: "Urgent and important", plan: "Important, not urgent", quick: "Urgent, not important", drop: "Neither urgent nor important" };

let adding = "";    // 哪一格开着「新写一张」
let editing = "";   // 正在改字的那一张
let hold = null;    // 正拖着 / 正落下的那张 { id, h }：重画时画成一样高的空位
let drag = null;
let rerender = () => {};

const root = () => document.querySelector("#main .qd");
const cellOf = (q) => root()?.querySelector('.qd-q[data-q="' + q + '"]') || null;
const noteOf = (id) => (id ? root()?.querySelector('.qd-note[data-id="' + CSS.escape(id) + '"]') || null : null);
const isNote = (el) => el?.classList.contains("qd-note");
const endOf = (cell) => [...cell.children].find((el) => !isNote(el) && !el.classList.contains("qd-ph")) || null;   // 新写框 / + 按钮
const after = (el) => (isNote(el.nextElementSibling) ? el.nextElementSibling.dataset.id : "");   // 排在它后面的那张

// ---------- 画 ----------

function noteHTML(n, q) {
  const attrs = ' data-id="' + esc(n.id) + '" data-q="' + q + '"';
  if (editing === n.id) {
    const tick = n.done ? "Not done" : "Done";
    return '<div class="qd-note open' + (n.done ? " done" : "") + '"' + attrs + ">" +
      '<textarea class="qd-edit" data-keep="qd-edit-' + esc(n.id) + '" rows="1" maxlength="' + Q.MAX + '" spellcheck="false" aria-label="Note">' + esc(n.text) + "</textarea>" +
      '<span class="qd-acts"><button type="button" data-qd="done" aria-pressed="' + Boolean(n.done) + '" title="' + tick + '" aria-label="' + tick + '">' + icon("check") + "</button>" +
      '<button type="button" data-qd="move" title="Move to another box" aria-label="Move to another box" aria-haspopup="listbox">' + icon("arrow") + "</button>" +
      '<button type="button" data-qd="del" title="Remove" aria-label="Remove">' + icon("trash") + "</button></span></div>";
  }
  return '<div class="qd-note' + (n.done ? " done" : "") + '"' + attrs + ' tabindex="0" role="button"><span class="qd-t"><span class="qd-tx">' + esc(n.text) + "</span></span></div>";
}

function cellHTML(q, list) {
  return '<div class="qd-q' + (adding === q ? " adding" : "") + '" data-q="' + q + '" role="group" aria-label="' + NAMES[q] + '">' +
    list.map((n) => (hold?.id === n.id ? '<div class="qd-ph" style="height:' + hold.h + 'px"></div>' : noteHTML(n, q))).join("") +
    (adding === q ? addHTML(q) : "") +
    '<button type="button" class="qd-plus" data-qd="add" aria-label="Add a note">' + icon("plus") + "</button></div>";
}

const addHTML = (q) => '<form class="qd-addf" data-q="' + q + '" autocomplete="off"><input name="text" data-keep="qd-add-' + q + '" maxlength="' + Q.MAX + '" placeholder="New note" aria-label="New note"></form>';

export function quadHTML() {
  const b = store.quadBoard();
  return '<section class="qd" aria-label="Urgent and important">' +
    '<span></span><span class="qd-ax">Urgent</span><span class="qd-ax">Not urgent</span>' +
    '<span class="qd-ax qd-v">Important</span>' + cellHTML("do", b.do) + cellHTML("plan", b.plan) +
    '<span class="qd-ax qd-v">Not important</span>' + cellHTML("quick", b.quick) + cellHTML("drop", b.drop) + "</section>";
}

// ---------- 让开：页面改之前量一次、改完量一次，从旧的位置弹到新的（FLIP） ----------

function rects() {
  const m = new Map();
  root()?.querySelectorAll(".qd-q > *").forEach((el) => m.set(el, el.getBoundingClientRect()));
  return m;
}

function flip(snap) {
  if (reduce.matches) return;
  snap.forEach((a, el) => {
    if (!el.isConnected || (!a.width && !a.height)) return;
    el.getAnimations().forEach((x) => { if (x.id === "qd-flip") x.cancel(); });
    const b = el.getBoundingClientRect();
    if (!b.width && !b.height) return;
    const dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
    el.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }], { duration: 440, easing: SPRING, id: "qd-flip" });
  });
}

// ---------- 拖 ----------

// 鼠标在哪一格：窗口外面 30px 以内都算（落在格子之间的缝里就找最近的那格）；再远就是「拖出去了」
function cellAt(x, y) {
  const box = root();
  if (!box) return null;
  const r = box.getBoundingClientRect(), pad = 30;
  if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) return null;
  let best = null, bd = Infinity;
  box.querySelectorAll(".qd-q").forEach((c) => {
    const b = c.getBoundingClientRect();
    const dx = Math.max(b.left - x, 0, x - b.right), dy = Math.max(b.top - y, 0, y - b.bottom), d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = c; }
  });
  return best;
}

function setOn(cell) {
  root()?.querySelectorAll(".qd-q.on").forEach((c) => { if (c !== cell) c.classList.remove("on"); });
  cell?.classList.add("on");
}

function putPh(d, cell, ref) {
  if (d.ph.parentNode === cell && d.ph.nextElementSibling === ref) return;
  const snap = rects();
  cell.insertBefore(d.ph, ref);
  flip(snap);
}

// 空位放在哪：按阅读顺序，鼠标前面的第一张便签之前（一格里一行能放两三张）
function slot(d, cell) {
  const r = cell.getBoundingClientRect(), x = d.mx - r.left, y = d.my - r.top;
  let ref = null;
  for (const el of cell.children) {
    if (el === d.ph) continue;
    if (!isNote(el) || y < el.offsetTop || (y < el.offsetTop + el.offsetHeight && x < el.offsetLeft + el.offsetWidth / 2)) { ref = el; break; }
  }
  putPh(d, cell, ref);
}

function goHome(d) {
  const cell = cellOf(d.home.q);
  if (!cell) return;
  const next = noteOf(d.home.before);
  putPh(d, cell, next?.parentNode === cell ? next : endOf(cell));
}

function track(d) {
  if (!d.ph.isConnected) d.ph = root()?.querySelector(".qd-ph") || d.ph;   // 中途整页重画过：空位是新画的那个
  if (!d.ph.isConnected) return;
  const cell = cellAt(d.mx, d.my);
  setOn(cell);
  if (cell) slot(d, cell); else goHome(d);
  d.over = cell?.dataset.q || "";
  const q = d.over || d.home.q;
  if (d.el.dataset.q !== q) d.el.dataset.q = q;   // 字跟着要落的那一格变
}

function begin(d) {
  const el = d.el, r = el.getBoundingClientRect();
  d.home = { q: el.closest(".qd-q").dataset.q, before: after(el) };
  d.ph = document.createElement("div");
  d.ph.className = "qd-ph";
  d.ph.style.height = r.height + "px";
  el.before(d.ph);
  hold = { id: d.id, h: r.height };
  document.body.appendChild(el);   // 浮在整页上面，整页重画也不会把它画没
  el.classList.add("qd-fly");
  el.style.width = r.width + "px";
  Object.assign(d, { px: r.left, py: r.top, vx: 0, vy: 0, rot: 0, dx: d.x0 - r.left, dy: d.y0 - r.top, started: true });
  el.style.translate = d.px + "px " + d.py + "px";
  requestAnimationFrame(() => el.classList.add("lift"));
  document.body.classList.add("dragging");
  d.raf = requestAnimationFrame(() => loop(d));
}

// 每一帧：纸追着鼠标（弹簧：有一点滞后、停下时晃一下就稳），横着甩得越快歪得越多；窗口伸出屏幕外时，拖到边上会滚
function loop(d) {
  if (drag !== d) return;
  const box = root()?.getBoundingClientRect();
  const v = !box ? 0 : d.my > innerHeight - 60 && box.bottom > innerHeight ? 10 : d.my < 60 && box.top < 0 ? -10 : 0;
  if (v) scrollBy(0, v);
  const tx = d.mx - d.dx, ty = d.my - d.dy;
  if (reduce.matches) { d.px = tx; d.py = ty; }
  else { d.vx = d.vx * .6 + (tx - d.px) * .32; d.vy = d.vy * .6 + (ty - d.py) * .32; d.px += d.vx; d.py += d.vy; }
  const want = calm() ? 0 : Math.max(-9, Math.min(9, d.vx * .7)) - 1.5;
  d.rot += (want - d.rot) * .2;
  d.el.style.translate = d.px.toFixed(1) + "px " + d.py.toFixed(1) + "px";
  d.el.style.rotate = d.rot.toFixed(2) + "deg";
  track(d);
  d.raf = requestAnimationFrame(() => loop(d));
}

function move(e) {
  const d = drag;
  if (!d) return;
  d.mx = e.clientX; d.my = e.clientY;
  if (!d.started && Math.hypot(d.mx - d.x0, d.my - d.y0) >= 5) begin(d);
}

function up(e) {
  removeEventListener("pointermove", move);
  removeEventListener("pointerup", up);
  removeEventListener("pointercancel", up);
  const d = drag;
  drag = null;
  if (!d?.started) return;   // 没拖动：是一次单击，交给 click
  cancelAnimationFrame(d.raf);
  document.body.classList.remove("dragging");
  // 松手后跟着来的那一下 click 吞掉，免得点开底下的东西
  const block = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
  addEventListener("click", block, true);
  setTimeout(() => removeEventListener("click", block, true), 0);
  setOn(null);
  if (!d.ph.isConnected) d.ph = root()?.querySelector(".qd-ph") || d.ph;
  if (d.ph.isConnected && (!d.over || e.type === "pointercancel")) goHome(d);
  land(d);
}

// 松手：先存（页面已经是这个样子了），纸再飞进空位、摆正、胶条按一下
function land(d) {
  const el = d.el;
  if (!d.ph.isConnected) { finish(d); return; }
  const q = d.ph.parentNode.dataset.q, before = after(d.ph);
  if (q !== d.home.q || before !== d.home.before) store.moveQuad(d.id, q, before);
  el.dataset.q = q;
  d.ph.getAnimations().forEach((a) => a.cancel());
  const r = d.ph.getBoundingClientRect();
  const fly = el.animate([{ translate: d.px + "px " + d.py + "px", rotate: d.rot + "deg" }, { translate: r.left + "px " + r.top + "px", rotate: "0deg" }],
    { duration: reduce.matches ? 1 : 480, easing: POP });
  el.style.translate = r.left + "px " + r.top + "px";
  el.style.rotate = "0deg";
  setTimeout(() => el.classList.remove("lift"), reduce.matches ? 0 : 300);
  fly.onfinish = () => finish(d);
}

function finish(d) {
  const el = d.el, ph = root()?.querySelector(".qd-ph");
  hold = null;
  el.classList.remove("qd-fly", "lift");
  ["translate", "rotate", "width"].forEach((p) => el.style.removeProperty(p));
  if (!ph) { el.remove(); return; }   // 这一页已经不在了
  ph.replaceWith(el);
  stick(el);
}

function stick(el) {
  if (calm()) return;
  el.animate([{ scale: "1.03 .9" }, { scale: ".99 1.03", offset: .55 }, { scale: "1 1" }], { duration: 320, easing: "ease-out" });
  el.classList.add("press");
  setTimeout(() => el.classList.remove("press"), 240);
}

// ---------- 改字、打勾、删、新写 ----------

// 照存着的样子重画这一张（开着 / 收起），不动整页
function swap(id) {
  const el = noteOf(id), n = store.quadOf(id);
  if (!el || !n) return null;
  el.outerHTML = noteHTML(n, el.closest(".qd-q").dataset.q);
  return noteOf(id);
}

const fit = (ta) => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };

function openEdit(id) {
  if (editing === id) return;
  closeEdit(true);
  editing = id;
  const ta = swap(id)?.querySelector(".qd-edit");
  if (!ta) { editing = ""; return; }
  fit(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

function closeEdit(save) {
  const id = editing;
  if (!id) return;
  const ta = noteOf(id)?.querySelector(".qd-edit");
  editing = "";
  if (save && ta) store.editQuad(id, ta.value);
  return swap(id);
}

// 打勾：先画成收起、还没划线的样子，下一帧再划——横线从左往右划过去，纸淡下去
function toggleDone(id) {
  const n = store.quadOf(id), el = noteOf(id);
  if (!n || !el) return;
  editing = "";
  store.doneQuad(id, !n.done);
  el.outerHTML = noteHTML(n, el.closest(".qd-q").dataset.q);
  const fresh = noteOf(id);
  fresh?.focus({ preventScroll: true });
  requestAnimationFrame(() => fresh?.classList.toggle("done", !n.done));
}

// 挪到别的格（拖的替代）：挑一格，存好字、放到那一格最后，整页画一遍，焦点跟着那张纸
function moveMenu(btn, id) {
  const here = btn.closest(".qd-q")?.dataset.q;
  const list = Object.keys(NAMES).filter((q) => q !== here).map((q) => ({ value: q, label: NAMES[q] }));
  openMenu(btn, list, (q) => {
    const ta = noteOf(id)?.querySelector(".qd-edit");
    editing = "";
    if (ta) store.editQuad(id, ta.value);
    store.moveQuad(id, q);
    rerender();
    setTimeout(() => noteOf(id)?.focus({ preventScroll: true }), 80);
  }, { title: "Move to" });
}

// 删：纸往下掉、转一下淡掉，别的纸补上来；底下弹「撤销」
function remove(id) {
  editing = "";
  const el = swap(id);
  if (!el) return;
  const r = el.getBoundingClientRect(), snap = rects();
  snap.delete(el);
  document.body.appendChild(el);
  el.classList.add("qd-fly");
  el.style.width = r.width + "px";
  el.style.translate = r.left + "px " + r.top + "px";
  flip(snap);
  const gone = store.deleteQuad(id);
  toast("Note removed", () => { store.restoreQuad(gone); rerender(); });
  const fall = el.animate([{ opacity: 1, rotate: "0deg", translate: r.left + "px " + r.top + "px" }, { opacity: 0, rotate: "9deg", translate: r.left + 10 + "px " + (r.top + 28) + "px" }],
    { duration: reduce.matches ? 1 : 340, easing: "cubic-bezier(.5, 0, .8, .3)" });
  fall.onfinish = () => el.remove();
}

function openAdd(q) {
  closeEdit(true);
  if (adding !== q) {
    closeAdd();
    const cell = cellOf(q);
    if (!cell) return;
    adding = q;
    const snap = rects();
    cell.querySelector(".qd-plus").insertAdjacentHTML("beforebegin", addHTML(q));
    cell.classList.add("adding");
    flip(snap);
  }
  cellOf(q)?.querySelector(".qd-addf input")?.focus();
}

function closeAdd() {
  if (!adding) return;
  const cell = cellOf(adding), f = cell?.querySelector(".qd-addf");
  adding = "";
  if (!f) return;
  const snap = rects();
  snap.delete(f);
  f.remove();
  cell.classList.remove("adding");
  flip(snap);
}

// ---------- 接上 ----------

export function initQuads(render) {
  rerender = render;
  document.addEventListener("pointerdown", (e) => {
    const el = e.target.closest?.(".qd .qd-note");
    if (!el || e.button > 0 || e.pointerType === "touch" || drag || hold || el.classList.contains("open") || e.target.closest("button, textarea, input")) return;
    e.preventDefault();   // 别拖出一片选中的文字
    drag = { id: el.dataset.id, el, x0: e.clientX, y0: e.clientY, mx: e.clientX, my: e.clientY, started: false, over: "" };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  });
  addEventListener("blur", () => { if (drag?.started) up({ type: "pointercancel" }); });

  // 点到正在改的那张外面 = 存好收起
  document.addEventListener("pointerdown", (e) => {
    const el = noteOf(editing);
    if (el && !el.contains(e.target) && !e.target.closest?.(".menu")) closeEdit(true);
  }, true);

  on(document, "click", ".qd .qd-note:not(.open)", (e, el) => openEdit(el.dataset.id));
  on(document, "keydown", ".qd .qd-note:not(.open)", (e, el) => {
    if (e.target === el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openEdit(el.dataset.id); }
  });
  on(document, "click", ".qd [data-qd]", (e, b) => {
    const id = b.closest(".qd-note")?.dataset.id, k = b.dataset.qd;
    if (k === "add") openAdd(b.closest(".qd-q").dataset.q);
    else if (k === "done") toggleDone(id);
    else if (k === "move") moveMenu(b, id);
    else if (k === "del") remove(id);
  });
  on(document, "dblclick", ".qd .qd-q", (e, cell) => { if (!e.target.closest(".qd-note, .qd-addf, button")) openAdd(cell.dataset.q); });

  on(document, "input", ".qd-edit", (e, ta) => fit(ta));
  on(document, "keydown", ".qd-edit", (e) => {
    if (e.isComposing) return;   // 中文输入法选字时的回车不算
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); closeEdit(true)?.focus({ preventScroll: true }); }
    else if (e.key === "Escape") closeEdit(false)?.focus({ preventScroll: true });
  });
  // 用 Tab 离开正在改的那张：也存好收起
  on(document, "focusout", ".qd-note.open", (e, el) => {
    if (!el.isConnected || el.contains(e.relatedTarget)) return;
    setTimeout(() => { if (editing === el.dataset.id && !noteOf(editing)?.contains(document.activeElement) && !document.activeElement?.closest?.(".menu")) closeEdit(true); }, 0);
  });

  // 新写：回车加一张、框留着接着写；Esc 或者空着离开 = 收起
  on(document, "submit", ".qd-addf", (e, f) => {
    e.preventDefault();
    const input = f.querySelector("input"), q = f.dataset.q;
    const id = store.addQuad(q, input.value);
    if (!id) return;
    const snap = rects();
    f.insertAdjacentHTML("beforebegin", noteHTML(store.quadOf(id), q));
    input.value = "";
    flip(snap);
    if (!reduce.matches) noteOf(id)?.animate([{ opacity: 0, scale: ".6", rotate: "-7deg", translate: "0 6px" }, { opacity: 1, scale: "1", rotate: "0deg", translate: "0 0" }], { duration: 520, easing: POP });
  });
  on(document, "keydown", ".qd-addf input", (e) => { if (e.key === "Escape") closeAdd(); });
  on(document, "focusout", ".qd-addf input", (e, input) => {
    setTimeout(() => { if (input.isConnected && adding && !input.value.trim() && document.activeElement !== input) closeAdd(); }, 150);
  });

  addEventListener("hashchange", () => { adding = ""; editing = ""; });
}
