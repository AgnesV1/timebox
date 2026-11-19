// 日历的 Year 视图（只做计算，页面在 js/ui/calendar.js）：三条长横条要的每天的数、分档和排布。
// 这里也放「那天红不红」这条规则（dayLoad）：周 / 月视图顶上那条看它，只留一份。

import { range, isoOf, weekday, startOfWeek, diffDays } from "./dates.js";
import * as E from "./engine.js";
import * as L from "./lists.js";
import { offState } from "./offdays.js";
import { isCommute } from "./day.js";
import { rowOf, coreGroups } from "./stats.js";

// 超过这么多分钟（还没超过 box）就警示（她 2026-10-27 要的警示线；暂定，之后可能取消）
export const LONG_DAY = 7 * 60;

// 一天的量（她 2026-10-28 定的）：以前的日子 = 实际记下的总时间（Chore 键记的也算），今天和以后 = 排了的（含固定星期几的预览，Chore 键不算）——都算所有大类。
// 分母是那天的 box。over = 超过 box，long = 没超 box、超过 7 小时；金条那天都不红
export function dayLoad(ctx, d, gold = false) {
  const sum = E.daySummary(ctx, d);
  const blocks = L.dayBlocks(ctx, E.tasksOn(ctx, d).filter((t) => !E.isChore(t)));
  const planned = L.dayMin(blocks) + E.ghostsOn(ctx, d).reduce((a, g) => a + (Number(g.est) || 0), 0);
  const val = d < ctx.today ? sum.done : planned;
  const over = !gold && sum.cap > 0 && val > sum.cap;
  return { val, planned, cap: sum.cap, rest: sum.rest, over, long: !gold && !over && val > LONG_DAY };
}

// 那一年每天的样子：
//   gold     金条（超级休息日）
//   rest     休息日 = 金条或 box 是 0；周末不算
//   weekend  周六周日
//   holiday  假期 = 公众假日或自己标的请假（js/offdays.js），值是名字，不是假期就是空
//   commute  通勤日
//   mins     每个大类那天记了多少分钟
//   core     Build + Work + Chores 一共多少分钟（js/stats.js 的 coreGroups，和 Stats 顶上那条同一个说法）
//   groups   那天亮的大类（「工作了」「健身了」= 记了时间，排了没做不算）。
//            Friends 是交叉的（她 2026-11-18 说的）：不管任务在哪个大类，带着「和谁」、做了（Done 或记了时间，Delay / Drop 不算）就也算 Friends
const memo = new WeakMap();
const tookPlace = (t) => t.status === "done" || (E.spentMin(t) > 0 && t.status !== "delay" && t.status !== "drop");
export function yearDays(ctx, y) {
  let years = memo.get(ctx);
  if (!years) memo.set(ctx, (years = new Map()));
  if (years.has(y)) return years.get(y);
  // 哪个大类算 Friends：叫这个名字的；改过名就是第一个开了「能选人」的
  const people = (ctx.groups || []).find((g) => g.name === "Friends") || (ctx.groups || []).find((g) => g.friends);
  const withSomeone = new Set((ctx.meets || []).filter((m) => m.taskId && m.friends?.length).map((m) => m.taskId));
  const core = coreGroups(ctx);
  const days = range(isoOf(y, 1, 1), isoOf(y, 12, 31)).map((date) => {
    const gold = Boolean(ctx.superRest?.days?.[date]);
    const off = offState(date, ctx.offday);
    const wd = weekday(date);
    const groups = new Set(), mins = {};
    for (const t of E.tasksOn(ctx, date)) {
      const spent = E.spentMin(t), name = spent > 0 ? rowOf(ctx, t, "group").name : "";
      if (name) { groups.add(name); mins[name] = (mins[name] || 0) + spent; }
      if (people && withSomeone.has(t.id) && tookPlace(t)) groups.add(people.name);
    }
    return { date, gold, rest: gold || E.daySummary(ctx, date).rest, weekend: wd === 0 || wd === 6, holiday: off.off ? off.holiday || "Day off" : "", commute: isCommute(ctx.commute, date),
      groups, mins, core: core.reduce((a, n) => a + (mins[n] || 0), 0) };
  });
  years.set(y, days);
  return days;
}

// 第一条（总量）的档：0 没记，1–5 越来越浓（7 小时分五档），超过 7 小时 = OVER_LEVEL（红）；金条那天不红，算最浓一档
export const OVER_LEVEL = 6;
export function coreLevel(min, gold = false) {
  const v = Number(min) || 0;
  if (v <= 0) return 0;
  if (v > LONG_DAY) return gold ? 5 : OVER_LEVEL;
  return Math.ceil(v / (LONG_DAY / 5));
}
// 第三条（单看 Build 或 Work）的档：0–5 小时，每小时一档，再多也是最浓
export function heatLevel(min) {
  const v = Number(min) || 0;
  return v <= 0 ? 0 : Math.min(5, Math.ceil(v / 60));
}

// 一年排成一条：一列一周、一行星期几。→ { start: 第一列第一格的日子, first: 1 月 1 号在第几行, weeks: 几列, months: [{ month, date: 那月 1 号, col: 落在第几列 }] }（行、列从 1 数）
export function stripLayout(y, weekStartsOn = "monday") {
  const jan1 = isoOf(y, 1, 1), start = startOfWeek(jan1, weekStartsOn);
  const col = (d) => Math.floor(diffDays(start, d) / 7) + 1;
  const months = Array.from({ length: 12 }, (_, month) => { const date = isoOf(y, month + 1, 1); return { month, date, col: col(date) }; });
  return { start, first: diffDays(start, jan1) + 1, weeks: col(isoOf(y, 12, 31)), months };
}

// 第二条（每天的细节）一天要画什么（她 2026-11-18 定的）：Fitness、Chores、通勤是右边三个点，别的大类填色（按大类清单的顺序），
// 休息日金框，周末和假期字淡
const DOT_GROUPS = ["Fitness", "Chores"];
export function marksOf(day, groups) {
  return {
    fills: (groups || []).filter((g) => day.groups.has(g.name) && !DOT_GROUPS.includes(g.name)),
    fitness: day.groups.has("Fitness"), chores: day.groups.has("Chores"), commute: Boolean(day.commute),
    rest: Boolean(day.rest), soft: Boolean(day.weekend || day.holiday)
  };
}

// 色块上的字用黑还是白：几段颜色里最难看清的那段，也要尽量看得清。认不出的颜色（比如 CSS 变量）当中间灰
const INK = "#0B0B0B", PAPER = "#FFFFFF";
function luminance(color) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color || "").trim());
  if (!m) return 0.5;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function inkOn(colors) {
  const worst = (ink) => Math.min(...colors.map((c) => {
    const a = luminance(c), b = luminance(ink);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }));
  return worst(PAPER) > worst(INK) ? PAPER : INK;
}
