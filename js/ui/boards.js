// Mindmap 页（#mindmap，电脑侧栏里 Projects 下面那一项；手机顶上那排小图标里也有）：她在 Obsidian 白板里画的思维导图，导进来随时翻。
// 上面一排是各块白板的名字（点了换，记在这台设备上：local.mmBoard），右边 Import .canvas；下面一大块就是白板：
//   拖着挪，触控板两指滑也是挪；捏合 / ⌘ 或 Ctrl + 滚轮缩放；手机上一指挪、两指捏。右下角 − 适合 +，键盘停在白板上：方向键挪，+ − 缩放，0 放回适合。
//   卡片的样子照 Obsidian：文字卡（Markdown，常用的那几种）、文件卡（只写文件名——库里的文件这里拿不到）、链接卡、分组；线从边的中点出去，带箭头和线上的字。
// 同一个文件再导一次 = 换掉那一块（在 Obsidian 里改了就再导）；Replace 用别的文件换掉当前这块；Rename、Delete（提示条能撤销）。把文件拖到页面上也能导。
// 只读：改要回 Obsidian 改。存的样子见 js/store/boards.js；读文件、画线的计算在 js/canvas.js。

import * as store from "../store.js";
import * as C from "../canvas.js";
import { esc, on, icon } from "../dom.js";
import { toast } from "./common.js";

const views = new Map();   // 各块白板现在看的地方：id → { k, tx, ty }（只在这次打开的页面里记着；换块回来还在原处）
let renaming = "";         // 正在改名的那块
let into = "";             // 点了 Replace：下一个选的文件换掉这一块
const MIN = 0.08, MAX = 3;

const maps = () => store.boards().filter((b) => b.kind === "map");
const current = () => { const list = maps(); return list.find((b) => b.id === store.local().mmBoard) || list[0] || null; };

// ---------- 画一块白板（世界坐标 = 白板自己的坐标减去左上角，四周留 40） ----------

const px = (v) => Math.round(v) + "px";
// 卡片的高度是 Obsidian 里的高度当下限（min-height）：字放不下就撑高，不截掉（她 2026-11-26 说长的字显示不全）；分组照原样
function nodeHTML(n, B) {
  const grp = n.type === "group";
  // style 后面顺手带上 data-n（量高度时按它找回是哪一块，见 measure）
  const box = "left:" + px(n.x - B.x) + ";top:" + px(n.y - B.y) + ";width:" + px(n.width) + ";" + (grp ? "height:" : "min-height:") + px(n.height) + (n.color ? ";--cc:" + C.cssColor(n.color) : "") + '" data-n="' + esc(n.id);
  const cls = "cv-n cv-" + n.type + (n.color ? " tint" : "");
  if (grp) return '<div class="' + cls + '" style="' + box + '">' + (n.label ? '<span class="cv-glabel">' + esc(n.label) + "</span>" : "") + "</div>";
  if (n.type === "file") {
    const parts = String(n.file || "").split("/"), name = parts.pop() || "file", img = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(name);
    return '<div class="' + cls + '" style="' + box + '"><span class="cv-fi" aria-hidden="true">' + (img ? "🖼" : "📄") + "</span><span>" + esc(name.replace(/\.md$/i, "") + (n.subpath || "")) + "</span>" + (parts.length ? "<small>" + esc(parts.join("/")) + "</small>" : "") + "</div>";
  }
  if (n.type === "link") {
    const url = /^https?:\/\//i.test(n.url || "") ? n.url : "";
    return '<div class="' + cls + '" style="' + box + '">' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url.replace(/^https?:\/\/(www\.)?/i, "")) + "</a>" : esc(n.url || "")) + "</div>";
  }
  return '<div class="' + cls + '" style="' + box + '"><div class="cv-md">' + C.md(n.text) + "</div></div>";
}

// 量过的卡片高度：白板（同一次导入是同一个对象）→ { 卡片 id: 高 }。量一次就记住，之后重画直接按撑高的画，不会先画错再跳
const grownBy = new WeakMap();

