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

test("logging something already done: a finished task with its time, undoable as one step", () => {
  const id = store.addLogged({ date: "2026-10-03", title: "Reading", deep: true }, "14:00", "15:10");
  const t = store.get("tasks", id);
  assert.equal(t.status, "done");
  assert.equal(t.est, 70);
  assert.equal(t.actual, 70);
  assert.equal(t.times, "14:00-15:10 70m");
  assert.equal(t.deep, true);
  assert.equal(t.date, "2026-10-03");
  assert.equal(store.addLogged({ title: "Zero" }, "09:00", "09:00"), "", "nothing to log");
  const late = store.get("tasks", store.addLogged({ title: "Late" }, "23:30", "0:20"));
  assert.equal(late.actual, 50);
  assert.equal(late.times, "23:30-00:20 50m");
});

test("forgot to press Start / stopped late: move the start, stop at an earlier clock time, fix a segment", () => {
  const id = store.addTask({ title: "Essay", est: 60 });
  at(new Date(2026, 9, 4, 10, 0).getTime());
  store.startTimer(id);
  at(new Date(2026, 9, 4, 10, 5).getTime());
  assert.equal(store.setTimerStart("10:30"), false, "later than now");
  assert.equal(store.setTimerStart("9:50"), true);
  assert.equal(store.timer().start, new Date(2026, 9, 4, 9, 50).getTime());
  at(new Date(2026, 9, 4, 11, 0).getTime());
  assert.deepEqual(store.stopTimer("9:40"), { error: "before" }, "can't stop before it started");
  assert.ok(store.timer(), "still running");
  assert.deepEqual(store.stopTimer("10:30"), { taskId: id, min: 40 });
  assert.equal(store.get("tasks", id).times, "09:50-10:30 40m");
  assert.equal(store.editTime(id + "#0", "9:45", "10:15"), true);
  assert.equal(store.get("tasks", id).times, "09:45-10:15 30m");
  assert.equal(store.get("tasks", id).actual, 30);
  assert.equal(store.editTime(id + "#0", "10:15", "10:15"), false, "nothing in between");
  assert.equal(store.editTime(id + "#7", "10:00", "10:15"), false, "no such segment");
});

test("past midnight: an earlier clock time than now on the same night is yesterday", () => {
  const id = store.addTask({ title: "Night read", est: 60 });
  at(new Date(2026, 9, 4, 23, 40).getTime());
  store.startTimer(id);
  at(new Date(2026, 9, 5, 0, 30).getTime());
  assert.equal(store.setTimerStart("23:20"), true);
  assert.equal(store.timer().start, new Date(2026, 9, 4, 23, 20).getTime());
  assert.deepEqual(store.stopTimer("0:10"), { taskId: id, min: 50 });
});

test("a running timer can carry a mark; it goes onto the segment", () => {
  const id = store.addTask({ title: "Kitchen", est: 30 });
  at(new Date(2026, 9, 4, 18, 0).getTime());
  store.startTimer(id, "🍳");
  store.setTimerTag("☎️");
  assert.equal(store.timer().tag, "☎️");
  store.setTimerTag("☎️");
  assert.equal(store.timer().tag, "", "the same one again = none");
  store.setTimerTag("🍳");
  at(new Date(2026, 9, 4, 18, 25).getTime());
  store.stopTimer();
  assert.equal(store.get("tasks", id).times, "18:00-18:25 25m 🍳");
  store.tagTime(id + "#0", "🍳");
  assert.equal(store.get("tasks", id).times, "18:00-18:25 25m");
  store.tagTime(id + "#0", "🪪");
  assert.equal(store.timeOf(id)[0].tag, "🪪");
});

test("deep work: a plan's default marks its tasks, old ones too, and repeats carry it", () => {
  const pid = store.saveProject({ name: "IELTS", kind: "total", place: "pool" });
  const before = store.addTask({ title: "Passage 1", projectId: pid });
  assert.equal(store.get("tasks", before).deep, false);
  store.setPlanDeep(pid, true);
  assert.equal(store.get("projects", pid).rule.deep, true);
  assert.equal(store.get("tasks", before).deep, true, "tasks it already had are marked");
  assert.equal(store.get("tasks", store.addTask({ title: "Passage 2", projectId: pid })).deep, true, "new ones start out deep");
  assert.equal(store.get("tasks", store.addTask({ title: "Light one", projectId: pid, deep: false })).deep, false, "unless you say otherwise");
  const other = store.addTask({ title: "Dishes" });
  assert.equal(store.get("tasks", other).deep, false);
  store.setPlanDeep(pid, false);
  assert.equal(store.get("tasks", before).deep, false);

  const T = store.today();
  const first = store.addRepeating({ date: T, title: "Shadowing", est: 20, deep: true }, [20, 20, 20, 20, 20, 20, 20], "");
  assert.equal(store.get("tasks", first).deep, true);
  const plan = store.routineOf(first);
  assert.equal(plan.rule.deep, true);
  store.editSeries(first, { deep: false }, "all");
  assert.equal(store.routineOf(first).rule.deep, false);
  assert.equal(store.get("tasks", first).deep, false);
});

test("chore key: one Chores task a day with a fixed id; each press is a segment; whatever was running is logged first", () => {
  const T = store.today(), [y, m, d] = T.split("-").map(Number);
  const id = store.choreId(T);
  const other = store.addTask({ title: "Reading", est: 30 });
  at(new Date(y, m - 1, d, 8, 0).getTime());
  store.startTimer(other);
  at(new Date(y, m - 1, d, 8, 20).getTime());
  const r = store.startChore("🍳");
  assert.deepEqual(r, { taskId: other, min: 20 }, "the one that was running is logged");
  const c = store.get("tasks", id);
  assert.ok(c && store.isChore(c));
  assert.deepEqual([c.title, c.status, c.group, c.date], ["Chores", "done", "Chores", T]);
  at(new Date(y, m - 1, d, 8, 50).getTime());
  store.stopTimer();
  at(new Date(y, m - 1, d, 12, 0).getTime());
  store.startChore();
  at(new Date(y, m - 1, d, 12, 10).getTime());
  store.stopTimer();
  const after = store.get("tasks", id);
  assert.equal(after.times, "08:20-08:50 30m 🍳; 12:00-12:10 10m");
  assert.deepEqual([after.actual, after.est], [40, 40], "est follows the total");
  assert.equal(store.tasksOn(T).filter(store.isChore).length, 1, "still one a day");
});

test("an empty Chores task (pressed and stopped within a minute) isn't listed on its day", () => {
  const T = store.today(), [y, m, d] = T.split("-").map(Number), id = store.choreId(T);
  store.deleteTask?.(id);
  at(new Date(y, m - 1, d, 7, 0).getTime());
  store.startChore();
  at(new Date(y, m - 1, d, 7, 0, 30).getTime());
  store.stopTimer();
  if (!store.timeOf(id).length) assert.equal(store.tasksOn(T).some(store.isChore), false, "nothing logged: not listed");
  store.startChore("🗃️");
  at(new Date(y, m - 1, d, 7, 20).getTime());
  store.stopTimer();
  assert.equal(store.tasksOn(T).some(store.isChore), true, "once it has time, it is");
});
