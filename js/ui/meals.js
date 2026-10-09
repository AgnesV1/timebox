// Meals 页（电脑）：照 meal kit（HelloFresh 这类）的路子自己备餐，不记克数、不算卡路里数字——
//   Groceries（#meals/groceries）：常买的东西：哪个超市、一次买多少钱、够吃几天、热量低中高、几周一轮打折、这一轮看过没有
//   Boxes（#meals/boxes）：一个 Box = 一顿 = 几样东西（用量随便写），低中高自动定（也能手动），一天份大概多少钱
//   Plan（#meals）：最上面是「下次采购」的单子；然后是这一轮还没看的打折、这周和下周按天放 Box、之后四周四个框粗排
// 「下次采购」手机上也有：顶栏的 🛒 进 #shop，只列要买的东西（不写价钱和说明），在超市里打勾。

import * as store from "../store.js";
import * as M from "../meals.js";
import { esc, on, icon } from "../dom.js";
import { addDays, diffDays, fmtDay, fmtShort, startOfWeek, weekday, WEEKDAYS } from "../dates.js";
import { toast } from "./common.js";
import { openModal, closeModal, modalSheet } from "./modal.js";

let editing = null;   // 编辑框：{ kind: ing / box / day / prefs, id, draft, date }
let saleFor = "";     // 打折卡片里正在填打折价的那样

const TABS = [["plan", "Plan", "#meals"], ["boxes", "Boxes", "#meals/boxes"], ["groceries", "Groceries", "#meals/groceries"]];
const tabOf = () => { const t = location.hash.split("/")[1] || "plan"; return TABS.some(([k]) => k === t) ? t : "plan"; };
const money = (v) => "$" + (Number(v) || 0).toFixed(2);
const slotName = (s) => (M.SLOTS.find(([k]) => k === s) || ["", "Any"])[1];
const weekOf = (date) => startOfWeek(date, store.prefs().weekStartsOn);
const sel = (yes) => (yes ? " selected" : "");
const afterRender = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));   // 重画排在下一帧
const dot = (lv) => '<i class="lvdot lv-' + lv + '" title="' + M.levelName(lv) + '"></i>';
const SLOT_ORDER = Object.fromEntries(M.SLOTS.map(([k], i) => [k, i]));
const bySlot = (a, b) => (SLOT_ORDER[a.slot] ?? 9) - (SLOT_ORDER[b.slot] ?? 9) || M.byName(a, b);

