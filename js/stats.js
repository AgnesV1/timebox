// 统计的计算：只算数，不碰页面。时间单位都是分钟。
// 看的是一段时间（一天 / 一周 / 一个月 / 一个季度 / 一年 / 自己选的两头）里：花了多少时间、其中多少是深度（Deep）、
// 做完了多少、守住了几天安全线、估时准不准、各项目、星期几、没做完的原因；
// 时间去向（一天 24 小时：睡觉、吃饭洗澡、家务按默认值算，剩下 = 记下来的 + 没记的）、时间表（项目 × 日子）。
// 只看某个项目 / 只看深度：页面先把 ctx.tasks 筛好再传进来，这里不用管。

import { addDays, diffDays, range, weekday, startOfWeek, startOfMonth, startOfQuarter, addMonths, daysInMonth, isoOf } from "./dates.js";
import * as E from "./engine.js";
import { parseTimes } from "./times.js";
import { hourMinutes, isCommute, COMMUTE_BLOCKS } from "./day.js";

export const PERIODS = { day: "Day", week: "Week", month: "Month", season: "Season", year: "Year", custom: "Custom" };

export function periodRange(kind, anchor, weekStartsOn = "monday") {
  if (kind === "day") return { from: anchor, to: anchor };
  if (kind === "week") { const from = startOfWeek(anchor, weekStartsOn); return { from, to: addDays(from, 6) }; }
  if (kind === "month") { const from = startOfMonth(anchor); return { from, to: addDays(from, daysInMonth(from) - 1) }; }
  if (kind === "year") { const y = Number(anchor.slice(0, 4)); return { from: isoOf(y, 1, 1), to: isoOf(y, 12, 31) }; }
  // 季度（Season）：Q1 = 1–3 月……
  const from = startOfQuarter(anchor);
  return { from, to: addDays(addMonths(from, 3), -1) };
}

