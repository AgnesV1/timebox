// 记账的计算（不碰页面）：按日 / 月 / 年加总、预算、超没超、图表的线、推荐、导出成 .md、从文字里导入。
// 一笔 = { id, d: "2026-10-15", v: 分（负 = 支出、正 = 收入）, c: 类别, n: 备注, u: 改的时间, cur: 哪种钱（没写 = 加币，见下面 CURS） }。只记年月日，不记钟点。
// 预算 = 从某个月起每月多少（{ from: "2026-10", v: 分, cur: 哪种钱（没写 = 加币） }，一个月用它之前最近定的那个）。
// 预算按当时用的那种钱定（2017 年澳币、2018 年起人民币、2023-09 起加币），看的时候和每一笔一样按汇率换成「看的那种」。
// 类别 = { name, kind: "out" / "in", hidden, role }：role "base" = 预算的底座（House：月度图里是梯形下面那一截，
// 每天的额度不算它）；"outside" = 算支出、不算进预算（Bonds：押金、还没出正式账单的，以后要回来的）。

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const DEFAULT_CATS = [
  ...["House", "Food", "Bonds", "Entertainment", "Health", "Clothes", "Traffic", "Drink", "Education", "Gift", "Cosmetic"]
    .map((name) => ({ name, kind: "out", hidden: false, role: name === "House" ? "base" : name === "Bonds" ? "outside" : "" })),
  ...["Salary", "Extra"].map((name) => ({ name, kind: "in", hidden: false, role: "" }))
];

export const pad2 = (n) => String(n).padStart(2, "0");
export const iso = (y, m, d) => y + "-" + pad2(m) + "-" + pad2(d);
export const ym = (y, m) => y + "-" + pad2(m);
export function parts(d) { const [y, m, dd] = String(d).split("-").map(Number); return { y, m, d: dd }; }
export const dim = (y, m) => new Date(y, m, 0).getDate();
export const ord = (y, m, d = 1) => y * 10000 + m * 100 + d;
export function addMonths(y, m, k) { const t = (y * 12 + m - 1) + k; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; }
export function addDaysISO(d, k) { const p = parts(d), t = new Date(Date.UTC(p.y, p.m - 1, p.d + k)); return t.toISOString().slice(0, 10); }
export const fmtDate = (d) => { const p = parts(d); return MON[p.m - 1] + " " + p.d + ", " + p.y; };

// 币种：每一笔按记的那种钱存（e.cur；没写 = 加币），看的时候整份换成一种（默认加币，每台设备自己能换，见 js/spend.js 的 show）。
// 汇率都对加币：rates.cny = 1 加币合几块人民币，存在 Settings 的 spend-fx（{ rates: { cny: { v, at, ecb } } }），自己填，或者点一下拉欧洲央行当天的。
// 还没填过的用 ROUGH（2026-10-20 欧洲央行的，取整），只为了不算错太多；预算都按加币定。金额一律是那种钱的「分」（日元也乘 100，只是显示不带小数）
export const CURS = [
  { k: "cad", sym: "$", code: "CAD", dec: 2 }, { k: "cny", sym: "¥", code: "RMB", dec: 2 }, { k: "usd", sym: "US$", code: "USD", dec: 2 },
  { k: "eur", sym: "€", code: "EUR", dec: 2 }, { k: "gbp", sym: "£", code: "GBP", dec: 2 }, { k: "jpy", sym: "JP¥", code: "JPY", dec: 0 },
  { k: "hkd", sym: "HK$", code: "HKD", dec: 2 }, { k: "aud", sym: "A$", code: "AUD", dec: 2 }
];
const ROUGH = { cad: 1, cny: 4.75, usd: 0.71, eur: 0.635, gbp: 0.533, jpy: 112.5, hkd: 5.59, aud: 1.09 };
export const curInfo = (k) => CURS.find((c) => c.k === k) || CURS[0];
export const isCur = (k) => CURS.some((c) => c.k === k);
export const curOf = (e) => (e && isCur(e.cur) ? e.cur : "cad");
// 汇率表 { cad: 1, cny: 4.75, … }：填过的用填的，没填的用 ROUGH
export function ratesOf(fx) {
  const out = { ...ROUGH };
  for (const c of CURS) { const r = fx?.rates?.[c.k], v = Number(typeof r === "object" ? r?.v : r); if (c.k !== "cad" && v > 0) out[c.k] = v; }
  return out;
}
export const rateSet = (fx, k) => k === "cad" || Number(fx?.rates?.[k]?.v ?? fx?.rates?.[k]) > 0;
export const convert = (v, from, to, R) => (from === to ? v : Math.round(v / (R[from] || 1) * (R[to] || 1)));
// 整份换成 to 那种钱（总数、图表、类别占比都拿这份算）；原来的金额、币种留在 v0 / cur0
export const inCur = (entries, to, R) => entries.map((e) => { const c = curOf(e); return c === to ? e : { ...e, v: convert(e.v, c, to, R), v0: e.v, cur0: c }; });
// 一个金额换成「看的那种钱」时用的币种（spend.js 的 show）：页面上的 money() 不写币种时就是它
let SHOW = "cad";
export const setShow = (k) => { SHOW = isCur(k) ? k : "cad"; };
export const showing = () => SHOW;

