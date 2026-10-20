// Projects 页（电脑）上「谁为谁服务」的连线。页面上盖一层 SVG，鼠标点得穿；只在悬停、拖的时候画。
// 悬停一条目标 / 一个项目的头 / 一张计划卡（停一下，路过不算）：跟它有关的线一条条从它这儿飞出去（每条隔 40ms），
//   画完以后虚线一直慢慢朝「为了谁」流：计划 / 项目 → 目标 → 上级 → … → North star。没关系的目标、卡片淡下去。
//   目标：往上一路到顶，往下是挂在它下面的（一层层）和为它们服务的项目、计划；
//   计划：它连着的目标（自己没连的，看它所在的项目连着的），再一路往上；项目：它连着的，加上它下面自己连了目标的计划。
// 线像地铁线路图那样走：只走缝——栏和栏之间的空隙、两排之间那条边线、目标板和项目之间的空白、页面左边和两栏之间的空白，
//   拐弯是小圆角，不压着字。几条走同一条缝的错开 3px 并排走。目标从左边（勾的前面）进出；计划卡、项目头从左边出去。
// 白天：墨色虚线，粉、蓝两版错开一点（丝网印套色，和换页的标题一个路子），为谁服务那头一个小圆点；夜里：项目的霓虹色加一圈光。
// 鼠标顺着线走，线一直在；走到线旁边，线的中间出一个「×」，点了就断开（从中间断，两头缩回去）。
// 拖一下建链接：悬停时旁边出一个小圆圈，从它拖出去，一条虚线跟着鼠标飞；能连的地方亮着，经过时吸过去，松手就连上。
//   目标拖到目标 = 设成它的上级（一条只有一个上级，会换掉原来的；会连成环的不亮）；目标 ↔ 计划 / 项目 = 这个计划 / 项目为这条目标服务。
//   不拖也能连：计划编辑框里的 Serves（js/ui/projects.js），改目标文字时的 Part of（js/ui/goals.js）。
// 位置只在悬停、拖、窗口变了、页面重画了的时候量；线用页面坐标，滚动不用重量。只动 stroke-dashoffset 和透明度。

import * as store from "../store.js";
import * as G from "../goals.js";
import * as GR from "../groups.js";
import * as E from "../engine.js";

const NODE = ".goals .gl[data-goal], .pgroup[data-group] > .pg-top:not(.editing), .pcard[data-project], .g-rep[data-project]";
const fine = matchMedia("(hover: hover) and (pointer: fine)");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const NS = "http://www.w3.org/2000/svg";
const DWELL = 110, GRACE = 280, STAGGER = 40, NEAR = 12, ROUND = 6, LANE = 3;

let layer = null, svg = null, handle = null, cutX = null, dragSvg = null;
const edges = new Map();   // 画着的线：id → { e, g, pts, mask, gone, cutting }
let cur = null;            // 悬停中：{ key, el }
let want = "", wantT = 0, closeT = 0, clearT = 0;
let drag = null;           // 拖着建链接：{ from, el, can: Map(元素 → key), target, id }
let landing = null;        // 刚连上、还没换成真线的那条临时的线
let seq = 0;

const page = () => document.querySelector(".projects");
// 在电脑的 Projects 页上、没有弹层盖着
const onPage = () => document.body.dataset.view === "projects" && fine.matches && !document.body.classList.contains("phone") && document.getElementById("modal")?.hidden !== false;

// ---------- 谁和谁连着 ----------

function keyOf(el) {
  if (el.dataset.goal) return "goal:" + el.dataset.goal;
  if (el.classList.contains("pg-top")) { const name = el.closest("[data-group]")?.dataset.group; return name ? G.groupRef(name) : ""; }
  return el.dataset.project ? G.planRef(el.dataset.project) : "";
}

