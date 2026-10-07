// 规律计划（Regular）：存在 Projects 表一行里，规则在它的 rule：
//   { days, perWeek, min, start, end, skip, optional }
//   Auto（固定星期几）：days = [周日, 周一, …, 周六] 那天做多少分钟（0 = 不做）
//   Pool（每周几次，哪天自己拖）：perWeek 次 × min 分钟
//   end 空 = 一直重复；skip = 单独删掉的那几天，不再出现。
// 只有今天的那一次会写进 Tasks（ID = "rt:<计划 id>:<原定那天>"，挪到别的天 ID 不变）；以后的只画预览。

import { addDays, range, weekday, diffDays, WEEKDAYS } from "./dates.js";

// 加任务框「for 多久」：0 = 一直重复
export const LENGTHS = [[0, "good"], [7, "1 week"], [14, "2 weeks"], [28, "4 weeks"], [56, "8 weeks"], [91, "3 months"], [182, "6 months"]];
export const DEFAULT_LENGTH = 0;

export const routineTaskId = (rid, date) => "rt:" + rid + ":" + date;

export function parseRoutineTaskId(id) {
  const m = /^rt:(.+):(\d{4}-\d{2}-\d{2})$/.exec(String(id || ""));
  return m ? { rid: m[1], date: m[2] } : null;
}

export const isRoutineTask = (t) => String(t?.id || "").startsWith("rt:");

// 计划行 → 规则（带上 id 和名字，下面的函数都吃这个）
export const ruleOf = (p) => ({ days: [0, 0, 0, 0, 0, 0, 0], perWeek: 0, min: 0, start: "", end: "", skip: [], ...(p?.rule || {}), id: p?.id, title: p?.name || "" });

// 几种重复方式 → 一周七天各多少分钟。weekly = 和开始那天同一个星期几
export function daysFor(pattern, start, min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  const wd = weekday(start);
  return [0, 1, 2, 3, 4, 5, 6].map((d) =>
    pattern === "daily" || (pattern === "weekdays" && d > 0 && d < 6) || (pattern === "weekly" && d === wd) ? m : 0);
}

// 反过来：一周七天的分钟数是哪种方式（都对不上就是 custom）
export function patternOf(days, start) {
  const on = (days || []).map((v) => Number(v) > 0);
  const same = new Set((days || []).filter((v) => Number(v) > 0).map(Number)).size <= 1;
  if (!same) return "custom";
  if (on.every(Boolean)) return "daily";
  if (on.every((x, d) => x === (d > 0 && d < 6))) return "weekdays";
  if (on.filter(Boolean).length === 1 && on[weekday(start)]) return "weekly";
  return "custom";
}

// 开始那天 + 多少天 → 最后一天；0 = 没有最后一天
export const endFor = (start, days) => (Number(days) > 0 ? addDays(start, Number(days) - 1) : "");

// 结束日期不能早于开始；空着 = 一直重复
export const clampEnd = (start, end) => (!end ? "" : end < start ? start : end);

export function minutesOn(r, date) {
  const v = Number(r.days?.[weekday(date)]) || 0;
  return v > 0 ? Math.round(v) : 0;
}

export function inRange(r, date) {
  return (!r.start || date >= r.start) && (!r.end || date <= r.end);
}

// 那天该不该出现、做几分钟（Auto 规则）
export function dueOn(r, date) {
  if (!inRange(r, date) || (r.skip || []).includes(date)) return 0;
  return minutesOn(r, date);
}

// from 到 to（含）之间该出现的每一次 {date, est}；没有结束日期时 to 必须给
export function occurrences(r, from = r.start, to = r.end) {
  const a = from > (r.start || from) ? from : r.start || from;
  const b = r.end && (!to || r.end < to) ? r.end : to;
  if (!a || !b || b < a || diffDays(a, b) > 3660) return [];
  return range(a, b).map((d) => ({ date: d, est: dueOn(r, d) })).filter((o) => o.est > 0);
}

// 「Every day 30m」「Weekdays 45m」「Mon 60 · Wed 40 · Fri 60」「3×/week 60m」
export function describe(r, weekStartsOn = "monday", place = "auto") {
  if (place === "pool") return (Number(r.perWeek) || 0) + "×/week " + (Number(r.min) || 0) + "m";
  const days = r.days || [];
  const p = patternOf(days, r.start || "2026-01-05");
  const first = Number(days.find((v) => Number(v) > 0)) || 0;
  if (p === "daily") return "Every day " + first + "m";
  if (p === "weekdays") return "Weekdays " + first + "m";
  const order = weekStartsOn === "sunday" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  return order.filter((d) => Number(days[d]) > 0).map((d) => WEEKDAYS[d] + " " + days[d]).join(" · ");
}
