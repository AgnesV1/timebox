import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/money.js";

const cats = M.DEFAULT_CATS;
const e = (d, v, c, n = "") => ({ id: d + c + v, d, v, c, n, u: 1 });
const rows = [
  e("2026-10-01", -145000, "House", "rent"), e("2026-10-01", 240000, "Salary"), e("2026-10-02", -2315, "Food", "lunch"),
  e("2026-10-02", -30000, "Bonds", "deposit"), e("2026-10-03", -899, "Drink", "coffee"), e("2026-09-20", -6500, "House", "internet"),
  e("2026-08-20", -6500, "House", "internet"), e("2026-09-01", -145000, "House", "rent"), e("2026-08-01", -145000, "House", "rent")
];
const budgets = [{ from: "2026-01", v: 358000 }, { from: "2026-09", v: 303500 }, { from: "2026-10", v: 358000 }];

test("sums by day, month and year keep House as the base and Bonds outside the budget", () => {
  const ix = M.index(rows, cats), oct = M.sumOf(ix, { y: 2026, m: 10 }, "month");
  assert.equal(oct.out, 145000 + 2315 + 30000 + 899);
  assert.equal(oct.inc, 240000);
  assert.equal(oct.base, 145000);
  assert.equal(oct.outside, 30000);
  assert.equal(M.counted(oct), 145000 + 2315 + 899);
  assert.equal(oct.cnt.House, 1);
  assert.equal(M.sumOf(ix, { y: 2026, m: 10, d: 2 }, "day").out, 2315 + 30000);
  assert.equal(M.sumOf(ix, { y: 2026 }, "year").nOut, 8);
});

test("a month uses the latest budget set on or before it", () => {
  assert.equal(M.budgetAt(budgets, 2026, 8), 358000);
  assert.equal(M.budgetAt(budgets, 2026, 9), 303500);
  assert.equal(M.budgetAt(budgets, 2027, 2), 358000);
  assert.equal(M.budgetAt(budgets, 2025, 12), 0);
  assert.equal(M.yearBudget(budgets, 2026, "2026-10-16"), 358000 * 8 + 303500 + 358000);
});

test("over budget (orange) only once the month's budget is used up: a day bigger than the daily allowance isn't over", () => {
  const ix = M.index(rows, cats);
  const al = M.allowance(ix, budgets, 2026, 10);
  assert.equal(Math.round(al), Math.round((358000 - 145000) / 31));
  const big = M.index([...rows, e("2026-10-05", -9000, "Clothes")], cats);
  assert.equal(M.isOver(big, budgets, { y: 2026, m: 10, d: 5 }, "day", "2026-10-16"), false, "$90 on one day is more than the daily allowance, but the month is fine");
  const blown = M.index([...rows, e("2026-10-05", -220000, "Clothes"), e("2026-10-06", -500, "Food")], cats);
  assert.equal(M.isOver(blown, budgets, { y: 2026, m: 10, d: 4 }, "day", "2026-10-16"), false);
  assert.equal(M.isOver(blown, budgets, { y: 2026, m: 10, d: 5 }, "day", "2026-10-16"), true, "rent + the rest so far went past $3,580 that day");
  assert.equal(M.isOver(blown, budgets, { y: 2026, m: 10, d: 6 }, "day", "2026-10-16"), true, "and every day after it");
  const bonds = M.index([...rows, e("2026-10-05", -300000, "Bonds")], cats);
  assert.equal(M.isOver(bonds, budgets, { y: 2026, m: 10, d: 5 }, "day", "2026-10-16"), false, "Bonds stay out of the budget");
  assert.equal(M.isOver(ix, budgets, { y: 2026, m: 10 }, "month", "2026-10-16"), false);
  assert.equal(M.isOver(blown, budgets, { y: 2026, m: 10 }, "month", "2026-10-16"), true);
  assert.equal(M.isOver(ix, [], { y: 2026, m: 10 }, "month", "2026-10-16"), false);   // no budget, never orange
  assert.equal(M.isOver(blown, [], { y: 2026, m: 10, d: 5 }, "day", "2026-10-16"), false);
});

