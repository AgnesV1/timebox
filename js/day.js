// 一天的圆盘：从早上 6 点起，外圈 6→18、内圈 18→6，每圈 12 小时；6 点在左边，顺时针（上 9 点、右 12 点、下 15 点）。
// 只做计算：钟点 → 圆盘上的分钟和角度、一段时间拆成两圈上的弧、通勤日的固定时段、把一段拆到各个小时（热力图用）。
// 「圆盘分钟」= 从 6:00 起过了多少分钟（0..1440）；0..720 在外圈，720..1440 在内圈。

export const DIAL_START = 360;   // 06:00

// 通勤日固定要花掉的时间（用户定的）
export const COMMUTE_BLOCKS = [
  { from: "23:00", to: "08:00", label: "Sleep · get ready" },
  { from: "08:00", to: "09:00", label: "Commute · breakfast" },
  { from: "17:00", to: "18:30", label: "Commute" }
];

const toMin = (hm) => { const [h, m] = String(hm).split(":").map(Number); return (h || 0) * 60 + (m || 0); };

// 钟点 → 圆盘分钟（0..1439）
export const dialMin = (hm) => (((toMin(hm) - DIAL_START) % 1440) + 1440) % 1440;

// 一段 [from, to) → 圆盘上的区间 [{a, b}]；跨过 6 点的拆成尾巴和开头两段。起止一样 = 没有
export function spans(from, to) {
  if (!from || !to) return [];
  const a = dialMin(from), b = dialMin(to);
  if (a === b) return [];
  return b > a ? [{ a, b }] : [{ a, b: 1440 }, ...(b > 0 ? [{ a: 0, b }] : [])];
}

// 区间再按 18 点拆到两圈：[{ring: "outer" | "inner", a, b}]，a / b 仍是圆盘分钟
export function rings(span) {
  const out = [];
  if (span.a < 720) out.push({ ring: "outer", a: span.a, b: Math.min(span.b, 720) });
  if (span.b > 720) out.push({ ring: "inner", a: Math.max(span.a, 720), b: span.b });
  return out;
}

// 一串 {from, to, …} → 两圈上的弧（带着原来的字段）
export function arcs(list) {
  return list.flatMap((x) => spans(x.from, x.to).flatMap(rings).map((r) => ({ ...x, ...r })));
}

// 圆盘分钟 → 角度（度；SVG 坐标，0° 朝右、顺时针为正）。每圈的开头在左边 = 180°
export const angleOf = (m) => 180 + ((m % 720) / 720) * 360;

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
