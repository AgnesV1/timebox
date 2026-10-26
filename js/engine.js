// 计算引擎：只做计算，不碰页面、不读存储。所有时间单位都是分钟。
//
// 输入是一个 ctx：
//   { today, projects, items, tasks, capacity: {default, weekly, overrides}, log, level }
//   - project: {id, name, kind, place, status, start, deadline, rule}   一行 = 一个计划
//              kind 都是 regular（以前的 total 打开时搬过来了，见 js/store/lists.js 的 adoptLists）；
//              place: auto（固定星期几自己出现，规则见 routines.js）/ pool（拖到哪天）
//   - item:    {id, projectId, module, title, est}  计划 Pool 里的一项（js/lists.js），est 是大概几分钟
//   - task:    {id, date, title, est, actual, status, projectId, itemId, optional}
//              status: "" 待做 / done / delay / drop。状态只管「做完没有」：日历怎么画、完成率、Delay / Drop 的分析；
//              花了多少时间只看记下的（actual = Times 加起来），和状态无关
//
// 今天的线、昨天的账、顺延这一套（照日有回响做的）2026-10-25 拿掉了：计划改成 Pool 里一项项拖（js/lists.js）。
// 这里剩下的：单个任务的分钟、索引、每天的可用时间、日历格子的汇总和预览、规律计划这一周。

import { addDays, weekday, range, startOfWeek } from "./dates.js";
import { ruleOf, dueOn, inRange } from "./routines.js";


const num = (v) => Number(v) || 0;
const sum = (list, f) => list.reduce((a, x) => a + f(x), 0);

// ---------- 单个任务 ----------

// 实际花掉的时间：只看记下的（计时器、补记的那几段加起来），标没标、标的什么都一样
export const spentMin = (t) => num(t.actual);

// 还算不算那天的计划：Delay、Drop 的不算（记下的时间照样算花了）
export const isPlanned = (t) => t.status !== "delay" && t.status !== "drop";

export const isOpen = (t) => !t.status;
// 规律计划那天的那一次
export const isRoutine = (t) => String(t.id || "").startsWith("rt:");
// 自动排出来的（固定星期几的那一次；以前还有整块计划的每日份额 au:）：错过了就算错过，不算「留下来的」
export const isAutoTask = (t) => /^(rt|au):/.test(String(t.id || ""));
export const isActive = (p) => !p.status || p.status === "active";
export const isRegular = (p) => p?.kind === "regular";
export const isAuto = (p) => p?.place === "auto";
// Chore 键那条（每天一条，ID 固定 chore-日期，见 store.js 的 startChore）：只算分钟，不算一条「做完的任务」
export const isChore = (t) => String(t?.id || "").startsWith("chore-");
// 循环小事：自己按规律出现在每天清单里的（加任务时选 Repeat 建的就是这种）。它直接算在大类上——Projects 页不单独给它一张卡，
// 下拉里也不列它；每周几次、自己从任务池拖的那种（Regular + Pool）还是一张计划
export const isRepeat = (p) => isRegular(p) && isAuto(p);

// ---------- 索引（同一个 ctx 只建一次） ----------

const memo = new WeakMap();
function idx(ctx) {
  let m = memo.get(ctx);
  if (m) return m;
  m = { byDate: new Map(), byProject: new Map(), projects: new Map(), taskIds: new Set() };
  const push = (map, key, v) => { if (!key) return; let l = map.get(key); if (!l) map.set(key, (l = [])); l.push(v); };
  for (const t of ctx.tasks) { push(m.byDate, t.date, t); push(m.byProject, t.projectId, t); m.taskIds.add(t.id); }
  for (const p of ctx.projects) m.projects.set(p.id, p);
  memo.set(ctx, m);
  return m;
}

export const projectById = (ctx, id) => idx(ctx).projects.get(id) || null;
export const tasksOn = (ctx, d) => idx(ctx).byDate.get(d) || [];
export const tasksOfProject = (ctx, id) => idx(ctx).byProject.get(id) || [];
export const hasTask = (ctx, id) => idx(ctx).taskIds.has(id);

// ---------- 每日容量 ----------
// capacity = { default: 420, weekly: [周日..周六] 或 null, overrides: {"2026-10-03": 120} }
// 某天容量 0 = 休息日

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

// ---------- 日历格子用的汇总 ----------

export function daySummary(ctx, d) {
  const ts = tasksOn(ctx, d);
  return { planned: sum(ts.filter(isPlanned), (t) => num(t.est)), done: sum(ts, spentMin), cap: capacityFor(ctx.capacity, d), rest: !isWorkDay(ctx.capacity, d), count: ts.length };
}

// ---------- 固定星期几：以后的预览、这一周 ----------

// 以后某天（不含今天）的预览：固定星期几的计划那天的那一次（还没落成的）
export function ghostsOn(ctx, d) {
  if (d <= ctx.today) return [];
  const out = [];
  for (const p of ctx.projects) {
    if (!isActive(p) || !isAuto(p) || !isRegular(p)) continue;
    const id = "rt:" + p.id + ":" + d, est = dueOn(ruleOf(p), d);
    if (est && !hasTask(ctx, id)) out.push({ key: id, kind: "regular", plan: p, title: p.name, est, date: d });
  }
  return out;
}

// 规律计划这一周：该做几次、排了几次、做了几次、还剩几次没排
export function regularWeek(ctx, p, d = ctx.today) {
  const ws = startOfWeek(d, ctx.weekStartsOn || "monday"), we = addDays(ws, 6), r = ruleOf(p);
  const ts = tasksOfProject(ctx, p.id).filter((t) => t.date >= ws && t.date <= we);
  const target = isAuto(p) ? range(ws, we).filter((x) => dueOn(r, x)).length : (inRange(r, we) || inRange(r, ws) ? num(r.perWeek) : 0);
  const placed = ts.filter(isPlanned).length;
  return { target, placed, done: ts.filter((t) => t.status === "done").length, left: Math.max(0, target - placed) };
}
