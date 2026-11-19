// 日历的 Year 视图：那天红不红（dayLoad）、一年每天的样子（yearDays）、两种分档、长条怎么排、第二条画什么
import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "../js/year.js";

const T = "2026-11-04";   // 周三
const GROUPS = [{ name: "Work", color: "#3F62B5" }, { name: "Fitness", color: "#E6DCC3" }, { name: "Chores", color: "#6A3A22" }];
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

test("yearDays: minutes per group, and Build + Work + Chores added up for the first strip", () => {
  const groups = [{ name: "Build", color: "#3E8E6E" }, ...GROUPS, { name: "Leisure", color: "#E07A2B" }];
  const c = ctx({ groups, tasks: [
    { id: "a", date: "2026-03-04", actual: 90, group: "Build" },
    { id: "b", date: "2026-03-04", actual: 30, group: "Build" },
    { id: "c", date: "2026-03-04", actual: 60, group: "Work" },
    { id: "chore-2026-03-04", date: "2026-03-04", actual: 15, status: "done", group: "Chores" },
    { id: "d", date: "2026-03-04", actual: 120, group: "Leisure" },
    { id: "e", date: "2026-03-04", actual: 45, group: "Fitness" },
    { id: "f", date: "2026-03-04", est: 300, group: "Work" }] });
  const d = day(c, "2026-03-04");
  assert.deepEqual(d.mins, { Build: 120, Work: 60, Chores: 15, Leisure: 120, Fitness: 45 }, "logged time only");
  assert.equal(d.core, 195, "Leisure and Fitness stay out of the total");
  assert.deepEqual([day(c, "2026-03-07").weekend, d.weekend], [true, false]);
  assert.equal(day(ctx({ superRest: { days: { "2026-03-04": true } } }), "2026-03-04").gold, true);
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
  assert.equal(Y.yearDays(c, 2026).filter((d) => d.groups.has("Work")).length, 1);
});

test("yearDays: Friends cuts across groups: a task done with someone lights it, whatever its group", () => {
  const groups = [...GROUPS, { name: "Leisure", color: "#E07A2B", friends: true }, { name: "Friends", color: "#8B62AE", friends: true }];
  const on = (id, date, x = {}) => ({ id, date, group: "Leisure", ...x });
  const meets = ["a", "b", "c", "d", "e"].map((id) => ({ id: "mt:" + id, taskId: id, friends: ["ana"] }));
  const tasks = [
    on("a", "2026-03-02", { status: "done" }),
    on("b", "2026-03-03", { actual: 90 }),
    on("c", "2026-03-04"),
    on("d", "2026-03-05", { actual: 30, status: "delay" }),
    on("e", "2026-03-06", { status: "drop" }),
    on("f", "2026-03-09", { actual: 60 })];
  const c = ctx({ groups, tasks, meets: [...meets, { id: "mt:f", taskId: "f", friends: [] }, { id: "x", date: "2026-03-10", friends: ["ana"], taskId: "" }] });
  const names = (d) => [...day(c, d).groups].sort();
  assert.deepEqual(names("2026-03-02"), ["Friends"], "Done with someone, no time logged");
  assert.deepEqual(names("2026-03-03"), ["Friends", "Leisure"], "time logged with someone: both");
  assert.deepEqual(names("2026-03-04"), [], "planned, not done");
  assert.deepEqual(names("2026-03-05"), ["Leisure"], "delayed: it didn't happen with them");
  assert.deepEqual(names("2026-03-06"), [], "dropped");
  assert.deepEqual(names("2026-03-09"), ["Leisure"], "nobody picked");
  assert.deepEqual(names("2026-03-10"), [], "a catch-up noted on the Friends page isn't a task");
  assert.equal(Y.yearDays(c, 2026).filter((d) => d.groups.has("Friends")).length, 2);
  const renamed = ctx({ groups: [{ name: "Leisure", color: "#E07A2B" }, { name: "People", color: "#8B62AE", friends: true }], tasks, meets });
  assert.deepEqual([...day(renamed, "2026-03-02").groups], ["People"], "a renamed Friends group is the one that can pick people");
  assert.deepEqual([...day(ctx({ tasks, meets }), "2026-03-02").groups], [], "no such group: nothing to light");
});

