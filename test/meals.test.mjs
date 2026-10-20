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

test("any meat: a box can hold 'whichever' of a type — its level and cost are the type's, and it lands on the list per day", () => {
  const D = data({ [NEXT]: { days: { "2026-10-12": { boxes: ["any"] }, "2026-10-13": { boxes: ["any"] } } } });
  D.ing["ex-chicken"].cat = "meat"; D.ing["ex-salmon"].cat = "meat";
  D.box.any = { id: "any", name: "Curry", level: "", parts: [{ any: "meat", amt: "" }, { any: "veg", amt: "" }, { ing: "ex-rice", amt: "" }] };
  D.days = {}; for (const w of Object.values(D.week)) Object.assign(D.days, w.days || {});
  assert.equal(M.boxLevel(D, D.box.any), "mid");   // mid + low + mid
  close(M.boxCost(D, D.box.any, TODAY), (13.99 / 3 + 15.99 / 2) / 2 + 12.99 / 30);   // 肉 = 两种的平均；菜这一类还没东西 = 0
  const rows = rowsOf(M.shopList(D, NEXT, 0));
  assert.equal(rows["any:meat"].n, 2);
  assert.equal(rows["any:meat"].ing.name, "Any meat");
  assert.equal(M.partIng(D, { any: "nope" }), null);
});

test("always in stock: milk comes back every 'lasts' days whether or not a box uses it", () => {
  const D = data();
  D.ing.milk = { id: "milk", name: "Milk", store: "Longo's", price: 6, lasts: 10, level: "mid", keep: true };
  let rows = rowsOf(M.shopList(D, NEXT, 0));
  assert.equal(rows.milk.n, 1);                    // 7 天 ÷ 10
  D.week[NEXT] = { ...D.week[NEXT], got: { milk: { n: 1 } } };   // 10-11 周日买的，够到 10-20
  rows = rowsOf(M.shopList(D, LATER, 0));
  assert.equal(rows.milk.uses, 5);                 // 10-21 ~ 10-25 没着落
  assert.equal(rows.milk.n, 1);
  D.ing.milk.lasts = 15;   // 10-11 买的够到 10-25，正好盖住再下一周
  assert.equal(rowsOf(M.shopList(D, LATER, 0)).milk, undefined, "a 15-day buy covers the week after too");
});

test("import: matched by name — existing rows are updated, new ones added, box parts found by name", () => {
  const D = data();
  let n = 0;
  const out = M.importRows(D, {
    ing: [{ name: " eggs, dozen ", price: 8, cat: "basic", keep: true, junk: 1 }, { name: "牛奶", store: "Longo's", price: 6, lasts: 10 }, { name: "" }],
    box: [{ name: "Banana", parts: [{ ing: "牛奶" }, { any: "meat" }, { any: "nope" }, { ing: "missing" }] }, { name: "咖喱饭", parts: [{ ing: "Eggs, dozen", amt: "2" }] }]
  }, () => "new" + ++n);
  assert.equal(out.ing.length, 2);
  assert.deepEqual([out.ing[0].id, out.ing[0].price, out.ing[0].store, out.ing[0].keep, out.ing[0].junk], ["ex-eggs", 8, "Loblaws", true, undefined]);
  assert.equal(out.ing[1].id, "new1");
  assert.equal(out.box[0].id, "ex-banana");
  assert.deepEqual(out.box[0].parts, [{ ing: "new1", amt: "" }, { any: "meat", amt: "" }]);
  assert.deepEqual(out.box[1].parts, [{ ing: "ex-eggs", amt: "2" }]);
});

test("one note for the whole shop; older per-line notes are carried into it", () => {
  const old = data({ [NEXT]: { notes: { "ex-chicken": "thighs if they're on sale", "any:veg": " bok choy ", "gone": "x", "ex-broccoli": "" } } });
  assert.equal(M.shopMemo(old, old.week[NEXT]), "Chicken breast: thighs if they're on sale\nAny veg: bok choy\nx");
  const D = data({ [NEXT]: { memo: "ask about the fish", notes: { "ex-chicken": "old" } } });
  assert.equal(M.shopMemo(D, D.week[NEXT]), "ask about the fish");
  assert.equal(M.shopMemo(data({ [NEXT]: { memo: "", notes: { "ex-chicken": "old" } } }), { memo: "", notes: { "ex-chicken": "old" } }), "", "cleared stays cleared");
  assert.equal(M.shopMemo(D, undefined), "");
  assert.equal(rowsOf(M.shopList(D, NEXT, 0))["ex-chicken"].note, undefined);
});