test("the chart's reading dot is orange only past the budget: the month's, or in a year the budget up to that month's end", () => {
  const blown = M.index([...rows, e("2026-10-05", -220000, "Clothes")], cats);
  const c = M.monthChart(blown, budgets, 2026, 10, "2026-10-16");
  assert.equal(c.over(4), false, "above the slanted budget line isn't over yet");
  assert.equal(c.over(5), true);
  assert.equal(M.monthChart(M.index(rows, cats), budgets, 2026, 10, "2026-10-16").over(16), false);
  const y = M.yearChart(blown, budgets, 2026, "2026-10-16"), day = (m, d) => M.dayOfYear(2026, m, d);
  assert.equal(y.over(day(9, 30)), false);
  assert.equal(y.over(day(10, 5)), false, "Jan–Oct budgets add up to far more than what's been spent");
  const huge = M.yearChart(M.index([...rows, e("2026-10-05", -3500000, "Clothes")], cats), budgets, 2026, "2026-10-16");
  assert.equal(huge.over(day(9, 30)), false, "September is judged against the budget up to September's end");
  assert.equal(huge.over(day(10, 4)), false);
  assert.equal(huge.over(day(10, 5)), true, "past everything budgeted up to the end of October");
});

test("the month chart starts at the base, adds the rest day by day, and trends to the month end", () => {
  const ix = M.index(rows, cats), c = M.monthChart(ix, budgets, 2026, 10, "2026-10-16");
  assert.equal(c.n, 31);
  assert.equal(c.base, 145000);
  assert.equal(c.val(1), 145000);
  assert.equal(c.val(3), 145000 + 2315 + 899);
  assert.equal(c.last, 16);
  assert.ok(c.val(31) > c.val(16));
  assert.equal(c.pace(31), 358000);
  assert.equal(c.pace(0), 145000);
  assert.ok(c.top >= 358000);
});

test("recommends the House amount both previous months had and this month doesn't", () => {
  const r = M.recommend(rows, cats, { y: 2026, m: 10 }, "2026-10-16");
  assert.deepEqual(r.map((x) => x.c + " " + x.v), ["House -6500"]);
  assert.equal(r[0].n, "internet");
  const lunch = [...rows, e("2026-10-04", -1850, "Food"), e("2026-10-09", -1850, "Food")];
  assert.deepEqual(M.recommend(lunch, cats, { y: 2026, m: 10 }, "2026-10-16").map((x) => x.c + " " + x.v), ["House -6500", "Food -1850"]);
});

