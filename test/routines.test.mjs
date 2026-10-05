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

test("how long: lengths, a last day, at most a year", () => {
  assert.equal(R.endFor(TODAY, 7), "2026-10-11");
  assert.equal(R.endFor(TODAY, 28), "2026-11-01");
  assert.equal(R.clampEnd(TODAY, "2026-09-01"), TODAY, "can't end before it starts");
  assert.equal(R.clampEnd(TODAY, "2028-01-01"), addDays(TODAY, R.MAX_DAYS - 1));
  const r = { days: [0, 60, 0, 40, 0, 60, 0], start: TODAY, end: "2026-10-18", skip: ["2026-10-07"] };
  assert.deepEqual(R.occurrences(r).map((o) => o.date + " " + o.est), ["2026-10-05 60", "2026-10-09 60", "2026-10-12 60", "2026-10-14 40", "2026-10-16 60"]);
  assert.equal(R.occurrences(r, "2026-10-13").length, 2, "from a later day");
  assert.equal(R.occurrences({ ...r, end: "" }).length, 0, "no last day → nothing");
});

test("ids round-trip", () => {
  const id = R.routineTaskId("abc-123", "2026-10-05");
  assert.deepEqual(R.parseRoutineTaskId(id), { rid: "abc-123", date: "2026-10-05" });
  assert.equal(R.parseRoutineTaskId("plain-id"), null);
});

test("missed repeating tasks are not spread as overdue", () => {
  const ctx = { today: TODAY, projects: [], items: [], capacity: { default: 240 }, log: {}, tasks: [
    { id: "rt:g:2026-10-02", date: "2026-10-02", est: 60, status: "" },
    { id: "x", date: "2026-10-02", est: 30, status: "" }
  ] };
  assert.deepEqual(E.planOverdue(ctx).map((m) => m.id), ["x"]);
});

test("store: add with repeat, edit this / following / all, re-plan, delete with scopes", async () => {
  const store = await import("../js/store.js?routines");
  const t = store.today();
  const first = store.addRepeating({ date: t, title: "Gym", est: 45, category: "Fun" }, R.daysFor("daily", t, 45), R.endFor(t, 14));
  const rid = R.parseRoutineTaskId(first).rid;
  const all = () => store.seriesTasks(rid);
  assert.equal(all().length, 14, "every day for two weeks, all on the calendar now");
  assert.ok(all().every((x) => x.est === 45 && x.title === "Gym" && x.category === "Fun" && x.updated === 1));
  assert.equal(store.routineOf(first).end, addDays(t, 13));

  // 改：只改这次 / 这次和以后 / 全部（做过的不动）
  const [a, b, c] = all();
  store.setStatus(a.id, "done");
  store.editSeries(c.id, { est: 30 }, "this");
  assert.equal(store.get("tasks", c.id).est, 30);
  assert.equal(store.get("tasks", b.id).est, 45);
  store.editSeries(b.id, { title: "Gym legs" }, "following");
  assert.equal(store.get("tasks", a.id).title, "Gym");
  assert.equal(store.get("tasks", b.id).title, "Gym legs");
  assert.ok(all().slice(1).every((x) => x.title === "Gym legs"));
  store.editSeries(c.id, { est: 50 }, "all");
  assert.equal(store.get("tasks", a.id).est, 45, "done one stays");
  assert.ok(all().slice(1).every((x) => x.est === 50));
  assert.deepEqual(store.routineOf(first).days, [50, 50, 50, 50, 50, 50, 50]);

  // 改重复（从第三天起）：只剩这天同一个星期几，延长到 4 周
  store.replanSeries(c.id, R.daysFor("weekly", c.date, 60), R.endFor(t, 28));
  const later = all().filter((x) => x.date >= c.date);
  assert.ok(later.every((x) => weekday(x.date) === weekday(c.date) && x.est === 60), later.map((x) => x.date).join());
  assert.equal(later.length, 4, "that weekday through four weeks from the start");
  assert.ok(store.get("tasks", b.id), "days before stay");

  // 删：这次和以后（做过的留着）
  const n = all().length;
  assert.equal(store.seriesScope(later[1].id, "following").length, 3);
  store.deleteSeries(later[1].id, "following");
  assert.equal(all().length, n - 3);
  assert.equal(store.routineOf(first).end, addDays(later[1].date, -1));
  // 这次和之前：done 的 a 留着
  store.deleteSeries(c.id, "earlier");
  assert.deepEqual(all().map((x) => x.id), [a.id]);
  // 全部：规则也没了，做过的那条还在
  store.deleteSeries(a.id, "all");
  assert.equal(store.routineOf(a.id), null);
  assert.equal(store.get("tasks", a.id).status, "done");
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
  assert.equal(store.timeTotal(nid), 20, "time entries point at the new id");
  const weekdays = Array.from({ length: 7 }, (_, i) => addDays(t, i)).filter((d) => weekday(d) > 0 && weekday(d) < 6);
  const want = new Set([t, ...weekdays]);
  assert.equal(store.seriesTasks(R.parseRoutineTaskId(nid).rid).length, want.size);
  // 单独删一次：记进 skip，改重复时也不会再长出来
  const other = store.seriesTasks(R.parseRoutineTaskId(nid).rid).find((x) => x.id !== nid);
  store.deleteSeries(other.id, "this");
  store.replanSeries(nid, R.daysFor("weekdays", t, 30), R.endFor(t, 7));
  assert.equal(store.get("tasks", other.id), null);
});
