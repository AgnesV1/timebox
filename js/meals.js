// 备餐（Meals 页，只在电脑上）的纯计算：包装单位换算、一顿（Box）和一天（Day pack）的价格和热量、
// 打折一轮一轮的周期（这一轮看过没有、现在打不打折）、某周的购物单、之后几周的粗排。
// 数据从 store.meals() 来：{ ing, box, pack, week, days }，前四个是 id → 行，days 是 日期 → 那天吃什么。
// 这里不碰 store，测试直接喂数据。

import { addDays, diffDays, weekday, range } from "./dates.js";

// 包装上写的单位 → 基本单位：重量算 g，体积算 ml，按个数算 each
export const UNITS = {
  g: ["g", 1], kg: ["g", 1000], oz: ["g", 28.3495], lb: ["g", 453.592],
  ml: ["ml", 1], L: ["ml", 1000], "fl oz": ["ml", 29.5735], gal: ["ml", 3785.41],
  each: ["each", 1]
};
const unitRow = (ing) => UNITS[ing?.packUnit] || UNITS.each;
export const unitOf = (ing) => unitRow(ing)[0];
export const packSize = (ing) => (Number(ing?.packQty) || 0) * unitRow(ing)[1];

export const SLOTS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snack", "Snack"]];
export const EVERY = [0, 1, 2, 3, 4, 6, 8];   // 打折几周一轮；0 = 不追

export const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""));
export const byStore = (a, b) => (!a.store - !b.store) || String(a.store || "").localeCompare(String(b.store || "")) || byName(a, b);

// ---------- 价格、热量 ----------

// 这天在打折：填了打折价，日期落在 sale.from ~ sale.until 里
export function onSale(ing, date) {
  const s = ing?.sale;
  return Boolean(s && Number(s.price) > 0 && s.until && date <= s.until && (!s.from || date >= s.from));
}
export const packPrice = (ing, date) => (onSale(ing, date) ? Number(ing.sale.price) : Number(ing?.price) || 0);
// 1 g / 1 ml / 1 个 多少钱
export function perUnit(ing, date) {
  const n = packSize(ing);
  return n > 0 ? packPrice(ing, date) / n : 0;
}
export const partCost = (ing, qty, date) => (Number(qty) || 0) * perUnit(ing, date);
// 热量：g / ml 按每 100 算，each 按每个算
export const partKcal = (ing, qty) => ((Number(qty) || 0) * (Number(ing?.kcal) || 0)) / (unitOf(ing) === "each" ? 1 : 100);

export function boxTotals(D, box, date) {
  let kcal = 0, cost = 0;
  for (const p of box?.parts || []) {
    const ing = D.ing[p.ing];
    if (!ing) continue;
    kcal += partKcal(ing, p.qty);
    cost += partCost(ing, p.qty, date);
  }
  return { kcal, cost };
}

export function sumBoxes(D, ids, date) {
  let kcal = 0, cost = 0;
  for (const id of ids) {
    const t = boxTotals(D, D.box[id], date);
    kcal += t.kcal; cost += t.cost;
  }
  return { kcal, cost };
}

export const packBoxes = (D, pack) => (pack?.boxes || []).filter((id) => D.box[id]);
export const packTotals = (D, pack, date) => sumBoxes(D, packBoxes(D, pack), date);

// 某天吃的几顿：{pack} 用那个 Day pack；{boxes} 自己挑的；{off} 不做饭
export function boxesOfDay(D, entry) {
  if (!entry || entry.off) return [];
  return entry.pack ? packBoxes(D, D.pack[entry.pack]) : (entry.boxes || []).filter((id) => D.box[id]);
}

// ---------- 打折一轮一轮来 ----------

// 每 every 周一轮，from = 某一轮开始的那天。date 落在哪一轮
export function roundOf(ing, date) {
  const n = Number(ing?.every) || 0;
  if (n <= 0 || !ing.from) return null;
  const len = n * 7;
  const start = addDays(ing.from, Math.floor(diffDays(ing.from, date) / len) * len);
  return { start, end: addDays(start, len - 1), next: addDays(start, len) };
}

