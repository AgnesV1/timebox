// 拖放：日历里的任务、任务池里的条目。
// 可拖的元素带 data-drag="task:<id>"、"item:<id>"（Pool 里的一项）、"plan:<计划 id>"（Pool 里的计划自己 = 那天空的一行）、
// "blk:<计划 id>|<日期>"（日历里一个计划那天的那一张）或 "ghost:<rt id>"（以后某天的预览）；
// 能放的地方带 data-drop="day:<日期>" 或 "pool"。
// 备餐页：data-drag="box:<Box id>" 或 "mcopy:<日期>"（复制那天），放到 "mday:<日期>"；Box 也能放到之后某周 "mweek:<周一>"（粗排 +1）。
// Boxes 页：data-drag="ing:<食材 id>" 或 "any:<类别>"（随便哪种），放到 "mbox:<Box id>"（"mbox:new" = 新开一个 Box）。
// Projects 右栏：目标那一行左边的小把手 data-drag="goal:<id>"，放到另一段 "gcol:<段>" = 改成那一段的默认期限。
// 把手只是一小块：拖起来的影子画它外面带 data-drag-show 的那一整行。
// 鼠标按下移动 5px 才算开始拖，所以单击还是单击。拖到窗口上下边缘会自动滚动。
// 不用拖的做法（WCAG 2.2 的 2.5.7）：能拖、点了本来没别的事的（任务池的条目、规律计划、Box、食材）是按钮，点一下或者 Tab 过来按回车，
//   出一个小菜单（和下拉框一个样子，js/ui/select.js 的 openMenu），列出这一页上现在能放的地方，挑一个和拖过去一样。
//   点了有别的事的（日历里的任务、以后的预览、备餐的某一天）走自己的编辑框：日期、Back to the pool、Copy from 都在那里。

import { openMenu } from "./select.js";
import { fmtDay, fmtShort } from "../dates.js";

let drag = null;
let onDropFn = () => {};

function zoneAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el?.closest("[data-drop]") || null;
}

function begin(e) {
  const src = drag.src.closest("[data-drag-show]") || drag.src;
  drag.shown = src;
  const r = src.getBoundingClientRect();
  const ghost = src.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.style.width = r.width + "px";
  document.body.appendChild(ghost);
  drag.ghost = ghost;
  drag.dx = e.clientX - r.left;
  drag.dy = e.clientY - r.top;
  src.classList.add("drag-src");
  document.body.classList.add("dragging");
  drag.started = true;
  tick();
}

function move(e) {
  if (!drag) return;
  drag.x = e.clientX; drag.y = e.clientY;
  if (!drag.started) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
    begin(e);
  }
  drag.ghost.style.transform = "translate(" + (e.clientX - drag.dx) + "px," + (e.clientY - drag.dy) + "px) rotate(-2deg)";
  const z = zoneAt(e.clientX, e.clientY);
  if (z !== drag.zone) {
    drag.zone?.classList.remove("drop-on");
    drag.zone = z && accepts(drag.payload, z.dataset.drop) ? z : null;
    drag.zone?.classList.add("drop-on");
  }
}

function accepts(payload, target) {
  if (payload.startsWith("goal:") || target.startsWith("gcol:")) return payload.startsWith("goal:") && target.startsWith("gcol:");
  if (target === "pool") return payload.startsWith("task:") || payload.startsWith("blk:");
  const part = payload.startsWith("ing:") || payload.startsWith("any:");
  const meal = part || payload.startsWith("box:") || payload.startsWith("mcopy:");
  if (target.startsWith("mbox:")) return part;
  if (target.startsWith("mday:")) return meal && !part;
  if (target.startsWith("mweek:")) return payload.startsWith("box:");
  return !meal && target.startsWith("day:");
}

function tick() {
  if (!drag?.started) return;
  const v = drag.y < 70 ? -12 : drag.y > innerHeight - 70 ? 12 : 0;
  if (v) scrollBy(0, v);
  drag.raf = requestAnimationFrame(tick);
}

function end() {
  if (!drag) return;
  const d = drag;
  drag = null;
  removeEventListener("pointermove", move);
  removeEventListener("pointerup", end);
  removeEventListener("pointercancel", cancel);
  if (!d.started) return;
  cancelAnimationFrame(d.raf);
  d.ghost.remove();
  (d.shown || d.src).classList.remove("drag-src");
  d.zone?.classList.remove("drop-on");
  document.body.classList.remove("dragging");
  // 拖完松手会触发一次 click，吞掉，免得打开编辑框
  const block = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
  addEventListener("click", block, true);
  setTimeout(() => removeEventListener("click", block, true), 0);
  if (d.zone) onDropFn(d.payload, d.zone.dataset.drop);
}

function cancel() {
  if (drag?.started) { drag.zone = null; }
  end();
}

// 能放的地方叫什么：日子 / 那一周 / Box 的名字 / 任务池
function labelOf(target, zone) {
  const [k, v] = [target.slice(0, target.indexOf(":")), target.slice(target.indexOf(":") + 1)];
  if (target === "pool") return { label: "Back to the pool" };
  if (k === "day" || k === "mday") return { label: fmtDay(v) };
  if (k === "mweek") return { label: "Week of " + fmtShort(v), group: "Rough plan" };
  if (target === "mbox:new") return { label: "A new box" };
  if (k === "mbox") return { label: zone.querySelector("header b, b")?.textContent.trim() || "Box", group: "Boxes" };
  if (k === "gcol") return { label: zone.dataset.name || v };
  return { label: v };
}
// 菜单里的那几项：页面上能接住它的地方（同一处只列一次；它现在就在的那一格不列）
export function targetsFor(payload, zones, here = "") {
  const seen = new Set(), out = [];
  for (const z of zones) {
    const t = z.dataset.drop;
    if (seen.has(t) || t === here || !accepts(payload, t)) continue;
    seen.add(t);
    out.push({ value: t, ...labelOf(t, z) });
  }
  return out;
}
const TITLE = { item: "Put on…", plan: "Put on…", regular: "Put on…", box: "Put on…", ing: "Add to…", any: "Add to…", goal: "Move to…" };
function moveMenu(src) {
  const payload = src.dataset.drag, kind = payload.slice(0, payload.indexOf(":"));
  const here = src.closest("[data-drop]")?.dataset.drop || "";
  openMenu(src, targetsFor(payload, document.querySelectorAll("[data-drop]"), here), (t) => onDropFn(payload, t), { title: TITLE[kind] || "Move to…" });
}
// 点了本来没别的事做的那几种才出菜单
const menuable = (el) => el && !el.dataset.act && !el.closest("[data-act]");

export function initDnd(onDrop) {
  onDropFn = onDrop;
  document.addEventListener("click", (e) => {
    const src = e.target.closest?.("[data-drag]");
    if (!menuable(src) || e.target.closest("button,input,textarea,select,a")) return;
    moveMenu(src);
  });
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || (e.key !== "Enter" && e.key !== " ")) return;
    const src = e.target.closest?.("[data-drag]");
    if (e.target !== src || !menuable(src)) return;
    e.preventDefault();
    moveMenu(src);
  });
  document.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || e.pointerType === "touch") return;
    const src = e.target.closest("[data-drag]");
    if (!src || e.target.closest("button,input,textarea,select,a")) return;
    e.preventDefault();   // 别拖出一片选中的文字
    drag = { src, payload: src.dataset.drag, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, started: false, zone: null };
    addEventListener("pointermove", move);
    addEventListener("pointerup", end);
    addEventListener("pointercancel", cancel);
  });
}
