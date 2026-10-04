// 日期一律是 "YYYY-MM-DD" 字符串。加减天数走 UTC，避开夏令时那天只有 23 小时的坑。

const pad = (n) => String(n).padStart(2, "0");
const parts = (s) => s.split("-").map(Number);

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function isoOf(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate());
}

export function addDays(s, n) {
  const [y, m, d] = parts(s);
  return isoOf(y, m, d + n);
}

export function diffDays(a, b) {
  const [y1, m1, d1] = parts(a);
  const [y2, m2, d2] = parts(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}

export function weekday(s) {
  const [y, m, d] = parts(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function localIso(date) {
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

// 「今天」从 dayStartsAt 开始算：熬夜过了零点，还算前一天
export function todayIso(dayStartsAt = "04:00", now = new Date()) {
  const [h, m] = String(dayStartsAt).split(":").map(Number);
  return localIso(new Date(now.getTime() - ((h || 0) * 60 + (m || 0)) * 60000));
}

export function startOfWeek(s, weekStartsOn = "monday") {
  const wd = weekday(s);
  return addDays(s, -(weekStartsOn === "sunday" ? wd : (wd + 6) % 7));
}

export function startOfMonth(s) {
  return s.slice(0, 8) + "01";
}

export function addMonths(s, n) {
  const [y, m] = parts(s);
  return isoOf(y, m + n, 1);
}

export function daysInMonth(s) {
  const [y, m] = parts(s);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// from 到 to（含两头）的每一天；最多 1500 天，防止日期填错时卡死
export function range(from, to) {
  const out = [];
  if (!from || !to || to < from) return out;
  for (let d = from; d <= to && out.length < 1500; d = addDays(d, 1)) out.push(d);
  return out;
}

export function fmtDay(s) {
  const [, m, d] = parts(s);
  return WEEKDAYS[weekday(s)] + ", " + MONTHS[m - 1] + " " + d;
}

export function fmtShort(s) {
  const [, m, d] = parts(s);
  return MONTHS[m - 1] + " " + d;
}

// 45 → "45m"，90 → "1h 30m"，120 → "2h"
export function fmtMin(min) {
  const v = Math.max(0, Math.round(Number(min) || 0));
  if (v < 60) return v + "m";
  const h = Math.floor(v / 60), r = v % 60;
  return r ? h + "h " + r + "m" : h + "h";
}
