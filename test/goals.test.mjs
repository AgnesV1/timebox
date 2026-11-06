// 目标板：栏目跟着今天滚；过了那一期的目标（做没做完都一样）收进往期，连线和链条越过它们
import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "../js/goals.js";

const g = (id, span, due, extra = {}) => ({ id, text: id, tag: "", span, due, done: "", order: 1, ...extra });
const colsOf = (b) => Object.fromEntries(b.cols.map((c) => [c.key, c.items.map((x) => x.goal.id + (x.ahead ? "+" : "") + (x.done ? "✓" : ""))]));

test("columns are worked out from today: this month, next month, the quarter's third month, the rest of the year", () => {
  const keys = (d) => G.columns(d).map((c) => c.key).join(" ");
  const span = (d, key) => { const c = G.columns(d).find((x) => x.key === key); return c ? [c.from % 12 + 1, c.to % 12 + 1] : null; };
  assert.equal(keys("2026-11-05"), "month nmonth y2027 y2028 y2029 y2030 north", "November: nothing left this year after next month");
  assert.equal(keys("2026-12-10"), "month nmonth y2027 y2028 y2029 y2030 north");
  assert.equal(keys("2026-10-11"), "month nmonth quarter y2027 y2028 y2029 y2030 north", "October: This quarter holds December, nothing after it");
  assert.equal(keys("2027-01-05"), "month nmonth quarter year y2028 y2029 y2030 y2031 north");
  assert.deepEqual([span("2027-01-05", "quarter"), span("2027-01-05", "year")], [[3, 3], [4, 12]], "January: the quarter is March, the year is April to December");
  assert.equal(keys("2027-02-10"), "month nmonth year y2028 y2029 y2030 y2031 north", "the quarter's second month: no This quarter");
  assert.deepEqual(span("2027-02-10", "year"), [4, 12]);
  assert.deepEqual(span("2026-09-01", "year"), [11, 12], "September: October is next month, the year is November and December");
  const oct = G.columns("2026-10-11");
  assert.deepEqual(oct.slice(0, 3).map((c) => [c.title, c.sub, c.due]), [["This month", "Oct", "2026-10"], ["Next month", "Nov", "2026-11"], ["This quarter", "Q4", "2026-12"]]);
  assert.deepEqual(G.columns("2026-12-10").slice(0, 2).map((c) => [c.sub, c.due]), [["Dec", "2026-12"], ["Jan 2027", "2027-01"]], "next month across the new year says which year");
  const jan = G.columns("2027-01-03");
  assert.deepEqual(jan.slice(4).map((c) => c.title), ["Next year", "2029", "2030", "2031", "North star"], "next year has a name, the three after it are numbers");
  assert.equal(jan[4].sub, "2028", "Next year says which year in small type");
  assert.equal(jan.find((c) => c.key === "year").due, "2027-12");
});
test("every goal, month, quarter or year, sits in the column that holds its month", () => {
  const goals = [g("m", "month", "2026-11"), g("dec", "year", "2026-12"), g("q4", "quarter", "2026-12"), g("nm", "month", "2026-12"),
    g("jan", "quarter", "2027-01"), g("y27", "year", "2027-12"), g("y28", "year", "2028-06"), g("odd", "decade", "2029-01")];
  assert.deepEqual(colsOf(G.board(goals, "2026-11-05")), { month: ["m"], nmonth: ["dec", "q4", "nm"], y2027: ["jan", "y27"], y2028: ["y28"], y2029: ["odd"], y2030: [], north: [] },
    "November: December's goals of every kind are next month (the year goal she saw folded away)");
  const dec = colsOf(G.board(goals, "2026-12-01"));
  assert.deepEqual([dec.month, dec.nmonth, dec.y2027], [["dec", "q4", "nm"], ["jan"], ["y27"]], "December: next January is Next month, the rest of 2027 is Next year");
  const jan = colsOf(G.board([...goals, g("mar", "year", "2027-03"), g("may", "year", "2027-05"), g("feb", "month", "2027-02")], "2027-01-05"));
  assert.deepEqual([jan.month, jan.nmonth, jan.quarter, jan.year], [["jan"], ["feb"], ["mar"], ["may", "y27"]]);
});
test("once its month is over a goal leaves the board, finished or not", () => {
  const goals = [g("late", "month", "2026-09"), g("old", "month", "2026-09", { done: "2026-09" }), g("now", "month", "2026-10", { done: "2026-10" }), g("open", "month", "2026-10"), g("dec", "month", "2026-12"), g("far", "year", "2040-01"), g("q1", "quarter", "2027-03")];
  const b = G.board(goals, "2026-10-11");
  assert.equal(b.old, 2);
  assert.deepEqual(colsOf(b).month, ["open", "now✓"], "not done first, done last; September's are gone");
  assert.deepEqual(colsOf(b).quarter, ["dec"], "October: December belongs to This quarter");
  assert.deepEqual(colsOf(b).y2030, ["far+"], "further than the last year waits in the last year");
  assert.deepEqual(colsOf(b).y2027, ["q1"]);
  const item = (id) => b.cols.flatMap((c) => c.items).find((x) => x.goal.id === id);
  assert.equal(item("now").when, "Oct", "a finished one shows the month it was finished");
  assert.equal(item("far").when, "Jan 2040");
  assert.equal(item("q1").when, "Mar");
  assert.equal(G.isOld(g("x", "month", "2026-09"), "2026-10-01"), true);
  assert.equal(G.isOld(g("x", "quarter", "2026-09"), "2026-10-01"), true, "Q3 is over on October 1");
  assert.equal(G.isOld(g("x", "quarter", "2026-11"), "2026-10-01"), false);
  assert.equal(G.isOld(g("x", "year", "2025-12"), "2026-01-01"), true);
  assert.equal(G.isOld(g("x", "year", "2026-12"), "2026-12-31"), false, "a year goal due in December lasts the year");
  assert.equal(G.isOld(g("x", "year", "2026-03"), "2026-04-01"), true, "any goal is over once its month is");
  assert.equal(G.isOld(g("x", "north", ""), "2030-01-01"), false);
  assert.equal(G.isOld(g("x", "month", ""), "2030-01-01"), false, "no due date, never old");
});
test("past holds only goals that are over, in the quarter of their month, newest first", () => {
  const goals = [
    g("jul", "month", "2026-07", { done: "2026-07" }), g("aug", "month", "2026-08"), g("q3", "quarter", "2026-09", { done: "2026-09" }),
    g("sepToo", "month", "2026-09"), g("oct", "month", "2026-10"), g("y26", "year", "2026-12"), g("ySep", "year", "2026-09"),
    g("mar25", "month", "2025-03"), g("y25", "year", "2025-12", { done: "2025-11" }), g("y24", "year", "2024-12"), g("north", "north", "")
  ];
  const p = G.past(goals, "2026-11-02");
  assert.deepEqual(p.map((x) => x.label), ["2026 Q4", "2026 Q3", "2025 Q4", "2025 Q1", "2024 Q4"]);
  const q3 = p.find((x) => x.label === "2026 Q3");
  assert.deepEqual(q3.quarter.map((x) => x.id), ["q3"]);
  assert.deepEqual(q3.months.map((x) => x.label + ":" + x.items.map((y) => y.id).join(",")), ["Jul:jul", "Aug:aug", "Sep:sepToo"]);
  assert.deepEqual(q3.year.map((x) => x.id), ["ySep"], "only the year goal that is over; December's is still on the board");
  assert.ok(!p.some((x) => x.year.some((y) => y.id === "y26")), "this year's December goal is never folded into Past early");
  assert.deepEqual(p.find((x) => x.label === "2025 Q4").year.map((x) => x.id), ["y25"]);
  assert.deepEqual(G.past(goals, "2026-07-15").map((x) => x.label), ["2025 Q4", "2025 Q1", "2024 Q4"], "nothing from this year is over yet in July");
});
test("text and tag are typed together", () => {
  assert.deepEqual(G.parseGoal("  Run a half marathon #Fitness "), { text: "Run a half marathon", tag: "Fitness" });
  assert.deepEqual(G.parseGoal("Ship v1 # Side job"), { text: "Ship v1", tag: "Side job" });
  assert.deepEqual(G.parseGoal("No tag here"), { text: "No tag here", tag: "" });
  assert.deepEqual(G.parseGoal("#OnlyTag"), { text: "", tag: "OnlyTag" });
  assert.equal(G.whenText("2027-12", 2027), "Dec");
  assert.equal(G.whenText("", 2027), "");
});

