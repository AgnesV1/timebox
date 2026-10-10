// Meals 页（电脑）：照 meal kit（HelloFresh 这类）的路子自己备餐，不记克数、不算卡路里数字——
//   Groceries（#meals/groceries）：常买的东西：哪个超市、一次买多少钱、够吃几天、热量低中高、几周一轮打折、这一轮看过没有
//   Boxes（#meals/boxes）：一个 Box = 一顿 = 几样东西（用量随便写），低中高自动定（也能手动），一天份大概多少钱；
//     左边一排架子按类别摆着常买的东西，拖到 Box 上就加进去；每类最前面的「Any meat」= 随便哪种，买的时候再挑
//   Plan（#meals）：最上面是「下次采购」的单子；然后是这一轮还没看的打折、这周和下周按天放 Box、之后四周四个框粗排
//   Restock（#meals/restock）：规律要换 / 要补的非食物：价格、每隔多久、下次哪天；最上面按月列接下来三个月要花的
// 「下次采购」手机上也有：顶栏的 🛒 进 #shop，只列要买的东西（不写价钱和说明，写了备注的带着备注），在超市里打勾；下面挤着一张「Coming up」。

import * as store from "../store.js";
import * as M from "../meals.js";
import { esc, on, icon } from "../dom.js";
import { addDays, diffDays, fmtDay, fmtShort, startOfWeek, weekday, WEEKDAYS } from "../dates.js";
import { toast } from "./common.js";
import { openModal, closeModal, modalSheet } from "./modal.js";

let editing = null;   // 编辑框：{ kind: ing / box / day / prefs, id, draft, date }
let saleFor = "";     // 打折卡片里正在填打折价的那样
let noteFor = "";     // 采购单上正在写备注的那行：周|id

const TABS = [["plan", "Plan", "#meals"], ["boxes", "Boxes", "#meals/boxes"], ["groceries", "Groceries", "#meals/groceries"], ["restock", "Restock", "#meals/restock"]];
const tabOf = () => { const t = location.hash.split("/")[1] || "plan"; return TABS.some(([k]) => k === t) ? t : "plan"; };
const money = (v) => "$" + (Number(v) || 0).toFixed(2);
const money0 = (v) => "$" + Math.round(Number(v) || 0);
const fmtDue = (d, T) => fmtDay(d) + (d.slice(0, 4) === T.slice(0, 4) ? "" : ", " + d.slice(0, 4));
const dueText = (d, T) => { const n = diffDays(T, d); return n > 1 ? "in " + n + " days" : n === 1 ? "tomorrow" : n === 0 ? "today" : -n + (n === -1 ? " day late" : " days late"); };
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

