// 跨年份的那张图（Spending 页的 All years，js/ui/spending.js）：每年的结余（收入 − 支出）围着中间一条轴上下，下面是每年的收入、支出。纯计算，不碰页面。
// 她 2026-11-26 定的：
//   · 结余就是账本里每年的 Balance（收入 − 支出）。她很多年只花不挣，所以画成围着 0 那条中轴上下的柱子（她说的），不画一条累计的线。
//   · 图上不写钱数，只写倍数：先按 CPI 折成基准年的钱，再按固定汇率换成同一种钱，再除以「基准年一年花了多少」（×1 = 基准年一年的开销）。
//     结余、收入、支出用同一个尺子，上下两块对得上。基准年默认 2021（那年开始全年自己生活；之前很多年没记房租，支出偏少、结余偏多）。
//     鼠标停住才看真实的数（当时的币种原样）。
//   · 年底的总余额（各账户加起来，可以几种钱：「52000 CAD + 30000 RMB」）可填可不填，只在停住时的那张小卡里出现。
//   · CPI 默认每年 4%，哪一年不一样可以单独填（填的是住在那里那一年的通胀）；图上用灰色小字标出每年乘了多少。
//   · 汇率固定（不跟着每天的汇率走，免得汇率涨跌看起来像钱变了）：默认 1 港币 = 0.9 人民币、1 澳币 = 1 加币 = 5 人民币（1 人民币 = 0.2 澳币 / 加币）；
//     别的几种钱按 js/money.js 的粗略汇率接到加币上。都能在设置里改。
//   · 住在哪：2017 澳洲、2018–2019 香港、2020 起中国大陆、2023-09 起加拿大（默认，设置里一行一段改）。图上按这几段铺底色。
// 存在 Settings 的 spend-years（和汇率 spend-fx 一样在主表格里，不在记账那张表格里）：
//   { base, cpi, cpiBy: { "2022": 6.5 }, totals: { "2021": "52000 CAD + 30000 RMB" }, homes: "2017 Australia AUD\n…", rates: { hkd: 0.9, … } }

import { CURS, curInfo, isCur } from "./money.js";

export const DEFAULT_HOMES = "2017 Australia AUD\n2018 Hong Kong HKD\n2020 China RMB\n2023.09 Canada CAD";
// 1 单位合几块人民币
export const DEFAULT_RATES = { cny: 1, hkd: 0.9, aud: 5, cad: 5, usd: 7, eur: 7.9, gbp: 9.4, jpy: 0.045 };

export function settings(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const base = Number.isInteger(Number(r.base)) && Number(r.base) > 1990 ? Number(r.base) : 2021;
  const cpi = Number.isFinite(Number(r.cpi)) && r.cpi !== "" && r.cpi !== null ? Number(r.cpi) : 4;
  const rates = { ...DEFAULT_RATES };
  for (const [k, v] of Object.entries(r.rates || {})) if (isCur(k) && Number(v) > 0) rates[k] = Number(v);
  const cpiBy = {};
  for (const [y, v] of Object.entries(r.cpiBy || {})) if (/^\d{4}$/.test(y) && v !== "" && v !== null && Number.isFinite(Number(v))) cpiBy[y] = Number(v);
  const totals = {};
  for (const [y, v] of Object.entries(r.totals || {})) if (/^\d{4}$/.test(y) && String(v || "").trim()) totals[y] = String(v).trim();
  return { base, cpi, cpiBy, totals, rates, homesText: typeof r.homes === "string" ? r.homes : DEFAULT_HOMES, homes: parseHomes(typeof r.homes === "string" ? r.homes : DEFAULT_HOMES) };
}

// ---------- 钱 ----------

// 「52000 CAD + 30000 RMB」「¥30,000」「-1200 hkd」→ [{ v: 分, cur }]；没写币种的用 dflt（那一年住的地方的钱）。认不出来的那一截记在 bad
const ALIAS = { rmb: "cny", cny: "cny", "¥": "cny", "元": "cny", "块": "cny", hkd: "hkd", "hk$": "hkd", "港币": "hkd", aud: "aud", "a$": "aud", "澳币": "aud", cad: "cad", "c$": "cad", "加币": "cad",
  usd: "usd", "us$": "usd", "美元": "usd", eur: "eur", "€": "eur", gbp: "gbp", "£": "gbp", jpy: "jpy", "jp¥": "jpy", "日元": "jpy" };
