// 目标板的纯计算（Projects 页最上面）。一条目标：
//   { id, text, tag, span: "month" | "quarter" | "year" | "north", due: "YYYY-MM"（打算哪个月做到）, done: "YYYY-MM"（实际哪个月做到，空 = 还没）, order,
//     up: 上级目标的 id（一条只有一个上级，可以一层层往上串）, by: ["g:项目名", "p:计划 id"]（哪些项目 / 计划为它服务，多对多） }
// 栏目按「今天」现算：这个月、这个季度、下个季度、今年，再加明年（Next year）和之后三年，最后一栏 North star（没有日期）。时间走了栏目自己滚：
//   那一期过去了的目标（isOld，做没做完都一样）不再进栏，收进最底下的「往期」（past，按季度看，她 2026-10 定的）；
//   连线和「For …」链条也越过它们，接到往上第一条还在的（visibleSet / lift）。比最后一个年份还远的先放在那一年（ahead）。
// 对齐的链条：每天的任务 → 它的计划（没有计划就是它的项目）→ 服务的目标 → 上级 → 再上级……（见最下面的 chainsFor）

import { MONTHS } from "./dates.js";

export const SPANS = ["month", "quarter", "year", "north"];
const spanOf = (g) => (SPANS.includes(g?.span) ? g.span : "year");
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
  // 明年叫 Next year（小字写年份），再往后三年直接写年份：今年是 2026 就是 Next year 2027 → 2028 → 2029 → 2030
  for (let k = 1; k <= YEARS_AHEAD; k++) cols.push({ key: "y" + (y + k), span: "year", y: y + k, slot: y + k, title: k === 1 ? "Next year" : String(y + k), sub: k === 1 ? String(y + 1) : "", due: ymOf(y + k, 12), far: true });
  cols.push({ key: "north", span: "north", y: Infinity, slot: 0, title: "North star", sub: "", due: "", far: true });
  return cols;
}

// 「Dec」；不是这一栏那年的带上年份「Dec 2027」
export function whenText(when, colYear) {
  if (!when) return "";
  const [y, m] = split(when);
  return MONTHS[m - 1] + (y !== colYear ? " " + y : "");
}

// 过期了没有：月 / 季 / 年目标，它那一期已经过去了（这个月的月目标、这一季的季目标、今年的年目标都还不算）。North star、没写期限的永远不过期
export function isOld(g, today) {
  const span = spanOf(g);
  return span !== "north" && Boolean(g?.due) && slot(span, g.due) < slot(span, today);
}

// → { cols: [{...column, items: [{ goal, done, ahead, when }]}], old: 过期了、收进往期的有几条 }
// 每一栏里：没做完的在前；再按标签排——rank(tag) 给的先后（项目的顺序：Build、Work、Friends…，没标签的最后）；同一个标签里早到期的在前
export function board(goals, today, { rank = () => 0 } = {}) {
  const cols = columns(today).map((c) => ({ ...c, items: [] }));
  let old = 0;
  for (const g of goals) {
    const span = spanOf(g);
    if (span === "north") { cols[cols.length - 1].items.push({ goal: g, done: Boolean(g.done), ahead: false, when: g.done ? whenText(g.done, 0) : "" }); continue; }
    if (isOld(g, today)) { old++; continue; }
    const mine = cols.filter((c) => c.span === span), last = mine[mine.length - 1];
    const s = slot(span, g.due || today), done = Boolean(g.done);
    let col = mine.find((c) => c.slot === s), ahead = false;
    if (!col) { col = last; ahead = true; }
    col.items.push({ goal: g, done, ahead, when: whenText(done ? g.done : g.due, col.y) });
  }
  const when = (x) => (x.done ? x.goal.done : x.goal.due) || "";
  for (const c of cols) c.items.sort((a, b) => a.done - b.done || rank(a.goal.tag) - rank(b.goal.tag) || when(a).localeCompare(when(b)) || (Number(a.goal.order) || 0) - (Number(b.goal.order) || 0));
  return { cols, old };
}