test("a month exported as .md comes back the same when imported", () => {
  const md = M.toMarkdown(rows, cats, budgets, { y: 2026, m: 10 }, "2026-10-16");
  assert.match(md, /# Spending · October 2026/);
  assert.match(md, /\| Oct 2, 2026 \| Food \| lunch \| −\$23\.15 \|/);
  const back = M.fromText(md, cats);
  assert.equal(back.bad, 0);
  assert.deepEqual(back.rows.map((r) => [r.d, r.v, r.c, r.n]).sort(), rows.filter((r) => r.d.startsWith("2026-10")).map((r) => [r.d, r.v, r.c, r.n]).sort());
});

test("imports one record per line, new categories included, and counts what it couldn't read", () => {
  const r = M.fromText("2026-10-03, Food, 23.15, lunch\nOct 5, 2026, Salary, 2400\n2026-10-06, Pets, $12\n2026-10-07, Tips, +40\nnot a line\n2026-10-08, Food, abc", cats);
  assert.deepEqual(r.rows.map((x) => [x.d, x.v, x.c, x.n]), [["2026-10-03", -2315, "Food", "lunch"], ["2026-10-05", 240000, "Salary", ""], ["2026-10-06", -1200, "Pets", ""], ["2026-10-07", 4000, "Tips", ""]]);
  assert.deepEqual(r.added.map((c) => c.name + ":" + c.kind), ["Pets:out", "Tips:in"]);
  assert.equal(r.bad, 2);
});

test("money and dates read the way the page shows them", () => {
  assert.equal(M.money(-145000), "$1,450.00");
  assert.equal(M.signed(-2315), "−$23.15");
  assert.equal(M.signed(4882), "+$48.82");
  assert.equal(M.toCents("$1,450"), 145000);
  assert.equal(M.fmtDate("2026-10-15"), "Oct 15, 2026");
  assert.deepEqual(M.addMonths(2026, 1, -2), { y: 2025, m: 11 });
  assert.equal(M.addDaysISO("2026-03-01", -1), "2026-02-28");
});

test("the year chart goes day by day: every record on its own day, House too; the budget grows with House paid plus a daily allowance", () => {
  const ix = M.index(rows, cats), c = M.yearChart(ix, budgets, 2026, "2026-10-16");
  assert.equal(c.n, 365);
  assert.equal(c.last, M.dayOfYear(2026, 10, 16));
  const aug1 = M.dayOfYear(2026, 8, 1), aug20 = M.dayOfYear(2026, 8, 20), oct3 = M.dayOfYear(2026, 10, 3);
  assert.equal(c.val(aug1 - 1), 0);
  assert.equal(c.val(aug1), 145000, "the rent lands on the 1st; the internet bill isn't there yet");
  assert.equal(c.val(aug20), 145000 + 6500, "the internet bill lands on the 20th, the day it was paid");
  const aug = M.sumOf(ix, { y: 2026, m: 8 }, "month"), sep = M.sumOf(ix, { y: 2026, m: 9 }, "month");
  assert.equal(c.val(oct3), M.counted(aug) + M.counted(sep) + 145000 + 2315 + 899);   // the deposit doesn't count
  assert.equal(c.baseLine[aug20] - c.baseLine[aug1 - 1], 151500, "House is a running total by day");
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, msg + ": " + a + " vs " + b);   // 每天的额度是小数，加起来差一点点
  near(c.budgetLine[M.dayOfYear(2026, 9, 30)], 358000 * 8 + 303500, "each month's budget is all there by its last day");
  near(c.budgetLine[aug1], 358000 * 7 + 145000 + Math.max(0, 358000 - 151500) / 31, "paying the rent raises the budget the same day");
  assert.equal(c.B, M.yearBudget(budgets, 2026, "2026-10-16"));
  assert.equal(M.dateOfDay(2026, oct3), "2026-10-03");
  assert.ok(c.val(365) > c.val(c.last));
});

test("without House: both charts leave out the base categories and the budget is what's left after them", () => {
  const ix = M.index(rows, cats);
  const y = M.yearChart(ix, budgets, 2026, "2026-10-16", { house: false });
  assert.equal(y.val(M.dayOfYear(2026, 8, 1)), 0, "no rent");
  assert.equal(y.val(M.dayOfYear(2026, 10, 3)), 2315 + 899);
  assert.equal(y.baseLine[365], 0);
  assert.ok(Math.abs(y.budgetLine[M.dayOfYear(2026, 9, 30)] - (358000 * 7 + (358000 - 151500) + (303500 - 151500))) < 0.01);
  assert.equal(y.B, 358000 * 7 + (358000 - 151500) + (303500 - 151500) + (358000 - 145000));
  const m = M.monthChart(ix, budgets, 2026, 10, "2026-10-16", { house: false });
  assert.equal(m.base, 0);
  assert.equal(m.val(1), 0);
  assert.equal(m.val(3), 2315 + 899);
  assert.equal(m.B, 358000 - 145000);
  assert.equal(m.pace(31), 358000 - 145000);
  assert.equal(M.monthChart(ix, budgets, 2026, 10, "2026-10-16").val(3), 145000 + 2315 + 899, "the full chart is unchanged");
});