export function parseTotal(text, dflt = "cad") {
  const parts = [], bad = [];
  for (const raw of String(text || "").split(/\s*\+\s*/)) {
    const s = raw.trim();
    if (!s) continue;
    const m = /^(-|−)?\s*([^\d\s.,-]*)\s*([\d,]+(?:\.\d+)?)\s*(k|w|万)?\s*([^\d\s]*)$/i.exec(s);
    if (!m) { bad.push(s); continue; }
    const word = (m[5] || m[2] || "").toLowerCase(), cur = word ? ALIAS[word] || (word === "$" ? dflt : "") : dflt;
    if (!cur) { bad.push(s); continue; }
    const mult = /k/i.test(m[4] || "") ? 1e3 : m[4] ? 1e4 : 1;
    parts.push({ v: Math.round(Number(m[3].replace(/,/g, "")) * mult * 100) * (m[1] ? -1 : 1), cur });
  }
  return { parts, bad };
}

// 几种钱分开加：{ cny: 分, cad: 分 }
export function addTo(bag, v, cur) { bag[cur] = (bag[cur] || 0) + v; return bag; }
// 按固定汇率换成人民币（分）
export const pivot = (bag, rates) => Object.entries(bag).reduce((s, [k, v]) => s + v * (rates[k] || 1), 0);
// 真实的数，当时的币种原样：「A$32,000 + ¥1,200」；大的在前
// signed = 结余那种：每一种钱各带 + / −，用 · 隔开（「+¥24,520 · −$8,760」：那年在国内存下来、到了加拿大花出去）
export function bagText(bag, signed = false) {
  const list = Object.entries(bag || {}).filter(([, v]) => v).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (!list.length) return "—";
  return list.map(([k, v]) => (v < 0 ? "−" : signed ? "+" : "") + curInfo(k).sym + (Math.abs(v) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })).join(signed ? " · " : " + ");
}

// ---------- 住在哪 ----------

// 一行一段：「2018 Hong Kong HKD」「2023.09 Canada CAD」→ [{ from: "2023-09", place, cur }]，按时间排；币种不写就沿用上一段的
export function parseHomes(text) {
  const out = [];
  let last = "cad";
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^\s*(\d{4})(?:[.\-/](\d{1,2}))?\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    let place = m[3], cur = last;
    const tail = /\s+\(?([A-Za-z]{3})\)?$/.exec(place);
    if (tail && ALIAS[tail[1].toLowerCase()]) { cur = ALIAS[tail[1].toLowerCase()]; place = place.slice(0, tail.index).trim(); }
    last = cur;
    out.push({ from: m[1] + "-" + String(Number(m[2] || 1)).padStart(2, "0"), place, cur });
  }
  return out.sort((a, b) => a.from.localeCompare(b.from));
}
// 某个月住在哪（"2019-06"）；比第一段还早就算第一段
export function homeAt(homes, ym) {
  let at = homes[0] || null;
  for (const h of homes) if (h.from <= ym) at = h;
  return at;
}
// 那一年住过的几处（年中搬家的两处都算），按先后
export function homesIn(homes, y) {
  const out = [];
  for (let m = 1; m <= 12; m++) { const h = homeAt(homes, y + "-" + String(m).padStart(2, "0")); if (h && !out.includes(h)) out.push(h); }
  return out;
}

// ---------- CPI ----------

// 那一年的通胀（%）：单独填过的，不然默认
export const rateIn = (cfg, y) => (String(y) in cfg.cpiBy ? cfg.cpiBy[String(y)] : cfg.cpi);
// 那一年的钱乘几，变成基准年的钱：比基准年早的往上乘（钱以前更值钱），晚的往下除
export function cpiFactor(cfg, y) {
  let f = 1;
  if (y < cfg.base) for (let k = y + 1; k <= cfg.base; k++) f *= 1 + rateIn(cfg, k) / 100;
  else for (let k = cfg.base + 1; k <= y; k++) f /= 1 + rateIn(cfg, k) / 100;
  return f;
}