test("coreLevel: five steps up to 7 hours, red only past them, and never on a gold day", () => {
  assert.deepEqual([0, 1, 84, 85, 168, 336, 337, 420].map((m) => Y.coreLevel(m)), [0, 1, 1, 2, 2, 4, 5, 5]);
  assert.equal(Y.coreLevel(421), Y.OVER_LEVEL, "just past 7 hours");
  assert.equal(Y.coreLevel(421, true), 5, "a gold day stays at the brightest step");
  assert.equal(Y.coreLevel(undefined), 0);
});

test("heatLevel: one step an hour, topping out at 5 hours", () => {
  assert.deepEqual([0, undefined, 1, 60, 61, 240, 241, 300, 999].map(Y.heatLevel), [0, 0, 1, 1, 2, 4, 5, 5, 5]);
});

test("stripLayout: one column a week, the year starting on its own weekday's row", () => {
  const y = Y.stripLayout(2026);
  assert.deepEqual([y.start, y.first, y.weeks], ["2025-12-29", 4, 53], "1 Jan 2026 is a Thursday");
  assert.deepEqual([y.months[0], y.months[1], y.months[11]], [{ month: 0, date: "2026-01-01", col: 1 }, { month: 1, date: "2026-02-01", col: 5 }, { month: 11, date: "2026-12-01", col: 49 }]);
  const sunday = Y.stripLayout(2026, "sunday");
  assert.deepEqual([sunday.start, sunday.first], ["2025-12-28", 5]);
  assert.equal(Y.stripLayout(2040).weeks, 54, "a leap year starting on a Sunday touches 54 weeks");
});

test("marksOf: Leisure and Chores are dots, every other group fills (Fitness too), in the groups' order", () => {
  const groups = [{ name: "Build" }, { name: "Work" }, { name: "Friends" }, { name: "Leisure" }, { name: "Fitness" }, { name: "Chores" }, { name: "Garden" }];
  const m = Y.marksOf({ groups: new Set(["Leisure", "Work", "Fitness", "Chores", "Garden"]), commute: true, rest: true, weekend: false, holiday: "" }, groups);
  assert.deepEqual(m.fills.map((g) => g.name), ["Work", "Fitness", "Garden"]);
  assert.deepEqual([m.leisure, m.chores, m.commute, m.rest, m.dates, m.soft], [true, true, true, true, true, false]);
  const quiet = (x) => Y.marksOf({ groups: new Set(), commute: false, rest: false, weekend: false, holiday: "", ...x }, groups);
  assert.deepEqual([quiet({}).soft, quiet({ weekend: true }).soft, quiet({ holiday: "Canada Day" }).soft], [false, true, true], "weekends and holidays have pale digits");
  assert.deepEqual([quiet({}).fills, quiet({}).leisure, quiet({}).chores, quiet({}).commute], [[], false, false, false]);
});

test("marksOf: whatever was switched off in Days is left out; hiding dates takes the pale digits with them", () => {
  const groups = [{ name: "Build" }, { name: "Work" }, { name: "Leisure" }, { name: "Chores" }];
  const day = { groups: new Set(["Build", "Work", "Leisure", "Chores"]), commute: true, rest: true, weekend: true, holiday: "" };
  const m = Y.marksOf(day, groups, new Set(["Work", "Leisure", Y.COMMUTE, Y.REST]));
  assert.deepEqual(m.fills.map((g) => g.name), ["Build"]);
  assert.deepEqual([m.leisure, m.chores, m.commute, m.rest, m.dates, m.soft], [false, true, false, false, true, true]);
  assert.deepEqual(Y.marksOf(day, groups).fills.map((g) => g.name), ["Build", "Work"], "nothing hidden by default");
  const bare = Y.marksOf(day, groups, new Set([Y.DATES]));
  assert.deepEqual([bare.dates, bare.soft, bare.chores], [false, false, true]);
});
