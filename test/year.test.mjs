// 日历的 Year 视图：那天红不红（dayLoad）、一年每天的样子（yearDays）、中了哪几层、字用黑还是白
import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "../js/year.js";

const T = "2026-11-04";   // 周三
const GROUPS = [{ name: "Work", color: "#3F62B5" }, { name: "Fitness", color: "#E6DCC3" }, { name: "Chores", color: "#9A5A36" }];
const ctx = (over = {}) => ({ today: T, projects: [], items: [], tasks: [], capacity: { default: 600, weekly: null, overrides: {} }, groups: GROUPS, weekStartsOn: "monday", commute: null, offday: null, superRest: null, ...over });
const day = (c, d) => Y.yearDays(c, Number(d.slice(0, 4))).find((x) => x.date === d);

test("dayLoad: days gone count what was logged, the Chore key included", () => {
  const d = "2026-11-02";
  const c = ctx({ tasks: [{ id: "a", date: d, est: 30, actual: 200 }, { id: "chore-" + d, date: d, est: 300, actual: 300, status: "done", group: "Chores" }] });
  const load = Y.dayLoad(c, d);
  assert.equal(load.val, 500);
  assert.deepEqual([load.over, load.long], [false, true], "past 7 hours, inside the box");
});

test("dayLoad: today and later count what's planned, repeats included and the Chore key not", () => {
  const c = ctx({ tasks: [{ id: "a", date: T, est: 120, actual: 9 }, { id: "chore-" + T, date: T, est: 600, actual: 600, status: "done", group: "Chores" }, { id: "b", date: T, est: 900, status: "drop" }] });
  assert.equal(Y.dayLoad(c, T).val, 120, "the Chore key and dropped tasks don't count, logged minutes neither");
  const gym = { id: "gym", name: "Gym", kind: "regular", place: "auto", status: "active", rule: { days: [480, 480, 480, 480, 480, 480, 480] } };
  const later = ctx({ projects: [gym], tasks: [{ id: "c", date: "2026-11-05", est: 150 }] });
  const load = Y.dayLoad(later, "2026-11-05");
  assert.equal(load.val, 630);
  assert.deepEqual([load.over, load.long], [true, false], "over the box is the stronger one, never both");
});

test("dayLoad: a gold day is never red; a box of 0 can't be over the box", () => {
  const d = "2026-11-02", tasks = [{ id: "a", date: d, actual: 700 }];
  assert.deepEqual([Y.dayLoad(ctx({ tasks }), d).over, Y.dayLoad(ctx({ tasks }), d, true).over, Y.dayLoad(ctx({ tasks }), d, true).long], [true, false, false]);
  const noBox = Y.dayLoad(ctx({ tasks, capacity: { default: 600, weekly: null, overrides: { [d]: 0 } } }), d);
  assert.deepEqual([noBox.over, noBox.long, noBox.rest], [false, true, true]);
});

test("yearDays: every day of the year in order, leap years too, and it's only worked out once", () => {
  const c = ctx();
  const days = Y.yearDays(c, 2026);
  assert.equal(days.length, 365);
  assert.deepEqual([days[0].date, days[364].date], ["2026-01-01", "2026-12-31"]);
  assert.equal(Y.yearDays(ctx(), 2028).length, 366);
  assert.equal(Y.yearDays(c, 2026), days);
  assert.notEqual(Y.yearDays(ctx(), 2026), days, "a new snapshot of the data is worked out again");
});

test("yearDays: rest means a gold day or a box of 0, not a weekend", () => {
  const c = ctx({ superRest: { days: { "2026-03-04": true } }, capacity: { default: 600, weekly: null, overrides: { "2026-03-05": 0 } } });
  assert.equal(day(c, "2026-03-04").rest, true);
  assert.equal(day(c, "2026-03-05").rest, true);
  assert.equal(day(c, "2026-03-07").rest, false, "a Saturday");
  assert.equal(day(c, "2026-03-06").rest, false);
});

test("yearDays: holiday means a public holiday or a day marked off; commute comes from its marks", () => {
  const c = ctx({ offday: { days: { "2026-03-04": true, "2026-10-12": false } }, commute: { days: { "2026-03-05": true } } });
  assert.equal(day(c, "2026-07-01").holiday, "Canada Day");
  assert.equal(day(c, "2026-03-04").holiday, "Day off");
  assert.equal(day(c, "2026-10-12").holiday, "", "a holiday marked as a work day");
  assert.equal(day(c, "2026-03-05").commute, true);
  assert.equal(day(c, "2026-03-04").commute, false);
});

