// 计算引擎：只做计算，不碰页面、不读存储。所有时间单位都是分钟。
//
// 输入是一个 ctx：
//   { today, projects, items, tasks, capacity: {default, weekly, overrides}, log, level }
//   - project: {id, name, status, deadline, start, early}   early = 想提前几天完成
//   - item:    {id, projectId, module, title, est, origEst}  任务池里的计划条目，est 是总分钟
//   - task:    {id, date, title, est, actual, status, projectId, itemId, optional}
//              status: "" 待做 / done / partial / later / drop
//   - log:     {date: {need, projects: {projectId: 分钟}}}   每天第一次打开时拍的安全线快照
//
// 计算链：任务完成 → 条目进度 → 项目剩余 → 按可用天数摊成每日需求（多个项目一起平摊）
//        → 早上冻结成「今日安全线」→ 第二天对账（拖延账单）→ 真实速度 → 健康度

import { addDays, diffDays, weekday, range, fmtShort } from "./dates.js";

export const CHUNK = 15;            // 多项目平摊时一块 15 分钟
export const PACE_WINDOW = 14;      // 真实速度看最近两周
export const MIN_PACE_RECORDS = 3;  // 至少 3 次完成才预测完成日
export const MIN_KIND_SAMPLES = 2;  // 同一模块至少 2 个样本才建议改估时
const NEAR = 5;                     // 差 5 分钟以内算持平

const num = (v) => Number(v) || 0;
const sum = (list, f) => list.reduce((a, x) => a + f(x), 0);
const round5 = (v) => Math.round(v / 5) * 5;

// ---------- 单个任务 ----------

// 实际花掉的时间：填了 Actual 按实际；没填的 Done 按预计；Partial 没填算 0；其他不算
export function spentMin(t) {
  const a = num(t.actual);
  if (t.status === "done") return a > 0 ? a : num(t.est);
  if (t.status === "partial") return a;
  return 0;
}

// 推进了多少计划：Done 算满预计；Partial 按实际算但不超过预计
export function planMin(t) {
  if (t.status === "done") return num(t.est);
  if (t.status === "partial") return Math.min(num(t.actual), num(t.est));
  return 0;
}

export const isOpen = (t) => !t.status;
// 重复任务错过了就算错过，不往后顺延
export const isRoutine = (t) => String(t.id || "").startsWith("rt:");
export const isActive = (p) => !p.status || p.status === "active";
export const earlyDays = (p) => Math.max(0, Math.floor(num(p.early)));

// ---------- 索引（同一个 ctx 只建一次） ----------

const memo = new WeakMap();
function idx(ctx) {
  let m = memo.get(ctx);
  if (m) return m;
  m = { byItem: new Map(), byDate: new Map(), byProject: new Map(), items: new Map(), projects: new Map(), itemsOf: new Map(), cache: {} };
  const push = (map, key, v) => { if (!key) return; let l = map.get(key); if (!l) map.set(key, (l = [])); l.push(v); };
  for (const t of ctx.tasks) { push(m.byItem, t.itemId, t); push(m.byDate, t.date, t); push(m.byProject, t.projectId, t); }
  for (const i of ctx.items) { m.items.set(i.id, i); push(m.itemsOf, i.projectId, i); }
  for (const p of ctx.projects) m.projects.set(p.id, p);
  memo.set(ctx, m);
  return m;
}

export const projectById = (ctx, id) => idx(ctx).projects.get(id) || null;
export const itemById = (ctx, id) => idx(ctx).items.get(id) || null;
export const tasksOn = (ctx, d) => idx(ctx).byDate.get(d) || [];
export const tasksOfItem = (ctx, id) => idx(ctx).byItem.get(id) || [];
export const tasksOfProject = (ctx, id) => idx(ctx).byProject.get(id) || [];
export const itemsOf = (ctx, pid) => idx(ctx).itemsOf.get(pid) || [];

// ---------- 每日容量 ----------
// capacity = { default: 420, weekly: [周日..周六] 或 null, overrides: {"2026-10-03": 120} }
// 某天容量 0 = 休息日，不往这天摊任务

export function capacityFor(cap, d) {
  if (cap?.overrides && Object.prototype.hasOwnProperty.call(cap.overrides, d)) return num(cap.overrides[d]);
  if (Array.isArray(cap?.weekly) && cap.weekly.length === 7) return num(cap.weekly[weekday(d)]);
  return num(cap?.default);
}

function anyCapacity(cap) {
  if (Array.isArray(cap?.weekly) && cap.weekly.length === 7) return cap.weekly.some((v) => num(v) > 0);
  return num(cap?.default) > 0;
}

