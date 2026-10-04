// 统计的计算：只算数，不碰页面。时间单位都是分钟。
// 看的是一段时间（最近 30 天 / 一周 / 一个月 / 一年）里：花了多少时间、做完了多少、
// 守住了几天安全线、估时准不准、各分类、星期几、没做完的原因、每天到底装得下多少。

import { addDays, diffDays, range, weekday, startOfWeek, startOfMonth, addMonths, daysInMonth, isoOf } from "./dates.js";
import * as E from "./engine.js";

export const PERIODS = { week: "Week", d30: "30 days", month: "Month", year: "Year" };
export const CATS = ["Main", "Work", "Fun", "Chore", ""];

export function periodRange(kind, anchor, weekStartsOn = "monday") {
  if (kind === "week") { const from = startOfWeek(anchor, weekStartsOn); return { from, to: addDays(from, 6) }; }
  if (kind === "month") { const from = startOfMonth(anchor); return { from, to: addDays(from, daysInMonth(from) - 1) }; }
  if (kind === "year") { const y = Number(anchor.slice(0, 4)); return { from: isoOf(y, 1, 1), to: isoOf(y, 12, 31) }; }
  return { from: addDays(anchor, -29), to: anchor };
}

// 上一段：同样长短、紧挨着的前一段
export function previousRange(kind, r, weekStartsOn) {
  if (kind === "month") return periodRange("month", addMonths(r.from, -1), weekStartsOn);
  if (kind === "year") return periodRange("year", isoOf(Number(r.from.slice(0, 4)) - 1, 1, 1), weekStartsOn);
  const len = diffDays(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

export function shiftAnchor(kind, anchor, n) {
  if (kind === "week") return addDays(anchor, 7 * n);
  if (kind === "month") return addMonths(anchor, n);
  if (kind === "year") return isoOf(Number(anchor.slice(0, 4)) + n, Number(anchor.slice(5, 7)), 1);
  return addDays(anchor, 30 * n);
}

const num = (v) => Number(v) || 0;
const key = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

export function summarize(ctx, from, to) {
  const last = to < ctx.today ? to : ctx.today;
  const days = from <= last ? range(from, last) : [];
  const inRange = (d) => d >= from && d <= last;
  const tasks = ctx.tasks.filter((t) => t.date && inRange(t.date));

  const spentBy = {}, plannedBy = {};
  for (const t of tasks) {
    spentBy[t.date] = (spentBy[t.date] || 0) + E.spentMin(t);
    if (t.status !== "drop" && t.status !== "later") plannedBy[t.date] = (plannedBy[t.date] || 0) + num(t.est);
  }
  const spent = days.reduce((a, d) => a + (spentBy[d] || 0), 0);
  const planned = days.reduce((a, d) => a + (plannedBy[d] || 0), 0);
  const done = tasks.filter((t) => t.status === "done").length;
  // 完成率：可选的任务没做不算没完成
  const counted = tasks.filter((t) => !t.optional || t.status === "done").length;
  const active = days.filter((d) => (spentBy[d] || 0) > 0).length;
  const lineDays = days.filter((d) => num(ctx.log?.[d]?.need) > 0);
  const held = lineDays.filter((d) => E.doneOn(ctx, d) >= num(ctx.log[d].need) - 1).length;
  const timed = tasks.filter((t) => t.status === "done" && num(t.actual) > 0 && num(t.est) > 0);
  const accuracy = timed.length ? timed.reduce((a, t) => a + num(t.actual), 0) / timed.reduce((a, t) => a + num(t.est), 0) : null;
  const caps = days.map((d) => E.capacityFor(ctx.capacity, d)).filter((v) => v > 0);

  const byCategory = CATS.map((cat) => {
    const ts = tasks.filter((t) => (CATS.includes(t.category) ? t.category : "") === cat);
    const tm = ts.filter((t) => t.status === "done" && num(t.actual) > 0 && num(t.est) > 0);
    return {
      cat,
      spent: ts.reduce((a, t) => a + E.spentMin(t), 0),
      done: ts.filter((t) => t.status === "done").length,
      counted: ts.filter((t) => !t.optional || t.status === "done").length,
      accuracy: tm.length ? tm.reduce((a, t) => a + num(t.actual), 0) / tm.reduce((a, t) => a + num(t.est), 0) : null
    };
  }).filter((x) => x.counted || x.spent);

  const byWeekday = Array.from({ length: 7 }, (_, wd) => {
    const ds = days.filter((d) => weekday(d) === wd);
    const total = ds.reduce((a, d) => a + (spentBy[d] || 0), 0);
    return { wd, avg: ds.length ? total / ds.length : 0, days: ds.length };
  });

  const status = { partial: 0, later: 0, drop: 0 };
  const groups = new Map();
  for (const t of tasks) {
    if (!(t.status in status)) continue;
    status[t.status] += 1;
    const k = key(t.reason);
    if (!k) continue;
    const g = groups.get(k) || { text: t.reason.trim(), count: 0, statuses: {} };
    g.count += 1;
    g.statuses[t.status] = (g.statuses[t.status] || 0) + 1;
    groups.set(k, g);
  }
  const reasons = [...groups.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  const withReason = reasons.reduce((a, g) => a + g.count, 0);

  return {
    from, to, last, days: days.length, spent, planned, done, counted, rate: counted ? done / counted : null,
    active, lineDays: lineDays.length, held, accuracy, timed: timed.length,
    avgPlanned: days.length ? planned / days.length : 0,
    avgSpent: days.length ? spent / days.length : 0,
    avgCap: caps.length ? caps.reduce((a, v) => a + v, 0) / caps.length : 0,
    byCategory, byWeekday, status, reasons, withoutReason: status.partial + status.later + status.drop - withReason,
    daily: range(from, to).map((d) => ({ date: d, spent: spentBy[d] || 0, planned: plannedBy[d] || 0, line: num(ctx.log?.[d]?.need), future: d > ctx.today }))
  };
}

// 一年 365 根柱子太挤，按周合起来
export function weekly(daily, weekStartsOn) {
  const out = new Map();
  for (const x of daily) {
    const w = startOfWeek(x.date, weekStartsOn);
    const g = out.get(w) || { date: w, spent: 0, planned: 0, line: 0, future: true };
    g.spent += x.spent; g.planned += x.planned; g.line += x.line; g.future = g.future && x.future;
    out.set(w, g);
  }
  return [...out.values()];
}

// 每个项目：计划多少、推进了多少、实际花了多少（全部 / 这段时间）
export function projectRows(ctx, from, last) {
  return ctx.projects.map((p) => {
    const t = E.projectTotals(ctx, p);
    const ts = E.tasksOfProject(ctx, p.id);
    return {
      p, planned: t.total, done: t.done, remaining: t.remaining,
      spent: ts.reduce((a, x) => a + E.spentMin(x), 0),
      spentHere: ts.filter((x) => x.date >= from && x.date <= last).reduce((a, x) => a + E.spentMin(x), 0),
      health: E.health(ctx, p)
    };
  }).filter((r) => r.planned || r.spent);
}