// 页面上代表它的元素。目标折在「+N more」里：用那个按钮代替；整块收起来了、做完的没列出来：用「Goals」标题代替
function elOf(key, cols) {
  const root = page();
  if (!root) return null;
  const q = (sel) => root.querySelector(sel);
  if (key.startsWith("goal:")) {
    const id = key.slice(5);
    return q('.goals .gl[data-goal="' + CSS.escape(id) + '"]') || (cols.has(id) && q('.goals [data-col="' + cols.get(id) + '"] .gmore')) || q(".goals > header h3");
  }
  if (key.startsWith("g:")) return q('.pgroup[data-group="' + CSS.escape(key.slice(2)) + '"] > .pg-top:not(.editing)');
  const id = CSS.escape(key.slice(2));
  return q('.pcard[data-project="' + id + '"]') || q('.g-rep[data-project="' + id + '"]');
}

// 一条线 { id, from, to, at, rev }：from 为 to 服务（虚线往 to 流）；at = 离悬停的那个第几层（飞出去的先后）；rev = 悬停的在 to 那头，从那头开始画
function related(key) {
  const goals = store.goals(), byId = new Map(goals.map((g) => [g.id, g]));
  const out = new Map();
  const add = (from, to, at, rev) => { if (from !== to && !out.has(from + ">" + to)) out.set(from + ">" + to, { id: from + ">" + to, from, to, at, rev }); };
  const up = (id, at) => { const chain = G.chainUp(goals, id); for (let i = 0; i + 1 < chain.length; i++) add("goal:" + chain[i].id, "goal:" + chain[i + 1].id, at + i, false); };
  const refs = (g) => (Array.isArray(g?.by) ? g.by : []);
  if (key.startsWith("goal:")) {
    const id = key.slice(5);
    if (!byId.has(id)) return [];
    up(id, 0);
    const level = new Map([[id, 0]]), queue = [id];
    while (queue.length) {
      const pid = queue.shift(), at = level.get(pid);
      for (const r of refs(byId.get(pid))) add(r, "goal:" + pid, at, true);
      for (const g of goals) if (g.up === pid && !level.has(g.id)) { level.set(g.id, at + 1); add("goal:" + g.id, "goal:" + pid, at, true); queue.push(g.id); }
    }
    return [...out.values()];
  }
  let from = key, list = G.servedBy(goals, key);
  if (!list.length && key.startsWith("p:")) {   // 计划自己没连：看它所在的项目连着的
    const p = store.get("projects", key.slice(2));
    if (p?.group) { from = G.groupRef(p.group); list = G.servedBy(goals, from); }
  }
  for (const g of list) { add(from, "goal:" + g.id, 0, false); up(g.id, 1); }
  if (key.startsWith("g:")) {
    for (const p of store.all("projects")) {
      if ((p.group || "") !== key.slice(2) || !E.isActive(p)) continue;
      for (const g of G.servedBy(goals, G.planRef(p.id))) { add(G.planRef(p.id), "goal:" + g.id, 1, false); up(g.id, 2); }
    }
  }
  return [...out.values()];
}

// 从 a 拖到 b 能不能连：目标 → 目标是设上级（不能成环、已经是它的上级不算）；目标和计划 / 项目之间是服务（已经连着的不算）；计划 / 项目之间不连
function canLink(goals, a, b) {
  const ga = a.startsWith("goal:"), gb = b.startsWith("goal:");
  if (a === b || (!ga && !gb)) return false;
  if (ga && gb) { const g = goals.find((x) => x.id === a.slice(5)); return Boolean(g) && g.up !== b.slice(5) && G.canParent(goals, g.id, b.slice(5)); }
  const goal = goals.find((x) => x.id === (ga ? a : b).slice(5)), ref = ga ? b : a;
  return Boolean(goal) && !(Array.isArray(goal.by) ? goal.by : []).includes(ref);
}

function link(a, b) {
  const ga = a.startsWith("goal:"), gb = b.startsWith("goal:");
  if (ga && gb) store.setParent(a.slice(5), b.slice(5));
  else store.linkGoal((ga ? a : b).slice(5), ga ? b : a, true);
}

function unlink(e) {
  if (e.from.startsWith("goal:")) store.setParent(e.from.slice(5), "");
  else store.linkGoal(e.to.slice(5), e.from, false);
}

