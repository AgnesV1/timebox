// Meals 页（只在电脑上）：照 meal kit（HelloFresh 这类）的路子自己备餐——
// 一顿（Box）= 几样常买的东西 × 用量，价格热量自己算；2–3 顿打包成一天（Day pack）；
// 每周有个采购日（像截单日），之前排好，那天按超市分的购物单去买；之后四周只粗排。三个分页：
//   Plan（#meals）：这一轮还没看的打折、这周和下周按天排（把 Day pack 拖到某天 / 点某天挑）、购物单、之后四周四个框
//   Boxes（#meals/boxes）：一顿一顿、一天一天
//   Groceries（#meals/groceries）：常买的东西：哪个超市、多大包、多少钱、热量、几周一轮打折、这一轮看过没有

import * as store from "../store.js";
import * as M from "../meals.js";
import { esc, on, icon } from "../dom.js";
import { addDays, diffDays, fmtDay, fmtShort, startOfWeek, weekday, WEEKDAYS } from "../dates.js";
import { toast } from "./common.js";
import { openModal, closeModal, modalSheet } from "./modal.js";

let editing = null;          // 编辑框：{ kind: ing / box / pack / day / prefs, id, draft, date }
let saleFor = "";            // 打折卡片里正在填打折价的那样
const openLists = new Set(); // 展开了购物单的周

const TABS = [["plan", "Plan", "#meals"], ["boxes", "Boxes", "#meals/boxes"], ["groceries", "Groceries", "#meals/groceries"]];
const tabOf = () => { const t = location.hash.split("/")[1] || "plan"; return TABS.some(([k]) => k === t) ? t : "plan"; };
const money = (v) => "$" + (Number(v) || 0).toFixed(2);
const kc = (v) => Math.round(Number(v) || 0).toLocaleString("en-US");
const slotName = (s) => (M.SLOTS.find(([k]) => k === s) || ["", "Any"])[1];
const weekOf = (date) => startOfWeek(date, store.prefs().weekStartsOn);
const dayNum = (d) => Number(d.slice(8));
const sel = (yes) => (yes ? " selected" : "");
const afterRender = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));   // 重画排在下一帧

// ---------- 页面 ----------

export function mealsHTML(c) {
  const D = store.meals(), tab = tabOf();
  const head = '<header class="page-head"><div><h2>Meals</h2></div><div class="tools"><nav class="mtabs">' +
    TABS.map(([k, l, href]) => '<a class="nav' + (tab === k ? " on" : "") + '" href="' + href + '">' + l + "</a>").join("") + "</nav>" +
    '<button type="button" class="icon-btn" data-act="meal-prefs" title="Targets and shop day" aria-label="Targets and shop day">' + icon("settings") + "</button></div></header>";
  const body = tab === "boxes" ? boxesHTML(D, c) : tab === "groceries" ? groceriesHTML(D, c) : planHTML(D, c);
  return '<div class="meals">' + head + body + "</div>";
}

function introHTML(onGroceries = false) {
  return '<div class="empty big mintro"><p>Prep like a meal kit.</p><ol>' +
    "<li><b>Groceries</b> — what you usually buy, at which store, pack price, calories, and how often it goes on sale.</li>" +
    "<li><b>Boxes</b> — one meal: a few groceries with amounts. Pack 2–3 boxes into a <b>day</b>.</li>" +
    "<li><b>Plan</b> — drop days onto this week and next; rough out the four weeks after. Every week gets a shop day and a list by store.</li></ol>" +
    '<div class="tools"><button type="button" class="btn cta" data-act="meal-examples">Start with examples</button>' + (onGroceries ? '<button type="button" class="btn" data-act="new-ing">Add my first grocery</button>' : '<a class="btn" href="#meals/groceries">Add my groceries</a>') + "</div></div>";
}

// ---------- Plan ----------

function planHTML(D, c) {
  const packs = Object.values(D.pack).sort(M.byName);
  if (!packs.length && !Object.keys(D.ing).length) return introHTML();
  const pr = store.mealPrefs(), w0 = weekOf(c.today);
  const palette = packs.length
    ? '<div class="mpalette"><span class="msub">Drag a day onto the calendar</span>' + packs.map((p) => {
      const t = M.packTotals(D, p, c.today);
      const names = M.packBoxes(D, p).map((id) => D.box[id].name).join(" · ");
      return '<span class="mpk" data-drag="pack:' + esc(p.id) + '" title="' + esc(names) + '"><b>' + esc(p.name || "Untitled") + "</b><small>" + kc(t.kcal) + " kcal · " + money(t.cost) + "</small></span>";
    }).join("") + "</div>"
    : '<p class="mpalette msub">No day packs yet — <a href="#meals/boxes">make boxes, then pack 2–3 into a day</a>.</p>';
  return dealsHTML(D, c.today) + palette +
    weekHTML(D, c, w0, "This week", pr) + weekHTML(D, c, addDays(w0, 7), "Next week", pr) +
    '<section class="mlater"><h3 class="msec">Later <small>four weeks, rough</small></h3><div class="rgrid">' +
    [2, 3, 4, 5].map((k) => roughHTML(D, c, addDays(w0, 7 * k), pr, packs)).join("") + "</div></section>";
}

const roundText = (ing, r) => (Number(ing.every) === 1 ? "Weekly flyer" : "Every " + ing.every + " wks") + " · round " + fmtShort(r.start) + "–" + fmtShort(r.end);

