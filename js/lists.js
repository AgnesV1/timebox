// 计划的 Pool 和每天那一行（她 2026-10-25 定的「所有计划一个逻辑」）：纯计算，不碰存储。
// 计划 = 项目下面的一块（Swimming、IELTS）。它的 Pool 是一项项具体的 todo：Items 表一行一项（名字、分区 module、大概分钟 est、顺序），
// 附加的设置在计划的 rule.items[项 id]：做几次 n（1 = Once，0 = Any）、about N a week、步骤、备注、Later。
// 某天某计划 = 一行：那天这个计划「没挂项」的任务，整块计时，时间都记在它身上；
// 拖进那天的项 = 挂着 itemId 的任务，只是便条（大概多久、不计时），Done = 这一次做了；有步骤的，步骤在它的 Description 里（`- [ ] 听力 · 35min`）。
// 过了那天还没勾的回 Pool（settle）；勾了一半步骤的，勾了的留在那天（标 Delay），剩下的在 Pool 里接着做，算同一次。

import { addDays, startOfWeek } from "./dates.js";
import { parseDur, fmtDur } from "./plantext.js";

export const DEFAULT = { n: 1, perWeek: 0, steps: [], note: "", later: false };
export const cfgOf = (plan, itemId) => ({ ...DEFAULT, ...(plan?.rule?.items?.[itemId] || {}) });
export const CONTINUED = "Continued";   // 剩下的步骤已经拖到别的天接着做了：这条 Delay 不再算「回了 Pool 的那次」
export const BACK = "Back to the pool";

const num = (v) => Number(v) || 0;
// 大概多久，写在项旁边的短样子：30m、2h、1h45；没写是空
export const sizeOf = (m) => { const v = Math.round(num(m)); return v <= 0 ? "" : v < 60 ? v + "m" : Math.floor(v / 60) + "h" + (v % 60 ? String(v % 60).padStart(2, "0") : ""); };
export const isChore = (t) => String(t?.id || "").startsWith("chore-");
export const isLine = (t) => Boolean(t?.projectId && t.itemId);
export const isRow = (t) => Boolean(t?.projectId) && !t.itemId && !isChore(t);
export const isRoutine = (t) => String(t?.id || "").startsWith("rt:");
export const hasTime = (t) => num(t?.actual) > 0 || Boolean(t?.times);

// ---------- 步骤 ----------

const STEP = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/;
// Description → { steps: [{ t, min, done }], rest: 别的字 }
export function stepsOf(desc) {
  const steps = [], rest = [];
  for (const line of String(desc || "").split("\n")) {
    const m = STEP.exec(line);
    if (!m) { rest.push(line); continue; }
    const bits = m[2].split(/\s+·\s+/), min = bits.length > 1 ? parseDur(bits[bits.length - 1]) : null;
    steps.push({ t: (min === null ? bits : bits.slice(0, -1)).join(" · ").trim(), min: min || 0, done: m[1] !== " " });
  }
  return { steps, rest: rest.join("\n").trim() };
}
export function withSteps(rest, steps) {
  const lines = steps.map((s) => "- [" + (s.done ? "x" : " ") + "] " + s.t + (num(s.min) > 0 ? " · " + fmtDur(s.min) : ""));
  return [String(rest || "").trim(), lines.join("\n")].filter(Boolean).join("\n\n");
}
const leftSteps = (t) => stepsOf(t.desc).steps.filter((s) => !s.done);

// ---------- 第几次 ----------
// 每一次的名字就是项的名字，不带号（以前 ×N 的项每一次后面带 #k，她 2026-10-27 说没用）。
// 以前带着的号打开时拿掉（js/store/lists.js 的 adoptLists）：挂着项、名字和项不一样、后面是「 #数字」的，去掉最后那个
export const OLD_NUM = /\s#\d+$/;

// 勾了一半、剩下的回了 Pool、还没接着拖出来的那几次
const carried = (lines) => lines.filter((t) => t.status === "delay" && t.reason !== CONTINUED && leftSteps(t).length);

