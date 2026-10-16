import { test } from "node:test";
import assert from "node:assert/strict";
import * as SC from "../js/scores.js";

console.warn = () => {};   // store 在 node 里存不下来：「Can't save on this device」

const TEXT = [
  "read · reading · 6–10 · 6 nothing · 8 something · 10 really good",
  "",
  " Gym | moving | 3 stayed in | 5 usual | 12 hike ",
  "$ · 0-2 · 0 way over · 1 a bit over · 2 usual",
  "nap",
  "· 5 orphan",
  "GYM · again",
  "Note · the note column is the box under the rows",
  "focus time · 0–4 · 1.5 a little"
].join("\n");

test("parse: one line per column, with what it means, a range and the choices", () => {
  const { defs, bad } = SC.parse(TEXT);
  assert.deepEqual(defs.map((d) => [d.col, d.key, d.means, d.lo, d.hi]), [
    ["read", "read", "reading", 6, 10],
    ["Gym", "gym", "moving", 3, 12],
    ["$", "$", "", 0, 2],
    ["nap", "nap", "", null, null],
    ["focus time", "focustime", "", 0, 4]
  ]);
  assert.deepEqual(defs[0].choices, [{ n: 6, label: "nothing" }, { n: 8, label: "something" }, { n: 10, label: "really good" }]);
  assert.deepEqual(defs[1].choices.map((c) => c.n), [3, 5, 12], "| works as a separator too; without a range it runs from the lowest choice to the highest");
  assert.deepEqual(defs[4].choices, [{ n: 1.5, label: "a little" }]);
  assert.deepEqual(bad, [6, 7, 8], "no name, a name used twice, and note (that's the box under the rows) are skipped");
  assert.deepEqual(defs.map(SC.rangeText), ["6–10", "3–12", "0–2", "", "0–4"]);
});

test("filled / unscored: every column needs a number; past days from the start date only", () => {
  const set = SC.setup({ text: "read · 6 a · 8 b\n$ · 0 x · 2 y", from: "2026-10-15" });
  const T = "2026-10-18";
  assert.equal(SC.filled(set.defs, { read: 8 }), false);
  assert.equal(SC.filled(set.defs, { read: 8, $: 0 }), true, "0 counts");
  assert.equal(SC.unscored(set, null, "2026-10-14", T), false, "before the start date");
  assert.equal(SC.unscored(set, null, "2026-10-15", T), true);
  assert.equal(SC.unscored(set, { v: { read: 8 }, note: "x" }, "2026-10-16", T), true, "half done still counts as not scored; the note doesn't matter");
  assert.equal(SC.unscored(set, { v: { read: 8, $: 2 } }, "2026-10-17", T), false);
  assert.equal(SC.unscored(set, null, T, T), false, "today isn't over yet");
  assert.equal(SC.inRange(set, T, T) && !SC.inRange(set, "2026-10-19", T) && !SC.inRange(set, "2026-10-14", T), true);
  assert.equal(SC.unscored(SC.setup({ text: "", from: "2026-10-15" }), null, "2026-10-16", T), false, "nothing set up, no dots");
  assert.equal(SC.unscored(SC.setup({ text: "read · 6 a" }), null, "2026-10-16", T), false, "no start date, no dots");
});

test("cellsToSend: new and changed cells go out; ones written before and cleared now go out empty", () => {
  assert.deepEqual(SC.cellsOf({ v: { read: 8, $: 0, bad: "x" }, note: "  wall  " }), { read: 8, $: 0, note: "wall" });
  assert.deepEqual(SC.cellsOf({ v: { read: 8, nap: 1 }, note: "" }, new Set(["read", "$"])), { read: 8 }, "a column taken out of Settings isn't written any more");
  assert.equal(SC.cellsToSend({ read: 8 }, { read: 8 }), null);
  assert.deepEqual(SC.cellsToSend({ read: 9, $: 1, note: "hi" }, { read: 8, gym: 5, note: "hi" }), { read: 9, $: 1, gym: "" });
  assert.deepEqual(SC.cellsToSend({}, { note: "old" }), { note: "" });
  assert.deepEqual(SC.cellsToSend({ read: 8 }, { read: 8, nap: 1, note: "x" }, new Set(["read", "note"])), { note: "" }, "a column taken out of Settings is never cleared in the sheet");
});

test("store: one Settings row a day; clearing everything removes the row", async () => {
  const store = await import("../js/store.js?scores");
  store.setSetting("scores", { text: "read · 6 a · 8 b\n$ · 0 x · 2 y", from: "2026-10-15" });
  assert.deepEqual(store.scoreSetup().defs.map((d) => d.key), ["read", "$"]);
  store.setScore("2026-10-16", "Read", 8);
  store.setScore("2026-10-16", "$", 0);
  store.setScore("2026-10-16", "$", -1);
  store.setScore("2026-10-16", "read", "x");
  store.setScoreNote("2026-10-16", "  leak \n wall ");
  assert.deepEqual(store.scoreOf("2026-10-16"), { date: "2026-10-16", v: { read: 8, $: 0 }, note: "leak wall" });
  assert.deepEqual(store.get("settings", "score:2026-10-16").value, { date: "2026-10-16", v: { read: 8, $: 0 }, note: "leak wall" });
  assert.deepEqual(store.scoreCells(), { "2026-10-16": { read: 8, $: 0, note: "leak wall" } });
  store.setSetting("scores", { text: "read · 6 a · 8 b", from: "2026-10-15" });
  assert.deepEqual(store.scoreCells(), { "2026-10-16": { read: 8, note: "leak wall" } }, "$ left Settings: kept, not sent");
  assert.equal(store.scoreOf("2026-10-16").v.$, 0);
  store.setSetting("scores", { text: "read · 6 a · 8 b\n$ · 0 x · 2 y", from: "2026-10-15" });
  store.setScore("2026-10-16", "read", null);
  store.setScore("2026-10-16", "$", "");
  assert.ok(store.get("settings", "score:2026-10-16"), "the note is still there");
  store.setScoreNote("2026-10-16", " ");
  assert.equal(store.get("settings", "score:2026-10-16"), null);
  assert.equal(store.scoreOf("2026-10-16"), null);
  store.setScore("not a day", "read", 8);
  assert.deepEqual(store.scores(), {});
});