// 钱：$1,234.56（不带正负号；要符号的地方自己加 − / +）。cur 不写 = 现在看的那种钱；日元不带小数
export const money = (c, cur = SHOW) => {
  const x = curInfo(cur);
  return x.sym + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: x.dec, maximumFractionDigits: x.dec });
};
export const signed = (c, cur = SHOW) => (c < 0 ? "−" : "+") + money(c, cur);
// 用户打的金额 → 分。「12.5」「$1,450」「−23.15」都认；认不出来是 NaN
export const toCents = (s) => Math.round(parseFloat(String(s ?? "").replace(/[^\d.]/g, "")) * 100);

export const roleOf = (cats, name) => (cats.find((c) => c.name === name) || {}).role || "";
export const kindOf = (cats, name) => (cats.find((c) => c.name === name) || {}).kind || "";

// 一段时间：mode = "day" / "month" / "year"，p = { y, m, d }
export const keyOf = (p, mode) => (mode === "day" ? iso(p.y, p.m, p.d) : mode === "month" ? ym(p.y, p.m) : String(p.y));
export const samePeriod = (a, b, mode) => keyOf(a, mode) === keyOf(b, mode);
export function inPeriod(e, p, mode) { return e.d.startsWith(mode === "day" ? iso(p.y, p.m, p.d) : mode === "month" ? ym(p.y, p.m) : String(p.y)); }

const blank = () => ({ out: 0, inc: 0, base: 0, outside: 0, n: 0, nOut: 0, nIn: 0, cat: {}, cnt: {} });
export const EMPTY = Object.freeze(blank());

// 按日 / 月 / 年加总：out = 支出（正数），inc = 收入，base = 底座类别的支出，outside = 不算进预算的支出，cat / cnt = 每个类别多少钱 / 几笔
export function index(entries, cats) {
  const roles = new Map(cats.map((c) => [c.name, c.role || ""]));
  const ix = { day: new Map(), month: new Map(), year: new Map() };
  for (const e of entries) {
    for (const [mode, k] of [["day", e.d], ["month", e.d.slice(0, 7)], ["year", e.d.slice(0, 4)]]) {
      let g = ix[mode].get(k);
      if (!g) ix[mode].set(k, (g = blank()));
      g.n++;
      g.cnt[e.c] = (g.cnt[e.c] || 0) + 1;
      g.cat[e.c] = (g.cat[e.c] || 0) + Math.abs(e.v);
      if (e.v < 0) {
        g.out -= e.v; g.nOut++;
        const r = roles.get(e.c);
        if (r === "base") g.base -= e.v;
        else if (r === "outside") g.outside -= e.v;
      } else { g.inc += e.v; g.nIn++; }
    }
  }
  return ix;
}
export const sumOf = (ix, p, mode) => ix[mode].get(keyOf(p, mode)) || EMPTY;

// 这个月的预算：它之前（含）最近定的那个；一个都没定过 = 0（不画预算、不标超）
export function budgetAt(budgets, y, m) {
  const k = ym(y, m);
  let v = 0;
  for (const b of budgets) if (b.from <= k) v = b.v;
  return v;
}

