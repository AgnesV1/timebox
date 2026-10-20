// 目标板的纯计算（Projects 页最上面）。一条目标：
//   { id, text, tag, span: "month" | "quarter" | "year" | "north", due: "YYYY-MM"（打算哪个月做到）, done: "YYYY-MM"（实际哪个月做到，空 = 还没）, order,
//     up: 上级目标的 id（一条只有一个上级，可以一层层往上串）, by: ["g:项目名", "p:计划 id"]（哪些项目 / 计划为它服务，多对多） }
// 栏目按「今天」现算：这个月、这个季度、下个季度、今年，再加今年之后的四年，最后一栏 North star（没有日期）。时间走了栏目自己滚：
//   过期没做完的滚进同一种的当前栏（late，旁边写原定的月份）；做完的过了那一期就不再显示（showDone 才列出来）；
//   比最后一个年份还远的先放在那一年（ahead）。
// 对齐的链条：每天的任务 → 它的计划（没有计划就是它的项目）→ 服务的目标 → 上级 → 再上级……（见最下面的 chainsFor）

import { MONTHS } from "./dates.js";

export const SPANS = ["month", "quarter", "year", "north"];
export const YEARS_AHEAD = 4;
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
  for (let k = 1; k <= YEARS_AHEAD; k++) cols.push({ key: "y" + (y + k), span: "year", y: y + k, slot: y + k, title: String(y + k), sub: "", due: ymOf(y + k, 12), far: true });
  cols.push({ key: "north", span: "north", y: Infinity, slot: 0, title: "North star", sub: "", due: "", far: true });
  return cols;
}

// 「Dec」；不是这一栏那年的带上年份「Dec 2027」
export function whenText(when, colYear) {
  if (!when) return "";
  const [y, m] = split(when);
  return MONTHS[m - 1] + (y !== colYear ? " " + y : "");
}

// → { cols: [{...column, items: [{ goal, done, late, ahead, when }]}], hidden: 做完了、已经过期不显示的有几条 }
// 每一栏里：没做完的在前；再按标签排——rank(tag) 给的先后（项目的顺序：Build、Work、Friends…，没标签的最后）；同一个标签里早到期的在前
export function board(goals, today, { showDone = false, rank = () => 0 } = {}) {
  const cols = columns(today).map((c) => ({ ...c, items: [] }));
  let hidden = 0;
  for (const g of goals) {
    const span = SPANS.includes(g.span) ? g.span : "year";
    if (span === "north") { cols[cols.length - 1].items.push({ goal: g, done: Boolean(g.done), late: false, ahead: false, when: g.done ? whenText(g.done, 0) : "" }); continue; }
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
  const when = (x) => (x.done ? x.goal.done : x.goal.due) || "";
  for (const c of cols) c.items.sort((a, b) => a.done - b.done || rank(a.goal.tag) - rank(b.goal.tag) || when(a).localeCompare(when(b)) || (Number(a.goal.order) || 0) - (Number(b.goal.order) || 0));
  return { cols, hidden };
}

// 「Run a half marathon #Fitness」→ { text, tag }；没写 # 的 tag 是空
export function parseGoal(input) {
  const m = /^(.*?)(?:\s*#\s*([^#]*))?$/.exec(String(input || "").trim());
  return { text: (m[1] || "").trim(), tag: (m[2] || "").trim() };
}

// ---------- 链条：上级、下级、谁为它服务 ----------

const byId = (goals) => new Map(goals.map((g) => [g.id, g]));

// 从这条往上走：[这条, 上级, 上级的上级 …]。最多 8 层；绕回来了就停（存的数据被别处改乱了也不会死循环）
export function chainUp(goals, id) {
  const at = byId(goals), out = [], seen = new Set();
  for (let g = at.get(id); g && !seen.has(g.id) && out.length < 8; g = at.get(g.up)) { seen.add(g.id); out.push(g); }
  return out;
}

// 以这条为上级（一层层往下）的所有目标的 id：设上级时不能选它们，不然就连成环了
export function descendants(goals, id) {
  const out = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of goals) if (g.up && (g.up === id || out.has(g.up)) && !out.has(g.id) && g.id !== id) { out.add(g.id); grew = true; }
  }
  return out;
}
export const canParent = (goals, id, parentId) => !parentId || (parentId !== id && !descendants(goals, id).has(parentId));

// 链接的写法：项目 = "g:名字"，计划 = "p:id"
export const groupRef = (name) => "g:" + String(name || "").trim();
export const planRef = (id) => "p:" + id;
const refsOf = (g) => (Array.isArray(g.by) ? g.by : []);
export const servedBy = (goals, ref) => goals.filter((g) => refsOf(g).includes(ref));

// 一个任务 / 计划服务哪些目标：计划自己连了的用计划的；计划没连（或者直接挂在项目上的任务）用它项目的
export function goalsFor(goals, { planId = "", group = "" } = {}) {
  const viaPlan = planId ? servedBy(goals, planRef(planId)) : [];
  return viaPlan.length ? viaPlan : group ? servedBy(goals, groupRef(group)) : [];
}

// 每个目标往上的整条链：[[目标, 上级, …], …]；同样的链只留一条，一条链是另一条的前半截的也去掉
export function chainsFor(goals, list) {
  const chains = list.map((g) => chainUp(goals, g.id)).filter((c) => c.length);
  const key = (c) => c.map((g) => g.id).join(">");
  const keys = chains.map(key);
  return chains.filter((c, i) => keys.indexOf(key(c)) === i && !keys.some((k, j) => j !== i && k.length > keys[i].length && k.endsWith(">" + keys[i])));
}
