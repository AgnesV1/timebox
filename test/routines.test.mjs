import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../js/routines.js";
import * as E from "../js/engine.js";
import { addDays, weekday } from "../js/dates.js";

console.warn = () => {};   // 「Can't save on this device」
const TODAY = "2026-10-05"; // 周一

test("patterns turn into weekday minutes and back", () => {
  assert.deepEqual(R.daysFor("daily", TODAY, 30), [30, 30, 30, 30, 30, 30, 30]);
  assert.deepEqual(R.daysFor("weekdays", TODAY, 45), [0, 45, 45, 45, 45, 45, 0]);
  assert.deepEqual(R.daysFor("weekly", "2026-10-07", 60), [0, 0, 0, 60, 0, 0, 0]);
  assert.equal(R.patternOf([30, 30, 30, 30, 30, 30, 30], TODAY), "daily");
  assert.equal(R.patternOf([0, 45, 45, 45, 45, 45, 0], TODAY), "weekdays");
  assert.equal(R.patternOf([0, 60, 0, 0, 0, 0, 0], TODAY), "weekly");
  assert.equal(R.patternOf([0, 60, 0, 40, 0, 60, 0], TODAY), "custom");
  assert.equal(R.describe({ days: [0, 60, 0, 40, 0, 60, 0] }), "Mon 60 · Wed 40 · Fri 60");
  assert.equal(R.describe({ days: [30, 30, 30, 30, 30, 30, 30] }), "Every day 30m");
  assert.equal(R.describe({ days: [0, 45, 45, 45, 45, 45, 0] }), "Weekdays 45m");
});

test("how long: lengths, a last day, or for good", () => {
  assert.equal(R.endFor(TODAY, 7), "2026-10-11");
  assert.equal(R.endFor(TODAY, 28), "2026-11-01");
  assert.equal(R.endFor(TODAY, 0), "", "0 = no last day");
  assert.equal(R.clampEnd(TODAY, "2026-09-01"), TODAY, "can't end before it starts");
  assert.equal(R.clampEnd(TODAY, ""), "");
  const r = { days: [0, 60, 0, 40, 0, 60, 0], start: TODAY, end: "2026-10-18", skip: ["2026-10-07"] };
  assert.deepEqual(R.occurrences(r).map((o) => o.date + " " + o.est), ["2026-10-05 60", "2026-10-09 60", "2026-10-12 60", "2026-10-14 40", "2026-10-16 60"]);
  assert.equal(R.occurrences(r, "2026-10-13").length, 2, "from a later day");
  assert.equal(R.occurrences({ ...r, end: "" }, TODAY, "2026-10-11").length, 2, "no last day: up to the day asked");
  assert.equal(R.dueOn(r, "2026-10-07"), 0, "skipped");
  assert.equal(R.dueOn(r, "2026-10-19"), 0, "after the end");
  assert.equal(R.describe({ perWeek: 3, min: 60 }, "monday", "pool"), "3×/week 60m");
});

test("ids round-trip", () => {
  const id = R.routineTaskId("abc-123", "2026-10-05");
  assert.deepEqual(R.parseRoutineTaskId(id), { rid: "abc-123", date: "2026-10-05" });
  assert.equal(R.parseRoutineTaskId("plain-id"), null);
});

test("missed auto tasks are not spread as overdue", () => {
  const ctx = { today: TODAY, projects: [], items: [], capacity: { default: 240 }, log: {}, tasks: [
    { id: "rt:g:2026-10-02", date: "2026-10-02", est: 60, status: "" },
    { id: "au:i1:2026-10-02", date: "2026-10-02", est: 60, status: "" },
    { id: "x", date: "2026-10-02", est: 30, status: "" }
  ] };
  assert.deepEqual(E.planOverdue(ctx).map((m) => m.id), ["x"]);
});

const gym = { id: "g", name: "Gym", kind: "regular", place: "auto", status: "active", rule: { days: [0, 60, 0, 60, 0, 60, 0], start: "2026-10-01", end: "", skip: [] } };
const yoga = { id: "y", name: "Yoga", kind: "regular", place: "pool", status: "active", rule: { perWeek: 3, min: 30, start: "2026-10-01", end: "" } };
const b2 = { id: "b2", name: "B2", kind: "total", place: "auto", status: "active", deadline: "2026-10-16", early: 0 };
const ctxOf = (over = {}) => ({ today: TODAY, weekStartsOn: "monday", projects: [gym, yoga, b2], items: [{ id: "i1", projectId: "b2", title: "Unit 1", est: 120, order: 1 }, { id: "i2", projectId: "b2", title: "Unit 2", est: 600, order: 2 }],
  tasks: [], capacity: { default: 240, weekly: null, overrides: {} }, log: {}, level: true, ...over });