test("restock: the date one cycle on, and what's coming in the next three months", () => {
  assert.equal(M.nextAfter("2026-10-08", { n: 30, unit: "d" }), "2026-11-07");
  assert.equal(M.nextAfter("2026-10-08", { n: 2, unit: "w" }), "2026-10-22");
  assert.equal(M.nextAfter("2026-01-31", { n: 1, unit: "m" }), "2026-02-28");   // 小月落在月底
  assert.equal(M.nextAfter("2026-10-08", { n: 2, unit: "y" }), "2028-10-08");
  assert.equal(M.nextAfter("2026-10-08", { n: "", unit: "m" }), "");
  assert.equal(M.cycleText({ n: 1, unit: "m" }), "every month");
  assert.equal(M.cycleText({ n: 6, unit: "w" }), "every 6 weeks");
  assert.deepEqual([{ n: 3, unit: "m" }, { n: 2, unit: "y" }, { n: 3, unit: "d" }, { n: 1, unit: "w" }, { n: 4 }, { once: true, n: 3 }].map(M.cycleShort), ["3m", "2y", "3d", "1w", "4m", ""]);
  const D = { sup: {
    vit: { id: "vit", name: "Vitamin D", price: 20, n: 30, unit: "d", next: "2026-10-20" },
    brush: { id: "brush", name: "Brush heads", price: 35, n: 3, unit: "m", next: "2026-09-15" },
    phone: { id: "phone", name: "Phone", price: 900, n: 3, unit: "y", next: "2027-03-01" },
    blank: { id: "blank", name: "No date yet", price: 5, n: 1, unit: "m", next: "" }
  } };
  const C = M.coming(D, TODAY);
  assert.deepEqual(C.overdue.map((x) => x.sup.id), ["brush"]);
  assert.deepEqual(C.months.map((m) => m.key + " " + m.label), ["2026-10 Oct", "2026-11 Nov", "2026-12 Dec"]);
  // 维生素 30 天一次：三个月里出现三次；牙刷头过期了，当成今天换，下一次在三个月后（窗口外）；手机和没填日期的不在
  assert.deepEqual(C.months.map((m) => m.items.map((x) => x.sup.id + " " + x.date)), [["vit 2026-10-20"], ["vit 2026-11-19"], ["vit 2026-12-19"]]);
  assert.deepEqual(C.months.map((m) => m.total), [20, 20, 20]);
});

test("restock: things you buy once sit apart, count once, and drop out when bought", () => {
  const D = { sup: {
    vit: { id: "vit", name: "Vitamin D", price: 20, n: 30, unit: "d", next: "2026-10-20" },
    dress: { id: "dress", name: "Dress", price: 120, once: true, next: "2026-11-15", n: 3, unit: "m" },   // 留着的周期不算数
    lamp: { id: "lamp", name: "Lamp", price: 60, once: true, next: "" },
    coat: { id: "coat", name: "Coat", price: 300, once: true, next: "2026-09-30" },
    boots: { id: "boots", name: "Boots", price: 180, once: true, next: "2026-10-25", bought: "2026-10-05" },
    bag: { id: "bag", name: "Bag", price: 90, once: true, next: "", bought: "2026-10-07" }
  } };
  const R = M.restock(D);
  assert.deepEqual(R.regular.map((s) => s.id), ["vit"]);
  assert.deepEqual(R.once.map((s) => s.id), ["coat", "dress", "lamp"], "dated first, then by name");
  assert.deepEqual(R.bought.map((s) => s.id), ["bag", "boots"], "latest first");
  assert.equal(M.nextAfter("2026-11-15", D.sup.dress), "", "no next time");
  assert.equal(M.cycleText(D.sup.dress), "");
  const C = M.coming(D, TODAY);
  assert.deepEqual(C.overdue.map((x) => x.sup.id), ["coat"]);
  assert.deepEqual(C.months.map((m) => m.items.map((x) => x.sup.id)), [["vit"], ["dress", "vit"], ["vit"]]);
  assert.deepEqual(C.months.map((m) => m.total), [20, 140, 20]);
});

