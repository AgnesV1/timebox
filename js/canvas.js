// Obsidian 的白板（.canvas 文件，开放的 JSON Canvas 1.0 格式：https://jsoncanvas.org）→ 苦昼短里能存、能画的样子。纯计算，不碰页面。
// 两个地方用：Mindmap 页（随便几块白板，她画思维导图用的，js/ui/boards.js），和 Projects 页最下面的生态圈（js/ui/eco.js，取代了原来的 North star 那段字）。
// 一个白板：{ nodes: [{ id, type: text|file|link|group, x, y, width, height, color?, text? file? url? label? }],
//            edges: [{ id, fromNode, fromSide?, fromEnd?, toNode, toSide?, toEnd?, color?, label? }] }
// 颜色：「1」~「6」是 Obsidian 自带的六种（红、橙、黄、绿、青、紫），也可以直接是 #rrggbb。
//
// 生态圈的规矩（她 2026-11-26 贴的图：中间一个蓄水池，四周几块，线上写着「进水 10%」「主线 55%」）：
//   字里带「蓄水池 / 水池 / 水库 / reservoir / pool / tank」的那块是蓄水池，字里的「78%」是水位（现在先手填，以后从记的时间算）；
//   线是哪一种看线上写的字（中文英文都认），没写字就看颜色：
//     laser 主线（Laser Beam，主输出）、synergy 协同、inflow 进水 / 回血、baseline 保底（低摩擦）、leak 过载漏水；
//   线上写的第一个百分数是它的份额。连着线的那几块（蓄水池除外）就是最上面那一层目标（span: north），往下的目标、计划都能连到它们。

export const SIDES = ["top", "right", "bottom", "left"];
const NODE_TYPES = ["text", "file", "link", "group"];
const MAX_NODES = 2000, MAX_EDGES = 4000;

const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
const str = (v, max = 20000) => (typeof v === "string" ? v.slice(0, max) : "");
const colorOk = (c) => (typeof c === "string" && (/^[1-6]$/.test(c) || /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c)) ? c : "");

// 读一个 .canvas 文件的字 → 白板（只留画得出来的字段，数取整，没用的丢掉，存进表格时省地方）。读不懂就抛错，错误的话给人看
export function parseCanvas(text) {
  let raw;
  try { raw = JSON.parse(String(text || "").replace(/^﻿/, "")); } catch { throw new Error("That file isn't an Obsidian canvas (it isn't JSON)."); }
  if (!raw || typeof raw !== "object" || (!Array.isArray(raw.nodes) && !Array.isArray(raw.edges))) throw new Error("That file isn't an Obsidian canvas (no nodes or edges).");
  return compact(raw);
}

export function compact(raw) {
  const nodes = [], seen = new Set();
  for (const n of (Array.isArray(raw?.nodes) ? raw.nodes : []).slice(0, MAX_NODES)) {
    if (!n || typeof n !== "object" || !n.id || seen.has(String(n.id))) continue;
    const type = NODE_TYPES.includes(n.type) ? n.type : "text";
    const o = { id: String(n.id).slice(0, 64), type, x: num(n.x), y: num(n.y), width: Math.max(1, num(n.width) || 250), height: Math.max(1, num(n.height) || 60) };
    if (colorOk(n.color)) o.color = colorOk(n.color);
    if (type === "text") o.text = str(n.text);
    else if (type === "file") { o.file = str(n.file, 500); if (typeof n.subpath === "string") o.subpath = str(n.subpath, 200); }
    else if (type === "link") o.url = str(n.url, 2000);
    else if (type === "group" && typeof n.label === "string") o.label = str(n.label, 200);
    seen.add(o.id);
    nodes.push(o);
  }
  const edges = [];
  for (const e of (Array.isArray(raw?.edges) ? raw.edges : []).slice(0, MAX_EDGES)) {
    if (!e || typeof e !== "object" || !seen.has(String(e.fromNode)) || !seen.has(String(e.toNode))) continue;
    const o = { id: String(e.id || e.fromNode + ">" + e.toNode).slice(0, 64), fromNode: String(e.fromNode), toNode: String(e.toNode) };
    if (SIDES.includes(e.fromSide)) o.fromSide = e.fromSide;
    if (SIDES.includes(e.toSide)) o.toSide = e.toSide;
    if (e.fromEnd === "arrow") o.fromEnd = "arrow";
    if (e.toEnd === "none") o.toEnd = "none";
    if (colorOk(e.color)) o.color = colorOk(e.color);
    if (typeof e.label === "string" && e.label.trim()) o.label = str(e.label, 300);
    edges.push(o);
  }
  // 分组画在最底下（Obsidian 也是：组是一块底色，卡片压在上面）
  nodes.sort((a, b) => (a.type === "group" ? 0 : 1) - (b.type === "group" ? 0 : 1));
  return { nodes, edges };
}

