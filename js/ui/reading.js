// 阅读页（电脑和手机都有），两格：
// Want —— 往阅读表格的 Want 页加一条想看的：标题、类型（就是那个表格的各页）、风格（🎉 爽 / 😊 成长 / 👀 好奇）、Note。
// Finished —— 看完了一个，记进它自己那一页：哪一页、小类（那一页有才出现）、年月、评价（🥰 成长 / 🎉 爽了 / 💢 踩雷，可以不标）、Note；
//   全是点选。之前放在 Want 里的点一下就填进来，记完表格那边把它从 Want 拿掉。
// 标题边打边搜所有页里已经有的，免得重复。不显示整个清单，只显示对得上的（Finished 空着时列最近几条想看的）。

import * as store from "../store.js";
import * as sync from "../sync.js";
import * as reading from "../reading.js";
import { esc, on } from "../dom.js";
import { toast } from "./common.js";

let query = "";   // 标题框里正在打的字（两格共用）
let vibe = "";
let type = "";
// Finished 那一格：选的页、小类、评价、年月（0 = 还没动过，用今天的）、想看的是不是全列出来
let tab = "", kind = "", mark = "", year = 0, month = 0, allWants = false;

const finishing = () => store.local().readMode === "done";
const thisYear = () => Number(store.today().slice(0, 4));
const when = () => ({ y: year || thisYear(), m: month || Number(store.today().slice(5, 7)) });

const tags = (r) => (r.tab ? ' <span class="rtype">' + esc(r.tab) + "</span>" : "") + (r.want ? ' <span class="rtype want">Want</span>' : "") +
  (r.mark ? " " + esc(r.mark) : "") + (r.when ? ' <span class="rwhen">' + esc(r.when) + "</span>" : "") + (r.queued ? " <em>sending…</em>" : "");

// Finished 里对得上的一条：还没看完的（Want 里的、某页里没写日期的）能点，点了填进表单
function pickHTML(r) {
  const body = "<b>" + esc(r.title) + "</b>" + tags(r) + (r.note ? "<small>" + esc(r.note) + "</small>" : "");
  return r.want || !r.when ? '<li><button type="button" class="rpick" data-act="rpick" data-t="' + esc(r.title) + '" data-tab="' + esc(r.tab || "") + '">' + body + "</button></li>" : '<li class="rdone">' + body + "</li>";
}

function matchesHTML() {
  if (!reading.titleKey(query)) {
    if (!finishing()) return "";
    const all = reading.wants(), shown = allWants ? all : all.slice(0, 6);
    return all.length ? '<p class="rhead">From Want</p><ul>' + shown.map(pickHTML).join("") + "</ul>" +
      (all.length > shown.length ? '<button type="button" class="link rmore" data-act="rmore">+' + (all.length - shown.length) + " more</button>" : "") : "";
  }
  const hits = reading.search(query);
  if (!hits.length) return '<p class="rnone">Not in your list yet.</p>';
  if (finishing()) return '<p class="rhead">' + (reading.finished(query) ? "Already logged" : "In your list") + "</p><ul>" + hits.map(pickHTML).join("") + "</ul>";
  const same = hits.some((h) => reading.titleKey(h.title) === reading.titleKey(query));
  return '<p class="rhead">' + (same ? "Already in your list" : "Similar") + "</p><ul>" + hits.map((r) =>
    "<li><b>" + esc(r.title) + "</b>" + tags(r) + (r.note ? "<small>" + esc(r.note) + "</small>" : "") + "</li>").join("") + "</ul>";
}

function statusText() {
  const R = reading.state();
  if (!store.setting("reading")?.url) return "Paste your reading Sheet's link above first.";
  if (R.error) return R.error;
  const n = R.pending.length;
  return (R.at ? R.rows.length + " in your list" : "Loading your list…") + (n ? " · " + n + " waiting to send" : "");
}