test("previews: regular days and projected shares, never today or the past, none once it's real", () => {
  const c = ctxOf();
  assert.deepEqual(E.ghostsOn(c, TODAY), []);
  const wed = E.ghostsOn(c, "2026-10-07");
  assert.deepEqual(wed.map((g) => g.kind + " " + g.title + " " + g.est), ["regular Gym 60", "total B2 " + wed[1].est]);
  assert.ok(wed[1].est >= 5);
  assert.deepEqual(E.ghostsOn(c, "2026-10-08").map((g) => g.title), ["B2"], "Thursday: no gym");
  const c2 = ctxOf({ tasks: [{ id: "rt:g:2026-10-07", date: "2026-10-09", est: 60, status: "", projectId: "g" }] });
  assert.deepEqual(E.ghostsOn(c2, "2026-10-07").map((g) => g.title), ["B2"], "moved to Friday: Wednesday's preview is gone");
});

test("regular time takes room before totals are spread; it doesn't count toward the line", () => {
  const c = ctxOf();
  assert.equal(E.fixedOn(c, "2026-10-07"), 60);
  assert.equal(E.needOn(c, gym, "2026-10-07"), 0);
  const c2 = ctxOf({ tasks: [{ id: "rt:g:2026-10-05", date: TODAY, est: 60, status: "done", projectId: "g" }, { id: "t", date: TODAY, est: 30, status: "done", projectId: "b2" }] });
  assert.equal(E.doneOn(c2, TODAY), 30);
});

test("today's chunks for an auto total: by item order, minus what's already planned", () => {
  const c = ctxOf({ tasks: [{ id: "m", date: TODAY, est: 20, status: "", projectId: "b2", itemId: "i1" }] });
  const chunks = E.autoChunks(c, { b2: 150 }, ["b2"]);
  assert.deepEqual(chunks.map((x) => x.id + " " + x.est), ["au:i1:" + TODAY + " 100", "au:i2:" + TODAY + " 30"]);
  assert.deepEqual(E.autoChunks(c, { b2: 150 }, ["g"]), [], "only the plans asked for");
  const done = ctxOf({ tasks: [{ id: "au:i1:" + TODAY, date: TODAY, est: 60, status: "", projectId: "b2", itemId: "i1" }] });
  assert.deepEqual(E.autoChunks(done, { b2: 150 }, ["b2"]), [], "already there today");
});

test("this week of a regular plan, and pool sessions left", () => {
  const c = ctxOf({ tasks: [
    { id: "a", date: "2026-10-05", est: 30, status: "done", projectId: "y" },
    { id: "b", date: "2026-10-08", est: 30, status: "", projectId: "y" },
    { id: "c", date: "2026-10-09", est: 30, status: "drop", projectId: "y" },
    { id: "rt:g:2026-10-05", date: "2026-10-05", est: 60, status: "done", projectId: "g" }
  ] });
  assert.deepEqual(E.regularWeek(c, yoga), { target: 3, placed: 2, done: 1, left: 1 });
  assert.deepEqual(E.regularWeek(c, gym), { target: 3, placed: 1, done: 1, left: 2 });
  assert.deepEqual(E.poolRegulars(c).map((x) => x.plan.id + " " + x.left + " " + x.min), ["y 1 30"]);
});

test("store: repeating makes a plan; only the first day is a task; edit, re-plan, delete", async () => {
  const store = await import("../js/store.js?routines");
  const t = store.today();
  const first = store.addRepeating({ date: t, title: "Gym", est: 45 }, R.daysFor("daily", t, 45), "");
  const rid = R.parseRoutineTaskId(first).rid;
  const plan = store.get("projects", rid);
  assert.equal(plan.kind, "regular");
  assert.equal(plan.place, "auto");
  assert.equal(plan.rule.end, "", "for good");
  assert.equal(store.seriesTasks(rid).length, 1, "the rest are previews");
  assert.equal(store.get("tasks", first).projectId, rid);

  // 以后某天的预览：拖动 / 点开时才落成
  const d3 = addDays(t, 3);
  const later = store.materialize(R.routineTaskId(rid, d3));
  assert.equal(store.get("tasks", later).est, 45);
  assert.equal(store.seriesTasks(rid).length, 2);

  // 改：只改这次 / 这次和以后（规则跟着变）
  store.editSeries(first, { est: 30 }, "this");
  assert.equal(store.get("tasks", first).est, 30);
  assert.equal(store.get("tasks", later).est, 45);
  store.editSeries(first, { title: "Gym legs", est: 50 }, "following");
  assert.equal(store.get("tasks", later).title, "Gym legs");
  assert.equal(store.get("projects", rid).name, "Gym legs");
  assert.deepEqual(store.get("projects", rid).rule.days, [50, 50, 50, 50, 50, 50, 50]);

  // 改重复：只剩这天同一个星期几；落成了但对不上的那一次删掉
  store.replanSeries(first, R.daysFor("weekly", t, 60), R.endFor(t, 28));
  assert.equal(store.get("tasks", later), null);
  assert.equal(store.get("tasks", first).est, 60);
  assert.equal(store.get("projects", rid).rule.end, addDays(t, 27));

  // 单独删一次：记进 skip
  const next = store.materialize(R.routineTaskId(rid, addDays(t, 7)));
  store.deleteSeries(next, "this");
  assert.deepEqual(store.get("projects", rid).rule.skip, [addDays(t, 7)]);
  // 这次和以后：从第二周那次起不再重复，规则在前一天结束
  const wk2 = store.materialize(R.routineTaskId(rid, addDays(t, 14)));
  store.deleteSeries(wk2, "following");
  assert.equal(store.get("projects", rid).rule.end, addDays(t, 13));
  assert.equal(store.get("tasks", wk2), null);
  assert.ok(store.get("tasks", first), "earlier ones stay");
});