test("cards compare with the previous six months, cut at the same day for the current month", () => {
  const more = [...rows, e("2026-09-02", -1000, "Food"), e("2026-09-25", -5000, "Food"), e("2026-08-03", -2000, "Food")];
  const ix = M.index(more, cats), cmp = M.compare(ix, budgets, { y: 2026, m: 10 }, "month", "2026-10-03");
  assert.equal(cmp.n, 2);   // Aug and Sep have records
  // up to the 3rd: Aug = rent + 20, Sep = rent + 10
  assert.deepEqual(cmp.range.expense, [146000, 147000]);
  assert.equal(cmp.cut, undefined);
  assert.equal(cmp.cutText, "by day 3");
  const past = M.compare(ix, budgets, { y: 2026, m: 10 }, "month", "2026-11-20");
  assert.deepEqual(past.range.expense, [145000 + 6500 + 2000, 145000 + 6500 + 1000 + 5000]);
  assert.equal(M.compare(ix, budgets, { y: 2026, m: 8 }, "month", "2026-10-03").range.expense, null);   // nothing before August
});

test("currencies: each record keeps its own; totals convert at the typed rate, or a rough one until there is one", () => {
  const fx = { rates: { cny: { v: 5, at: "2026-10-20" }, usd: 0.75 } };
  const R = M.ratesOf(fx);
  assert.equal(R.cad, 1);
  assert.equal(R.cny, 5);
  assert.equal(R.usd, 0.75);
  assert.ok(R.jpy > 50, "rough default for one never typed");
  assert.equal(M.rateSet(fx, "cny"), true);
  assert.equal(M.rateSet(fx, "jpy"), false);
  assert.equal(M.convert(-8800, "cny", "cad", R), -1760);
  assert.equal(M.convert(-1000, "cad", "cny", R), -5000);
  const mixed = [e("2026-10-02", -2000, "Food"), { ...e("2026-10-03", -8800, "Food"), cur: "cny" }];
  const conv = M.inCur(mixed, "cad", R);
  assert.equal(conv[1].v, -1760);
  assert.equal(conv[1].v0, -8800);
  assert.equal(conv[1].cur0, "cny");
  assert.equal(M.sumOf(M.index(conv, cats), { y: 2026, m: 10 }, "month").out, 3760);
  assert.equal(M.curOf(mixed[0]), "cad");
  assert.equal(M.money(8800, "cny"), "¥88.00");
  assert.equal(M.signed(-150000, "jpy"), "−JP¥1,500");
  assert.equal(M.signed(-1250, "usd"), "−US$12.50");
  M.setShow("eur");
  assert.equal(M.money(500), "€5.00", "no currency = the one being shown");
  M.setShow("cad");
  assert.equal(M.money(500), "$5.00");
});

test("currencies survive an .md round trip and one-line imports; recommendations keep theirs", () => {
  const R = M.ratesOf({ rates: { cny: 5 } });
  const mixed = [e("2026-10-02", -2000, "Food", "lunch"), { ...e("2026-10-03", -8800, "Food", "noodles"), cur: "cny" }, { ...e("2026-10-04", -150000, "Gift", "omiyage"), cur: "jpy" }];
  const md = M.toMarkdown(mixed, cats, budgets, { y: 2026, m: 10 }, "2026-10-16", "cad", R);
  assert.match(md, /\(CAD\)/);
  assert.match(md, /\| Oct 3, 2026 \| Food \| noodles \| −¥88\.00 \|/);
  const back = M.fromText(md, cats);
  assert.deepEqual(back.rows.map((r) => [r.v, r.cur || "cad"]), [[-2000, "cad"], [-8800, "cny"], [-150000, "jpy"]]);
  const lines = M.fromText("2026-10-05, Food, 88 RMB, noodles\n2026-10-06, Traffic, US$12.50\n2026-10-07, Food, €4\n2026-10-08, Food, $3", cats);
  assert.deepEqual(lines.rows.map((r) => r.cur || "cad"), ["cny", "usd", "eur", "cad"]);
  assert.equal(M.curFromText("−HK$5"), "hkd");
  const rent = [{ ...e("2026-09-01", -500000, "House"), cur: "cny" }, { ...e("2026-08-01", -500000, "House"), cur: "cny" }, e("2026-08-02", -500000, "House")];
  assert.deepEqual(M.recommend(rent, cats, { y: 2026, m: 10 }, "2026-10-16").map((x) => x.c + " " + x.v + " " + x.cur), ["House -500000 cny"]);
});

