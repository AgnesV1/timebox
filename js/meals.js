// 备餐（Meals 页）的纯计算。不记克数、不算卡路里数字：
//   常买的东西：一次买多少钱、够吃几天（几天份）、热量低中高（Low 菜和水果 / Mid 正常 / High 油炸、肥的、甜的）、打折几周一轮
//   一个 Box = 一顿 = 几样东西（用量随便写）；Box 有多「重」= 最重的那样，一半以上是 Low 就降一级；也可以手动定
//   每天直接放几个 Box；每周 High 的 Box 有个限额（分配，不是算数）
//   东西分类（肉 / 菜 / 碳水 / 常驻 / 零食）；Box 里可以放「随便哪种肉」（Any meat）：买的时候再挑，等级和价钱按这一类估
//   购物单：这周哪几天要用到某样东西 ÷ 一次买够几天 = 买几次；之前勾了「买了」的会往后顶掉几天（米这种一买吃一个月的不会每周都出现）
//   To try：在外面吃过、想自己做的菜，分「打算做成 Box 的」和「只试一次的」（见下面 toTry）
//   Restock：规律要换 / 要补的非食物（维生素、牙刷头、手机）：价格 + 周期 + 下次哪天，按月看接下来要花的钱；每样一个 emoji 记号，能筛
// 数据从 store.meals() 来：{ ing, box, week, days }，days 是 日期 → {boxes} / {off}。这里不碰 store，测试直接喂数据。

import { addDays, addMonths, daysInMonth, diffDays, startOfMonth, startOfWeek, weekday, range, MONTHS } from "./dates.js";

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

// 排餐从哪一周看起：平时是这一周；到了这周的周五就翻到下一周——剩下那两三天不用再排、再买了。
// today 已经按「一天从几点开始」算过，所以默认是周五凌晨 4 点翻
export function planStart(today, weekStartsOn = "monday") {
  const w0 = startOfWeek(today, weekStartsOn);
  const friday = (5 - weekday(w0) + 7) % 7;
  return diffDays(w0, today) >= friday ? addDays(w0, 7) : w0;
}

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
    groups.get(key).push({ ing, n, uses, extra: add, cost, sale: onSale(ing, shop), state });
    total += cost; count++;
    if (!state) open++;
  }
  const list = [...groups.entries()].map(([store, items]) => ({ store, items: items.sort((a, b) => byName(a.ing, b.ing)), cost: items.reduce((a, r) => a + r.cost, 0) }))
    .sort((a, b) => (!a.store - !b.store) || a.store.localeCompare(b.store));
  return { start, shop, from, groups: list, total, count, open, staples: staples.sort(byName) };
}

// 这一次采购的备注：一个大框（week.memo），标了 Shopped 就清掉。
// 以前是每样东西各写一条（notes[id]）：还没改过的，先拼成「名字: 备注」一行一条给大框
export function shopMemo(D, w) {
  if (typeof w?.memo === "string") return w.memo;
  return Object.entries(w?.notes || {}).filter(([, text]) => String(text || "").trim())
    .map(([id, text]) => { const name = ingById(D, id)?.name; return (name ? name + ": " : "") + String(text).trim(); }).join("\n");
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

// ---------- To try：在外面吃过、想自己做的菜（Boxes 页底下） ----------
// 一道：{ name, note, kind, from, date, taskId, order }。两种：box = 打算做成备餐的 Box；once = 只试一次（没写就算这种）

export const DISH_KINDS = [["box", "For meal prep"], ["once", "Try once"]];
export const dishKind = (d) => (d?.kind === "box" ? "box" : "once");

// → { box: [...], once: [...] }，新加的在前
export function toTry(D) {
  const all = Object.values(D.dish || {}).sort((x, y) => (Number(y.order) || 0) - (Number(x.order) || 0) || byName(x, y));
  return { box: all.filter((d) => dishKind(d) === "box"), once: all.filter((d) => dishKind(d) === "once") };
}

// 某条任务记过的那几道（照记的先后）
export const dishesOf = (D, taskId) => (taskId ? Object.values(D.dish || {}).filter((d) => d.taskId === taskId).sort((x, y) => (Number(x.order) || 0) - (Number(y.order) || 0)) : []);

// 打进来 / 粘进来的几行 → [{ name, note }]：一行一道，行首的 - • 1. 去掉；「菜名 — 备注」「菜名：备注」拆开；
// 清单里已经有的（不分大小写）、这次重复的不再加
export function parseDishes(text, have = []) {
  const key = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
  const seen = new Set(have.map((d) => key(d.name)));
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-•*·]|\d+[.)、])\s*/, "").trim();
    if (!line) continue;
    const m = /^(.+?)(?:\s+[—–-]\s+|\s*[:：]\s*)(.+)$/.exec(line);
    const name = (m ? m[1] : line).trim(), note = m ? m[2].trim() : "";
    if (!name || seen.has(key(name))) continue;
    seen.add(key(name));
    out.push({ name, note });
  }
  return out;
}