function dealsHTML(D, T) {
  const check = M.toCheck(D, T), sales = M.onSaleNow(D, T);
  if (!check.length && !sales.length) return "";
  const row = (ing) => {
    const r = M.roundOf(ing, T);
    const name = "<b>" + esc(ing.name) + "</b>" + (ing.store ? '<span class="mstore">' + esc(ing.store) + "</span>" : "");
    if (saleFor === ing.id) {
      return '<li class="dl"><span class="dname">' + name + '</span><form class="saleform" data-id="' + esc(ing.id) + '">' +
        '<label>Sale price <input name="price" class="num" type="number" step="0.01" min="0" value="' + esc(ing.price || "") + '" required></label>' +
        '<label>until <input name="until" type="date" value="' + r.end + '" required></label>' +
        '<button type="submit" class="btn primary">Save</button><button type="button" class="link" data-act="sale-cancel">Cancel</button></form></li>';
    }
    return '<li class="dl"><span class="dname">' + name + '</span><span class="dround">' + roundText(ing, r) + "</span>" +
      '<span class="dacts"><button type="button" class="chip" data-act="deal-none" data-id="' + esc(ing.id) + '">No deal</button>' +
      '<button type="button" class="chip" data-act="deal-sale" data-id="' + esc(ing.id) + '">On sale…</button></span></li>';
  };
  return '<section class="mcard deals"><header><h3>Deals to check</h3><span class="msub">' +
    (check.length ? check.length + " not checked this round" : "All checked this round ✓") + "</span></header>" +
    (check.length ? "<ul>" + check.map(row).join("") + "</ul>" : "") +
    (sales.length ? '<p class="onsale"><span class="msub">On sale now</span>' + sales.map((i) =>
      '<span class="saletag">' + esc(i.name) + " <b>" + money(i.sale.price) + "</b> <small>till " + fmtShort(i.sale.until) + "</small></span>").join("") + "</p>" : "") +
    "</section>";
}

function shopText(c, w, shop, planned) {
  if (w.skip) return ["Skipped", "skip"];
  if (w.shopped) return ["✓ Shopped", "done"];
  const n = diffDays(c.today, shop);
  if (n > 1) return ["Shop " + fmtDay(shop) + " · in " + n + " days", ""];
  if (n === 1) return ["Shop tomorrow", planned ? "due" : ""];
  if (n === 0) return ["Shop today", planned ? "due" : ""];
  return ["Shop day was " + fmtDay(shop), planned ? "late" : ""];
}

function weekHTML(D, c, start, label, pr) {
  const w = D.week[start] || {};
  const shop = M.shopDate(start, pr.shopDay, w.shopOn);
  const plan = M.weekPlan(D, start, shop);
  const prev = addDays(start, -7);
  const left = M.leftovers(M.shoppingList(D, prev, M.shopDate(prev, pr.shopDay, D.week[prev]?.shopOn)), Boolean(D.week[prev]?.shopped));
  const list = M.shoppingList(D, start, shop, left);
  const [st, stCls] = shopText(c, w, shop, plan.planned);
  const budget = Number(pr.budget) || 0;
  const open = openLists.has(start);
  // 粗排时定好的还没排到具体哪天：一键按顺序填进空着的日子（过去的日子不填）
  const from = start < c.today ? c.today : start;
  const rest = M.roughLeft(D, start, w);
  const canFill = rest.length && M.daysOf(start).some((d) => d >= from && !D.days[d]);
  const carry = (w.rough || []).filter((r) => D.pack[r.pack] && r.n > 0).map((r) => esc(D.pack[r.pack].name) + " ×" + r.n).join(" · ");
  return '<section class="mweek' + (w.skip ? " skip" : "") + '"><header class="mweek-head">' +
    '<div class="mw-title"><h3>' + label + '</h3><span class="msub">' + fmtShort(start) + " – " + fmtShort(addDays(start, 6)) + "</span></div>" +
    '<span class="shopday ' + stCls + '">' + esc(st) + "</span>" +
    '<div class="mw-sum"><span><b>' + plan.planned + "</b>/7 days</span>" + (plan.planned ? "<span><b>" + kc(plan.kcal) + "</b> kcal/day</span><span>≈ <b>" + money(plan.cost) + "</b> of food</span>" : "") +
    '<span class="budget' + (budget && list.total > budget ? " over" : "") + '"><b>' + money(list.total) + "</b>" + (budget ? " / $" + budget : "") + " to buy</span></div>" +
    '<div class="tools"><button type="button" class="btn' + (open ? " on" : "") + '" data-act="toggle-list" data-week="' + start + '">' + icon("cart") + " List" + (!list.count ? "" : list.open === list.count ? " · " + list.count : list.open ? " · " + list.open + " left" : " ✓") + "</button>" +
    (w.skip ? "" : '<button type="button" class="btn' + (stCls === "due" || stCls === "late" ? " primary" : "") + '" data-act="shopped" data-week="' + start + '">' + (w.shopped ? "Not shopped" : "Mark shopped") + "</button>") +
    '<button type="button" class="btn ghosty" data-act="skip-week" data-week="' + start + '">' + (w.skip ? "Unskip" : "Skip week") + "</button></div></header>" +
    ((carry && canFill) || w.note ? '<p class="carry">' + (carry && canFill ? "Planned earlier: " + carry + ' <button type="button" class="btn" data-act="fill-week" data-week="' + start + '">Fill empty days</button>' : "") +
      (w.note ? ' <span class="wnote">' + esc(w.note) + "</span>" : "") + "</p>" : "") +
    '<div class="mdays">' + plan.days.map((d) => dayHTML(D, c, d, pr)).join("") + "</div>" +
    (open ? listHTML(list, start, w) : "") + "</section>";
}