// 预算整份换成 to 那种钱（R = 汇率表）
export const budgetsIn = (budgets, to, R) => budgets.map((b) => { const c = isCur(b.cur) ? b.cur : "cad"; return c === to ? b : { ...b, v: convert(b.v, c, to, R) }; });

// 一行一个预算地粘进来：「2018.08 5000 (RMB)」「2020-09 9100」「Prior 2000 (AUD)」——币种写了就一直用到下次写，没写过 = 加币；
// Prior = 最早那个（from 给 prior 那个月）。→ { list: [{ from, v, cur? }], bad: 行数 }
export function budgetsFromText(text, prior) {
  const list = [];
  let cur = "cad", bad = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(prior|before|(\d{4})\s*[.\-/年]\s*(\d{1,2})\s*月?)\s+([\d,]+(?:\.\d+)?)\s*(?:\(?\s*([A-Za-z]{3}|[¥$€£])\s*\)?)?$/i.exec(line);
    if (!m || !(+m[3] >= 1 && +m[3] <= 12) && !/^(prior|before)$/i.test(m[1])) { bad++; continue; }
    if (m[5]) cur = /^[A-Za-z]{3}$/.test(m[5]) ? curFromText("1 " + m[5]) : curFromText(m[5] + "1");
    const v = toCents(m[4].replace(/,/g, ""));
    if (!(v > 0)) { bad++; continue; }
    const from = /^(prior|before)$/i.test(m[1]) ? prior : ym(+m[2], +m[3]);
    list.push({ from, v, ...(cur !== "cad" ? { cur } : {}) });
  }
  return { list, bad };
}

// 算进预算的花销 = 支出 − 不算进预算的那几类
export const counted = (g) => g.out - g.outside;
// 每天的额度：(这个月的预算 − 底座) ÷ 这个月的天数
export function allowance(ix, budgets, y, m) {
  const B = budgetAt(budgets, y, m);
  return B ? Math.max(0, B - sumOf(ix, { y, m }, "month").base) / dim(y, m) : 0;
}
// 一年的预算：今年算到这个月，往年算满十二个月
export function yearBudget(budgets, y, today) {
  const t = parts(today), last = y === t.y ? t.m : 12;
  let s = 0;
  for (let m = 1; m <= last; m++) s += budgetAt(budgets, y, m);
  return s;
}
export function budgetOf(ix, budgets, p, mode, today) {
  return mode === "month" ? budgetAt(budgets, p.y, p.m) : mode === "year" ? yearBudget(budgets, p.y, today) : allowance(ix, budgets, p.y, p.m);
}
// 超了没有（标橙色）：月 / 年 = 算进预算的花销比预算；日 = 那个月到这一天为止一共算进预算的花销，超过这个月的预算没有。
// 她 2026-10-22 说的：没超预算就别标橙色——某一天比每天的额度花得多不算超。没定预算就永远不算超
export function isOver(ix, budgets, p, mode, today) {
  if (mode === "day") { const B = budgetAt(budgets, p.y, p.m); return B > 0 && counted(upTo(ix, p.y, p.m, p.d)) > B; }
  const B = budgetOf(ix, budgets, p, mode, today);
  return B > 0 && counted(sumOf(ix, p, mode)) > B;
}

// 图表的刻度：往上取一个好读的整数
export function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v)))), f = v / p;
  return [1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => f <= s) * p;
}