// 文件名 → 白板的名字（「Life map.canvas」→「Life map」，路径去掉）
export const nameOf = (file) => String(file || "").split(/[\\/]/).pop().replace(/\.canvas$/i, "").trim() || "Untitled";

// 整块白板占多大：{ x, y, w, h }（空的给 0 0 1 1）
export function bounds(canvas, pad = 0) {
  const ns = canvas?.nodes || [];
  if (!ns.length) return { x: 0, y: 0, w: 1, h: 1 };
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const n of ns) { l = Math.min(l, n.x); t = Math.min(t, n.y); r = Math.max(r, n.x + n.width); b = Math.max(b, n.y + n.height); }
  return { x: l - pad, y: t - pad, w: r - l + pad * 2, h: b - t + pad * 2 };
}

// ---------- 线怎么走（和 Obsidian 一样：从边的中点出去，两头顺着边的法线方向，中间一道三次贝塞尔） ----------

const NORMAL = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
export function anchor(n, side) {
  const cx = n.x + n.width / 2, cy = n.y + n.height / 2;
  return side === "top" ? { x: cx, y: n.y } : side === "bottom" ? { x: cx, y: n.y + n.height } : side === "left" ? { x: n.x, y: cy } : { x: n.x + n.width, y: cy };
}

// 没写从哪边出去：朝着对方的那一边（横着隔得远就左右，不然上下）
export function sideToward(a, b) {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2), dy = b.y + b.height / 2 - (a.y + a.height / 2);
  const gapX = Math.abs(dx) - (a.width + b.width) / 2, gapY = Math.abs(dy) - (a.height + b.height) / 2;
  if (gapX > gapY) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

const bez = (p0, c1, c2, p3, t) => { const u = 1 - t; return { x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y }; };
const r1 = (v) => Math.round(v * 10) / 10;

// → { d（SVG 的路径）, mid（写字的地方）, p0, p3, a0 / a3（两头的箭头朝哪：弧度，指向线外）}。bend = 弯多少（生态圈用小一点，接近直线）
export function edgeGeo(from, to, e = {}, { bend = 1 } = {}) {
  const fs = e.fromSide || sideToward(from, to), ts = e.toSide || sideToward(to, from);
  const p0 = anchor(from, fs), p3 = anchor(to, ts);
  const dist = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const k = Math.max(24, Math.min(160, dist * 0.45)) * bend;
  const c1 = { x: p0.x + NORMAL[fs][0] * k, y: p0.y + NORMAL[fs][1] * k }, c2 = { x: p3.x + NORMAL[ts][0] * k, y: p3.y + NORMAL[ts][1] * k };
  const mid = bez(p0, c1, c2, p3, 0.5);
  const d = "M" + r1(p0.x) + " " + r1(p0.y) + "C" + r1(c1.x) + " " + r1(c1.y) + " " + r1(c2.x) + " " + r1(c2.y) + " " + r1(p3.x) + " " + r1(p3.y);
  // 箭头顺着最后那一小段的方向；控制点和端点重合（bend 很小）时退回到两头连线的方向
  const dir = (a, b) => (Math.hypot(b.x - a.x, b.y - a.y) > 0.5 ? Math.atan2(b.y - a.y, b.x - a.x) : null);
  const a3 = dir(bez(p0, c1, c2, p3, 0.96), p3) ?? dir(p0, p3) ?? 0, a0 = dir(bez(p0, c1, c2, p3, 0.04), p0) ?? (a3 + Math.PI);
  return { d, mid: { x: r1(mid.x), y: r1(mid.y) }, p0, p3, a0, a3, len: dist };
}