test("in a column: open goals first, then by the project order of their tag, then by month", () => {
  const goals = [
    { id: "fit", text: "10k", tag: "Fitness", span: "year", due: "2027-12" },
    { id: "none", text: "No tag", tag: "", span: "year", due: "2027-11" },
    { id: "b2", text: "Band 8", tag: "build", span: "year", due: "2027-12" },
    { id: "b1", text: "Mock test", tag: "Build", span: "year", due: "2027-11" },
    { id: "x", text: "Odd tag", tag: "Garden", span: "year", due: "2027-10" },
    { id: "w", text: "Ship it", tag: "Work", span: "year", due: "2027-12", done: "2026-10" }
  ];
  const order = ["build", "work", "friends", "leisure", "fitness", "chores"];
  const rank = (tag) => { const t = String(tag || "").toLowerCase(); return !t ? Infinity : order.includes(t) ? order.indexOf(t) : order.length; };
  const next = G.board(goals, "2026-10-11", { rank }).cols.find((c) => c.key === "y2027").items.map((x) => x.goal.id);
  assert.deepEqual(next, ["b1", "b2", "fit", "x", "none", "w"]);
});
test("a goal that is over is skipped by chains: the one under it hangs off the one above", () => {
  const y = (id, due, extra) => g(id, "year", due, extra);
  const chain = [g("life", "north", ""), y("feb2", "2027-02", { up: "life" }), g("mar2", "month", "2027-03", { up: "feb2" })];
  assert.deepEqual(G.past(chain, "2027-03-02").map((x) => x.label + ":" + x.year.map((v) => v.id).join(",")), ["2027 Q1:feb2"]);
  assert.deepEqual(G.chainUp(chain, "mar2", G.visibleSet(chain, "2027-03-02")).map((x) => x.id), ["mar2", "life"]);
  assert.deepEqual(colsOf(G.board([y("d", "2027-06", { dated: false })], "2027-01-05")).year, ["d"], "an old dated: false is ignored now; June is the rest of the year");
});
test("North star: no date, never late, always the last column", () => {
  const goals = [g("calm", "north", ""), g("y30", "year", "2030-12")];
  const b = G.board(goals, "2026-10-11");
  assert.deepEqual(colsOf(b).north, ["calm"]);
  assert.equal(b.cols.at(-1).title, "North star");
  assert.equal(b.cols.flatMap((c) => c.items).find((x) => x.goal.id === "calm").when, "");
  assert.deepEqual(colsOf(G.board(goals, "2031-03-01")).north, ["calm"], "years later it's still there");
});

