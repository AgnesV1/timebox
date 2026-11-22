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

const gym = { id: "g", name: "Gym", kind: "regular", place: "auto", status: "active", rule: { days: [0, 60, 0, 60, 0, 60, 0], start: "2026-10-01", end: "", skip: [] } };
const yoga = { id: "y", name: "Yoga", kind: "regular", place: "pool", status: "active", rule: { perWeek: 3, min: 30, start: "2026-10-01", end: "" } };
const b2 = { id: "b2", name: "B2", kind: "total", place: "auto", status: "active", deadline: "2026-10-16", early: 0 };
const ctxOf = (over = {}) => ({ today: TODAY, weekStartsOn: "monday", projects: [gym, yoga, b2], items: [{ id: "i1", projectId: "b2", title: "Unit 1", est: 120, order: 1 }, { id: "i2", projectId: "b2", title: "Unit 2", est: 600, order: 2 }],
  tasks: [], capacity: { default: 240, weekly: null, overrides: {} }, log: {}, level: true, ...over });

test("previews: fixed days only, never today or the past, none once it's real", () => {
  const c = ctxOf();
  assert.deepEqual(E.ghostsOn(c, TODAY), []);
  assert.deepEqual(E.ghostsOn(c, "2026-10-07").map((g) => g.kind + " " + g.title + " " + g.est), ["regular Gym 60"], "a total no longer shows a projected share");
  assert.deepEqual(E.ghostsOn(c, "2026-10-08"), [], "Thursday: no gym");
  const c2 = ctxOf({ tasks: [{ id: "rt:g:2026-10-07", date: "2026-10-09", est: 60, status: "", projectId: "g" }] });
  assert.deepEqual(E.ghostsOn(c2, "2026-10-07"), [], "moved to Friday: Wednesday's preview is gone");
});

