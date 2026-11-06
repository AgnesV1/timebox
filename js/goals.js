// 目标板的纯计算（Projects 页最上面）。一条目标：
//   { id, text, tag, span: "month" | "quarter" | "year" | "north", due: "YYYY-MM"（打算哪个月做到）, done: "YYYY-MM"（实际哪个月做到，空 = 还没）, order,
//     up: 上级目标的 id（一条只有一个上级，可以一层层往上串）, by: ["g:项目名", "p:计划 id"]（哪些项目 / 计划为它服务，多对多） }
// 栏目按「今天」现算（她 2026-11-05 晚重排的），每栏管一段月份：This month、Next month；This quarter 只在本季第一个月出现，管第三个月；
//   This year 只在今年还剩月份时出现，管前面几栏之后到 12 月；再加明年（Next year）和之后三年，最后一栏 North star（没有日期）。
//   月、季、年目标都一样：按截止月落进管那个月的那一栏。截止月过去了就过期（isOld，做没做完都一样），不再进栏，收进最底下的「往期」
//   （past，按季度看，只放过期的）；连线和「For …」链条也越过它们，接到往上第一条还在的（visibleSet / lift）。比最后一个年份还远的先放在那一年（ahead）。
// 对齐的链条：每天的任务 → 它的计划（没有计划就是它的项目）→ 服务的目标 → 上级 → 再上级……（见最下面的 chainsFor）

import { MONTHS } from "./dates.js";

export const SPANS = ["month", "quarter", "year", "north"];
const spanOf = (g) => (SPANS.includes(g?.span) ? g.span : "year");
export const YEARS_AHEAD = 4;
const pad = (n) => String(n).padStart(2, "0");
export const ymOf = (y, m) => y + "-" + pad(m);
const split = (s) => [Number(String(s).slice(0, 4)), Number(String(s).slice(5, 7)) || 1];
const quarter = (m) => Math.floor((m - 1) / 3) + 1;

// 月份排第几（2026-11 → 2026 × 12 + 10），比先后用
const monthOf = (when) => { const [y, m] = split(when); return y * 12 + m - 1; };

// 每一栏：from / to = 它管的月份（monthOf），due = 在这一栏里新加的目标默认哪个月做到（这一段的最后一个月）
export function columns(today) {
  const [y, m] = split(today), q = quarter(m), at = monthOf(today), dec = y * 12 + 11;
  const nm = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const cols = [
    { key: "month", span: "month", y, from: at, to: at, title: "This month", sub: MONTHS[m - 1], due: ymOf(y, m) },
    { key: "nmonth", span: "month", y: nm.y, from: at + 1, to: at + 1, title: "Next month", sub: MONTHS[nm.m - 1] + (nm.y !== y ? " " + nm.y : ""), due: ymOf(nm.y, nm.m) }
  ];
  let covered = at + 1;
  // 本季第一个月：第三个月还没有栏，This quarter 管它；第二、第三个月时这一季已经被前两栏盖住了，就没有这一栏
  if (m === (q - 1) * 3 + 1) { cols.push({ key: "quarter", span: "quarter", y, from: at + 2, to: at + 2, title: "This quarter", sub: "Q" + q, due: ymOf(y, q * 3) }); covered = at + 2; }
  // 今年还剩月份才有 This year（11、12 月，还有 10 月都没有）
  if (covered < dec) cols.push({ key: "year", span: "year", y, from: covered + 1, to: dec, title: "This year", sub: String(y), due: ymOf(y, 12) });
  // 明年叫 Next year（小字写年份），再往后三年直接写年份：今年是 2026 就是 Next year 2027 → 2028 → 2029 → 2030。
  // 12 月时明年 1 月已经归 Next month 了（排在前面的栏先接）
  for (let k = 1; k <= YEARS_AHEAD; k++) cols.push({ key: "y" + (y + k), span: "year", y: y + k, from: (y + k) * 12, to: (y + k) * 12 + 11, title: k === 1 ? "Next year" : String(y + k), sub: k === 1 ? String(y + 1) : "", due: ymOf(y + k, 12), far: true });
  cols.push({ key: "north", span: "north", y: Infinity, from: null, to: null, title: "North star", sub: "", due: "", far: true });
  return cols;
}

