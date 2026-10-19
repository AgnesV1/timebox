// 记账的计算（不碰页面）：按日 / 月 / 年加总、预算、超没超、图表的线、推荐、导出成 .md、从文字里导入。
// 一笔 = { id, d: "2026-10-15", v: 分（负 = 支出、正 = 收入）, c: 类别, n: 备注, u: 改的时间 }。只记年月日，不记钟点。
// 预算 = 从某个月起每月多少（{ from: "2026-10", v: 分 }，一个月用它之前最近定的那个）。
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

// 钱：$1,234.56（不带正负号；要符号的地方自己加 − / +）
export const money = (c) => "$" + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const signed = (c) => (c < 0 ? "−" : "+") + money(c);
// 用户打的金额 → 分。「12.5」「$1,450」「−23.15」都认；认不出来是 NaN
export const toCents = (s) => Math.round(parseFloat(String(s ?? "").replace(/[^\d.]/g, "")) * 100);

export const roleOf = (cats, name) => (cats.find((c) => c.name === name) || {}).role || "";
export const kindOf = (cats, name) => (cats.find((c) => c.name === name) || {}).kind || "";

// 一段时间：mode = "day" / "month" / "year"，p = { y, m, d }
export const keyOf = (p, mode) => (mode === "day" ? iso(p.y, p.m, p.d) : mode === "month" ? ym(p.y, p.m) : String(p.y));
export const samePeriod = (a, b, mode) => keyOf(a, mode) === keyOf(b, mode);
export function inPeriod(e, p, mode) { return e.d.startsWith(mode === "day" ? iso(p.y, p.m, p.d) : mode === "month" ? ym(p.y, p.m) : String(p.y)); }
export function isFuture(p, mode, today) {
  const t = parts(today);
  return mode === "day" ? ord(p.y, p.m, p.d) > ord(t.y, t.m, t.d) : mode === "month" ? ord(p.y, p.m) > ord(t.y, t.m) : p.y > t.y;
}

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
// 超了没有：日 = 底座和不算的以外，比每天的额度；月 / 年 = 算进预算的花销比预算。没定预算就永远不算超
export function isOver(ix, budgets, p, mode, today) {
  const g = sumOf(ix, p, mode), B = budgetOf(ix, budgets, p, mode, today);
  if (!B) return false;
  return mode === "day" ? g.out - g.base - g.outside > B : counted(g) > B;
}

// 图表的刻度：往上取一个好读的整数
export function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v)))), f = v / p;
  return [1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => f <= s) * p;
}

// 月度图：底座（这个月底座类别花的）+ 每天累加的其余花销（不算的那几类不算），预算 = 梯形（底座那一截 + 往上斜到预算）。
// 今天以后的按到今天为止的平均速度画虚线
export function monthChart(ix, budgets, y, m, today) {
  const t = parts(today), N = dim(y, m), B = budgetAt(budgets, y, m), g = sumOf(ix, { y, m }, "month"), base = g.base;
  const isCur = y === t.y && m === t.m, last = ord(y, m) > ord(t.y, t.m) ? 0 : isCur ? t.d : N;
  const cv = [0];
  for (let d = 1; d <= N; d++) { const x = sumOf(ix, { y, m, d }, "day"); cv[d] = cv[d - 1] + (d <= last ? x.out - x.base - x.outside : 0); }
  const rate = last ? cv[last] / last : 0;
  const val = (d) => (d <= last ? base + cv[d] : base + cv[last] + rate * (d - last));
  const pace = (d) => (B ? base + Math.max(0, B - base) * d / N : 0);
  return { n: N, B, base, last, isCur, val, pace, top: niceMax(Math.max(B, val(N), base) * 1.04 || 100), used: g, home: (isCur ? t.d : N) - 1 };
}