// 线的颜色（夜里用）：计划 / 项目自己的颜色，目标用它标签那个项目的；都没有就跟着悬停的那个，再没有是青柠
function colorOf(key) {
  if (key.startsWith("p:")) return store.get("projects", key.slice(2))?.color || "";
  if (key.startsWith("g:")) return store.groupByName(key.slice(2))?.color || "";
  const g = store.goals().find((x) => x.id === key.slice(5));
  return (g?.tag && store.groupByName(g.tag)?.color) || "";
}
const glow = (c) => (c ? GR.neon(c) || c : "");

// ---------- 折线：一串点 { x, y, corner }（corner = 拐角，画成小圆角） ----------

const fmt = (n) => n.toFixed(1);
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const toward = (p, q, r) => { const d = dist(p, q) || 1; return { x: p.x + (q.x - p.x) * r / d, y: p.y + (q.y - p.y) * r / d }; };

function dOf(pts) {
  let d = "M" + fmt(pts[0].x) + " " + fmt(pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.corner && i < pts.length - 1) {
      const r = Math.min(ROUND, dist(pts[i - 1], p) / 2, dist(p, pts[i + 1]) / 2), a = toward(p, pts[i - 1], r), b = toward(p, pts[i + 1], r);
      d += "L" + fmt(a.x) + " " + fmt(a.y) + "Q" + fmt(p.x) + " " + fmt(p.y) + " " + fmt(b.x) + " " + fmt(b.y);
    } else d += "L" + fmt(p.x) + " " + fmt(p.y);
  }
  return d;
}

// 去掉挨着重复的点、在一条直线上的中间点
function tidy(pts) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && dist(last, p) < 0.5) continue;
    const prev = out[out.length - 2];
    if (last && prev && last.corner && Math.abs((last.x - prev.x) * (p.y - last.y) - (last.y - prev.y) * (p.x - last.x)) < 0.5) out.pop();
    out.push(p);
  }
  return out;
}

// 走到全长的 f 处：{ point, i（在第几段） }
function walk(pts, f) {
  const lens = pts.slice(1).map((p, i) => dist(pts[i], p)), total = lens.reduce((a, b) => a + b, 0);
  let left = total * f;
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i] || i === lens.length - 1) return { point: toward(pts[i], pts[i + 1], Math.min(left, lens[i])), i };
    left -= lens[i];
  }
  return { point: pts[0], i: 0 };
}
const midOf = (pts) => walk(pts, 0.5).point;
function halves(pts) {
  const { point, i } = walk(pts, 0.5), m = { x: point.x, y: point.y };
  return [[...pts.slice(0, i + 1), m], [m, ...pts.slice(i + 1)]];
}
const reverse = (pts) => pts.slice().reverse();
const boundsOf = (pts, pad) => {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
};

// 一段三次贝塞尔取点（拖着的那条线、走不了缝的时候用）
function bezier(p0, c1, c2, p3, n = 20) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    out.push({ x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y });
  }
  return out;
}
// 两个框之间飞一条弧线：上下隔开的从上沿 / 下沿出去，否则从侧面
function arc(a, b) {
  const ax = (a.l + a.r) / 2, ay = (a.t + a.b) / 2, bx = (b.l + b.r) / 2, by = (b.t + b.b) / 2;
  if (Math.abs(by - ay) > (a.b - a.t + b.b - b.t) / 2 + 8) {
    const s = Math.sign(by - ay), p0 = { x: ax, y: s < 0 ? a.t : a.b }, p3 = { x: bx, y: s < 0 ? b.b : b.t }, k = Math.min(140, Math.max(20, Math.abs(p3.y - p0.y) * 0.5));
    return bezier(p0, { x: p0.x, y: p0.y + s * k }, { x: p3.x, y: p3.y - s * k }, p3);
  }
  const s = Math.sign(bx - ax) || 1, p0 = { x: s > 0 ? a.r : a.l, y: ay }, p3 = { x: s > 0 ? b.l : b.r, y: by }, k = Math.max(20, Math.abs(p3.x - p0.x) * 0.4);
  return bezier(p0, { x: p0.x + s * k, y: p0.y }, { x: p3.x - s * k, y: p3.y }, p3);
}

// ---------- 量位置、走线 ----------