// ---------- 一年一行 ----------

// entries：记账的每一笔（{ d, v 分（负 = 支出）, cur }）；today = "2026-11-26"
// → { years: [{ y, homes, inc, out, net（几种钱分开）, total（填的，或 null）, totalText, bad, f（CPI 乘几）, real: { inc, out, bal, total }（基准年的钱，人民币分）,
//      x: { bal, inc, out, total }（基准年一年开销的几倍，没有 = null）, early（比基准年早：房租没记全）}],
//      unit（尺子：基准年一年的开销，人民币分）, unitYear（尺子是哪一年的，基准年没账时是别的年份） }
export function build(entries, raw, today) {
  const cfg = settings(raw), nowY = Number(String(today).slice(0, 4));
  const by = new Map();
  const row = (y) => { if (!by.has(y)) by.set(y, { y, inc: {}, out: {}, net: {} }); return by.get(y); };
  for (const e of entries || []) {
    const y = Number(String(e.d).slice(0, 4)), v = Number(e.v) || 0, cur = isCur(e.cur) ? e.cur : "cad";
    if (!y || !v) continue;
    const r = row(y);
    addTo(v > 0 ? r.inc : r.out, Math.abs(v), cur);
    addTo(r.net, v, cur);
  }
  for (const y of Object.keys(cfg.totals)) row(Number(y));
  if (!by.size) return { cfg, years: [], unit: 0, unitYear: null };
  // 到今年为止：十二月提前记下的明年一月房租，等明年到了才多出一列（新的一年自己加进来，柱子跟着变窄）
  const ys = [...by.keys()].filter((y) => y <= nowY), lo = Math.min(...ys, cfg.base), hi = Math.max(...ys);
  const years = [];
  for (let y = lo; y <= hi; y++) {
    const r = by.get(y) || { y, inc: {}, out: {}, net: {} }, homes = homesIn(cfg.homes, y), dflt = homes[homes.length - 1]?.cur || "cad";
    const t = cfg.totals[String(y)] ? parseTotal(cfg.totals[String(y)], dflt) : null;
    const total = t && t.parts.length ? t.parts.reduce((bag, p) => addTo(bag, p.v, p.cur), {}) : null;
    const f = cpiFactor(cfg, y);
    years.push({ ...r, homes, total, totalText: cfg.totals[String(y)] || "", bad: t?.bad || [], f, early: y < cfg.base,
      real: { inc: pivot(r.inc, cfg.rates) * f, out: pivot(r.out, cfg.rates) * f, bal: 0, total: total ? pivot(total, cfg.rates) * f : null } });
  }
  // 尺子：基准年一年花了多少（那年没有支出，就用离它最近、有支出的那一年）
  const b = years.find((r) => r.y === cfg.base && r.real.out > 0) || years.filter((r) => r.real.out > 0).sort((p, q) => Math.abs(p.y - cfg.base) - Math.abs(q.y - cfg.base) || q.y - p.y)[0] || null;
  const unit = b ? b.real.out : 0, x = (v) => (v === null || v === undefined || !(unit > 0) ? null : v / unit);
  for (const r of years) {
    const has = r.real.inc || r.real.out;
    r.real.bal = r.real.inc - r.real.out;
    r.x = { bal: has ? x(r.real.bal) : null, inc: r.real.inc ? x(r.real.inc) : null, out: r.real.out ? x(r.real.out) : null, total: x(r.real.total) };
  }
  return { cfg, years, unit, unitYear: b ? b.y : null };
}

// 「×1.32」；signed = 结余那种，带 + / −（「+×0.3」「−×0.12」）
export const signedTimes = (v) => (v === null || v === undefined ? "—" : v === 0 ? "0" : (v > 0 ? "+" : "−") + times(Math.abs(v)));
export const times = (v) => (v === null || v === undefined ? "—" : "×" + (Math.abs(v) >= 10 ? v.toFixed(0) : String(Number(v.toFixed(2)))));
// 纵轴的刻度：0 到最大值之间挑 4、5 个整齐的倍数（×0.5、×1、×1.5…）
export function ticks(max, min = 0) {
  const span = Math.max(0.5, max - Math.min(0, min)), raw = span / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) || mag * 10;
  const out = [];
  for (let v = Math.floor(Math.min(0, min) / step) * step; v <= max + step * 0.5; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}
