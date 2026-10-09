// 备餐的纯计算：低中高、几天份、打折一轮一轮、下次采购的单子、粗排；还有旧格式（Day pack、克数）读进来的样子
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/meals.js";
import * as store from "../js/store.js";

console.warn = () => {};   // store 在 node 里存不下来，只是提示
const TODAY = "2026-10-08";   // 周四
const W0 = "2026-10-05";      // 这周一
const NEXT = "2026-10-12", LATER = "2026-10-19";

function data(patchWeeks = {}) {
  const ex = M.examples(TODAY, W0);
  const D = { ing: {}, box: {}, week: {}, days: {} };
  for (const k of ["ing", "box", "week"]) for (const r of ex[k]) D[k][r.id] = r;
  for (const [id, w] of Object.entries(patchWeeks)) D.week[id] = { ...(D.week[id] || {}), id, ...w };
  for (const w of Object.values(D.week)) Object.assign(D.days, w.days || {});
  return D;
}
const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, a + " ≉ " + b);
const rowsOf = (list) => Object.fromEntries(list.groups.flatMap((g) => g.items.map((r) => [r.ing.id, r])));

test("a box is as heavy as its heaviest grocery, one level lighter when half of it is veg", () => {
  const D = data();
  const lv = (id) => M.boxLevel(D, D.box["ex-" + id]);
  assert.equal(lv("oats"), "mid");        // mid + mid + low
  assert.equal(lv("eggs"), "low");        // mid + low（油是常备的，不算）
  assert.equal(lv("dumplings"), "mid");   // high + low
  assert.equal(lv("pasta"), "high");      // mid + high + low
  assert.equal(lv("banana"), "low");
  assert.equal(M.boxLevel(D, { ...D.box["ex-pasta"], level: "mid" }), "mid", "picked by hand wins");
  assert.equal(M.boxLevel(D, { parts: [] }), "mid");
  assert.equal(M.levelOf({}), "mid");
});

test("cost of a box = each grocery's price ÷ how many days one buy lasts", () => {
  const D = data();
  // 鸡胸 13.99 / 3 天 + 米 12.99 / 30 天 + 西兰花 2.99 / 2 天
  close(M.boxCost(D, D.box["ex-bowl"], TODAY), 13.99 / 3 + 12.99 / 30 + 2.99 / 2);
  // 酸奶在打折（5.49）
  close(M.useCost(D.ing["ex-yogurt"], TODAY), 5.49 / 5);
  close(M.useCost(D.ing["ex-yogurt"], "2026-10-21"), 6.99 / 5);
  assert.equal(M.lastsOf({}), 7);
  assert.equal(M.lastsOf({ lasts: 0 }), 7);
  assert.equal(M.lastsOf({ lasts: "30" }), 30);
});

test("deal rounds: which round a day falls in, and whether it was checked", () => {
  const ing = { every: 4, from: "2026-09-01" };
  assert.deepEqual(M.roundOf(ing, "2026-09-28"), { start: "2026-09-01", end: "2026-09-28", next: "2026-09-29" });
  assert.deepEqual(M.roundOf(ing, "2026-10-08"), { start: "2026-09-29", end: "2026-10-26", next: "2026-10-27" });
  assert.deepEqual(M.roundOf(ing, "2026-08-20"), { start: "2026-08-04", end: "2026-08-31", next: "2026-09-01" });
  assert.equal(M.roundOf({ every: 0, from: "2026-09-01" }, TODAY), null);
  assert.equal(M.dealState(ing, TODAY), "check");
  assert.equal(M.dealState({ ...ing, checked: "2026-09-30" }, TODAY), "checked");
  assert.equal(M.dealState({ ...ing, sale: { price: 2, from: "2026-10-01", until: "2026-10-10" } }, TODAY), "sale");
  assert.equal(M.dealState({}, TODAY), "none");
  const D = data();
  assert.deepEqual(M.toCheck(D, TODAY).map((i) => i.name), ["Eggs, dozen", "Salmon fillet"]);
  assert.deepEqual(M.onSaleNow(D, TODAY).map((i) => i.name), ["Greek yogurt"]);
  // 两周以上一轮的才算「可能打折」：三文鱼 10-02 起每 4 周 → 10-30；饺子 9-29 起每 2 周 → 10-13、10-27
  assert.deepEqual(M.roundsIn(D, "2026-10-26", "2026-11-01").map((h) => [h.ing.name, h.start]), [["Frozen dumplings", "2026-10-27"], ["Salmon fillet", "2026-10-30"]]);
});