function mount() {
  if (layer?.isConnected) return;
  layer = document.createElement("div");
  layer.className = "lk-layer";
  layer.innerHTML = '<svg class="lk-svg" aria-hidden="true"></svg><div class="lk-ui"><button type="button" class="lk-h" tabindex="-1" aria-hidden="true" title="Drag onto a goal, project or plan to link them"></button>' +
    '<button type="button" class="lk-x" tabindex="-1" aria-hidden="true" title="Unlink">×</button></div>';
  document.body.appendChild(layer);
  svg = layer.querySelector(".lk-svg");
  handle = layer.querySelector(".lk-h");
  cutX = layer.querySelector(".lk-x");
  handle.addEventListener("pointerdown", startDrag);
  cutX.addEventListener("click", () => { const x = edges.get(cutX.dataset.id); if (x) cut(x); });
}

// 页面坐标（这一层的左上角 = 页面左上角）
function rectOf(el) {
  const o = layer.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { l: r.left - o.left, t: r.top - o.top, r: r.right - o.left, b: r.bottom - o.top };
}
// 目标那一行只算到字的末尾（不然一栏宽的空白也算进去）；项目的头只算名字
function boxOf(el) {
  if (el.classList.contains("pg-top") && el.querySelector("h3")) return rectOf(el.querySelector("h3"));
  const b = rectOf(el), t = el.classList.contains("gl") && !el.classList.contains("editing") && el.querySelector(".gt");
  if (t) {
    const range = document.createRange();
    range.selectNodeContents(t);
    const o = layer.getBoundingClientRect(), tr = range.getBoundingClientRect(), gt = t.getBoundingClientRect();
    b.r = Math.min(gt.right, Math.max(tr.right, gt.left + 30)) - o.left + 2;
  }
  return b;
}

// 这一页的几条缝：yN = North star 和年份之间那条边，yF = 年份和近期之间那条边，yB = 目标板下面的空白，
// left = 页面左边的空白，mid = 左右两栏之间的空白，gaps = 年份、近期每一栏左边那条缝的 x
function layoutOf(root) {
  const board = root.querySelector(".goals"), far = board?.querySelector(".ggrid.far"), near = board?.querySelector(".ggrid.near");
  const main = root.querySelector(".pj-main"), side = root.querySelector(".pj-side");
  const P = rectOf(root);
  const L = { yN: far ? rectOf(far).t : null, yF: near ? rectOf(near).t : null, yB: board ? rectOf(board).b + 8 : P.t, left: P.l - 10, mid: null, gaps: [] };
  if (main && side) L.mid = (rectOf(main).r + rectOf(side).l) / 2;
  if (far) L.gaps = [...far.children].map(gapOf);
  return L;
}
// 一栏左边那条缝：和前一栏中间；一排里的第一栏是目标板的内边距中间
function gapOf(col) {
  const r = rectOf(col), prev = col.previousElementSibling, p = prev && rectOf(prev);
  return p && Math.abs(p.t - r.t) < 2 ? (p.r + r.l) / 2 : r.l - 7;
}

// 线的一头：目标（goal：从左边进出，x / y 是勾前面那一点，gx 是它左边那条缝，band 是哪一排，top 是这一行的上沿）；
// 计划卡 / 项目头 / 循环小事（从左边出去，gx 是左边那条大缝）；别的（收起来的「Goals」标题）返回 null，用弧线
function portOf(el, L) {
  const b = boxOf(el), y = (b.t + b.b) / 2;
  if (el.matches(".gl, .gmore")) {
    const col = el.closest(".gcol");
    if (!col) return null;
    const band = col.classList.contains("gnorth") ? "north" : col.closest(".ggrid.far") ? "far" : "near";
    return { goal: true, band, x: b.l - 3, y, gx: band === "north" ? b.l - 9 : gapOf(col), top: b.t };
  }
  if (el.closest(".goals")) return null;
  return { goal: false, x: b.l - 2, y: Math.min(y, b.t + 12), gx: el.closest(".pj-side") && L.mid !== null ? L.mid : L.left };
}