// 围着 0 上下对称的刻度（结余那一块）：[-1, -0.5, 0, 0.5, 1] 这样
export function ticksAround(maxAbs) {
  const m = Math.max(0.25, maxAbs), raw = m / 2, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= raw - 1e-12), n = Math.ceil(m / step - 1e-9);
  return Array.from({ length: 2 * n + 1 }, (_, i) => Math.round((i - n) * step * 1000) / 1000);
}

// 每一处住的地方那段时间里，账都记成了哪种钱：[{ home, from, to（不含）, total, by: { cur: [id…] } }]。
// 和那地方的钱不一样的，Years 设置里给一个按钮一口气改过来（金额不动）
export function recordsByHome(entries, homes) {
  return homes.map((h, k) => {
    const to = homes[k + 1]?.from || "9999-99", from = k === 0 ? "0000-00" : h.from, by = {};
    let total = 0;
    for (const e of entries || []) {
      const ym = String(e.d).slice(0, 7);
      if (ym < from || ym >= to) continue;
      const cur = isCur(e.cur) ? e.cur : "cad";
      (by[cur] = by[cur] || []).push(e.id);
      total++;
    }
    return { home: h, from: h.from, to: homes[k + 1]?.from || "", total, by };
  });
}
// 从第一笔账起到今天的总结余（她 2026-11-26：All years 上面写一个「2017 年以来一共结余多少」，按她现在看的那种钱）：
// 到今天为止的每一笔（提前记的还没到的不算），conv(v, cur) 换成看的那种钱（js/ui/spending.js 用今天的汇率）。
// → { from（第一笔那一年）, inc, out, net（都是换过的分）, n（几笔） }；一笔都没有 = null
export function totalSince(entries, today, conv) {
  let from = 0, inc = 0, out = 0, n = 0;
  for (const e of entries || []) {
    if (!e?.d || e.d > today || !Number(e.v)) continue;
    const y = Number(String(e.d).slice(0, 4)), v = conv(Number(e.v), isCur(e.cur) ? e.cur : "cad");
    if (!from || y < from) from = y;
    if (v > 0) inc += v; else out -= v;
    n++;
  }
  return n ? { from, inc, out, net: inc - out, n } : null;
}
export const CUR_KEYS = CURS.map((c) => c.k);

// ---------- 画法 ----------

const r2 = (v) => Math.round(v * 100) / 100;

// 结余那条线：穿过每一点的平滑曲线，不会冲过头（单调三次插值，Fritsch–Carlson）——到了一年的高点 / 低点就平平地拐回来，
// 不会在两点之间多鼓出一个假的山头、越过中轴。pts = [{ x, y }]（x 从小到大）→ SVG 路径的字
export function smooth(pts) {
  const n = pts.length;
  if (!n) return "";
  const P = (p) => r2(p.x) + " " + r2(p.y);
  if (n === 1) return "M" + P(pts[0]);
  if (n === 2) return "M" + P(pts[0]) + "L" + P(pts[1]);
  const dx = [], s = [];
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1].x - pts[i].x); s.push((pts[i + 1].y - pts[i].y) / (dx[i] || 1)); }
  const m = [s[0]];
  for (let i = 1; i < n - 1; i++) m.push(s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2);
  m.push(s[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (s[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / s[i], b = m[i + 1] / s[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * s[i]; m[i + 1] = t * b * s[i]; }
  }
  let d = "M" + P(pts[0]);
  for (let i = 0; i < n - 1; i++) {
    const t = dx[i] / 3;
    d += "C" + r2(pts[i].x + t) + " " + r2(pts[i].y + m[i] * t) + " " + r2(pts[i + 1].x - t) + " " + r2(pts[i + 1].y - m[i + 1] * t) + " " + P(pts[i + 1]);
  }
  return d;
}