// 一周全是 0 的话就没有能用的日子了，那就当每天都能用
export function isWorkDay(cap, d) {
  return !anyCapacity(cap) || capacityFor(cap, d) > 0;
}

// ---------- 条目和项目的进度 ----------

export function itemState(ctx, item) {
  const est = num(item.est);
  let progress = 0, scheduled = 0;
  for (const t of tasksOfItem(ctx, item.id)) {
    progress += planMin(t);
    if (isOpen(t)) scheduled += num(t.est);
  }
  progress = Math.min(progress, est);
  const remaining = Math.max(est - progress, 0);
  return { est, progress, remaining, scheduled, unscheduled: Math.max(remaining - scheduled, 0), done: est > 0 && remaining < 0.5 };
}

export function projectTotals(ctx, p) {
  let total = 0, done = 0, scheduled = 0, unscheduled = 0;
  for (const i of itemsOf(ctx, p.id)) {
    const s = itemState(ctx, i);
    total += s.est; done += s.progress; scheduled += Math.min(s.scheduled, s.remaining); unscheduled += s.unscheduled;
  }
  return { total, done, remaining: Math.max(total - done, 0), scheduled, unscheduled };
}

// 一个项目从 from 这天看：剩下的分钟摊到「目标完成日」之前的可用天数里。
// 目标完成日 = Deadline 往前 early 天；已经过了目标日（在用缓冲）就摊到 Deadline；过了 Deadline 就是逾期。
export function projectPlan(ctx, p, from = ctx.today) {
  const t = projectTotals(ctx, p);
  const base = { ...t, deadline: p.deadline || "", early: earlyDays(p), days: [], dailyNeed: 0 };
  if (!p.deadline || !isActive(p)) return { ...base, noDeadline: !p.deadline };
  const planFinish = addDays(p.deadline, -base.early);
  const overdue = from > p.deadline;
  const notStarted = Boolean(p.start) && p.start > from && p.start <= p.deadline;
  const start = notStarted ? p.start : from;
  const inBuffer = !overdue && start > planFinish;
  const target = inBuffer ? p.deadline : planFinish;
  let days = overdue ? [from] : range(start, target).filter((d) => isWorkDay(ctx.capacity, d));
  const noUsableDay = !days.length;
  if (noUsableDay) days = [start];
  return { ...base, planFinish, overdue, notStarted, inBuffer, target, days, noUsableDay, dailyNeed: t.remaining / days.length };
}

// ---------- 自动分均匀 ----------
// 几个项目同时进行时，各摊各的会叠出忙闲不均。这里把所有项目剩下的时间一起排：
// 目标日早的项目先排，每 15 分钟放进「(当天已分 + 这块) ÷ 当天容量」最小的那天，只在项目自己的窗口里放。

export function levelPlans(ctx) {
  const m = idx(ctx);
  if (m.cache.level) return m.cache.level;
  const parts = [];
  for (const p of ctx.projects) {
    if (!isActive(p) || !p.deadline) continue;
    const plan = projectPlan(ctx, p);
    if (plan.overdue || plan.remaining < 0.5) continue;
    parts.push({ id: p.id, days: plan.days, remaining: plan.remaining, end: plan.days[plan.days.length - 1] });
  }
  parts.sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
  const load = {}, plans = {};
  const capOf = (d) => Math.max(30, capacityFor(ctx.capacity, d) || 30);
  for (const part of parts) {
    const own = {};
    let left = part.remaining;
    while (left > 0.01) {
      const chunk = Math.min(CHUNK, left);
      let best = part.days[0], bestV = Infinity;
      for (const d of part.days) {
        const v = ((load[d] || 0) + chunk) / capOf(d);
        if (v < bestV - 1e-9) { bestV = v; best = d; }
      }
      load[best] = (load[best] || 0) + chunk;
      own[best] = (own[best] || 0) + chunk;
      left -= chunk;
    }
    plans[part.id] = own;
  }
  return (m.cache.level = plans);
}

// 某个项目在某天需要多少分钟
export function needOn(ctx, p, d) {
  if (!isActive(p) || !p.deadline) return 0;
  if (ctx.level !== false && d >= ctx.today) {
    const own = levelPlans(ctx)[p.id];
    if (own) return own[d] || 0;
  }
  const plan = projectPlan(ctx, p, d);
  if (plan.remaining < 0.5 || plan.overdue || plan.notStarted) return 0;
  if (!plan.noUsableDay && !isWorkDay(ctx.capacity, d)) return 0;
  return plan.dailyNeed;
}

