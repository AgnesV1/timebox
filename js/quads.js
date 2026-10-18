// 今天页的四象限便签（电脑）：只算数，不碰页面和存储（存储在 js/store/quads.js，页面在 js/ui/quads.js）。
// 四格：do = 紧急又重要（左上）、plan = 重要不紧急（右上）、quick = 紧急不重要（左下）、drop = 都不紧急也不重要（右下）。
// 一张便签 = { id, text, q, order, done }：order 只在同一格里比大小；done = 打过勾（划掉，一直留着）。

export const QS = ["do", "plan", "quick", "drop"];
export const MAX = 120;   // 一张最多几个字
const STEP = 1024;

export const qOf = (q) => (QS.includes(q) ? q : "do");
export const clean = (text) => String(text || "").replace(/\s+/g, " ").trim().slice(0, MAX);
const num = (n) => Number(n.order) || 0;
const byOrder = (a, b) => num(a) - num(b) || String(a.id).localeCompare(String(b.id));

// 四格各自排好的便签
export function board(list) {
  const out = Object.fromEntries(QS.map((q) => [q, []]));
  for (const n of list) out[qOf(n.q)].push(n);
  for (const q of QS) out[q].sort(byOrder);
  return out;
}

// 把 id 放进这一格、排在 before 前面（before 空 = 放到最后）→ 要改哪几张的 order：[{ id, order }]。
// 一般只改它自己（取前后两张中间的数，同步时只推这一行）；前后两张挨得分不开了，就整格重新编号
export function place(cells, id, before, now = Date.now()) {
  const rest = cells.filter((n) => n.id !== id);
  let i = before ? rest.findIndex((n) => n.id === before) : -1;
  if (i < 0) i = rest.length;
  const prev = rest[i - 1], next = rest[i];
  const order = !prev && !next ? now : !prev ? num(next) - STEP : !next ? num(prev) + STEP : (num(prev) + num(next)) / 2;
  if ((!prev || order > num(prev)) && (!next || order < num(next))) return [{ id, order }];
  return [...rest.slice(0, i), { id }, ...rest.slice(i)].map((n, k) => ({ id: n.id, order: (k + 1) * STEP }));
}