function boxOptions(D, selected, empty = "—") {
  const groups = new Map();
  for (const b of Object.values(D.box).sort(bySlot)) {
    const k = slotName(b.slot);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  return '<option value="">' + empty + "</option>" + [...groups.entries()].map(([g, list]) => '<optgroup label="' + esc(g) + '">' +
    list.map((b) => '<option value="' + esc(b.id) + '"' + sel(b.id === selected) + ">" + esc(b.name || "Untitled") + "</option>").join("") + "</optgroup>").join("");
}

function ingOptions(D, selected, empty = "Pick a grocery…") {
  const groups = new Map();
  for (const i of Object.values(D.ing).sort(M.byStore)) { const k = i.store || "Anywhere"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
  return '<option value="">' + empty + "</option>" + [...groups.entries()].map(([g, list]) => '<optgroup label="' + esc(g) + '">' +
    list.map((i) => '<option value="' + esc(i.id) + '"' + sel(i.id === selected) + ">" + esc(i.name) + "</option>").join("") + "</optgroup>").join("");
}

// 一周里低中高各几个：一条三色的小条 + High 用了几个 / 限额
function levelsHTML(lv, allow) {
  if (!lv.low && !lv.mid && !lv.high) return "";
  const seg = (k) => (lv[k] ? '<i class="lv-' + k + '" style="flex-grow:' + lv[k] + '"></i>' : "");
  return '<span class="lvsum" title="Low ' + lv.low + " · Mid " + lv.mid + " · High " + lv.high + '"><span class="lvbar">' + seg("low") + seg("mid") + seg("high") + "</span>" +
    '<span class="' + (allow && lv.high > allow ? "over" : "") + '">High <b>' + lv.high + "</b>" + (allow ? "/" + allow : "") + "</span></span>";
}

// ---------- 页面 ----------

export function mealsHTML(c) {
  const D = store.meals(), tab = tabOf();
  const head = '<header class="page-head"><div><h2>Meals</h2></div><div class="tools"><nav class="mtabs">' +
    TABS.map(([k, l, href]) => '<a class="nav' + (tab === k ? " on" : "") + '" href="' + href + '">' + l + "</a>").join("") + "</nav>" +
    '<button type="button" class="icon-btn" data-act="meal-prefs" title="Shop day, budget, high boxes per week" aria-label="Meal settings">' + icon("settings") + "</button></div></header>";
  const body = tab === "boxes" ? boxesHTML(D, c) : tab === "groceries" ? groceriesHTML(D, c) : planHTML(D, c);
  return '<div class="meals">' + head + body + "</div>";
}

// #shop：只有「下次采购」的单子（手机从顶栏的 🛒 进来）
export function shopHTML(c, phone) {
  const head = phone ? '<header class="phead"><div class="l"><a class="nav" href="#today">‹ Today</a></div></header>'
    : '<header class="page-head"><div><h2>Shop</h2></div><div class="tools"><a class="nav" href="#meals">Meals</a></div></header>';
  return '<div class="meals shop-page' + (phone ? " phone-shop" : "") + '">' + head + nextShopHTML(store.meals(), c, phone) + "</div>";
}

// 手机顶栏 🛒 上的数字：下次采购还剩几样没买
export function shopCount(c) {
  const L = M.nextShop(store.meals(), c.today, weekOf(c.today), store.mealPrefs().shopDay);
  return L ? L.open : 0;
}

function introHTML(onGroceries = false) {
  return '<div class="empty big mintro"><p>Prep like a meal kit.</p><ol>' +
    "<li><b>Groceries</b> — what you usually buy: which store, price, how many days one buy lasts, Low / Mid / High, and how often it goes on sale.</li>" +
    "<li><b>Boxes</b> — one meal: a few groceries, amounts in your own words.</li>" +
    "<li><b>Plan</b> — drop boxes onto this week and next; rough out the four weeks after. The list for your next shop builds itself.</li></ol>" +
    '<div class="tools"><button type="button" class="btn cta" data-act="meal-examples">Start with examples</button>' +
    (onGroceries ? '<button type="button" class="btn" data-act="new-ing">Add my first grocery</button>' : '<a class="btn" href="#meals/groceries">Add my groceries</a>') + "</div></div>";
}

// ---------- 下次采购 ----------

function nextShopHTML(D, c, phone) {
  const pr = store.mealPrefs();
  const L = M.nextShop(D, c.today, weekOf(c.today), pr.shopDay);
  if (!L) return '<section class="mcard nextshop"><header><h3>Next shop</h3><span class="msub">This week and next are both shopped or skipped.</span></header></section>';
  const n = diffDays(c.today, L.shop);
  const when = n > 1 ? fmtDay(L.shop) + " · in " + n + " days" : n === 1 ? "Tomorrow" : n === 0 ? "Today" : fmtDay(L.shop) + " · " + -n + (n === -1 ? " day ago" : " days ago");
  const budget = Number(pr.budget) || 0;
  // 手机上只列东西：勾、名字、买几次；家里有的不列
  const phoneRow = (r) => r.state === "have" ? "" : '<li class="' + (r.state ? "st-" + r.state : "") + '"><label class="lname"><input type="checkbox" data-got="bought" data-week="' + L.start + '" data-id="' + esc(r.ing.id) + '" data-n="' + r.n + '"' + (r.state === "bought" ? " checked" : "") + ">" +
    "<span>" + esc(r.ing.name) + "</span>" + (r.n > 1 ? '<b class="lx">×' + r.n + "</b>" : "") + "</label></li>";
  const row = (r) => {
    const id = esc(r.ing.id);
    const note = [r.uses ? r.uses + (r.uses === 1 ? " day" : " days") + " of meals · one buy ≈ " + M.lastsOf(r.ing) + " days" : "",
      r.extra ? "added by hand" + (phone ? "" : ' <button type="button" class="link" data-act="shop-unadd" data-week="' + L.start + '" data-id="' + id + '">remove</button>') : ""].filter(Boolean).join(" · ");
    return '<li class="' + (r.state ? "st-" + r.state : "") + '">' +
      '<label class="lname"><input type="checkbox" data-got="bought" data-week="' + L.start + '" data-id="' + id + '" data-n="' + r.n + '"' + (r.state === "bought" ? " checked" : "") + (r.state === "have" ? " disabled" : "") + ">" +
      dot(M.levelOf(r.ing)) + "<span>" + esc(r.ing.name) + "</span>" + (r.n > 1 ? '<b class="lx">×' + r.n + "</b>" : "") + "</label>" +
      '<span class="lp">' + (r.state === "have" ? "—" : money(r.cost)) + (r.sale && r.state !== "have" ? ' <em class="saletag">sale</em>' : "") + "</span>" +
      '<button type="button" class="link" data-act="got-have" data-week="' + L.start + '" data-id="' + id + '">' + (r.state === "have" ? "Need it" : "Have it") + "</button>" +
      (note ? '<small class="lnote">' + note + "</small>" : "") + "</li>";
  };
  return '<section class="mcard nextshop"><header><h3>Next shop</h3>' +
    '<span class="shopday ' + (L.open && n <= 1 ? (n < 0 ? "late" : "due") : "") + '">' + esc(when) + "</span>" +
    (phone ? "" : '<span class="msub">for ' + fmtShort(L.from) + " – " + fmtShort(addDays(L.start, 6)) + "</span>" +
    '<span class="mw-sum"><span class="budget' + (budget && L.total > budget ? " over" : "") + '"><b>' + money(L.total) + "</b>" + (budget ? " / $" + budget : "") + "</span>" +
    (L.count ? "<span><b>" + L.open + "</b> of " + L.count + " left</span>" : "") + "</span>") +
    (L.count ? '<button type="button" class="btn primary" data-act="shopped" data-week="' + L.start + '">Mark shopped</button>' : "") + "</header>" +
    (L.count ? '<div class="mstores">' + L.groups.map((g) => "<section><h4>" + esc(g.store || "Anywhere") + (phone ? "" : " <small>" + money(g.cost) + "</small>") + "</h4><ul>" + g.items.map(phone ? phoneRow : row).join("") + "</ul></section>").join("") + "</div>"
      : '<p class="msub">Nothing to buy yet — put some boxes on the days.</p>') +
    (L.staples.length && !phone ? '<p class="msub staples">Have at home: ' + L.staples.map((i) => esc(i.name)).join(", ") + "</p>" : "") +
    (phone || !Object.keys(D.ing).length ? "" : '<div class="shopadd"><select data-act="shop-add" data-week="' + L.start + '" aria-label="Add a grocery to this shop">' + ingOptions(D, "", "+ Add something else…") + "</select></div>") +
    "</section>";
}

// ---------- Plan ----------

function planHTML(D, c) {
  if (!Object.keys(D.box).length && !Object.keys(D.ing).length) return introHTML();
  const pr = store.mealPrefs(), w0 = weekOf(c.today);
  const boxes = Object.values(D.box).sort(bySlot);
  const palette = boxes.length
    ? '<div class="mpalette"><span class="msub">Drag a box onto a day</span>' + boxes.map((b) =>
      '<span class="mpk" data-drag="box:' + esc(b.id) + '" title="' + esc((b.parts || []).map((p) => D.ing[p.ing]?.name).filter(Boolean).join(" · ")) + '">' +
      dot(M.boxLevel(D, b)) + "<b>" + esc(b.name || "Untitled") + "</b><small>" + slotName(b.slot) + "</small></span>").join("") + "</div>"
    : '<p class="mpalette msub">No boxes yet — <a href="#meals/boxes">make a few</a>, then drag them onto the days.</p>';
  return nextShopHTML(D, c, false) + dealsHTML(D, c.today) + palette +
    weekHTML(D, c, w0, "This week", pr) + weekHTML(D, c, addDays(w0, 7), "Next week", pr) +
    '<section class="mlater"><h3 class="msec">Later <small>four weeks, rough</small></h3><div class="rgrid">' +
    [2, 3, 4, 5].map((k) => roughHTML(D, addDays(w0, 7 * k), pr, boxes)).join("") + "</div></section>";
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

function weekHTML(D, c, start, label, pr) {
  const w = D.week[start] || {};
  const shop = M.shopDate(start, pr.shopDay, w.shopOn);
  const plan = M.weekPlan(D, start, shop);
  const status = w.skip ? '<span class="shopday skip">Skipped</span>'
    : w.shopped ? '<span class="shopday done">✓ Shopped</span><button type="button" class="link" data-act="unshop" data-week="' + start + '">undo</button>'
      : '<span class="shopday">Shop ' + fmtDay(shop) + "</span>";
  // 粗排时定好、还没放到哪天的：一键按早中晚填进空着的日子（过去的日子不填）
  const from = start < c.today ? c.today : start;
  const canFill = M.roughLeft(D, start, w).length && M.daysOf(start).some((d) => d >= from && !D.days[d]);
  const carry = (w.rough || []).filter((r) => D.box[r.box] && r.n > 0).map((r) => esc(D.box[r.box].name) + " ×" + r.n).join(" · ");
  return '<section class="mweek' + (w.skip ? " skip" : "") + '"><header class="mweek-head">' +
    '<div class="mw-title"><h3>' + label + '</h3><span class="msub">' + fmtShort(start) + " – " + fmtShort(addDays(start, 6)) + "</span></div>" + status +
    '<div class="mw-sum"><span><b>' + plan.planned + "</b>/7 days</span>" + (plan.planned ? "<span>≈ <b>" + money(plan.cost) + "</b> of food</span>" : "") +
    levelsHTML(plan.levels, Number(pr.high) || 0) + "</div>" +
    '<div class="tools"><button type="button" class="btn ghosty" data-act="skip-week" data-week="' + start + '">' + (w.skip ? "Unskip" : "Skip week") + "</button></div></header>" +
    ((carry && canFill) || w.note ? '<p class="carry">' + (carry && canFill ? "Planned earlier: " + carry + ' <button type="button" class="btn" data-act="fill-week" data-week="' + start + '">Fill empty days</button>' : "") +
      (w.note ? ' <span class="wnote">' + esc(w.note) + "</span>" : "") + "</p>" : "") +
    '<div class="mdays">' + plan.days.map((d) => dayHTML(D, c, d)).join("") + "</div></section>";
}

function dayHTML(D, c, d) {
  const off = d.entry?.off, n = d.boxes.length;
  const cls = ["mday", d.date === c.today && "today", d.date < c.today && "past", off && "off"].filter(Boolean).join(" ");
  return '<div class="' + cls + '" data-drop="mday:' + d.date + '" data-act="edit-day" data-date="' + d.date + '"' + (n ? ' data-drag="mcopy:' + d.date + '"' : "") + ' role="button" tabindex="0">' +
    '<div class="mday-head"><span>' + WEEKDAYS[weekday(d.date)] + "</span><b>" + Number(d.date.slice(8)) + "</b></div>" +
    (off ? '<p class="moff">Not cooking</p>'
      : n ? '<ul class="mbl">' + d.boxes.map((id) => '<li class="lv-' + M.boxLevel(D, D.box[id]) + '">' + esc(D.box[id].name || "Untitled") + "</li>").join("") + "</ul>" +
        '<div class="mday-foot"><span>≈ ' + money(d.cost) + "</span>" + (d.levels.high ? '<span class="hi">' + d.levels.high + " high</span>" : "") + "</div>"
      : '<p class="mempty">+ Add</p>') + "</div>";
}

function roughHTML(D, start, pr, boxes) {
  const w = D.week[start] || {};
  const shop = M.shopDate(start, pr.shopDay, w.shopOn);
  const t = M.roughTotals(D, w, shop), allow = Number(pr.high) || 0;
  const deals = M.roundsIn(D, start, addDays(start, 6));
  const chips = (w.rough || []).map((r, i) => D.box[r.box] ? '<span class="rchip">' + dot(M.boxLevel(D, D.box[r.box])) + "<b>" + esc(D.box[r.box].name || "Untitled") + "</b> ×" + r.n +
    '<button type="button" data-act="rough-dec" data-week="' + start + '" data-i="' + i + '" aria-label="One less">−</button>' +
    '<button type="button" data-act="rough-inc" data-week="' + start + '" data-i="' + i + '" aria-label="One more">+</button></span>' : "").join("");
  return '<article class="rweek' + (w.skip ? " skip" : "") + '" data-drop="mweek:' + start + '">' +
    "<header><b>" + fmtShort(start) + " – " + fmtShort(addDays(start, 6)) + '</b><button type="button" class="link" data-act="skip-week" data-week="' + start + '">' + (w.skip ? "Unskip" : "Skip") + "</button></header>" +
    '<p class="msub">Shop ' + fmtDay(shop) + "</p>" +
    (w.skip ? '<p class="skipped">Skipping this week</p>'
      : '<div class="rpacks">' + chips + (boxes.length ? '<select data-act="rough-add" data-week="' + start + '" aria-label="Add a box">' + boxOptions(D, "", "+ Box") + "</select>" : "") + "</div>" +
        '<p class="rsum"><b>' + t.meals + "</b> meals" + (t.meals ? " · " + levelsHTML(t.levels, allow) + " · ≈ " + money(t.cost) : "") + "</p>") +
    (deals.length ? '<p class="rdeals"><span>Deals due</span> ' + deals.map((x) => esc(x.ing.name) + " <small>" + fmtShort(x.start) + "</small>").join(", ") + "</p>" : "") +
    '<textarea data-act="rough-note" data-week="' + start + '" data-keep="rnote-' + start + '" rows="2" placeholder="Note — T&T run, eating out Fri…">' + esc(w.note || "") + "</textarea></article>";
}

// ---------- Boxes ----------

function boxesHTML(D, c) {
  const boxes = Object.values(D.box).sort(bySlot);
  if (!boxes.length && !Object.keys(D.ing).length) return introHTML();
  const card = (b) => {
    const lv = M.boxLevel(D, b);
    return '<article class="mbox lv-' + lv + '" data-act="edit-box" data-id="' + esc(b.id) + '" role="button" tabindex="0">' +
      "<header><b>" + esc(b.name || "Untitled") + '</b><span class="slot">' + slotName(b.slot) + "</span></header><ul>" +
      (b.parts || []).filter((p) => D.ing[p.ing]).map((p) => "<li>" + dot(M.levelOf(D.ing[p.ing])) + "<span>" + esc(D.ing[p.ing].name) + '</span><span class="q">' + esc(p.amt || "") + "</span></li>").join("") +
      '</ul><footer><span class="lvtag lv-' + lv + '">' + M.levelName(lv) + (b.level ? "" : " · auto") + "</span><span>≈ " + money(M.boxCost(D, b, c.today)) + "</span></footer></article>";
  };
  return '<header class="msec-head"><h3 class="msec">Boxes <small>one meal each — drag them onto the days in Plan</small></h3><button type="button" class="btn cta" data-act="new-box">' + icon("plus") + " Box</button></header>" +
    (boxes.length ? '<div class="mgrid">' + boxes.map(card).join("") + "</div>" : '<p class="empty">No boxes yet. A box is one meal: a few groceries, amounts in your own words.</p>');
}

// ---------- Groceries ----------

function groceriesHTML(D, c) {
  const ings = Object.values(D.ing).sort(M.byStore);
  const hasEx = ["ing", "box"].some((k) => Object.keys(D[k]).some((id) => id.startsWith("ex-")));
  const tools = '<div class="msec-head"><p class="msub">Low = veg &amp; fruit · Mid = normal · High = fried, fatty, sweet. One buy lasts = how many days of meals one purchase covers.</p><span class="tools">' +
    (hasEx ? '<button type="button" class="btn ghosty" data-act="meal-clear-examples">Remove examples</button>' : "") +
    '<button type="button" class="btn cta" data-act="new-ing">' + icon("plus") + " Grocery</button></span></div>";
  if (!ings.length) return tools + introHTML(true);
  const groups = new Map();
  for (const i of ings) { const k = String(i.store || "").trim(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
  const row = (i) => {
    const st = M.dealState(i, c.today), r = M.roundOf(i, c.today), lv = M.levelOf(i);
    const stText = st === "sale" ? "On sale till " + fmtShort(i.sale.until) : st === "checked" ? "Checked " + fmtShort(i.checked) : st === "check" ? "To check (" + fmtShort(r.start) + "–" + fmtShort(r.end) + ")" : "";
    return '<tr data-act="edit-ing" data-id="' + esc(i.id) + '" tabindex="0"><td><b>' + esc(i.name || "Untitled") + "</b>" + (i.staple ? ' <span class="stag">staple</span>' : "") + "</td>" +
      '<td class="r num">' + (st === "sale" ? "<s>" + money(i.price) + "</s> " + money(i.sale.price) : money(i.price)) + "</td>" +
      '<td class="num">' + M.lastsOf(i) + (Number(i.lasts) ? "" : '<small> (default)</small>') + " days</td>" +
      "<td>" + dot(lv) + " " + M.levelName(lv) + "</td>" +
      "<td>" + (Number(i.every) ? (Number(i.every) === 1 ? "Weekly" : "Every " + i.every + " wks") : '<span class="msub">—</span>') + "</td>" +
      '<td><span class="dstate d-' + st + '">' + esc(stText) + "</span></td></tr>";
  };
  return tools + '<table class="mtable"><thead><tr><th>Item</th><th class="r">Price</th><th>One buy lasts</th><th>Level</th><th>Deals</th><th>This round</th></tr></thead>' +
    [...groups.entries()].map(([s, list]) => '<tbody><tr class="mstore-row"><th colspan="6">' + esc(s || "Anywhere") + " <small>" + list.length + "</small></th></tr>" + list.map(row).join("") + "</tbody>").join("") + "</table>";
}

// ---------- 编辑框（一改就存；新建的有了名字才存） ----------

function rowOf(D) {
  if (!editing || (editing.kind !== "ing" && editing.kind !== "box")) return null;
  return editing.id ? D[editing.kind][editing.id] || null : editing.draft;
}

function footHTML(what) {
  return '<div class="sheet-foot">' + (editing.id ? '<button type="button" class="btn danger" data-act="del-meal">' + icon("trash") + " Delete " + what + "</button>" : "<span></span>") +
    '<button type="button" class="btn primary" data-modal-close>Done</button></div>';
}

const segHTML = (act, options, current) => '<span class="seg">' + options.map(([v, l]) => '<button type="button" data-act="' + act + '" data-v="' + v + '"' + (current === v ? ' class="on"' : "") + ">" + l + "</button>").join("") + "</span>";

function ingEditor(D, row) {
  const T = store.today(), r = M.roundOf(row, T);
  const stores = [...new Set([...M.STORES, ...Object.values(D.ing).map((i) => String(i.store || "").trim()).filter(Boolean)])];
  return '<h3 class="sheet-title">' + (editing.id ? esc(row.name || "Untitled") : "New grocery") + "</h3>" +
    '<div class="field-row"><label class="field"><span>Name</span><input data-f="name" data-k="name" value="' + esc(row.name || "") + '" placeholder="Chicken breast" autocomplete="off"></label>' +
    '<label class="field"><span>Store</span><input data-f="store" data-k="store" list="meal-stores" value="' + esc(row.store || "") + '" placeholder="Longo\'s" autocomplete="off"></label></div>' +
    '<datalist id="meal-stores">' + stores.map((s) => '<option value="' + esc(s) + '">').join("") + "</datalist>" +
    '<div class="field-row"><label class="field"><span>Price per buy ($)</span><input data-f="price" data-k="price" class="num" type="number" step="0.01" min="0" value="' + esc(row.price ?? "") + '" placeholder="0.00"></label>' +
    '<label class="field"><span>One buy lasts (days of meals)</span><input data-f="lasts" data-k="lasts" class="num" type="number" step="1" min="1" value="' + esc(row.lasts || "") + '" placeholder="7"></label></div>' +
    '<div class="field"><span>Calories</span>' + segHTML("ing-level", M.LEVELS.map(([k, l, ex]) => [k, l + " <small>" + ex + "</small>"]), M.levelOf(row)) + "</div>" +
    '<p class="hint">≈ ' + money(M.useCost(row, T)) + " per day of meals.</p>" +
    '<label class="check"><input type="checkbox" data-f="staple" data-k="staple"' + (row.staple ? " checked" : "") + "> Staple — always at home (oil, salt, soy sauce): not on shopping lists, not counted in a box's level</label>" +
    '<h4 class="msub-h">Deals</h4>' +
    '<div class="field-row"><label class="field"><span>New deal round</span><select data-f="every" data-k="every">' +
    M.EVERY.map((n) => '<option value="' + n + '"' + sel((Number(row.every) || 0) === n) + ">" + (n === 0 ? "Don't track" : n === 1 ? "Every week (flyer)" : "Every " + n + " weeks") + "</option>").join("") + "</select></label>" +
    (Number(row.every) ? '<label class="field"><span>A round started on</span><input data-f="from" data-k="from" type="date" value="' + esc(row.from || "") + '"></label>' : "<span></span>") + "</div>" +
    (r ? '<p class="hint">This round: ' + fmtShort(r.start) + " – " + fmtShort(r.end) + " · " + (row.checked && row.checked >= r.start ? "checked " + fmtShort(row.checked) : "not checked yet") +
      ' <button type="button" class="link" data-act="ing-checked">Checked today</button></p>' : "") +
    '<div class="field-row"><label class="field"><span>Sale price</span><input data-f="salePrice" data-k="salePrice" class="num" type="number" step="0.01" min="0" value="' + esc(row.sale?.price || "") + '" placeholder="Not on sale"></label>' +
    '<label class="field"><span>Sale until</span><input data-f="saleUntil" data-k="saleUntil" type="date" value="' + esc(row.sale?.until || "") + '"></label></div>' +
    footHTML("grocery");
}

function boxEditor(D, row) {
  const T = store.today(), auto = M.autoLevel(D, row), lv = M.boxLevel(D, row);
  const parts = row.parts || [];
  return '<h3 class="sheet-title">' + (editing.id ? esc(row.name || "Untitled") : "New box") + ' <small><span class="lvtag lv-' + lv + '">' + M.levelName(lv) + "</span> ≈ " + money(M.boxCost(D, row, T)) + "</small></h3>" +
    '<div class="field-row"><label class="field"><span>Name</span><input data-f="name" data-k="name" value="' + esc(row.name || "") + '" placeholder="Chicken rice bowl" autocomplete="off"></label>' +
    '<div class="field"><span>Meal</span>' + segHTML("box-slot", [...M.SLOTS, ["", "Any"]], row.slot || "") + "</div></div>" +
    '<div class="field"><span>Calories</span>' + segHTML("box-level", [["", "Auto · " + M.levelName(auto)], ...M.LEVELS.map(([k, l]) => [k, l])], row.level || "") + "</div>" +
    '<p class="hint">Auto = as heavy as its heaviest grocery, one level lighter if at least half of it is Low. Staples don\'t count.</p>' +
    '<div class="field"><span>What goes in</span>' +
    (Object.keys(D.ing).length ? '<table class="parts">' + parts.map((p, i) => {
      const ing = D.ing[p.ing];
      return '<tr><td><select data-part="ing" data-i="' + i + '" data-k="ping-' + i + '">' + ingOptions(D, p.ing) + "</select></td>" +
        '<td><input data-part="amt" data-i="' + i + '" data-k="pamt-' + i + '" value="' + esc(p.amt || "") + '" placeholder="1 cup, a handful…" autocomplete="off"></td>' +
        "<td>" + (ing ? dot(M.levelOf(ing)) : "") + '</td><td class="r num">' + (ing ? "≈ " + money(M.useCost(ing, T)) : "") + "</td>" +
        '<td><button type="button" class="icon-btn" data-act="part-del" data-i="' + i + '" aria-label="Remove">' + icon("close") + "</button></td></tr>";
    }).join("") + "</table>" + '<button type="button" class="btn" data-act="part-add">' + icon("plus") + " Grocery</button>"
      : '<p class="hint">No groceries yet — <a href="#meals/groceries" data-modal-close>add what you buy</a> first.</p>') + "</div>" +
    '<label class="field"><span>How to make it</span><textarea data-f="note" data-k="note" rows="2" placeholder="Roast 25 min at 425°F, portion into 4 boxes…">' + esc(row.note || "") + "</textarea></label>" +
    footHTML("box");
}

function dayEditor(D) {
  const date = editing.date, entry = D.days[date] || null;
  const ids = M.boxesOfDay(D, entry);
  const shown = ids.length < 6 ? [...ids, ""] : ids;
  const t = M.sumBoxes(D, ids, date);
  return '<h3 class="sheet-title">' + fmtDay(date) + (ids.length ? " <small>≈ " + money(t.cost) + "</small>" : "") + "</h3>" +
    (Object.keys(D.box).length ? '<div class="field"><span>Boxes</span>' + shown.map((id, i) => '<div class="pslot"><span class="num">' + (i + 1) + "</span>" +
      '<select data-dbox data-i="' + i + '" data-k="dbox-' + i + '">' + boxOptions(D, id, i < ids.length ? "— remove" : "+ Add a box") + "</select>" +
      "<span>" + (D.box[id] ? dot(M.boxLevel(D, D.box[id])) + " " + M.levelName(M.boxLevel(D, D.box[id])) : "") + "</span></div>").join("") + "</div>"
      : '<p class="hint">No boxes yet — <a href="#meals/boxes" data-modal-close>make some</a> first.</p>') +
    '<div class="sheet-foot"><span class="tools"><button type="button" class="btn' + (entry?.off ? " on" : "") + '" data-act="day-off">' + (entry?.off ? "Cooking after all" : "Not cooking") + "</button>" +
    (entry ? '<button type="button" class="btn ghosty" data-act="day-clear">Clear</button>' : "") + "</span>" +
    '<button type="button" class="btn primary" data-modal-close>Done</button></div>';
}

function prefsEditor() {
  const pr = store.mealPrefs();
  return '<h3 class="sheet-title">Meal settings</h3>' +
    '<div class="field-row three"><label class="field"><span>Shop day</span><select data-pf="shopDay" data-k="shopDay">' + WEEKDAYS.map((d, i) => '<option value="' + i + '"' + sel(Number(pr.shopDay) === i) + ">" + d + "</option>").join("") + "</select></label>" +
    '<label class="field"><span>High boxes per week</span><input data-pf="high" data-k="high" class="num" type="number" min="0" step="1" value="' + (Number(pr.high) ? esc(pr.high) : "") + '" placeholder="No limit"></label>' +
    '<label class="field"><span>Budget per week ($)</span><input data-pf="budget" data-k="budget" class="num" type="number" min="0" step="5" value="' + (Number(pr.budget) ? esc(pr.budget) : "") + '" placeholder="No budget"></label></div>' +
    '<p class="hint">Shop day works like a meal kit\'s cutoff: plan each week by its shop day — the last one on or before the week starts (a week starts on the day set in Settings). ' +
    "High boxes per week is your allowance for fried, fatty or sweet meals; the week bar turns red past it.</p>" +
    '<div class="sheet-foot"><span></span><button type="button" class="btn primary" data-modal-close>Done</button></div>';
}

function editorHTML() {
  const D = store.meals();
  if (editing.kind === "day") return dayEditor(D);
  if (editing.kind === "prefs") return prefsEditor();
  const row = rowOf(D);
  if (!row) return "";
  return editing.kind === "ing" ? ingEditor(D, row) : boxEditor(D, row);
}

function openEditor(e) {
  editing = e;
  openModal('<div class="meal-editor">' + editorHTML() + "</div>", { wide: e.kind === "ing" || e.kind === "box", close: () => { editing = null; } });
  modalSheet()?.querySelector("[data-k=name]")?.focus();
}

// 编辑框重画（自己改的、同步拉下来的）：焦点留在原来那个，正在打字的那格留住。按钮没有 data-k，就按 data-act 认
const keyOf = (el) => el?.dataset?.k || (el?.dataset?.act ? "act:" + el.dataset.act + ":" + (el.dataset.i ?? el.dataset.v ?? el.dataset.id ?? "") : "");

export function refreshMealEditor() {
  const box = modalSheet()?.querySelector(".meal-editor");
  if (!box || !editing) return;
  if ((editing.kind === "ing" || editing.kind === "box") && !rowOf(store.meals())) { closeModal(); return; }
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
  const cur = rowOf(store.meals());
  if (!cur) return;
  const next = { ...cur, ...patch };
  if (editing.id) { store.saveMeal(editing.kind, next, label); return; }
  if (!String(next.name || "").trim()) { editing.draft = next; refreshMealEditor(); return; }
  editing.id = store.saveMeal(editing.kind, { ...next, id: "" });
  editing.draft = null;
}

// ---------- 拖放（dnd.js 转过来的）：Box → 某天（加一个）/ 之后某周（粗排 +1）；拖某天 → 复制到另一天 ----------

export function mealDrop(payload, target) {
  const i = payload.indexOf(":"), kind = payload.slice(0, i), id = payload.slice(i + 1);
  const j = target.indexOf(":"), tk = target.slice(0, j), tid = target.slice(j + 1);
  const D = store.meals();
  if (tk === "mday") {
    if (kind === "box" && D.box[id]) store.setMealDay(weekOf(tid), tid, { boxes: [...M.boxesOfDay(D, D.days[tid]), id] });
    if (kind === "mcopy" && id !== tid && D.days[id]) { store.setMealDay(weekOf(tid), tid, { ...D.days[id] }); toast("Copied to " + fmtDay(tid)); }
  }
  if (tk === "mweek" && kind === "box" && D.box[id]) roughAdd(tid, id);
}

function roughAdd(start, boxId) {
  store.saveWeek(start, (w) => {
    const rough = (w.rough || []).map((r) => ({ ...r }));
    const hit = rough.find((r) => r.box === boxId);
    if (hit) hit.n = Math.min(21, (Number(hit.n) || 0) + 1);
    else rough.push({ box: boxId, n: 1 });
    return { rough };
  });
}

// 标「已采购」：还没勾的都算买了（按单子上的次数），以后几周就知道哪些还够吃
function markShopped(start) {
  const D = store.meals(), T = store.today();
  const L = M.shopList(D, start, store.mealPrefs().shopDay, start < T ? T : start);
  store.saveWeek(start, (w) => {
    const got = { ...(w.got || {}) };
    for (const g of L.groups) for (const r of g.items) if (!r.state) got[r.ing.id] = { n: r.n };
    return { got, shopped: true };
  }, "Shopped ✓");
}

// ---------- 事件 ----------

export function initMeals(rerender) {
  on(document, "click", ".meals [data-act]", (e, el) => {
    if (el.matches("select, textarea, input")) return;
    const act = el.dataset.act, D = store.meals(), T = store.today();
    const start = el.dataset.week, id = el.dataset.id;
    if (act === "meal-examples") store.addMealExamples(M.examples(T, weekOf(T), D));
    else if (act === "meal-clear-examples") store.clearMealExamples();
    else if (act === "meal-prefs") openEditor({ kind: "prefs" });
    else if (act === "deal-none") store.checkDeal(id, null);
    else if (act === "deal-sale") { saleFor = id; rerender(); afterRender(() => document.querySelector(".saleform [name=price]")?.select()); }
    else if (act === "sale-cancel") { saleFor = ""; rerender(); }
    else if (act === "edit-day") openEditor({ kind: "day", date: el.dataset.date });
    else if (act === "shopped") markShopped(start);
    else if (act === "unshop") store.saveWeek(start, { shopped: false });
    else if (act === "skip-week") store.saveWeek(start, (w) => ({ skip: !w.skip }), D.week[start]?.skip ? "" : "Week skipped");
    else if (act === "got-have") store.saveWeek(start, (w) => { const got = { ...(w.got || {}) }; if (got[id] === "have") delete got[id]; else got[id] = "have"; return { got }; });
    else if (act === "shop-unadd") store.saveWeek(start, (w) => { const extra = { ...(w.extra || {}) }; extra[id] = (Number(extra[id]) || 0) - 1; if (extra[id] <= 0) delete extra[id]; return { extra }; });
    else if (act === "fill-week") {
      const days = M.fillFromRough(D, start, D.week[start], start < T ? T : start);
      const n = Object.keys(days).length;
      if (n) store.saveWeek(start, (w) => ({ days: { ...(w.days || {}), ...days } }), "Filled " + n + (n === 1 ? " day" : " days"));
    }
    else if (act === "rough-inc" || act === "rough-dec") {
      const i = Number(el.dataset.i);
      store.saveWeek(start, (w) => {
        const rough = (w.rough || []).map((r) => ({ ...r }));
        if (!rough[i]) return {};
        rough[i].n = Math.min(21, (Number(rough[i].n) || 0) + (act === "rough-inc" ? 1 : -1));
        return { rough: rough.filter((r) => r.n > 0) };
      });
    }
    else if (act === "new-box") openEditor({ kind: "box", id: "", draft: { name: "", slot: "", level: "", parts: [{ ing: "", amt: "" }], note: "" } });
    else if (act === "edit-box") openEditor({ kind: "box", id });
    else if (act === "new-ing") openEditor({ kind: "ing", id: "", draft: { name: "", store: "", price: "", lasts: "", level: "mid", staple: false, every: 0, from: "", checked: "", sale: null } });
    else if (act === "edit-ing") openEditor({ kind: "ing", id });
  });
  // 卡片、表格行、日子用键盘也能打开
  on(document, "keydown", ".meals [role=button], .meals tr[data-act]", (e, el) => { if (e.key === "Enter" && e.target === el) el.click(); });

  // 下次采购：勾 = 买了（记下买了几次）
  on(document, "change", ".meals input[data-got]", (e, el) => {
    const id = el.dataset.id;
    store.saveWeek(el.dataset.week, (w) => {
      const got = { ...(w.got || {}) };
      if (el.checked) got[id] = { n: Number(el.dataset.n) || 1 };
      else delete got[id];
      return { got };
    });
  });
  on(document, "change", ".meals select[data-act=shop-add]", (e, el) => {
    const id = el.value;
    if (id) store.saveWeek(el.dataset.week, (w) => ({ extra: { ...(w.extra || {}), [id]: (Number(w.extra?.[id]) || 0) + 1 } }));
  });
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
    else if (act === "box-level") update({ level: el.dataset.v });
    else if (act === "ing-level") update({ level: el.dataset.v });
    else if (act === "part-add") update({ parts: [...(row.parts || []), { ing: "", amt: "" }] });
    else if (act === "part-del") update({ parts: (row.parts || []).filter((_, i) => i !== Number(el.dataset.i)) });
    else if (act === "ing-checked") update({ checked: store.today() });
    else if (act === "day-off") store.setMealDay(weekOf(editing.date), editing.date, D.days[editing.date]?.off ? null : { off: true });
    else if (act === "day-clear") store.setMealDay(weekOf(editing.date), editing.date, null);
  });
  on(document, "change", ".meal-editor [data-f]", (e, el) => {
    const f = el.dataset.f, row = rowOf(store.meals());
    if (!row) return;
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (f === "price") v = Math.max(0, Number(v) || 0);
    if (f === "lasts") v = Math.max(0, Math.round(Number(v) || 0)) || "";
    if (f === "name" || f === "store") v = String(v).trim();
    if (f === "every") {
      v = Number(v) || 0;
      update({ every: v, from: v && !row.from ? store.today() : row.from });
      return;
    }
    if (f === "salePrice" || f === "saleUntil") {
      const T = store.today();
      const sale = { price: row.sale?.price || 0, from: row.sale?.from || T, until: row.sale?.until || M.roundOf(row, T)?.end || addDays(T, 6), ...(f === "salePrice" ? { price: Math.max(0, Number(v) || 0) } : { until: v }) };
      update({ sale: sale.price > 0 ? sale : null });
      return;
    }
    update({ [f]: v });
  });
  on(document, "change", ".meal-editor [data-part]", (e, el) => {
    const row = rowOf(store.meals());
    if (!row) return;
    const i = Number(el.dataset.i), parts = (row.parts || []).map((p) => ({ ...p }));
    if (!parts[i]) return;
    parts[i][el.dataset.part] = el.dataset.part === "amt" ? el.value.trim() : el.value;
    update({ parts });
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
