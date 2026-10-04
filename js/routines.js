// 重复任务（Routines）：每周哪几天做、那天做多少分钟（周一 60、周三 40……）。
// 按规则在日历上提前生成接下来两周的任务，生成出来的就是普通任务，打勾、统计都照常。
// 任务的 ID = "rt:<规则 id>:<规则里的那天>"，两台设备各自生成也是同一条，不会重复。

import { addDays, range, weekday, WEEKDAYS } from "./dates.js";

export const WINDOW = 14;

export const routineTaskId = (rid, date) => "rt:" + rid + ":" + date;

export function parseRoutineTaskId(id) {
  const m = /^rt:(.+):(\d{4}-\d{2}-\d{2})$/.exec(String(id || ""));
  return m ? { rid: m[1], date: m[2] } : null;
}

export const isRoutineTask = (t) => String(t?.id || "").startsWith("rt:");

// days = [周日, 周一, …, 周六] 的分钟数；0 或空 = 那天不做
export function minutesOn(r, date) {
  const v = Number(r.days?.[weekday(date)]) || 0;
  return v > 0 ? Math.round(v) : 0;
}

export function inRange(r, date) {
  return (!r.start || date >= r.start) && (!r.end || date <= r.end);
}

// 从今天起 window 天里该有的那几次
export function occurrences(r, today, window = WINDOW) {
  if (r.paused) return [];
  const skip = new Set(r.skip || []);
  return range(today, addDays(today, window - 1))
    .filter((d) => inRange(r, d) && minutesOn(r, d) > 0 && !skip.has(d))
    .map((d) => ({ date: d, est: minutesOn(r, d) }));
}

export function weeklyMinutes(r) {
  return (r.days || []).reduce((a, v) => a + (Number(v) > 0 ? Number(v) : 0), 0);
}

// 「Mon 60 · Wed 40 · Fri 60」
export function describe(r, weekStartsOn = "monday") {
  const order = weekStartsOn === "sunday" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  const days = r.days || [];
  const on = order.filter((d) => Number(days[d]) > 0);
  if (on.length === 7 && on.every((d) => Number(days[d]) === Number(days[on[0]]))) return "Every day " + days[on[0]] + "m";
  return on.map((d) => WEEKDAYS[d] + " " + days[d]).join(" · ");
}
