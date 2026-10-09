// 备餐的纯计算：单位、价格热量、打折一轮一轮、购物单、粗排
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/meals.js";

const TODAY = "2026-10-08";   // 周四
const W0 = "2026-10-05";      // 这周一

function data(over = {}) {
  const ex = M.examples(TODAY, W0);
  const D = { ing: {}, box: {}, pack: {}, week: {}, days: {} };
  for (const k of ["ing", "box", "pack", "week"]) for (const r of ex[k]) D[k][r.id] = r;
  for (const w of Object.values(D.week)) Object.assign(D.days, w.days || {});
  return { ...D, ...over };
}

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, a + " ≉ " + b);

test("units: pack size in base units, kcal per 100 or per each", () => {
  const chicken = { packQty: 3, packUnit: "lb", price: 11.97, kcal: 120 };
  close(M.packSize(chicken), 1360.78);
  assert.equal(M.unitOf(chicken), "g");
  close(M.partKcal(chicken, 150), 180);
  close(M.partCost(chicken, 453.592, TODAY), 3.99);
  const eggs = { packQty: 12, packUnit: "each", price: 3.99, kcal: 72 };
  assert.equal(M.partKcal(eggs, 3), 216);
  close(M.partCost(eggs, 3, TODAY), 0.9975);
  assert.equal(M.packLabel(eggs), "12 ct");
  assert.equal(M.packLabel({ packQty: 1, packUnit: "each" }), "each");
  assert.equal(M.fmtQty(1250, "g"), "1.25 kg");
  assert.equal(M.fmtQty(1.5, "each"), "1.5 ea");
  assert.deepEqual(M.unitPrice(chicken, TODAY), { v: 3.99, per: "lb" });
});

test("sale price only counts inside its dates", () => {
  const y = { packQty: 48, packUnit: "oz", price: 6.49, kcal: 59, sale: { price: 4.99, from: "2026-10-05", until: "2026-10-20" } };
  assert.equal(M.packPrice(y, "2026-10-04"), 6.49);
  assert.equal(M.packPrice(y, "2026-10-05"), 4.99);
  assert.equal(M.packPrice(y, "2026-10-20"), 4.99);
  assert.equal(M.packPrice(y, "2026-10-21"), 6.49);
});

test("deal rounds: which round a day falls in, and whether it was checked", () => {
  const ing = { every: 4, from: "2026-09-01" };
  assert.deepEqual(M.roundOf(ing, "2026-09-28"), { start: "2026-09-01", end: "2026-09-28", next: "2026-09-29" });
  assert.deepEqual(M.roundOf(ing, "2026-10-08"), { start: "2026-09-29", end: "2026-10-26", next: "2026-10-27" });
  assert.deepEqual(M.roundOf(ing, "2026-08-20"), { start: "2026-08-04", end: "2026-08-31", next: "2026-09-01" });
  assert.equal(M.roundOf({ every: 0, from: "2026-09-01" }, TODAY), null);
  assert.equal(M.dealState({ ...ing }, TODAY), "check");
  assert.equal(M.dealState({ ...ing, checked: "2026-09-30" }, TODAY), "checked");
  assert.equal(M.dealState({ ...ing, checked: "2026-09-28" }, TODAY), "check");
  assert.equal(M.dealState({ ...ing, sale: { price: 2, from: "2026-10-01", until: "2026-10-10" } }, TODAY), "sale");
  assert.equal(M.dealState({}, TODAY), "none");
  // 每周的传单：每周三新一轮
  const weekly = { every: 1, from: "2026-10-07", checked: "2026-10-07" };
  assert.equal(M.dealState(weekly, TODAY), "checked");
  assert.equal(M.dealState(weekly, "2026-10-14"), "check");
});

test("rounds starting in a window skip weekly flyers", () => {
  const D = data();
  const hits = M.roundsIn(D, "2026-10-19", "2026-10-25");
  assert.ok(hits.every((h) => h.ing.every >= 2));
  // 4 周一轮：鸡胸从 9-20 起 → 10-18；三文鱼从 10-02 起 → 10-30；酸奶从 10-05 起 → 11-02
  assert.deepEqual(M.roundsIn(D, "2026-10-12", "2026-10-18").map((h) => [h.ing.name, h.start]), [["Chicken breast", "2026-10-18"]]);
  assert.deepEqual(M.roundsIn(D, "2026-10-26", "2026-11-02").map((h) => [h.ing.name, h.start]), [["Salmon fillet", "2026-10-30"], ["Greek yogurt, plain", "2026-11-02"]]);
});

test("examples: every part points at a grocery, day packs land in a sensible range", () => {
  const D = data();
  for (const b of Object.values(D.box)) for (const p of b.parts) assert.ok(D.ing[p.ing], b.name + " → " + p.ing);
  for (const p of Object.values(D.pack)) {
    const t = M.packTotals(D, p, TODAY);
    assert.ok(t.kcal > 1300 && t.kcal < 1900, p.name + " " + t.kcal);
    assert.ok(t.cost > 4 && t.cost < 20, p.name + " " + t.cost);
  }
  assert.deepEqual(M.toCheck(D, TODAY).map((i) => i.name), ["Salmon fillet", "Eggs, large"]);
  assert.deepEqual(M.onSaleNow(D, TODAY).map((i) => i.name), ["Greek yogurt, plain"]);
});

