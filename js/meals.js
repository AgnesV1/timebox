// 备餐（Meals 页）的纯计算。不记克数、不算卡路里数字：
//   常买的东西：一次买多少钱、够吃几天（几天份）、热量低中高（Low 菜和水果 / Mid 正常 / High 油炸、肥的、甜的）、打折几周一轮
//   一个 Box = 一顿 = 几样东西（用量随便写）；Box 有多「重」= 最重的那样，一半以上是 Low 就降一级；也可以手动定
//   每天直接放几个 Box；每周 High 的 Box 有个限额（分配，不是算数）
//   东西分类（肉 / 菜 / 碳水 / 常驻 / 零食）；Box 里可以放「随便哪种肉」（Any meat）：买的时候再挑，等级和价钱按这一类估
//   购物单：这周哪几天要用到某样东西 ÷ 一次买够几天 = 买几次；之前勾了「买了」的会往后顶掉几天（米这种一买吃一个月的不会每周都出现）
//   Restock：规律要换 / 要补的非食物（维生素、牙刷头、手机）：价格 + 周期 + 下次哪天，按月看接下来要花的钱
// 数据从 store.meals() 来：{ ing, box, week, days }，days 是 日期 → {boxes} / {off}。这里不碰 store，测试直接喂数据。

import { addDays, addMonths, daysInMonth, diffDays, startOfMonth, weekday, range, MONTHS } from "./dates.js";

export const SLOTS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snack", "Snack"]];
export const LEVELS = [["low", "Low", "veg, fruit"], ["mid", "Mid", "normal: grains, lean meat, dairy"], ["high", "High", "fried, fatty, sweet"]];
export const EVERY = [0, 1, 2, 3, 4, 6, 8];   // 打折几周一轮；0 = 不追
export const STORES = ["Longo's", "Farm Boy", "Dodo", "T&T", "Eataly", "Loblaws", "Costco", "IKEA"];
export const CATS = [["meat", "Meat"], ["veg", "Veg"], ["carb", "Carb"], ["basic", "Basics"], ["snack", "Snack"]];   // 没分类的 = Other（调料这些）
export const ANY = { meat: "mid", veg: "low", carb: "mid", snack: "mid" };   // 能放「随便哪种」的类别 → 算哪一档
const RANK = { low: 1, mid: 2, high: 3 };
const BY_RANK = ["", "low", "mid", "high"];

export const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""));
export const byStore = (a, b) => (!a.store - !b.store) || String(a.store || "").localeCompare(String(b.store || "")) || byName(a, b);
export const levelName = (lv) => (LEVELS.find(([k]) => k === lv) || LEVELS[1])[1];
export const catName = (c) => (CATS.find(([k]) => k === c) || ["", "Other"])[1];

// ---------- 常买的东西 ----------

export const levelOf = (ing) => (RANK[ing?.level] ? ing.level : "mid");
export const lastsOf = (ing) => Math.max(1, Math.round(Number(ing?.lasts) || 7));   // 没填 = 一周一次

// 这天在打折：填了打折价，日期落在 sale.from ~ sale.until 里
export function onSale(ing, date) {
  const s = ing?.sale;
  return Boolean(s && Number(s.price) > 0 && s.until && date <= s.until && (!s.from || date >= s.from));
}
export const buyPrice = (ing, date) => (onSale(ing, date) ? Number(ing.sale.price) : Number(ing?.price) || 0);
// 吃一天份大概多少钱：一次买的钱 ÷ 够吃几天
export const useCost = (ing, date) => buyPrice(ing, date) / lastsOf(ing);

// ---------- 一顿（Box） ----------