export function lineOn(ctx, d) {
  return sum(ctx.projects, (p) => needOn(ctx, p, d));
}

// 未来 n 天每天的项目需求，给「负载预览」用
export function forecast(ctx, n = 14) {
  return range(ctx.today, addDays(ctx.today, n - 1)).map((d) => {
    const parts = ctx.projects.map((p) => ({ id: p.id, min: needOn(ctx, p, d) })).filter((x) => x.min > 0.5);
    const total = sum(parts, (x) => x.min), cap = capacityFor(ctx.capacity, d);
    return { date: d, parts, total, cap, rest: !isWorkDay(ctx.capacity, d), over: cap > 0 && total > cap + 1 };
  });
}

// ---------- 今日安全线（早上冻结） ----------
// 第一次打开时把每个项目今天该做多少记下来，白天做完任务目标线也不会跟着降。
// 今天新建的项目，第一次有了非 0 的份额也补进快照里。

export function morningShares(ctx) {
  const out = {};
  for (const p of ctx.projects) out[p.id] = Math.round(needOn(ctx, p, ctx.today));
  return out;
}

export function todayLine(ctx) {
  const entry = ctx.log?.[ctx.today];
  if (!entry) {
    const shares = morningShares(ctx);
    return { line: sum(Object.values(shares), num), shares, fresh: true, added: false };
  }
  const shares = { ...(entry.projects || {}) };
  let added = false;
  for (const p of ctx.projects) {
    if (Object.prototype.hasOwnProperty.call(shares, p.id)) continue;
    const need = Math.round(needOn(ctx, p, ctx.today));
    if (need > 0) { shares[p.id] = need; added = true; }
  }
  const line = sum(ctx.projects, (p) => num(shares[p.id]));
  return { line, shares, fresh: false, added };
}

// 某天在项目上实际花了多少
export function doneOn(ctx, d) {
  return sum(tasksOn(ctx, d).filter((t) => t.projectId), spentMin);
}

// ---------- 拖延账单 / 连续稳妥 ----------
// 昨天的快照和昨天实际做的比：每个项目单独算差额，摊到这个项目自己剩下的天里。

export function yesterdayBill(ctx) {
  const y = addDays(ctx.today, -1);
  const entry = ctx.log?.[y];
  if (!entry || !(num(entry.need) > 0)) return null;
  const need = num(entry.need), done = doneOn(ctx, y), gap = done - need;
  if (Math.abs(gap) < NEAR) return { kind: "met", need, done };
  const parts = [];
  for (const [pid, planned] of Object.entries(entry.projects || {})) {
    const p = projectById(ctx, pid);
    if (!p) continue;
    const doneHere = sum(tasksOn(ctx, y).filter((t) => t.projectId === pid), spentMin);
    const diff = doneHere - num(planned);
    if (Math.abs(diff) < NEAR) continue;
    const plan = projectPlan(ctx, p);
    const days = plan.deadline && !plan.overdue && plan.remaining > 0.5 ? plan.days.length : 0;
    if (!days) continue;
    parts.push({ project: p, diff, days, perDay: -diff / days });
  }
  if (!parts.length) return gap >= NEAR ? { kind: "met", need, done } : null;
  const net = sum(parts, (x) => x.diff);
  const days = Math.max(...parts.map((x) => x.days));
  const perDay = sum(parts, (x) => x.perDay);
  if (net >= NEAR) return { kind: "ahead", need, done, extra: net, lessPerDay: -perDay, days, parts: parts.sort((a, b) => b.diff - a.diff) };
  if (net > -NEAR) return { kind: "met", need, done };
  return { kind: done > 0.5 ? "short" : "rest", need, done, short: -net, extraPerDay: perDay, days, parts: parts.sort((a, b) => a.diff - b.diff) };
}

// 今天已经超过早上的线：多出来的让之后每天轻多少
export function todayAhead(ctx) {
  const entry = ctx.log?.[ctx.today];
  if (!entry || !(num(entry.need) > 0)) return null;
  const extra = doneOn(ctx, ctx.today) - num(entry.need);
  if (extra < NEAR) return null;
  const tomorrow = addDays(ctx.today, 1);
  let days = 0;
  for (const pid of Object.keys(entry.projects || {})) {
    const p = projectById(ctx, pid);
    if (!p) continue;
    const plan = projectPlan(ctx, p, tomorrow);
    if (plan.deadline && !plan.overdue && plan.remaining > 0.5) days = Math.max(days, plan.days.length);
  }
  return days ? { extra, days, lessPerDay: extra / days } : null;
}

