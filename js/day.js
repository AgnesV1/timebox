// 一天的圆盘：从早上 6 点起，外圈 6→18、内圈 18→6，每圈 12 小时；6 点在左边，顺时针（上 9 点、右 12 点、下 15 点）。
// 只做计算：钟点 → 圆盘上的分钟和角度、一段时间拆成两圈上的弧、通勤日的固定时段、把一段拆到各个小时（热力图用）。
// 「圆盘分钟」= 从 6:00 起过了多少分钟（0..1440）；0..720 在外圈，720..1440 在内圈。

export const DIAL_START = 360;   // 06:00

// 每天都算休息的那一段（用户定的）：晚上 11 点到第二天早上 8 点。圆盘上每天都画成不可用，和通勤日的固定时段一个样子
export const REST_BLOCK = { from: "23:00", to: "08:00", label: "Sleep · get ready" };

// 通勤日固定要花掉的时间（用户定的）：休息那一段，加上来回路上的两段
export const COMMUTE_BLOCKS = [
  REST_BLOCK,
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

// ---------- 白天还是夜里：跟着钟点走 ----------
// 6 点到 18 点是白天（和圆盘两圈是同一条线），其余是夜里，用这台设备的当地时间。
// 点一下日月 = 先照点的来（local.themeHold = { v: "light" | "dark", until }），管到下一个早 6 点 / 晚 6 点，之后又跟钟点。
// index.html 开头那段小脚本是同一条规则（第一笔就要画对，等不到模块加载），改这里要一起改；test/day.test.mjs 守着两边一致
export const DAY_FROM = DIAL_START / 60, DAY_TO = DAY_FROM + 12;
export const isDaytime = (at = new Date()) => { const h = at.getHours(); return h >= DAY_FROM && h < DAY_TO; };

// 下一次换班（早 6 点或晚 6 点）是什么时候（毫秒）
export function nextTurn(at = new Date()) {
  const d = new Date(at), h = d.getHours();
  d.setMinutes(0, 0, 0);
  if (h < DAY_FROM) d.setHours(DAY_FROM);
  else if (h < DAY_TO) d.setHours(DAY_TO);
  else { d.setDate(d.getDate() + 1); d.setHours(DAY_FROM); }
  return d.getTime();
}

// 现在该是哪个样子："light" / "dark"
export function lookAt(local, at = new Date()) {
  const h = local?.themeHold;
  if (h && (h.v === "light" || h.v === "dark") && at.getTime() < Number(h.until)) return h.v;
  return isDaytime(at) ? "light" : "dark";
}

// ---------- 天色跟着钟点（底图 #sky 的颜色，js/fx.js 的 tintSky 每分钟看一次） ----------
// 白天 6–18：早上偏暖（杏、浅粉），白天是平常那片淡蓝，傍晚偏粉偏紫；夜里 18–6：刚入夜带紫、地平线一抹玫红，后半夜最深，天亮前地平线泛青。
// 关键时刻之间按钟点线性过渡。top / mid / hor = 天顶、半空、地平线三个颜色；pink / blue = 左上那团玫红、右边那团电光蓝有多浓（白天）；
// stars = 星星亮几成（夜里）。点日月改过白天 / 夜里、和钟点对不上时：白天用正午的天，夜里用后半夜的天
const DAY_SKY = [[6, "#FFE6D8", "#FFF4EA", "#F6FFC4", 0.32, 0.06], [9, "#E9F3FF", "#FAFCFF", "#EEFFB8", 0.2, 0.15], [15, "#E9F3FF", "#FAFCFF", "#EEFFB8", 0.2, 0.15],
  [17, "#EDEBFF", "#FFF1F6", "#FFF0B8", 0.34, 0.12], [18, "#F3E2F4", "#FFE7EC", "#FFE0A8", 0.4, 0.08]];
const NIGHT_SKY = [[18, "#121130", "#19103A", "#3A1244", 0.25], [20, "#0A0A16", "#0B0B18", "#1A0F2E", 0.7], [23, "#07070B", "#07070B", "#0B0B14", 1],
  [27, "#07070B", "#07070B", "#0B0B14", 1], [29, "#0A0E1E", "#0C1428", "#123040", 0.5], [30, "#141B36", "#1B2A48", "#2C4A66", 0.2]];
const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => "#" + hexRGB(a).map((v, i) => Math.round(v + (hexRGB(b)[i] - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
function along(keys, h) {
  let i = 0;
  while (i < keys.length - 2 && h > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1], t = Math.min(1, Math.max(0, (h - a[0]) / (b[0] - a[0])));
  return a.map((v, j) => (j === 0 ? h : typeof v === "string" ? mixHex(v, b[j], t) : Math.round((v + (b[j] - v) * t) * 1000) / 1000));
}
export function skyAt(dark, at = new Date()) {
  const h = at.getHours() + at.getMinutes() / 60;
  if (!dark) {
    const [, top, mid, hor, pink, blue] = along(DAY_SKY, h >= DAY_FROM && h < DAY_TO ? h : 12);
    return { top, mid, hor, pink, blue, stars: 0 };
  }
  const n = h >= DAY_TO ? h : h < DAY_FROM ? h + 24 : 25;   // 18..30；白天里点成了夜里 = 凌晨一点那样
  const [, top, mid, hor, stars] = along(NIGHT_SKY, n);
  return { top, mid, hor, pink: 0, blue: 0, stars };
}