test("restock: each thing has a mark (untagged = other); the page and Coming up filter by it", () => {
  const D = { sup: {
    vit: { id: "vit", name: "Vitamin D", price: 20, n: 30, unit: "d", next: "2026-10-20", tag: "health" },
    brush: { id: "brush", name: "Brush heads", price: 15, n: 3, unit: "m", next: "2026-11-02" },
    dress: { id: "dress", name: "Dress", price: 120, once: true, next: "2026-11-15", tag: "style" },
    serum: { id: "serum", name: "Serum", price: 40, once: true, next: "", tag: "style", bought: "2026-10-01" },
    odd: { id: "odd", name: "Odd", price: 5, once: true, next: "", tag: "nope" }
  } };
  assert.equal(M.supTag(D.sup.brush), "other");
  assert.equal(M.supTag(D.sup.odd), "other", "a mark it doesn't know counts as other");
  assert.equal(M.supEmoji(D.sup.vit), "🩺");
  assert.deepEqual(M.supCounts(D), { health: 1, other: 2, style: 1 }, "bought ones aren't counted");
  const R = M.restock(D, "style");
  assert.deepEqual([R.regular.length, R.once.map((s) => s.id), R.bought.map((s) => s.id)], [0, ["dress"], ["serum"]]);
  assert.equal(M.restock(D, "").regular.length, 2, "empty = everything");
  assert.equal(M.restock(D, "whatever").regular.length, 2, "an unknown filter = everything");
  const C = M.coming(D, TODAY, 3, "health");
  assert.deepEqual(C.months.map((m) => m.total), [20, 20, 20]);
  assert.deepEqual(M.coming(D, TODAY, 3).months.map((m) => m.total), [20, 155, 20]);
});

test("to try: two kinds, newest first; lines become dishes", () => {
  const D = { dish: {
    a: { id: "a", name: "Beef pho", note: "rare", kind: "box", order: 1 },
    b: { id: "b", name: "Tiramisu", kind: "once", order: 2, taskId: "t1", from: "Eataly", date: "2026-10-09" },
    c: { id: "c", name: "Mapo tofu", kind: "box", order: 3 },
    d: { id: "d", name: "Cannoli", order: 4, taskId: "t1" },   // 没写哪一种 = 只试一次
    e: { id: "e", name: "Bao", kind: "once", order: 5, taskId: "t2" }
  } };
  const T = M.toTry(D);
  assert.deepEqual(T.box.map((d) => d.name), ["Mapo tofu", "Beef pho"]);
  assert.deepEqual(T.once.map((d) => d.name), ["Bao", "Cannoli", "Tiramisu"]);
  assert.deepEqual(M.dishesOf(D, "t1").map((d) => d.name), ["Tiramisu", "Cannoli"], "in the order they were noted");
  assert.deepEqual(M.dishesOf(D, ""), []);
  assert.deepEqual(M.toTry({}), { box: [], once: [] });
  assert.deepEqual(M.parseDishes("- Beef pho\n2. Spring rolls — extra mint\n\nCongee：century egg\nspring  rolls\n• Iced coffee - condensed milk\nStir-fried greens", Object.values(D.dish)), [
    { name: "Spring rolls", note: "extra mint" }, { name: "Congee", note: "century egg" }, { name: "Iced coffee", note: "condensed milk" }, { name: "Stir-fried greens", note: "" }
  ]);
  assert.deepEqual(M.parseDishes("  "), []);
});

test("store: a dish from a task, then made into a box; undo brings the dish back", () => {
  let undo = null;
  store.onUndo((label, before) => { undo = before; });
  store.addDishes([{ name: "Bun cha", note: "grilled pork, lots of herbs" }, { name: "Egg coffee", note: "" }], { kind: "once", from: "Hanoi Corner", date: "2026-10-10", taskId: "task-1" });
  const dish = Object.values(store.meals().dish).find((d) => d.name === "Bun cha");
  assert.deepEqual([dish.kind, dish.from, dish.taskId], ["once", "Hanoi Corner", "task-1"]);
  assert.ok(store.get("settings", "meal-dish:" + dish.id), "one Settings row each");
  assert.equal(M.dishesOf(store.meals(), "task-1").length, 2);

  const box = store.dishToBox(dish.id);
  assert.equal(store.meals().box[box].name, "Bun cha");
  assert.equal(store.meals().box[box].note, "grilled pork, lots of herbs — had at Hanoi Corner");
  assert.equal(store.meals().dish[dish.id], undefined, "off the list");
  store.undo(undo);
  assert.equal(store.meals().box[box], undefined);
  assert.equal(store.meals().dish[dish.id].name, "Bun cha");
  assert.equal(store.dishToBox("nope"), "");
});