// 「随便哪种肉」当成一样东西：一天份一买，价钱 = 这一类平均一天份多少钱
export const anyId = (cat) => "any:" + cat;
export function anyIng(D, cat, date) {
  if (!ANY[cat]) return null;
  const list = Object.values(D.ing).filter((i) => i.cat === cat);
  const price = list.length ? list.reduce((a, i) => a + useCost(i, date), 0) / list.length : 0;
  return { id: anyId(cat), any: cat, name: "Any " + catName(cat).toLowerCase(), store: "", price, lasts: 1, level: ANY[cat] };
}
// Box 里的一样：具体的东西 {ing}，或者某一类随便哪种 {any}
export const partIng = (D, p, date) => (p?.any ? anyIng(D, p.any, date) : D.ing[p?.ing] || null);
const ingById = (D, id, date) => (id.startsWith("any:") ? anyIng(D, id.slice(4), date) : D.ing[id] || null);

// 最重的那样定调；一半以上是 Low 就降一级；常备的（油盐）不算；手动选了就用手动的
export function autoLevel(D, box) {
  const ranks = (box?.parts || []).map((p) => partIng(D, p)).filter((i) => i && !i.staple).map((i) => RANK[levelOf(i)]);
  if (!ranks.length) return "mid";
  const top = Math.max(...ranks), lows = ranks.filter((r) => r === 1).length;
  return BY_RANK[top > 1 && lows * 2 >= ranks.length ? top - 1 : top];
}
export const boxLevel = (D, box) => (RANK[box?.level] ? box.level : autoLevel(D, box));

export function boxCost(D, box, date) {
  let cost = 0;
  for (const p of box?.parts || []) { const i = partIng(D, p, date); if (i) cost += useCost(i, date); }
  return cost;
}

// 几个 Box 加起来：花多少、低中高各几个
export function sumBoxes(D, ids, date) {
  const levels = { low: 0, mid: 0, high: 0 };
  let cost = 0;
  for (const id of ids) {
    cost += boxCost(D, D.box[id], date);
    levels[boxLevel(D, D.box[id])]++;
  }
  return { cost, levels };
}