// ---------- 规律要换 / 要补的东西（Restock） ----------
// 一样：{ name, store, price, n, unit, next }：每 n 个 unit（天 / 周 / 月 / 年）一次，next = 下次预计哪天
// 也有只买一次的（once: true，比如一条裙子）：没有周期，next = 打算哪天之前买（可以不填），买了记 bought = 哪天

export const CYCLES = [["d", "day"], ["w", "week"], ["m", "month"], ["y", "year"]];
const cycleN = (s) => (s?.once ? 0 : Math.max(0, Math.round(Number(s?.n) || 0)));
// 表格里用的短写：3m、2y、3d、1w
export const cycleShort = (s) => (cycleN(s) ? cycleN(s) + ((CYCLES.find(([k]) => k === s?.unit) || CYCLES[2])[0]) : "");
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

// 每样一个记号（Restock 页能按它筛）：没标过的算 🪐
export const SUP_TAGS = [["home", "🏠", "Household"], ["style", "💅", "Clothes & skincare"], ["health", "🩺", "Health"], ["tech", "💻", "Tech"], ["gift", "🎁", "Gifts"], ["other", "🪐", "Other"]];
const TAG_KEYS = SUP_TAGS.map(([k]) => k);
export const supTag = (s) => (TAG_KEYS.includes(s?.tag) ? s.tag : "other");
export const supEmoji = (s) => SUP_TAGS.find(([k]) => k === supTag(s))[1];
// tag 空 = 全部；不认识的 tag 也当全部
const tagged = (D, tag) => Object.values(D.sup || {}).filter((s) => !TAG_KEYS.includes(tag) || supTag(s) === tag);
// 每个记号下有几样（买过的不算）
export function supCounts(D) {
  const out = {};
  for (const s of Object.values(D.sup || {})) if (!(s.once && s.bought)) out[supTag(s)] = (out[supTag(s)] || 0) + 1;
  return out;
}

// Restock 页的两块：规律的；只买一次的——还没买的、买了的（最近买的在前）。前两样有日子的在前。tag = 只看这个记号的
export function restock(D, tag = "") {
  const all = tagged(D, tag), once = all.filter((s) => s.once);
  const byNext = (a, b) => (!a.next - !b.next) || String(a.next || "").localeCompare(String(b.next || "")) || byName(a, b);
  return { regular: all.filter((s) => !s.once).sort(byNext), once: once.filter((s) => !s.bought).sort(byNext),
    bought: once.filter((s) => s.bought).sort((a, b) => String(b.bought).localeCompare(String(a.bought)) || byName(a, b)) };
}