export function worldHTML(raw) {
  const canvas = C.withHeights(raw, grownBy.get(raw)), B = C.bounds(canvas, 40), at = new Map(canvas.nodes.map((n) => [n.id, n]));
  let lines = "", labels = "";
  for (const e of canvas.edges) {
    const a = at.get(e.fromNode), b = at.get(e.toNode);
    if (!a || !b) continue;
    const g = C.edgeGeo(a, b, e), st = e.color ? ' style="--cc:' + C.cssColor(e.color) + '"' : "";
    lines += '<g class="cv-e' + (e.color ? " tint" : "") + '"' + st + '><path d="' + g.d + '"/>' +
      (e.toEnd !== "none" ? '<path class="cv-ah" d="' + C.arrowPath(g.p3, g.a3) + '"/>' : "") + (e.fromEnd === "arrow" ? '<path class="cv-ah" d="' + C.arrowPath(g.p0, g.a0) + '"/>' : "") + "</g>";
    if (e.label) labels += '<span class="cv-lbl' + (e.color ? " tint" : "") + '" title="' + esc(e.label) + '" style="left:' + px(g.mid.x - B.x) + ";top:" + px(g.mid.y - B.y) + (e.color ? ";--cc:" + C.cssColor(e.color) : "") + '">' + esc(e.label) + "</span>";
  }
  return '<div class="mm-world" style="width:' + px(B.w) + ";height:" + px(B.h) + '" data-w="' + Math.round(B.w) + '" data-h="' + Math.round(B.h) + '">' +
    '<svg class="cv-lines" width="' + Math.round(B.w) + '" height="' + Math.round(B.h) + '" viewBox="' + Math.round(B.x) + " " + Math.round(B.y) + " " + Math.round(B.w) + " " + Math.round(B.h) + '" aria-hidden="true">' + lines + "</svg>" +
    canvas.nodes.map((n) => nodeHTML(n, B)).join("") + labels + "</div>";
}

// ---------- 页面 ----------

const fileInput = '<input type="file" class="mm-file" accept=".canvas,application/json" multiple hidden>';