export function boxesOfDay(D, entry) {
  if (!entry || entry.off) return [];
  return (entry.boxes || []).filter((id) => D.box[id]);
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

// 采购日（像 meal kit 的截单日）：这周第一天当天或之前、最近的那个星期几；这周单独改过就用改的
export function shopDate(start, shopDay, override) {
  if (override) return override;
  return addDays(start, -((weekday(start) - (Number(shopDay) || 0) + 7) % 7));
}

// 按天排的一周：每天几个 Box、花多少（按采购日的价格）、低中高各几个
export function weekPlan(D, start, priceDate) {
  const levels = { low: 0, mid: 0, high: 0 };
  const days = daysOf(start).map((date) => {
    const entry = D.days[date] || null;
    const boxes = boxesOfDay(D, entry);
    const t = sumBoxes(D, boxes, priceDate);
    for (const k in levels) levels[k] += t.levels[k];
    return { date, entry, boxes, ...t };
  });
  const planned = days.filter((d) => d.boxes.length);
  return { days, planned: planned.length, cost: planned.reduce((a, d) => a + d.cost, 0), levels };
}

// ---------- 购物单 ----------

// 每样东西哪几天要用（一天里用几次也只算一天），日期从早到晚
export function usage(D) {
  const out = {};
  for (const [date, entry] of Object.entries(D.days)) {
    const seen = new Set();
    for (const bid of boxesOfDay(D, entry)) for (const p of D.box[bid].parts || []) {
      if (p.any ? ANY[p.any] : D.ing[p.ing]) seen.add(p.any ? anyId(p.any) : p.ing);
    }
    for (const id of seen) (out[id] = out[id] || []).push(date);
  }
  for (const k in out) out[k].sort();
  return out;
}

// 别的周里买过 / 家里还有的：{ id: [{ date, start, n, have }] }
function buyEvents(D, shopDay, except) {
  const out = {};
  for (const w of Object.values(D.week)) {
    if (w.id === except) continue;
    const date = shopDate(w.id, shopDay, w.shopOn);
    for (const [id, g] of Object.entries(w.got || {})) {
      const ev = g === "have" ? { date, start: w.id, have: true } : { date, start: w.id, n: Math.max(1, Number(g?.n) || 1) };
      (out[id] = out[id] || []).push(ev);
    }
  }
  for (const k in out) out[k].sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// 已经有着落的那几天：买一次够吃 lasts 天，从买的那天往后数要用的日子；「家里还有」顶那一周
function covered(dates, events, lasts) {
  const done = new Set();
  for (const ev of events) {
    if (ev.have) { const end = addDays(ev.start, 6); for (const d of dates) if (d >= ev.start && d <= end) done.add(d); continue; }
    let left = lasts * ev.n;
    for (const d of dates) {
      if (left <= 0) break;
      if (d < ev.date || done.has(d)) continue;
      done.add(d);
      left--;
    }
  }
  return done;
}

// 某周的购物单（from 之前的日子不算，比如这周已经过了几天）。每样：买几次、多少钱（采购日在打折就按打折价）。
// notes[id] = 这一次采购给这样东西写的备注（「蔬菜」这次买哪几种、Any meat 买什么）；
// got[id] = {n} 买了几次 / "have" 家里还有（不算钱）；extra[id] = 手动加的几次。常备的（油盐）只提醒，不进单子；
// 一直要有的（keep：牛奶、鸡蛋）每天都算要用，排没排 Box 都会按「够吃几天」回到单子上
export function shopList(D, start, shopDay, from = start) {
  const w = D.week[start] || {};
  const shop = shopDate(start, shopDay, w.shopOn), end = addDays(start, 6);
  const use = usage(D), events = buyEvents(D, shopDay, start);
  const got = w.got || {}, extra = w.extra || {};
  const groups = new Map(), staples = [];
  let total = 0, count = 0, open = 0;
  const keeps = Object.values(D.ing).filter((i) => i.keep).map((i) => i.id);
  for (const id of new Set([...Object.keys(use), ...Object.keys(extra), ...keeps])) {
    const ing = ingById(D, id, shop);
    if (!ing) continue;
    const lasts = lastsOf(ing), evs = events[id] || [];
    const first = evs.reduce((a, ev) => [a, ev.date, ev.start].sort()[0], from);
    const dates = ing.keep ? range(first, end) : use[id] || [];
    const cov = covered(dates, evs, lasts);
    const uses = dates.filter((d) => d >= from && d <= end && !cov.has(d)).length;
    const add = Math.max(0, Math.round(Number(extra[id]) || 0));
    const g = got[id];
    const state = g === "have" ? "have" : g ? "bought" : "";
    const hand = ing.staple && !ing.keep;
    if (hand && !add && state !== "bought") { if (uses) staples.push(ing); continue; }   // 常备的：家里本来就有，手动加了才买
    const n = state === "bought" && Number(g.n) > 0 ? Number(g.n) : (hand ? 0 : Math.ceil(uses / lasts)) + add;
    if (!n) continue;
    const cost = state === "have" ? 0 : n * buyPrice(ing, shop);
    const key = String(ing.store || "").trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ing, n, uses, extra: add, cost, sale: onSale(ing, shop), state, note: String((w.notes || {})[id] || "") });
    total += cost; count++;
    if (!state) open++;
  }
  const list = [...groups.entries()].map(([store, items]) => ({ store, items: items.sort((a, b) => byName(a.ing, b.ing)), cost: items.reduce((a, r) => a + r.cost, 0) }))
    .sort((a, b) => (!a.store - !b.store) || a.store.localeCompare(b.store));
  return { start, shop, from, groups: list, total, count, open, staples: staples.sort(byName) };
}

// 下次去买：这周和下周里第一个还没买（没标 Shopped、没跳过）的；这周剩下的日子什么都不缺就看下周
export function nextShop(D, today, w0, shopDay) {
  for (const start of [w0, addDays(w0, 7)]) {
    const w = D.week[start] || {};
    if (w.skip || w.shopped) continue;
    const list = shopList(D, start, shopDay, start < today ? today : start);
    if (list.count || start !== w0) return list;
  }
  return null;
}