// 走线：先出到左边的缝，竖着走到一条横的缝，横过去，再竖着到目标那一行，往右进去。o = 这条线在缝里错开多少
function route(A, B, L, o) {
  const pts = [{ x: A.x, y: A.y }];
  const P = (x, y) => pts.push({ x, y, corner: true });
  if (A.goal) {
    if (A.band === B.band && Math.abs(A.gx - B.gx) < 1) { P(A.gx + o, A.y); P(B.gx + o, B.y); }   // 同一栏：就在左边那条缝里上下
    else {
      const lane = A.band === B.band && A.band !== "north" ? Math.min(A.top, B.top) : A.band === "north" || B.band === "north" ? L.yN : L.yF;
      P(A.gx + o, A.y); P(A.gx + o, lane + o); P(B.gx + o, lane + o); P(B.gx + o, B.y);
    }
  } else {
    P(A.gx + o, A.y); P(A.gx + o, L.yB + o);
    if (B.band === "north" && L.gaps.length) {   // 到 North star：先从离它最近的那栏的缝穿过年份、近期两排，到它下面那条边，再横过去
      const g = L.gaps.reduce((a, x) => (Math.abs(x - B.gx) < Math.abs(a - B.gx) ? x : a), L.gaps[0]);
      P(g + o, L.yB + o); P(g + o, L.yN + o); P(B.gx + o, L.yN + o); P(B.gx + o, B.y);
    } else { P(B.gx + o, L.yB + o); P(B.gx + o, B.y); }
  }
  pts.push({ x: B.x, y: B.y });
  return tidy(pts);
}

function edgeHTML(id, pts, maskD) {
  const r = boundsOf(pts, 12), d = dOf(pts), end = pts[pts.length - 1];
  return '<mask id="' + id + '" maskUnits="userSpaceOnUse" x="' + fmt(r.x) + '" y="' + fmt(r.y) + '" width="' + fmt(r.w) + '" height="' + fmt(r.h) + '"><path class="lk-rev" pathLength="1" d="' + maskD + '"/></mask>' +
    '<g mask="url(#' + id + ')"><path class="lk-a" d="' + d + '"/><path class="lk-b" d="' + d + '"/><path class="lk-p" d="' + d + '"/></g>' +
    '<circle class="lk-dot" r="2.6" cx="' + fmt(end.x) + '" cy="' + fmt(end.y) + '"/>';
}

// 画 key 的那一套：和画着的比，多的飞进来，少的淡掉，都有的原地改位置（不重飞）
function paint(key, { fly = true } = {}) {
  mount();
  clearTimeout(clearT);
  svg.classList.remove("out");
  const root = page();
  if (!root) return;
  const goals = store.goals(), L = layoutOf(root);
  const cols = new Map();
  for (const col of G.board(goals, store.today(), { showDone: true }).cols) for (const x of col.items) cols.set(x.goal.id, col.key);
  const ports = new Map();
  const port = (el) => { if (!ports.has(el)) ports.set(el, portOf(el, L)); return ports.get(el); };
  const base = colorOf(key);
  const lit = new Set([key]), keep = new Set();
  let n = 0, lane = 0;
  for (const e of related(key).sort((a, b) => a.at - b.at)) {
    const a = elOf(e.from, cols), b = elOf(e.to, cols);
    if (!a || !b || a === b) continue;
    lit.add(e.from); lit.add(e.to);
    keep.add(e.id);
    const A = port(a), B = port(b);
    const pts = A && B ? route(A, B, L, ((lane++ % 3) - 1) * LANE) : arc(boxOf(a), boxOf(b));
    const color = glow(colorOf(e.from) || colorOf(e.to) || base) || "var(--accent)";
    const old = edges.get(e.id);
    if (old && !old.gone) {
      if (!old.cutting) move(old, e, pts);
      old.g.style.setProperty("--c", color);
      continue;
    }
    const mask = "lkm" + (++seq);
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "lk" + (fly && !still.matches ? " fly" : ""));
    g.style.setProperty("--d", Math.min(n++ * STAGGER, 640) + "ms");
    g.style.setProperty("--c", color);
    g.innerHTML = edgeHTML(mask, pts, dOf(e.rev ? reverse(pts) : pts));
    svg.appendChild(g);
    edges.set(e.id, { e, g, pts, mask, gone: false });
  }
  for (const [id, x] of edges) if (!keep.has(id)) drop(id, x);
  fit();
  // 有关系的亮着，别的淡下去（一条线都没有的时候不淡）
  root.querySelectorAll(".lk-on, .lk-has").forEach((el) => el.classList.remove("lk-on", "lk-has"));
  if (keep.size) {
    for (const k of lit) {
      const el = elOf(k, cols);
      el?.classList.add("lk-on");
      el?.closest(".pgroup")?.classList.add("lk-has");
    }
  }
  root.classList.toggle("lk-dim", Boolean(keep.size));
}