// 表格那边没收下的（比如那一页的下拉里还没有这一年）：说原因，可以不要了
const stuckHTML = () => reading.state().pending.filter((x) => x.why).map((x) =>
  '<p class="rstuck"><b>' + esc(x.title) + "</b> " + esc(x.why) + ' <button type="button" class="link" data-act="rdrop" data-id="' + esc(x.id) + '">Remove</button></p>').join("");

const chip = (act, v, label, cur) => '<button type="button" class="chip' + (cur ? " on" : "") + '" data-act="' + act + '" data-v="' + esc(v) + '" aria-pressed="' + cur + '">' + esc(label) + "</button>";
const row = (label, body) => '<div class="rrow"><span class="rlab">' + label + "</span>" + body + "</div>";
const faces = (list, act, cur) => '<div class="vibes">' + list.map((v) =>
  '<button type="button" class="vibe' + (cur === v ? " on" : "") + '" data-act="' + act + '" data-v="' + v + '" aria-pressed="' + (cur === v) + '">' + v + "</button>").join("") + "</div>";

function wantFields() {
  return row("Vibe", faces(reading.VIBES, "vibe", vibe)) +
    row("Type", '<div class="rtypes">' + reading.TYPES.map((t) => chip("rtype", t, t, type === t)).join("") + "</div>");
}

function doneFields() {
  const { y, m } = when(), kinds = reading.kindsOf(tab);
  return row("Type", '<div class="rtypes">' + reading.logTypes().map((t) => chip("rtab", t, t, tab === t)).join("") + "</div>") +
    (kinds.length ? row("Kind", '<div class="rtypes">' + kinds.map((k) => chip("rkind", k, k, kind === k)).join("") + "</div>") : "") +
    row("When", '<div class="rwhens"><div class="rtypes ryears">' + [thisYear() - 1, thisYear()].map((v) => chip("ryear", v, v, y === v)).join("") + "</div>" +
      '<div class="rtypes rmonths">' + Array.from({ length: 12 }, (_, i) => chip("rmonth", i + 1, reading.monthName(i + 1), m === i + 1)).join("") + "</div></div>") +
    row("Worth it?", faces(reading.MARKS, "rmark", mark));
}

export function readingHTML(phone) {
  const done = finishing();
  const mode = '<div class="seg rmode" role="group" aria-label="What to add">' + [["want", "Want"], ["done", "Finished"]].map(([v, l]) =>
    '<button type="button" class="' + ((v === "done") === done ? "on" : "") + '" data-act="rmode" data-v="' + v + '">' + l + "</button>").join("") + "</div>";
  const head = (phone ? '<header class="phead"><div class="l"><a class="nav" href="#today">‹ Today</a></div></header>' : "") +
    '<header class="page-head"><div><h2>Reading</h2></div>' + mode + "</header>";
  // 还没连阅读表格：就在这里贴一次链接（手机上也行），贴进去就存
  const connect = store.setting("reading")?.url ? "" :
    '<label class="field rconnect"><span>Link to your reading Sheet</span><input data-reading-link inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://docs.google.com/spreadsheets/d/…/edit"></label>' +
    '<p class="hint">Paste it once. The Sheet stays private — your own Google account opens it.</p>';
  return '<div class="reading' + (phone ? " phone-reading" : "") + '">' + head + connect +
    '<form class="radd' + (done ? " done" : "") + '" autocomplete="off">' +
    '<input name="title" class="rtitle" data-keep="read-title" placeholder="' + (done ? "What did you finish?" : "What do you want to read or watch?") + '" enterkeyhint="next" value="' + esc(query) + '">' +
    '<div class="rmatches" data-rmatches>' + matchesHTML() + "</div>" +
    (done ? doneFields() : wantFields()) +
    '<textarea name="note" data-keep="read-note" rows="2" placeholder="Note"></textarea>' +
    '<div data-rstuck>' + stuckHTML() + "</div>" +
    '<div class="rgo"><span class="hint" data-rstatus>' + esc(statusText()) + '</span><button class="btn cta" type="submit">' + (done ? "Log" : "Add") + "</button></div>" +
    "</form></div>";
}