// sale = 正在打折；check = 这一轮还没看；checked = 这一轮看过、没打折；none = 不追
export function dealState(ing, date) {
  if (onSale(ing, date)) return "sale";
  const r = roundOf(ing, date);
  if (!r) return "none";
  return ing.checked && ing.checked >= r.start ? "checked" : "check";
}

export const toCheck = (D, date) => Object.values(D.ing).filter((i) => dealState(i, date) === "check").sort(byStore);
export const onSaleNow = (D, date) => Object.values(D.ing).filter((i) => onSale(i, date)).sort(byStore);

// from–to 之间开始新一轮的：两周以上一轮的才算「可能打折」（每周的传单每周都有，不列）
export function roundsIn(D, from, to) {
  const out = [];
  for (const ing of Object.values(D.ing)) {
    if ((Number(ing.every) || 0) < 2) continue;
    const r = roundOf(ing, from);
    if (!r) continue;
    const start = r.start >= from ? r.start : r.next;
    if (start <= to) out.push({ ing, start });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || byName(a.ing, b.ing));
}

// ---------- 周 ----------

export const daysOf = (start) => range(start, addDays(start, 6));

// 采购日（像 HelloFresh 的截单日）：这周第一天当天或之前、最近的那个星期几；这周单独改过就用改的
export function shopDate(start, shopDay, override) {
  if (override) return override;
  return addDays(start, -((weekday(start) - (Number(shopDay) || 0) + 7) % 7));
}

// 按天排的一周：每天几顿、热量、按采购日的价格算的花费
export function weekPlan(D, start, priceDate) {
  const days = daysOf(start).map((date) => {
    const entry = D.days[date] || null;
    const boxes = boxesOfDay(D, entry);
    return { date, entry, boxes, ...sumBoxes(D, boxes, priceDate) };
  });
  const planned = days.filter((d) => d.boxes.length);
  return {
    days,
    planned: planned.length,
    cost: planned.reduce((a, d) => a + d.cost, 0),
    kcal: planned.length ? planned.reduce((a, d) => a + d.kcal, 0) / planned.length : 0
  };
}

// 这周每天每顿的用量加起来
export function needs(D, start) {
  const need = {};
  for (const date of daysOf(start)) {
    for (const bid of boxesOfDay(D, D.days[date])) {
      for (const p of D.box[bid].parts || []) {
        if (D.ing[p.ing] && Number(p.qty) > 0) need[p.ing] = (need[p.ing] || 0) + Number(p.qty);
      }
    }
  }
  return need;
}

// 某周的购物单：用量按包装往上取整，按超市分；价格按采购日那天（在打折就用打折价）。
// 常备的（油盐）不买，只列出来提醒家里要有。got[id] = "bought" 买了 / "have" 家里还有（不算钱）。
// leftFrom：上周买的整包用剩多少（基本单位），够这周用就提示一句
export function shoppingList(D, start, priceDate, leftFrom = {}) {
  const got = D.week[start]?.got || {};
  const groups = new Map(), staples = [];
  let total = 0, count = 0, open = 0;
  for (const [id, qty] of Object.entries(needs(D, start))) {
    const ing = D.ing[id];
    if (ing.staple) { staples.push(ing); continue; }
    const size = packSize(ing);
    const packs = size > 0 ? Math.ceil(qty / size - 1e-9) : 0;
    const state = got[id] || "";
    const cost = state === "have" ? 0 : packs * packPrice(ing, priceDate);
    const row = { ing, qty, packs, cost, left: packs * size - qty, sale: onSale(ing, priceDate), state, carry: Number(leftFrom[id]) || 0 };
    const key = String(ing.store || "").trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
    total += cost; count++;
    if (!state) open++;
  }
  const list = [...groups.entries()].map(([store, items]) => ({ store, items: items.sort((a, b) => byName(a.ing, b.ing)), cost: items.reduce((a, r) => a + r.cost, 0) }))
    .sort((a, b) => (!a.store - !b.store) || a.store.localeCompare(b.store));
  return { groups: list, total, count, open, staples: staples.sort(byName) };
}

