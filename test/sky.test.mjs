// 底图上偶尔经过的小东西的排班（js/sky.js）：飞机 3–5 分钟一趟，潮水 6–10 分钟一次，少见的那样 10–15 分钟一次；
// 各管各的，撞上了就一起出现（2026-10-17 起，之前是一次只放一样）
import { test } from "node:test";
import assert from "node:assert/strict";
import * as K from "../js/sky.js";

// 固定的随机数：同一个种子每次跑出来一样
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const LASTS = { plane: 30000, tide: 15000, rare: 26000 };   // 每样大概要放多久

// 照页面里的走法跑一遍（到点 → 问 turn → 到点的都放 → 等到最近的那一样）；返回放过的 [{ kind, at, end }]
function run(hours, seed, can = K.ORDER) {
  const rnd = seeded(seed), shown = [];
  let now = 0, due = K.firstDue(now, rnd);
  const end = hours * 3600000;
  while (now < end) {
    const t = K.turn(now, due, rnd, can);
    due = t.due;
    for (const kind of t.kinds) shown.push({ kind, at: now, end: now + LASTS[kind] });
    assert.ok(t.wait > 0, "never spins in place");
    now += t.wait;
  }
  return shown;
}
const of = (shown, kind) => shown.filter((x) => x.kind === kind);
const gaps = (list) => list.slice(1).map((x, i) => (x.at - list[i].at) / 1000);

test("the first plane comes within a minute and the first tide within three; then each keeps exactly its own pace", () => {
  for (const seed of [1, 7, 42, 2026]) {
    const shown = run(12, seed);
    const planes = of(shown, "plane"), tides = of(shown, "tide"), rares = of(shown, "rare");
    assert.ok(planes[0].at >= 20000 && planes[0].at <= 60000, "first plane at " + planes[0].at);
    assert.ok(tides[0].at >= 60000 && tides[0].at <= 180000, "first tide at " + tides[0].at);
    assert.ok(rares[0].at >= 600000, "nothing rare in the first ten minutes");
    // 不再给别的让路：每样的间隔正好落在自己那一档里
    for (const [kind, list] of [["plane", planes], ["tide", tides], ["rare", rares]]) {
      for (const g of gaps(list)) assert.ok(g >= K.GAPS[kind][0] && g <= K.GAPS[kind][1], kind + " gap " + g);
    }
  }
});

test("they don't wait for each other: over a day some of them overlap", () => {
  for (const seed of [3, 99, 12345]) {
    const shown = run(24, seed);
    const overlaps = shown.filter((x, i) => shown.slice(i + 1).some((y) => y.at < x.end)).length;
    assert.ok(overlaps > 0, "seed " + seed + ": nothing ever overlapped");
  }
});

test("everything due at once goes out together, each booked for its own next turn", () => {
  const due = { plane: 1000, tide: 950, rare: 5000 }, mid = () => 0.5;
  const a = K.turn(2000, due, mid);
  assert.deepEqual(a.kinds, ["tide", "plane"]);
  assert.equal(a.due.tide, 2000 + 480000);
  assert.equal(a.due.plane, 2000 + 240000);
  assert.equal(a.due.rare, 5000, "not due yet: left alone");
  assert.equal(a.wait, 3000, "then wait for the nearest one");
  assert.deepEqual(K.turn(500, due), { kinds: [], due, wait: 450 }, "nothing due yet: wait for the nearest one");
});

test("on the phone only the tide comes, at its own pace", () => {
  for (const seed of [5, 77]) {
    const shown = run(8, seed, ["tide"]);
    assert.ok(shown.length >= 8 * 60 / 10.5 && shown.every((x) => x.kind === "tide"), shown.length + " tides, nothing else");
    for (const g of gaps(shown)) assert.ok(g >= 360 && g <= 600, "tide gap " + g);
  }
  const due = { plane: 0, tide: 5000, rare: 0 };
  assert.deepEqual(K.turn(1000, due, Math.random, ["tide"]), { kinds: [], due, wait: 4000 }, "the others being long overdue changes nothing");
  assert.deepEqual(K.turn(1000, due, Math.random, []), { kinds: [], due, wait: 60000 });
});

test("what drifts down by day follows the month", () => {
  const by = (m) => K.seasonOf(m);
  assert.deepEqual([3, 4].map(by), ["spring", "spring"]);
  assert.deepEqual([5, 6, 7, 8].map(by), ["summer", "summer", "summer", "summer"]);
  assert.deepEqual([9, 10, 11].map(by), ["autumn", "autumn", "autumn"]);
  assert.deepEqual([12, 1, 2].map(by), ["winter", "winter", "winter"]);
});