// 连续达标的天数：到昨天为止往回数，今天达标了也算上；那天不需要做项目的不打断
export function streak(ctx) {
  const log = ctx.log || {};
  let n = 0;
  const today = log[ctx.today];
  if (today && num(today.need) > 0 && doneOn(ctx, ctx.today) >= num(today.need) - 1) n += 1;
  for (let k = 1; k <= 366; k += 1) {
    const d = addDays(ctx.today, -k), e = log[d];
    if (!e) break;
    if (!(num(e.need) > 0)) continue;
    if (doneOn(ctx, d) >= num(e.need) - 1) n += 1;
    else break;
  }
  return n;
}

// ---------- 按模块校准估时 ----------
// 同一模块里做完的任务填了实际时间，就能算出「实际 ÷ 预计」。样本够了、差得多了，
// 建议把这个模块还没开始的条目按这个比例改估时；用户点了才改，点「保持」就等下一个样本再问。

export function modulesOf(ctx, p) {
  const seen = [];
  for (const i of itemsOf(ctx, p.id)) { const m = i.module || ""; if (!seen.includes(m)) seen.push(m); }
  return seen;
}

export function moduleStats(ctx, p, module) {
  const items = itemsOf(ctx, p.id).filter((i) => (i.module || "") === module);
  const ids = new Set(items.map((i) => i.id));
  const samples = ctx.tasks.filter((t) => t.status === "done" && ids.has(t.itemId) && num(t.actual) > 0 && num(t.est) > 0);
  const sumA = sum(samples, (t) => num(t.actual)), sumE = sum(samples, (t) => num(t.est));
  const ratio = sumE ? sumA / sumE : 1;
  const open = items.filter((i) => itemState(ctx, i).progress === 0 && num(i.est) > 0);
  const oldRemaining = sum(open, (i) => num(i.est));
  const proposals = open.map((i) => ({ item: i, est: Math.max(5, round5(num(i.origEst ?? i.est) * ratio)) }));
  const newRemaining = sum(proposals, (x) => x.est);
  const decided = num(p.calib?.[module]);
  const suggest = samples.length >= MIN_KIND_SAMPLES && open.length > 0 &&
    Math.abs(newRemaining - oldRemaining) >= Math.max(15, oldRemaining * 0.1) && decided !== samples.length;
  return {
    module, items, samples, ratio, open, oldRemaining, newRemaining, proposals, suggest,
    avgActual: samples.length ? sumA / samples.length : 0, avgPlan: samples.length ? sumE / samples.length : 0
  };
}

// ---------- 真实速度、预计完成日、健康度 ----------

export function projectStart(ctx, p) {
  const dates = tasksOfProject(ctx, p.id).map((t) => t.date).filter(Boolean).sort();
  return [dates[0], p.start].filter(Boolean).sort()[0] || ctx.today;
}

// 最近两周平均每个可用天投入多少。那天有容量、或者那天其实做了，都算一天。
export function pace(ctx, p) {
  const from = [addDays(ctx.today, -(PACE_WINDOW - 1)), projectStart(ctx, p)].sort().pop();
  const recs = tasksOfProject(ctx, p.id).filter((t) => t.date >= from && t.date <= ctx.today && spentMin(t) > 0);
  const worked = new Set(recs.map((t) => t.date));
  let days = 0;
  for (const d of range(from, ctx.today)) if (worked.has(d) || (d < ctx.today && isWorkDay(ctx.capacity, d))) days += 1;
  const spent = sum(recs, spentMin);
  return { enough: recs.length >= MIN_PACE_RECORDS && days > 0 && spent > 0, records: recs.length, days, spent, perDay: days ? spent / days : 0, workedToday: worked.has(ctx.today) };
}

// 实际比计划慢多少（实际 ÷ 预计），样本不够就当 1
export function speedRatio(ctx, p) {
  const s = tasksOfProject(ctx, p.id).filter((t) => t.status === "done" && num(t.actual) > 0 && num(t.est) > 0);
  if (s.length < MIN_PACE_RECORDS) return 1;
  return sum(s, (t) => num(t.actual)) / sum(s, (t) => num(t.est));
}

// 按真实速度换算剩下要花的时间；已经按实际改过估时的条目不再乘一次
export function predictedRemaining(ctx, p) {
  const ratio = speedRatio(ctx, p);
  return sum(itemsOf(ctx, p.id), (i) => itemState(ctx, i).remaining * (i.origEst != null && i.origEst !== "" ? 1 : ratio));
}

