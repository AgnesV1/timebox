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

test("priority: read loosely from the Sheet, Soon first, a click is shown at once and sent", () => {
  assert.deepEqual(["Soon", " soon ", "this year", "1y", "5 years", "Five", "5y", "", "maybe", undefined].map(reading.prioKey), ["soon", "soon", "soon", "soon", "five", "five", "five", "", "", ""]);
  assert.equal(reading.prioText("five"), "5 years");
  sheet([{ title: "Dune", tab: "Book", want: true, prio: "" }, { title: "The Bear", tab: "TV", want: true, prio: "5 years" }, { title: "Hades II", tab: "Game", want: true, prio: "Soon" },
    { title: "Arrival", tab: "TV", want: true, prio: "" }, { title: "The Wire", tab: "TV", want: false, when: "2025 May", prio: "Soon" }]);
  assert.deepEqual(reading.wants().map((r) => r.title + ":" + r.prio), ["Hades II:soon", "The Bear:five", "Arrival:", "Dune:"], "Soon, then 5 years, then the rest, newest first");
  assert.equal(reading.exists("The Wire").prio, "", "only what's in Want has one");

  reading.setPrio("dune", "soon");
  reading.setPrio("Dune", "five");
  assert.equal(reading.exists("Dune").prio, "five", "shown before the Sheet has answered");
  const rq = reading.request();
  assert.deepEqual(rq.rank.map((k) => k.title + ":" + k.prio), ["Dune:5 years"], "one change per title: the last click, in the Sheet's words");
  assert.deepEqual(rq.add, []);
  reading.apply({ ranked: [rq.rank[0].id], rows: [{ title: "Dune", tab: "Book", want: true, prio: "5 years" }], types: ["Book", "TV"], kinds: {} }, rq);
  assert.equal(reading.state().pending.length, 0);
  assert.equal(reading.exists("Dune").prio, "five");

  // 新加的带着优先级；还没发出去时再点，改的是排着的那一条
  const id = reading.add({ title: "Severance", type: "TV", prio: "soon" });
  reading.setPrio("Severance", "");
  reading.setPrio("Severance", "five");
  const add = reading.request();
  assert.deepEqual(add.add.map((a) => a.title + ":" + a.prio), ["Severance:5 years"]);
  assert.deepEqual(add.rank, []);
  reading.apply({ added: [id], ranked: [], rows: [], types: [], kinds: {} }, add);
  // 那条已经不在 Want 里了：这次改动不要了
  reading.takeFailed();   // 上面别的测试留下的提醒先清掉
  reading.setPrio("Gone", "soon");
  const gone = reading.request();
  reading.apply({ ranked: [], failed: [{ id: gone.rank[0].id, why: "is not in Want any more" }], rows: [], types: [], kinds: {} }, gone);
  assert.equal(reading.state().pending.length, 0);
  assert.deepEqual(reading.takeFailed(), [], "nothing to tell you about");
});

test("priority: a Sheet script that doesn't know about it keeps the change waiting", () => {
  sheet([{ title: "Dune", tab: "Book", want: true }]);
  reading.setPrio("Dune", "soon");
  const id = reading.add({ title: "Arrival", type: "TV", prio: "five" });
  const rq = reading.request();
  // 旧脚本：加是加上了，但回来的东西里没有 ranked
  reading.apply({ added: [id], dupes: [], logged: [], failed: [], rows: [{ title: "Dune", tab: "Book", want: true }, { title: "Arrival", tab: "TV", want: true }], types: ["Book", "TV"], kinds: {} }, rq);
  assert.match(reading.state().error, /Update Code\.gs/);
  assert.deepEqual(reading.state().pending.map((x) => x.title + ":" + x.prio), ["Dune:soon", "Arrival:five"], "both priorities wait for the new script");
  assert.deepEqual(reading.wants().map((r) => r.title + ":" + r.prio), ["Dune:soon", "Arrival:five"], "and still show here");
  assert.equal(reading.request().list, false, "without re-reading the whole Sheet on every sync");
  // 换了新脚本：写进去了
  const next = reading.request();
  reading.apply({ ranked: next.rank.map((k) => k.id), rows: [{ title: "Dune", tab: "Book", want: true, prio: "Soon" }, { title: "Arrival", tab: "TV", want: true, prio: "5 years" }], types: ["Book", "TV"], kinds: {} }, next);
  assert.equal(reading.state().error, "");
  assert.equal(reading.state().pending.length, 0);
});
