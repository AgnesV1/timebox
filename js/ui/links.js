// Projects 页（电脑）上「谁为谁服务」的连线。页面上盖一层 SVG，鼠标点得穿；只在悬停、拖的时候画。
// 悬停一条目标 / North star 里框出来的词 / 一个项目的头 / 一张计划卡（停一下，路过不算）：跟它有关的线一条条从它这儿飞出去（每条隔 40ms），
//   用键盘（Tab）停在它们上面也一样（不出拖的把手——拖本来就要鼠标）；Esc、焦点离开 Projects 页就收起，
//   画完以后，线上一道流光一直朝「为了谁」那头跑：计划 / 项目 → 目标 → 上级 → … → North star。没关系的目标、卡片淡下去，
//   连着的目标和 North star 里的词涂上青柠荧光笔（她 10-21 从三个样子里挑的）。连着的都要看得见：折在「+N more」里的露出来，
//   右栏滚走了的滚过去（悬停的在左边时），North star 那三行里被挡住的词，框里暂时换成那一句 / 那一小段 / 只列词（focusNorth）。
//   目标：往上一路到顶，往下是挂在它下面的（一层层）和为它们服务的项目、计划；
//   计划：它连着的目标（自己没连的，看它所在的项目连着的），再一路往上；项目：它连着的，加上它下面自己连了目标的计划。
// 线就是两头直接连的一条三次贝塞尔，斜着飞过去，压着字也没关系（只在鼠标停着的时候有）：
//   左边的计划卡 → 右栏的目标：从朝着对方的那一边出去，两头水平，中间一道斜的 S；
//   都在右栏里的（目标 → 上级、→ North star 里的词）：两头都从左边进出，往左鼓成一个 C，不压目标的字；
//   右栏里滚走了、看不见的那头：压到能看见的那一截的边上，那头的小圆点画成空心的。
// 每条线：一条很淡的细虚线当轨迹，上面一小截亮的（流光）沿着线跑到头，停一下，再从头出来；跑到「为了谁」那头时小圆点跳一下。
//   白天墨色，粉、蓝两版错开一点（丝网印套色，和换页的标题一个路子）；夜里项目的霓虹色，底下一条宽的淡的当光（不用滤镜）。
//   流光的长短、一圈多久按线的长度算，长线短线跑得一样快。同时最多 STREAKS 条带流光，多的只画轨迹。
//   系统要求减少动态、或者 Settings 里关了 Sparkles：不跑流光，轨迹画成实线。
// 鼠标顺着线走，线一直在；走到哪条线那头的小圆点旁边，圆点左边出一个「×」（那条线跟着亮一点，看得出断的是哪条），点了就断开（从中间断，两头缩回去）——
//   她 2026-10-28 说的：以前「×」在线中间、鼠标离线远一点就没了，难戳。
// 左边的（计划卡、项目的头、↻ 那几行）用鼠标选中了（出了拖的把手那个小圆点）就拿住，不轻易换、不轻易收（她 10-27 说的：太容易消失、会漂到别的线上）：
//   要停住才选中，挪着路过的不算；拿住以后路过别的不换——在一个没连着的上面停住 REST 才换成它，连着的（亮着的）不换；
//   鼠标在这一套占的那一片里（线的外框，加上它自己和亮着的那些）就一直在，出了那一片 HOLD 才收；点它自己、点亮着的（不是上面的按钮）也不收。
//   右栏里的（目标、North star 的词）照旧：停一下就换，离线远了一会儿就收。
// 拖一下建链接：悬停时旁边出一个小圆圈，从它拖出去，一条线跟着鼠标飞；能连的地方亮着，经过时吸过去，松手就连上。拖到右栏的上下沿，右栏自己滚。
//   目标拖到目标 = 设成它的上级（一条只有一个上级，会换掉原来的；会连成环的不亮）；目标 ↔ 计划 / 项目 = 这个计划 / 项目为这条目标服务。
//   不拖也能连：计划编辑框里的 Serves（js/ui/projects.js），改目标文字时的 Part of（js/ui/goals.js）。
// 位置只在悬停、拖、窗口变了、页面重画了、滚动了（右栏贴着顶，会挪）的时候量，每帧最多一次。只动 stroke-dashoffset、透明度和 transform。

import * as store from "../store.js";
import * as G from "../goals.js";
import * as GR from "../groups.js";
import * as E from "../engine.js";
import { esc } from "../dom.js";

const NODE = ".goals .gl[data-goal], .goals .ns-g[data-goal], .pgroup[data-group] > .pg-top:not(.editing), .pcard[data-project], .g-rep[data-project]";
const fine = matchMedia("(hover: hover) and (pointer: fine)");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const NS = "http://www.w3.org/2000/svg";
const DWELL = 110, GRACE = 280, STAGGER = 40, NEAR = 12;
// 左边拿住的：换成别的要停住多久、出了那一片多久才收、停住时手抖多少还算停着、那一片四周放宽多少
const REST = 600, HOLD = 800, STILL = 5, AREA = 24;
// 断开的「×」：鼠标离一条线那头的小圆点多近才出来、出在圆点左边多远
const END = 26, CUT_OFF = 15;
// 流光：一圈 = 从起点外面滑进来、跑过整条线（pathLength 1）、再停一下；dash 的周期固定是 RUN（css 的 lk-run 从 .3 推到 -1.1，正好一个周期）
const RUN = 1.4, SPEED = 260, STREAKS = 24;

