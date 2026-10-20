// 页面小工具

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// 事件委托：on(root, "click", "[data-act]", (e, target) => …)
export function on(root, type, sel, fn, opts) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest?.(sel);
    if (t && root.contains(t)) fn(e, t);
  }, opts);
}

// 横着划一下：手指（触屏、笔）按下到松开横着走了 50px 以上，或者触控板两指横着划（wheel 的 deltaX 攒够 80）。fn("left" | "right") = 往哪边划；
// 一次划只算一下。ignore = 从这些元素上开始的不算（它们自己会横着滚：时间轴、一排小方块）
export function onSwipe(root, sel, fn, ignore = "") {
  let swipe = null, wheel = 0, wheelAt = 0;
  const skip = (e) => ignore && e.target.closest?.(ignore);
  on(root, "pointerdown", sel, (e) => { swipe = e.pointerType !== "mouse" && !skip(e) ? { x: e.clientX, y: e.clientY } : null; });
  on(root, "pointerup", sel, (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 2 * Math.abs(dy)) fn(dx > 0 ? "right" : "left");
  });
  on(root, "wheel", sel, (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || skip(e)) return;
    if (e.timeStamp - wheelAt > 300) wheel = 0;
    wheelAt = e.timeStamp;
    wheel += e.deltaX;
    if (Math.abs(wheel) > 80) { fn(wheel < 0 ? "right" : "left"); wheel = 0; wheelAt = e.timeStamp + 600; }
  }, { passive: true });
}

// 日期框用键盘填的时候，每填完一段（月 / 日 / 年）跳到下一段，浏览器就发一次 change；各处收到就存、就重画，
// 正在填的那格被换掉，焦点跳回第一段，后面的数字就填错了地方。所以这一格只要动过键盘，它的 change 就先扣下，
// 等填完了（离开这格 / 回车 / Esc）再补发一次；没碰键盘、从弹出的日历里点的照常马上发。
export function initDateTyping() {
  let typed = null, held = null;   // typed：这次聚焦以来用键盘动过的那格；held：扣着一次 change 还没发的那格
  const isDate = (el) => el?.tagName === "INPUT" && el.type === "date";
  const flush = () => {
    const el = held;
    held = typed = null;
    if (el?.isConnected) el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  addEventListener("keydown", (e) => {
    if (!isDate(e.target)) return;
    if (e.key !== "Enter" && e.key !== "Escape") typed = e.target;
    else if (held === e.target) flush();
  }, true);
  addEventListener("change", (e) => {
    if (!isDate(e.target) || !e.isTrusted || e.target !== typed) return;
    e.stopImmediatePropagation();
    held = e.target;
  }, true);
  addEventListener("focusout", (e) => {
    if (held === e.target) flush();
    else if (typed === e.target) typed = null;
  }, true);
}

export function icon(name) {
  const p = ICONS[name] || "";
  return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + p + "</svg>";
}

const ICONS = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  projects: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  stats: '<path d="M4 20h16M7 17v-6M12 17V6M17 17v-9"/>',
  routines: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7M20 4v4.7h-4.7M20 12a8 8 0 0 1-13.7 5.6L4 15.3M4 20v-4.7h4.7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  pool: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M14.5 4.5v15"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  commute: '<rect x="5" y="3.5" width="14" height="13" rx="3"/><path d="M5 10h14M8.5 13.5h.01M15.5 13.5h.01M8 16.5 6.5 20M16 16.5l1.5 3.5"/>',
  reading: '<path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h12.5v15H7a2.5 2.5 0 0 0-2.5 2.5v-15Z"/><path d="M4.5 20.5A2.5 2.5 0 0 1 7 18h12.5v3H7"/>',
  meals: '<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M12 5.5v13M3.5 12h8.5"/>',
  friends: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.6c2 .6 3.2 2.3 3.6 4.9"/>',
  cart: '<circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/><path d="M3 4.5h2.4l2.1 10.5h10.7l1.9-7.5H6.4"/>',
  idea: '<path d="M9 17.5h6M10 20.5h4M8.6 14.5a6 6 0 1 1 6.8 0c-.6.5-.9 1.2-.9 2v1h-5v-1c0-.8-.3-1.5-.9-2Z"/>',
  // 记账用的几个（Lucide 的画法，和上面这套同一种线条）
  spending: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16c.5-2 1.5-7 4-7 2 0 2 3 4 3 2.5 0 4.5-5 5-7"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  down: '<path d="m6 9 6 6 6-6"/>'
};

// 只在后台跑一次的小定时器
export function debounce(fn, ms) {
  let t = 0;
  const run = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  run.cancel = () => clearTimeout(t);
  return run;
}

export function readLocal(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

export function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