function dayHTML(D, c, d, pr) {
  const off = d.entry?.off, n = d.boxes.length;
  const pack = d.entry?.pack ? D.pack[d.entry.pack] : null;
  const target = Number(pr.kcal) || 0;
  const pct = target ? Math.min(100, (d.kcal / target) * 100) : 0;
  const cls = ["mday", d.date === c.today && "today", d.date < c.today && "past", off && "off"].filter(Boolean).join(" ");
  return '<div class="' + cls + '" data-drop="mday:' + d.date + '" data-act="edit-day" data-date="' + d.date + '"' + (n ? ' data-drag="mcopy:' + d.date + '"' : "") + ' role="button" tabindex="0">' +
    '<div class="mday-head"><span>' + WEEKDAYS[weekday(d.date)] + "</span><b>" + dayNum(d.date) + "</b></div>" +
    (off ? '<p class="moff">Not cooking</p>'
      : n ? '<p class="mpack">' + (pack ? esc(pack.name || "Untitled") : "Own pick") + '</p><ul class="mbl">' +
        d.boxes.map((id) => '<li class="s-' + esc(D.box[id].slot || "any") + '">' + esc(D.box[id].name) + "</li>").join("") + "</ul>" +
        '<div class="mday-foot"><span>' + kc(d.kcal) + " kcal</span><span>" + money(d.cost) + "</span></div>" +
        (target ? '<div class="kbar' + (d.kcal > target * 1.1 ? " over" : "") + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>' : "")
      : '<p class="mempty">+ Plan</p>') + "</div>";
}

function listHTML(list, start, w) {
  if (w.skip) return "";
  const row = (r) => {
    const u = M.unitOf(r.ing);
    const cover = r.carry >= r.qty && r.state !== "have";
    const single = u === "each" && Number(r.ing.packQty) === 1;
    return '<li class="' + (r.state ? "st-" + r.state : "") + (cover ? " cover" : "") + '">' +
      '<label class="lname"><input type="checkbox" data-act="got" data-v="bought" data-week="' + start + '" data-id="' + esc(r.ing.id) + '"' + (r.state === "bought" ? " checked" : "") + (r.state === "have" ? " disabled" : "") + ">" +
      "<span>" + esc(r.ing.name) + "</span></label>" +
      '<span class="lq">' + M.fmtQty(r.qty, u) + (single ? "" : " → " + (r.packs ? r.packs + " × " + esc(M.packLabel(r.ing)) : "?")) + "</span>" +
      '<span class="lp">' + (r.state === "have" ? "—" : money(r.cost)) + (r.sale && r.state !== "have" ? ' <em class="saletag">sale</em>' : "") + "</span>" +
      '<button type="button" class="link" data-act="got" data-v="have" data-week="' + start + '" data-id="' + esc(r.ing.id) + '">' + (r.state === "have" ? "Need it" : "Have it") + "</button>" +
      (cover ? '<small class="lnote">Last week\'s pack should cover this (~' + M.fmtQty(r.carry, u) + " left)</small>"
        : r.left >= 0.4 * M.packSize(r.ing) && r.state !== "have" ? '<small class="lnote">+' + M.fmtQty(r.left, u) + " left over</small>" : "") + "</li>";
  };
  return '<div class="mlist">' + (list.count ? '<div class="mstores">' + list.groups.map((g) =>
    '<section><h4>' + esc(g.store || "Anywhere") + " <small>" + money(g.cost) + "</small></h4><ul>" + g.items.map(row).join("") + "</ul></section>").join("") + "</div>"
    : '<p class="msub">Nothing to buy yet — plan some days first.</p>') +
    (list.staples.length ? '<p class="msub staples">Have at home: ' + list.staples.map((i) => esc(i.name)).join(", ") + "</p>" : "") + "</div>";
}

function roughHTML(D, c, start, pr, packs) {
  const w = D.week[start] || {};
  const shop = M.shopDate(start, pr.shopDay, w.shopOn);
  const t = M.roughTotals(D, w, shop);
  const deals = M.roundsIn(D, start, addDays(start, 6));
  const chips = (w.rough || []).map((r, i) => D.pack[r.pack] ? '<span class="rchip"><b>' + esc(D.pack[r.pack].name || "Untitled") + "</b> ×" + r.n +
    '<button type="button" data-act="rough-dec" data-week="' + start + '" data-i="' + i + '" aria-label="One less">−</button>' +
    '<button type="button" data-act="rough-inc" data-week="' + start + '" data-i="' + i + '" aria-label="One more">+</button></span>' : "").join("");
  return '<article class="rweek' + (w.skip ? " skip" : "") + '" data-drop="mweek:' + start + '">' +
    "<header><b>" + fmtShort(start) + " – " + fmtShort(addDays(start, 6)) + '</b><button type="button" class="link" data-act="skip-week" data-week="' + start + '">' + (w.skip ? "Unskip" : "Skip") + "</button></header>" +
    '<p class="msub">Shop ' + fmtDay(shop) + "</p>" +
    (w.skip ? '<p class="skipped">Skipping this week</p>'
      : '<div class="rpacks">' + chips + (packs.length ? '<select data-act="rough-add" data-week="' + start + '" aria-label="Add a day pack"><option value="">+ Day</option>' +
        packs.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name || "Untitled") + "</option>").join("") + "</select>" : "") + "</div>" +
        '<p class="rsum"><b>' + t.days + "</b> of 7 days" + (t.days ? " · " + kc(t.kcal) + " kcal/day · ≈ " + money(t.cost) + " of food" : "") + "</p>") +
    (deals.length ? '<p class="rdeals"><span>Deals due</span> ' + deals.map((x) => esc(x.ing.name) + " <small>" + fmtShort(x.start) + "</small>").join(", ") + "</p>" : "") +
    '<textarea data-act="rough-note" data-week="' + start + '" data-keep="rnote-' + start + '" rows="2" placeholder="Note — Costco run, eating out Fri…">' + esc(w.note || "") + "</textarea></article>";
}

// ---------- Boxes ----------