// 原来就画着的：只挪位置（页面重画、窗口变了），不重飞
function move(x, e, pts) {
  x.e = e; x.pts = pts;
  const m = x.g.querySelector("mask"), r = boundsOf(pts, 12), d = dOf(pts), end = pts[pts.length - 1];
  m.setAttribute("x", fmt(r.x)); m.setAttribute("y", fmt(r.y)); m.setAttribute("width", fmt(r.w)); m.setAttribute("height", fmt(r.h));
  m.querySelector(".lk-rev")?.setAttribute("d", dOf(e.rev ? reverse(pts) : pts));
  x.g.querySelectorAll(".lk-a, .lk-b, .lk-p").forEach((p) => p.setAttribute("d", d));
  const dot = x.g.querySelector(".lk-dot");
  dot.setAttribute("cx", fmt(end.x)); dot.setAttribute("cy", fmt(end.y));
}

function drop(id, x) {
  edges.delete(id);
  if (x.gone) return;
  x.gone = true;
  x.g.classList.add("gone");
  setTimeout(() => x.g.remove(), still.matches ? 0 : 140);
}

// svg 的大小只框住画着的线（不撑大页面）；viewBox 就是页面坐标
function fit() {
  const pts = [...edges.values()].flatMap((x) => x.pts);
  if (!pts.length) { svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); return; }
  const r = boundsOf(pts, 16);
  Object.assign(svg.style, { left: r.x + "px", top: r.y + "px" });
  svg.setAttribute("width", fmt(r.w));
  svg.setAttribute("height", fmt(r.h));
  svg.setAttribute("viewBox", [r.x, r.y, r.w, r.h].map(fmt).join(" "));
}

// 拖的把手：目标、项目名字、循环小事的字后面（线从左边进出，把手放右边不挡着），计划卡上沿正中
function placeHandle(el) {
  if (!el) { handle.classList.remove("on"); return; }
  // 项目的头：名字后面紧跟着一行小字，放在那行字（和风险的点）后面
  const tail = el.classList.contains("pg-top") && [...el.querySelectorAll(":scope > .pg-meta, :scope > .health")].pop();
  const b = boxOf(el), t = tail ? rectOf(tail) : b;
  const p = el.classList.contains("pcard") ? { x: (b.l + b.r) / 2, y: b.t } : { x: t.r + 10, y: (b.t + b.b) / 2 };
  handle.style.left = p.x + "px";
  handle.style.top = p.y + "px";
  handle.classList.add("on");
}

// ---------- 悬停 ----------

function open(key, el) {
  clearTimeout(closeT); closeT = 0;
  cur = { key, el };
  paint(key);
  placeHandle(el);
}

// 线收起来（now：马上拿掉，不淡出）
function clearLines(now) {
  page()?.classList.remove("lk-dim");
  page()?.querySelectorAll(".lk-on, .lk-has").forEach((el) => el.classList.remove("lk-on", "lk-has"));
  if (!layer) return;
  cutX.classList.remove("on");
  const clear = () => { for (const [id, x] of edges) { edges.delete(id); x.g.remove(); } fit(); svg.classList.remove("out"); };
  clearTimeout(clearT);
  if (now || still.matches) { clear(); return; }
  svg.classList.add("out");
  clearT = setTimeout(clear, 130);
}

function close(now = false) {
  clearTimeout(closeT); closeT = 0;
  clearTimeout(wantT); want = "";
  if (!cur && !edges.size) return;
  cur = null;
  handle?.classList.remove("on");
  clearLines(now);
}