// 往期：过期的月 / 季目标按期限落进季度（2026 Q3）；每一季带上那一年的年度目标（看的是「当时」那一年的，今年的也带上）；
// 更早的年份只有年度目标、一个季度都没落进来的，放在那年的 Q4。新的在前。
// → [{ key: "2026-3", label: "2026 Q3", y, q, year: [目标], quarter: [目标], months: [{ m, label: "Jul", items: [目标] }] }]
export function past(goals, today) {
  const at = new Map();
  const get = (y, q) => {
    const k = y + "-" + q;
    if (!at.has(k)) at.set(k, { key: k, label: y + " Q" + q, y, q, quarter: [], months: new Map() });
    return at.get(k);
  };
  const old = goals.filter((g) => isOld(g, today));
  for (const g of old) {
    const [y, m] = split(g.due), span = spanOf(g);
    if (span === "month") { const x = get(y, quarter(m)); if (!x.months.has(m)) x.months.set(m, []); x.months.get(m).push(g); }
    else if (span === "quarter") get(y, quarter(m)).quarter.push(g);
  }
  for (const g of old) if (spanOf(g) === "year") { const y = split(g.due)[0]; if (![...at.values()].some((x) => x.y === y)) get(y, 4); }
  const byDue = (a, b) => String(a.due).localeCompare(String(b.due)) || (Number(a.order) || 0) - (Number(b.order) || 0);
  const years = goals.filter((g) => spanOf(g) === "year" && g.due);
  return [...at.values()].sort((a, b) => b.y - a.y || b.q - a.q).map((x) => ({
    key: x.key, label: x.label, y: x.y, q: x.q,
    year: years.filter((g) => split(g.due)[0] === x.y).sort(byDue),
    quarter: x.quarter.sort(byDue),
    months: [...x.months].sort((a, b) => a[0] - b[0]).map(([m, items]) => ({ m, label: MONTHS[m - 1], items: items.sort(byDue) }))
  }));
}