// 一项的次数：done 做完的；open 排在某天还没勾的；carry 勾了一半回了 Pool 的；left 还能从 Pool 拖几次（含 carry，Any = Infinity）
export function countOf(lines, cfg) {
  const done = lines.filter((t) => t.status === "done").length, open = lines.filter((t) => !t.status).length;
  const carry = carried(lines).map((t) => ({ steps: leftSteps(t), from: t.id }));
  return { n: cfg.n, done, open, carry, left: cfg.n > 0 ? Math.max(0, cfg.n - done - open) : Infinity };
}

// 这一周（d 所在的那周）：做了几次、排了几次（做了的 + 还没勾的）
export function weekOf(lines, d, weekStartsOn = "monday") {
  const a = startOfWeek(d, weekStartsOn), b = addDays(a, 6);
  const wk = lines.filter((t) => t.date >= a && t.date <= b);
  return { done: wk.filter((t) => t.status === "done").length, placed: wk.filter((t) => t.status === "done" || !t.status).length };
}

// ---------- 索引（同一份 ctx 只建一次） ----------

const cache = new WeakMap();
function idx(ctx) {
  let m = cache.get(ctx);
  if (m) return m;
  m = { plans: new Map(), items: new Map(), itemsOf: new Map(), lines: new Map(), byDate: new Map() };
  for (const p of ctx.projects || []) m.plans.set(p.id, p);
  for (const i of ctx.items || []) {
    m.items.set(i.id, i);
    if (!m.itemsOf.has(i.projectId)) m.itemsOf.set(i.projectId, []);
    m.itemsOf.get(i.projectId).push(i);
  }
  for (const t of ctx.tasks || []) {
    if (t.itemId) { if (!m.lines.has(t.itemId)) m.lines.set(t.itemId, []); m.lines.get(t.itemId).push(t); }
    if (!m.byDate.has(t.date)) m.byDate.set(t.date, []);
    m.byDate.get(t.date).push(t);
  }
  cache.set(ctx, m);
  return m;
}
export const linesOf = (ctx, itemId) => idx(ctx).lines.get(itemId) || [];
export const itemsOf = (ctx, planId) => idx(ctx).itemsOf.get(planId) || [];
export const planOf = (ctx, id) => idx(ctx).plans.get(id) || null;

// 一项现在的样子：设置、次数、这周
export function stateOf(ctx, item) {
  const plan = planOf(ctx, item.projectId), cfg = cfgOf(plan, item.id), lines = linesOf(ctx, item.id);
  return { item, plan, cfg, count: countOf(lines, cfg), week: weekOf(lines, ctx.today, ctx.weekStartsOn) };
}

const active = (p) => !p.status || p.status === "active";
const byOrder = (a, b) => num(a.order) - num(b.order);

// Pool：每个在用的计划一组——计划自己（拖了 = 那天空的一行），和它还能拖的项（Later 的、做满了的不列），按分区、顺序排
export function pool(ctx) {
  return (ctx.projects || []).filter(active).map((plan) => ({
    plan,
    items: itemsOf(ctx, plan.id).slice().sort(byOrder).map((i) => stateOf(ctx, i)).filter((x) => !x.cfg.later && x.count.left > 0)
  }));
}

// 计划的 Pool 一共：几项、还要几次（Any 不算）、多久（大概分钟 × 还要几次）、Later 几项
export function poolTotals(ctx, plan) {
  let items = 0, times = 0, min = 0, later = 0;
  for (const i of itemsOf(ctx, plan.id)) {
    const s = stateOf(ctx, i);
    if (s.cfg.later) { later++; continue; }
    if (s.count.left <= 0) continue;
    items++;
    if (Number.isFinite(s.count.left)) { times += s.count.left; min += num(i.est) * s.count.left; }
  }
  return { items, times, min, later };
}

// ---------- 每天那一行 ----------