// 上一段：同样长短、紧挨着的前一段
export function previousRange(kind, r, weekStartsOn) {
  if (kind === "month") return periodRange("month", addMonths(r.from, -1), weekStartsOn);
  if (kind === "season") return periodRange("season", addMonths(r.from, -3), weekStartsOn);
  if (kind === "year") return periodRange("year", isoOf(Number(r.from.slice(0, 4)) - 1, 1, 1), weekStartsOn);
  const len = diffDays(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

export function shiftAnchor(kind, anchor, n) {
  if (kind === "day") return addDays(anchor, n);
  if (kind === "week") return addDays(anchor, 7 * n);
  if (kind === "month") return addMonths(anchor, n);
  if (kind === "year") return isoOf(Number(anchor.slice(0, 4)) + n, Number(anchor.slice(5, 7)), 1);
  return addMonths(anchor, 3 * n);
}

const num = (v) => Number(v) || 0;
const key = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

// 一个任务算在哪一行：by = "group" 按项目（计划的 group；没有 group 的计划自己算一个），"plan" 按计划；没挂计划的名字是空
function rowOf(ctx, t, by) {
  const p = t.projectId ? E.projectById(ctx, t.projectId) : null;
  if (!p) return { name: "", color: "" };
  return { name: (by === "plan" ? "" : String(p.group || "").trim()) || p.name || "", color: p.color || "" };
}

// 默认的「不用记的时间」：睡觉、吃饭做饭洗碗洗澡（每天，分钟）、家务（每个周末一共）；deepGoal = 每天想做多少深度（0 = 不设）
export const LIFE = { sleep: 420, care: 180, chores: 120, deepGoal: 0 };
export function lifeOf(ctx) {
  const l = { ...LIFE, ...(ctx.life || {}) };
  for (const k in LIFE) l[k] = Math.max(0, num(l[k]));
  return l;
}
// 家务只算在周末：周六、周日各一半
export function lifeOn(life, date) {
  const wd = weekday(date);
  return { sleep: life.sleep, care: life.care, chores: wd === 0 || wd === 6 ? life.chores / 2 : 0 };
}

export function summarize(ctx, from, to, { by = "group" } = {}) {
  const last = to < ctx.today ? to : ctx.today;
  const days = from <= last ? range(from, last) : [];
  const inRange = (d) => d >= from && d <= last;
  const tasks = ctx.tasks.filter((t) => t.date && inRange(t.date));

  const spentBy = {}, plannedBy = {}, deepBy = {};
  for (const t of tasks) {
    spentBy[t.date] = (spentBy[t.date] || 0) + E.spentMin(t);
    if (t.deep) deepBy[t.date] = (deepBy[t.date] || 0) + E.spentMin(t);
    if (t.status !== "drop" && t.status !== "later") plannedBy[t.date] = (plannedBy[t.date] || 0) + num(t.est);
  }
  const spent = days.reduce((a, d) => a + (spentBy[d] || 0), 0);
  const planned = days.reduce((a, d) => a + (plannedBy[d] || 0), 0);
  const deep = days.reduce((a, d) => a + (deepBy[d] || 0), 0);
  // 深度目标只看工作日（可用时间是 0 的休息日不算没达标）
  const goal = lifeOf(ctx).deepGoal;
  const goalOn = (d) => (goal > 0 && E.isWorkDay(ctx.capacity, d) ? goal : 0);
  const goalDays = days.filter((d) => goalOn(d) > 0);
  const goalHit = goalDays.filter((d) => (deepBy[d] || 0) >= goal - 0.5).length;
  const done = tasks.filter((t) => t.status === "done").length;
  // 完成率：可选的任务没做不算没完成
  const counted = tasks.filter((t) => !t.optional || t.status === "done").length;
  const active = days.filter((d) => (spentBy[d] || 0) > 0).length;
  const lineDays = days.filter((d) => num(ctx.log?.[d]?.need) > 0);
  const held = lineDays.filter((d) => E.doneOn(ctx, d) >= num(ctx.log[d].need) - 1).length;
  const timed = tasks.filter((t) => t.status === "done" && num(t.actual) > 0 && num(t.est) > 0);
  const accuracy = timed.length ? timed.reduce((a, t) => a + num(t.actual), 0) / timed.reduce((a, t) => a + num(t.est), 0) : null;
  const caps = days.map((d) => E.capacityFor(ctx.capacity, d)).filter((v) => v > 0);

  // 按项目（或者按计划，见 rowOf）；没挂计划的放最后
  const projectOf = (t) => (t.projectId ? E.projectById(ctx, t.projectId) : null);
  const nameOf = (t) => rowOf(ctx, t, by).name;
  const byProject = [...new Set(tasks.map(nameOf))].map((name) => {
    const ts = tasks.filter((t) => nameOf(t) === name);
    const tm = ts.filter((t) => t.status === "done" && num(t.actual) > 0 && num(t.est) > 0);
    return {
      name,
      color: ts.map((t) => projectOf(t)?.color).find(Boolean) || "",
      spent: ts.reduce((a, t) => a + E.spentMin(t), 0),
      deep: ts.reduce((a, t) => a + (t.deep ? E.spentMin(t) : 0), 0),
      done: ts.filter((t) => t.status === "done").length,
      counted: ts.filter((t) => !t.optional || t.status === "done").length,
      accuracy: tm.length ? tm.reduce((a, t) => a + num(t.actual), 0) / tm.reduce((a, t) => a + num(t.est), 0) : null
    };
  }).filter((x) => x.counted || x.spent).sort((a, b) => (!a.name) - (!b.name) || b.spent - a.spent);

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
    from, to, last, days: days.length, spent, planned, deep, done, counted, rate: counted ? done / counted : null,
    goal, goalDays: goalDays.length, goalHit,
    active, lineDays: lineDays.length, held, accuracy, timed: timed.length,
    avgPlanned: days.length ? planned / days.length : 0,
    avgSpent: days.length ? spent / days.length : 0,
    avgCap: caps.length ? caps.reduce((a, v) => a + v, 0) / caps.length : 0,
    byProject, byWeekday, status, reasons, withoutReason: status.partial + status.later + status.drop - withReason,
    daily: range(from, to).map((d) => ({ date: d, spent: spentBy[d] || 0, deep: deepBy[d] || 0, planned: plannedBy[d] || 0, line: num(ctx.log?.[d]?.need), goal: goalOn(d), future: d > ctx.today }))
  };
}

// 一年 365 根柱子太挤，按周合起来
export function weekly(daily, weekStartsOn) {
  const out = new Map();
  for (const x of daily) {
    const w = startOfWeek(x.date, weekStartsOn);
    const g = out.get(w) || { date: w, spent: 0, deep: 0, planned: 0, line: 0, goal: 0, future: true };
    g.spent += x.spent; g.deep += x.deep || 0; g.planned += x.planned; g.line += x.line; g.goal += x.goal || 0; g.future = g.future && x.future;
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

// ---------- 时间去向：一天 24 小时都去哪了 ----------
// s = summarize 的结果。到今天为止每天 1440 分钟：睡觉 / 吃饭洗澡 / 家务（默认值）、各项目记下来的、没记的空白。
// trackedOnly = 只看记下来的（和 Toggl 的饼图一样）。rest = 筛选之外记下来的时间（只看某个项目时，别的合成一片）。
export function clockPie(ctx, s, { trackedOnly = false, rest = 0 } = {}) {
  const projects = s.byProject.filter((x) => x.spent > 0).map((x) => ({ key: "p:" + x.name, name: x.name || "No plan", color: x.color, min: x.spent, deep: x.deep, kind: x.name ? "project" : "none" }));
  const picked = projects.reduce((a, x) => a + x.min, 0);
  if (trackedOnly) return { total: picked, tracked: picked, deep: s.deep, blank: 0, parts: projects };
  const life = lifeOf(ctx), sum = { sleep: 0, care: 0, chores: 0 };
  const days = s.days ? range(s.from, s.last) : [];
  for (const d of days) { const l = lifeOn(life, d); for (const k in sum) sum[k] += l[k]; }
  const tracked = picked + Math.max(0, rest);
  const lived = sum.sleep + sum.care + sum.chores;
  const blank = Math.max(0, days.length * 1440 - lived - tracked);
  const parts = [
    { key: "sleep", name: "Sleep", min: sum.sleep, kind: "life" },
    { key: "care", name: "Meals & care", min: sum.care, kind: "life" },
    { key: "chores", name: "Chores", min: sum.chores, kind: "life" },
    ...projects,
    { key: "rest", name: "Everything else", min: Math.max(0, rest), kind: "rest" },
    { key: "blank", name: "Untracked", min: blank, kind: "blank" }
  ].filter((x) => x.min > 0);
  return { total: lived + tracked + blank, tracked, deep: s.deep, blank, parts };
}

// ---------- 时间表：项目 × 日子 ----------
// 列：两周以内一天一列，十四周以内一周一列，再长一个月一列。格子 = 那一格里花掉的分钟。

export function sheetCols(from, to, weekStartsOn = "monday") {
  const days = range(from, to);
  if (days.length <= 14) return days.map((d) => ({ from: d, to: d, kind: "day" }));
  const kind = days.length <= 98 ? "week" : "month";
  const cols = new Map();
  for (const d of days) {
    const k = kind === "week" ? startOfWeek(d, weekStartsOn) : startOfMonth(d);
    if (!cols.has(k)) cols.set(k, { from: d, to: d, kind });
    cols.get(k).to = d;
  }
  return [...cols.values()];
}

export function sheet(ctx, from, to, { weekStartsOn = "monday", by = "group" } = {}) {
  const last = to < ctx.today ? to : ctx.today;
  const cols = sheetCols(from, to, weekStartsOn).map((c) => ({ ...c, future: c.from > ctx.today }));
  const zeros = () => cols.map(() => 0);
  const rows = new Map(), total = zeros(), deep = zeros();
  for (const t of ctx.tasks) {
    if (!t.date || t.date < from || t.date > last) continue;
    const min = E.spentMin(t), i = cols.findIndex((c) => t.date >= c.from && t.date <= c.to);
    if (!min || i < 0) continue;
    const { name, color } = rowOf(ctx, t, by);
    if (!rows.has(name)) rows.set(name, { name, color, cells: zeros(), total: 0, deep: 0 });
    const r = rows.get(name);
    r.color = r.color || color;
    r.cells[i] += min; r.total += min; total[i] += min;
    if (t.deep) { r.deep += min; deep[i] += min; }
  }
  const add = (a, v) => a + v;
  return {
    cols, total, deep, sum: total.reduce(add, 0), deepSum: deep.reduce(add, 0),
    rows: [...rows.values()].sort((a, b) => (!a.name) - (!b.name) || b.total - a.total)
  };
}

// ---------- 热力图：每天每个钟点计了多少分钟 ----------
// 只算写了起止钟点的计时段；小时从 6:00 起（和今天页的圆盘一样），h = 0 是 6:00–7:00。
// 通勤日顺便记下固定时段占了哪几个小时（fixed），画成灰的。

const commuteHours = () => {
  const out = {};
  for (const b of COMMUTE_BLOCKS) for (const [h, m] of Object.entries(hourMinutes(b.from, b.to))) out[h] = (out[h] || 0) + m;
  return out;
};

export function hourGrid(ctx, from, to) {
  const last = to < ctx.today ? to : ctx.today;
  const days = from <= last ? range(from, last) : [];
  const at = new Map(days.map((d) => [d, Array(24).fill(0)]));
  for (const t of ctx.tasks) {
    const hours = at.get(t.date);
    if (!hours) continue;
    for (const seg of parseTimes(t.times)) {
      if (!seg.from || !seg.to) continue;
      for (const [h, m] of Object.entries(hourMinutes(seg.from, seg.to))) hours[h] += m;
    }
  }
  const fixed = commuteHours();
  return days.map((d) => ({ date: d, hours: at.get(d), fixed: isCommute(ctx.commute, d) ? fixed : {} }));
}

// 星期几 × 钟点的平均分钟（这段时间里每个星期几有几天就除以几）
export function heatByWeekday(grid) {
  return Array.from({ length: 7 }, (_, wd) => {
    const ds = grid.filter((x) => weekday(x.date) === wd);
    return { wd, days: ds.length, hours: Array.from({ length: 24 }, (_, h) => (ds.length ? ds.reduce((a, x) => a + x.hours[h], 0) / ds.length : 0)) };
  });
}

// 按周分组（最近的在前）：[{from, days: [7 天，没有的那天是 null]}]
export function heatWeeks(grid, weekStartsOn) {
  const weeks = new Map();
  for (const x of grid) {
    const w = startOfWeek(x.date, weekStartsOn);
    if (!weeks.has(w)) weeks.set(w, Array(7).fill(null));
    weeks.get(w)[(weekday(x.date) - weekday(w) + 7) % 7] = x;
  }
  return [...weeks.entries()].map(([from, days]) => ({ from, days })).sort((a, b) => b.from.localeCompare(a.from));
}
