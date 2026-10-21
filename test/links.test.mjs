// Projects 页的连线：两头直接连的一条弧线（左右隔开 = 斜的 S，都在右栏里 = 往左鼓的 C），流光按线的长度跑
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
const L = await import("../js/ui/links.js");

test("a plan on the left and a goal on the right: out of the facing sides, flat ends, a diagonal S between", () => {
  const plan = { l: 100, t: 400, r: 400, b: 480 }, goal = { l: 1000, t: 120, r: 1180, b: 142 };
  const c = L.curve(plan, goal, { y0: 414 });
  assert.deepEqual([c.p0.x, c.p0.y], [402, 414], "leaves the card's right edge at the title row");
  assert.deepEqual([c.p3.x, c.p3.y], [997, 131], "enters the goal row from the left, in the middle");
  assert.equal(c.c1.y, c.p0.y, "flat at the start");
  assert.equal(c.c2.y, c.p3.y, "flat at the end");
  assert.ok(c.c1.x > c.p0.x && c.c2.x < c.p3.x, "the S bends toward each other");
  const back = L.curve(goal, plan);
  assert.ok(back.p0.x < goal.l && back.p3.x > plan.r, "the other way round leaves from the left and enters from the right");
});

test("both ends in the rail: in and out on the left, bulging left so it never crosses the goals' text", () => {
  const child = { l: 1100, t: 600, r: 1300, b: 622 }, parent = { l: 1240, t: 140, r: 1400, b: 160 };
  const c = L.curve(child, parent, { rail: true });
  assert.equal(c.p0.x, 1097);
  assert.equal(c.p3.x, 1237);
  assert.ok(c.c1.x < c.p0.x && c.c2.x < c.p3.x, "both control points sit to the left");
  assert.ok(c.p0.x - c.c1.x <= 80, "the bulge is capped");
});

test("stacked boxes (narrow window): out of the bottom, into the top", () => {
  const c = L.curve({ l: 0, t: 0, r: 300, b: 200 }, { l: 50, t: 500, r: 350, b: 560 });
  assert.deepEqual([c.p0.y, c.p3.y], [202, 497]);
  assert.equal(c.c1.x, c.p0.x);
});

test("the streak keeps the same speed on long and short lines", () => {
  const short = L.streakOf(120), long = L.streakOf(900);
  assert.ok(long.sd > short.sd, "a longer line takes longer");
  assert.ok(long.sl < short.sl, "and its streak is a smaller share of it");
  assert.equal(L.streakOf(20).sd, 1.2, "never faster than 1.2s a round");
  assert.equal(L.streakOf(5000).sd, 4.2, "never slower than 4.2s");
  for (const k of [short, long]) {
    assert.ok(Math.abs(k.sl + k.sg - 1.4) < 1e-9, "dash + gap is always one round (1.4), so the loop is seamless");
    assert.ok(k.sl <= 0.3, "never longer than the .3 the keyframes start from, so it slides in from off the line");
    assert.ok(Math.abs(1.4 * k.hit - 0.3 + k.sl - 1) < 1e-9, "hit is when the head reaches the end");
  }
});