// 月度图：底座（这个月底座类别花的）+ 每天累加的其余花销（不算的那几类不算），预算 = 梯形（底座那一截 + 往上斜到预算）。
// 今天以后的按到今天为止的平均速度画虚线。house: false = 只看底座（House）以外：没有底座、线从 0 起，预算从 0 斜到「预算 − 底座」
export function monthChart(ix, budgets, y, m, today, { house = true } = {}) {
  const t = parts(today), N = dim(y, m), g = sumOf(ix, { y, m }, "month"), base = house ? g.base : 0;
  const B = house ? budgetAt(budgets, y, m) : Math.max(0, budgetAt(budgets, y, m) - g.base);
  const isCur = y === t.y && m === t.m, last = ord(y, m) > ord(t.y, t.m) ? 0 : isCur ? t.d : N;
  // 今天以后的虚线 = 到今天的 + 已经提前记下的那几笔（落在它们那天）+ 照平均速度
  const cv = [0], ahead = [0];
  for (let d = 1; d <= N; d++) { const x = sumOf(ix, { y, m, d }, "day"), k = x.out - x.base - x.outside; cv[d] = cv[d - 1] + (d <= last ? k : 0); ahead[d] = ahead[d - 1] + (d > last ? k : 0); }
  const rate = last ? cv[last] / last : 0;
  const val = (d) => (d <= last ? base + cv[d] : base + cv[last] + ahead[d] + rate * (d - last));
  const pace = (d) => (B ? base + Math.max(0, B - base) * d / N : 0);
  // over(d)：到那天一共的超过这个月的预算了（图上读数的点这时才是橙的；比斜着的预算线高不算超）
  return { n: N, B, base, last, isCur, val, pace, over: (d) => B > 0 && val(d) > B, top: niceMax(Math.max(B, val(N), base) * 1.04 || 100), used: g, home: (isCur ? t.d : N) - 1, house };
}

// 年度图：按天画一整年（能拖到任意一天），每一笔落在它自己那天（她 2026-10 要的：不再把整月的 House 堆在 1 号）。
//   线 = 每天的（支出 − 不算的）一天天加起来；House 那一块 = House 一天天加起来；
//   预算 = House 加起来 + 每天的额度（(这个月的预算 − 这个月的 House) ÷ 这个月的天数）加起来——House 付了预算也跟着涨，所以一月一号交了房租不算超。
//   以后还没记 House 的月份照最近一个月的 House、算在月初那天。今天以后按今年到今天的平均速度画虚线（提前记下的落在它们那天）。
//   house: false = 只看 House 以外：线、预算都不含 House，没有那一块，B 是「预算 − House」
export const daysIn = (y) => (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 366 : 365);
export function dayOfYear(y, m, d) { let n = d; for (let k = 1; k < m; k++) n += dim(y, k); return n; }
export function dateOfDay(y, i) { let m = 1; while (m < 12 && i > dim(y, m)) { i -= dim(y, m); m++; } return iso(y, m, i); }
export function yearChart(ix, budgets, y, today, { house = true } = {}) {
  const t = parts(today), n = daysIn(y), last = y > t.y ? 0 : y === t.y ? dayOfYear(t.y, t.m, t.d) : n;
  const val = [0], bud = [0], base = [0], ahead = [0], cap = [0];
  let i = 0, run = 0, budRun = 0, baseRun = 0, lastBase = 0, B = 0;
  for (let m = 1; m <= 12; m++) {
    const N = dim(y, m), Bm = budgetAt(budgets, y, m), g = sumOf(ix, { y, m }, "month"), started = i + 1 <= last;
    const has = g.base > 0, b = has ? g.base : started ? 0 : lastBase;   // 这个月的 House：记了的照记的；以后还没记的照最近一个月的
    if (has) lastBase = g.base;
    const allow = Bm ? Math.max(0, Bm - b) / N : 0;                     // House 以外，每天的额度
    if (y !== t.y || m <= t.m) B += house ? Bm : Math.max(0, Bm - b);   // 和 yearBudget 一样：今年算到这个月，别的年份算满十二个月
    for (let d = 1; d <= N; d++) {
      i++;
      const x = sumOf(ix, { y, m, d }, "day"), hd = has ? x.base : d === 1 ? b : 0;
      const k = x.out - x.outside - (house ? 0 : x.base);
      if (i <= last) run += k;
      ahead[i] = ahead[i - 1] + (i > last ? k : 0);   // 提前记下的、今天以后的那几笔
      val[i] = run;
      baseRun += house ? hd : 0;
      budRun += allow + (house ? hd : 0);
      base[i] = baseRun;
      bud[i] = Bm ? budRun : bud[i - 1];
      if (!Bm) budRun = bud[i];   // 没定预算的月份：预算线停着不涨
    }
    for (let k = i - N + 1; k <= i; k++) cap[k] = bud[i];   // 这个月里每一天：到这个月底为止的预算（算超没超用它）
  }
  const rate = last ? val[last] / last : 0;
  const v = (k) => (k <= last ? val[k] : val[last] + ahead[k] + rate * (k - last));
  // over(k)：到那天一共的超过到那个月底为止的预算了（读数的点这时才是橙的）
  return { n, B, last, isCur: y === t.y, val: v, budgetLine: bud, baseLine: base, house, over: (k) => cap[k] > 0 && v(k) > cap[k],
    top: niceMax(Math.max(bud[n], v(n), base[n]) * 1.04 || 100), used: sumOf(ix, { y }, "year"), home: (last || n) - 1, dateOf: (k) => dateOfDay(y, k) };
}