test("yearDays: over is 2 past the box, 1 past 7 hours, and red stays off gold days", () => {
  const tasks = [{ id: "a", date: "2026-03-04", actual: 601 }, { id: "b", date: "2026-03-05", actual: 421 }, { id: "c", date: "2026-03-06", actual: 420 }, { id: "d", date: "2026-03-09", actual: 700 }];
  const c = ctx({ tasks, superRest: { days: { "2026-03-09": true } } });
  assert.deepEqual(["2026-03-04", "2026-03-05", "2026-03-06", "2026-03-09"].map((d) => day(c, d).over), [2, 1, 0, 0]);
});

test("yearDays: a group lights up only with logged time, through a plan or directly, and stays in its own year", () => {
  const plan = { id: "p", name: "Gym", group: "Fitness", kind: "regular", place: "pool", status: "active", rule: {} };
  const c = ctx({ projects: [plan], tasks: [
    { id: "a", date: "2026-03-04", actual: 30, projectId: "p" },
    { id: "b", date: "2026-03-04", actual: 60, group: "Work" },
    { id: "c", date: "2026-03-05", est: 60, group: "Work" },
    { id: "chore-2026-03-06", date: "2026-03-06", actual: 15, status: "done", group: "Chores" },
    { id: "d", date: "2025-12-31", actual: 60, group: "Work" }] });
  assert.deepEqual([...day(c, "2026-03-04").groups].sort(), ["Fitness", "Work"]);
  assert.equal(day(c, "2026-03-05").groups.size, 0, "planned but not done");
  assert.deepEqual([...day(c, "2026-03-06").groups], ["Chores"], "the Chore key counts as having done chores");
  assert.equal(Y.yearCounts(Y.yearDays(c, 2026), GROUPS)["g:Work"], 1);
});

test("hitsOf: only the open layers, in painting order; over 7 hours isn't filled", () => {
  const d = { date: "2026-03-04", rest: true, holiday: "Day off", commute: true, over: 2, groups: new Set(["Fitness", "Work"]) };
  assert.deepEqual(Y.hitsOf(d, new Set(["days", "over", "g:Work", "g:Fitness"]), GROUPS), ["over", "rest", "holiday", "commute", "g:Work", "g:Fitness"]);
  assert.deepEqual(Y.hitsOf(d, new Set(["g:Fitness"]), GROUPS), ["g:Fitness"]);
  assert.deepEqual(Y.hitsOf({ ...d, over: 1 }, new Set(["over"]), GROUPS), []);
  assert.deepEqual(Y.hitsOf(d, new Set(), GROUPS), []);
});

test("holiday and commute are drawn as frames; everything else fills the day", () => {
  assert.deepEqual([...Y.FRAMES].sort(), ["commute", "holiday"]);
  const d = { date: "2026-03-04", rest: true, holiday: "Day off", commute: true, over: 2, groups: new Set(["Work"]) };
  const hits = Y.hitsOf(d, new Set(["days", "over", "g:Work"]), GROUPS);
  assert.deepEqual(hits.filter((h) => !Y.FRAMES.has(h)), ["over", "rest", "g:Work"]);
  assert.deepEqual(hits.filter((h) => Y.FRAMES.has(h)), ["holiday", "commute"]);
});

test("yearCounts: a day counts once per layer; over 7 hours counts as overworked", () => {
  const days = [
    { rest: true, holiday: "x", commute: true, over: 0, groups: new Set(["Work"]) },
    { rest: false, holiday: "", commute: false, over: 1, groups: new Set(["Work", "Fitness"]) },
    { rest: false, holiday: "", commute: false, over: 2, groups: new Set() },
    { rest: false, holiday: "", commute: false, over: 0, groups: new Set() }];
  assert.deepEqual(Y.yearCounts(days, GROUPS), { days: 1, over: 2, "g:Work": 2, "g:Fitness": 1, "g:Chores": 0 });
});

test("inkOn: black or white, whichever the hardest stripe can still carry", () => {
  assert.equal(Y.inkOn(["#3F62B5"]), "#FFFFFF", "ultramarine");
  assert.equal(Y.inkOn(["#E6DCC3"]), "#0B0B0B", "ivory");
  assert.equal(Y.inkOn(["#C6FF00"]), "#0B0B0B", "lime");
  assert.equal(Y.inkOn(["#FFF"]), "#0B0B0B", "short hex");
  assert.equal(Y.inkOn(["#0B0B0B", "#E6DCC3"]), Y.inkOn(["#E6DCC3", "#0B0B0B"]), "the order of the stripes doesn't matter");
  assert.equal(Y.inkOn(["var(--muted)"]), "#0B0B0B", "a colour it can't read is treated as mid grey");
});