// 箭头：尖在 p，朝 angle 的方向，长 s
export function arrowPath(p, angle, s = 9) {
  const w = s * 0.55, bx = p.x - Math.cos(angle) * s, by = p.y - Math.sin(angle) * s, nx = -Math.sin(angle) * w, ny = Math.cos(angle) * w;
  return "M" + r1(p.x) + " " + r1(p.y) + "L" + r1(bx + nx) + " " + r1(by + ny) + "L" + r1(bx - nx) + " " + r1(by - ny) + "Z";
}

// 白板的颜色 → css：六种预设用 css 里的 --cv1 ~ --cv6（白天、夜里各一套），#hex 原样
export const cssColor = (c) => (!c ? "" : /^[1-6]$/.test(c) ? "var(--cv" + c + ")" : c);

// ---------- 卡片上的字：Obsidian 的 Markdown，挑常用的画（标题、列表、勾选、粗斜体、删除线、高亮、行内代码、链接、[[双链]]）----------

const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^(https?:|mailto:|obsidian:)/i.test(u) ? u : "");

// 一行里的：先整体转义，再在转义过的字上换（链接的地址也是转义过的，放进 href 正好）
export function inline(s) {
  let h = escH(s);
  const codes = [];
  h = h.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
  h = h.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (m, f) => '<span class="md-file">' + f.split("/").pop() + "</span>");
  h = h.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<span class="md-wl">$2</span>').replace(/\[\[([^\]]+)\]\]/g, (m, f) => '<span class="md-wl">' + f.split("#")[0].split("/").pop() + "</span>");
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => { const url = safeUrl(u.replace(/&amp;/g, "&")); return url ? '<a href="' + escH(url) + '" target="_blank" rel="noopener">' + t + "</a>" : t; });
  h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/__([^_]+)__/g, "<b>$1</b>");
  h = h.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<i>$2</i>").replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, "$1<i>$2</i>");
  h = h.replace(/~~([^~]+)~~/g, "<s>$1</s>").replace(/==([^=]+)==/g, "<mark>$1</mark>");
  return h.replace(/\u0000(\d+)\u0000/g, (m, i) => "<code>" + codes[Number(i)] + "</code>");
}

// 一张卡的字 → HTML（每行一块；空行留一点空）
export function md(text) {
  const out = [];
  let fence = false, code = [];
  for (const line of String(text ?? "").replace(/\r/g, "").split("\n")) {
    if (/^\s*```/.test(line)) {
      if (fence) { out.push('<pre class="md-pre">' + escH(code.join("\n")) + "</pre>"); code = []; }
      fence = !fence;
      continue;
    }
    if (fence) { code.push(line); continue; }
    let m;
    if (!line.trim()) out.push('<div class="md-gap"></div>');
    else if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) out.push('<div class="md-h md-h' + m[1].length + '">' + inline(m[2]) + "</div>");
    else if ((m = /^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$/.exec(line))) out.push('<div class="md-li md-task' + (m[2] === " " ? "" : " done") + '" style="--in:' + indent(m[1]) + '"><i aria-hidden="true">' + (m[2] === " " ? "☐" : "☑") + "</i>" + inline(m[3]) + "</div>");
    else if ((m = /^(\s*)[-*+]\s+(.*)$/.exec(line))) out.push('<div class="md-li" style="--in:' + indent(m[1]) + '"><i aria-hidden="true">•</i>' + inline(m[2]) + "</div>");
    else if ((m = /^(\s*)(\d+[.)])\s+(.*)$/.exec(line))) out.push('<div class="md-li" style="--in:' + indent(m[1]) + '"><i aria-hidden="true">' + m[2] + "</i>" + inline(m[3]) + "</div>");
    else if ((m = /^>\s?(.*)$/.exec(line))) out.push('<div class="md-q">' + inline(m[1]) + "</div>");
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) out.push('<hr class="md-hr">');
    else out.push("<div>" + inline(line) + "</div>");
  }
  if (fence && code.length) out.push('<pre class="md-pre">' + escH(code.join("\n")) + "</pre>");
  return out.join("");
}
const indent = (ws) => Math.min(6, Math.floor(String(ws).replace(/\t/g, "  ").length / 2));

// 卡片字里的纯文字（去掉 Markdown 的记号）：生态圈拿第一行当目标的名字
export function plain(line) {
  return String(line ?? "").replace(/^\s*#{1,6}\s+/, "").replace(/^\s*[-*+]\s+/, "").replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/(\*\*|__|~~|==|`)/g, "").replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$)/g, "$1$2").trim();
}