test("store: delete all keeps the plan as Dropped when something was done", async () => {
  const store = await import("../js/store.js?routines");
  const t = store.today();
  const a = store.addRepeating({ date: t, title: "Run", est: 20 }, R.daysFor("daily", t, 20), "");
  const rid = R.parseRoutineTaskId(a).rid;
  store.setStatus(a, "done");
  store.deleteSeries(a, "all");
  assert.equal(store.get("projects", rid).status, "dropped");
  assert.equal(store.get("tasks", a).status, "done");
  const b = store.addRepeating({ date: t, title: "Stretch", est: 10 }, R.daysFor("daily", t, 10), "");
  const rid2 = R.parseRoutineTaskId(b).rid;
  store.deleteSeries(b, "all");
  assert.equal(store.get("projects", rid2), null, "nothing done: gone");
});

test("store: an existing task becomes the first of a series, its time comes along", async () => {
  const store = await import("../js/store.js?routines");
  const t = store.today();
  const id = store.addTask({ date: t, title: "French", est: 40 });
  store.logTime(id, 20, "09:20");
  const nid = store.repeatTask(id, R.daysFor("weekdays", t, 40), R.endFor(t, 7));
  assert.notEqual(nid, id);
  assert.equal(store.get("tasks", id), null);
  assert.equal(store.get("tasks", nid).title, "French");
  assert.equal(store.timeTotal(nid), 20, "time comes along");
  assert.equal(store.routineOf(nid).name, "French");
});

test("store: today's auto tasks appear once; deleting one doesn't bring it back", async () => {
  const store = await import("../js/store.js?auto");
  const t = store.today();
  const g = store.saveProject({ name: "Swim", kind: "regular", place: "auto", rule: { days: R.daysFor("daily", t, 30), start: t, end: "" } });
  const p = store.saveProject({ name: "Thesis", kind: "total", place: "auto", deadline: addDays(t, 9), early: 0, total: 600 });
  const swim = R.routineTaskId(g, t);
  assert.equal(store.get("tasks", swim).est, 30, "regular: today's one is there");
  const chunk = store.tasksOn(t).find((x) => x.projectId === p);
  assert.ok(chunk && chunk.id.startsWith("au:"), "total: today's share is there");
  assert.equal(store.get("items", chunk.itemId).est, 600, "one big item from the total");
  store.deleteTask(chunk.id);
  store.deleteTask(swim);
  store.ensureTodayLog();
  assert.equal(store.tasksOn(t).filter((x) => x.projectId === p).length, 0, "the share stays deleted");
  assert.equal(store.get("tasks", swim), null, "the regular one stays deleted (skip)");

  // 池里的规律计划：拖到某天排一次
  const y = store.saveProject({ name: "Yoga", kind: "regular", place: "pool", rule: { perWeek: 2, min: 25, start: t } });
  const yid = store.placeRegular(y, t);
  assert.equal(store.get("tasks", yid).est, 25);
  assert.equal(E.regularWeek(store.ctx(), store.get("projects", y)).left, 1);
});

test("store: stopping from the very first time leaves no empty plan", async () => {
  const store = await import("../js/store.js?routines");
  const t = store.today();
  const a = store.addRepeating({ date: t, title: "Nap", est: 20 }, R.daysFor("daily", t, 20), "");
  const rid = R.parseRoutineTaskId(a).rid;
  store.deleteSeries(a, "following");
  assert.equal(store.get("projects", rid), null);
});