// 上周的单子里每样用剩多少（真买了的整包、这周还能接着用的）：勾了买了的，或者整周标了已采购
export function leftovers(list, shopped = false) {
  const out = {};
  for (const g of list.groups) for (const r of g.items) if (r.left > 0 && (r.state === "bought" || (shopped && r.state !== "have"))) out[r.ing.id] = r.left;
  return out;
}

// ---------- 之后几周：只排「Day A × 3」，不排哪天 ----------

export function roughTotals(D, w, priceDate) {
  let days = 0, cost = 0, kcal = 0;
  for (const r of w?.rough || []) {
    const n = Number(r.n) || 0;
    if (!D.pack[r.pack] || n <= 0) continue;
    const t = packTotals(D, D.pack[r.pack], priceDate);
    days += n; cost += t.cost * n; kcal += t.kcal * n;
  }
  return { days, cost, kcal: days ? kcal / days : 0 };
}

// 粗排里还没排到具体哪天的（已经放了同一个 Day pack 的日子先抵掉）
export function roughLeft(D, start, w) {
  const queue = [];
  for (const r of w?.rough || []) if (D.pack[r.pack]) for (let i = 0; i < (Number(r.n) || 0); i++) queue.push(r.pack);
  for (const date of daysOf(start)) {
    const i = queue.indexOf(D.days[date]?.pack);
    if (i >= 0) queue.splice(i, 1);
  }
  return queue;
}

// 粗排变细排：按顺序把剩下的 Day pack 填进还空着的日子（标了不做饭的也算占着）。返回 日期 → {pack}
export function fillFromRough(D, start, w, from = start) {
  const queue = roughLeft(D, start, w), out = {};
  for (const date of daysOf(start)) {
    if (!queue.length) break;
    if (date < from || D.days[date]) continue;
    out[date] = { pack: queue.shift() };
  }
  return out;
}

// ---------- 显示 ----------

const trim = (v, d = 1) => String(Math.round(v * 10 ** d) / 10 ** d);

export function fmtQty(qty, unit) {
  const v = Number(qty) || 0;
  if (unit === "each") return trim(v) + " ea";
  if (v >= 1000) return trim(v / 1000, 2) + (unit === "g" ? " kg" : " L");
  return Math.round(v) + " " + unit;
}

export function packLabel(ing) {
  const q = Number(ing?.packQty) || 0;
  if (unitOf(ing) === "each") return q === 1 ? "each" : trim(q, 2) + " ct";
  return trim(q, 2) + " " + (ing.packUnit || "");
}

// 单价：按包装上用的单位习惯（lb / oz 包装就按每磅）
export function unitPrice(ing, date) {
  const u = perUnit(ing, date), pu = ing?.packUnit;
  if (!u) return null;
  if (unitOf(ing) === "g") return pu === "lb" || pu === "oz" ? { v: u * 453.592, per: "lb" } : { v: u * 1000, per: "kg" };
  if (unitOf(ing) === "ml") return pu === "gal" ? { v: u * 3785.41, per: "gal" } : pu === "fl oz" ? { v: u * 29.5735, per: "fl oz" } : { v: u * 1000, per: "L" };
  return { v: u, per: "ea" };
}

// ---------- 例子：北美超市、大概的价格（美元）和热量（USDA 的大概数），id 都以 ex- 开头，一键能删 ----------

