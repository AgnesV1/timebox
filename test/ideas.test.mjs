import { test } from "node:test";
import assert from "node:assert/strict";
import * as I from "../js/ideas.js";
import * as GR from "../js/groups.js";

console.warn = () => {};   // 「Can't save on this device」
const T = "2026-10-12";
const DAY = 864e5;
const idea = (x) => ({ id: x.text, kind: "", date: "", by: false, note: "", taskId: "", order: 0, ...x });
const tasks = (list) => (id) => list.find((t) => t.id === id) || null;

test("state: in the pool, planned, done, missed", () => {
  const of = tasks([{ id: "a", date: "2026-10-17", status: "" }, { id: "b", date: "2026-10-10", status: "done" }, { id: "c", date: "2026-10-11", status: "drop" }, { id: "d", date: "2026-10-11", status: "delay" }]);
  assert.equal(I.stateOf(idea({ text: "x" }), of, T), "open");
  assert.equal(I.stateOf(idea({ text: "x", taskId: "a" }), of, T), "planned");
  assert.equal(I.stateOf(idea({ text: "x", taskId: "b" }), of, T), "done");
  assert.equal(I.stateOf(idea({ text: "x", taskId: "c" }), of, T), "open", "a dropped task puts it back");
  assert.equal(I.stateOf(idea({ text: "x", taskId: "d" }), of, T), "open", "so does Delay");
  assert.equal(I.stateOf(idea({ text: "x", taskId: "gone" }), of, T), "open", "and a deleted task");
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

test("board: unsorted first, then by kind; dated first, planned last; done ones aren't listed", () => {
  const of = tasks([{ id: "p", date: "2026-10-18", status: "" }, { id: "z", date: "2026-10-05", status: "done" }]);
  const list = [
    idea({ text: "pho", kind: "eat", order: 1 }), idea({ text: "omakase", kind: "eat", order: 2 }), idea({ text: "brunch", kind: "eat", date: "2026-10-20", order: 0 }),
    idea({ text: "museum", kind: "out", taskId: "p" }), idea({ text: "leaves", kind: "out", date: "2026-10-25", by: true }), idea({ text: "old fair", kind: "out", date: "2026-10-01" }),
    idea({ text: "something", kind: "nope" }), idea({ text: "jazz", kind: "out", taskId: "z" })
  ];
  const b = I.board(list, of, T);
  assert.deepEqual(b.groups.map((g) => g.emoji + g.title), ["Unsorted", "🎭Stage & exhibitions", "🍽️Eat"], "the old Outing ones count as stage");
  assert.deepEqual(b.groups[2].items.map((r) => r.idea.text), ["brunch", "omakase", "pho"], "dated, then newest");
  assert.deepEqual(b.groups[1].items.map((r) => r.idea.text + ":" + r.state), ["leaves:open", "old fair:missed", "museum:planned"], "jazz is done: gone from the page");
  assert.equal(b.groups[1].items[2].day, "2026-10-18");
  assert.equal(b.open, 6);
  assert.deepEqual(I.left(list, of, T).map((i) => i.text).includes("jazz"), false);
});

test("kinds: emoji, the old Outing, and how many are left under each", () => {
  assert.equal(I.kindOf(idea({ text: "x", kind: "out" })), "stage");
  assert.equal(I.kindOf(idea({ text: "x", kind: "bar" })), "bar");
  assert.equal(I.kindOf(idea({ text: "x", kind: "nope" })), "");
  assert.equal(I.emojiOf(idea({ text: "x", kind: "trip" })), "✈️");
  assert.equal(I.emojiOf(idea({ text: "x" })), "");
  const of = tasks([{ id: "z", date: "2026-10-05", status: "done" }]);
  const list = [idea({ text: "a", kind: "eat" }), idea({ text: "b", kind: "eat" }), idea({ text: "c", kind: "out" }), idea({ text: "d" }), idea({ text: "e", kind: "bar", taskId: "z" })];
  assert.deepEqual(I.kindCounts(list, of, T), { eat: 2, stage: 1, "": 1 }, "the one that's been done isn't counted");
});

test("stale: done for a week, ready to delete", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  const of = tasks([{ id: "old", status: "done", updated: now - 8 * DAY }, { id: "new", status: "done", updated: now - 2 * DAY }, { id: "part", status: "delay", updated: now - 30 * DAY },
    { id: "open", status: "", updated: now - 30 * DAY }, { id: "drop", status: "drop", updated: now - 30 * DAY }]);
  const list = [idea({ text: "a", taskId: "old" }), idea({ text: "b", taskId: "new" }), idea({ text: "c", taskId: "part" }), idea({ text: "d", taskId: "open" }), idea({ text: "e", taskId: "drop" }), idea({ text: "f", taskId: "gone" }), idea({ text: "g" })];
  assert.deepEqual(I.stale(list, of, now).map((i) => i.text), ["a"], "only Done counts as having gone; a delayed one is still to do");
});

test("soon: dated, within a week, not planned yet", () => {
  const of = tasks([{ id: "p", date: "2026-10-14", status: "" }]);
  const list = [idea({ text: "sat", date: "2026-10-17" }), idea({ text: "today", date: T }), idea({ text: "far", date: "2026-11-20" }), idea({ text: "past", date: "2026-10-10" }),
    idea({ text: "planned", date: "2026-10-14", taskId: "p" }), idea({ text: "undated" })];
  assert.deepEqual(I.soon(list, of, T).map((i) => i.text), ["today", "sat"]);
});

test("upcoming: every dated idea still ahead, nearest first — past ones are left out", () => {
  const of = tasks([{ id: "a", date: "2026-10-20", status: "" }]);
  const list = [idea({ text: "far", date: "2027-03-01" }), idea({ text: "past", date: "2026-10-01" }), idea({ text: "today", date: T }), idea({ text: "by", date: "2026-11-02", by: true }),
    idea({ text: "planned", date: "2026-10-20", taskId: "a" }), idea({ text: "undated" })];
  assert.deepEqual(I.upcoming(list, of, T).map((i) => i.text), ["today", "by", "far"]);
});

test("how long an idea takes by default when it's put on a day", () => {
  assert.equal(I.defaultEst(idea({ text: "x", kind: "out" })), 180, "old Outing = stage");
  assert.equal(I.defaultEst(idea({ text: "x", kind: "trip" })), 480);
  assert.equal(I.defaultEst(idea({ text: "x", kind: "other" })), 240);
  assert.equal(I.defaultEst(idea({ text: "x", kind: "eat" })), 180);
  assert.equal(I.defaultEst(idea({ text: "x" })), 60);
  assert.equal(I.defaultEst(idea({ text: "x", kind: "something else" })), 60);
});

test("match: what you can pick while adding a task", () => {
  const of = tasks([{ id: "p", date: "2026-10-14", status: "" }, { id: "z", date: "2026-10-01", status: "done" }]);
  const list = [idea({ text: "Pho place", order: 1 }), idea({ text: "Photo walk", date: "2026-10-20", order: 2 }), idea({ text: "Phantom show", taskId: "p" }),
    idea({ text: "Old pho pop-up", date: "2026-10-01" }), idea({ text: "Jazz night", order: 3 }), idea({ text: "Zoo", taskId: "z" })];
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
  assert.deepEqual(GR.DEFAULTS.filter(GR.ideasOf).map((g) => g.name), ["Friends", "Leisure"]);
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
  assert.equal(state(a), "done");
  store.settleIdeas();
  assert.ok(store.ideaOf(a), "just done: kept for a week in case it's undone");
  store.setStatus(t, "done");   // 再点一次 = 取消
  assert.equal(state(a), "planned");

  store.setStatus(t, "drop");
  assert.equal(state(a), "open", "dropped: back in the pool");
  store.setStatus(t, "drop");

  store.setStatus(t, "delay");
  assert.equal(state(a), "open", "delayed: back in the pool, to be planned again");
  store.setStatus(t, "delay");
  assert.equal(state(a), "planned");
  const moved = t;

  store.deleteTask(moved);
  assert.equal(store.ideaOf(a).taskId, "", "deleted: back in the pool");
  store.undo(undo);
  assert.equal(store.ideaOf(a).taskId, moved, "undo brings the link back with the task");

  store.unpickIdea(a);
  assert.equal(state(a), "open");
  assert.ok(of(moved), "putting it back leaves the task alone");

  store.deleteIdea(a);
  assert.equal(store.ideaOf(a), null);
});

test("store: an idea whose task was done a week ago is deleted", async () => {
  const store = await import("../js/store.js?ideas-gone");
  const realNow = Date.now;
  const id = store.saveIdea({ text: "Zoo" }), other = store.saveIdea({ text: "Aquarium" });
  const t = store.addTask({ title: "Zoo", est: 60 });
  store.pickIdea(id, t);
  store.setStatus(t, "done");
  try {
    Date.now = () => realNow() + 6 * DAY;
    store.settleIdeas();
    assert.ok(store.ideaOf(id), "six days on: still there");
    Date.now = () => realNow() + 8 * DAY;
    store.settleIdeas();
    assert.equal(store.ideaOf(id), null, "eight days on: gone");
    assert.equal(store.get("settings", "idea:" + id), null);
    assert.ok(store.ideaOf(other), "the rest of the pool is untouched");
    assert.ok(store.get("tasks", t), "and so is the task");
  } finally { Date.now = realNow; }
});
