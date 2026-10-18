import { test } from "node:test";
import assert from "node:assert/strict";
import * as Q from "../js/quads.js";

console.warn = () => {};   // store 在 node 里存不下来：「Can't save on this device」
const T = "2026-10-18";
const note = (x) => ({ text: x.id, q: "do", order: 0, done: "", ...x });

test("board: four boxes in their own order; ticked ones stay", () => {
  const b = Q.board([
    note({ id: "a", order: 3 }), note({ id: "b", order: 1 }), note({ id: "c", q: "plan" }),
    note({ id: "d", q: "drop", done: true }), note({ id: "f", q: "nope", order: 9 })
  ]);
  assert.deepEqual(Object.keys(b), ["do", "plan", "quick", "drop"]);
  assert.deepEqual(b.do.map((n) => n.id), ["b", "a", "f"], "an unknown box counts as the first one");
  assert.deepEqual(b.plan.map((n) => n.id), ["c"]);
  assert.deepEqual(b.quick, []);
  assert.deepEqual(b.drop.map((n) => n.id), ["d"], "ticked: still there, crossed out");
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

// ---- 存储：只在这台电脑上，不进表格；旧的 Settings 行搬过来 ----

test("store: add, move, edit, tick, remove, put back — nothing goes to the sheet", async () => {
  const store = await import("../js/store.js?quads");
  let redraws = 0;
  store.subscribe(() => { redraws++; });
  const ids = (q) => store.quadBoard()[q].map((n) => n.text);

  const a = store.addQuad("do", "Pay the card"), b = store.addQuad("do", "Reply to the landlord"), c = store.addQuad("plan", " Book the dentist ");
  assert.equal(store.addQuad("do", "   "), "", "nothing written: nothing added");
  assert.deepEqual(ids("do"), ["Pay the card", "Reply to the landlord"]);
  assert.deepEqual(ids("plan"), ["Book the dentist"]);

  store.moveQuad(b, "do", a);
  assert.deepEqual(ids("do"), ["Reply to the landlord", "Pay the card"], "reordered inside the box");
  store.moveQuad(a, "plan", c);
  assert.deepEqual(ids("plan"), ["Pay the card", "Book the dentist"], "into another box, in front of the dentist");
  store.moveQuad(c, "nope");
  assert.deepEqual(ids("do"), ["Reply to the landlord", "Book the dentist"], "an unknown box is the first one");

  store.editQuad(b, "  Text the landlord ");
  assert.equal(store.quadOf(b).text, "Text the landlord");
  store.editQuad(b, "  ");
  assert.equal(store.quadOf(b).text, "Text the landlord", "emptied out: the old words stay");

  store.doneQuad(b, true);
  assert.equal(store.quadOf(b).done, true);
  assert.deepEqual(ids("do"), ["Text the landlord", "Book the dentist"], "ticked: stays in place");

  const gone = store.deleteQuad(c);
  assert.equal(store.quadOf(c), null);
  store.restoreQuad(gone);
  assert.deepEqual(ids("do"), ["Text the landlord", "Book the dentist"], "put back where it was");

  assert.equal(redraws, 0, "the page moves the notes itself: nothing redraws");
  assert.equal(store.pendingCount(), 0, "and nothing waits to go to the sheet");
});

test("store: notes left in the sheet's Settings move to this computer", async () => {
  const store = await import("../js/store.js?quads-adopt");
  store.setSetting("quad:old1", { text: "Return the parcel", q: "quick", order: 5, done: "2026-10-18" });
  assert.equal(store.adoptQuads(), true);
  assert.deepEqual(store.quadOf("old1"), { text: "Return the parcel", q: "quick", order: 5, done: true, id: "old1" });
  assert.equal(store.get("settings", "quad:old1"), null, "gone from the sheet");
  assert.equal(store.adoptQuads(), false, "nothing left to move");
});