const keep = () => { clearTimeout(closeT); closeT = 0; };
const later = () => { if (!closeT) closeT = setTimeout(() => close(), GRACE); };

// 鼠标离哪条线最近（页面坐标）
function nearest(px, py) {
  let best = null, d0 = NEAR;
  for (const x of edges.values()) {
    if (x.gone) continue;
    for (let i = 1; i < x.pts.length; i++) {
      const a = x.pts[i - 1], b = x.pts[i], vx = b.x - a.x, vy = b.y - a.y, len = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / len));
      const d = Math.hypot(a.x + t * vx - px, a.y + t * vy - py);
      if (d < d0) { d0 = d; best = x; }
    }
  }
  return best;
}

function showCut(x) {
  if (!x) { cutX.classList.remove("on"); return; }
  const m = midOf(x.pts);
  cutX.style.left = m.x + "px";
  cutX.style.top = m.y + "px";
  cutX.dataset.id = x.e.id;
  cutX.classList.add("on");
}

// 断开：线从中间断开，两头各自缩回去，然后才真的删（删完重画时这条已经不在了）
function cut(x) {
  cutX.classList.remove("on");
  if (still.matches) { unlink(x.e); return; }
  const [h1, h2] = halves(x.pts);
  const m = x.g.querySelector("mask");
  m.querySelector(".lk-rev")?.remove();
  m.insertAdjacentHTML("beforeend", '<path class="lk-rev lk-cut" pathLength="1" d="' + dOf(h1) + '"/><path class="lk-rev lk-cut" pathLength="1" d="' + dOf(reverse(h2)) + '"/>');
  x.cutting = true;
  x.g.classList.add("cutting");
  setTimeout(() => unlink(x.e), 260);
}

let mx = 0, my = 0, target = null, queued = false;
function onMove() {
  queued = false;
  if (drag || !onPage()) return;
  if (target?.closest?.(".lk-ui")) { keep(); return; }
  const a = document.activeElement;   // 正在改字、加目标：不画
  if (a?.matches?.("input, select, textarea") && page()?.contains(a)) { close(); return; }
  const n = target?.closest?.(NODE), key = n && n.closest(".projects") ? keyOf(n) : "";
  if (key) {
    if (cur?.key === key) { keep(); cutX.classList.remove("on"); return; }
    if (want !== key) {
      want = key;
      clearTimeout(wantT);
      wantT = setTimeout(() => { want = ""; if (n.isConnected && onPage()) open(key, n); }, DWELL);
    }
    if (cur) keep();
    return;
  }
  want = ""; clearTimeout(wantT);
  if (!cur) return;
  const o = layer.getBoundingClientRect();
  const x = nearest(mx - o.left, my - o.top);
  showCut(x);
  if (x) keep(); else later();
}

// ---------- 拖一下建链接 ----------

function startDrag(e) {
  if (!cur || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const goals = store.goals(), from = cur.key, el = cur.el;
  clearTimeout(closeT); closeT = 0;
  clearTimeout(wantT); want = "";
  cur = null;
  clearLines(true);
  handle.classList.add("drag");
  const can = new Map();
  for (const n of page()?.querySelectorAll(NODE) || []) {
    const k = keyOf(n);
    if (k && canLink(goals, from, k)) { can.set(n, k); n.classList.add("lk-can"); }
  }
  el.classList.add("lk-src");
  page()?.classList.add("lk-drag");
  dragSvg = document.createElementNS(NS, "svg");
  dragSvg.setAttribute("class", "lk-drag-svg");
  dragSvg.setAttribute("aria-hidden", "true");
  dragSvg.innerHTML = '<g class="lk live"><mask id="lk-dm" maskUnits="userSpaceOnUse" x="-10" y="-10" width="' + (innerWidth + 20) + '" height="' + (innerHeight + 20) + '"><path class="lk-rev" pathLength="1"/></mask>' +
    '<g mask="url(#lk-dm)"><path class="lk-a"/><path class="lk-b"/><path class="lk-p"/></g><circle class="lk-dot" r="3"/></g>';
  dragSvg.querySelector(".lk").style.setProperty("--c", glow(colorOf(from)) || "var(--accent)");
  document.body.appendChild(dragSvg);
  drag = { from, el, can, target: null, id: e.pointerId };
  handle.setPointerCapture(e.pointerId);
  handle.addEventListener("pointermove", dragMove);
  handle.addEventListener("pointerup", dragEnd);
  handle.addEventListener("pointercancel", dragEnd);
  dragMove(e);
}

// 屏幕坐标（这条线画在一层固定的 svg 上）
function screenBox(el) {
  const r = (el.classList.contains("pg-top") && el.querySelector("h3") || el).getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom };
}