let layer = null, svg = null, handle = null, cutX = null, dragSvg = null;
const edges = new Map();   // 画着的线：id → { e, g, pts, mask, gone, cutting }
let cur = null;            // 悬停中：{ key, el, kb（键盘停着的：不出把手） }
let want = "", wantT = 0, closeT = 0, clearT = 0, wx = 0, wy = 0;
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

// 页面上代表它的元素。目标折在「+N more」里（画着但藏着，.fold）：平时用那个按钮代替，悬停时露出来了（.lk-unfold）、拖着连线时那一段整段展开，就是它自己；
// North star 里的词：框里换成了重点（.ns-focus）就是那里面的那个；
// 切到了 Ideas：用「Goals」那个按钮。收进往期的目标不会问到这里（related 已经越过它们）
function elOf(key, cols) {
  const root = page();
  if (!root) return null;
  const q = (sel) => root.querySelector(sel);
  if (key.startsWith("goal:")) {
    const id = CSS.escape(key.slice(5)), col = cols.get(key.slice(5));
    const gl = q('.goals .gl[data-goal="' + id + '"]');
    if (gl && (!gl.classList.contains("fold") || gl.classList.contains("lk-unfold") || root.classList.contains("lk-drag"))) return gl;
    return q('.goals .ns-focus [data-fgoal="' + id + '"]') || q('.goals .ns-g[data-goal="' + id + '"]') ||
      (col && (q('.goals [data-col="' + col + '"] .gmore') || q('.goals [data-col="' + col + '"] h4'))) || q('.goals .rail-tabs [data-v="goals"]');
  }
  if (key.startsWith("g:")) return q('.pgroup[data-group="' + CSS.escape(key.slice(2)) + '"] > .pg-top:not(.editing)');
  const id = CSS.escape(key.slice(2));
  return q('.pcard[data-project="' + id + '"]') || q('.g-rep[data-project="' + id + '"]');
}