// 接下来几个月（这个月算第一个）要花钱的：过期的单列（当成今天换，再往后推）；周期短的一样会出现好几次。
// 只买一次的：填了日子、还没买的算进那个月（过了日子就在过期里），只出现一次。tag = 只算这个记号的
export function coming(D, today, months = 3, tag = "") {
  const first = startOfMonth(today), end = addDays(addMonths(first, months), -1);
  const out = { overdue: [], months: [] };
  for (let i = 0; i < months; i++) {
    const m = addMonths(first, i);
    out.months.push({ key: m.slice(0, 7), label: MONTHS[Number(m.slice(5, 7)) - 1], total: 0, items: [] });
  }
  for (const sup of tagged(D, tag)) {
    let date = sup.next;
    if (!date || (sup.once && sup.bought)) continue;
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

// ---------- 贵重的东西（Restock 页右边）：花了多少、用了几天、一天合多少 ----------
// 一样：{ name, cat 类目, cur 用什么钱买的（cny / cad）, price, bought 哪天买的, retired 哪天不用了（可以不填） }
// 钱：每样按买的那种钱存；页面上统一换成一种显示（默认加币，可以换）。汇率都对加币：rates.cny = 1 加币合几块人民币，
// 在 meal-prefs 里手动填（旧的 rate 一格当 rates.cny 读）。以后多一种钱就往 GEAR_CURS 里加一行、给个默认汇率。
// 还在用的、一天不到 0.5 加币 / 2 块（按买的那种钱算）的，提示可以换新了

export const GEAR_CURS = [["cad", "$", "CAD"], ["cny", "¥", "RMB"]];
const CUR_KEYS = GEAR_CURS.map(([k]) => k);
export const GEAR_RATE = 5;
const RATE_DEFAULT = { cad: 1, cny: GEAR_RATE };
export const GEAR_LOW = { cad: 0.5, cny: 2 };
// 每种钱对加币的汇率（加币自己是 1）；rates 也可以直接是一个数 = 人民币的
export function gearRates(pr) {
  const out = { ...RATE_DEFAULT };
  for (const k of CUR_KEYS) if (k !== "cad" && Number(pr?.rates?.[k]) > 0) out[k] = Number(pr.rates[k]);
  if (!(Number(pr?.rates?.cny) > 0) && Number(pr?.rate) > 0) out.cny = Number(pr.rate);
  return out;
}
const ratesOf = (r) => (typeof r === "number" ? { ...RATE_DEFAULT, cny: r } : { ...RATE_DEFAULT, ...(r || {}) });
// 从一种钱换到另一种
export const convert = (v, from, to, rates) => { const R = ratesOf(rates); return (v / (R[from] || 1)) * (R[to] || 1); };
// 页面上用哪种钱显示（默认加币）
export const gearShow = (pr) => (CUR_KEYS.includes(pr?.gearShow) ? pr.gearShow : "cad");
// 类目用 emoji 表示；存的是 key，从表格贴进来的英文名（Camera…）也认，认不出的算 🪐
// 电脑和平板算一类（💻）；以前存的 tablet、贴进来的 Tablet / iPad 也归到这里
export const GEAR_TAGS = [["camera", "📷", "Camera"], ["computer", "💻", "Computer & tablet"], ["phone", "📱", "Phone"],
  ["audio", "🎧", "Audio"], ["speaker", "🔊", "Speaker"], ["wearable", "⌚", "Wearable"], ["beauty", "💅", "Beauty"], ["other", "🪐", "Other"]];
const GEAR_ALIAS = { tablet: "computer", ipad: "computer", laptop: "computer", "🖥️": "computer", "📓": "computer" };
export function gearTag(g) {
  const c = String(g?.cat || "").trim().toLowerCase();
  if (GEAR_ALIAS[c]) return GEAR_ALIAS[c];
  return (GEAR_TAGS.find(([k, e, name]) => c === k || c === e || c === name.toLowerCase() || c === name.split(" ")[0].toLowerCase()) || GEAR_TAGS[GEAR_TAGS.length - 1])[0];
}
export const gearEmoji = (g) => GEAR_TAGS.find(([k]) => k === gearTag(g))[1];
export const gearCur = (g) => (CUR_KEYS.includes(g?.cur) ? g.cur : "cny");

// 一样东西算出来的：换成加币、人民币各多少、用了几天（不用了就算到那天）、一天合多少（买的那种钱；perDayCad 是换成加币的）、该不该换新
export function gearRow(g, today, rates = GEAR_RATE) {
  const cur = gearCur(g), price = Math.max(0, Number(g.price) || 0);
  const retired = !!(g.retired && g.retired <= today);
  const days = g.bought && g.bought <= today ? Math.max(1, diffDays(g.bought, retired ? g.retired : today)) : 0;
  const perDay = days ? price / days : 0;
  // 近三年买的标颜色：12 个月内 year（亮），三年内 three（暗），再早的不标
  const age = !g.bought || g.bought > today ? "" : g.bought > plusMonths(today, -12) ? "year" : g.bought > plusMonths(today, -36) ? "three" : "";
  return { g, cur, price, cad: convert(price, cur, "cad", rates), cny: convert(price, cur, "cny", rates), perDayCad: convert(perDay, cur, "cad", rates),
    days, perDay, retired, age, cheap: !retired && days > 0 && price > 0 && perDay < (GEAR_LOW[cur] ?? convert(GEAR_LOW.cad, "cad", cur, rates)) };
}

// 列表：永远是一天合得最多的在最上面（右边那个大数字；人民币、加币按汇率换成同一种再比）；
// 一样多的再看总价。不用了的也照这个顺序，只是另列一块、默认收起
export function gearList(D, today, rates = GEAR_RATE) {
  const rows = Object.values(D.gear || {}).map((g) => gearRow(g, today, rates));
  const byDay = (a, b) => b.perDayCad - a.perDayCad || b.cad - a.cad || byName(a.g, b.g);
  const live = rows.filter((r) => !r.retired).sort(byDay);
  const gone = rows.filter((r) => r.retired).sort(byDay);
  return { live, gone, cad: live.reduce((a, r) => a + r.cad, 0), perDay: live.reduce((a, r) => a + r.perDayCad, 0) };
}

// 从表格里贴过来的几行：有表头就按表头认列（Name / Category / Currency / CAD / Price 或 RMB / Purchase / Retired），
// 没有表头就当是 Name、CAD、Duration、Price、Purchase 那样排的。没写 Currency 的算人民币；只有 CAD 一列的算加币
const GEAR_COLS = { name: /^(name|item|名)/, cat: /^(cat|type|类)/, cur: /^(cur|币)/, cad: /^cad/, cny: /^(price|rmb|cny|人民币|价)/,
  bought: /^(purchase|bought|date|买)/, retired: /^(retire|退)/ };
const toDate = (s) => { const m = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/.exec(String(s || "").trim()); return m ? m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0") : ""; };

export function parseGear(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.split(/\t| {2,}/).map((x) => x.trim())).filter((c) => c.some(Boolean));
  if (!lines.length) return [];
  let cols = { name: 0, cad: 1, cny: 3, bought: 4 };
  if (lines[0].some((h) => GEAR_COLS.name.test(h.toLowerCase()))) {
    cols = {};
    lines.shift().forEach((h, i) => { const k = Object.keys(GEAR_COLS).find((k) => GEAR_COLS[k].test(h.toLowerCase())); if (k && cols[k] === undefined) cols[k] = i; });
  }
  const at = (c, k) => (cols[k] === undefined ? "" : c[cols[k]] || "");
  const num = (s) => Number(String(s).replace(/[^\d.]/g, "")) || 0;
  const out = [];
  for (const c of lines) {
    const name = at(c, "name");
    if (!name) continue;
    const said = at(c, "cur").toLowerCase();
    const cur = /cad|加/.test(said) || (!said && !num(at(c, "cny")) && num(at(c, "cad"))) ? "cad" : "cny";
    // 加币的先看 CAD 那列，人民币的先看 Price / RMB 那列；只有一列价钱的就用那一列
    const col = cur === "cad" ? (cols.cad !== undefined ? "cad" : "cny") : (cols.cny !== undefined ? "cny" : "cad");
    out.push({ name, cat: at(c, "cat"), cur, price: num(at(c, col)), bought: toDate(at(c, "bought")), retired: toDate(at(c, "retired")) });
  }
  return out;
}

// 贴进来的按名字对：已经有的更新（贴的里面空着的那几格不动），没有的新加
export function importGear(D, rows, newId) {
  const names = new Map(Object.values(D.gear || {}).map((g) => [norm(g.name), g]));
  return rows.map((r) => {
    const old = names.get(norm(r.name)), patch = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== "" && v !== 0));
    const row = { name: "", cat: "", cur: "cny", price: 0, bought: "", retired: "", ...(old || {}), ...patch, id: old?.id || newId() };
    names.set(norm(r.name), row);
    return row;
  });
}

// ---------- 导入一份清单（核对表里整理好的）：按名字对，已经有的更新、没有的新加；Box 里的东西也按名字找 ----------

const ING_FIELDS = ["store", "price", "lasts", "level", "cat", "keep", "staple", "every", "from", "checked", "sale"];
const BOX_FIELDS = ["slot", "level", "note"];
const SUP_FIELDS = ["store", "price", "n", "unit", "next", "note", "tag"];
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
