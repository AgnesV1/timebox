import { test } from "node:test";
import assert from "node:assert/strict";
import * as I from "../js/ideas.js";
import * as GR from "../js/groups.js";

console.warn = () => {};   // 「Can't save on this device」
const T = "2026-10-12";
const idea = (x) => ({ id: x.text, kind: "", date: "", by: false, note: "", taskId: "", doneAt: "", order: 0, ...x });
const tasks = (list) => (id) => list.find((t) => t.id === id) || null;

test("state: in the pool, planned, done, missed", () => {
  const of = tasks([{ id: "a", date: "2026-10-17", status: "" }, { id: "b", date: "2026-10-10", status: "done" }, { id: "c", date: "2026-10-11", status: "drop" }, { id: "d", date: "2026-10-11", status: "later" }]);
  assert.equal(I.stateOf(idea({ text: "x" }), of, T), "open");
  assert.equal(I.stateOf(idea({ text: "x", taskId: "a" }), of, T), "planned");
  assert.equal(I.stateOf(idea({ text: "x", taskId: "b" }), of, T), "done");
  assert.equal(I.stateOf(idea({ text: "x", taskId: "c" }), of, T), "open", "a dropped task puts it back");
  assert.equal(I.stateOf(idea({ text: "x", taskId: "d" }), of, T), "open", "so does Later");
  assert.equal(I.stateOf(idea({ text: "x", taskId: "gone" }), of, T), "open", "and a deleted task");
  assert.equal(I.stateOf(idea({ text: "x", taskId: "gone", doneAt: "2025-03-01" }), of, T), "done", "done stays done after the task is archived");
  assert.equal(I.stateOf(idea({ text: "x", date: "2026-10-11" }), of, T), "missed");
  assert.equal(I.stateOf(idea({ text: "x", date: T }), of, T), "open", "today isn't missed yet");
  assert.equal(I.dayOf(idea({ text: "x", taskId: "a" }), of), "2026-10-17");
  assert.equal(I.dayOf(idea({ text: "x", taskId: "c" }), of), "");
});

test("when: on a day, or by a day", () => {
  assert.equal(I.whenText(idea({ text: "x", date: "2026-10-17" })), "on Sat Oct 17");
  assert.equal(I.whenText(idea({ text: "x", date: "2026-10-25", by: true })), "by Oct 25");
  assert.equal(I.whenText(idea({ text: "x" })), "");
});

test("board: unsorted first, then by kind; dated first, planned last; done apart", () => {
  const of = tasks([{ id: "p", date: "2026-10-18", status: "" }, { id: "z", date: "2026-10-05", status: "done" }]);
  const b = I.board([
    idea({ text: "pho", kind: "eat", order: 1 }), idea({ text: "omakase", kind: "eat", order: 2 }), idea({ text: "brunch", kind: "eat", date: "2026-10-20", order: 0 }),
    idea({ text: "museum", kind: "out", taskId: "p" }), idea({ text: "leaves", kind: "out", date: "2026-10-25", by: true }), idea({ text: "old fair", kind: "out", date: "2026-10-01" }),
    idea({ text: "something", kind: "nope" }), idea({ text: "jazz", kind: "out", taskId: "z" }), idea({ text: "zoo", kind: "out", doneAt: "2026-10-09" })
  ], of, T);
  assert.deepEqual(b.groups.map((g) => g.title), ["Unsorted", "Outing", "Eat"]);
  assert.deepEqual(b.groups[2].items.map((r) => r.idea.text), ["brunch", "omakase", "pho"], "dated, then newest");
  assert.deepEqual(b.groups[1].items.map((r) => r.idea.text + ":" + r.state), ["leaves:open", "old fair:missed", "museum:planned"]);
  assert.equal(b.groups[1].items[2].day, "2026-10-18");
  assert.deepEqual(b.done.map((r) => r.idea.text + " " + r.day), ["zoo 2026-10-09", "jazz 2026-10-05"]);
  assert.equal(b.open, 6);
});

test("soon: dated, within a week, not planned yet", () => {
  const of = tasks([{ id: "p", date: "2026-10-14", status: "" }]);
  const list = [idea({ text: "sat", date: "2026-10-17" }), idea({ text: "today", date: T }), idea({ text: "far", date: "2026-11-20" }), idea({ text: "past", date: "2026-10-10" }),
    idea({ text: "planned", date: "2026-10-14", taskId: "p" }), idea({ text: "undated" })];
  assert.deepEqual(I.soon(list, of, T).map((i) => i.text), ["today", "sat"]);
});