// 年度图：按天画一整年（能拖到任意一天）。每个月和月度图一样：月初先加上这个月的底座，再一天天加其余的（不算的那几类不算），
// 预算 = 每个月一段梯形接起来（前面几个月的预算 + 这个月的底座，斜着升到这个月的预算）。今天以后按今年到今天的平均速度画虚线
export const daysIn = (y) => (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 366 : 365);
export function dayOfYear(y, m, d) { let n = d; for (let k = 1; k < m; k++) n += dim(y, k); return n; }
export function dateOfDay(y, i) { let m = 1; while (m < 12 && i > dim(y, m)) { i -= dim(y, m); m++; } return iso(y, m, i); }
export function yearChart(ix, budgets, y, today) {
  const t = parts(today), n = daysIn(y), last = y > t.y ? 0 : y === t.y ? dayOfYear(t.y, t.m, t.d) : n;
  const val = [0], bud = [0], base = [0];
  let done = 0, budDone = 0, baseDone = 0, i = 0, lastBase = 0;
  for (let m = 1; m <= 12; m++) {
    const N = dim(y, m), B = budgetAt(budgets, y, m), g = sumOf(ix, { y, m }, "month"), started = i + 1 <= last;
    const b = started ? g.base : lastBase;
    if (started && g.base) lastBase = g.base;
    let cv = 0;
    for (let d = 1; d <= N; d++) {
      i++;
      if (i <= last) { const x = sumOf(ix, { y, m, d }, "day"); cv += x.out - x.base - x.outside; }
      val[i] = done + (started ? g.base : 0) + cv;
      bud[i] = B ? budDone + b + Math.max(0, B - b) * d / N : budDone;
      base[i] = baseDone + b;
    }
    done += started ? counted(g) : 0;
    budDone += B;
    baseDone += b;
  }
  const rate = last ? val[last] / last : 0;
  const v = (k) => (k <= last ? val[k] : val[last] + rate * (k - last));
  return { n, B: yearBudget(budgets, y, today), last, isCur: y === t.y, val: v, budgetLine: bud, baseLine: base,
    top: niceMax(Math.max(bud[n], v(n)) * 1.04 || 100), used: sumOf(ix, { y }, "year"), home: (last || n) - 1, dateOf: (k) => dateOfDay(y, k) };
}

// 五个小方块的那条线：和之前六个月（年模式 = 之前几年）比，这个数落在什么范围里。
// 看的是这个月（今年）的时候，之前的每个月也只算到同一天（不然月中的数总是显得很少）；看已经过完的月，就整月比整月
function upTo(ix, y, m, cut) {
  const g = { out: 0, inc: 0, base: 0, outside: 0 };
  for (let d = 1; d <= cut; d++) { const x = sumOf(ix, { y, m, d }, "day"); g.out += x.out; g.inc += x.inc; g.base += x.base; g.outside += x.outside; }
  return g;
}
export const metricsOf = (g, B) => ({ expense: g.out, income: g.inc, left: B - (g.out - g.outside), balance: g.inc - g.out, used: B ? (g.out - g.outside) / B : 0 });
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
  const range = (k) => (prev.length >= 2 ? [Math.min(...prev.map((x) => x[k])), Math.max(...prev.map((x) => x[k]))] : null);
  return { cur, n: prev.length, cutText, range: { expense: range("expense"), income: range("income"), left: range("left"), balance: range("balance") } };
}