test("shop day: the last one on or before the week starts", () => {
  assert.equal(M.shopDate("2026-10-12", 0), "2026-10-11");   // 周一开始的周，周日买
  assert.equal(M.shopDate("2026-10-12", 6), "2026-10-10");   // 周六买
  assert.equal(M.shopDate("2026-10-12", 1), "2026-10-12");   // 周一当天买
  assert.equal(M.shopDate("2026-10-11", 0), "2026-10-11");   // 周日开始的周
  assert.equal(M.shopDate("2026-10-12", 0, "2026-10-09"), "2026-10-09");
});

test("shopping list: adds up the week, rounds up to packs, staples stay home", () => {
  const D = data();
  const next = "2026-10-12";
  const shop = M.shopDate(next, 0);
  const plan = M.weekPlan(D, next, shop);
  assert.equal(plan.planned, 7);
  const list = M.shoppingList(D, next, shop);
  const rows = Object.fromEntries(list.groups.flatMap((g) => g.items.map((r) => [r.ing.id, r])));
  // 鸡胸：A 天 4 次 × 150 g（午饭）+ B 天 3 次 × (150 + 120) g = 7×150 + 3×120 = 1410 g → 3 lb 包装两包
  close(rows["ex-chicken"].qty, 1410);
  assert.equal(rows["ex-chicken"].packs, 2);
  close(rows["ex-chicken"].cost, 23.94);
  close(rows["ex-chicken"].left, 2 * 1360.776 - 1410, 0.1);
  // 鸡蛋：B 天 3 次 × 3 个 = 9 个 → 一盒
  assert.equal(rows["ex-eggs"].qty, 9);
  assert.equal(rows["ex-eggs"].packs, 1);
  // 酸奶在打折（到 10-20），采购日 10-11 → 按打折价
  assert.ok(rows["ex-yogurt"].sale);
  close(rows["ex-yogurt"].cost, 4.99 * rows["ex-yogurt"].packs);
  // 橄榄油是常备的：不在单子上，单独提醒
  assert.equal(rows["ex-oil"], undefined);
  assert.deepEqual(list.staples.map((i) => i.name), ["Olive oil"]);
  // 按超市分，组内按名字
  assert.deepEqual(list.groups.map((g) => g.store), ["Costco", "Safeway", "Trader Joe's"]);
  close(list.total, list.groups.reduce((a, g) => a + g.cost, 0));
  assert.equal(list.open, list.count);
  // 家里还有的不算钱
  const had = M.shoppingList({ ...D, week: { ...D.week, [next]: { ...D.week[next], got: { "ex-chicken": "have", "ex-eggs": "bought" } } } }, next, shop);
  close(had.total, list.total - rows["ex-chicken"].cost);
  assert.equal(had.open, list.count - 2);
  // 上周剩下的
  assert.deepEqual(M.leftovers(list), {});
  assert.ok(M.leftovers(list, true)["ex-chicken"] > 1300);
  assert.ok(M.leftovers(had)["ex-eggs"] === 3 && !("ex-chicken" in M.leftovers(had, true)));
});

test("rough weeks: totals, what's left to place, and filling empty days in order", () => {
  const D = data();
  const later = "2026-10-19";
  const w = D.week[later];
  const t = M.roughTotals(D, w, TODAY);
  assert.equal(t.days, 7);
  const a = M.packTotals(D, D.pack["ex-a"], TODAY), b = M.packTotals(D, D.pack["ex-b"], TODAY);
  close(t.cost, a.cost * 4 + b.cost * 3);
  close(t.kcal, (a.kcal * 4 + b.kcal * 3) / 7);
  // 周二已经放了一个 Day B、周三标了不做饭
  const D2 = { ...D, days: { ...D.days, "2026-10-20": { pack: "ex-b" }, "2026-10-21": { off: true } } };
  assert.deepEqual(M.roughLeft(D2, later, w), ["ex-a", "ex-a", "ex-a", "ex-a", "ex-b", "ex-b"]);
  const filled = M.fillFromRough(D2, later, w);
  assert.deepEqual(Object.keys(filled), ["2026-10-19", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
  assert.deepEqual(Object.values(filled).map((e) => e.pack), ["ex-a", "ex-a", "ex-a", "ex-a", "ex-b"]);
  // 过去的日子不填
  assert.deepEqual(Object.keys(M.fillFromRough(D, later, w, "2026-10-23")), ["2026-10-23", "2026-10-24", "2026-10-25"]);
});

test("a day entry: pack, own boxes, or not cooking", () => {
  const D = data();
  assert.deepEqual(M.boxesOfDay(D, { pack: "ex-b" }), ["ex-wrap", "ex-bowl", "ex-burrito"]);
  assert.deepEqual(M.boxesOfDay(D, { boxes: ["ex-oats", "gone"] }), ["ex-oats"]);
  assert.deepEqual(M.boxesOfDay(D, { off: true }), []);
  assert.deepEqual(M.boxesOfDay(D, null), []);
});
