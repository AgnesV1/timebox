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

test("over budget: a day compares what's outside House and Bonds with the daily allowance", () => {
  const ix = M.index(rows, cats);
  const al = M.allowance(ix, budgets, 2026, 10);
  assert.equal(Math.round(al), Math.round((358000 - 145000) / 31));
  assert.equal(M.isOver(ix, budgets, { y: 2026, m: 10, d: 2 }, "day", "2026-10-16"), false);   // the deposit doesn't count
  const big = M.index([...rows, e("2026-10-05", -9000, "Clothes")], cats);
  assert.equal(M.isOver(big, budgets, { y: 2026, m: 10, d: 5 }, "day", "2026-10-16"), true);
  assert.equal(M.isOver(ix, budgets, { y: 2026, m: 10 }, "month", "2026-10-16"), false);
  assert.equal(M.isOver(ix, [], { y: 2026, m: 10 }, "month", "2026-10-16"), false);   // no budget, never orange
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

test("the year chart goes day by day: each month starts with its House, budget months join up", () => {
  const ix = M.index(rows, cats), c = M.yearChart(ix, budgets, 2026, "2026-10-16");
  assert.equal(c.n, 365);
  assert.equal(c.last, M.dayOfYear(2026, 10, 16));
  const aug1 = M.dayOfYear(2026, 8, 1), oct3 = M.dayOfYear(2026, 10, 3);
  assert.equal(c.val(aug1 - 1), 0);
  assert.equal(c.val(aug1), 145000 + 6500);   // the whole month's House (rent + internet) counts from the 1st, like the month chart
  const aug = M.sumOf(ix, { y: 2026, m: 8 }, "month"), sep = M.sumOf(ix, { y: 2026, m: 9 }, "month");
  assert.equal(c.val(oct3), M.counted(aug) + M.counted(sep) + 145000 + 2315 + 899);   // the deposit doesn't count
  assert.equal(c.budgetLine[M.dayOfYear(2026, 9, 30)], 358000 * 8 + 303500);
  assert.equal(M.dateOfDay(2026, oct3), "2026-10-03");
  assert.ok(c.val(365) > c.val(c.last));
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