test("import: an amount's own sign wins over the category; AUD is a currency", () => {
  const r = M.fromText("2019-03-02, Food, +20.00, refund\n2019-03-03, Extra, -50.00, paid back\n2017-12-01, Food, -12.50 AUD, pie\n2019-03-04, Salary, +8000.00 CNY\n2019-03-05, Food, 9", M.DEFAULT_CATS);
  assert.deepEqual(r.rows.map((x) => [x.c, x.v, x.cur || "cad"]), [["Food", 2000, "cad"], ["Extra", -5000, "cad"], ["Food", -1250, "aud"], ["Salary", 800000, "cny"], ["Food", -900, "cad"]]);
  assert.equal(r.added.length, 0);
});

test("budgets: pasted lines carry their currency forward; each converts on its own", () => {
  const r = M.budgetsFromText("Prior 2000 (AUD)\n2018.08 5000 (RMB)\n2020.09 9,100\n2023-09 2720 (cad)\n2026.10 3580\n2021.13 5\nnope", "2017-11");
  assert.deepEqual(r.list, [{ from: "2017-11", v: 200000, cur: "aud" }, { from: "2018-08", v: 500000, cur: "cny" }, { from: "2020-09", v: 910000, cur: "cny" }, { from: "2023-09", v: 272000 }, { from: "2026-10", v: 358000 }]);
  assert.equal(r.bad, 2);
  const R = { cad: 1, cny: 5, aud: 1.25 }, inCad = M.budgetsIn(r.list, "cad", R);
  assert.equal(M.budgetAt(inCad, 2018, 1), 160000);
  assert.equal(M.budgetAt(inCad, 2019, 5), 100000);
  assert.equal(M.budgetAt(M.budgetsIn(r.list, "cny", R), 2019, 5), 500000, "seen in RMB, an RMB budget is untouched");
  assert.equal(M.budgetAt(inCad, 2026, 11), 358000);
});

test("budget left as a share: House and Bonds stay out; upcoming records count now and lift the forecast", () => {
  const cats = M.DEFAULT_CATS, T = "2026-10-10";
  const e = [{ d: "2026-10-01", v: -150000, c: "House" }, { d: "2026-10-03", v: -20000, c: "Food" }, { d: "2026-10-04", v: -50000, c: "Bonds" }, { d: "2026-10-20", v: -10000, c: "Food" }];
  const ix = M.index(e, cats), bud = [{ from: "2026-01", v: 250000 }];
  const cmp = M.compare(ix, bud, { y: 2026, m: 10 }, "month", T);
  assert.equal(cmp.cur.leftPct, 1 - 30000 / 100000, "food 200 + upcoming 100 out of (2500 − 1500 rent)");
  assert.equal(cmp.cur.room, 100000);
  assert.equal(M.metricsOf({ out: 0, inc: 0, base: 0, outside: 0 }, 0).leftPct, null);
  const c = M.monthChart(ix, bud, 2026, 10, T);
  assert.equal(c.val(10), 150000 + 20000);
  assert.equal(Math.round(c.val(20) - c.val(19)), Math.round(10000 + 20000 / 10), "the upcoming 100 lands on the 20th, on top of the usual pace");
});