// ---------- 之后几周：只排「哪个 Box × 几次」，不排哪天 ----------

export function roughTotals(D, w, priceDate) {
  const levels = { low: 0, mid: 0, high: 0 };
  let meals = 0, cost = 0;
  for (const r of w?.rough || []) {
    const n = Number(r.n) || 0, b = D.box[r.box];
    if (!b || n <= 0) continue;
    meals += n; cost += boxCost(D, b, priceDate) * n; levels[boxLevel(D, b)] += n;
  }
  return { meals, cost, levels };
}

// 粗排里还没放到具体哪天的（这周已经放了的先抵掉）
export function roughLeft(D, start, w) {
  const queue = [];
  for (const r of w?.rough || []) if (D.box[r.box]) for (let i = 0; i < (Number(r.n) || 0); i++) queue.push(r.box);
  for (const date of daysOf(start)) for (const id of boxesOfDay(D, D.days[date])) {
    const i = queue.indexOf(id);
    if (i >= 0) queue.splice(i, 1);
  }
  return queue;
}

// 粗排变细排：还空着的日子（from 之后、没标不做饭），按早中晚各放一个；没标哪顿的补到一天 3 个。返回 日期 → {boxes}
export function fillFromRough(D, start, w, from = start) {
  const bySlot = {};
  for (const id of roughLeft(D, start, w)) (bySlot[D.box[id].slot || ""] = bySlot[D.box[id].slot || ""] || []).push(id);
  const out = {};
  for (const date of daysOf(start)) {
    if (date < from || D.days[date]) continue;
    const day = [];
    for (const [s] of SLOTS) if (bySlot[s]?.length) day.push(bySlot[s].shift());
    while (day.length < 3 && bySlot[""]?.length) day.push(bySlot[""].shift());
    if (!day.length) break;
    out[date] = { boxes: day };
  }
  return out;
}

// ---------- 规律要换 / 要补的东西（Restock） ----------
// 一样：{ name, store, price, n, unit, next }：每 n 个 unit（天 / 周 / 月 / 年）一次，next = 下次预计哪天

export const CYCLES = [["d", "day"], ["w", "week"], ["m", "month"], ["y", "year"]];
const cycleN = (s) => Math.max(0, Math.round(Number(s?.n) || 0));
export function cycleText(s) {
  const n = cycleN(s), unit = (CYCLES.find(([k]) => k === s?.unit) || CYCLES[2])[1];
  return n ? "every " + (n === 1 ? unit : n + " " + unit + "s") : "";
}

// 往后 n 个月的同一天（31 号遇到小月就落在月底）
function plusMonths(date, n) {
  const first = addMonths(date, n);
  return first.slice(0, 8) + String(Math.min(Number(date.slice(8)), daysInMonth(first))).padStart(2, "0");
}

// 从 date 往后一个周期；没填周期就没有下一次
export function nextAfter(date, s) {
  const n = cycleN(s);
  if (!n || !date) return "";
  return s.unit === "d" ? addDays(date, n) : s.unit === "w" ? addDays(date, 7 * n) : plusMonths(date, s.unit === "y" ? 12 * n : n);
}

