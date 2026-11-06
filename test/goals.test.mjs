// 目标板：栏目跟着今天滚；过了那一期的目标（做没做完都一样）收进往期，连线和链条越过它们
import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "../js/goals.js";

const g = (id, span, due, extra = {}) => ({ id, text: id, tag: "", span, due, done: "", order: 1, ...extra });
const colsOf = (b) => Object.fromEntries(b.cols.map((c) => [c.key, c.items.map((x) => x.goal.id + (x.ahead ? "+" : "") + (x.done ? "✓" : ""))]));

test("columns are worked out from today and roll over the year", () => {
  const oct = G.columns("2026-10-11");
  assert.deepEqual(oct.map((c) => c.key), ["month", "nmonth", "quarter", "next", "year", "y2027", "y2028", "y2029", "y2030", "north"], "in Q4 no quarters are left after the next one");
  assert.deepEqual(oct.slice(0, 5).map((c) => [c.title, c.sub, c.due]), [["This month", "Oct", "2026-10"], ["Next month", "Nov", "2026-11"], ["This quarter", "Q4", "2026-12"], ["Next quarter", "Q1 2027", "2027-03"], ["This year", "2026", "2026-12"]]);
  const jan = G.columns("2027-01-03");
  assert.deepEqual(jan.slice(0, 7).map((c) => [c.title, c.sub, c.due]), [["This month", "Jan", "2027-01"], ["Next month", "Feb", "2027-02"], ["This quarter", "Q1", "2027-03"], ["Next quarter", "Q2", "2027-06"], ["Q3", "", "2027-09"], ["Q4", "", "2027-12"], ["This year", "2027", "2027-12"]], "January: the rest of the year's quarters get their own columns");
  assert.deepEqual(jan.slice(7).map((c) => c.title), ["Next year", "2029", "2030", "2031", "North star"], "next year has a name, the three after it are numbers");
  assert.equal(jan[7].sub, "2028", "Next year says which year in small type");
  assert.deepEqual(oct.slice(5).map((c) => c.title + (c.sub ? " " + c.sub : "")), ["Next year 2027", "2028", "2029", "2030", "North star"]);
  assert.deepEqual(G.columns("2026-05-20").map((c) => c.key).slice(0, 6), ["month", "nmonth", "quarter", "next", "q4", "year"], "May: Q2 now, Q3 next, Q4 after");
  assert.deepEqual(G.columns("2026-12-10").slice(0, 2).map((c) => [c.sub, c.due]), [["Dec", "2026-12"], ["Jan 2027", "2027-01"]], "next month across the new year says which year");
});

test("a goal sits in the column of its own kind and period", () => {
  const goals = [g("m", "month", "2026-10"), g("nm", "month", "2026-11"), g("q", "quarter", "2026-11"), g("nq", "quarter", "2027-02"), g("y", "year", "2026-06", { dated: false }), g("y28", "year", "2028-12"), g("odd", "decade", "2029-01")];
  assert.deepEqual(colsOf(G.board(goals, "2026-10-11")), { month: ["m"], nmonth: ["nm"], quarter: ["q"], next: ["nq"], year: ["y"], y2027: [], y2028: ["y28"], y2029: ["odd"], y2030: [], north: [] });
  // 到了一月：下个季度那条自己变成这个季度的，2028 还在 2028；去年的月、季、年目标都收进往期了
  const jan = colsOf(G.board(goals, "2027-01-03"));
  assert.deepEqual(jan.quarter, ["nq"]);
  assert.deepEqual(jan.month, []);
  assert.deepEqual(jan.year, []);
  assert.deepEqual(jan.y2028, ["y28"]);
});

test("once its period is over a goal leaves the board, finished or not", () => {
  const goals = [g("late", "month", "2026-09"), g("old", "month", "2026-09", { done: "2026-09" }), g("now", "month", "2026-10", { done: "2026-10" }), g("open", "month", "2026-10"), g("dec", "month", "2026-12"), g("far", "year", "2040-01"), g("q3", "quarter", "2027-08")];
  const b = G.board(goals, "2026-10-11");
  assert.equal(b.old, 2);
  assert.deepEqual(colsOf(b).month, ["open", "now✓"], "not done first, done last; September's are gone");
  assert.deepEqual(colsOf(b).nmonth, ["dec+"], "further than next month waits in Next month");
  assert.deepEqual(colsOf(b).y2030, ["far+"], "further than the last year waits in the last year");
  assert.deepEqual(colsOf(b).next, ["q3+"]);
  const item = (id) => b.cols.flatMap((c) => c.items).find((x) => x.goal.id === id);
  assert.equal(item("now").when, "Oct", "a finished one shows the month it was finished");
  assert.equal(item("far").when, "Jan 2040");
  assert.equal(item("q3").when, "Aug");
  assert.equal(G.isOld(g("x", "month", "2026-09"), "2026-10-01"), true);
  assert.equal(G.isOld(g("x", "quarter", "2026-09"), "2026-10-01"), true, "Q3 is over on October 1");
  assert.equal(G.isOld(g("x", "quarter", "2026-11"), "2026-10-01"), false);
  assert.equal(G.isOld(g("x", "year", "2025-12"), "2026-01-01"), true);
  assert.equal(G.isOld(g("x", "year", "2026-12"), "2026-12-31"), false, "a year goal without a date lasts the whole year");
  assert.equal(G.isOld(g("x", "year", "2026-03", { dated: false }), "2026-12-31"), false);
  assert.equal(G.isOld(g("x", "year", "2026-03"), "2026-04-01"), true, "a dated one is over once its month is");
  assert.equal(G.isOld(g("x", "north", ""), "2030-01-01"), false);
  assert.equal(G.isOld(g("x", "month", ""), "2030-01-01"), false, "no due date, never old");
});

