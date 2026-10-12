// 目标板的纯计算（Projects 页最上面）。一条目标：
//   { id, text, tag, span: "month" | "quarter" | "year", due: "YYYY-MM"（打算哪个月做到）, done: "YYYY-MM"（实际哪个月做到，空 = 还没）, order }
// 栏目按「今天」现算：这个月、这个季度、下个季度、今年，再加今年之后的五年。时间走了栏目自己滚：
//   过期没做完的滚进同一种的当前栏（late，旁边写原定的月份）；做完的过了那一期就不再显示（showDone 才列出来）；
//   比最后一栏还远的先放在最后一栏（ahead）。

import { MONTHS } from "./dates.js";

export const SPANS = ["month", "quarter", "year"];
const pad = (n) => String(n).padStart(2, "0");
export const ymOf = (y, m) => y + "-" + pad(m);
const split = (s) => [Number(String(s).slice(0, 4)), Number(String(s).slice(5, 7)) || 1];
const quarter = (m) => Math.floor((m - 1) / 3) + 1;

// 一个时期排第几（同一种 span 里比先后用）
function slot(span, when) {
  const [y, m] = split(when);
  return span === "month" ? y * 12 + m - 1 : span === "quarter" ? y * 4 + quarter(m) - 1 : y;
}

// due = 在这一栏里新加的目标默认哪个月做到（这一期的最后一个月）
export function columns(today) {
  const [y, m] = split(today), q = quarter(m);
  const nq = q === 4 ? { y: y + 1, q: 1 } : { y, q: q + 1 };
  const cols = [
    { key: "month", span: "month", y, slot: y * 12 + m - 1, title: "This month", sub: MONTHS[m - 1], due: ymOf(y, m) },
    { key: "quarter", span: "quarter", y, slot: y * 4 + q - 1, title: "This quarter", sub: "Q" + q, due: ymOf(y, q * 3) },
    { key: "next", span: "quarter", y: nq.y, slot: y * 4 + q, title: "Next quarter", sub: "Q" + nq.q + (nq.y !== y ? " " + nq.y : ""), due: ymOf(nq.y, nq.q * 3) },
    { key: "year", span: "year", y, slot: y, title: "This year", sub: String(y), due: ymOf(y, 12) }
  ];
  for (let k = 1; k <= 5; k++) cols.push({ key: "y" + (y + k), span: "year", y: y + k, slot: y + k, title: String(y + k), sub: "", due: ymOf(y + k, 12), far: true });
  return cols;
}

// 「Dec」；不是这一栏那年的带上年份「Dec 2027」
export function whenText(when, colYear) {
  if (!when) return "";
  const [y, m] = split(when);
  return MONTHS[m - 1] + (y !== colYear ? " " + y : "");
}

// → { cols: [{...column, items: [{ goal, done, late, ahead, when }]}], hidden: 做完了、已经过期不显示的有几条 }
export function board(goals, today, { showDone = false } = {}) {
  const cols = columns(today).map((c) => ({ ...c, items: [] }));
  let hidden = 0;
  for (const g of goals) {
    const span = SPANS.includes(g.span) ? g.span : "year";
    const mine = cols.filter((c) => c.span === span), first = mine[0], last = mine[mine.length - 1];
    const s = slot(span, g.due || today), done = Boolean(g.done);
    let col = mine.find((c) => c.slot === s), late = false, ahead = false;
    if (!col && s < first.slot) {
      if (done && !showDone) { hidden++; continue; }
      col = first;
      late = !done;
    } else if (!col) { col = last; ahead = true; }
    col.items.push({ goal: g, done, late, ahead, when: whenText(done ? g.done : g.due, col.y) });
  }
  const key = (x) => (x.done ? "1" + x.goal.done : "0" + (x.goal.due || ""));
  for (const c of cols) c.items.sort((a, b) => key(a).localeCompare(key(b)) || (Number(a.goal.order) || 0) - (Number(b.goal.order) || 0));
  return { cols, hidden };
}

// 「Run a half marathon #Fitness」→ { text, tag }；没写 # 的 tag 是空
export function parseGoal(input) {
  const m = /^(.*?)(?:\s*#\s*([^#]*))?$/.exec(String(input || "").trim());
  return { text: (m[1] || "").trim(), tag: (m[2] || "").trim() };
}