// 「Dec」；不是这一栏那年的带上年份「Dec 2027」
export function whenText(when, colYear) {
  if (!when) return "";
  const [y, m] = split(when);
  return MONTHS[m - 1] + (y !== colYear ? " " + y : "");
}

// 一条目标算在哪个月：勾了的算做完的那个月，没勾的算截止月——就是那一行右边写的那个月（「✓ Oct」「Dec」）。
// 她 2026-11-06 说的：设了 Oct 的还没折叠、Nov 的在 Next month——那几条都勾了，显示的是做完的月份，以前却按截止月放
export const monthOfGoal = (g) => (g?.done || g?.due || "");

// 过期了没有：它那个月已经过去了（月、季、年目标都一样）。North star、没写期限的永远不过期
export function isOld(g, today) {
  return spanOf(g) !== "north" && Boolean(monthOfGoal(g)) && monthOf(monthOfGoal(g)) < monthOf(today);
}

// → { cols: [{...column, items: [{ goal, done, ahead, when }]}], old: 过期了、收进往期的有几条 }
// 每一栏里：没做完的在前；再按标签排——rank(tag) 给的先后（项目的顺序：Build、Work、Friends…，没标签的最后）；同一个标签里早到期的在前
export function board(goals, today, { rank = () => 0 } = {}) {
  const cols = columns(today).map((c) => ({ ...c, items: [] }));
  const timed = cols.filter((c) => c.span !== "north"), last = timed[timed.length - 1];
  let old = 0;
  for (const g of goals) {
    if (spanOf(g) === "north") { cols[cols.length - 1].items.push({ goal: g, done: Boolean(g.done), ahead: false, when: g.done ? whenText(g.done, 0) : "" }); continue; }
    if (isOld(g, today)) { old++; continue; }
    const at = monthOf(monthOfGoal(g) || today), done = Boolean(g.done);
    let col = timed.find((c) => at >= c.from && at <= c.to), ahead = false;
    if (!col) { col = last; ahead = true; }
    col.items.push({ goal: g, done, ahead, when: whenText(done ? g.done : g.due, col.y) });
  }
  const when = (x) => (x.done ? x.goal.done : x.goal.due) || "";
  for (const c of cols) c.items.sort((a, b) => a.done - b.done || rank(a.goal.tag) - rank(b.goal.tag) || when(a).localeCompare(when(b)) || (Number(a.goal.order) || 0) - (Number(b.goal.order) || 0));
  return { cols, old };
}

// 往期：只放过期的，按年看（她 2026-11-06 说的「折叠区域用年筛选就好」）。按它那个月（monthOfGoal）落进那一年，
// 分成年目标、各季的季目标、各月的月目标；季和月新的在前，年份新的在前。
// → [{ key: "2026", label: "2026", y, year: [目标], quarters: [{ q, label: "Q3", items }], months: [{ m, label: "Jul", items }] }]
export function past(goals, today) {
  const at = new Map();
  const get = (y) => {
    if (!at.has(y)) at.set(y, { y, year: [], quarters: new Map(), months: new Map() });
    return at.get(y);
  };
  const push = (map, k, g) => { if (!map.has(k)) map.set(k, []); map.get(k).push(g); };
  for (const g of goals.filter((x) => isOld(x, today))) {
    const [y, m] = split(monthOfGoal(g)), x = get(y), span = spanOf(g);
    if (span === "month") push(x.months, m, g);
    else if (span === "quarter") push(x.quarters, quarter(m), g);
    else x.year.push(g);
  }
  const byMonth = (a, b) => monthOfGoal(a).localeCompare(monthOfGoal(b)) || (Number(a.order) || 0) - (Number(b.order) || 0);
  return [...at.values()].sort((a, b) => b.y - a.y).map((x) => ({
    key: String(x.y), label: String(x.y), y: x.y,
    year: x.year.sort(byMonth),
    quarters: [...x.quarters].sort((a, b) => b[0] - a[0]).map(([q, items]) => ({ q, label: "Q" + q, items: items.sort(byMonth) })),
    months: [...x.months].sort((a, b) => b[0] - a[0]).map(([m, items]) => ({ m, label: MONTHS[m - 1], items: items.sort(byMonth) }))
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
