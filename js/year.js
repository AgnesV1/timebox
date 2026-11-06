// 日历的 Year 视图（只做计算，页面在 js/ui/calendar.js）：一年每天一个数字，打开的筛选把中了的日子标出来。
// 这里也放「那天红不红」这条规则（dayLoad）：周 / 月视图顶上那条和 Year 的过劳都看它，只留一份。

import { range, isoOf } from "./dates.js";
import * as E from "./engine.js";
import * as L from "./lists.js";
import { offState } from "./offdays.js";
import { isCommute } from "./day.js";
import { rowOf } from "./stats.js";

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

// 那一年每天的样子（她 2026-11-04 定的）：
//   rest     休息日 = 金条或 box 是 0；周末不算
//   holiday  假期 = 公众假日或自己标的请假（js/offdays.js），值是名字，不是假期就是空
//   commute  通勤日
//   over     过劳：2 = 超过 box，1 = 没超 box、超过 7 小时，0 = 没有
//   groups   那天记了时间的大类（「工作了」「健身了」= 记了时间，排了没做不算）
const memo = new WeakMap();
export function yearDays(ctx, y) {
  let years = memo.get(ctx);
  if (!years) memo.set(ctx, (years = new Map()));
  if (years.has(y)) return years.get(y);
  const days = range(isoOf(y, 1, 1), isoOf(y, 12, 31)).map((date) => {
    const gold = Boolean(ctx.superRest?.days?.[date]);
    const load = dayLoad(ctx, date, gold);
    const off = offState(date, ctx.offday);
    const groups = new Set();
    for (const t of E.tasksOn(ctx, date)) {
      const name = E.spentMin(t) > 0 ? rowOf(ctx, t, "group").name : "";
      if (name) groups.add(name);
    }
    return { date, rest: gold || load.rest, holiday: off.off ? off.holiday || "Day off" : "", commute: isCommute(ctx.commute, date), over: load.over ? 2 : load.long ? 1 : 0, groups };
  });
  years.set(y, days);
  return days;
}

// 筛选的几层：days = 休息日 + 通勤日 + 假期，over = 过劳，g:名字 = 那个大类
export const DAYS = "days", OVER = "over";
export const groupLayer = (name) => "g:" + name;

// 怎么画（她 2026-11-05 改的）：假期、休息日画成框；通勤和 Work、Chores 是右上角的小点；别的（超 box、其它大类）填色。三样叠得上
export const FRAMES = new Set(["rest", "holiday"]);
// 右边一竖排的点，从上到下固定这三个位置；没中的位置空着，位置本身也说明是哪个
export const DOTS = [groupLayer("Work"), groupLayer("Chores"), "commute"];
export const shapeOf = (hit) => (FRAMES.has(hit) ? "frame" : DOTS.includes(hit) ? "dot" : "fill");

// 这一天在打开的几层里中了哪几样，按上色的先后：超 box → 休息 / 假期 / 通勤 → 大类（按大类清单的顺序）。超 7 小时不填色，页面上另外标
export function hitsOf(day, on, groups) {
  const out = [];
  if (on.has(OVER) && day.over === 2) out.push("over");
  if (on.has(DAYS)) {
    if (day.rest) out.push("rest");
    if (day.holiday) out.push("holiday");
    if (day.commute) out.push("commute");
  }
  for (const g of groups) if (on.has(groupLayer(g.name)) && day.groups.has(g.name)) out.push(groupLayer(g.name));
  return out;
}

// 每一层这一年有几天
export function yearCounts(days, groups) {
  const count = (f) => days.filter(f).length;
  const out = { [DAYS]: count((d) => d.rest || d.holiday || d.commute), [OVER]: count((d) => d.over > 0) };
  for (const g of groups) out[groupLayer(g.name)] = count((d) => d.groups.has(g.name));
  return out;
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