// 计划那一块的头：那一行，那天下面还有它的项。标不标都行，不算「留下来没做的」
export const isContainer = (ctx, t) => isRow(t) && (idx(ctx).byDate.get(t.date) || []).some((x) => x.projectId === t.projectId && x.itemId);

export const rowOn = (ctx, planId, date) => (idx(ctx).byDate.get(date) || []).filter((t) => t.projectId === planId && isRow(t)).sort(byOrder)[0] || null;
// 新的一行的 ID：pd:<计划>:<日期>；被挪走的那一行还占着这个 ID 就加后缀
export function rowId(planId, date, taken) {
  let id = "pd:" + planId + ":" + date, n = 2;
  while (taken(id)) id = "pd:" + planId + ":" + date + ":" + n++;
  return id;
}

// 一天的任务按计划并起来：[{ plan, row, lines, order }] 或 [{ task, order }]，按最靠前的那条排。
// 同一计划那天有两条没挂项的（旧数据），第一条当那一行，别的照普通任务列
export function dayBlocks(ctx, tasks) {
  const out = [], blocks = new Map();
  for (const t of tasks.slice().sort(byOrder)) {
    const plan = t.projectId ? planOf(ctx, t.projectId) : null;
    if (!plan || isChore(t)) { out.push({ task: t, order: num(t.order) }); continue; }
    let b = blocks.get(plan.id);
    if (!b) { b = { plan, row: null, lines: [], order: num(t.order) }; blocks.set(plan.id, b); out.push(b); }
    if (t.itemId) b.lines.push(t);
    else if (!b.row) b.row = t;
    else out.push({ task: t, order: num(t.order) });
  }
  return out.sort((a, b) => a.order - b.order);
}

// 一天排了多少分钟（日历 Pool 开着时日期后面那个小时数）：dayBlocks 的结果。计划那一块算下面几项加起来（没有项就是那一行自己的分钟，
// 和今天页那一行左边那格一样），别的任务算自己的；Delay、Drop 的不算
const counts = (t) => t.status !== "delay" && t.status !== "drop";
export function dayMin(blocks) {
  return blocks.reduce((a, b) => {
    if (b.task) return a + (counts(b.task) ? num(b.task.est) : 0);
    const live = b.lines.filter(counts);
    return a + (live.length ? live.reduce((s, t) => s + num(t.est), 0) : b.row && counts(b.row) ? num(b.row.est) : 0);
  }, 0);
}

// ---------- 过了那天 ----------
// from = 换成这套的那天（Settings 一行）：更早的旧记录不动。返回要做的事，店里一次改完：
//   done：步骤全勾了、自己没勾的 → 勾上
//   delay：勾了一半步骤、或记了时间的 → 标 Delay、原因 Back to the pool（留着当记录，剩下的步骤在 Pool 里接着做）
//   drop：没勾、没记时间、没勾步骤的 → 删掉（次数退回 Pool）
//   rows：那天空着的那一行（没记时间、没写字、没标状态、那天已经没有项）→ 删掉；固定星期几自己出现的那次（rt:）照旧留着
export function settle(ctx, from) {
  const out = { done: [], delay: [], drop: [], rows: [] };
  if (!from) return out;
  const past = (t) => t.date && t.date >= from && t.date < ctx.today;
  const gone = new Set();
  for (const t of ctx.tasks || []) {
    if (!past(t) || !isLine(t) || t.status || !planOf(ctx, t.projectId)) continue;
    const { steps } = stepsOf(t.desc);
    if (steps.length && steps.every((s) => s.done)) out.done.push(t.id);
    else if (hasTime(t) || steps.some((s) => s.done)) out.delay.push(t.id);
    else { out.drop.push(t.id); gone.add(t.id); }
  }
  for (const t of ctx.tasks || []) {
    if (!past(t) || !isRow(t) || t.status || hasTime(t) || String(t.desc || "").trim() || isRoutine(t)) continue;
    const left = (idx(ctx).byDate.get(t.date) || []).some((x) => x.projectId === t.projectId && x.itemId && !gone.has(x.id));
    if (!left) out.rows.push(t.id);
  }
  return out;
}