test("chains: up through the parents, no loops, served by projects and plans", () => {
  const goals = [
    { id: "life", text: "Live in French", span: "north" },
    { id: "b2", text: "Pass B2", span: "year", up: "life", by: ["p:exam"] },
    { id: "q", text: "Mock test 70+", span: "quarter", up: "b2", by: ["p:exam", "g:Build"] },
    { id: "fit", text: "Run 10k", span: "year", by: ["g:Fitness"] },
    { id: "loop1", up: "loop2" }, { id: "loop2", up: "loop1" }
  ];
  assert.deepEqual(G.chainUp(goals, "q").map((x) => x.id), ["q", "b2", "life"]);
  assert.deepEqual(G.chainUp(goals, "loop1").map((x) => x.id), ["loop1", "loop2"], "a loop stops instead of spinning");
  assert.deepEqual([...G.descendants(goals, "life")].sort(), ["b2", "q"]);
  assert.equal(G.canParent(goals, "life", "q"), false, "a goal can't sit under its own child");
  assert.equal(G.canParent(goals, "q", "life"), true);
  assert.equal(G.canParent(goals, "q", "q"), false);
  assert.deepEqual(G.goalsFor(goals, { planId: "exam", group: "Build" }).map((x) => x.id), ["b2", "q"], "the plan's own links win");
  assert.deepEqual(G.goalsFor(goals, { planId: "other", group: "Build" }).map((x) => x.id), ["q"], "no links on the plan: its project's");
  assert.deepEqual(G.goalsFor(goals, { group: "Fitness" }).map((x) => x.id), ["fit"]);
  assert.deepEqual(G.goalsFor(goals, {}), []);
  const chains = G.chainsFor(goals, G.goalsFor(goals, { planId: "exam" }));
  assert.deepEqual(chains.map((c) => c.map((x) => x.id).join(">")), ["q>b2>life"], "Pass B2 is already part of the longer chain");
});

