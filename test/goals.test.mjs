// 目标板：栏目跟着今天滚、过期的滚进当前栏、做完的过了期就收起来
import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "../js/goals.js";

const g = (id, span, due, extra = {}) => ({ id, text: id, tag: "", span, due, done: "", order: 1, ...extra });
const colsOf = (b) => Object.fromEntries(b.cols.map((c) => [c.key, c.items.map((x) => x.goal.id + (x.late ? "!" : "") + (x.ahead ? "+" : "") + (x.done ? "✓" : ""))]));

test("columns are worked out from today and roll over the year", () => {
  const oct = G.columns("2026-10-11");
  assert.deepEqual(oct.map((c) => c.key), ["month", "quarter", "next", "year", "y2027", "y2028", "y2029", "y2030", "y2031"]);
  assert.deepEqual(oct.slice(0, 4).map((c) => [c.title, c.sub, c.due]), [["This month", "Oct", "2026-10"], ["This quarter", "Q4", "2026-12"], ["Next quarter", "Q1 2027", "2027-03"], ["This year", "2026", "2026-12"]]);
  const jan = G.columns("2027-01-03");
  assert.deepEqual(jan.slice(0, 4).map((c) => [c.sub, c.due]), [["Jan", "2027-01"], ["Q1", "2027-03"], ["Q2", "2027-06"], ["2027", "2027-12"]]);
  assert.deepEqual(jan.slice(4).map((c) => c.title), ["2028", "2029", "2030", "2031", "2032"]);
});

test("a goal sits in the column of its own kind and period", () => {
  const goals = [g("m", "month", "2026-10"), g("q", "quarter", "2026-11"), g("nq", "quarter", "2027-02"), g("y", "year", "2026-06"), g("y28", "year", "2028-12"), g("odd", "decade", "2029-01")];
  assert.deepEqual(colsOf(G.board(goals, "2026-10-11")), { month: ["m"], quarter: ["q"], next: ["nq"], year: ["y"], y2027: [], y2028: ["y28"], y2029: ["odd"], y2030: [], y2031: [] });
  // 到了一月：下个季度那条自己变成这个季度的，2028 还在 2028
  const jan = colsOf(G.board(goals, "2027-01-03"));
  assert.deepEqual(jan.quarter, ["q!", "nq"]);
  assert.deepEqual(jan.month, ["m!"]);
  assert.deepEqual(jan.year, ["y!"]);
  assert.deepEqual(jan.y2028, ["y28"]);
});

test("unfinished ones roll forward, finished ones drop off once their period is over", () => {
  const goals = [g("late", "month", "2026-09"), g("old", "month", "2026-09", { done: "2026-09" }), g("now", "month", "2026-10", { done: "2026-10" }), g("open", "month", "2026-10"), g("dec", "month", "2026-12"), g("far", "year", "2040-01"), g("q3", "quarter", "2027-08")];
  const b = G.board(goals, "2026-10-11");
  assert.equal(b.hidden, 1);
  assert.deepEqual(colsOf(b).month, ["late!", "open", "dec+", "now✓"], "not done first (by month), done last");
  assert.deepEqual(colsOf(b).y2031, ["far+"]);
  assert.deepEqual(colsOf(b).next, ["q3+"]);
  const item = (id) => b.cols.flatMap((c) => c.items).find((x) => x.goal.id === id);
  assert.equal(item("late").when, "Sep");
  assert.equal(item("now").when, "Oct", "a finished one shows the month it was finished");
  assert.equal(item("far").when, "Jan 2040");
  assert.equal(item("q3").when, "Aug");
  const all = G.board(goals, "2026-10-11", { showDone: true });
  assert.equal(all.hidden, 0);
  assert.ok(colsOf(all).month.includes("old✓"));
});

test("text and tag are typed together", () => {
  assert.deepEqual(G.parseGoal("  Run a half marathon #Fitness "), { text: "Run a half marathon", tag: "Fitness" });
  assert.deepEqual(G.parseGoal("Ship v1 # Side job"), { text: "Ship v1", tag: "Side job" });
  assert.deepEqual(G.parseGoal("No tag here"), { text: "No tag here", tag: "" });
  assert.deepEqual(G.parseGoal("#OnlyTag"), { text: "", tag: "OnlyTag" });
  assert.equal(G.whenText("2027-12", 2027), "Dec");
  assert.equal(G.whenText("", 2027), "");
});