test("match: what you can pick while adding a task", () => {
  const of = tasks([{ id: "p", date: "2026-10-14", status: "" }]);
  const list = [idea({ text: "Pho place", order: 1 }), idea({ text: "Photo walk", date: "2026-10-20", order: 2 }), idea({ text: "Phantom show", taskId: "p" }),
    idea({ text: "Old pho pop-up", date: "2026-10-01" }), idea({ text: "Jazz night", order: 3 }), idea({ text: "Zoo", doneAt: "2026-10-01" })];
  assert.deepEqual(I.match(list, of, T, "PHO").map((i) => i.text), ["Photo walk", "Pho place", "Old pho pop-up"]);
  assert.deepEqual(I.match(list, of, T).map((i) => i.text), ["Photo walk", "Jazz night", "Pho place", "Old pho pop-up"], "nothing typed: all that's left");
  assert.equal(I.match(list, of, T, "", 2).length, 2);
});

test("pasting several lines", () => {
  assert.deepEqual(I.parseLines("- ROM\n\n 2. Pho place\n• rom \nAlgonquin 看红叶\n", [idea({ text: "pho place" })]), ["ROM", "Algonquin 看红叶"]);
  assert.deepEqual(I.parseLines(""), []);
});

test("which projects offer the pool", () => {
  const by = (name) => GR.DEFAULTS.find((g) => g.name === name);
  assert.deepEqual(GR.DEFAULTS.filter(GR.ideasOf).map((g) => g.name), ["Leisure", "Friends"]);
  assert.equal(GR.ideasOf({ ...by("Leisure"), ideas: false }), false);
  assert.equal(GR.ideasOf({ ...by("Build"), ideas: true }), true);
  assert.equal(GR.ideasOf(null), false);
});

// ---- 存储：挑进任务以后跟着任务走 ----

test("store: picked, done, dropped, deleted, moved, undone", async () => {
  const store = await import("../js/store.js?ideas");
  const today = store.today(), of = (id) => store.get("tasks", id), state = (id) => I.stateOf(store.ideaOf(id), of, today);
  let undo = null;
  store.onUndo((label, before) => { undo = before; });
  const a = store.saveIdea({ text: "Jazz night", kind: "out" });
  store.addIdeas(["Pho place", "ROM"], { kind: "eat" });
  assert.deepEqual(store.ideas().map((i) => i.text + ":" + i.kind), ["Jazz night:out", "Pho place:eat", "ROM:eat"]);
  assert.ok(store.get("settings", "idea:" + a), "one Settings row each");

  const t = store.addTask({ title: "Jazz night", est: 90, group: "Leisure" });
  store.pickIdea(a, t);
  assert.equal(state(a), "planned");
  assert.equal(store.ideaOfTask(t).id, a);

  store.setStatus(t, "done");
  assert.equal(store.ideaOf(a).doneAt, today, "done stamps the day");
  store.setStatus(t, "done");   // 再点一次 = 取消
  assert.equal(store.ideaOf(a).doneAt, "");
  assert.equal(state(a), "planned");

  store.setStatus(t, "drop");
  assert.equal(state(a), "open", "dropped: back in the pool");
  store.setStatus(t, "drop");

  store.toTomorrow(t);
  const moved = store.ideaOf(a).taskId;
  assert.notEqual(moved, t, "follows the task to tomorrow");
  assert.equal(of(moved).status, "");
  assert.equal(state(a), "planned");

  store.deleteTask(moved);
  assert.equal(store.ideaOf(a).taskId, "", "deleted: back in the pool");
  store.undo(undo);
  assert.equal(store.ideaOf(a).taskId, moved, "undo brings the link back with the task");

  store.setStatus(moved, "partial");
  assert.equal(state(a), "done");
  store.unpickIdea(a);
  assert.equal(state(a), "open");
  assert.ok(of(moved), "putting it back leaves the task alone");

  store.deleteIdea(a);
  assert.equal(store.ideaOf(a), null);
});

test("store: a status that arrives from the Sheet is settled after the pull", async () => {
  const store = await import("../js/store.js?ideas-pull");
  const id = store.saveIdea({ text: "Zoo" });
  const t = store.addTask({ title: "Zoo", est: 60, date: "2026-10-10" });
  store.pickIdea(id, t);
  const row = store.get("tasks", t);
  store.applyPull({ tables: { tasks: [{ ...row, status: "done", updated: row.updated + 10 }] } }, Date.now());
  assert.equal(store.ideaOf(id).doneAt, "", "the pull itself doesn't run the hook");
  store.settleIdeas();
  assert.equal(store.ideaOf(id).doneAt, "2026-10-10");
  // 一年以后任务归档了、从设备上拿走：还是去过的
  store.applyPull({ tables: { settings: store.all("settings") } }, Date.now(), { full: true });
  assert.equal(store.get("tasks", t), null);
  store.settleIdeas();
  assert.equal(I.stateOf(store.ideaOf(id), (x) => store.get("tasks", x), store.today()), "done");
});
