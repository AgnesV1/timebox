// 一天的螺旋：一圈 = 一天，从早上 6 点起顺时针——6 点在左、中午在上、18 点在右、半夜在下（太阳走的路）。
// 昨天、今天、明天三圈连成一条螺旋，越往外越晚。
// 只做计算：钟点 → 螺旋上的分钟和角度、一段时间落在螺旋的哪里、通勤日的固定时段、把一段拆到各个小时（热力图用）。

import { diffDays } from "./dates.js";

export const DIAL_START = 360;   // 06:00：每一圈从这里开始
export const TURN = 1440;        // 一圈多少分钟

// 通勤日固定要花掉的时间（用户定的）
export const COMMUTE_BLOCKS = [
  { from: "23:00", to: "08:00", label: "Sleep · get ready" },
  { from: "08:00", to: "09:00", label: "Commute · breakfast" },
  { from: "17:00", to: "18:30", label: "Commute" }
];

const toMin = (hm) => { const [h, m] = String(hm).split(":").map(Number); return (h || 0) * 60 + (m || 0); };

// 钟点 → 这一圈上的分钟（从 6:00 起，0..1439）
export const dialMin = (hm) => (((toMin(hm) - DIAL_START) % 1440) + 1440) % 1440;

// 一段 [from, to) → 一圈上的区间 [{a, b}]（热力图用）；跨过 6 点的拆成尾巴和开头两段。起止一样 = 没有
export function spans(from, to) {
  if (!from || !to) return [];
  const a = dialMin(from), b = dialMin(to);
  if (a === b) return [];
  return b > a ? [{ a, b }] : [{ a, b: 1440 }, ...(b > 0 ? [{ a: 0, b }] : [])];
}

// ---------- 螺旋 ----------
// 螺旋分钟 t = 从起点那天（origin）的 6:00 起过了多少分钟；可以是负的或超过三圈，画的时候再裁

// 螺旋分钟 → 角度（度；SVG 坐标，0° 朝右、顺时针为正）。6:00 = 180° 在左，一直往下转不归零，好连成螺旋
export const angleAt = (t) => 180 + (t / TURN) * 360;

// date 这天记下的钟点 hm 在螺旋上是第几分钟：早于 dayStartsAt 的算第二天凌晨（熬夜过零点还记在前一天）
export function absMin(origin, date, hm, dayStartsAt = "04:00") {
  const m = toMin(hm);
  return diffDays(origin, date) * TURN + m - DIAL_START + (m < toMin(dayStartsAt) ? TURN : 0);
}

// 一段计时 [from, to)：结束早于开始 = 过了零点；起止一样 = 没有
export function stretch(origin, date, from, to, dayStartsAt = "04:00") {
  if (!from || !to) return null;
  const a = absMin(origin, date, from, dayStartsAt);
  let b = absMin(origin, date, to, dayStartsAt);
  if (b === a) return null;
  if (b < a) b += TURN;
  return { a, b };
}

// 通勤日的固定时段：在这一天的 to 结束，往前倒推（23:00–08:00 = 前一晚睡到这天早上）
export function blockSpan(origin, date, from, to) {
  const len = (((toMin(to) - toMin(from)) % TURN) + TURN) % TURN;
  if (!len) return null;
  const b = diffDays(origin, date) * TURN + toMin(to) - DIAL_START;
  return { a: b - len, b };
}

// 某天是不是通勤日：commute = Settings 里的 {days: {"2026-10-08": true}}
export const isCommute = (commute, date) => Boolean(commute?.days?.[date]);

// 一段拆到各个小时：{h: 分钟}，h = 从 6:00 起第几个小时（0..23）
export function hourMinutes(from, to) {
  const out = {};
  for (const s of spans(from, to)) {
    for (let h = Math.floor(s.a / 60); h * 60 < s.b; h++) {
      const m = Math.min(s.b, (h + 1) * 60) - Math.max(s.a, h * 60);
      if (m > 0) out[h] = (out[h] || 0) + m;
    }
  }
  return out;
}

// 第 h 个小时的钟点：0 → "06:00"
export const hourLabel = (h) => String((6 + h) % 24).padStart(2, "0") + ":00";