function boxesHTML(D, c) {
  const pr = store.mealPrefs();
  const order = Object.fromEntries(M.SLOTS.map(([k], i) => [k, i]));
  const boxes = Object.values(D.box).sort((a, b) => (order[a.slot] ?? 9) - (order[b.slot] ?? 9) || M.byName(a, b));
  const packs = Object.values(D.pack).sort(M.byName);
  const boxCard = (b) => {
    const t = M.boxTotals(D, b, c.today);
    return '<article class="mbox s-' + esc(b.slot || "any") + '" data-act="edit-box" data-id="' + esc(b.id) + '" role="button" tabindex="0">' +
      "<header><b>" + esc(b.name || "Untitled") + '</b><span class="slot">' + slotName(b.slot) + "</span></header><ul>" +
      (b.parts || []).filter((p) => D.ing[p.ing]).map((p) => "<li><span>" + esc(D.ing[p.ing].name) + '</span><span class="q">' + M.fmtQty(p.qty, M.unitOf(D.ing[p.ing])) + "</span></li>").join("") +
      "</ul><footer><span>" + kc(t.kcal) + " kcal</span><span>" + money(t.cost) + "</span></footer></article>";
  };
  const packCard = (p) => {
    const t = M.packTotals(D, p, c.today), target = Number(pr.kcal) || 0;
    return '<article class="mbox pk" data-act="edit-pack" data-id="' + esc(p.id) + '" role="button" tabindex="0"><header><b>' + esc(p.name || "Untitled") + "</b></header><ul>" +
      M.packBoxes(D, p).map((id) => '<li class="s-' + esc(D.box[id].slot || "any") + '"><span>' + esc(D.box[id].name) + '</span><span class="q">' + kc(M.boxTotals(D, D.box[id], c.today).kcal) + "</span></li>").join("") + "</ul>" +
      (target ? '<div class="kbar' + (t.kcal > target * 1.1 ? " over" : "") + '"><i style="width:' + Math.min(100, (t.kcal / target) * 100).toFixed(1) + '%"></i></div>' : "") +
      "<footer><span>" + kc(t.kcal) + (target ? " / " + kc(target) : "") + " kcal</span><span>" + money(t.cost) + "</span></footer></article>";
  };
  if (!boxes.length && !Object.keys(D.ing).length) return introHTML();
  return '<div class="mcols"><section><header class="msec-head"><h3 class="msec">Boxes <small>one meal each</small></h3><button type="button" class="btn cta" data-act="new-box">' + icon("plus") + " Box</button></header>" +
    (boxes.length ? '<div class="mgrid">' + boxes.map(boxCard).join("") + "</div>" : '<p class="empty">No boxes yet. A box is one meal: a few groceries with amounts.</p>') + "</section>" +
    '<section><header class="msec-head"><h3 class="msec">Days <small>2–3 boxes packed into one day</small></h3><button type="button" class="btn cta" data-act="new-pack"' + (boxes.length ? "" : " disabled") + ">" + icon("plus") + " Day</button></header>" +
    (packs.length ? '<div class="mgrid">' + packs.map(packCard).join("") + "</div>" : '<p class="empty">' + (boxes.length ? "Pack a few boxes into a day — then drag it onto the plan." : "Make a box first.") + "</p>") + "</section></div>";
}

// ---------- Groceries ----------

const STATE = { sale: "On sale", check: "To check", checked: "Checked", none: "" };