// 五个小方块的那条线：和之前六个月（年模式 = 之前几年）比，这个数落在什么范围里。
// 看的是这个月（今年）的时候，之前的每个月也只算到同一天（不然月中的数总是显得很少）；看已经过完的月，就整月比整月
function upTo(ix, y, m, cut) {
  const g = { out: 0, inc: 0, base: 0, outside: 0 };
  for (let d = 1; d <= cut; d++) { const x = sumOf(ix, { y, m, d }, "day"); g.out += x.out; g.inc += x.inc; g.base += x.base; g.outside += x.outside; }
  return g;
}
// leftPct = 预算还剩几成，不算底座（House）和不算进预算的（Bonds）：1 −（支出 − 底座 − 不算的）÷（预算 − 底座）；没预算 = null。
// 提前记的、日期还没到的也算在里面（记了就算）
export const metricsOf = (g, B) => ({ expense: g.out, income: g.inc, left: B - (g.out - g.outside), balance: g.inc - g.out, used: B ? (g.out - g.outside) / B : 0,
  leftPct: B - g.base > 0 ? 1 - (g.out - g.outside - g.base) / (B - g.base) : null, room: Math.max(0, B - g.base) });
export function compare(ix, budgets, p, mode, today) {
  const t = parts(today), prev = [];
  let cur, cutText = "";
  if (mode === "year") {
    const isCur = p.y === t.y, doy = isCur ? dayOfYear(t.y, t.m, t.d) : 0;
    cur = metricsOf(sumOf(ix, { y: p.y }, "year"), yearBudget(budgets, p.y, today));
    for (let k = 1; k <= 6; k++) {
      const y = p.y - k, all = sumOf(ix, { y }, "year");
      if (!all.n) continue;
      if (!isCur) { prev.push(metricsOf(all, yearBudget(budgets, y, today))); continue; }
      const g = { out: 0, inc: 0, base: 0, outside: 0 }, end = parts(dateOfDay(y, Math.min(doy, daysIn(y))));
      let B = 0;
      for (let m = 1; m <= end.m; m++) {
        const x = m < end.m ? sumOf(ix, { y, m }, "month") : upTo(ix, y, m, end.d);
        g.out += x.out; g.inc += x.inc; g.base += x.base; g.outside += x.outside; B += budgetAt(budgets, y, m);
      }
      prev.push(metricsOf(g, B));
    }
    if (isCur) cutText = "by " + MON[t.m - 1] + " " + t.d;
  } else {
    const isCur = p.y === t.y && p.m === t.m;
    cur = metricsOf(sumOf(ix, p, "month"), budgetAt(budgets, p.y, p.m));
    for (let k = 1; k <= 6; k++) {
      const q = addMonths(p.y, p.m, -k), all = sumOf(ix, q, "month");
      if (!all.n) continue;
      const cut = isCur ? Math.min(t.d, dim(q.y, q.m)) : dim(q.y, q.m);
      prev.push(metricsOf(cut === dim(q.y, q.m) ? all : upTo(ix, q.y, q.m, cut), budgetAt(budgets, q.y, q.m)));
    }
    if (isCur) cutText = "by day " + t.d;
  }
  const range = (k) => { const xs = prev.map((x) => x[k]).filter((v) => v !== null && v !== undefined); return xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : null; };
  return { cur, n: prev.length, cutText, range: { expense: range("expense"), income: range("income"), left: range("left"), leftPct: range("leftPct"), balance: range("balance") } };
}