// 「Run a half marathon #Fitness」→ { text, tag }；没写 # 的 tag 是空
export function parseGoal(input) {
  const m = /^(.*?)(?:\s*#\s*([^#]*))?$/.exec(String(input || "").trim());
  return { text: (m[1] || "").trim(), tag: (m[2] || "").trim() };
}

// ---------- 链条：上级、下级、谁为它服务 ----------

const byId = (goals) => new Map(goals.map((g) => [g.id, g]));

// 从这条往上走：[这条, 上级, 上级的上级 …]。最多 8 层；绕回来了就停（存的数据被别处改乱了也不会死循环）。
// 给了 vis（还看得见的那些 id，见 visibleSet）：收进往期的那几层跳过去，接着往上走
export function chainUp(goals, id, vis = null) {
  const at = byId(goals), out = [], seen = new Set();
  for (let g = at.get(id); g && !seen.has(g.id) && out.length < 8 && seen.size < 24; g = at.get(g.up)) { seen.add(g.id); if (!vis || vis.has(g.id)) out.push(g); }
  return out;
}

// 还在上面那几段（或 North star）里的目标：没过期的
export const visibleSet = (goals, today) => new Set(goals.filter((g) => !isOld(g, today)).map((g) => g.id));
// 越过收掉的：自己还看得见就是自己，不然往上找第一条看得见的（绕回来就停）；一条都没有 = null
export function lift(goals, id, vis, at = byId(goals)) {
  const seen = new Set();
  for (let g = at.get(id); g && !seen.has(g.id) && seen.size < 24; g = at.get(g.up)) { seen.add(g.id); if (vis.has(g.id)) return g; }
  return null;
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

// 一个任务 / 计划服务哪些目标：计划自己连了的用计划的；计划没连（或者直接挂在项目上的任务）用它项目的。
// 给了 vis：连着的目标收进往期了，就算到它往上第一条还在的（去重）；计划连的全都收掉了、往上也没有，就当它没连、用它项目的
export function goalsFor(goals, { planId = "", group = "" } = {}, vis = null) {
  const at = vis ? byId(goals) : null;
  const up = (list) => {
    if (!vis) return list;
    const out = [];
    for (const g of list) { const x = lift(goals, g.id, vis, at); if (x && !out.includes(x)) out.push(x); }
    return out;
  };
  const viaPlan = planId ? up(servedBy(goals, planRef(planId))) : [];
  return viaPlan.length ? viaPlan : group ? up(servedBy(goals, groupRef(group))) : [];
}

// 每个目标往上的整条链：[[目标, 上级, …], …]；同样的链只留一条，一条链是另一条的前半截的也去掉（vis：跳过收进往期的）
export function chainsFor(goals, list, vis = null) {
  const chains = list.map((g) => chainUp(goals, g.id, vis)).filter((c) => c.length);
  const key = (c) => c.map((g) => g.id).join(">");
  const keys = chains.map(key);
  return chains.filter((c, i) => keys.indexOf(key(c)) === i && !keys.some((k, j) => j !== i && k.length > keys[i].length && k.endsWith(">" + keys[i])));
}

// ---------- North star 那一段字 ----------
// Projects 页右栏最上面是一段长文字（存在 Settings 的 north-star），[方括号] 里的每个词就是一条 North star 目标
// （span: "north"，还是 goal:<id> 那一行，所以上级、服务这些链接都不用改）。括号本身只在改字的时候看得到。

const plain = (t) => String(t || "").replace(/[[\]]/g, "").replace(/\s+/g, " ").trim();

// 文字里框出来的词，按先后：[{ text, start, end }]（start / end 含括号）。空括号、没配对的括号、跨行的不算
export function parseNorth(text) {
  const out = [], re = /\[([^[\]\n]*)\]/g, s = String(text ?? "");
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const t = plain(m[1]);
    if (t) out.push({ text: t, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// 每个词对上哪条 North star 目标：先找字一模一样的，剩下的按先后对上（改了措辞还是原来那条，链接不丢）。
// → { ids: [目标 id，对不上 = ""（要新建）], left: [文字里已经没有了的目标] }
export function matchNorth(phrases, north) {
  const ids = phrases.map(() => ""), used = new Set();
  phrases.forEach((p, i) => {
    const g = north.find((x) => !used.has(x.id) && plain(x.text) === p.text);
    if (g) { ids[i] = g.id; used.add(g.id); }
  });
  const rest = north.filter((g) => !used.has(g.id));
  phrases.forEach((p, i) => { if (!ids[i] && rest.length) { const g = rest.shift(); ids[i] = g.id; used.add(g.id); } });
  return { ids, left: north.filter((g) => !used.has(g.id)) };
}

// 悬停画线时，连着的词被 North star 那个三行的框挡住了：框里暂时只放「重点」（js/ui/links.js 的 focusNorth）。
// keep = 要留的词（parseNorth 的下标）；level：
//   "sentence" = 带着这些词的那几句；"clause" = 那几小段（按逗号、冒号切；破折号不切，它常常就是引出那个词的），
//   pad = 每一小段再往前多带几段（前文比后文更能说明这个词是什么）；"word" = 只列这几个词（她说连着两三个词的时候就这样）。
// 不会切在框里面（框里的词可以带逗号）。返回一段段：{ text }（原文，空白收成一个空格）、{ i }（第几个词，框里的别的词也照样给）、
//   { gap: true }（省掉的地方，画成 …）、{ sep: true }（只列词时词和词之间，画成 ·）
const SENTENCE = /[.!?;]+["'”’)]*\s+|[。！？；]+["'”’）」]*|\n+/g;
const CLAUSE = /[.!?;,:]+["'”’)]*\s+|[。！？；，、：]+["'”’）」]*|\n+/g;
export function northFocus(text, phrases, keep, level = "sentence", pad = 0) {
  const s = String(text ?? ""), want = [...new Set(keep)].filter((i) => phrases[i]).sort((a, b) => a - b);
  if (!want.length) return [];
  if (level === "word") return want.flatMap((i, k) => (k ? [{ sep: true }, { i }] : [{ i }]));
  const inside = (at) => phrases.some((p) => at > p.start && at < p.end);
  const cuts = [0];
  for (const m of s.matchAll(level === "clause" ? CLAUSE : SENTENCE)) {
    const at = m.index + m[0].length;
    if (!inside(m.index) && at > cuts[cuts.length - 1] && at < s.length) cuts.push(at);
  }
  cuts.push(s.length);
  const units = cuts.slice(0, -1).map((a, k) => ({ a, b: cuts[k + 1] }));
  const kept = units.map(() => false);
  units.forEach((u, k) => {
    if (want.some((i) => phrases[i].start >= u.a && phrases[i].start < u.b)) for (let j = Math.max(0, k - pad); j <= k; j++) kept[j] = true;
  });
  // 挨着的几段连成一截；截和截之间、开头结尾省掉的地方是 …
  const runs = [];
  kept.forEach((on, k) => {
    if (!on) return;
    const last = runs[runs.length - 1];
    if (last && last.to === k - 1) last.to = k;
    else runs.push({ from: k, to: k });
  });
  const out = [];
  runs.forEach((r, n) => {
    const a = units[r.from].a, b = units[r.to].b, before = n > 0 || r.from > 0, after = r.to < units.length - 1;
    const part = [];
    let at = a;
    phrases.forEach((p, i) => { if (p.start >= a && p.start < b) { part.push({ text: s.slice(at, p.start) }, { i }); at = p.end; } });
    part.push({ text: s.slice(at, b) });
    for (const x of part) if (x.text !== undefined) x.text = x.text.replace(/\s+/g, " ");
    part[0].text = part[0].text?.replace(/^\s+/, "") ?? part[0].text;
    const end = part[part.length - 1];
    end.text = end.text.replace(after ? /[\s,，、:：;；—–-]+$/ : /\s+$/, "");
    if (before) out.push({ gap: true });
    out.push(...part.filter((x) => x.text === undefined || x.text));
    if (after && n === runs.length - 1) out.push({ gap: true });
  });
  return out;
}

// 这一段该显示（和打开来改）的字：存过的那段；没存过就用现有的 North star 目标一条一行拼起来。
// 文字里对不上的目标（别的设备上新加的、从年份那栏搬过来的）补在最后，一条都不藏
export function northText(stored, goals) {
  const north = goals.filter((g) => g.span === "north");
  const line = (g) => "[" + plain(g.text) + "]";
  if (typeof stored !== "string") return north.map(line).join("\n");
  const { left } = matchNorth(parseNorth(stored), north);
  return left.length ? (stored ? stored + "\n" : "") + left.map(line).join("\n") : stored;
}