test("chains and links skip goals whose period is over, joining the next one up", () => {
  const goals = [
    { id: "life", text: "Live in French", span: "north" },
    { id: "b2", text: "Pass B2", span: "year", due: "2026-12", up: "life" },
    { id: "q3", text: "Mock 60+", span: "quarter", due: "2026-09", up: "b2", by: ["p:exam"] },
    { id: "sep", text: "Module 3", span: "month", due: "2026-09", up: "q3", by: ["p:mod"] },
    { id: "oct", text: "Module 4", span: "month", due: "2026-10", up: "sep" },
    { id: "gone", text: "Old and alone", span: "month", due: "2026-08", by: ["p:alone", "g:Build"] },
    { id: "now", text: "Build thing", span: "month", due: "2026-10", by: ["g:Build"] }
  ];
  const vis = G.visibleSet(goals, "2026-10-11");
  assert.deepEqual([...vis].sort(), ["b2", "life", "now", "oct"]);
  assert.equal(G.lift(goals, "sep", vis).id, "b2", "September's goal and Q3's both went to the past: up to the year goal");
  assert.equal(G.lift(goals, "gone", vis), null);
  assert.deepEqual(G.chainUp(goals, "oct", vis).map((x) => x.id), ["oct", "b2", "life"], "October's goal now hangs straight off the year goal");
  assert.deepEqual(G.chainUp(goals, "oct").map((x) => x.id), ["oct", "sep", "q3", "b2", "life"], "without vis nothing is skipped");
  assert.deepEqual(G.goalsFor(goals, { planId: "exam" }, vis).map((x) => x.id), ["b2"], "a plan serving an old goal serves the next one up");
  assert.deepEqual(G.goalsFor(goals, { planId: "mod", group: "Build" }, vis).map((x) => x.id), ["b2"]);
  assert.deepEqual(G.goalsFor(goals, { planId: "alone", group: "Build" }, vis).map((x) => x.id), ["now"], "nothing left above its only goal: falls back to the project's");
  assert.deepEqual(G.chainsFor(goals, G.goalsFor(goals, { planId: "exam" }, vis), vis).map((c) => c.map((x) => x.id).join(">")), ["b2>life"]);
});

test("store: link, parent, rename, delete, and the old far year moves to North star once", async () => {
  console.warn = () => {};
  const store = await import("../js/store.js?goals");
  const T = store.today(), y = Number(T.slice(0, 4));
  const far = store.saveGoal({ text: "Calm", span: "year", due: (y + 5) + "-12", done: "" });
  const near = store.saveGoal({ text: "Pass B2", span: "year", due: y + "-12", done: "" });
  const soon = store.saveGoal({ text: "Mock test", span: "quarter", due: y + "-12", done: "" });
  const p = store.saveProject({ name: "B2 exam", group: "Build", kind: "total", place: "pool" });
  store.ensureNorthStar(T);
  const get = (id) => store.goals().find((x) => x.id === id);
  assert.deepEqual([get(far).span, get(far).due], ["north", ""]);
  assert.equal(get(near).span, "year");
  store.saveGoal({ ...get(near), due: (y + 6) + "-01" });
  store.ensureNorthStar(T);
  assert.equal(get(near).span, "year", "only once: later far dates stay years");
  store.saveGoal({ ...get(near), due: y + "-12" });

  assert.equal(store.setParent(soon, near), true);
  assert.equal(store.setParent(near, far), true);
  assert.equal(store.setParent(far, soon), false, "no loops");
  store.linkGoal(soon, "p:" + p);
  store.linkGoal(near, "g:Build");
  assert.deepEqual(get(soon).by, ["p:" + p]);
  store.renameGroup("Build", "Make");
  assert.deepEqual(get(near).by, ["g:Make"], "renaming a project keeps its links");
  store.deleteProject(p);
  assert.deepEqual(get(soon).by, [], "deleting a plan drops its links");
  store.deleteGoal(near);
  assert.equal(get(soon).up, "", "a goal whose parent is gone has no parent");
});
