// 上班那一层（只做计算，日历在 js/ui/calendar.js 里画）：
// - 公众假日：安省的 9 个法定假日加 Civic Holiday，按规则每年现算；落在周末的顺延到下一个还空着的工作日。
//   单位实际放的和这份不一样时，在日历上一天天点（Settings 的 offday = {days: {"2026-10-15": true, "2026-12-28": false}}：
//   true = 自己标的不上班，false = 自动算出的假日其实要上班）。
// - 发薪日：从 PAY_FROM 起每 14 天一次，碰上假日或周末就往前挪到最近的工作日。

import { isoOf, addDays, diffDays, weekday } from "./dates.js";

export const PAY_FROM = "2026-08-12";

const isWeekend = (d) => weekday(d) === 0 || weekday(d) === 6;

// 那个月第 n 个周一
function nthMonday(y, m, n) {
  const first = isoOf(y, m, 1);
  return addDays(first, ((8 - weekday(first)) % 7) + 7 * (n - 1));
}

// 复活节（公历，Anonymous Gregorian 算法）
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return isoOf(y, Math.floor(n / 31), (n % 31) + 1);
}

const cache = new Map();

// 那一年实际放假的日子（顺延之后的）→ 假日名字
export function holidays(y) {
  if (cache.has(y)) return cache.get(y);
  const may24 = isoOf(y, 5, 24);
  const list = [
    [isoOf(y, 1, 1), "New Year's Day"],
    [nthMonday(y, 2, 3), "Family Day"],
    [addDays(easter(y), -2), "Good Friday"],
    [addDays(may24, -((weekday(may24) + 6) % 7)), "Victoria Day"],
    [isoOf(y, 7, 1), "Canada Day"],
    [nthMonday(y, 8, 1), "Civic Holiday"],
    [nthMonday(y, 9, 1), "Labour Day"],
    [nthMonday(y, 10, 2), "Thanksgiving"],
    [isoOf(y, 12, 25), "Christmas"],
    [isoOf(y, 12, 26), "Boxing Day"]
  ].sort((a, b) => a[0].localeCompare(b[0]));
  const out = new Map();
  for (const [date, name] of list) {
    let d = date;
    while (isWeekend(d) || out.has(d)) d = addDays(d, 1);
    out.set(d, name);
  }
  cache.set(y, out);
  return out;
}

export const holidayOn = (d) => holidays(Number(d.slice(0, 4))).get(d) || "";

// 某天是不是发薪日：往后找排在这天之后一周内的那次发薪，挪完正好落在这天就是
export function isPayday(d, from = PAY_FROM) {
  for (let k = 0; k < 7; k++) {
    const s = addDays(d, k);
    if (s < from || diffDays(from, s) % 14 !== 0) continue;
    let e = s;
    while (isWeekend(e) || holidayOn(e)) e = addDays(e, -1);
    return e === d;
  }
  return false;
}

// 这天上不上班：周末不算（本来就不上班，也不标）；工作日 = 自己点过的为准，没点过就看是不是假日
export function offState(d, marks) {
  if (isWeekend(d)) return { off: false, holiday: "" };
  const holiday = holidayOn(d), v = marks?.days?.[d];
  return { off: typeof v === "boolean" ? v : Boolean(holiday), holiday };
}