test("shop day: the last one on or before the week starts", () => {
  assert.equal(M.shopDate(NEXT, 0), "2026-10-11");
  assert.equal(M.shopDate(NEXT, 6), "2026-10-10");
  assert.equal(M.shopDate(NEXT, 1), NEXT);
  assert.equal(M.shopDate(NEXT, 0, "2026-10-09"), "2026-10-09");
});

test("a week by day: boxes, cost, and how many low / mid / high", () => {
  const D = data();
  const p = M.weekPlan(D, NEXT, "2026-10-11");
  assert.equal(p.planned, 6);   // 周日不做饭
  assert.deepEqual(p.levels, { low: 5, mid: 12, high: 2 });
  close(p.cost, p.days.reduce((a, d) => a + d.cost, 0));
  assert.deepEqual(M.boxesOfDay(D, { boxes: ["ex-oats", "gone"] }), ["ex-oats"]);
  assert.deepEqual(M.boxesOfDay(D, { off: true }), []);
});

test("shopping list: days of use ÷ days per buy, by store, sale prices, staples stay home", () => {
  const D = data();
  const list = M.shopList(D, NEXT, 0);
  assert.equal(list.shop, "2026-10-11");
  const r = rowsOf(list);
  assert.equal(r["ex-chicken"].uses, 5);   // 周一到周五的午饭
  assert.equal(r["ex-chicken"].n, 2);      // 一次够 3 天 → 买两次
  close(r["ex-chicken"].cost, 27.98);
  assert.equal(r["ex-broccoli"].n, 3);     // 5 天 ÷ 2
  assert.equal(r["ex-rice"].uses, 5);      // 同一天两顿都有米，只算一天
  assert.equal(r["ex-rice"].n, 1);
  assert.equal(r["ex-bokchoy"].n, 2);      // 一、二、三、五 4 天 ÷ 2
  assert.ok(r["ex-yogurt"].sale);
  close(r["ex-yogurt"].cost, 5.49);
  assert.equal(r["ex-oil"], undefined);
  assert.deepEqual(list.staples.map((i) => i.name), ["Olive oil"]);
  assert.deepEqual(list.groups.map((g) => g.store), ["Dodo", "Eataly", "Farm Boy", "Loblaws", "Longo's", "T&T"]);
  assert.equal(list.count, 14);
  assert.equal(list.open, 14);
  close(list.total, list.groups.reduce((a, g) => a + g.cost, 0));
});

test("shopping list remembers what was bought: a 30-day bag of rice isn't on every week's list", () => {
  // 这周买了米（一次够 30 天）、标了西兰花「家里有」（只顶这周）
  const D = data({ [W0]: { got: { "ex-rice": { n: 1 }, "ex-broccoli": "have" } } });
  const r = rowsOf(M.shopList(D, NEXT, 0));
  assert.equal(r["ex-rice"], undefined);
  assert.equal(r["ex-broccoli"].n, 3);
  // 下周自己的勾：买了几次照买的时候记的；家里有的不算钱；手动加的照加（常备的也行）
  const D2 = data({ [NEXT]: { got: { "ex-chicken": { n: 1 }, "ex-eggs": "have" }, extra: { "ex-oil": 1, "ex-banana": 2 } } });
  const L2 = M.shopList(D2, NEXT, 0), r2 = rowsOf(L2);
  assert.equal(r2["ex-chicken"].n, 1);
  assert.equal(r2["ex-chicken"].state, "bought");
  close(r2["ex-chicken"].cost, 13.99);
  assert.equal(r2["ex-eggs"].state, "have");
  assert.equal(r2["ex-eggs"].cost, 0);
  assert.equal(r2["ex-oil"].n, 1);
  assert.equal(r2["ex-banana"].n, 3);
  assert.equal(L2.open, L2.count - 2);
  // 已经过了的日子不算
  assert.equal(rowsOf(M.shopList(D, NEXT, 0, "2026-10-16"))["ex-chicken"].uses, 1);
});

