import { test } from "node:test";
import assert from "node:assert/strict";
import * as store from "../js/store.js";

// store 在 node 里也能跑（没有 localStorage 时只是存不下来）；每个测试用自己的任务
console.warn = () => {};   // 「Can't save on this device」
const realNow = Date.now;
const at = (ms) => { Date.now = () => ms; };
test.afterEach(() => { Date.now = realNow; });

test("start, stop: logs the session and fills actual", () => {
  const id = store.addTask({ title: "French", est: 45 });
  at(new Date(2026, 9, 4, 9, 10).getTime());
  store.startTimer(id);
  assert.equal(store.timer().taskId, id);
  at(new Date(2026, 9, 4, 9, 40, 20).getTime());
  const r = store.stopTimer();
  assert.deepEqual(r, { taskId: id, min: 30 });
  assert.equal(store.timer(), null);
  const [x] = store.timeOf(id);
  assert.equal(x.from, "09:10");
  assert.equal(x.to, "09:40");
  assert.equal(x.min, 30);
  assert.equal(store.get("tasks", id).actual, 30);
  assert.equal(store.get("tasks", id).status, "", "stopping doesn't mark it");
});

test("starting another task stops and logs the running one", () => {
  const a = store.addTask({ title: "A" }), b = store.addTask({ title: "B" });
  at(new Date(2026, 9, 4, 10, 0).getTime());
  store.startTimer(a);
  at(new Date(2026, 9, 4, 10, 25).getTime());
  const r = store.startTimer(b);
  assert.deepEqual(r, { taskId: a, min: 25 });
  assert.equal(store.timer().taskId, b);
  assert.equal(store.timeTotal(a), 25);
  store.discardTimer();
  assert.equal(store.timer(), null);
  assert.equal(store.timeTotal(b), 0);
});

test("under a minute isn't logged", () => {
  const id = store.addTask({ title: "Blip" });
  at(1_000_000);
  store.startTimer(id);
  at(1_000_000 + 25_000);
  assert.equal(store.stopTimer().min, 0);
  assert.equal(store.timeOf(id).length, 0);
});

test("manual log: minutes + end time, and actual is the sum", () => {
  const id = store.addTask({ title: "Read", est: 30 });
  store.setStatus(id, "done");
  store.logTime(id, 90, "10:30");
  store.logTime(id, 20, "");
  const list = store.timeOf(id);
  assert.equal(list.length, 2);
  const timed = list.find((x) => x.to);
  assert.equal(timed.from, "09:00");
  assert.equal(list.find((x) => !x.to).from, "");
  assert.equal(store.get("tasks", id).actual, 110);
  // 跨零点：00:20 结束、用了 50 分钟 → 23:30 开始
  const late = store.addTask({ title: "Late" });
  store.logTime(late, 50, "00:20");
  assert.equal(store.timeOf(late)[0].from, "23:30");
  store.deleteTime(timed.id);
  assert.equal(store.get("tasks", id).actual, 20);
});

test("un-marking keeps tracked time; deleting the task deletes its time", () => {
  const id = store.addTask({ title: "Gym" });
  store.logTime(id, 40, "18:00");
  store.setStatus(id, "done");
  store.setStatus(id, "done");   // 再点一次 = 取消
  assert.equal(store.get("tasks", id).actual, 40);
  store.setStatus(id, "drop");
  assert.equal(store.get("tasks", id).actual, 40);
  at(5_000_000);
  store.startTimer(id);
  store.deleteTask(id);
  assert.equal(store.timeOf(id).length, 0);
  assert.equal(store.timer(), null);
});

test("time lives on the task: one Times text, pushed with the task", () => {
  const id = store.addTask({ title: "Sync me" });
  store.logTime(id, 15, "08:15");
  store.logTime(id, 10, "");
  store.logTime(id, 30, "07:30");
  assert.equal(store.get("tasks", id).times, "07:00-07:30 30m; 08:00-08:15 15m; 10m", "sorted by clock, untimed last");
  const out = store.outgoing();
  assert.ok(!out.rows.time, "no separate time table any more");
  assert.equal(out.rows.tasks.find((r) => r.id === id).times, "07:00-07:30 30m; 08:00-08:15 15m; 10m");
  store.pushed(out);
  assert.equal(store.hasPending(), false);
});

test("times text: parse and format round-trip, hand edits in the Sheet still read", async () => {
  const T = await import("../js/times.js");
  assert.deepEqual(T.parseTimes("09:10-09:40 30m; 14:00-14:45 45m; 20m"), [{ from: "09:10", to: "09:40", min: 30 }, { from: "14:00", to: "14:45", min: 45 }, { from: "", to: "", min: 20 }]);
  assert.deepEqual(T.parseTimes("9:10–9:40；23:50-00:20"), [{ from: "09:10", to: "09:40", min: 30 }, { from: "23:50", to: "00:20", min: 30 }]);
  assert.deepEqual(T.parseTimes("  ; nonsense; 0m"), []);
  assert.equal(T.formatTimes(T.parseTimes("09:10-09:40 30m; 20m")), "09:10-09:40 30m; 20m");
});