// 接下来几个月（这个月算第一个）要花钱的：过期的单列（当成今天换，再往后推）；周期短的一样会出现好几次
export function coming(D, today, months = 3) {
  const first = startOfMonth(today), end = addDays(addMonths(first, months), -1);
  const out = { overdue: [], months: [] };
  for (let i = 0; i < months; i++) {
    const m = addMonths(first, i);
    out.months.push({ key: m.slice(0, 7), label: MONTHS[Number(m.slice(5, 7)) - 1], total: 0, items: [] });
  }
  for (const sup of Object.values(D.sup || {})) {
    let date = sup.next;
    if (!date) continue;
    if (date < today) { out.overdue.push({ sup, date }); date = nextAfter(today, sup); }
    for (let k = 0; date && date <= end && k < 36; k++, date = nextAfter(date, sup)) {
      const m = out.months.find((x) => x.key === date.slice(0, 7));
      if (m) { m.items.push({ sup, date }); m.total += Number(sup.price) || 0; }
    }
  }
  const byDate = (a, b) => a.date.localeCompare(b.date) || byName(a.sup, b.sup);
  out.overdue.sort(byDate);
  for (const m of out.months) m.items.sort(byDate);
  return out;
}

// ---------- 导入一份清单（核对表里整理好的）：按名字对，已经有的更新、没有的新加；Box 里的东西也按名字找 ----------

const ING_FIELDS = ["store", "price", "lasts", "level", "cat", "keep", "staple", "every", "from", "checked", "sale"];
const BOX_FIELDS = ["slot", "level", "note"];
const SUP_FIELDS = ["store", "price", "n", "unit", "next", "note"];
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const pick = (r, fields) => Object.fromEntries(fields.filter((f) => r[f] !== undefined).map((f) => [f, r[f]]));

export function importRows(D, payload, newId) {
  const names = new Map(Object.values(D.ing).map((i) => [norm(i.name), i]));
  const ing = [];
  for (const r of payload?.ing || []) {
    const name = String(r?.name || "").trim(), old = names.get(norm(name));
    if (!name) continue;
    const row = { store: "", price: 0, lasts: "", level: "mid", cat: "", keep: false, staple: false, every: 0, from: "", checked: "", sale: null, ...(old || {}), ...pick(r, ING_FIELDS), name, id: old?.id || newId() };
    names.set(norm(name), row);
    ing.push(row);
  }
  const boxes = new Map(Object.values(D.box).map((b) => [norm(b.name), b]));
  const box = [];
  for (const r of payload?.box || []) {
    const name = String(r?.name || "").trim(), old = boxes.get(norm(name));
    if (!name) continue;
    const parts = (r.parts || []).map((p) => (p?.any ? { any: p.any, amt: p.amt || "" } : { ing: names.get(norm(p?.ing))?.id || "", amt: p?.amt || "" })).filter((p) => (p.any ? ANY[p.any] : p.ing));
    const row = { slot: "", level: "", note: "", ...(old || {}), ...pick(r, BOX_FIELDS), name, parts, id: old?.id || newId() };
    boxes.set(norm(name), row);
    box.push(row);
  }
  const sups = new Map(Object.values(D.sup || {}).map((s) => [norm(s.name), s]));
  const sup = [];
  for (const r of payload?.sup || []) {
    const name = String(r?.name || "").trim(), old = sups.get(norm(name));
    if (!name) continue;
    const row = { store: "", price: 0, n: "", unit: "m", next: "", note: "", ...(old || {}), ...pick(r, SUP_FIELDS), name, id: old?.id || newId() };
    sups.set(norm(name), row);
    sup.push(row);
  }
  return { ing, box, sup };
}

// ---------- 例子：多伦多常去的超市、大概的价格（加元），id 都以 ex- 开头，一键能删 ----------

