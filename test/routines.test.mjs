import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../js/routines.js";
import * as E from "../js/engine.js";

const TODAY = "2026-10-05"; // 周一

test("occurrences follow the weekday minutes, range and skips", () => {
  const r = { id: "g", days: [0, 60, 0, 40, 0, 60, 0], start: "2026-10-01", end: "", skip: ["2026-10-07"] };
  const occ = R.occurrences(r, TODAY);
  assert.deepEqual(occ.slice(0, 4), [
    { date: "2026-10-05", est: 60 },
    { date: "2026-10-09", est: 60 },
    { date: "2026-10-12", est: 60 },
    { date: "2026-10-14", est: 40 }
  ]);
  assert.ok(occ.every((o) => o.date <= "2026-10-18"), "two weeks ahead");
  assert.equal(R.occurrences({ ...r, end: "2026-10-08" }, TODAY).length, 1);
  assert.equal(R.occurrences({ ...r, start: "2026-10-10" }, TODAY)[0].date, "2026-10-12");
  assert.equal(R.occurrences({ ...r, paused: true }, TODAY).length, 0);
});

test("ids round-trip and describe reads well", () => {
  const id = R.routineTaskId("abc-123", "2026-10-05");
  assert.deepEqual(R.parseRoutineTaskId(id), { rid: "abc-123", date: "2026-10-05" });
  assert.equal(R.parseRoutineTaskId("plain-id"), null);
  assert.equal(R.describe({ days: [0, 60, 0, 40, 0, 60, 0] }), "Mon 60 · Wed 40 · Fri 60");
  assert.equal(R.describe({ days: [30, 30, 30, 30, 30, 30, 30] }), "Every day 30m");
  assert.equal(R.weeklyMinutes({ days: [0, 60, 0, 40, 0, 60, 0] }), 160);
});

test("missed routine tasks are not spread as overdue", () => {
  const ctx = { today: TODAY, projects: [], items: [], capacity: { default: 240 }, log: {}, tasks: [
    { id: "rt:g:2026-10-02", date: "2026-10-02", est: 60, status: "" },
    { id: "x", date: "2026-10-02", est: 30, status: "" }
  ] };
  assert.deepEqual(E.planOverdue(ctx).map((m) => m.id), ["x"]);
});

test("store: generate, edit, skip a day, delete", async () => {
  const store = await import("../js/store.js?routines");
  const t = store.today();
  const days = [0, 0, 0, 0, 0, 0, 0];
  days[new Date(Date.UTC(...t.split("-").map((v, i) => (i === 1 ? v - 1 : Number(v))))).getUTCDay()] = 45;   // 今天这个星期几做 45 分钟
  const rid = store.saveRoutine({ title: "Gym", category: "Fun", days });
  const mine = () => store.all("tasks").filter((x) => x.id.startsWith("rt:" + rid + ":"));
  assert.equal(mine().length, 2, "this weekday, this week and next");
  assert.ok(mine().every((x) => x.est === 45 && x.title === "Gym" && x.updated === 1), "generated rows carry updated = 1");
  assert.equal(store.materializeRoutines(), 0, "nothing new to add");

  // 改分钟：未开始的跟着变；已经做完的不动
  const [first, second] = mine().sort((a, b) => a.date.localeCompare(b.date));
  store.setStatus(first.id, "done");
  store.saveRoutine({ id: rid, days: days.map((v) => (v ? 60 : 0)), title: "Gym legs" });
  assert.equal(store.get("tasks", first.id).est, 45);
  assert.equal(store.get("tasks", first.id).status, "done");
  assert.equal(store.get("tasks", second.id).est, 60);
  assert.equal(store.get("tasks", second.id).title, "Gym legs");

  // 删掉某一次：记进 skip，不会再生成
  store.deleteTask(second.id);
  assert.equal(store.get("tasks", second.id), null);
  assert.equal(store.materializeRoutines(), 0);
  assert.ok(store.routines()[0].skip.includes(second.date));

  // 删规则：未来没开始的删掉，做过的留着
  store.deleteRoutine(rid);
  assert.equal(store.routines().length, 0);
  assert.equal(store.get("tasks", first.id).status, "done");
});
