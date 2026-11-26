// 跨年份的那张图（Spending 页的 All years，js/ui/spending.js）：每年年底的总余额怎么涨跌，下面是每年的收入、支出。纯计算，不碰页面。
// 她 2026-11-26 定的：
//   · 余额是每年年底自己填的总数（各账户加起来，可以几种钱：「52000 CAD + 30000 RMB」）；账本推出来的（年年收入减支出累加）只当一条淡线对照。
//   · 图上不写钱数，只写「基准年的几倍」：先按 CPI 折成基准年的钱，再按固定汇率换成同一种钱，再除以基准年。基准年默认 2021
//     （那年开始全年自己生活；之前很多年没记房租，支出偏少）。鼠标停住才看真实的数（当时的币种原样）。
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
export function bagText(bag) {
  const list = Object.entries(bag || {}).filter(([, v]) => v).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (!list.length) return "—";
  return list.map(([k, v]) => (v < 0 ? "−" : "") + curInfo(k).sym + (Math.abs(v) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })).join(" + ");
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
// → { years: [{ y, homes, inc, out, net（几种钱分开）, total（填的，或 null）, totalText, bad, f（CPI 乘几）, real: { inc, out, total, ledger }（基准年的钱，人民币分）,
//      x: { inc, out, total, ledger }（基准年的几倍，没有 = null）, change（比上一个有余额的年份涨了几成，实际购买力）, early（比基准年早：房租没记全）}],
//      base: { inc, out, total, ledger }（基准年那几个数，没有 = 0） }
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
  if (!by.size) return { cfg, years: [], base: { inc: 0, out: 0, total: 0, ledger: 0 } };
  const ys = [...by.keys()].filter((y) => y <= nowY + 1), lo = Math.min(...ys, cfg.base), hi = Math.max(...ys);
  const years = [];
  for (let y = lo; y <= hi; y++) {
    const r = by.get(y) || { y, inc: {}, out: {}, net: {} }, homes = homesIn(cfg.homes, y), dflt = homes[homes.length - 1]?.cur || "cad";
    const t = cfg.totals[String(y)] ? parseTotal(cfg.totals[String(y)], dflt) : null;
    const total = t && t.parts.length ? t.parts.reduce((bag, p) => addTo(bag, p.v, p.cur), {}) : null;
    const f = cpiFactor(cfg, y);
    years.push({ ...r, homes, total, totalText: cfg.totals[String(y)] || "", bad: t?.bad || [], f, early: y < cfg.base,
      real: { inc: pivot(r.inc, cfg.rates) * f, out: pivot(r.out, cfg.rates) * f, total: total ? pivot(total, cfg.rates) * f : null, ledger: null } });
  }
  // 账本推出来的余额：上一个填了余额的年份的数，加上之后每年的收入减支出（都按基准年的钱）。每碰到一个填了的年份就从它重新起算，
  // 所以每一年的实线和虚线差多少 = 那一年账本外面的进出（投资涨跌、转账、没记的）；一年都没填，就从 0 一直累加
  const first = years.findIndex((r) => r.real.total !== null);
  let run = first >= 0 ? years[first].real.total : 0;
  years.forEach((r, i) => {
    const net = pivot(r.net, cfg.rates) * r.f;
    if (first >= 0 && i < first) return;
    if (first < 0 || i > first) run += net;
    r.real.ledger = run;
    if (r.real.total !== null) run = r.real.total;
  });
  const b = years.find((r) => r.y === cfg.base);
  // 基准年没填余额：用离它最近的那一年的余额当 ×1（并说一声）
  const tb = b?.real.total ?? nearest(years, cfg.base)?.real.total ?? null;
  const base = { inc: b?.real.inc || 0, out: b?.real.out || 0, total: tb || 0, ledger: b?.real.ledger || tb || 0, totalFrom: b?.real.total != null ? cfg.base : nearest(years, cfg.base)?.y || null };
  const x = (v, d) => (v === null || v === undefined || !(d > 0) ? null : v / d);
  let prev = null;
  for (const r of years) {
    r.x = { inc: r.real.inc ? x(r.real.inc, base.inc) : null, out: r.real.out ? x(r.real.out, base.out) : null, total: x(r.real.total, base.total), ledger: x(r.real.ledger, base.total || base.ledger) };
    r.change = r.real.total !== null && prev && prev.real.total > 0 ? r.real.total / prev.real.total - 1 : null;
    if (r.real.total !== null) prev = r;
  }
  return { cfg, years, base };
}
const nearest = (years, y) => years.filter((r) => r.real.total !== null).sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y) || b.y - a.y)[0] || null;

// 「×1.32」
export const times = (v) => (v === null || v === undefined ? "—" : "×" + (Math.abs(v) >= 10 ? v.toFixed(0) : String(Number(v.toFixed(2)))));
// 纵轴的刻度：0 到最大值之间挑 4、5 个整齐的倍数（×0.5、×1、×1.5…）
export function ticks(max, min = 0) {
  const span = Math.max(0.5, max - Math.min(0, min)), raw = span / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) || mag * 10;
  const out = [];
  for (let v = Math.floor(Math.min(0, min) / step) * step; v <= max + step * 0.5; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}
export const CUR_KEYS = CURS.map((c) => c.k);