// 一条线 { id, from, to, at, rev }：from 为 to 服务（虚线往 to 流）；at = 离悬停的那个第几层（飞出去的先后）；rev = 悬停的在 to 那头，从那头开始画。
// 过了期、收进往期的目标当它不在（她说每个月上个月一消失，路径就该跟着变）：经过它的线越过它，接到它往上第一条还在的——
// 挂在它下面的算挂在那一条下面，为它服务的计划 / 项目也算为那一条服务（js/goals.js 的 visibleSet / lift）
function related(key) {
  const goals = store.goals(), byId = new Map(goals.map((g) => [g.id, g]));
  const vis = G.visibleSet(goals, store.today()), lift = (id) => (id ? G.lift(goals, id, vis, byId)?.id || "" : "");
  const out = new Map();
  const add = (from, to, at, rev) => { if (from !== to && !out.has(from + ">" + to)) out.set(from + ">" + to, { id: from + ">" + to, from, to, at, rev }); };
  const up = (id, at) => { const chain = G.chainUp(goals, id, vis); for (let i = 0; i + 1 < chain.length; i++) add("goal:" + chain[i].id, "goal:" + chain[i + 1].id, at + i, false); };
  const refs = (g) => (Array.isArray(g?.by) ? g.by : []);
  const lifted = (list) => [...new Set(list.map((g) => lift(g.id)).filter(Boolean))];
  if (key.startsWith("goal:")) {
    const id = key.slice(5);
    if (!vis.has(id)) return [];
    up(id, 0);
    const home = new Map(goals.map((g) => [g.id, lift(g.id)]));            // 每条目标算在哪一条还在的上（还在的就是它自己）
    const parent = new Map(goals.map((g) => [g.id, lift(g.up)]));          // 越过收掉的以后，它的上级
    const level = new Map([[id, 0]]), queue = [id];
    while (queue.length) {
      const pid = queue.shift(), at = level.get(pid);
      for (const g of goals) if (home.get(g.id) === pid) for (const r of refs(g)) add(r, "goal:" + pid, at, true);
      for (const g of goals) if (vis.has(g.id) && g.id !== pid && parent.get(g.id) === pid && !level.has(g.id)) { level.set(g.id, at + 1); add("goal:" + g.id, "goal:" + pid, at, true); queue.push(g.id); }
    }
    return [...out.values()];
  }
  let from = key, list = lifted(G.servedBy(goals, key));
  if (!list.length && key.startsWith("p:")) {   // 计划自己没连（或者连的都收进往期了）：看它所在的项目连着的
    const p = store.get("projects", key.slice(2));
    if (p?.group) { from = G.groupRef(p.group); list = lifted(G.servedBy(goals, from)); }
  }
  for (const gid of list) { add(from, "goal:" + gid, 0, false); up(gid, 1); }
  if (key.startsWith("g:")) {
    for (const p of store.all("projects")) {
      if ((p.group || "") !== key.slice(2) || !E.isActive(p)) continue;
      for (const gid of lifted(G.servedBy(goals, G.planRef(p.id)))) { add(G.planRef(p.id), "goal:" + gid, 1, false); up(gid, 2); }
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

// ---------- 线：一段三次贝塞尔 { p0, c1, c2, p3 }，另外取一串点（判断鼠标离线多近、中间的 ×、从中间断开、框住多大都用它） ----------

const fmt = (n) => n.toFixed(1);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const toward = (p, q, r) => { const d = dist(p, q) || 1; return { x: p.x + (q.x - p.x) * r / d, y: p.y + (q.y - p.y) * r / d }; };
const P = (p) => fmt(p.x) + " " + fmt(p.y);
const dOf = (pts) => "M" + pts.map(P).join("L");
const cOf = (c) => "M" + P(c.p0) + "C" + P(c.c1) + " " + P(c.c2) + " " + P(c.p3);
const cRev = (c) => cOf({ p0: c.p3, c1: c.c2, c2: c.c1, p3: c.p0 });

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
function halves(pts) {
  const { point, i } = walk(pts, 0.5), m = { x: point.x, y: point.y };
  return [[...pts.slice(0, i + 1), m], [m, ...pts.slice(i + 1)]];
}
const reverse = (pts) => pts.slice().reverse();
const lengthOf = (pts) => pts.slice(1).reduce((a, p, i) => a + dist(pts[i], p), 0);
const boundsOf = (pts, pad) => {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
};
function sample({ p0, c1, c2, p3 }, n = 24) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    out.push({ x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y });
  }
  return out;
}

// 两个框之间的一条线（框是 { l, t, r, b }，坐标随意，只要两个一样）。rail = 两头都在右栏里。y0 / y1 = 线头的高度（不给就是正中）
//   都在右栏里：两头从左边进出，往左鼓成 C；左右隔开：从朝着对方的那一边出去，两头水平，中间一道斜的 S；上下叠着（窗口窄了，右栏挪到上面）：从上下沿出去
export function curve(A, B, { rail = false, y0, y1 } = {}) {
  const ya = y0 ?? (A.t + A.b) / 2, yb = y1 ?? (B.t + B.b) / 2;
  if (rail) {
    const p0 = { x: A.l - 3, y: ya }, p3 = { x: B.l - 3, y: yb }, k = clamp(Math.abs(p3.y - p0.y) * 0.28, 18, 80);
    return { p0, c1: { x: p0.x - k, y: p0.y }, c2: { x: p3.x - k, y: p3.y }, p3 };
  }
  if (A.r < B.l - 8 || B.r < A.l - 8) {
    const s = B.l + B.r > A.l + A.r ? 1 : -1;
    const p0 = { x: s > 0 ? A.r + 2 : A.l - 2, y: ya }, p3 = { x: s > 0 ? B.l - 3 : B.r + 3, y: yb }, k = clamp(Math.abs(p3.x - p0.x) * 0.42, 40, 260);
    return { p0, c1: { x: p0.x + s * k, y: p0.y }, c2: { x: p3.x - s * k, y: p3.y }, p3 };
  }
  const s = B.t + B.b > A.t + A.b ? 1 : -1;
  const p0 = { x: (A.l + A.r) / 2, y: s > 0 ? A.b + 2 : A.t - 2 }, p3 = { x: (B.l + B.r) / 2, y: s > 0 ? B.t - 3 : B.b + 3 }, k = clamp(Math.abs(p3.y - p0.y) * 0.5, 20, 140);
  return { p0, c1: { x: p0.x, y: p0.y + s * k }, c2: { x: p3.x, y: p3.y - s * k }, p3 };
}

// 流光多长、一圈多久：按线的长度（像素）算，长线短线跑得一样快。hit = 流光的头跑到那头时是一圈里的第几（css 的 dash 从 .3 推到 -1.1：
// 头在 1.4t - .3 + sl 处，到 1 的时候 t = (1.3 - sl) / 1.4），小圆点就在那一下跳
export function streakOf(len) {
  const sl = clamp(48 / Math.max(1, len), 0.08, 0.3);
  return { sl, sg: RUN - sl, sd: clamp(RUN * len / SPEED, 1.2, 4.2), hit: (1.3 - sl) / RUN };
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
const toPage = (r, o) => ({ l: r.left - o.left, t: r.top - o.top, r: r.right - o.left, b: r.bottom - o.top });
function rectOf(el) { return toPage(el.getBoundingClientRect(), layer.getBoundingClientRect()); }
// 目标那一行只算到字的末尾（不然一栏宽的空白也算进去）；项目的头只算名字；框出来的词折行了，算它第一行那一截
function boxOf(el) {
  if (el.classList.contains("pg-top") && el.querySelector("h3")) return rectOf(el.querySelector("h3"));
  if (el.classList.contains("ns-g")) { const r = el.getClientRects()[0]; return r ? toPage(r, layer.getBoundingClientRect()) : rectOf(el); }
  const b = rectOf(el), t = el.classList.contains("gl") && !el.classList.contains("editing") && el.querySelector(".gt");
  if (t) {
    const range = document.createRange();
    range.selectNodeContents(t);
    const o = layer.getBoundingClientRect(), tr = range.getBoundingClientRect(), gt = t.getBoundingClientRect();
    b.r = Math.min(gt.right, Math.max(tr.right, gt.left + 30)) - o.left + 2;
  }
  return b;
}

// 线头的高度：计划卡是标题那一行，别的是正中。在右栏里滚走了（或 North star 那段字滚走了）：压到能看见的那一截的边上，clip = 那头画成空心
function endOf(el) {
  const b = boxOf(el);
  let y = el.classList.contains("pcard") ? Math.min((b.t + b.b) / 2, b.t + 14) : (b.t + b.b) / 2, clip = false;
  const sc = el.closest(".rail-body, .ns-text, .ns-focus");
  if (sc) {
    const r = rectOf(sc), lo = r.t + 5, hi = r.b - 5;
    if (y < lo || y > hi) { y = clamp(y, lo, hi); clip = true; }
  }
  return { b, y, clip };
}

// a 为 b 服务：从 a 画到 b
function geo(a, b) {
  const A = endOf(a), B = endOf(b);
  const c = curve(A.b, B.b, { rail: Boolean(a.closest(".pj-rail") && b.closest(".pj-rail")), y0: A.y, y1: B.y });
  const pts = sample(c);
  return { c, pts, len: lengthOf(pts), clip: B.clip };
}

function edgeHTML(id, g, rev) {
  const r = boundsOf(g.pts, 12), d = cOf(g.c), end = g.c.p3;
  const paths = '<path class="lk-sa" pathLength="1" d="' + d + '"/><path class="lk-sb" pathLength="1" d="' + d + '"/><path class="lk-sp" pathLength="1" d="' + d + '"/>';
  return '<mask id="' + id + '" maskUnits="userSpaceOnUse" x="' + fmt(r.x) + '" y="' + fmt(r.y) + '" width="' + fmt(r.w) + '" height="' + fmt(r.h) + '"><path class="lk-rev" pathLength="1" d="' + (rev ? cRev(g.c) : d) + '"/></mask>' +
    '<g mask="url(#' + id + ')"><path class="lk-t" d="' + d + '"/><g class="lk-s">' + paths + "</g></g>" +
    '<circle class="lk-dot' + (g.clip ? " open" : "") + '" r="2.6" cx="' + fmt(end.x) + '" cy="' + fmt(end.y) + '"/>';
}
// 流光的那几个变量：长短、一圈多久、什么时候开始跑（等这条飞完，再错开一点）、小圆点什么时候跳（流光的头到的那一下，提前一点点）
function setStreak(gEl, len, n) {
  const k = streakOf(len);
  if (n !== undefined) gEl.dataset.sdl = Math.min(n * STAGGER, 640) + 420 + (n % 5) * 170;
  const sdl = Number(gEl.dataset.sdl) || 420;
  gEl.style.setProperty("--sl", k.sl.toFixed(3));
  gEl.style.setProperty("--sg", k.sg.toFixed(3));
  gEl.style.setProperty("--sd", k.sd.toFixed(2) + "s");
  gEl.style.setProperty("--sdl", sdl + "ms");
  gEl.style.setProperty("--hd", Math.round(sdl + (k.hit - 0.05) * k.sd * 1000) + "ms");
}

// 画 key 的那一套：和画着的比，多的飞进来，少的淡掉，都有的原地改位置（不重飞）
function paint(key, { fly = true } = {}) {
  mount();
  clearTimeout(clearT);
  svg.classList.remove("out");
  const root = page();
  if (!root) return;
  const goals = store.goals();
  const cols = new Map();
  for (const col of G.board(goals, store.today()).cols) for (const x of col.items) cols.set(x.goal.id, col.key);
  const base = colorOf(key);
  const lit = new Set([key]), keep = new Set();
  let n = 0, streaks = 0;
  // 先让连着的看得见（都在量位置之前）：折在「+N more」里的露出来；North star 里被挡住的词换成重点（悬停的就是 North star 里的词时不换，它本来就看得见）
  const list = related(key).sort((a, b) => a.at - b.at), ends = new Set([key, ...list.flatMap((e) => [e.from, e.to])]);
  const north = new Set(goals.filter((g) => g.span === "north").map((g) => "goal:" + g.id));
  unfold(root, ends, cur?.el);
  focusNorth(root, north.has(key) ? [] : [...ends].filter((k) => north.has(k)).map((k) => k.slice(5)));
  for (const e of list) {
    const a = elOf(e.from, cols), b = elOf(e.to, cols);
    if (!a || !b || a === b) continue;
    lit.add(e.from); lit.add(e.to);
    keep.add(e.id);
    const g = geo(a, b);
    const color = glow(colorOf(e.from) || colorOf(e.to) || base) || "var(--accent)";
    const old = edges.get(e.id);
    if (old && !old.gone) {
      if (!old.cutting) move(old, e, g);
      old.g.style.setProperty("--c", color);
      streaks += old.g.classList.contains("calm") ? 0 : 1;
      continue;
    }
    const mask = "lkm" + (++seq);
    const el = document.createElementNS(NS, "g");
    const calm = streaks >= STREAKS;
    if (!calm) streaks++;
    el.setAttribute("class", "lk" + (fly && !still.matches ? " fly" : "") + (calm ? " calm" : ""));
    el.style.setProperty("--d", Math.min(n * STAGGER, 640) + "ms");
    el.style.setProperty("--c", color);
    setStreak(el, g.len, fly ? n : 0);
    n++;
    el.innerHTML = edgeHTML(mask, g, e.rev);
    svg.appendChild(el);
    edges.set(e.id, { e, g: el, pts: g.pts, len: g.len, mask, gone: false });
  }
  for (const [id, x] of edges) if (!keep.has(id)) drop(id, x);
  fit();
  // 有关系的亮着（css 给目标和 North star 的词涂荧光笔），别的淡下去（一条线都没有的时候不淡）
  root.querySelectorAll(".lk-on, .lk-has").forEach((el) => el.classList.remove("lk-on", "lk-has"));
  const rows = [];
  if (keep.size) {
    for (const k of lit) {
      const el = elOf(k, cols);
      el?.classList.add("lk-on");
      el?.closest(".pgroup")?.classList.add("lk-has");
      if (el?.classList.contains("gl")) rows.push(el);
    }
  } else { unfocusNorth(root); unfold(root, new Set(), null); }
  root.classList.toggle("lk-dim", Boolean(keep.size));
  if (fly && rows.length) reveal(root, cur?.el, rows);
}

// ---------- 悬停时，连着的要看得见（她 10-21 说的：连到了哪个词、哪几条目标，现在会被挡住） ----------

// 折在「+N more」里的连着的目标：露出来（.lk-unfold），「+N more」跟着改数、全露出来了就藏起来。
// 悬停的就在右栏里时，只放开它下面的——上面的放开会把它往下挤，鼠标底下就换成了别的一条。ends 空 = 全收回去
function unfold(root, ends, el) {
  const body = root.querySelector(".goals .rail-body"), inRail = Boolean(el && body?.contains(el)), want = new Set();
  for (const k of ends) {
    if (!k.startsWith("goal:")) continue;
    const gl = root.querySelector('.goals .gl.fold[data-goal="' + CSS.escape(k.slice(5)) + '"]');
    if (gl && (!inRail || el.compareDocumentPosition(gl) & Node.DOCUMENT_POSITION_FOLLOWING)) want.add(gl);
  }
  for (const gl of root.querySelectorAll(".goals .gl.lk-unfold")) if (!want.has(gl)) gl.classList.remove("lk-unfold");
  for (const gl of want) gl.classList.add("lk-unfold");
  for (const b of root.querySelectorAll('.goals .gcol .gmore[data-act="g-more"]')) {
    const col = b.closest(".gcol"), all = col.querySelectorAll(".gl.fold").length, out = col.querySelectorAll(".gl.fold.lk-unfold").length;
    b.dataset.t ??= b.textContent;
    b.textContent = out ? "+" + (all - out) + " more" : b.dataset.t;
    b.hidden = out > 0 && out === all;
  }
}

// 这个词在那段字的框里整个看得见（折了行的话，最后一截也要在框里）
function shows(box, el) {
  const rs = el?.getClientRects();
  if (!rs?.length) return false;
  const r = box.getBoundingClientRect();
  return rs[0].top >= r.top - 1 && rs[rs.length - 1].bottom <= r.bottom + 1;
}

// North star 那段平时只露三行。连着的词有被挡住的（在第三行下面、被滚走了、折了行露一半）：框里暂时换成重点——
//   只连着一个词：那一句；一句放不下就那一小段（先带上前面一小段），再放不下就只剩这个词；连着两三个词：只列这几个词（她说的）。
// 盖在原来那段字上面，一样大（下面的目标不跳）；原来那段藏起来（也不接鼠标），线走开就换回来（unfocusNorth）
function focusNorth(root, ids) {
  const ns = root.querySelector(".goals .ns"), txt = ns?.querySelector(".ns-text:not(.empty)");
  if (!txt || !ids.length || ids.every((id) => shows(txt, txt.querySelector('.ns-g[data-goal="' + CSS.escape(id) + '"]')))) { unfocusNorth(root); return; }
  const sig = [...ids].sort().join(" "), place = (el) => Object.assign(el.style, { top: txt.offsetTop + "px", left: txt.offsetLeft + "px", width: txt.clientWidth + "px", height: txt.clientHeight + "px" });
  let ov = ns.querySelector(".ns-focus");
  if (ov?.dataset.k === sig) { place(ov); return; }   // 已经换好了（滚动、窗口变了以后再画一遍）：只跟着挪
  const text = store.northStar(), phrases = G.parseNorth(text), north = store.goals().filter((g) => g.span === "north");
  const at = G.matchNorth(phrases, north).ids, byId = new Map(north.map((g) => [g.id, g]));
  const keep = phrases.map((p, i) => i).filter((i) => ids.includes(at[i]));
  if (!keep.length) { unfocusNorth(root); return; }
  if (!ov) {
    ov = document.createElement("div");
    ov.className = "ns-focus";
    ov.setAttribute("aria-hidden", "true");
    ns.appendChild(ov);
  }
  place(ov);
  // 框里的词和原来那段一个样子（.ns-g），只是不接鼠标、带的是 data-fgoal（不算能悬停、能连的那种）
  const word = (i) => { const g = byId.get(at[i]); return (g ? '<span class="ns-g' + (g.done ? " done" : "") + '" data-fgoal="' + esc(g.id) + '">' : '<span class="ns-g ghost">') + esc(phrases[i].text) + "</span>"; };
  const html = (parts) => parts.map((x) => (x.gap ? '<span class="ns-gap">…</span>' : x.sep ? '<span class="ns-sep">·</span>' : x.i !== undefined ? word(x.i) : esc(x.text))).join("");
  for (const [level, pad] of keep.length > 1 ? [["word"]] : [["sentence"], ["clause", 1], ["clause"], ["word"]]) {
    ov.innerHTML = html(G.northFocus(text, phrases, keep, level, pad));
    if (ov.scrollHeight <= ov.clientHeight + 1) break;
  }
  ov.dataset.k = sig;
  ns.classList.add("focus");
}

function unfocusNorth(root) {
  root?.querySelector(".goals .ns-focus")?.remove();
  root?.querySelector(".goals .ns.focus")?.classList.remove("focus");
}

// 右栏滚走了、看不见的连着的目标：悬停的在左边（计划卡、项目名）时，右栏滚过去（刚飞出去那一下，一次）。
// 都放得下就挪最少的那一点；放不下就让最上面那条贴着顶。悬停的就在右栏里时不滚（不然它从鼠标底下跑掉）
function reveal(root, el, rows) {
  const body = root.querySelector(".goals .rail-body");
  if (!body || !el || body.contains(el)) return;
  const r = body.getBoundingClientRect(), top = r.top + 10, bottom = r.bottom - 10;
  let lo = Infinity, hi = -Infinity;
  for (const x of rows) {
    if (!body.contains(x)) continue;
    const b = x.getBoundingClientRect();
    lo = Math.min(lo, b.top); hi = Math.max(hi, b.bottom);
  }
  if (lo === Infinity || (lo >= top && hi <= bottom)) return;
  body.scrollBy({ top: hi - lo > bottom - top || lo < top ? lo - top : hi - bottom, behavior: still.matches ? "auto" : "smooth" });
}

// 原来就画着的：只挪位置（页面重画、滚动、窗口变了），不重飞。长短变得多了才换流光的节奏（换了会跳一下）
function move(x, e, g) {
  x.e = e; x.pts = g.pts;
  const m = x.g.querySelector("mask"), r = boundsOf(g.pts, 12), d = cOf(g.c), end = g.c.p3;
  m.setAttribute("x", fmt(r.x)); m.setAttribute("y", fmt(r.y)); m.setAttribute("width", fmt(r.w)); m.setAttribute("height", fmt(r.h));
  m.querySelector(".lk-rev")?.setAttribute("d", e.rev ? cRev(g.c) : d);
  x.g.querySelectorAll(".lk-t, .lk-sa, .lk-sb, .lk-sp").forEach((p) => p.setAttribute("d", d));
  const dot = x.g.querySelector(".lk-dot");
  dot.setAttribute("cx", fmt(end.x)); dot.setAttribute("cy", fmt(end.y));
  dot.classList.toggle("open", g.clip);
  if (Math.abs(g.len - x.len) > x.len * 0.2) { x.len = g.len; setStreak(x.g, g.len); }
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
  const rects = el.classList.contains("ns-g") ? el.getClientRects() : null;   // 框出来的词折行了：放在最后一截后面
  const b = boxOf(el), t = tail ? rectOf(tail) : rects?.length ? toPage(rects[rects.length - 1], layer.getBoundingClientRect()) : b;
  // 计划卡：上沿正中；框出来的词（夹在一段字中间）：右上角，不压后面的字；别的：字后面
  const p = el.classList.contains("pcard") ? { x: (b.l + b.r) / 2, y: b.t } : rects?.length ? { x: t.r, y: t.t } : { x: t.r + 10, y: (b.t + b.b) / 2 };
  handle.style.left = p.x + "px";
  handle.style.top = p.y + "px";
  handle.classList.add("on");
}

// ---------- 悬停 ----------

function open(key, el, kb = false) {
  clearTimeout(closeT); closeT = 0;
  cur = { key, el, kb };
  paint(key);
  if (kb) handle?.classList.remove("on");
  else placeHandle(el);
}

// 线收起来（now：马上拿掉，不淡出）
function clearLines(now) {
  const root = page();
  root?.classList.remove("lk-dim");
  root?.querySelectorAll(".lk-on, .lk-has").forEach((el) => el.classList.remove("lk-on", "lk-has"));
  if (root) { unfocusNorth(root); unfold(root, new Set(), null); }
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
const later = (ms = GRACE) => { if (!closeT) closeT = setTimeout(() => close(), ms); };
// 用鼠标选中的、在左边的：拿住
const held = () => Boolean(cur && !cur.kb && !cur.el.closest(".pj-rail"));

// 停在 key 上 ms 以后画它。still：离开始等的那一点挪远了 STILL 就从头等（路过的不算，要停住）；不然换了一个才从头等
function wait(key, n, ms, still) {
  if (key === want && (!still || Math.hypot(mx - wx, my - wy) <= STILL)) return;
  want = key; wx = mx; wy = my;
  clearTimeout(wantT);
  wantT = setTimeout(() => { want = ""; if (n.isConnected && onPage() && !drag) open(key, n); }, ms);
}

// 拿住的这一套占的那一片（页面坐标）：线的外框，加上它自己和亮着的那些，四周放宽 AREA
function within(px, py) {
  const pts = [...edges.values()].filter((x) => !x.gone).flatMap((x) => x.pts);
  for (const el of [cur.el, ...(page()?.querySelectorAll(".lk-on") || [])]) {
    const b = rectOf(el);
    if (b.r > b.l || b.b > b.t) pts.push({ x: b.l, y: b.t }, { x: b.r, y: b.b });
  }
  if (!pts.length) return false;
  const r = boundsOf(pts, AREA);
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

// 鼠标离一条线多远（页面坐标）
function distOf(x, px, py) {
  let d0 = Infinity;
  for (let i = 1; i < x.pts.length; i++) {
    const a = x.pts[i - 1], b = x.pts[i], vx = b.x - a.x, vy = b.y - a.y, len = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / len));
    d0 = Math.min(d0, Math.hypot(a.x + t * vx - px, a.y + t * vy - py));
  }
  return d0;
}
// 鼠标离哪条线最近（NEAR 以内）
function nearest(px, py) {
  let best = null, d0 = NEAR;
  for (const x of edges.values()) {
    if (x.gone) continue;
    const d = distOf(x, px, py);
    if (d < d0) { d0 = d; best = x; }
  }
  return best;
}
// 鼠标在哪条线那头的小圆点旁边（END 以内）。几条线接在同一个点上时挑离鼠标最近的那条——顺着哪条过来就是哪条，它会亮起来
function nearEnd(px, py) {
  let best = null, d0 = Infinity;
  for (const x of edges.values()) {
    if (x.gone || x.cutting) continue;
    const p = x.pts[x.pts.length - 1];
    if (Math.hypot(p.x - px, p.y - py) > END) continue;
    const d = distOf(x, px, py);
    if (d < d0) { d0 = d; best = x; }
  }
  return best;
}

// 「×」放在那条线那头小圆点的左边，那条线亮一点（.pick）；x 空 = 收起
function showCut(x) {
  svg?.querySelectorAll(".lk.pick").forEach((g) => { if (g !== x?.g) g.classList.remove("pick"); });
  if (!x) { cutX.classList.remove("on"); return; }
  const p = x.pts[x.pts.length - 1];
  cutX.style.left = (p.x - CUT_OFF) + "px";
  cutX.style.top = p.y + "px";
  cutX.dataset.id = x.e.id;
  cutX.classList.add("on");
  x.g.classList.add("pick");
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
  const hold = held();
  if (key) {
    // 停在选中的那个、或者拿住时停在连着的上面：线那头的小圆点就在这些东西的左边上，凑近了出「×」
    if (cur?.key === key || (hold && n.classList.contains("lk-on"))) { want = ""; clearTimeout(wantT); keep(); const o = layer.getBoundingClientRect(); showCut(nearEnd(mx - o.left, my - o.top)); return; }
    if (cutX) showCut(null);
    if (hold) wait(key, n, REST, true);
    else wait(key, n, DWELL, !n.closest(".pj-rail"));
    if (cur) keep();
    return;
  }
  want = ""; clearTimeout(wantT);
  if (!cur) return;
  const o = layer.getBoundingClientRect(), px = mx - o.left, py = my - o.top;
  const end = nearEnd(px, py);
  showCut(end);
  if (end || nearest(px, py) || (hold && within(px, py))) keep(); else later(hold ? HOLD : GRACE);
}

// 键盘：焦点落在目标、计划卡、项目的头（或它们里面的按钮）上，停一下就画；落到别的地方收起。正在改字的框不算
function onFocus(e) {
  if (drag || !onPage()) return;
  const t = e.target;
  if (t.matches?.("input, select, textarea, [contenteditable]")) return;
  const n = t.closest?.(NODE), key = n && n.closest(".projects") ? keyOf(n) : "";
  if (!key) { want = ""; clearTimeout(wantT); if (cur?.kb) close(); return; }
  if (cur?.key === key) return;
  want = key;
  clearTimeout(wantT);
  wantT = setTimeout(() => { want = ""; if (n.isConnected && onPage() && n.contains(document.activeElement)) open(key, n, true); }, DWELL);
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
  // 右栏展开（css：North star 那段放开、各段折起来的目标露出来），能连的才都看得到、放得上去。
  // 拖的那一条在右栏里：展开以后它会往下挪——把右栏往下滚同样多，它就留在手指底下
  const body = page()?.querySelector(".goals .rail-body"), top0 = el.getBoundingClientRect().top, scroll0 = body?.scrollTop || 0;
  page()?.classList.add("lk-drag");
  if (body?.contains(el)) body.scrollTop += el.getBoundingClientRect().top - top0;
  dragSvg = document.createElementNS(NS, "svg");
  dragSvg.setAttribute("class", "lk-drag-svg");
  dragSvg.setAttribute("aria-hidden", "true");
  dragSvg.innerHTML = '<g class="lk live"><mask id="lk-dm" maskUnits="userSpaceOnUse" x="-10" y="-10" width="' + (innerWidth + 20) + '" height="' + (innerHeight + 20) + '"><path class="lk-rev" pathLength="1"/></mask>' +
    '<g mask="url(#lk-dm)"><path class="lk-t"/><g class="lk-s"><path class="lk-sa" pathLength="1"/><path class="lk-sb" pathLength="1"/><path class="lk-sp" pathLength="1"/></g></g><circle class="lk-dot" r="3"/></g>';
  const live = dragSvg.querySelector(".lk");
  live.style.setProperty("--c", glow(colorOf(from)) || "var(--accent)");
  live.style.setProperty("--sl", ".22"); live.style.setProperty("--sg", String(RUN - 0.22)); live.style.setProperty("--sd", ".9s"); live.style.setProperty("--sdl", "0s"); live.style.setProperty("--hd", Math.round(((1.3 - 0.22) / RUN - 0.05) * 900) + "ms");
  document.body.appendChild(dragSvg);
  drag = { from, el, can, target: null, id: e.pointerId, x: e.clientX, y: e.clientY, raf: 0, body, scroll0 };
  handle.setPointerCapture(e.pointerId);
  handle.addEventListener("pointermove", dragMove);
  handle.addEventListener("pointerup", dragEnd);
  handle.addEventListener("pointercancel", dragEnd);
  dragMove(e);
}

// 屏幕坐标（这条线画在一层固定的 svg 上）
function screenBox(el) {
  const r = el.classList.contains("ns-g") ? el.getClientRects()[0] || el.getBoundingClientRect() : (el.classList.contains("pg-top") && el.querySelector("h3") || el).getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom };
}

function dragMove(e) {
  if (!drag) return;
  if (e.clientX !== undefined) { drag.x = e.clientX; drag.y = e.clientY; }
  const over = document.elementFromPoint(drag.x, drag.y)?.closest?.(NODE);
  const t = over && drag.can.has(over) ? over : null;
  if (t !== drag.target) { drag.target?.classList.remove("lk-snap"); t?.classList.add("lk-snap"); drag.target = t; }
  const to = t ? screenBox(t) : { l: drag.x - 1, t: drag.y - 1, r: drag.x + 1, b: drag.y + 1 };
  const c = curve(screenBox(drag.el), to, { rail: Boolean(t && drag.el.closest(".pj-rail") && t.closest(".pj-rail")) }), d = cOf(c);
  dragSvg.querySelectorAll(".lk-t, .lk-sa, .lk-sb, .lk-sp, .lk-rev").forEach((p) => p.setAttribute("d", d));
  const dot = dragSvg.querySelector(".lk-dot");
  dot.setAttribute("cx", fmt(c.p3.x)); dot.setAttribute("cy", fmt(c.p3.y));
  dragSvg.classList.toggle("snap", Boolean(t));
  autoScroll();
}

// 拖到右栏能滚的那一块的上下沿：它自己往那边滚（每帧一点，越靠边越快），滚着的时候线和吸附跟着重算
function autoScroll() {
  if (!drag || drag.raf) return;
  const body = page()?.querySelector(".goals .rail-body");
  if (!body) return;
  const r = body.getBoundingClientRect(), EDGE = 36;
  if (drag.x < r.left || drag.x > r.right) return;
  const v = drag.y < r.top + EDGE && drag.y > r.top - EDGE ? -(r.top + EDGE - drag.y) / 3 : drag.y > r.bottom - EDGE && drag.y < r.bottom + EDGE ? (drag.y - (r.bottom - EDGE)) / 3 : 0;
  if (!v) return;
  drag.raf = requestAnimationFrame(() => {
    if (!drag) return;
    drag.raf = 0;
    const before = body.scrollTop;
    body.scrollTop += clamp(v, -12, 12);
    if (body.scrollTop !== before) dragMove({});
  });
}

function dragEnd(e) {
  if (!drag) return;
  const { from, el, can, target: t, body, scroll0 } = drag;
  handle.removeEventListener("pointermove", dragMove);
  handle.removeEventListener("pointerup", dragEnd);
  handle.removeEventListener("pointercancel", dragEnd);
  if (handle.hasPointerCapture?.(drag.id)) handle.releasePointerCapture(drag.id);
  cancelAnimationFrame(drag.raf);
  drag = null;
  for (const n of can.keys()) n.classList.remove("lk-can", "lk-snap");
  el.classList.remove("lk-src");
  page()?.classList.remove("lk-drag");
  if (body?.isConnected) body.scrollTop = scroll0;   // 收回去：右栏回到拖之前的样子
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

// 拖着的时候页面重画了（同步拉下来之类）：元素都换了新的，按 key 重新找、重新标上能连的
function redrag() {
  const can = new Map(), keys = new Set(drag.can.values());
  for (const n of page()?.querySelectorAll(NODE) || []) { const k = keyOf(n); if (keys.has(k)) { can.set(n, k); n.classList.add("lk-can"); } }
  drag.can = can;
  drag.target = null;
  drag.el = elOf(drag.from, new Map()) || drag.el;
  drag.el.classList.add("lk-src");
  page()?.classList.add("lk-drag");
  dragMove({});
}

// 页面重画完（main.js 的 draw）：悬停中的按新的位置、新的链接再画一次（新连上的飞进来，断开的淡掉）
export function afterRender() {
  if (!layer && !cur) return;
  if (!onPage()) { close(true); return; }
  if (drag) { if (!drag.el.isConnected) redrag(); return; }
  if (!cur) return;
  const el = elOf(cur.key, new Map());
  if (!el) { close(true); return; }
  cur.el = el;
  paint(cur.key, { fly: !landing });
  if (!cur.kb) placeHandle(el);
  if (landing) { landing.remove(); landing = null; }
}

export function initLinks() {
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    mx = e.clientX; my = e.clientY; target = e.target;
    if (!queued) { queued = true; requestAnimationFrame(onMove); }
  }, { passive: true });
  // 点了别处、打字、换页：收起来（点的是把手、× 不算；左边拿住的，点它自己、点亮着的也不算——上面的按钮、输入框照样收）
  addEventListener("pointerdown", (e) => {
    const t = e.target;
    if (t.closest?.(".lk-ui")) return;
    if (held() && !t.closest?.("button, a, input, select, textarea, label, [contenteditable], [role=button], [data-act]") && (cur.el.contains(t) || t.closest?.(".lk-on"))) return;
    close();
  }, true);
  addEventListener("keydown", (e) => {
    if (drag && e.key === "Escape") { e.preventDefault(); dragEnd({ type: "cancel" }); return; }
    if (drag) return;
    // 用键盘走过来的：Tab 往下走交给 focusin（停到下一个上面就换成它的线），别的键收起
    if (cur?.kb && (e.key === "Tab" || e.key === "Shift")) return;
    close();
  }, true);
  addEventListener("focusin", onFocus);
  addEventListener("focusout", (e) => { if (cur?.kb && !page()?.contains(e.relatedTarget)) close(); });
  document.documentElement.addEventListener("mouseleave", () => { if (!drag) close(); });
  addEventListener("hashchange", () => close(true));
  // 窗口变了、滚动了（页面、右栏、North star 那段字）：每帧最多重算一次位置，不重新飞
  let raf = 0;
  const again = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (cur && !drag && onPage()) { paint(cur.key, { fly: false }); if (!cur.kb) placeHandle(cur.el); if (cutX) showCut(null); } }); };
  addEventListener("resize", again);
  addEventListener("scroll", () => { if (cur && !drag) again(); }, { passive: true, capture: true });
}
