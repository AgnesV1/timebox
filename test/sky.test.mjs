// 底图上偶尔经过的小东西的排班（js/sky.js）：飞机 3–5 分钟一趟，另一样 10–15 分钟一次，天上一次只放一样
import { test } from "node:test";
import assert from "node:assert/strict";
import * as K from "../js/sky.js";

// 固定的随机数：同一个种子每次跑出来一样
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

// 照页面里的走法跑一遍（到点 → 问 turn → 放 / 等），每样东西算它要多久；返回放过的 [{ kind, at, end }]
function run(hours, seed, lasts = { plane: 30000, rare: 19000 }) {
  const rnd = seeded(seed), shown = [];
  let now = 0, due = K.firstDue(now, rnd), clearAt = 0;
  const end = hours * 3600000;
  while (now < end) {
    const t = K.turn(now, due, clearAt, rnd);
    due = t.due;
    if (t.kind) { clearAt = now + lasts[t.kind]; shown.push({ kind: t.kind, at: now, end: clearAt }); now = Math.min(due.plane, due.rare); }
    else now += t.wait;
    assert.ok(t.kind || t.wait > 0, "never spins in place");
  }
  return shown;
}

test("the first plane comes within a minute; after that the gaps are 3–5 and 10–15 minutes", () => {
  for (const seed of [1, 7, 42, 2026]) {
    const shown = run(12, seed), planes = shown.filter((x) => x.kind === "plane"), rares = shown.filter((x) => x.kind === "rare");
    assert.ok(planes[0].at >= 20000 && planes[0].at <= 60000, "first plane at " + planes[0].at);
    assert.ok(rares[0].at >= 600000, "nothing rare in the first ten minutes");
    const gaps = (list) => list.slice(1).map((x, i) => (x.at - list[i].at) / 1000);
    // 撞上了会往后让（最多让一样东西的时长 + 一分钟），所以上限放宽这么多
    for (const g of gaps(planes)) assert.ok(g >= 180 && g <= 300 + 19 + 60, "plane gap " + g);
    for (const g of gaps(rares)) assert.ok(g >= 600 && g <= 900 + 30 + 60, "rare gap " + g);
    assert.ok(planes.length >= 12 * 60 / 6.5 && rares.length >= 12 * 60 / 16.5, "they keep coming: " + planes.length + " planes, " + rares.length + " others");
  }
});

test("only one thing in the sky at a time, with a quiet minute in between", () => {
  for (const seed of [3, 99, 12345]) {
    const shown = run(24, seed);
    for (let i = 1; i < shown.length; i++) assert.ok(shown[i].at - shown[i - 1].end >= K.QUIET * 1000, shown[i - 1].kind + " then " + shown[i].kind + " " + (shown[i].at - shown[i - 1].end) + "ms later");
  }
});

test("when both are due, the rarer one goes first and the plane waits its turn", () => {
  const due = { plane: 1000, rare: 900 };
  const a = K.turn(2000, due, 0, () => 0.5);
  assert.equal(a.kind, "rare");
  assert.equal(a.due.plane, 1000, "the plane is still due");
  assert.equal(a.due.rare, 2000 + 750000);
  const b = K.turn(2001, a.due, 2000 + 9000, () => 0.5);
  assert.equal(b.kind, "");
  assert.equal(b.wait, 9000 + 60000 - 1, "until the sky has been clear for a minute");
  assert.equal(K.turn(2000 + 9000 + 60000, a.due, 2000 + 9000, () => 0.5).kind, "plane");
  assert.deepEqual(K.turn(500, due, 0), { kind: "", due, wait: 400 }, "nothing due yet: wait for the nearer one");
});