function groceriesHTML(D, c) {
  const ings = Object.values(D.ing).sort(M.byStore);
  const hasEx = ["ing", "box", "pack"].some((k) => Object.keys(D[k]).some((id) => id.startsWith("ex-")));
  const tools = '<div class="msec-head"><p class="msub">Prices in $. Calories from the label or USDA FoodData Central — rough is fine.</p><span class="tools">' +
    (hasEx ? '<button type="button" class="btn ghosty" data-act="meal-clear-examples">Remove examples</button>' : "") +
    '<button type="button" class="btn cta" data-act="new-ing">' + icon("plus") + " Grocery</button></span></div>";
  if (!ings.length) return tools + introHTML(true);
  const groups = new Map();
  for (const i of ings) { const k = String(i.store || "").trim(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
  const row = (i) => {
    const st = M.dealState(i, c.today), r = M.roundOf(i, c.today), up = M.unitPrice(i, c.today), u = M.unitOf(i);
    const stText = st === "sale" ? "On sale till " + fmtShort(i.sale.until) : st === "checked" ? "Checked " + fmtShort(i.checked) : st === "check" ? "To check (" + fmtShort(r.start) + "–" + fmtShort(r.end) + ")" : "";
    return '<tr data-act="edit-ing" data-id="' + esc(i.id) + '" tabindex="0"><td><b>' + esc(i.name || "Untitled") + "</b>" + (i.staple ? ' <span class="stag">staple</span>' : "") + "</td>" +
      "<td>" + esc(M.packLabel(i)) + '</td><td class="r num">' + (st === "sale" ? "<s>" + money(i.price) + "</s> " + money(i.sale.price) : money(i.price)) + "</td>" +
      '<td class="r num">' + (up ? money(up.v) + "/" + up.per : "") + '</td><td class="r num">' + kc(i.kcal) + ' <small>/' + (u === "each" ? "ea" : "100" + u) + "</small></td>" +
      "<td>" + (Number(i.every) ? (Number(i.every) === 1 ? "Weekly" : "Every " + i.every + " wks") : '<span class="msub">—</span>') + "</td>" +
      '<td><span class="dstate d-' + st + '">' + esc(stText) + "</span></td></tr>";
  };
  return tools + '<table class="mtable"><thead><tr><th>Item</th><th>Pack</th><th class="r">Price</th><th class="r">Unit price</th><th class="r">kcal</th><th>Deals</th><th>This round</th></tr></thead>' +
    [...groups.entries()].map(([store, list]) => '<tbody><tr class="mstore-row"><th colspan="7">' + esc(store || "Anywhere") + " <small>" + list.length + "</small></th></tr>" + list.map(row).join("") + "</tbody>").join("") + "</table>";
}

// ---------- 编辑框（一改就存；新建的有了名字才存） ----------

function rowOf(D) {
  if (!editing) return null;
  if (editing.kind === "ing" || editing.kind === "box" || editing.kind === "pack") return editing.id ? D[editing.kind][editing.id] || null : editing.draft;
  return null;
}

function footHTML(row, what) {
  return '<div class="sheet-foot">' + (editing.id ? '<button type="button" class="btn danger" data-act="del-meal">' + icon("trash") + " Delete " + what + "</button>" : "<span></span>") +
    '<button type="button" class="btn primary" data-modal-close>Done</button></div>';
}

function ingEditor(D, row) {
  const u = M.unitOf(row), T = store.today();
  const stores = [...new Set(Object.values(D.ing).map((i) => String(i.store || "").trim()).filter(Boolean))].sort();
  const r = M.roundOf(row, T), up = M.unitPrice(row, T);
  return '<h3 class="sheet-title">' + (editing.id ? esc(row.name || "Untitled") : "New grocery") + "</h3>" +
    '<div class="field-row"><label class="field"><span>Name</span><input data-f="name" data-k="name" value="' + esc(row.name || "") + '" placeholder="Chicken breast" autocomplete="off"></label>' +
    '<label class="field"><span>Store</span><input data-f="store" data-k="store" list="meal-stores" value="' + esc(row.store || "") + '" placeholder="Costco" autocomplete="off"></label></div>' +
    '<datalist id="meal-stores">' + stores.map((s) => '<option value="' + esc(s) + '">').join("") + "</datalist>" +
    '<div class="field-row three"><div class="field"><span>Pack size</span><span class="pair"><input data-f="packQty" data-k="packQty" class="num" type="number" step="any" min="0" value="' + esc(row.packQty ?? "") + '">' +
    '<select data-f="packUnit" data-k="packUnit">' + Object.keys(M.UNITS).map((k) => '<option value="' + esc(k) + '"' + sel((row.packUnit || "each") === k) + ">" + esc(k) + "</option>").join("") + "</select></span></div>" +
    '<label class="field"><span>Price per pack</span><input data-f="price" data-k="price" class="num" type="number" step="0.01" min="0" value="' + esc(row.price ?? "") + '" placeholder="0.00"></label>' +
    '<label class="field"><span>kcal per ' + (u === "each" ? "1" : "100 " + u) + '</span><input data-f="kcal" data-k="kcal" class="num" type="number" step="any" min="0" value="' + esc(row.kcal ?? "") + '"></label></div>' +
    '<p class="hint">' + (up ? money(up.v) + " per " + up.per + ". " : "") + "Boxes measure this in " + (u === "each" ? "pieces" : u) + ".</p>" +
    '<label class="check"><input type="checkbox" data-f="staple" data-k="staple"' + (row.staple ? " checked" : "") + "> Staple — always at home (oil, salt, soy sauce); left off shopping lists</label>" +
    '<h4 class="msub-h">Deals</h4>' +
    '<div class="field-row"><label class="field"><span>New deal round</span><select data-f="every" data-k="every">' +
    M.EVERY.map((n) => '<option value="' + n + '"' + sel((Number(row.every) || 0) === n) + ">" + (n === 0 ? "Don't track" : n === 1 ? "Every week (flyer)" : "Every " + n + " weeks") + "</option>").join("") + "</select></label>" +
    (Number(row.every) ? '<label class="field"><span>A round started on</span><input data-f="from" data-k="from" type="date" value="' + esc(row.from || "") + '"></label>' : "<span></span>") + "</div>" +
    (r ? '<p class="hint">This round: ' + fmtShort(r.start) + " – " + fmtShort(r.end) + " · " + (row.checked && row.checked >= r.start ? "checked " + fmtShort(row.checked) : "not checked yet") +
      ' <button type="button" class="link" data-act="ing-checked">Checked today</button></p>' : "") +
    '<div class="field-row"><label class="field"><span>Sale price</span><input data-f="salePrice" data-k="salePrice" class="num" type="number" step="0.01" min="0" value="' + esc(row.sale?.price || "") + '" placeholder="Not on sale"></label>' +
    '<label class="field"><span>Sale until</span><input data-f="saleUntil" data-k="saleUntil" type="date" value="' + esc(row.sale?.until || "") + '"></label></div>' +
    footHTML(row, "grocery");
}

function ingOptions(D, selected) {
  const groups = new Map();
  for (const i of Object.values(D.ing).sort(M.byStore)) { const k = i.store || "Anywhere"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
  return '<option value="">Pick a grocery…</option>' + [...groups.entries()].map(([g, list]) => '<optgroup label="' + esc(g) + '">' +
    list.map((i) => '<option value="' + esc(i.id) + '"' + sel(i.id === selected) + ">" + esc(i.name) + "</option>").join("") + "</optgroup>").join("");
}

function boxEditor(D, row) {
  const T = store.today(), t = M.boxTotals(D, row, T);
  const parts = row.parts || [];
  return '<h3 class="sheet-title">' + (editing.id ? esc(row.name || "Untitled") : "New box") + " <small>" + kc(t.kcal) + " kcal · " + money(t.cost) + "</small></h3>" +
    '<div class="field-row"><label class="field"><span>Name</span><input data-f="name" data-k="name" value="' + esc(row.name || "") + '" placeholder="Chicken rice bowl" autocomplete="off"></label>' +
    '<div class="field"><span>Meal</span><span class="seg">' + [...M.SLOTS, ["", "Any"]].map(([k, l]) => '<button type="button" data-act="box-slot" data-v="' + k + '"' + ((row.slot || "") === k ? ' class="on"' : "") + ">" + l + "</button>").join("") + "</span></div></div>" +
    '<div class="field"><span>What goes in — one box</span>' +
    (Object.keys(D.ing).length ? '<table class="parts">' + parts.map((p, i) => {
      const ing = D.ing[p.ing], u = ing ? M.unitOf(ing) : "";
      return "<tr><td><select data-part=\"ing\" data-i=\"" + i + '" data-k="ping-' + i + '">' + ingOptions(D, p.ing) + "</select></td>" +
        '<td><input data-part="qty" data-i="' + i + '" data-k="pqty-' + i + '" class="num" type="number" step="any" min="0" value="' + esc(p.qty ?? "") + '"></td>' +
        '<td class="u">' + (u === "each" ? "ea" : u) + '</td><td class="r num">' + (ing ? kc(M.partKcal(ing, p.qty)) + " kcal" : "") + '</td><td class="r num">' + (ing ? money(M.partCost(ing, p.qty, T)) : "") + "</td>" +
        '<td><button type="button" class="icon-btn" data-act="part-del" data-i="' + i + '" aria-label="Remove">' + icon("close") + "</button></td></tr>";
    }).join("") + "</table>" + '<button type="button" class="btn" data-act="part-add">' + icon("plus") + " Grocery</button>"
      : '<p class="hint">No groceries yet — <a href="#meals/groceries" data-modal-close>add what you buy</a> first.</p>') + "</div>" +
    '<label class="field"><span>How to make it</span><textarea data-f="note" data-k="note" rows="2" placeholder="Roast 25 min at 425°F, portion into 4 boxes…">' + esc(row.note || "") + "</textarea></label>" +
    footHTML(row, "box");
}

function boxOptions(D, selected) {
  const order = Object.fromEntries(M.SLOTS.map(([k], i) => [k, i]));
  const groups = new Map();
  for (const b of Object.values(D.box).sort((a, b2) => (order[a.slot] ?? 9) - (order[b2.slot] ?? 9) || M.byName(a, b2))) {
    const k = slotName(b.slot);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  return '<option value="">—</option>' + [...groups.entries()].map(([g, list]) => '<optgroup label="' + esc(g) + '">' +
    list.map((b) => '<option value="' + esc(b.id) + '"' + sel(b.id === selected) + ">" + esc(b.name) + "</option>").join("") + "</optgroup>").join("");
}

// 几个下拉框挑 Box：已经挑的 + 一个空的，最多 4 个
function boxSlots(D, ids, attr) {
  const T = store.today(), shown = ids.length < 4 ? [...ids, ""] : ids;
  return shown.map((id, i) => '<div class="pslot"><span class="num">' + (i + 1) + '</span><select ' + attr + ' data-i="' + i + '" data-k="' + attr + "-" + i + '">' + boxOptions(D, id) + "</select>" +
    '<span class="r num">' + (D.box[id] ? kc(M.boxTotals(D, D.box[id], T).kcal) + " kcal" : "") + "</span></div>").join("");
}

function totalsLine(D, ids, date) {
  const t = M.sumBoxes(D, ids, date), target = Number(store.mealPrefs().kcal) || 0;
  return '<p class="ptotal"><b>' + kc(t.kcal) + "</b>" + (target ? " / " + kc(target) : "") + " kcal · <b>" + money(t.cost) + "</b></p>" +
    (target ? '<div class="kbar' + (t.kcal > target * 1.1 ? " over" : "") + '"><i style="width:' + Math.min(100, (t.kcal / target) * 100).toFixed(1) + '%"></i></div>' : "");
}

function packEditor(D, row) {
  const ids = M.packBoxes(D, row);
  return '<h3 class="sheet-title">' + (editing.id ? esc(row.name || "Untitled") : "New day") + "</h3>" +
    '<label class="field"><span>Name</span><input data-f="name" data-k="name" value="' + esc(row.name || "") + '" placeholder="Day A" autocomplete="off"></label>' +
    '<div class="field"><span>Boxes — 2 or 3 is the usual, up to 4</span>' + boxSlots(D, ids, "data-pbox") + "</div>" +
    totalsLine(D, ids, store.today()) + footHTML(row, "day");
}

function dayEditor(D) {
  const date = editing.date, entry = D.days[date] || null;
  const ids = M.boxesOfDay(D, entry);
  const packs = Object.values(D.pack).sort(M.byName);
  return '<h3 class="sheet-title">' + fmtDay(date) + "</h3>" +
    (packs.length ? '<div class="field"><span>Day pack</span><div class="chips">' + packs.map((p) =>
      '<button type="button" class="chip' + (entry?.pack === p.id ? " on" : "") + '" data-act="day-pack" data-id="' + esc(p.id) + '">' + esc(p.name || "Untitled") + " <small>" + kc(M.packTotals(D, p, date).kcal) + "</small></button>").join("") + "</div></div>" : "") +
    (Object.keys(D.box).length ? '<div class="field"><span>' + (entry?.pack ? "Or change the boxes for this day only" : "Boxes") + "</span>" + boxSlots(D, entry?.off ? [] : ids, "data-dbox") + "</div>" : '<p class="hint">No boxes yet — <a href="#meals/boxes" data-modal-close>make some</a> first.</p>') +
    (ids.length ? totalsLine(D, ids, date) : "") +
    '<div class="sheet-foot"><span class="tools"><button type="button" class="btn' + (entry?.off ? " on" : "") + '" data-act="day-off">' + (entry?.off ? "Cooking after all" : "Not cooking") + "</button>" +
    (entry ? '<button type="button" class="btn ghosty" data-act="day-clear">Clear</button>' : "") + "</span>" +
    '<button type="button" class="btn primary" data-modal-close>Done</button></div>';
}

function prefsEditor() {
  const pr = store.mealPrefs();
  return '<h3 class="sheet-title">Meal targets</h3>' +
    '<div class="field-row three"><label class="field"><span>kcal per day</span><input data-pf="kcal" data-k="kcal" class="num" type="number" min="0" step="50" value="' + esc(pr.kcal) + '"></label>' +
    '<label class="field"><span>Budget per week ($)</span><input data-pf="budget" data-k="budget" class="num" type="number" min="0" step="5" value="' + (Number(pr.budget) ? esc(pr.budget) : "") + '" placeholder="No budget"></label>' +
    '<label class="field"><span>Shop day</span><select data-pf="shopDay" data-k="shopDay">' + WEEKDAYS.map((d, i) => '<option value="' + i + '"' + sel(Number(pr.shopDay) === i) + ">" + d + "</option>").join("") + "</select></label></div>" +
    '<p class="hint">Like a meal kit\'s cutoff: each week\'s plan should be ready by its shop day — the last one on or before the week starts. A week runs from your "Week starts on" in Settings.</p>' +
    '<div class="sheet-foot"><span></span><button type="button" class="btn primary" data-modal-close>Done</button></div>';
}

function editorHTML() {
  const D = store.meals();
  if (editing.kind === "day") return dayEditor(D);
  if (editing.kind === "prefs") return prefsEditor();
  const row = rowOf(D);
  if (!row) return "";
  return editing.kind === "ing" ? ingEditor(D, row) : editing.kind === "box" ? boxEditor(D, row) : packEditor(D, row);
}

function openEditor(e) {
  editing = e;
  openModal('<div class="meal-editor">' + editorHTML() + "</div>", { wide: e.kind === "ing" || e.kind === "box", close: () => { editing = null; } });
  modalSheet()?.querySelector("[data-k=name]")?.focus();
}

// 数据一变（自己改的、同步拉下来的）就重画编辑框；正在打字的那格留住
const keyOf = (el) => el?.dataset?.k || (el?.dataset?.act ? "act:" + el.dataset.act + ":" + (el.dataset.i ?? el.dataset.v ?? el.dataset.id ?? "") : "");

export function refreshMealEditor() {
  const box = modalSheet()?.querySelector(".meal-editor");
  if (!box || !editing) return;
  if ((editing.kind === "ing" || editing.kind === "box" || editing.kind === "pack") && !rowOf(store.meals())) { closeModal(); return; }
  const a = document.activeElement;
  const key = a && box.contains(a) ? keyOf(a) : "";
  const keep = key && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && a.type !== "checkbox" ? { value: a.value, s: a.selectionStart, e: a.selectionEnd } : null;
  box.innerHTML = editorHTML();
  if (!key) return;
  const el = [...box.querySelectorAll("[data-k], [data-act]")].find((x) => keyOf(x) === key);
  if (!el) return;
  if (keep && el.value !== keep.value) el.value = keep.value;
  el.focus({ preventScroll: true });
  if (keep) try { el.setSelectionRange(keep.s, keep.e); } catch { /* number / date 输入框不支持 */ }
}

// 改一处就存；新建的还没名字就先放在草稿里
function update(patch, label) {
  const D = store.meals(), cur = rowOf(D);
  if (!cur) return;
  const next = { ...cur, ...patch };
  if (editing.id) { store.saveMeal(editing.kind, next, label); return; }
  if (!String(next.name || "").trim()) { editing.draft = next; refreshMealEditor(); return; }
  editing.id = store.saveMeal(editing.kind, { ...next, id: "" });
  editing.draft = null;
}

// ---------- 拖放（dnd.js 转过来的）：Day pack → 某天 / 之后某周；拖某天 → 复制到另一天 ----------

export function mealDrop(payload, target) {
  const i = payload.indexOf(":"), kind = payload.slice(0, i), id = payload.slice(i + 1);
  const j = target.indexOf(":"), tk = target.slice(0, j), tid = target.slice(j + 1);
  const D = store.meals();
  if (tk === "mday") {
    if (kind === "pack" && D.pack[id]) store.setMealDay(weekOf(tid), tid, { pack: id });
    if (kind === "mcopy" && id !== tid && D.days[id]) { store.setMealDay(weekOf(tid), tid, { ...D.days[id] }); toast("Copied to " + fmtDay(tid)); }
  }
  if (tk === "mweek" && kind === "pack" && D.pack[id]) roughAdd(tid, id);
}

function roughAdd(start, packId) {
  store.saveWeek(start, (w) => {
    const rough = (w.rough || []).map((r) => ({ ...r }));
    const hit = rough.find((r) => r.pack === packId);
    if (hit) hit.n = Math.min(7, (Number(hit.n) || 0) + 1);
    else rough.push({ pack: packId, n: 1 });
    return { rough };
  });
}

// ---------- 事件 ----------

export function initMeals(rerender) {
  on(document, "click", ".meals [data-act]", (e, el) => {
    if (el.matches("select, textarea, input")) return;
    const act = el.dataset.act, D = store.meals(), T = store.today();
    const start = el.dataset.week;
    if (act === "meal-examples") { store.addMealExamples(M.examples(T, weekOf(T), D)); }
    else if (act === "meal-clear-examples") store.clearMealExamples();
    else if (act === "meal-prefs") openEditor({ kind: "prefs" });
    else if (act === "deal-none") store.checkDeal(el.dataset.id, null);
    else if (act === "deal-sale") { saleFor = el.dataset.id; rerender(); afterRender(() => document.querySelector(".saleform [name=price]")?.select()); }
    else if (act === "sale-cancel") { saleFor = ""; rerender(); }
    else if (act === "edit-day") openEditor({ kind: "day", date: el.dataset.date });
    else if (act === "toggle-list") { if (openLists.has(start)) openLists.delete(start); else openLists.add(start); rerender(); }
    else if (act === "shopped") store.saveWeek(start, (w) => ({ shopped: !w.shopped }));
    else if (act === "skip-week") store.saveWeek(start, (w) => ({ skip: !w.skip }), D.week[start]?.skip ? "" : "Week skipped");
    else if (act === "fill-week") {
      const days = M.fillFromRough(D, start, D.week[start], start < T ? T : start);
      const n = Object.keys(days).length;
      if (n) store.saveWeek(start, (w) => ({ days: { ...(w.days || {}), ...days } }), "Filled " + n + (n === 1 ? " day" : " days"));
    }
    else if (act === "got") {
      const v = el.dataset.v, id = el.dataset.id;
      store.saveWeek(start, (w) => { const got = { ...(w.got || {}) }; if (got[id] === v) delete got[id]; else got[id] = v; return { got }; });
    }
    else if (act === "rough-inc" || act === "rough-dec") {
      const i = Number(el.dataset.i);
      store.saveWeek(start, (w) => {
        const rough = (w.rough || []).map((r) => ({ ...r }));
        if (!rough[i]) return {};
        rough[i].n = Math.min(7, (Number(rough[i].n) || 0) + (act === "rough-inc" ? 1 : -1));
        return { rough: rough.filter((r) => r.n > 0) };
      });
    }
    else if (act === "new-box") openEditor({ kind: "box", id: "", draft: { name: "", slot: "", parts: [{ ing: "", qty: "" }], note: "" } });
    else if (act === "edit-box") openEditor({ kind: "box", id: el.dataset.id });
    else if (act === "new-pack") openEditor({ kind: "pack", id: "", draft: { name: "", boxes: [] } });
    else if (act === "edit-pack") openEditor({ kind: "pack", id: el.dataset.id });
    else if (act === "new-ing") openEditor({ kind: "ing", id: "", draft: { name: "", store: "", packQty: 1, packUnit: "each", price: "", kcal: "", staple: false, every: 0, from: "", checked: "", sale: null } });
    else if (act === "edit-ing") openEditor({ kind: "ing", id: el.dataset.id });
  });
  // 卡片、表格行、日子用键盘也能打开
  on(document, "keydown", ".meals [role=button], .meals tr[data-act]", (e, el) => { if (e.key === "Enter" && e.target === el) el.click(); });

  on(document, "change", ".meals select[data-act=rough-add]", (e, el) => { if (el.value) roughAdd(el.dataset.week, el.value); });
  on(document, "input", ".meals textarea[data-act=rough-note]", (e, el) => store.saveWeek(el.dataset.week, { note: el.value }, "", { quiet: true }));
  on(document, "submit", ".meals .saleform", (e, form) => {
    e.preventDefault();
    const price = Number(form.price.value);
    if (!(price > 0) || !form.until.value) return;
    saleFor = "";
    store.checkDeal(form.dataset.id, { price, until: form.until.value });
  });

  // 编辑框
  on(document, "click", ".meal-editor [data-act]", (e, el) => {
    if (el.matches("select, input, textarea")) return;
    const act = el.dataset.act, D = store.meals(), row = rowOf(D);
    if (act === "del-meal" && row && editing.id) {
      const kind = editing.kind, id = editing.id;
      closeModal();
      store.deleteMeal(kind, id, "Deleted " + (row.name || "it"));
    }
    else if (act === "box-slot") update({ slot: el.dataset.v });
    else if (act === "part-add") update({ parts: [...(row.parts || []), { ing: "", qty: "" }] });
    else if (act === "part-del") update({ parts: (row.parts || []).filter((_, i) => i !== Number(el.dataset.i)) });
    else if (act === "ing-checked") update({ checked: store.today() });
    else if (act === "day-pack") store.setMealDay(weekOf(editing.date), editing.date, { pack: el.dataset.id });
    else if (act === "day-off") store.setMealDay(weekOf(editing.date), editing.date, D.days[editing.date]?.off ? null : { off: true });
    else if (act === "day-clear") store.setMealDay(weekOf(editing.date), editing.date, null);
  });
  on(document, "change", ".meal-editor [data-f]", (e, el) => {
    const f = el.dataset.f, row = rowOf(store.meals());
    if (!row) return;
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (f === "packQty" || f === "price" || f === "kcal") v = Math.max(0, Number(v) || 0);
    if (f === "name" || f === "store") v = String(v).trim();
    if (f === "every") {
      v = Number(v) || 0;
      update({ every: v, from: v && !row.from ? store.today() : row.from });
      return;
    }
    if (f === "salePrice" || f === "saleUntil") {
      const sale = { price: row.sale?.price || 0, from: row.sale?.from || store.today(), until: row.sale?.until || M.roundOf(row, store.today())?.end || addDays(store.today(), 6), ...(f === "salePrice" ? { price: Math.max(0, Number(v) || 0) } : { until: v }) };
      update({ sale: sale.price > 0 ? sale : null });
      return;
    }
    update({ [f]: v });
  });
  on(document, "change", ".meal-editor [data-part]", (e, el) => {
    const D = store.meals(), row = rowOf(D);
    if (!row) return;
    const i = Number(el.dataset.i), parts = (row.parts || []).map((p) => ({ ...p }));
    if (!parts[i]) return;
    if (el.dataset.part === "ing") {
      parts[i].ing = el.value;
      // 刚挑的东西还没填量：按个数的给 1，按克 / 毫升的给 100
      if (!(Number(parts[i].qty) > 0) && D.ing[el.value]) parts[i].qty = M.unitOf(D.ing[el.value]) === "each" ? 1 : 100;
    } else parts[i].qty = Math.max(0, Number(el.value) || 0);
    update({ parts });
  });
  on(document, "change", ".meal-editor [data-pbox]", (e, el) => {
    const row = rowOf(store.meals());
    if (!row) return;
    const boxes = [...(row.boxes || [])];
    boxes[Number(el.dataset.i)] = el.value;
    update({ boxes: boxes.filter(Boolean) });
  });
  on(document, "change", ".meal-editor [data-dbox]", (e, el) => {
    const D = store.meals(), date = editing.date;
    const boxes = [...M.boxesOfDay(D, D.days[date])];
    boxes[Number(el.dataset.i)] = el.value;
    const left = boxes.filter(Boolean);
    store.setMealDay(weekOf(date), date, left.length ? { boxes: left } : null);
  });
  on(document, "change", ".meal-editor [data-pf]", (e, el) => {
    store.setSetting("meal-prefs", { ...store.mealPrefs(), [el.dataset.pf]: Math.max(0, Number(el.value) || 0) });
  });
}