test("import also takes things to restock, matched by name", () => {
  const D = { ing: {}, box: {}, sup: { a: { id: "a", name: "Vitamin D", price: 20, n: 30, unit: "d", next: "2026-10-20" } } };
  const out = M.importRows(D, { sup: [{ name: "vitamin d", store: "Costco" }, { name: "Shampoo" }, { name: " " }] }, () => "new");
  assert.deepEqual(out.sup.map((x) => [x.id, x.store, x.price, x.unit]), [["a", "Costco", 20, "d"], ["new", "", 0, "m"]]);
});

test("from Friday the plan starts at next week", () => {
  assert.equal(M.planStart("2026-10-08"), W0, "Thursday: still this week");
  assert.equal(M.planStart("2026-10-09"), NEXT, "Friday: jump");
  assert.equal(M.planStart("2026-10-11"), NEXT, "Sunday, last day of a Monday week");
  assert.equal(M.planStart("2026-10-12"), NEXT, "Monday: it is this week now");
  // 一周从周日开始：周日到周四还是这周，周五、周六翻
  assert.equal(M.planStart("2026-10-08", "sunday"), "2026-10-04");
  assert.equal(M.planStart("2026-10-09", "sunday"), "2026-10-11");
  assert.equal(M.planStart("2026-10-10", "sunday"), "2026-10-11");
  assert.equal(M.planStart("2026-10-11", "sunday"), "2026-10-11");
});

// Big buys：一天合多少按买的那种钱算；用到今天，或者用到退役那天
const SHEET = ["Name\tCategory\tCurrency\tPrice\tPurchase\tRetired",
  "Sony A7M4\tCamera\tRMB\t21400\t2023/05/31\t", "Iphone 15\tPhone\tCAD\t1670\t2023/11/21\t", "Airpods Pro\tAudio\t\t500\t2023/08/01\t",
  "B&O A1\tAudio\tRMB\t1000\t2019/11/11\t2024/01/01"].join("\n");