// 阅读表格的链接：贴进来就存（不用等离开输入框）。电脑 Settings 里那个框也走这里
export function saveReadingLink(value) {
  const url = String(value || "").trim();
  if (url === (store.setting("reading")?.url || "")) return false;
  if (url && !reading.looksLikeSheet(url)) return false;
  store.setSetting("reading", { url });
  if (url) toast("Reading Sheet linked");
  sync.sync();
  return true;
}

export function initReading(rerender) {
  on(document, "input", "[data-reading-link]", (e, el) => { if (reading.looksLikeSheet(el.value)) saveReadingLink(el.value); });
  on(document, "change", "[data-reading-link]", (e, el) => { if (!saveReadingLink(el.value) && el.value.trim()) toast("That doesn't look like a Google Sheets link"); });
  on(document, "input", ".radd [name=title]", (e, el) => {
    query = el.value;
    const box = document.querySelector("[data-rmatches]");
    if (box) box.innerHTML = matchesHTML();
  });
  on(document, "click", ".reading [data-act]", (e, el) => {
    const { act, v } = el.dataset, flip = (cur) => (cur === v ? "" : v);
    if (act === "rmode") { store.setLocal({ readMode: v === "done" ? "done" : "want" }); return; }   // 存完自己会重画
    if (act === "vibe") vibe = flip(vibe);
    if (act === "rtype") type = flip(type);
    if (act === "rtab") { tab = flip(tab); kind = ""; }
    if (act === "rkind") kind = flip(kind);
    if (act === "rmark") mark = flip(mark);
    if (act === "ryear") year = Number(v);
    if (act === "rmonth") month = Number(v);
    if (act === "rmore") allWants = true;
    if (act === "rdrop") { reading.drop(el.dataset.id); return; }
    if (act === "rpick") {
      // 名字填进标题框（先改框里的字，重画时才留得住），它在哪一页就选哪一页
      const box = el.closest("form").title, to = reading.logTypes().find((t) => t.toLowerCase() === el.dataset.tab.toLowerCase());
      box.value = query = el.dataset.t;
      if (to && to !== tab) { tab = to; kind = ""; }
    }
    rerender();
  });
  on(document, "submit", ".radd", (e, form) => {
    e.preventDefault();
    const title = form.title.value.trim();
    if (!title) { form.title.focus(); return; }
    if (finishing()) {
      const had = reading.finished(title);
      if (had) { toast("Already logged" + (had.tab ? " (" + had.tab + ", " + had.when + ")" : "")); return; }
      if (!tab) { toast("Pick a type first"); return; }
      const { y, m } = when();
      reading.log({ title, type: tab, year: y, month: m, mark, kind: reading.kindsOf(tab).includes(kind) ? kind : "", note: form.note.value });
      toast("Logged " + title);
      query = ""; mark = "";   // 页、小类、年月留着：连着记几条不用重选
    } else {
      const hit = reading.exists(title);
      if (hit) { toast("Already in your list" + (hit.tab ? " (" + hit.tab + ")" : "")); return; }
      reading.add({ title, type, vibe, note: form.note.value });
      toast("Added " + title);
      query = ""; vibe = ""; type = "";
    }
    form.title.value = ""; form.note.value = "";
    rerender();
    sync.sync();
  });
  // 表格回来说「已经有了」的、没收下的
  reading.subscribe(() => {
    const d = reading.takeDupes();
    if (d.length) toast("Already in your list: " + d.map((x) => x.title + (x.tab ? " (" + x.tab + ")" : "")).join(", "));
    const f = reading.takeFailed();
    if (f.length) toast("Couldn't log " + f.map((x) => x.title).join(", ") + " — " + f[0].why);
    const s = document.querySelector("[data-rstatus]");
    if (s) s.textContent = statusText();
  });
}