export function examples(today, weekStart, D = { days: {}, week: {} }) {
  const last = (wd) => addDays(today, -((weekday(today) - wd + 7) % 7));   // 最近一个星期几（传单开始那天）
  const ing = [
    ["chicken", "Chicken breast", "Loblaws", 13.99, 3, "mid", { every: 1, from: last(4), checked: last(4) }],
    ["eggs", "Eggs, dozen", "Loblaws", 4.49, 4, "mid", { every: 1, from: last(4) }],
    ["yogurt", "Greek yogurt", "Farm Boy", 6.99, 5, "mid", { every: 4, from: addDays(today, -3), checked: addDays(today, -3), sale: { price: 5.49, from: addDays(today, -3), until: addDays(today, 12) } }],
    ["spinach", "Baby spinach", "Farm Boy", 4.99, 3, "low"],
    ["broccoli", "Broccoli", "Farm Boy", 2.99, 2, "low"],
    ["salmon", "Salmon fillet", "Longo's", 15.99, 2, "mid", { every: 4, from: addDays(today, -6) }],
    ["berries", "Frozen berries", "Longo's", 7.99, 7, "low"],
    ["oats", "Rolled oats", "Longo's", 4.99, 14, "mid"],
    ["rice", "Jasmine rice, 8 lb", "T&T", 12.99, 30, "mid"],
    ["bokchoy", "Baby bok choy", "T&T", 2.99, 2, "low"],
    ["dumplings", "Frozen dumplings", "T&T", 8.99, 4, "high", { every: 2, from: addDays(today, -9), checked: addDays(today, -9) }],
    ["banana", "Bananas", "Dodo", 1.49, 5, "low"],
    ["pasta", "Fresh pasta", "Eataly", 8.5, 2, "mid"],
    ["pesto", "Pesto", "Eataly", 9.9, 4, "high"],
    ["oil", "Olive oil", "Eataly", 19.9, 60, "high", { staple: true }]
  ].map(([id, name, store, price, lasts, level, more]) => ({ id: "ex-" + id, name, store, price, lasts, level, staple: false, every: 0, from: "", checked: "", sale: null, ...(more || {}) }));
  const part = (i, amt) => ({ ing: "ex-" + i, amt });
  const box = [
    ["oats", "Oats & berries", "breakfast", [part("oats", "½ cup"), part("yogurt", "¾ cup"), part("berries", "a handful")]],
    ["eggs", "Egg & spinach scramble", "breakfast", [part("eggs", "3"), part("spinach", "2 handfuls"), part("oil", "1 tsp")]],
    ["bowl", "Chicken rice bowl", "lunch", [part("chicken", "1 breast"), part("rice", "1 cup cooked"), part("broccoli", "1 cup")]],
    ["salmon", "Salmon & bok choy", "dinner", [part("salmon", "1 fillet"), part("bokchoy", "2 heads"), part("rice", "1 cup cooked")]],
    ["dumplings", "Pan-fried dumplings", "dinner", [part("dumplings", "10"), part("bokchoy", "1 head"), part("oil", "1 tbsp")]],
    ["pasta", "Pesto pasta", "dinner", [part("pasta", "½ pack"), part("pesto", "2 tbsp"), part("spinach", "a handful")]],
    ["banana", "Banana", "snack", [part("banana", "1")]]
  ].map(([id, name, slot, parts]) => ({ id: "ex-" + id, name, slot, level: "", parts, note: "" }));
  // 下周按天排上（空着的日子才放）；再下周粗排一下
  const next = addDays(weekStart, 7), later = addDays(weekStart, 14);
  const plan = [["oats", "bowl", "salmon", "banana"], ["eggs", "bowl", "dumplings"], ["oats", "bowl", "salmon"], ["eggs", "bowl", "pasta"], ["oats", "bowl", "dumplings", "banana"], ["eggs", "pasta"], null];
  const days = {};
  daysOf(next).forEach((d, i) => { if (!D.days[d]) days[d] = plan[i] ? { boxes: plan[i].map((b) => "ex-" + b) } : { off: true }; });
  const week = [];
  if (Object.keys(days).length) week.push({ ...(D.week[next] || {}), id: next, days: { ...(D.week[next]?.days || {}), ...days } });
  if (!D.week[later]?.rough?.length) {
    week.push({ ...(D.week[later] || {}), id: later, note: D.week[later]?.note || "T&T run",
      rough: [["oats", 4], ["eggs", 3], ["bowl", 5], ["salmon", 2], ["dumplings", 2], ["pasta", 1]].map(([b, n]) => ({ box: "ex-" + b, n })) });
  }
  return { ing, box, week };
}