test("big buys: days, per day in what you paid with, the other currency at the rate", () => {
  const T = "2026-10-19";
  const rows = M.parseGear(SHEET);
  assert.deepEqual(rows[0], { name: "Sony A7M4", cat: "Camera", cur: "cny", price: 21400, bought: "2023-05-31", retired: "" });
  assert.equal(rows[1].cur, "cad");
  assert.equal(rows[2].cur, "cny", "no currency: RMB");
  const sony = M.gearRow(rows[0], T, 5), phone = M.gearRow(rows[1], T, 5);
  assert.equal(sony.days, 1237);
  assert.equal(sony.perDay.toFixed(1), "17.3");
  close(sony.cad, 4280);
  assert.equal(phone.days, 1063);
  close(phone.cny, 8350);
  assert.equal(M.gearRow(rows[1], T, 5.2).cny, 1670 * 5.2, "rate is live");
  // 汇率对加币、可以是一个数也可以是 { cny }；旧的 rate 一格照样读；显示默认加币
  assert.deepEqual(M.gearRates({ rate: 4.81 }), { cad: 1, cny: 4.81 });
  assert.deepEqual(M.gearRates({ rate: 4.81, rates: { cny: 5.1 } }), { cad: 1, cny: 5.1 }, "the new field wins");
  assert.deepEqual(M.gearRates({}), { cad: 1, cny: 5 });
  close(M.convert(21400, "cny", "cad", { cny: 5 }), 4280);
  close(M.convert(1670, "cad", "cny", 5), 8350);
  assert.equal(M.gearShow({}), "cad");
  assert.equal(M.gearShow({ gearShow: "cny" }), "cny");
  assert.equal(M.gearShow({ gearShow: "eur" }), "cad", "unknown: CAD");
  close(M.gearRow(rows[0], T, { cny: 5 }).perDayCad, 21400 / 5 / 1237);
  const pods = M.gearRow(rows[2], T, 5);
  assert.ok(pods.cheap, "¥500 over 1175 days < ¥2 a day");
  assert.ok(!sony.cheap && !phone.cheap);
  assert.ok(M.gearRow({ cur: "cad", price: 100, bought: "2026-01-01" }, T, 5).cheap, "under $0.5 a day");
  const bo = M.gearRow(rows[3], T, 5);
  assert.ok(bo.retired && !bo.cheap, "retired: no hint");
  assert.equal(bo.days, 1512, "counted up to the day it was retired");
  assert.equal(phone.age, "three", "Nov 2023: within three years");
  assert.equal(sony.age, "", "May 2023: older than three years");
  assert.equal(M.gearRow({ bought: "2025-10-20" }, T).age, "year");
  assert.equal(M.gearRow({ bought: "2025-10-19" }, T).age, "three", "exactly 12 months ago: the dim one");
  const L = M.gearList({ gear: Object.fromEntries(rows.map((r, i) => [i, { ...r, id: String(i) }])) }, T, 5);
  assert.deepEqual(L.live.map((r) => r.g.name), ["Sony A7M4", "Iphone 15", "Airpods Pro"], "highest per day first");
  // 用户报的两处：Ultherapy $2,500 / 73 天（$34.2）要在 Sony ¥21,400 / 1237 天（¥17.3）上面；
  // Sennheiser ¥1,000 / 1719 天（¥0.6）要在 B&O ¥1,000 / 2534 天（¥0.4）上面——总价一样，按一天比
  const mine = { sony: { id: "sony", name: "Sony A7M4", cur: "cny", price: 21400, bought: "2023-05-31" }, ul: { id: "ul", name: "Ultherapy", cur: "cad", price: 2500, bought: "2026-08-07" },
    bo: { id: "bo", name: "B&O A1", cur: "cny", price: 1000, bought: "2019-11-11" }, se: { id: "se", name: "Sennheiser", cur: "cny", price: 1000, bought: "2022-02-03" },
    ap: { id: "ap", name: "Airpods Pro", cur: "cny", price: 500, bought: "2023-08-01" } };
  for (const r of [4.81, 5, 9]) assert.deepEqual(M.gearList({ gear: mine }, T, r).live.map((x) => x.g.name), ["Ultherapy", "Sony A7M4", "Sennheiser", "Airpods Pro", "B&O A1"], "AirPods ¥0.43 vs B&O ¥0.39: both show ¥0.4");
  assert.equal(M.gearEmoji(rows[0]), "📷", "category from the sheet, by name");
  assert.equal(M.gearTag({ cat: "phone" }), "phone");
  assert.equal(M.gearEmoji({ cat: "Tablet" }), "💻", "tablets and computers are one kind");
  assert.equal(M.gearTag({ cat: "tablet" }), "computer");
  assert.equal(M.gearTag({ cat: "Computer" }), "computer");
  assert.equal(M.gearEmoji({ cat: "beauty" }), "💅");
  assert.equal(M.gearEmoji({ cat: "speaker" }), "🔊");
  assert.equal(M.gearEmoji({ cat: "Drone" }), "🪐", "unknown: other");
  assert.deepEqual(L.gone.map((r) => r.g.name), ["B&O A1"]);
});

test("big buys: rows without a header read like the old sheet; pasting again updates by name", () => {
  const rows = M.parseGear("Sony A7M4\t4280\t1237\t21400\t2023/05/31\t17\nIpad Air5\t665\t847\t3325\t2024/06/24\t3");
  assert.deepEqual(rows.map((r) => [r.name, r.cur, r.price, r.bought]), [["Sony A7M4", "cny", 21400, "2023-05-31"], ["Ipad Air5", "cny", 3325, "2024-06-24"]]);
  const D = { gear: { a: { id: "a", name: "Sony A7M4", cat: "Camera", cur: "cny", price: 21400, bought: "2023-05-31", retired: "" } } };
  const out = M.importGear(D, [{ name: "sony a7m4", cat: "", cur: "cny", price: 0, bought: "", retired: "2026-10-01" }, { name: "Kindle", cat: "", cur: "cad", price: 140, bought: "2025-01-02", retired: "" }], () => "new");
  assert.deepEqual(out.map((r) => [r.id, r.cat, r.price, r.retired]), [["a", "Camera", 21400, "2026-10-01"], ["new", "", 140, ""]]);
  assert.deepEqual(M.parseGear(""), []);
});

test("big buys live in Settings rows like the rest of Meals", () => {
  store.importMeals({ gear: [{ id: "g1", name: "Sony A7M4", cat: "Camera", cur: "cny", price: 21400, bought: "2023-05-31", retired: "" }] });
  assert.ok(store.get("settings", "meal-gear:g1"));
  assert.equal(store.meals().gear.g1.name, "Sony A7M4");
});