// 推荐：①这个月之前两个月都有、同样金额的底座类别（房租、网费这类），这个月还没记的；②最近 60 天里同一类同一个金额出现得最多的那笔（至少两次）
export function recommend(entries, cats, view, today) {
  const out = [];
  const baseCats = new Set(cats.filter((c) => c.role === "base").map((c) => c.name));
  if (view) {
    const p1 = addMonths(view.y, view.m, -1), p2 = addMonths(view.y, view.m, -2);
    const of = (p) => entries.filter((e) => e.v < 0 && baseCats.has(e.c) && e.d.startsWith(ym(p.y, p.m)));
    const a = of(p1), b = of(p2), now = new Set(of(view).map((e) => e.c + "|" + e.v));
    for (const e of a) {
      const k = e.c + "|" + e.v;
      if (b.some((x) => x.c === e.c && x.v === e.v) && !now.has(k) && !out.some((o) => o.c + "|" + o.v === k)) out.push({ c: e.c, v: e.v, n: e.n || "" });
    }
  }
  const hidden = new Set(cats.filter((c) => c.hidden).map((c) => c.name));
  const from = addDaysISO(today, -60), cnt = new Map();
  for (const e of entries) {
    if (e.v > 0 || baseCats.has(e.c) || hidden.has(e.c) || e.d < from || e.d > today) continue;
    const k = e.c + "|" + e.v;
    cnt.set(k, (cnt.get(k) || 0) + 1);
  }
  const top = [...cnt].sort((x, y) => y[1] - x[1])[0];
  if (top && top[1] >= 2) { const [c, v] = top[0].split("|"); out.push({ c, v: Number(v), n: "" }); }
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

// 导出成 .md：一个月（which = { y, m }）或全部（which = null）。表格能再导回来（fromText 认这个格式）
export function toMarkdown(entries, cats, budgets, which, today) {
  const rows = (which ? entries.filter((e) => e.d.startsWith(ym(which.y, which.m))) : entries.slice()).sort((a, b) => a.d.localeCompare(b.d) || (a.u || 0) - (b.u || 0));
  const ix = index(rows, cats);
  const tot = rows.reduce((g, e) => { if (e.v < 0) g.out -= e.v; else g.inc += e.v; return g; }, { out: 0, inc: 0 });
  const lines = ["# Spending · " + (which ? MONTH[which.m - 1] + " " + which.y : "everything") + " (CAD)", ""];
  if (which) {
    const B = budgetAt(budgets, which.y, which.m), g = sumOf(ix, which, "month");
    lines.push("Spent " + money(tot.out) + " · Income " + money(tot.inc) + (B ? " · Budget " + money(B) + " · Left " + (B - counted(g) < 0 ? "−" : "") + money(B - counted(g)) : ""), "");
  } else lines.push(rows.length + " records · exported " + fmtDate(today), "");
  const outCats = new Map(), inCats = new Map();
  for (const e of rows) (e.v < 0 ? outCats : inCats).set(e.c, ((e.v < 0 ? outCats : inCats).get(e.c) || 0) + Math.abs(e.v));
  const brk = (title, m, total) => {
    if (!m.size) return;
    lines.push("## " + title, "", "| Category | Amount | Share |", "|---|---:|---:|");
    for (const [k, v] of [...m].sort((a, b) => b[1] - a[1])) lines.push("| " + k + " | " + money(v) + " | " + (v / (total || 1) * 100).toFixed(1) + "% |");
    lines.push("");
  };
  brk("Expense breakdown", outCats, tot.out);
  brk("Income breakdown", inCats, tot.inc);
  lines.push("## Transactions", "", "| Date | Category | Note | Amount |", "|---|---|---|---:|");
  const cell = (s) => String(s || "").replace(/\|/g, "/").replace(/\n/g, " ");
  for (const e of rows) lines.push("| " + fmtDate(e.d) + " | " + cell(e.c) + " | " + cell(e.n) + " | " + signed(e.v) + " |");
  return lines.join("\n") + "\n";
}

// 从文字里导入：导出的 .md（只读 Transactions 那张表），或者一行一笔「日期, 类别, 金额, 备注」（日期 2026-10-03 或 Oct 3, 2026）。
// 收入：类别是收入类，或者金额前面带 +。不认识的类别：带 + 的当新的收入类，别的当新的支出类（cats 里多出来的那几个在 added 里）
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
    const v = toCents(amt);
    if (!d || !c || !(v > 0)) { bad++; continue; }
    let cat = known.get(c.toLowerCase());
    const plus = /^\s*\+/.test(String(amt));
    if (!cat) { cat = { name: c, kind: plus ? "in" : "out", hidden: false, role: "" }; known.set(c.toLowerCase(), cat); added.push(cat); }
    rows.push({ d, v: cat.kind === "in" ? v : -v, c: cat.name, n: (note || "").trim() });
  }
  return { rows, added, bad };
}