// ---------- 生态圈 ----------

export const KINDS = ["laser", "synergy", "inflow", "baseline", "leak"];
const WORDS = [
  ["laser", /laser|主线|主输出|主火|主攻|main/i],
  ["leak", /漏水|过载|漏|leak|overload|drain/i],
  ["baseline", /保底|低摩擦|底线|baseline|floor|safety/i],
  ["inflow", /进水|回血|补给|充电|inflow|recharge|refill/i],
  ["synergy", /协同|互哺|联动|synergy|co-?op|together/i]
];
// 没写字的线看颜色：红 = 漏水、绿 = 进水、青 / 紫 = 主线、黄 / 橙 = 保底；没颜色 = 协同
const BY_COLOR = { 1: "leak", 2: "baseline", 3: "baseline", 4: "inflow", 5: "laser", 6: "laser" };

// 一条线是哪一种、占多少：{ kind, pct（没写就是 null） }
export function flowOf(e) {
  const label = String(e?.label || "");
  const hit = WORDS.find(([, re]) => re.test(label));
  const kind = hit ? hit[0] : BY_COLOR[e?.color] || "synergy";
  const m = /(\d+(?:\.\d+)?)\s*%/.exec(label);
  return { kind, pct: m ? Number(m[1]) : null };
}

const POOL_RE = /蓄水池|水池|水库|reservoir|\bpool\b|\btank\b/i;
export const isPool = (n) => n?.type === "text" && POOL_RE.test(String(n.text || ""));

// 一块的字 → { title, sub, level }：第一行（不算「78%」那种只有百分数的行）是名字，剩下的是小字；level = 字里的百分数（蓄水池的水位）
export function partsOf(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  let level = null;
  const rest = [];
  for (const l of lines) {
    const m = /^(\d+(?:\.\d+)?)\s*%$/.exec(plain(l));
    if (m && level === null) level = Number(m[1]);
    else rest.push(l);
  }
  if (level === null) { const m = /(\d+(?:\.\d+)?)\s*%/.exec(lines.join(" ")); if (m) level = Number(m[1]); }
  return { title: plain(rest[0] || ""), sub: rest.slice(1).map(plain).filter(Boolean).join(" · "), level };
}

// 拿来当目标的名字：去掉前面的序号（「2. 丰富体验」→「丰富体验」），比较时空格、大小写不算
export const goalText = (text) => partsOf(text).title.replace(/^\s*\d+\s*[.、)）]\s*/, "").trim();
export const sameText = (a, b) => String(a).replace(/\s+/g, " ").trim().toLowerCase() === String(b).replace(/\s+/g, " ").trim().toLowerCase();

// 生态圈里的几块：{ pool: 蓄水池那块 | null, members: 连着线的那几块（文字卡、不是蓄水池）, notes: 别的（没连线的说明文字、文件、链接、组）}
export function ecoParts(canvas) {
  const linked = new Set((canvas?.edges || []).flatMap((e) => [e.fromNode, e.toNode]));
  let pool = null;
  const members = [], notes = [];
  for (const n of canvas?.nodes || []) {
    if (!pool && isPool(n)) pool = n;
    else if (n.type === "text" && linked.has(n.id) && goalText(n.text)) members.push(n);
    else notes.push(n);
  }
  return { pool, members, notes };
}

// 一个生态圈里出现了哪几种线（图例只列这些，按固定的顺序）
export const kindsIn = (canvas) => KINDS.filter((k) => (canvas?.edges || []).some((e) => flowOf(e).kind === k));