function dragMove(e) {
  if (!drag) return;
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(NODE);
  const t = over && drag.can.has(over) ? over : null;
  if (t !== drag.target) { drag.target?.classList.remove("lk-snap"); t?.classList.add("lk-snap"); drag.target = t; }
  const pts = arc(screenBox(drag.el), t ? screenBox(t) : { l: e.clientX - 1, t: e.clientY - 1, r: e.clientX + 1, b: e.clientY + 1 }), d = dOf(pts), end = pts[pts.length - 1];
  dragSvg.querySelectorAll(".lk-a, .lk-b, .lk-p, .lk-rev").forEach((p) => p.setAttribute("d", d));
  const dot = dragSvg.querySelector(".lk-dot");
  dot.setAttribute("cx", fmt(end.x)); dot.setAttribute("cy", fmt(end.y));
  dragSvg.classList.toggle("snap", Boolean(t));
}

function dragEnd(e) {
  if (!drag) return;
  const { from, el, can, target: t } = drag;
  handle.removeEventListener("pointermove", dragMove);
  handle.removeEventListener("pointerup", dragEnd);
  handle.removeEventListener("pointercancel", dragEnd);
  if (handle.hasPointerCapture?.(drag.id)) handle.releasePointerCapture(drag.id);
  drag = null;
  for (const n of can.keys()) n.classList.remove("lk-can", "lk-snap");
  el.classList.remove("lk-src");
  page()?.classList.remove("lk-drag");
  handle.classList.remove("drag", "on");
  const line = dragSvg;
  dragSvg = null;
  if (t && e.type === "pointerup") {
    // 连上：接着悬停着拖出来的那个；这条临时的线留着，等页面按新的链接重画、真的那条画出来（afterRender）再拿掉
    const to = can.get(t);
    t.classList.add("lk-landed");
    setTimeout(() => t.classList.remove("lk-landed"), 700);
    cur = { key: from, el };
    landing = line;
    setTimeout(() => { if (landing === line) landing = null; line.remove(); }, 500);
    link(from, to);
    return;
  }
  // 没连上：线缩回把手那头
  if (still.matches) { line.remove(); return; }
  line.classList.add("back");
  setTimeout(() => line.remove(), 240);
}

// ---------- 对外 ----------

// 页面重画完（main.js 的 draw）：悬停中的按新的位置、新的链接再画一次（新连上的飞进来，断开的淡掉）
export function afterRender() {
  if (!layer && !cur) return;
  if (!onPage()) { close(true); return; }
  if (drag || !cur) return;
  const el = elOf(cur.key, new Map());
  if (!el) { close(true); return; }
  cur.el = el;
  paint(cur.key, { fly: !landing });
  placeHandle(el);
  if (landing) { landing.remove(); landing = null; }
}

export function initLinks() {
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    mx = e.clientX; my = e.clientY; target = e.target;
    if (!queued) { queued = true; requestAnimationFrame(onMove); }
  }, { passive: true });
  // 点了别处、打字、换页：收起来（点的是把手、× 不算）
  addEventListener("pointerdown", (e) => { if (!e.target.closest?.(".lk-ui")) close(); }, true);
  addEventListener("keydown", (e) => {
    if (drag && e.key === "Escape") { e.preventDefault(); dragEnd({ type: "cancel" }); return; }
    if (!drag) close();
  }, true);
  document.documentElement.addEventListener("mouseleave", () => { if (!drag) close(); });
  addEventListener("hashchange", () => close(true));
  let raf = 0;
  addEventListener("resize", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (cur && !drag) { paint(cur.key, { fly: false }); placeHandle(cur.el); } }); });
}
