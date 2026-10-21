// 阅读页右边「今年接下来想读的」：存在 Settings（read-plan:<id>），能加、挪、删；读完的划掉，去年没读完的跟到今年
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../js/reading.js";

test("the list for this year: this year's, plus last year's unread; finished this year are struck with the month", () => {
  const items = [
    { id: "a", title: "Dune", y: 2026 },
    { id: "b", title: "The Bear", y: 2026 },
    { id: "c", title: "Old unread", y: 2025 },
    { id: "d", title: "Old and read", y: 2025 },
    { id: "e", title: "Read years ago", y: 2026 }
  ];
  const fin = { "the bear": { when: "2026 Oct" }, "old and read": { when: "2025 Dec" }, "read years ago": { when: "2023 May" } };
  const v = R.planView(items, (t) => fin[t.toLowerCase()], 2026);
  assert.deepEqual(v.map((x) => x.id), ["a", "b", "c", "e"], "last year's finished ones drop off");
  assert.equal(v.find((x) => x.id === "b").done, "Oct");
  assert.equal(v.find((x) => x.id === "c").from, 2025, "carried over from last year");
  assert.equal(v.find((x) => x.id === "a").from, 0);
  assert.equal(v.find((x) => x.id === "e").done, "", "read in an earlier year but added this year: still to read (a re-read)");
});

test("store: add (no duplicates), move, remove with undo", async () => {
  console.warn = () => {};
  const store = await import("../js/store.js?readplan");
  let undoTo = null;
  store.onUndo((label, before) => { undoTo = before; });
  const a = store.addReadPlan({ title: "Dune", tab: "Book" }, 2026), b = store.addReadPlan({ title: "The Bear", tab: "TV" }, 2026), c = store.addReadPlan({ title: "Hades II" }, 2026);
  assert.ok(a && b && c);
  assert.equal(store.addReadPlan({ title: "dune" }, 2026), "", "same title is not added twice");
  const titles = () => store.readPlan().map((x) => x.title);
  assert.deepEqual(titles(), ["Dune", "The Bear", "Hades II"]);
  assert.equal(store.setting("read-plan:" + a).tab, "Book", "one Settings row per item");
  store.moveReadPlan(c, 0);
  assert.deepEqual(titles(), ["Hades II", "Dune", "The Bear"]);
  store.moveReadPlan(c, 9);
  assert.deepEqual(titles(), ["Dune", "The Bear", "Hades II"], "moving past the end puts it last");
  store.removeReadPlan(b);
  assert.deepEqual(titles(), ["Dune", "Hades II"]);
  store.undo(undoTo);
  assert.deepEqual(titles(), ["Dune", "The Bear", "Hades II"], "undo brings it back in its place");
});