// 推荐：①这个月之前两个月都有、同样金额的底座类别（房租、网费这类），这个月还没记的；②最近 60 天里同一类同一个金额出现得最多的那笔（至少两次）。
// 同样金额 = 同一种钱、同一个数；推荐出来的那笔带着它的币种（cur）
export function recommend(entries, cats, view, today) {
  const out = [];
  const baseCats = new Set(cats.filter((c) => c.role === "base").map((c) => c.name));
  if (view) {
    const p1 = addMonths(view.y, view.m, -1), p2 = addMonths(view.y, view.m, -2);
    const of = (p) => entries.filter((e) => e.v < 0 && baseCats.has(e.c) && e.d.startsWith(ym(p.y, p.m)));
    const key = (e) => e.c + "|" + e.v + "|" + curOf(e);
    const a = of(p1), b = of(p2), now = new Set(of(view).map(key));
    for (const e of a) {
      const k = key(e);
      if (b.some((x) => key(x) === k) && !now.has(k) && !out.some((o) => key(o) === k)) out.push({ c: e.c, v: e.v, n: e.n || "", cur: curOf(e) });
    }
  }
  const hidden = new Set(cats.filter((c) => c.hidden).map((c) => c.name));
  const from = addDaysISO(today, -60), cnt = new Map();
  for (const e of entries) {
    if (e.v > 0 || baseCats.has(e.c) || hidden.has(e.c) || e.d < from || e.d > today) continue;
    const k = e.c + "|" + e.v + "|" + curOf(e);
    cnt.set(k, (cnt.get(k) || 0) + 1);
  }
  const top = [...cnt].sort((x, y) => y[1] - x[1])[0];
  if (top && top[1] >= 2) { const [c, v, cur] = top[0].split("|"); out.push({ c, v: Number(v), n: "", cur }); }
  return out.slice(0, 3);
}

// 用过的备注：这一类里最近用过的在前
export function notesOf(entries, cat) {
  const seen = new Set(), out = [];
  for (const e of [...entries].sort((a, b) => (b.d + b.u).localeCompare(a.d + a.u))) if (e.c === cat && e.n && !seen.has(e.n)) { seen.add(e.n); out.push(e.n); }
  return out;
}

// 新的在前：日期越新越前，同一天后记的在前
export const byNewest = (a, b) => b.d.localeCompare(a.d) || (b.u || 0) - (a.u || 0);

// 导出成 .md：一个月（which = { y, m }）或全部（which = null）。表格能再导回来（fromText 认这个格式）。
// 总数、Breakdown 换成 show 那种钱（R = 汇率表）；Transactions 里每一笔是它自己的那种钱（「−¥88.00」），导回来币种还在
export function toMarkdown(entries, cats, budgets, which, today, show = "cad", R = ROUGH) {
  const rows = (which ? entries.filter((e) => e.d.startsWith(ym(which.y, which.m))) : entries.slice()).sort((a, b) => a.d.localeCompare(b.d) || (a.u || 0) - (b.u || 0));
  const conv = inCur(rows, show, R), ix = index(conv, cats), m$ = (v) => money(v, show);
  budgets = budgetsIn(budgets, show, R);
  const tot = conv.reduce((g, e) => { if (e.v < 0) g.out -= e.v; else g.inc += e.v; return g; }, { out: 0, inc: 0 });
  const lines = ["# Spending · " + (which ? MONTH[which.m - 1] + " " + which.y : "everything") + " (" + curInfo(show).code + ")", ""];
  if (which) {
    const B = budgetAt(budgets, which.y, which.m), g = sumOf(ix, which, "month");
    lines.push("Spent " + m$(tot.out) + " · Income " + m$(tot.inc) + (B ? " · Budget " + m$(B) + " · Left " + (B - counted(g) < 0 ? "−" : "") + m$(B - counted(g)) : ""), "");
  } else lines.push(rows.length + " records · exported " + fmtDate(today), "");
  const outCats = new Map(), inCats = new Map();
  for (const e of conv) (e.v < 0 ? outCats : inCats).set(e.c, ((e.v < 0 ? outCats : inCats).get(e.c) || 0) + Math.abs(e.v));
  const brk = (title, m, total) => {
    if (!m.size) return;
    lines.push("## " + title, "", "| Category | Amount | Share |", "|---|---:|---:|");
    for (const [k, v] of [...m].sort((a, b) => b[1] - a[1])) lines.push("| " + k + " | " + m$(v) + " | " + (v / (total || 1) * 100).toFixed(1) + "% |");
    lines.push("");
  };
  brk("Expense breakdown", outCats, tot.out);
  brk("Income breakdown", inCats, tot.inc);
  lines.push("## Transactions", "", "| Date | Category | Note | Amount |", "|---|---|---|---:|");
  const cell = (s) => String(s || "").replace(/\|/g, "/").replace(/\n/g, " ");
  for (const e of rows) lines.push("| " + fmtDate(e.d) + " | " + cell(e.c) + " | " + cell(e.n) + " | " + signed(e.v, curOf(e)) + " |");
  return lines.join("\n") + "\n";
}