export function projectedFinish(ctx, p, pc = pace(ctx, p)) {
  let need = predictedRemaining(ctx, p);
  if (need < 0.5) return ctx.today;
  if (!pc.perDay) return "";
  let d = pc.workedToday ? addDays(ctx.today, 1) : ctx.today;
  for (let k = 0; k < 1500; k += 1) {
    if (isWorkDay(ctx.capacity, d)) {
      need -= pc.perDay;
      if (need <= 0.5) return d;
    }
    d = addDays(d, 1);
  }
  return "";
}

// level: done / empty / open（没有 Deadline）/ waiting / safe / tight / danger
export function health(ctx, p) {
  const plan = projectPlan(ctx, p);
  const pc = pace(ctx, p);
  const out = (level, text, extra = {}) => ({ level, text, plan, pace: pc, ...extra });
  if (!plan.total) return out("empty", "No items yet");
  if (plan.remaining < 0.5) return out("done", "All done");
  if (!isActive(p)) return out(p.status === "dropped" ? "dropped" : "done", p.status === "dropped" ? "Dropped" : "Closed");
  if (!p.deadline) return out("open", "No deadline");
  if (plan.notStarted) return out("waiting", "Starts " + fmtShort(p.start));
  if (plan.overdue) return out("danger", "Past deadline");
  if (pc.enough) {
    const finish = projectedFinish(ctx, p, pc);
    if (finish) {
      const slack = diffDays(finish, p.deadline);
      if (slack >= plan.early) return out("safe", "On pace · done " + fmtShort(finish), { finish, slack });
      if (slack >= 0) return out("tight", "Cutting it close · " + fmtShort(finish), { finish, slack });
      return out("danger", "At this pace " + fmtShort(finish) + " · " + -slack + "d late", { finish, slack });
    }
  }
  const caps = plan.days.map((d) => capacityFor(ctx.capacity, d)).filter((v) => v > 0);
  const avgCap = caps.length ? sum(caps, (v) => v) / caps.length : num(ctx.capacity?.default) || 420;
  const r = plan.dailyNeed / avgCap;
  const need = Math.round(plan.dailyNeed) + "m a day";
  if (r <= 0.5) return out("safe", "Steady · " + need);
  if (r <= 0.9) return out("tight", "A bit tight · " + need);
  return out("danger", "Too much · " + need);
}

// ---------- 过期没做的任务：一键顺延（重复任务不算） ----------
// 每件挪到「最空、又不超过它项目目标日」的那天，越早越好；目标日早的先排。只返回计划，不改数据。

export function planOverdue(ctx) {
  const cap = ctx.capacity;
  const overdue = ctx.tasks.filter((t) => isOpen(t) && t.date && t.date < ctx.today && !isRoutine(t));
  const load = {};
  for (const t of ctx.tasks) if (isOpen(t) && t.date >= ctx.today) load[t.date] = (load[t.date] || 0) + num(t.est);
  const limitOf = (t) => {
    const p = t.projectId ? projectById(ctx, t.projectId) : null;
    if (p && p.deadline && isActive(p)) {
      const pf = addDays(p.deadline, -earlyDays(p));
      return pf >= ctx.today ? pf : p.deadline >= ctx.today ? p.deadline : ctx.today;
    }
    return addDays(ctx.today, 6);
  };
  const order = overdue.map((t) => ({ t, limit: limitOf(t) }))
    .sort((a, b) => a.limit.localeCompare(b.limit) || a.t.date.localeCompare(b.t.date));
  const moves = [];
  for (const { t, limit } of order) {
    const est = num(t.est);
    let best = ctx.today, bestScore = -Infinity;
    for (const d of range(ctx.today, limit)) {
      if (!isWorkDay(cap, d)) continue;
      const score = capacityFor(cap, d) - (load[d] || 0) - est - diffDays(ctx.today, d) * 10;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    load[best] = (load[best] || 0) + est;
    moves.push({ id: t.id, from: t.date, to: best });
  }
  return moves;
}

// ---------- 日历格子用的汇总 ----------

export function daySummary(ctx, d) {
  const ts = tasksOn(ctx, d);
  const live = ts.filter((t) => t.status !== "drop" && t.status !== "later");
  return { planned: sum(live, (t) => num(t.est)), done: sum(ts, spentMin), cap: capacityFor(ctx.capacity, d), rest: !isWorkDay(ctx.capacity, d), count: ts.length };
}

// 任务池：活跃项目里还有没排进日历的条目
export function poolItems(ctx) {
  return ctx.items
    .filter((i) => { const p = projectById(ctx, i.projectId); return p && isActive(p); })
    .map((i) => ({ item: i, state: itemState(ctx, i) }))
    .filter((x) => x.state.unscheduled >= 0.5);
}
