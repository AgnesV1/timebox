import { test } from "node:test";
import assert from "node:assert/strict";
import * as reading from "../js/reading.js";

// 没有 localStorage 时只是存不下来；清单用表格回来的样子塞进去
const sheet = (rows) => reading.apply({ rows, types: ["Book", "TV"], kinds: { Book: ["book", "English"] } }, { add: [], done: [], list: true });

test("wantOf: what a finished task can still be logged as", () => {
  sheet([{ title: "Dune", tab: "Book", want: true }, { title: "《三体》", tab: "Book", want: false, when: "" }, { title: "The Wire", tab: "TV", want: false, when: "2025 May" }]);
  assert.equal(reading.wantOf("dune ").tab, "Book", "in Want, whatever the case or spaces");
  assert.equal(reading.wantOf("三体").tab, "Book", "sitting in a tab with no date yet");
  assert.equal(reading.wantOf("The Wire"), undefined, "already logged");
  assert.equal(reading.wantOf("Something else"), undefined);
  assert.equal(reading.wantOf(""), undefined);
  assert.equal(reading.request(), null, "fresh list, nothing queued: nothing to ask the Sheet");

  reading.log({ title: "Dune", type: "Book", year: 2026, month: 10, mark: "🎉", kind: "book" });
  assert.equal(reading.wantOf("Dune"), undefined, "queued as finished: don't ask again");
  const rq = reading.request();
  assert.equal(rq.done.length, 1);
  assert.equal(rq.list, true, "the list comes back with the write, so this device is up to date at once");
  reading.apply({ logged: [rq.done[0].id], rows: [{ title: "Dune", tab: "Book", want: false, when: "2026 Oct", mark: "🎉" }], types: ["Book", "TV"], kinds: {} }, rq);
  assert.equal(reading.state().pending.length, 0);
  assert.equal(reading.wantOf("Dune"), undefined);
});

test("not yet: stop asking for that task only", () => {
  assert.equal(reading.askedNotYet("t1"), false);
  reading.notYet("t1");
  assert.equal(reading.askedNotYet("t1"), true);
  assert.equal(reading.askedNotYet("t2"), false);
});

test("a stuck entry doesn't make every sync re-read the list", () => {
  sheet([]);
  reading.log({ title: "Next year", type: "Book", year: 2027, month: 1 });
  const rq = reading.request();
  reading.apply({ logged: [], failed: [{ id: rq.done[0].id, why: "2027 isn't in the Year list" }], rows: [], types: ["Book"], kinds: {} }, rq);
  const again = reading.request();
  assert.equal(again.done.length, 1, "still queued");
  assert.equal(again.list, false);
  reading.drop(rq.done[0].id);
});