test("this week of a regular plan", () => {
  const c = ctxOf({ tasks: [
    { id: "a", date: "2026-10-05", est: 30, status: "done", projectId: "y" },
    { id: "b", date: "2026-10-08", est: 30, status: "", projectId: "y" },
    { id: "c", date: "2026-10-09", est: 30, status: "drop", projectId: "y" },
    { id: "rt:g:2026-10-05", date: "2026-10-05", est: 60, status: "done", projectId: "g" }
  ] });
  assert.deepEqual(E.regularWeek(c, yoga), { target: 3, placed: 2, done: 1, left: 1 });
  assert.deepEqual(E.regularWeek(c, gym), { target: 3, placed: 1, done: 1, left: 2 });
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
  assert.equal(store.tasksOn(t).filter((x) => x.projectId === p).length, 0, "a total no longer gets a share of its own each day");
  store.deleteTask(swim);
  store.ensureToday();
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

test("store: a repeat sits right on its project; moving it takes the colour along; archive and restore", async () => {
  const store = await import("../js/store.js?repeat-group");
  const t = store.today();
  const id = store.addRepeating({ date: t, title: "Stretch", est: 10, group: "Fitness" }, R.daysFor("daily", t, 10), "");
  const rid = R.parseRoutineTaskId(id).rid;
  assert.equal(E.isRepeat(store.get("projects", rid)), true);
  assert.equal(store.groupOf(store.get("tasks", id)), "Fitness");
  store.setSeriesGroup(id, "Leisure");
  assert.equal(store.groupOf(store.get("tasks", id)), "Leisure");
  assert.equal(store.get("projects", rid).color, store.groupByName("Leisure").color, "the colour follows the project");
  store.setSeriesGroup(id, "");
  assert.equal(store.get("projects", rid).group, "", "no project");
  assert.equal(E.isRepeat({ kind: "regular", place: "pool" }), false, "a few times a week from the pool is still a plan");

  store.archiveProject(rid);
  assert.equal(E.isActive(store.get("projects", rid)), false);
  store.archiveProject(rid);
  assert.equal(store.get("projects", rid).status, "done", "archiving twice changes nothing");
  store.archiveProject(rid, false);
  assert.equal(E.isActive(store.get("projects", rid)), true);
});

test("a repeat that's switched off doesn't come up, and keeps its rule", () => {
  const r = { days: [0, 30, 0, 0, 0, 0, 0], start: TODAY, end: "", skip: [] };
  assert.equal(R.dueOn(r, TODAY), 30);
  assert.equal(R.dueOn({ ...r, off: true }, TODAY), 0);
});

test("regularWeek: about N a week wins over set days; a day counts once however many things were done on it", () => {
  const p = { id: "g", kind: "regular", place: "auto", status: "active", rule: { perWeek: 3, days: [0, 40, 0, 40, 0, 40, 0], start: TODAY } };
  const t = (id, date, status = "done", itemId = "") => ({ id, date, title: "", est: 30, status, projectId: "g", itemId, actual: null });
  const c = { today: TODAY, weekStartsOn: "monday", projects: [p], tasks: [t("a", TODAY), t("b", TODAY, "done", "i1"), t("c", addDays(TODAY, 2), "")] };
  assert.deepEqual(E.regularWeek(c, p), { target: 3, placed: 2, done: 1, left: 1 });
});

test("store: dragging ↻ makes a plan repeat for a while; switch it off and on; stopping turns it back into a plan", async () => {
  const store = await import("../js/store.js?plan-repeat");
  const t = store.today(), wd = weekday(t);
  let undo = null;
  store.onUndo((label, before) => { undo = before; });
  const pid = store.saveProject({ name: "IELTS", group: "Build", kind: "regular", place: "pool", rule: { perWeek: 2, min: 45 } });
  store.addPoolLines(pid, "", "Mock test · ×3");
  assert.equal(store.setPlanRepeat(pid, { on: [wd], start: t, end: "" }), false, "a last day is a must");
  assert.equal(store.setPlanRepeat(pid, { on: [wd, (wd + 2) % 7], start: t, end: addDays(t, 20) }), true);
  let p = store.get("projects", pid);
  assert.equal(p.place, "auto");
  assert.equal(p.rule.plan, true, "it stays a plan, not a loose repeat");
  assert.equal(p.rule.days[wd], 45, "the plan's default minutes");
  assert.equal(p.rule.perWeek, 2, "about N a week is left alone");
  const today = R.routineTaskId(pid, t);
  assert.equal(store.get("tasks", today)?.est, 45, "today's one is there straight away");

  store.toggleRepeat(pid, false);
  assert.equal(store.get("projects", pid).rule.off, true);
  assert.equal(store.get("tasks", today), null, "today's one, not started yet, goes away");
  assert.equal(E.ghostsOn(store.ctx(), addDays(t, 7)).length, 0, "no previews while it's off");
  store.toggleRepeat(pid, true);
  assert.equal(store.get("tasks", today)?.est, 45, "back on: today's one comes back");
  assert.equal(E.ghostsOn(store.ctx(), addDays(t, 7)).length, 1);
  assert.equal(E.ghostsOn(store.ctx(), addDays(t, 21)).length, 0, "nothing after the last day");

  store.editSeries(today, { title: "IELTS speaking" }, "all");
  assert.equal(store.get("projects", pid).name, "IELTS", "renaming the row doesn't rename the plan");

  store.stopRepeat(pid);
  p = store.get("projects", pid);
  assert.equal(p.place, "pool");
  assert.equal(p.rule.days, undefined);
  assert.equal(p.rule.perWeek, 2);
  assert.equal(store.all("items").filter((i) => i.projectId === pid).length, 1, "the pool is still there");
  store.undo(undo);
  assert.equal(store.get("projects", pid).place, "auto", "undo brings the repeat back");

  store.deleteSeries(R.routineTaskId(pid, t), "all");
  assert.ok(store.get("projects", pid), "deleting the whole repeat never deletes the plan");
  assert.equal(store.get("projects", pid).place, "pool");
});

test("store: old fixed-weekday plans become about N a week, once; new repeats and ↻ repeats stay", async () => {
  const store = await import("../js/store.js?weekly");
  const t = store.today();
  const gym = store.saveProject({ name: "Gym", group: "Fitness", kind: "regular", place: "auto", rule: { days: [0, 40, 0, 40, 0, 40, 0], start: addDays(t, -60), end: "" } });
  const old = store.saveProject({ name: "Nap", kind: "regular", place: "auto", rule: { days: [20, 20, 20, 20, 20, 20, 20], start: addDays(t, -30), end: addDays(t, -10) } });
  const swim = store.saveProject({ name: "Swim", kind: "regular", place: "auto", rule: { days: [0, 0, 30, 0, 0, 0, 0], perWeek: 2, min: 50, start: addDays(t, -9) } });
  const fresh = store.addRepeating({ date: t, title: "Stretch", est: 10 }, R.daysFor("daily", t, 10), "");
  const ielts = store.saveProject({ name: "IELTS", kind: "regular", place: "pool", rule: { min: 45 } });
  store.setPlanRepeat(ielts, { on: [weekday(t)], start: t, end: addDays(t, 14) });

  assert.equal(store.adoptWeekly(), true);
  const g = store.get("projects", gym);
  assert.equal(g.place, "pool");
  assert.equal(g.rule.perWeek, 3, "three weekdays → about 3 a week");
  assert.equal(g.rule.min, 40, "their minutes become the default");
  assert.equal(g.rule.days, undefined);
  assert.equal(store.get("projects", swim).rule.perWeek, 2, "a weekly number already written stays");
  assert.equal(store.get("projects", swim).rule.min, 50);
  assert.equal(store.get("projects", old).status, "active", "one past its last day stays where it was (it may still be dragged)");
  assert.equal(store.get("projects", old).rule.perWeek, 7);
  assert.equal(store.get("projects", R.parseRoutineTaskId(fresh).rid).place, "auto", "a repeat made from now on keeps its days");
  assert.equal(store.get("projects", ielts).place, "auto", "a ↻ repeat from the calendar stays");
  assert.equal(E.ghostsOn(store.ctx(), addDays(t, 7)).some((x) => x.plan.id === gym), false, "Gym no longer shows up by itself");
  assert.equal(store.routineOf(R.routineTaskId(gym, t)), null, "its old rows are plain rows now, not a repeat");
  assert.equal(store.adoptWeekly(), false, "runs once");
});

test("store: plans the first version of that change put away come back, once, with an undo", async () => {
  const store = await import("../js/store.js?weekly-fix");
  const t = store.today();
  let label = "", undo = null;
  store.onUndo((l, before) => { label = l; undo = before; });
  // 上一版转完的样子：拖着用、没有星期几、被标成 done（先照现在的转一遍，再归档）
  const train = store.saveProject({ name: "Training", group: "Fitness", kind: "regular", place: "auto", rule: { days: [0, 60, 0, 60, 0, 0, 0], start: addDays(t, -40), end: addDays(t, -20) } });
  store.materialize(R.routineTaskId(train, addDays(t, -21)));
  const ielts = store.saveProject({ name: "IELTS", kind: "regular", place: "auto", rule: { days: [0, 0, 0, 0, 0, 45, 0], start: addDays(t, -400), end: addDays(t, -300) } });
  store.addPoolLines(ielts, "", "Mock test · ×3");
  const dusty = store.saveProject({ name: "Old nap", kind: "regular", place: "auto", rule: { days: [20, 0, 0, 0, 0, 0, 0], start: addDays(t, -400), end: addDays(t, -300) } });
  const mine = store.saveProject({ name: "Q4", kind: "regular", place: "pool", rule: { min: 30 } });
  store.adoptWeekly();
  [train, ielts, dusty, mine].forEach((id) => store.archiveProject(id));
  undo = null;

  assert.equal(store.repairWeekly(false, [0, Infinity]), 2);
  assert.equal(store.get("projects", train).status, "active");
  assert.equal(store.get("projects", train).rule.perWeek, 2, "about 2 a week, from its two weekdays");
  assert.equal(store.get("projects", ielts).status, "active", "a plan with a pool comes back");
  assert.equal(store.get("projects", dusty).status, "done", "an old one with nothing recent stays put away");
  assert.equal(store.get("projects", mine).status, "done", "not one that change touched");
  assert.match(label, /Brought back Training, IELTS/);
  assert.equal(store.repairWeekly(false, [0, Infinity]), 0, "only once");
  store.undo(undo);
  assert.equal(store.get("projects", train).status, "done", "undo puts it back as it was");
});