export function examples(today, weekStart, D = { days: {}, week: {} }) {
  const lastWed = addDays(today, -((weekday(today) - 3 + 7) % 7));
  const ing = [
    ["chicken", "Chicken breast", "Safeway", 3, "lb", 11.97, 120, { every: 4, from: addDays(today, -18), checked: addDays(today, -18) }],
    ["eggs", "Eggs, large", "Safeway", 12, "each", 3.99, 72, { every: 1, from: lastWed }],
    ["sweetpotato", "Sweet potatoes", "Safeway", 3, "lb", 3.99, 86],
    ["beans", "Black beans, canned", "Safeway", 15, "oz", 1.29, 91],
    ["pepper", "Bell pepper", "Safeway", 1, "each", 1.29, 37],
    ["yogurt", "Greek yogurt, plain", "Costco", 48, "oz", 6.49, 59, { every: 4, from: addDays(today, -3), checked: addDays(today, -3), sale: { price: 4.99, from: addDays(today, -3), until: addDays(today, 12) } }],
    ["salmon", "Salmon fillet", "Costco", 3, "lb", 29.99, 208, { every: 4, from: addDays(today, -6) }],
    ["berries", "Frozen mixed berries", "Costco", 4, "lb", 13.99, 50],
    ["oil", "Olive oil", "Costco", 2, "L", 17.99, 810, { staple: true }],
    ["rice", "Brown rice (dry)", "Trader Joe's", 2, "lb", 3.49, 367],
    ["oats", "Rolled oats", "Trader Joe's", 2, "lb", 3.29, 379],
    ["broccoli", "Broccoli florets", "Trader Joe's", 12, "oz", 2.99, 34],
    ["spinach", "Baby spinach", "Trader Joe's", 6, "oz", 2.49, 23],
    ["tortilla", "Whole wheat tortillas", "Trader Joe's", 8, "each", 2.99, 130],
    ["pb", "Peanut butter", "Trader Joe's", 16, "oz", 2.99, 588],
    ["banana", "Banana", "Trader Joe's", 1, "each", 0.23, 105]
  ].map(([id, name, store, packQty, packUnit, price, kcal, more]) => ({ id: "ex-" + id, name, store, packQty, packUnit, price, kcal, staple: false, every: 0, from: "", checked: "", sale: null, ...(more || {}) }));
  const part = (i, qty) => ({ ing: "ex-" + i, qty });
  const box = [
    ["oats", "Oats & berries", "breakfast", [part("oats", 50), part("yogurt", 150), part("berries", 80), part("pb", 16)]],
    ["wrap", "Egg & spinach wrap", "breakfast", [part("eggs", 3), part("spinach", 40), part("tortilla", 1), part("oil", 5)]],
    ["bowl", "Chicken rice bowl", "lunch", [part("chicken", 150), part("rice", 75), part("broccoli", 120), part("oil", 5)]],
    ["salmon", "Salmon & sweet potato", "dinner", [part("salmon", 140), part("sweetpotato", 200), part("spinach", 50), part("oil", 5)]],
    ["burrito", "Burrito bowl", "dinner", [part("chicken", 120), part("beans", 120), part("rice", 60), part("pepper", 1)]],
    ["snack", "Banana & peanut butter", "snack", [part("banana", 1), part("pb", 16)]]
  ].map(([id, name, slot, parts]) => ({ id: "ex-" + id, name, slot, parts, note: "" }));
  const pack = [
    { id: "ex-a", name: "Day A", boxes: ["ex-oats", "ex-bowl", "ex-salmon", "ex-snack"] },
    { id: "ex-b", name: "Day B", boxes: ["ex-wrap", "ex-bowl", "ex-burrito"] }
  ];
  // 下周按天排上（空着的日子才放）；再下周粗排一下
  const next = addDays(weekStart, 7), later = addDays(weekStart, 14);
  const week = [];
  const days = {};
  daysOf(next).forEach((d, i) => { if (!D.days[d]) days[d] = { pack: i % 2 ? "ex-b" : "ex-a" }; });
  if (Object.keys(days).length) week.push({ ...(D.week[next] || {}), id: next, days: { ...(D.week[next]?.days || {}), ...days } });
  if (!D.week[later]?.rough?.length) week.push({ ...(D.week[later] || {}), id: later, rough: [{ pack: "ex-a", n: 4 }, { pack: "ex-b", n: 3 }], note: D.week[later]?.note || "Costco run" });
  return { ing, box, pack, week };
}