function ingOptions(D, selected, empty = "Pick a grocery…", any = false) {
  const anys = any ? '<optgroup label="Any of a type">' + Object.keys(M.ANY).map((k) => '<option value="' + M.anyId(k) + '"' + sel(selected === M.anyId(k)) + ">Any " + M.catName(k).toLowerCase() + "</option>").join("") + "</optgroup>" : "";
  const groups = new Map();
  for (const i of Object.values(D.ing).sort(M.byStore)) { const k = i.store || "Anywhere"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
  return '<option value="">' + empty + "</option>" + anys + [...groups.entries()].map(([g, list]) => '<optgroup label="' + esc(g) + '">' +
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
  const body = tab === "boxes" ? boxesHTML(D, c) : tab === "groceries" ? groceriesHTML(D, c) : tab === "restock" ? restockHTML(D, c) : planHTML(D, c);
  return '<div class="meals">' + head + body + "</div>";
}

// #shop：只有「下次采购」的单子（手机从顶栏的 🛒 进来）
export function shopHTML(c, phone) {
  const head = phone ? '<header class="phead"><div class="l"><a class="nav" href="#today">‹ Today</a></div></header>'
    : '<header class="page-head"><div><h2>Shop</h2></div><div class="tools"><a class="nav" href="#meals">Meals</a></div></header>';
  return '<div class="meals shop-page' + (phone ? " phone-shop" : "") + '">' + head + nextShopHTML(store.meals(), c, phone) + comingHTML(store.meals(), c) + "</div>";
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
    "<span>" + esc(r.ing.name) + "</span>" + (r.n > 1 ? '<b class="lx">×' + r.n + "</b>" : "") + "</label>" + (r.note ? '<small class="lmemo-text">' + esc(r.note) + "</small>" : "") + "</li>";
  const row = (r) => {
    const id = esc(r.ing.id);
    const picks = r.ing.any ? M.onSaleNow(D, L.shop).filter((i) => i.cat === r.ing.any).map((i) => esc(i.name)) : [];
    const note = [r.ing.any ? (picks.length ? "on sale: " + picks.join(", ") : "pick any at the store")
      : r.ing.keep ? "always in stock · one buy ≈ " + M.lastsOf(r.ing) + " days"
        : r.uses ? r.uses + (r.uses === 1 ? " day" : " days") + " of meals · one buy ≈ " + M.lastsOf(r.ing) + " days" : "",
      r.extra ? "added by hand" + (phone ? "" : ' <button type="button" class="link" data-act="shop-unadd" data-week="' + L.start + '" data-id="' + id + '">remove</button>') : ""].filter(Boolean);
    // 备注：笼统的（Any meat、蔬菜这种一直要有的）直接给一格写；别的点「+ note」才出来
    const key = L.start + "|" + r.ing.id, at = ' data-week="' + L.start + '" data-id="' + id + '"', loose = r.ing.any || r.ing.keep;
    const writing = noteFor === key || (loose && !r.state);
    if (!writing && !r.note) note.push('<button type="button" class="link" data-act="memo-edit"' + at + ">+ note</button>");
    const memo = writing ? '<input class="lmemo" data-memo' + at + ' data-keep="memo-' + esc(key) + '" value="' + esc(r.note) + '" placeholder="' + (loose ? "Which ones? Note it here" : "Note") + '" autocomplete="off" aria-label="Note for ' + esc(r.ing.name) + '">'
      : r.note ? '<button type="button" class="lmemo-text" data-act="memo-edit"' + at + ' title="Edit note">' + esc(r.note) + "</button>" : "";
    return '<li class="' + (r.state ? "st-" + r.state : "") + '">' +
      '<label class="lname"><input type="checkbox" data-got="bought" data-week="' + L.start + '" data-id="' + id + '" data-n="' + r.n + '"' + (r.state === "bought" ? " checked" : "") + (r.state === "have" ? " disabled" : "") + ">" +
      dot(M.levelOf(r.ing)) + "<span>" + esc(r.ing.name) + "</span>" + (r.n > 1 ? '<b class="lx">×' + r.n + "</b>" : "") + "</label>" +
      '<span class="lp">' + (r.state === "have" ? "—" : money(r.cost)) + (r.sale && r.state !== "have" ? ' <em class="saletag">sale</em>' : "") + "</span>" +
      '<button type="button" class="link" data-act="got-have" data-week="' + L.start + '" data-id="' + id + '">' + (r.state === "have" ? "Need it" : "Have it") + "</button>" +
      (note.length ? '<small class="lnote">' + note.join(" · ") + "</small>" : "") + memo + "</li>";
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
      '<span class="mpk" data-drag="box:' + esc(b.id) + '" title="' + esc((b.parts || []).map((p) => M.partIng(D, p)?.name).filter(Boolean).join(" · ")) + '">' +
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

// 架子：常买的东西按类别摆好，拖到右边的 Box 上；每类最前面是「随便哪种」
function shelfHTML(D) {
  const catOf = (i) => (M.CATS.some(([k]) => k === i.cat) ? i.cat : "");
  const chip = (drag, lv, name, any) => '<span class="mpk' + (any ? " any" : "") + '" data-drag="' + drag + '">' + dot(lv) + "<b>" + name + "</b></span>";
  return '<aside class="mshelf"><p class="msub">Drag onto a box</p>' + [...M.CATS, ["", "Other"]].map(([k, l]) => {
    const list = Object.values(D.ing).filter((i) => catOf(i) === k).sort(M.byName);
    if (!list.length && !M.ANY[k]) return "";
    return "<section><h4>" + l + '</h4><div class="mbin">' + (M.ANY[k] ? chip("any:" + k, M.ANY[k], "Any " + l.toLowerCase(), true) : "") +
      list.map((i) => chip("ing:" + esc(i.id), M.levelOf(i), esc(i.name || "Untitled"))).join("") + "</div></section>";
  }).join("") + "</aside>";
}

function boxesHTML(D, c) {
  const boxes = Object.values(D.box).sort(bySlot);
  if (!boxes.length && !Object.keys(D.ing).length) return introHTML();
  const card = (b) => {
    const lv = M.boxLevel(D, b);
    return '<article class="mbox lv-' + lv + '" data-drop="mbox:' + esc(b.id) + '" data-act="edit-box" data-id="' + esc(b.id) + '" role="button" tabindex="0">' +
      "<header><b>" + esc(b.name || "Untitled") + '</b><span class="slot">' + slotName(b.slot) + "</span></header><ul>" +
      (b.parts || []).map((p) => [p, M.partIng(D, p, c.today)]).filter(([, i]) => i).map(([p, i]) => "<li" + (p.any ? ' class="any"' : "") + ">" + dot(M.levelOf(i)) + "<span>" + esc(i.name) + '</span><span class="q">' + esc(p.amt || "") + "</span></li>").join("") +
      '</ul><footer><span class="lvtag lv-' + lv + '">' + M.levelName(lv) + (b.level ? "" : " · auto") + "</span><span>≈ " + money(M.boxCost(D, b, c.today)) + "</span></footer></article>";
  };
  return '<header class="msec-head"><h3 class="msec">Boxes <small>one meal each — drag them onto the days in Plan</small></h3><button type="button" class="btn cta" data-act="new-box">' + icon("plus") + " Box</button></header>" +
    '<div class="mboxwrap">' + shelfHTML(D) + '<div class="mgrid">' + boxes.map(card).join("") +
    '<div class="mnew" data-drop="mbox:new" data-act="new-box" role="button" tabindex="0"><b>+ New box</b><small>or drop a grocery here</small></div></div></div>';
}

// ---------- Groceries ----------

function groceriesHTML(D, c) {
  const ings = Object.values(D.ing).sort(M.byStore);
  const hasEx = ["ing", "box"].some((k) => Object.keys(D[k]).some((id) => id.startsWith("ex-")));
  const tools = '<div class="msec-head"><p class="msub">Low = veg &amp; fruit · Mid = normal · High = fried, fatty, sweet. One buy lasts = how many days of meals one purchase covers.</p><span class="tools">' +
    (hasEx ? '<button type="button" class="btn ghosty" data-act="meal-clear-examples">Remove examples</button>' : "") +
    '<button type="button" class="btn ghosty" data-act="meal-import">Import a list</button>' +
    '<button type="button" class="btn cta" data-act="new-ing">' + icon("plus") + " Grocery</button></span></div>";
  if (!ings.length) return tools + introHTML(true);
  const groups = new Map();
  for (const i of ings) { const k = String(i.store || "").trim(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
  const row = (i) => {
    const st = M.dealState(i, c.today), r = M.roundOf(i, c.today), lv = M.levelOf(i);
    const stText = st === "sale" ? "On sale till " + fmtShort(i.sale.until) : st === "checked" ? "Checked " + fmtShort(i.checked) : st === "check" ? "To check (" + fmtShort(r.start) + "–" + fmtShort(r.end) + ")" : "";
    return '<tr data-act="edit-ing" data-id="' + esc(i.id) + '" tabindex="0"><td><b>' + esc(i.name || "Untitled") + "</b>" + (i.keep ? ' <span class="stag">always</span>' : i.staple ? ' <span class="stag">staple</span>' : "") + "</td>" +
      "<td>" + (i.cat ? M.catName(i.cat) : '<span class="msub">—</span>') + "</td>" +
      '<td class="r num">' + (st === "sale" ? "<s>" + money(i.price) + "</s> " + money(i.sale.price) : money(i.price)) + "</td>" +
      '<td class="num">' + M.lastsOf(i) + (Number(i.lasts) ? "" : '<small> (default)</small>') + " days</td>" +
      "<td>" + dot(lv) + " " + M.levelName(lv) + "</td>" +
      "<td>" + (Number(i.every) ? (Number(i.every) === 1 ? "Weekly" : "Every " + i.every + " wks") : '<span class="msub">—</span>') + "</td>" +
      '<td><span class="dstate d-' + st + '">' + esc(stText) + "</span></td></tr>";
  };
  return tools + '<table class="mtable"><thead><tr><th>Item</th><th>Type</th><th class="r">Price</th><th>One buy lasts</th><th>Level</th><th>Deals</th><th>This round</th></tr></thead>' +
    [...groups.entries()].map(([s, list]) => '<tbody><tr class="mstore-row"><th colspan="7">' + esc(s || "Anywhere") + " <small>" + list.length + "</small></th></tr>" + list.map(row).join("") + "</tbody>").join("") + "</table>";
}

// ---------- Restock：规律要换 / 要补的东西 ----------

// 接下来三个月要花的，按月挤在一起（手机上接在采购单下面，电脑上在 Restock 页最上面）；只看不点
function comingHTML(D, c) {
  if (!Object.keys(D.sup).length) return "";
  const C = M.coming(D, c.today, 3);
  const chip = (x) => '<span class="cchip" title="' + esc(fmtDue(x.date, c.today)) + '"><b>' + esc(x.sup.name || "Untitled") + "</b>" + (Number(x.sup.price) ? " " + money0(x.sup.price) : "") + "</span>";
  const line = (label, total, items, cls) => '<div class="cmonth' + cls + '"><span class="cm"><b>' + label + "</b>" + (total ? money0(total) : "") + '</span><span class="cchips">' + items.map(chip).join("") + "</span></div>";
  const months = C.months.filter((m) => m.items.length);   // 没东西的月份不占一行
  return '<section class="mcard mcoming"><header><h3>Coming up</h3><span class="msub">next 3 months</span></header>' +
    (C.overdue.length ? line("Overdue", C.overdue.reduce((a, x) => a + (Number(x.sup.price) || 0), 0), C.overdue, " late") : "") +
    months.map((m) => line(m.label, m.total, m.items, "")).join("") +
    (C.overdue.length || months.length ? "" : '<p class="msub">Nothing due in the next three months.</p>') + "</section>";
}

function restockHTML(D, c) {
  const list = Object.values(D.sup).sort((a, b) => (!a.next - !b.next) || String(a.next || "").localeCompare(String(b.next || "")) || M.byName(a, b));
  const dash = '<span class="msub">—</span>';
  const tools = '<div class="msec-head"><p class="msub">Things you replace or restock on a cycle — vitamins, brush heads, a phone. What it costs, how often, and when it\'s next due.</p>' +
    '<span class="tools"><button type="button" class="btn cta" data-act="new-sup">' + icon("plus") + " Item</button></span></div>";
  if (!list.length) return tools + '<p class="empty">Nothing here yet. Add what you replace on a schedule: the next three months of spending show up here, and on your phone under the shopping list.</p>';
  const row = (s) => '<tr data-act="edit-sup" data-id="' + esc(s.id) + '" tabindex="0"><td><b>' + esc(s.name || "Untitled") + "</b>" + (s.note ? " <small>" + esc(s.note) + "</small>" : "") + "</td>" +
    "<td>" + (s.store ? esc(s.store) : dash) + '</td><td class="r num">' + (Number(s.price) ? money(s.price) : dash) + "</td><td>" + (M.cycleText(s) || dash) + "</td>" +
    "<td>" + (s.next ? '<span class="num">' + fmtDue(s.next, c.today) + '</span> <span class="dstate ' + (s.next < c.today ? "d-check" : "d-checked") + '">' + dueText(s.next, c.today) + "</span>" : dash) + "</td>" +
    '<td class="r">' + (M.nextAfter(c.today, s) ? '<button type="button" class="chip" data-act="sup-done" data-id="' + esc(s.id) + '" title="Replaced or restocked today: move the next date one cycle on">Replaced</button>' : "") + "</td></tr>";
  return tools + comingHTML(D, c) + '<table class="mtable"><thead><tr><th>Item</th><th>Where</th><th class="r">Price</th><th>How often</th><th>Next</th><th></th></tr></thead><tbody>' + list.map(row).join("") + "</tbody></table>";
}

function supEditor(D, row) {
  const T = store.today(), then = row.next ? M.nextAfter(row.next, row) : "";
  const stores = [...new Set([...M.STORES, "Amazon", ...Object.values(D.sup).map((s) => String(s.store || "").trim()).filter(Boolean)])];
  return '<h3 class="sheet-title">' + (editing.id ? esc(row.name || "Untitled") : "New item") + "</h3>" +
    '<div class="field-row"><label class="field"><span>Name</span><input data-f="name" data-k="name" value="' + esc(row.name || "") + '" placeholder="Vitamin D" autocomplete="off"></label>' +
    '<label class="field"><span>Where</span><input data-f="store" data-k="store" list="sup-stores" value="' + esc(row.store || "") + '" placeholder="Amazon" autocomplete="off"></label></div>' +
    '<datalist id="sup-stores">' + stores.map((s) => '<option value="' + esc(s) + '">').join("") + "</datalist>" +
    '<div class="field-row three"><label class="field"><span>Price ($)</span><input data-f="price" data-k="price" class="num" type="number" step="0.01" min="0" value="' + esc(row.price || "") + '" placeholder="0.00"></label>' +
    '<label class="field"><span>Every</span><input data-f="n" data-k="n" class="num" type="number" step="1" min="1" value="' + esc(row.n || "") + '" placeholder="3"></label>' +
    '<label class="field"><span>&nbsp;</span><select data-f="unit" data-k="unit" aria-label="Unit">' + M.CYCLES.map(([k, l]) => '<option value="' + k + '"' + sel((row.unit || "m") === k) + ">" + l + "s</option>").join("") + "</select></label></div>" +
    '<label class="field"><span>Next due</span><input data-f="next" data-k="next" type="date" value="' + esc(row.next || "") + '"></label>' +
    '<p class="hint">' + (then ? "After that: " + fmtDue(then, T) + " (" + M.cycleText(row) + ")." : "Fill in how often and the next date: it then shows up under Coming up.") + "</p>" +
    '<label class="field"><span>Note</span><input data-f="note" data-k="note" value="' + esc(row.note || "") + '" placeholder="Brand, size…" autocomplete="off"></label>' +
    footHTML("item");
}

// ---------- 编辑框（一改就存；新建的有了名字才存） ----------

function rowOf(D) {
  if (!editing || !["ing", "box", "sup"].includes(editing.kind)) return null;
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
    '<div class="field"><span>Type</span>' + segHTML("ing-cat", [...M.CATS, ["", "Other"]], M.CATS.some(([k]) => k === row.cat) ? row.cat : "") + "</div>" +
    '<div class="field-row"><label class="field"><span>Price per buy ($)</span><input data-f="price" data-k="price" class="num" type="number" step="0.01" min="0" value="' + esc(row.price ?? "") + '" placeholder="0.00"></label>' +
    '<label class="field"><span>One buy lasts (days of meals)</span><input data-f="lasts" data-k="lasts" class="num" type="number" step="1" min="1" value="' + esc(row.lasts || "") + '" placeholder="7"></label></div>' +
    '<div class="field"><span>Calories</span>' + segHTML("ing-level", M.LEVELS.map(([k, l, ex]) => [k, l + " <small>" + ex + "</small>"]), M.levelOf(row)) + "</div>" +
    '<p class="hint">≈ ' + money(M.useCost(row, T)) + " per day of meals.</p>" +
    '<div class="field"><span>On shopping lists</span>' + segHTML("ing-stock", [["", "When a box needs it"], ["keep", "Always <small>back every " + M.lastsOf(row) + " days: milk, eggs</small>"], ["staple", "Never <small>I add it by hand: oil, salt</small>"]], row.keep ? "keep" : row.staple ? "staple" : "") + "</div>" +
    (row.staple && !row.keep ? '<p class="hint">Never also means it isn\'t counted in a box\'s level.</p>' : "") +
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
      const ing = M.partIng(D, p, T);
      return '<tr><td><select data-part="ing" data-i="' + i + '" data-k="ping-' + i + '">' + ingOptions(D, p.any ? M.anyId(p.any) : p.ing, undefined, true) + "</select></td>" +
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

function importEditor() {
  return '<h3 class="sheet-title">Import a list</h3>' +
    '<p class="hint">Paste a list of groceries and boxes. Names you already have are updated; new ones are added.</p>' +
    '<textarea class="mimport" data-k="import" rows="9" placeholder="Paste here" spellcheck="false" aria-label="List to import"></textarea>' +
    '<p class="hint mimport-msg" role="status"></p>' +
    '<div class="sheet-foot"><span></span><button type="button" class="btn primary" data-act="import-go">Import</button></div>';
}

function editorHTML() {
  const D = store.meals();
  if (editing.kind === "import") return importEditor();
  if (editing.kind === "day") return dayEditor(D);
  if (editing.kind === "prefs") return prefsEditor();
  const row = rowOf(D);
  if (!row) return "";
  return editing.kind === "ing" ? ingEditor(D, row) : editing.kind === "sup" ? supEditor(D, row) : boxEditor(D, row);
}

function openEditor(e) {
  editing = e;
  openModal('<div class="meal-editor">' + editorHTML() + "</div>", { wide: e.kind === "ing" || e.kind === "box" || e.kind === "import", close: () => { editing = null; } });
  modalSheet()?.querySelector("[data-k=name], [data-k=import]")?.focus();
}

// 编辑框重画（自己改的、同步拉下来的）：焦点留在原来那个，正在打字的那格留住。按钮没有 data-k，就按 data-act 认
const keyOf = (el) => el?.dataset?.k || (el?.dataset?.act ? "act:" + el.dataset.act + ":" + (el.dataset.i ?? el.dataset.v ?? el.dataset.id ?? "") : "");

export function refreshMealEditor() {
  const box = modalSheet()?.querySelector(".meal-editor");
  if (!box || !editing || editing.kind === "import") return;   // 导入框里贴着的东西别冲掉
  if (["ing", "box", "sup"].includes(editing.kind) && !rowOf(store.meals())) { closeModal(); return; }
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

// ---------- 拖放（dnd.js 转过来的）：Box → 某天（加一个）/ 之后某周（粗排 +1）；拖某天 → 复制到另一天；架子上的东西 → 某个 Box ----------

export function mealDrop(payload, target) {
  const i = payload.indexOf(":"), kind = payload.slice(0, i), id = payload.slice(i + 1);
  const j = target.indexOf(":"), tk = target.slice(0, j), tid = target.slice(j + 1);
  const D = store.meals();
  if (tk === "mday") {
    if (kind === "box" && D.box[id]) store.setMealDay(weekOf(tid), tid, { boxes: [...M.boxesOfDay(D, D.days[tid]), id] });
    if (kind === "mcopy" && id !== tid && D.days[id]) { store.setMealDay(weekOf(tid), tid, { ...D.days[id] }); toast("Copied to " + fmtDay(tid)); }
  }
  if (tk === "mweek" && kind === "box" && D.box[id]) roughAdd(tid, id);
  if (tk === "mbox" && (kind === "ing" || kind === "any")) {
    const part = kind === "any" ? { any: id, amt: "" } : { ing: id, amt: "" }, what = M.partIng(D, part);
    if (!what) return;
    if (tid === "new") { openEditor({ kind: "box", id: "", draft: { name: "", slot: "", level: "", parts: [part], note: "" } }); return; }
    const b = D.box[tid];
    if (!b) return;
    const parts = b.parts || [], name = b.name || "Untitled";
    if (parts.some((p) => (part.any ? p.any === part.any : p.ing === part.ing))) { toast("Already in " + name); return; }
    // 拖进来一样具体的肉，Box 里正好有「Any meat」：就是挑定了，顶掉那格（用量留着）
    const slot = part.ing ? parts.findIndex((p) => p.any && p.any === what.cat) : -1;
    if (slot >= 0) store.saveMeal("box", { ...b, parts: parts.map((p, i) => (i === slot ? { ing: part.ing, amt: p.amt || "" } : p)) }, name + ": " + what.name + " instead of any " + M.catName(what.cat).toLowerCase());
    else store.saveMeal("box", { ...b, parts: [...parts, part] }, "Added " + what.name + " to " + name);
  }
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
    else if (act === "meal-import") openEditor({ kind: "import" });
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
    else if (act === "new-ing") openEditor({ kind: "ing", id: "", draft: { name: "", store: "", price: "", lasts: "", level: "mid", cat: "", keep: false, staple: false, every: 0, from: "", checked: "", sale: null } });
    else if (act === "edit-ing") openEditor({ kind: "ing", id });
    else if (act === "new-sup") openEditor({ kind: "sup", id: "", draft: { name: "", store: "", price: "", n: "", unit: "m", next: "", note: "" } });
    else if (act === "edit-sup") openEditor({ kind: "sup", id });
    else if (act === "sup-done" && D.sup[id]) { const next = M.nextAfter(T, D.sup[id]); store.saveMeal("sup", { ...D.sup[id], next }, D.sup[id].name + ": next " + fmtDue(next, T)); }
    else if (act === "memo-edit") {
      noteFor = start + "|" + id;
      rerender();
      afterRender(() => [...document.querySelectorAll(".meals input[data-memo]")].find((x) => x.dataset.week === start && x.dataset.id === id)?.focus());
    }
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
  // 采购单上的备注：回车 / 点到别处就存进这一周；清空 = 删掉。不重画，免得正要点的下一个按钮被换掉
  on(document, "change", ".meals input[data-memo]", (e, el) => {
    const id = el.dataset.id, text = el.value.trim();
    noteFor = "";
    store.saveWeek(el.dataset.week, (w) => {
      const notes = { ...(w.notes || {}) };
      if (text) notes[id] = text;
      else delete notes[id];
      return { notes };
    }, "", { quiet: true });
  });
  on(document, "focusout", ".meals input[data-memo]", () => { noteFor = ""; });
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
    else if (act === "ing-cat") update({ cat: el.dataset.v });
    else if (act === "ing-stock") update({ keep: el.dataset.v === "keep", staple: el.dataset.v === "staple" });
    else if (act === "import-go") {
      const sheet = el.closest(".meal-editor");
      let payload = null;
      try { payload = JSON.parse(sheet.querySelector(".mimport").value); } catch { /* 不是清单：下面提示 */ }
      const rows = payload && typeof payload === "object" ? M.importRows(D, payload, () => store.newId().replace(/-/g, "").slice(0, 10)) : null;
      if (!rows || !(rows.ing.length + rows.box.length + rows.sup.length)) { sheet.querySelector(".mimport-msg").textContent = "That doesn't look like a list. Copy it again and paste the whole thing."; return; }
      closeModal();
      store.importMeals(rows);
    }
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
    if (f === "lasts" || f === "n") v = Math.max(0, Math.round(Number(v) || 0)) || "";
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
    if (el.dataset.part === "amt") parts[i].amt = el.value.trim();
    else parts[i] = el.value.startsWith("any:") ? { any: el.value.slice(4), amt: parts[i].amt || "" } : { ing: el.value, amt: parts[i].amt || "" };
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
