// 拖放：日历里的任务、任务池里的条目。
// 可拖的元素带 data-drag="task:<id>"、"item:<id>"、"regular:<计划 id>"（池里的规律计划）或 "ghost:<rt id>"（以后某天的预览）；
// 能放的地方带 data-drop="day:<日期>" 或 "pool"。
// 鼠标按下移动 5px 才算开始拖，所以单击还是单击。拖到窗口上下边缘会自动滚动。

let drag = null;
let onDropFn = () => {};

function zoneAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el?.closest("[data-drop]") || null;
}

function begin(e) {
  const src = drag.src;
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
  if (target === "pool") return payload.startsWith("task:");
  return target.startsWith("day:");
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
  d.src.classList.remove("drag-src");
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

export function initDnd(onDrop) {
  onDropFn = onDrop;
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