// 金额里写的是哪种钱：符号在前（US$12、HK$5、JP¥1500、¥88、€5、£5、$12）或代码在后（88 RMB、12 usd）；都没有 = 加币
export function curFromText(s) {
  const t = String(s || "").trim().replace(/^[+−-]\s*/, "");
  const code = /([A-Za-z]{3})\s*$/.exec(t)?.[1]?.toUpperCase();
  if (code) { const hit = CURS.find((c) => c.code === code || c.k.toUpperCase() === code); if (hit) return hit.k; }
  for (const c of [...CURS].sort((a, b) => b.sym.length - a.sym.length)) if (t.startsWith(c.sym)) return c.k;
  return "cad";
}

// 从文字里导入：导出的 .md（只读 Transactions 那张表），或者一行一笔「日期, 类别, 金额, 备注」（日期 2026-10-03 或 Oct 3, 2026；金额可以带币种：¥88、88 RMB）。
// 收入：金额前面带 +，或者没带符号、类别是收入类（带 − 的一律是支出）。不认识的类别：带 + 的当新的收入类，别的当新的支出类（cats 里多出来的那几个在 added 里）
export function fromText(text, cats) {
  const rows = [], added = [];
  let bad = 0, inTx = false;
  const known = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
  const dateOf = (s) => {
    s = String(s || "").trim();
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
    if (m) { const i = MON.findIndex((x) => m[1].toLowerCase().startsWith(x.toLowerCase())); if (i >= 0) return iso(+m[3], i + 1, +m[2]); }
    return "";
  };
  const isTable = /\|\s*Date\s*\|/i.test(text);
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (isTable) {
      if (/^#/.test(line)) { inTx = /transactions/i.test(line); continue; }
      if (!inTx || !line.startsWith("|") || /^\|\s*:?-{2,}/.test(line) || /\|\s*Date\s*\|/i.test(line)) continue;
    }
    let f;
    if (line.startsWith("|")) f = line.split("|").slice(1, -1).map((s) => s.trim());
    else {
      const m = /^([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s*[,\t]\s*(.*)$/.exec(line);
      if (!m) { bad++; continue; }
      f = [m[1], ...m[2].split(/\s*[,\t]\s*/)];
    }
    // 表格是 日期 | 类别 | 备注 | 金额；一行一笔是 日期, 类别, 金额, 备注
    const d = dateOf(f[0]);
    const [c, amt, note] = line.startsWith("|") ? [f[1], f[3], f[2]] : [f[1], f[2], f.slice(3).join(", ")];
    const v = toCents(amt), cur = curFromText(amt);
    if (!d || !c || !(v > 0)) { bad++; continue; }
    let cat = known.get(c.toLowerCase());
    const plus = /^\s*\+/.test(String(amt));
    if (!cat) { cat = { name: c, kind: plus ? "in" : "out", hidden: false, role: "" }; known.set(c.toLowerCase(), cat); added.push(cat); }
    // 金额自己带了 − / + 就照它（退款、收到的礼金、收入里冲掉的一笔），没带才看类别是收是支
    const sign = /^\s*[−-]/.test(String(amt)) ? -1 : plus ? 1 : cat.kind === "in" ? 1 : -1;
    rows.push({ d, v: sign * v, c: cat.name, n: (note || "").trim(), ...(cur !== "cad" ? { cur } : {}) });
  }
  return { rows, added, bad };
}
