import { test } from "node:test";
import assert from "node:assert/strict";
import * as Q from "../js/quads.js";

console.warn = () => {};   // store 在 node 里存不下来：「Can't save on this device」
const T = "2026-10-18";
const note = (x) => ({ text: x.id, q: "do", order: 0, done: "", ...x });

test("board: four boxes in their own order; ticked before today is gone", () => {
  const b = Q.board([
    note({ id: "a", order: 3 }), note({ id: "b", order: 1 }), note({ id: "c", q: "plan" }),
    note({ id: "d", q: "drop", done: "2026-10-17" }), note({ id: "e", q: "drop", done: T }), note({ id: "f", q: "nope", order: 9 })
  ], T);
  assert.deepEqual(Object.keys(b), ["do", "plan", "quick", "drop"]);
  assert.deepEqual(b.do.map((n) => n.id), ["b", "a", "f"], "an unknown box counts as the first one");
  assert.deepEqual(b.plan.map((n) => n.id), ["c"]);
  assert.deepEqual(b.quick, []);
  assert.deepEqual(b.drop.map((n) => n.id), ["e"], "ticked yesterday: not shown; ticked today: still there");
  assert.deepEqual(Q.stale([note({ id: "d", done: "2026-10-17" }), note({ id: "e", done: T }), note({ id: "g" })], T).map((n) => n.id), ["d"]);
});

test("place: only the moved note changes, halfway between its neighbours", () => {
  const cells = [note({ id: "a", order: 1024 }), note({ id: "b", order: 2048 }), note({ id: "c", order: 3072 })];
  assert.deepEqual(Q.place(cells, "x", "b"), [{ id: "x", order: 1536 }]);
  assert.deepEqual(Q.place(cells, "x", "a"), [{ id: "x", order: 0 }], "to the front");
  assert.deepEqual(Q.place(cells, "x", ""), [{ id: "x", order: 4096 }], "to the end");
  assert.deepEqual(Q.place(cells, "a", "c"), [{ id: "a", order: 2560 }], "moving inside the same box skips itself");
  assert.deepEqual(Q.place(cells, "x", "gone"), [{ id: "x", order: 4096 }], "a neighbour that's gone: to the end");
  assert.deepEqual(Q.place([], "x", "", 99), [{ id: "x", order: 99 }], "an empty box");
});

test("place: no room left between two notes → the whole box is numbered again", () => {
  const cells = [note({ id: "a", order: 5 }), note({ id: "b", order: 5 }), note({ id: "c", order: 9 })];
  assert.deepEqual(Q.place(cells, "x", "b"), [{ id: "a", order: 1024 }, { id: "x", order: 2048 }, { id: "b", order: 3072 }, { id: "c", order: 4096 }]);
  const tight = [note({ id: "a", order: 1 }), note({ id: "b", order: 1 + Number.EPSILON })];
  assert.equal(Q.place(tight, "x", "b").length, 3);
});

test("clean: one line, trimmed, capped", () => {
  assert.equal(Q.clean("  Pay \n the   rent "), "Pay the rent");
  assert.equal(Q.clean("x".repeat(200)).length, Q.MAX);
  assert.equal(Q.clean(null), "");
});

// ---- 存储：Settings 里一张一行，都不重画，只有删掉给撤销 ----

test("store: add, move, edit, tick, remove, undo, settle", async () => {
  const store = await import("../js/store.js?quads");
  const quiet = [];
  store.subscribe((meta) => { if (meta.dirty) quiet.push(Boolean(meta.quiet)); });
  let undo = null, label = "";
  store.onUndo((l, before) => { label = l; undo = before; });
  const ids = (q) => store.quadBoard()[q].map((n) => store.quadOf(n.id).text);

  const a = store.addQuad("do", "Pay the card"), b = store.addQuad("do", "Reply to the landlord"), c = store.addQuad("plan", " Book the dentist ");
  assert.equal(store.addQuad("do", "   "), "", "nothing written: nothing added");
  assert.deepEqual(ids("do"), ["Pay the card", "Reply to the landlord"]);
  assert.deepEqual(ids("plan"), ["Book the dentist"]);
  assert.ok(store.get("settings", "quad:" + a), "one Settings row each");

  store.moveQuad(b, "do", a);
  assert.deepEqual(ids("do"), ["Reply to the landlord", "Pay the card"], "reordered inside the box");
  store.moveQuad(a, "plan", c);
  assert.deepEqual(ids("plan"), ["Pay the card", "Book the dentist"], "into another box, in front of the dentist");
  assert.deepEqual(ids("do"), ["Reply to the landlord"]);
  store.moveQuad(c, "nope");
  assert.deepEqual(ids("do"), ["Reply to the landlord", "Book the dentist"], "an unknown box is the first one");

  store.editQuad(b, "  Text the landlord ");
  assert.equal(store.quadOf(b).text, "Text the landlord");
  store.editQuad(b, "  ");
  assert.equal(store.quadOf(b).text, "Text the landlord", "emptied out: the old words stay");

  store.doneQuad(b, true);
  assert.equal(store.quadOf(b).done, store.today());
  store.settleQuads();
  assert.ok(store.quadOf(b), "ticked today: kept until tomorrow");
  store.doneQuad(b, false);
  assert.equal(store.quadOf(b).done, "");

  assert.ok(quiet.every(Boolean), "the page moves the notes itself: nothing redraws");
  assert.equal(label, "", "and nothing so far offers an undo");

  store.deleteQuad(c);
  assert.equal(store.quadOf(c), null);
  assert.equal(label, "Note removed");
  store.undo(undo);
  assert.equal(store.quadOf(c).text, "Book the dentist", "undo brings it back");
  assert.equal(quiet.at(-1), false, "and the undo redraws the page");
});

test("store: a note ticked yesterday is cleared away; open ones stay", async () => {
  const store = await import("../js/store.js?quads-settle");
  const old = store.addQuad("quick", "Return the parcel"), open = store.addQuad("quick", "Water the plants");
  const row = store.get("settings", "quad:" + old);
  store.setSetting("quad:" + old, { ...row.value, done: "2000-01-01" });
  assert.deepEqual(store.quadBoard().quick.map((n) => n.id), [open], "not shown any more");
  store.settleQuads();
  assert.equal(store.get("settings", "quad:" + old), null, "deleted");
  assert.ok(store.quadOf(open));
});
