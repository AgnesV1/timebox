// 底图上偶尔经过的小东西的排班（js/sky.js）：飞机 3–5 分钟一趟，潮水 6–10 分钟一次，少见的那样 10–15 分钟一次，一次只放一样
import { test } from "node:test";
import assert from "node:assert/strict";
import * as K from "../js/sky.js";

// 固定的随机数：同一个种子每次跑出来一样
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const LASTS = { plane: 30000, tide: 15000, rare: 26000 };   // 每样大概要放多久
const longest = Math.max(...Object.values(LASTS)) / 1000;

// 照页面里的走法跑一遍（到点 → 问 turn → 放 / 等）；返回放过的 [{ kind, at, end }]
function run(hours, seed, can = K.ORDER) {
  const rnd = seeded(seed), shown = [];
  let now = 0, due = K.firstDue(now, rnd), clearAt = 0;
  const end = hours * 3600000;
  while (now < end) {
    const t = K.turn(now, due, clearAt, rnd, can);
    due = t.due;
    if (t.kind) { clearAt = now + LASTS[t.kind]; shown.push({ kind: t.kind, at: now, end: clearAt }); now = Math.min(...can.map((k) => due[k])); }
    else now += t.wait;
    assert.ok(t.kind || t.wait > 0, "never spins in place");
  }
  return shown;
}
const of = (shown, kind) => shown.filter((x) => x.kind === kind);
const gaps = (list) => list.slice(1).map((x, i) => (x.at - list[i].at) / 1000);

test("the first plane comes within a minute and the first tide within three; then each keeps its own pace", () => {
  for (const seed of [1, 7, 42, 2026]) {
    const shown = run(12, seed), planes = of(shown, "plane"), tides = of(shown, "tide"), rares = of(shown, "rare");
    assert.ok(planes[0].at >= 20000 && planes[0].at <= 60000, "first plane at " + planes[0].at);
    assert.ok(tides[0].at >= 60000 && tides[0].at <= 180000 + 90000, "first tide at " + tides[0].at);
    assert.ok(rares[0].at >= 600000, "nothing rare in the first ten minutes");
    // 撞上了会往后让：前面最多排着另外两样，每样放完再隔一分钟，所以上限放宽这么多
    const slack = 2 * (longest + K.QUIET);
    for (const [kind, list] of [["plane", planes], ["tide", tides], ["rare", rares]]) {
      for (const g of gaps(list)) assert.ok(g >= K.GAPS[kind][0] && g <= K.GAPS[kind][1] + slack, kind + " gap " + g);
    }
    assert.ok(planes.length >= 12 * 60 / 7 && tides.length >= 12 * 60 / 12.5 && rares.length >= 12 * 60 / 17.5, "they keep coming: " + planes.length + " / " + tides.length + " / " + rares.length);
  }
});

test("only one thing at a time, with a quiet minute in between", () => {
  for (const seed of [3, 99, 12345]) {
    const shown = run(24, seed);
    for (let i = 1; i < shown.length; i++) assert.ok(shown[i].at - shown[i - 1].end >= K.QUIET * 1000, shown[i - 1].kind + " then " + shown[i].kind + " " + (shown[i].at - shown[i - 1].end) + "ms later");
  }
});

test("when several are due, the rarer goes first and the others wait their turn", () => {
  const due = { plane: 1000, tide: 950, rare: 900 }, mid = () => 0.5;
  const a = K.turn(2000, due, 0, mid);
  assert.equal(a.kind, "rare");
  assert.equal(a.due.plane, 1000, "the plane is still due");
  assert.equal(a.due.rare, 2000 + 750000);
  const b = K.turn(2001, a.due, 2000 + 9000, mid);
  assert.equal(b.kind, "");
  assert.equal(b.wait, 9000 + 60000 - 1, "until a minute after the last one has gone");
  const c = K.turn(2000 + 9000 + 60000, a.due, 2000 + 9000, mid);
  assert.equal(c.kind, "tide", "then the tide, before the plane");
  assert.equal(c.due.tide, 71000 + 480000);
  assert.deepEqual(K.turn(500, due, 0), { kind: "", due, wait: 400 }, "nothing due yet: wait for the nearest one");
});

test("on the phone only the tide comes, at its own pace", () => {
  for (const seed of [5, 77]) {
    const shown = run(8, seed, ["tide"]);
    assert.ok(shown.length >= 8 * 60 / 10.5 && shown.every((x) => x.kind === "tide"), shown.length + " tides, nothing else");
    for (const g of gaps(shown)) assert.ok(g >= 360 && g <= 600, "tide gap " + g);
  }
  const due = { plane: 0, tide: 5000, rare: 0 };
  assert.deepEqual(K.turn(1000, due, 0, Math.random, ["tide"]), { kind: "", due, wait: 4000 }, "the others being long overdue changes nothing");
  assert.deepEqual(K.turn(1000, due, 0, Math.random, []), { kind: "", due, wait: 60000 });
});

test("what drifts down by day follows the month", () => {
  const by = (m) => K.seasonOf(m);
  assert.deepEqual([3, 4].map(by), ["spring", "spring"]);
  assert.deepEqual([5, 6, 7, 8].map(by), ["summer", "summer", "summer", "summer"]);
  assert.deepEqual([9, 10, 11].map(by), ["autumn", "autumn", "autumn"]);
  assert.deepEqual([12, 1, 2].map(by), ["winter", "winter", "winter"]);
});