export function mindmapHTML(phone) {
  const list = maps(), b = current();
  const tabs = list.map((x) => x.id === renaming
    ? '<input class="mm-ren" data-keep="mm-ren" value="' + esc(x.name) + '" aria-label="Board name">'
    : '<button type="button" role="tab" class="chip mm-tab' + (x === b ? " on" : "") + '" aria-selected="' + (x === b) + '" data-act="mm-pick" data-id="' + esc(x.id) + '">' + esc(x.name) + "</button>").join("");
  const head = (phone ? '<header class="phead"><div class="l"><a class="nav" href="#today">‹ Today</a></div></header>' : "") +
    '<header class="page-head"><div><h2>Mindmap</h2></div><div class="tools"><button type="button" class="btn cta" data-act="mm-import">' + icon("plus") + " Import .canvas</button>" + fileInput + "</div></header>";
  if (!b) {
    return '<div class="mindmap none">' + head + '<section class="mm-view mm-empty"><div class="mm-hello"><p><b>No boards yet.</b></p>' +
      "<p>Import a <b>.canvas</b> file from your Obsidian vault — a mind map, a plan, anything drawn on a canvas. Import as many as you like; importing the same file again updates it.</p>" +
      '<p class="hint">' + (phone ? "Pick it from Files → Obsidian → your vault." : "You can also drop .canvas files anywhere on this page.") + "</p>" +
      '<button type="button" class="btn cta" data-act="mm-import">' + icon("plus") + " Import .canvas</button></div></section></div>";
  }
  const when = b.at ? new Date(b.at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  return '<div class="mindmap">' + head +
    '<div class="mm-bar"><nav class="mm-tabs" role="tablist" aria-label="Boards">' + tabs + "</nav>" +
    '<span class="mm-acts"><small class="msub">' + esc((b.file ? C.nameOf(b.file) + ".canvas" : "") + (when ? " · " + when : "")) + "</small>" +
    '<button type="button" class="link" data-act="mm-rename">Rename</button><button type="button" class="link" data-act="mm-replace">Replace</button><button type="button" class="link" data-act="mm-del">Delete</button></span></div>' +
    '<section class="mm-view" data-board="' + esc(b.id) + '" tabindex="0" aria-roledescription="canvas" aria-label="' + esc(b.name) + '. Drag to move, pinch or ⌘ scroll to zoom, 0 to fit.">' +
    (b.canvas ? worldHTML(b.canvas) : '<div class="mm-hello"><p>This board is still syncing.</p></div>') +
    '<div class="mm-ctl"><button type="button" class="icon-btn" data-act="mm-zoom" data-z="-1" aria-label="Zoom out">−</button>' +
    '<button type="button" class="mm-pct num" data-act="mm-fit" title="Fit (0)">100%</button>' +
    '<button type="button" class="icon-btn" data-act="mm-zoom" data-z="1" aria-label="Zoom in">+</button></div></section></div>';
}

// ---------- 挪、缩放 ----------

const viewEl = () => document.querySelector(".mindmap .mm-view[data-board]");
function apply(view, v) {
  const w = view.querySelector(".mm-world");
  if (!w) return;
  w.style.transform = "translate(" + v.tx.toFixed(1) + "px," + v.ty.toFixed(1) + "px) scale(" + v.k.toFixed(4) + ")";
  const pct = view.querySelector(".mm-pct");
  if (pct) pct.textContent = Math.round(v.k * 100) + "%";
}
// 整块放得下（右下角百分比、键盘 0）；open = 第一次打开时看哪里（要缩小才放得下就按 100%、对准中间，见 js/canvas.js 的 openView）
function fitOf(view, open = false) {
  const w = view.querySelector(".mm-world"), r = view.getBoundingClientRect();
  if (!w || !r.width) return { k: 1, tx: 0, ty: 0 };
  const W = Number(w.dataset.w) || 1, H = Number(w.dataset.h) || 1;
  return open ? C.openView(W, H, r.width, r.height) : C.fitView(W, H, r.width, r.height, MIN);
}
const state = (view) => views.get(view.dataset.board) || fitOf(view, true);
function set(view, v) { views.set(view.dataset.board, v); apply(view, v); }
// 以 (cx, cy)（相对白板框）为中心缩放到 k
function zoomAt(view, k, cx, cy) {
  const v = state(view), nk = Math.max(MIN, Math.min(MAX, k));
  set(view, { k: nk, tx: cx - (cx - v.tx) * nk / v.k, ty: cy - (cy - v.ty) * nk / v.k });
}

// 整页重画完：放回这块原来看的地方（没看过就适合大小）
export function boardsAfterRender() {
  const view = viewEl();
  if (!view) return;
  apply(view, state(view));
  const b = current();
  if (b?.canvas && !grownBy.has(b.canvas)) document.fonts.ready.then(() => measure(view, b));
}

// 量卡片实际多高（字体到了以后）：比 Obsidian 里高的记下来，按撑高的重画这一块（线、线上的字、整块多大跟着变）
function measure(view, b) {
  if (!view.isConnected || grownBy.has(b.canvas)) return;
  const grown = {};
  for (const el of view.querySelectorAll(".mm-world > .cv-n[data-n]")) {
    const n = b.canvas.nodes.find((x) => x.id === el.dataset.n);
    if (n && n.type !== "group" && el.offsetHeight > n.height + 1) grown[n.id] = el.offsetHeight;
  }
  grownBy.set(b.canvas, grown);
  if (!Object.keys(grown).length) return;
  const w = view.querySelector(".mm-world");
  if (w) w.outerHTML = worldHTML(b.canvas);
  apply(view, state(view));
}

// ---------- 导入 ----------

async function importFiles(files, id = "") {
  let last = null;
  for (const f of [...files]) {
    if (!/\.canvas$/i.test(f.name) && f.type !== "application/json") { toast(f.name + " isn't a .canvas file"); continue; }
    try {
      const canvas = C.parseCanvas(await f.text());
      if (!canvas.nodes.length) { toast(f.name + " is empty"); continue; }
      last = store.importBoard({ id, file: f.name, canvas, kind: "map" });
      views.delete(last.id);   // 换了内容：重新适合大小
      id = "";   // Replace 只换第一个
    } catch (err) { toast(err.message || "Couldn't read " + f.name); }
  }
  if (last) store.setLocal({ mmBoard: last.id });
}

export function initBoards(rerender) {
  on(document, "click", ".mindmap [data-act]", (e, el) => {
    const act = el.dataset.act, b = current();
    if (act === "mm-import" || act === "mm-replace") {
      into = act === "mm-replace" && b ? b.id : "";
      document.querySelector(".mindmap .mm-file")?.click();
    } else if (act === "mm-pick") { renaming = ""; store.setLocal({ mmBoard: el.dataset.id }); }
    else if (act === "mm-rename" && b) {
      renaming = b.id;
      rerender();
      requestAnimationFrame(() => { const i = document.querySelector(".mindmap .mm-ren"); i?.focus(); i?.select(); });
    } else if (act === "mm-del" && b) { views.delete(b.id); store.deleteBoard(b.id); }
    else if (act === "mm-fit") { const view = viewEl(); if (view) set(view, fitOf(view)); }
    else if (act === "mm-zoom") { const view = viewEl(); if (view) { const r = view.getBoundingClientRect(); zoomAt(view, state(view).k * (el.dataset.z === "1" ? 1.25 : 0.8), r.width / 2, r.height / 2); } }
  });
  on(document, "change", ".mindmap .mm-file", (e, input) => {
    const files = [...input.files], id = into;
    into = "";
    input.value = "";
    if (files.length) importFiles(files, id);
  });
  // 改名：回车 / 点到别处存，Esc 不改
  const saveName = (input) => { if (!renaming) return; const id = renaming; renaming = ""; if (input.value.trim()) store.renameBoard(id, input.value); rerender(); };
  on(document, "keydown", ".mindmap .mm-ren", (e, input) => {
    if (e.key === "Enter") { e.preventDefault(); saveName(input); }
    else if (e.key === "Escape") { e.stopPropagation(); renaming = ""; rerender(); }
  });
  on(document, "focusout", ".mindmap .mm-ren", (e, input) => saveName(input));

  // 文件拖到页面上
  const files = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  on(document, "dragover", ".mindmap", (e, page) => { if (!files(e)) return; e.preventDefault(); page.classList.add("drop-on"); });
  on(document, "dragleave", ".mindmap", (e, page) => { if (!page.contains(e.relatedTarget)) page.classList.remove("drop-on"); });
  on(document, "drop", ".mindmap", (e, page) => { if (!files(e)) return; e.preventDefault(); page.classList.remove("drop-on"); importFiles(e.dataTransfer.files); });

  // 挪：按住拖（一指 / 鼠标）；两指捏 = 缩放（中点跟着手指走）
  const pts = new Map();
  let gesture = null;
  on(document, "pointerdown", ".mindmap .mm-view[data-board]", (e, view) => {
    if (e.button !== 0 || e.target.closest("a, button, input")) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    view.setPointerCapture?.(e.pointerId);
    view.classList.add("grab");
    gesture = { view, start: state(view), pts: new Map([...pts].map(([k, p]) => [k, { ...p }])) };
  });
  on(document, "pointermove", ".mindmap .mm-view[data-board]", (e, view) => {
    if (!gesture || gesture.view !== view || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = view.getBoundingClientRect(), s = gesture.start, a = [...gesture.pts.values()], b = [...pts.values()];
    if (b.length === 1 || a.length === 1) {
      const p0 = a[0], p1 = pts.get([...gesture.pts.keys()][0]) || b[0];
      set(view, { k: s.k, tx: s.tx + p1.x - p0.x, ty: s.ty + p1.y - p0.y });
    } else {
      const mid = (p, q) => ({ x: (p.x + q.x) / 2 - r.left, y: (p.y + q.y) / 2 - r.top }), dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) || 1;
      const m0 = mid(a[0], a[1]), m1 = mid(b[0], b[1]), k = Math.max(MIN, Math.min(MAX, s.k * dist(b[0], b[1]) / dist(a[0], a[1])));
      // 捏的那一点在世界里的位置不动，再跟着两指的中点平移
      set(view, { k, tx: m1.x - (m0.x - s.tx) * k / s.k, ty: m1.y - (m0.y - s.ty) * k / s.k });
    }
  });
  const end = (e) => {
    if (!pts.delete(e.pointerId)) return;
    const view = gesture?.view;
    if (!pts.size) { view?.classList.remove("grab"); gesture = null; }
    else if (view) gesture = { view, start: state(view), pts: new Map([...pts].map(([k, p]) => [k, { ...p }])) };   // 两指松开一指：剩下那指接着挪
  };
  addEventListener("pointerup", end);
  addEventListener("pointercancel", end);

  // 滚轮 / 触控板：两指滑 = 挪，捏合（浏览器给的是带 Ctrl 的滚轮）或按着 ⌘ / Ctrl = 缩放。要拦住页面自己的滚动，只能不是 passive
  document.addEventListener("wheel", (e) => {
    const view = e.target.closest?.(".mindmap .mm-view[data-board]");
    if (!view) return;
    e.preventDefault();
    const v = state(view), r = view.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(view, v.k * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025)), e.clientX - r.left, e.clientY - r.top);
    else { const m = e.deltaMode === 1 ? 16 : 1; set(view, { k: v.k, tx: v.tx - e.deltaX * m, ty: v.ty - e.deltaY * m }); }
  }, { passive: false });

  // 键盘：方向键挪，+ − 缩放，0 适合
  on(document, "keydown", ".mindmap .mm-view[data-board]", (e, view) => {
    if (e.target !== view || e.metaKey || e.ctrlKey || e.altKey) return;
    const v = state(view), r = view.getBoundingClientRect(), step = e.shiftKey ? 240 : 60;
    const move = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (move) set(view, { k: v.k, tx: v.tx + move[0], ty: v.ty + move[1] });
    else if (e.key === "+" || e.key === "=") zoomAt(view, v.k * 1.25, r.width / 2, r.height / 2);
    else if (e.key === "-" || e.key === "_") zoomAt(view, v.k * 0.8, r.width / 2, r.height / 2);
    else if (e.key === "0") set(view, fitOf(view));
    else return;
    e.preventDefault();
  });
}