test("past goals are grouped by quarter with that year's goals, newest first", () => {
  const goals = [
    g("jul", "month", "2026-07", { done: "2026-07" }), g("aug", "month", "2026-08"), g("q3", "quarter", "2026-09", { done: "2026-09" }),
    g("sepToo", "month", "2026-09"), g("oct", "month", "2026-10"), g("y26", "year", "2026-12"),
    g("mar25", "month", "2025-03"), g("y25", "year", "2025-12", { done: "2025-11" }), g("y24", "year", "2024-12"), g("north", "north", "")
  ];
  const p = G.past(goals, "2026-11-02");
  assert.deepEqual(p.map((x) => x.label), ["2026 Q4", "2026 Q3", "2025 Q1", "2024 Q4"], "October is over in November; 2024 had only a year goal, so it sits in Q4");
  const q3 = p.find((x) => x.label === "2026 Q3");
  assert.deepEqual(q3.quarter.map((x) => x.id), ["q3"]);
  assert.deepEqual(q3.months.map((x) => x.label + ":" + x.items.map((y) => y.id).join(",")), ["Jul:jul", "Aug:aug", "Sep:sepToo"]);
  assert.deepEqual(q3.year.map((x) => x.id), ["y26"], "that year's goals come along, this year's too");
  assert.deepEqual(p.find((x) => x.label === "2025 Q1").year.map((x) => x.id), ["y25"]);
  assert.deepEqual(G.past(goals, "2026-07-15").map((x) => x.label), ["2025 Q1", "2024 Q4"], "nothing from this year is old yet in July");
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
    { id: "fit", text: "10k", tag: "Fitness", span: "year", due: "2026-12" },
    { id: "none", text: "No tag", tag: "", span: "year", due: "2026-11" },
    { id: "b2", text: "Band 8", tag: "build", span: "year", due: "2026-12" },
    { id: "b1", text: "Mock test", tag: "Build", span: "year", due: "2026-11" },
    { id: "x", text: "Odd tag", tag: "Garden", span: "year", due: "2026-10" },
    { id: "w", text: "Ship it", tag: "Work", span: "year", due: "2026-12", done: "2026-10" }
  ];
  const order = ["build", "work", "friends", "leisure", "fitness", "chores"];
  const rank = (tag) => { const t = String(tag || "").toLowerCase(); return !t ? Infinity : order.includes(t) ? order.indexOf(t) : order.length; };
  const year = G.board(goals.map((x) => ({ ...x, dated: false })), "2026-10-11", { rank, showDone: true }).cols.find((c) => c.key === "year").items.map((x) => x.goal.id);
  assert.deepEqual(year, ["b1", "b2", "fit", "x", "none", "w"]);
});

test("this year's dated year goals spread into the nearest month or quarter; undated ones stay in This year", () => {
  const y = (id, due, extra) => g(id, "year", due, extra);
  const goals = [y("jan", "2027-01"), y("feb", "2027-02"), y("mar", "2027-03"), y("may", "2027-05"), y("sep", "2027-09"), y("nov", "2027-11"),
    y("plain", "2027-12"), y("decDated", "2027-12", { dated: true }), y("julUndated", "2027-07", { dated: false }), y("next", "2028-03")];
  const jan = colsOf(G.board(goals, "2027-01-05"));
  assert.deepEqual([jan.month, jan.nmonth, jan.quarter, jan.next, jan.q3, jan.q4, jan.year, jan.y2028],
    [["jan"], ["feb"], ["mar"], ["may"], ["sep"], ["nov", "decDated"], ["julUndated", "plain"], ["next"]]);
  const dec = colsOf(G.board(goals, "2027-12-10"));
  assert.deepEqual([dec.month, dec.year, dec.y2028], [["decDated"], ["julUndated", "plain"], ["next"]], "December: the earlier dated ones are gone, the undated ones wait for the year's end");
  assert.equal(G.board(goals, "2027-12-10").old, 6);
  assert.deepEqual([G.isDated(y("a", "2027-12")), G.isDated(y("a", "2027-06")), G.isDated(y("a", "2027-06", { dated: false })), G.isDated(y("a", "2027-12", { dated: true })), G.isDated(g("a", "month", "2027-06"))],
    [false, true, false, true, false], "old data: any month but December counts as dated");
  // 写了日期的那条过期以后：收进它那一季，下面挂着的接到上一级
  const chain = [g("life", "north", ""), y("feb2", "2027-02", { up: "life" }), g("mar2", "month", "2027-03", { up: "feb2" })];
  assert.deepEqual(G.past(chain, "2027-03-02").map((x) => x.label + ":" + x.year.map((v) => v.id).join(",")), ["2027 Q1:feb2"]);
  assert.deepEqual(G.chainUp(chain, "mar2", G.visibleSet(chain, "2027-03-02")).map((x) => x.id), ["mar2", "life"]);
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
