// 重复任务：在任务上设「怎么重复、重复多久」，一次把这段时间里的每一次都排进日历，每一次都是普通任务。
// 规则存在 Settings 的 routines 里：{id, title, category, projectId, optional, days, start, end, skip}
//   days = [周日, 周一, …, 周六] 那天做多少分钟（0 = 不做）；skip = 单独删掉的那几天，改规则时也不再生成。
// 每一次的 ID = "rt:<规则 id>:<原定那天>"：挪到别的天 ID 不变，所以还认得出是哪个系列的。

import { addDays, range, weekday, diffDays, WEEKDAYS } from "./dates.js";

export const MAX_DAYS = 366;
export const LENGTHS = [[7, "1 week"], [14, "2 weeks"], [28, "4 weeks"], [56, "8 weeks"], [91, "3 months"], [182, "6 months"]];
export const DEFAULT_LENGTH = 28;

export const routineTaskId = (rid, date) => "rt:" + rid + ":" + date;

export function parseRoutineTaskId(id) {
  const m = /^rt:(.+):(\d{4}-\d{2}-\d{2})$/.exec(String(id || ""));
  return m ? { rid: m[1], date: m[2] } : null;
}

export const isRoutineTask = (t) => String(t?.id || "").startsWith("rt:");

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

// 开始那天 + 多少天 → 最后一天
export const endFor = (start, days) => addDays(start, Math.min(MAX_DAYS, Math.max(1, Number(days) || DEFAULT_LENGTH)) - 1);

// 结束日期别超过一年
export const clampEnd = (start, end) => (!end || end < start ? start : diffDays(start, end) >= MAX_DAYS ? addDays(start, MAX_DAYS - 1) : end);

export function minutesOn(r, date) {
  const v = Number(r.days?.[weekday(date)]) || 0;
  return v > 0 ? Math.round(v) : 0;
}

export function inRange(r, date) {
  return (!r.start || date >= r.start) && (!r.end || date <= r.end);
}

// from 起到规则结束，每一次 {date, est}（没写结束日期的老规则不生成）
export function occurrences(r, from = r.start) {
  if (!r.end) return [];
  const skip = new Set(r.skip || []);
  return range(from > r.start ? from : r.start, r.end)
    .filter((d) => minutesOn(r, d) > 0 && !skip.has(d))
    .map((d) => ({ date: d, est: minutesOn(r, d) }));
}

// 「Every day 30m」「Weekdays 45m」「Mon 60 · Wed 40 · Fri 60」
export function describe(r, weekStartsOn = "monday") {
  const days = r.days || [];
  const p = patternOf(days, r.start || "2026-01-05");
  const first = Number(days.find((v) => Number(v) > 0)) || 0;
  if (p === "daily") return "Every day " + first + "m";
  if (p === "weekdays") return "Weekdays " + first + "m";
  const order = weekStartsOn === "sunday" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  return order.filter((d) => Number(days[d]) > 0).map((d) => WEEKDAYS[d] + " " + days[d]).join(" · ");
}