test("next shop: the first of this week and next that isn't shopped or skipped", () => {
  const D = data();
  assert.equal(M.nextShop(D, TODAY, W0, 0).start, NEXT, "this week has nothing left to buy");
  const D2 = data({ [W0]: { days: { "2026-10-09": { boxes: ["ex-bowl"] } } } });
  assert.equal(M.nextShop(D2, TODAY, W0, 0).start, W0);
  assert.equal(M.nextShop(data({ [W0]: { ...D2.week[W0], shopped: true } }), TODAY, W0, 0).start, NEXT);
  assert.equal(M.nextShop(data({ [NEXT]: { skip: true } }), TODAY, W0, 0), null);
});

test("rough weeks: totals, what's left to place, filling empty days breakfast–lunch–dinner", () => {
  const D = data();
  const w = D.week[LATER];
  const t = M.roughTotals(D, w, TODAY);
  assert.equal(t.meals, 17);
  assert.deepEqual(t.levels, { low: 3, mid: 13, high: 1 });
  const D2 = { ...D, days: { ...D.days, "2026-10-20": { boxes: ["ex-eggs"] }, "2026-10-21": { off: true } } };
  assert.equal(M.roughLeft(D2, LATER, w).filter((b) => b === "ex-eggs").length, 2);
  const filled = M.fillFromRough(D2, LATER, w);
  assert.deepEqual(Object.keys(filled), ["2026-10-19", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
  assert.deepEqual(filled["2026-10-19"].boxes, ["ex-oats", "ex-bowl", "ex-salmon"]);
  assert.deepEqual(filled["2026-10-25"].boxes, ["ex-eggs", "ex-bowl", "ex-pasta"]);
  assert.deepEqual(Object.keys(M.fillFromRough(D, LATER, w, "2026-10-24")), ["2026-10-24", "2026-10-25"]);
});

test("old data (day packs, grams) reads as boxes and free-text amounts", () => {
  const row = (key, value) => ({ key, value, updated: 5 });
  store.applyPull({ tables: { settings: [
    row("meal-ing:old-rice", { name: "Rice", packQty: 2, packUnit: "lb", price: 3.49 }),
    row("meal-ing:old-egg", { name: "Eggs", packQty: 12, packUnit: "each", price: 3.99 }),
    row("meal-box:old-a", { name: "Rice bowl", parts: [{ ing: "old-rice", qty: 75 }, { ing: "old-egg", qty: 2 }] }),
    row("meal-box:old-b", { name: "Egg cup", parts: [{ ing: "old-egg", qty: "" }] }),
    row("meal-pack:old-p", { name: "Day A", boxes: ["old-a", "old-b"] }),
    row("meal-week:2030-01-07", { days: { "2030-01-07": { pack: "old-p" }, "2030-01-08": { boxes: ["old-b"] } }, rough: [{ pack: "old-p", n: 2 }, { box: "old-b", n: 1 }] })
  ] } }, 10);
  const D = store.meals();
  assert.deepEqual(D.box["old-a"].parts, [{ ing: "old-rice", amt: "75 g" }, { ing: "old-egg", amt: "2" }]);
  assert.deepEqual(D.box["old-b"].parts, [{ ing: "old-egg", amt: "" }]);
  assert.deepEqual(D.days["2030-01-07"], { boxes: ["old-a", "old-b"] });
  assert.deepEqual(D.week["2030-01-07"].rough, [{ box: "old-a", n: 2 }, { box: "old-b", n: 3 }]);
  // 删一个 Box：每天、粗排里都拿掉；那天空了就整天清掉
  store.deleteMeal("box", "old-b");
  const D2 = store.meals();
  assert.deepEqual(D2.days["2030-01-07"], { boxes: ["old-a"] });
  assert.equal(D2.days["2030-01-08"], undefined);
  assert.deepEqual(D2.week["2030-01-07"].rough, [{ box: "old-a", n: 2 }]);
});
