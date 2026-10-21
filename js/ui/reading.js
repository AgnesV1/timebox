// 阅读页（电脑和手机都有），两格：
// Want —— 往阅读表格的 Want 页加一条想看的：标题、类型（就是那个表格的各页）、风格（🎉 爽 / 😊 成长 / 👀 好奇）、
//   多想看（Priority：Soon 这一两年 / 5 years 五年内 / 不标——是优先级，不是期限）、Note。搜到的已经在 Want 里的，旁边两个小按钮直接标。
// Finished —— 看完了一个，记进它自己那一页：哪一页、小类（那一页有才出现）、年月、评价（🥰 成长 / 🎉 爽了 / 💢 踩雷，可以不标）、Note；
//   全是点选。之前放在 Want 里的点一下就填进来，记完表格那边把它从 Want 拿掉。
// 标题边打边搜所有页里已经有的，免得重复。不显示整个清单，只显示对得上的（Finished 空着时列出标了 Soon 的那几条，没有标过就列最近几条）。
// 电脑上右边一栏「Rest of 2026」：今年接下来想读的（单子存在苦昼短的 Settings，见 js/store/readplan.js）。
//   底下一格加：点进去先列 Want 里 Soon 的几条，打字时列 Want 里对得上的，点一条就加（带上它的类型）；回车加打的字。
//   拖左边的把手、或者在一行上按 Alt+↑ / ↓ 排先后；× 拿掉（提示条上能撤销）。阅读表格里记了同名的看完（今年）就划掉，写哪个月；
//   去年没读完的跟到今年，写「from 2025」。

import * as store from "../store.js";
import * as sync from "../sync.js";
import * as reading from "../reading.js";
import { esc, on } from "../dom.js";
import { toast } from "./common.js";

const afterRender = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));

let query = "";   // 标题框里正在打的字（两格共用）
let vibe = "";
let type = "";
let prio = "";    // Want 那一格选着的优先级
// Finished 那一格：选的页、小类、评价、年月（0 = 还没动过，用今天的）、想看的是不是全列出来
let tab = "", kind = "", mark = "", year = 0, month = 0, allWants = false;

const finishing = () => store.local().readMode === "done";
const thisYear = () => Number(store.today().slice(0, 4));
const when = () => ({ y: year || thisYear(), m: month || Number(store.today().slice(5, 7)) });

const tags = (r, withPrio = true) => (r.tab ? ' <span class="rtype">' + esc(r.tab) + "</span>" : "") + (r.want ? ' <span class="rtype want">Want</span>' : "") +
  (withPrio && r.want && r.prio ? ' <span class="rtype">' + reading.prioText(r.prio) + "</span>" : "") +
  (r.mark ? " " + esc(r.mark) : "") + (r.when ? ' <span class="rwhen">' + esc(r.when) + "</span>" : "") + (r.queued ? " <em>sending…</em>" : "");

// Finished 里对得上的一条：还没看完的（Want 里的、某页里没写日期的）能点，点了填进表单
function pickHTML(r) {
  const body = "<b>" + esc(r.title) + "</b>" + tags(r) + (r.note ? "<small>" + esc(r.note) + "</small>" : "");
  return r.want || !r.when ? '<li><button type="button" class="rpick" data-act="rpick" data-t="' + esc(r.title) + '" data-tab="' + esc(r.tab || "") + '">' + body + "</button></li>" : '<li class="rdone">' + body + "</li>";
}

// Want 里的一条旁边的两个小按钮：点一下标上，再点一次取消
const prioChips = (r) => '<span class="rprios">' + reading.PRIOS.map(([k, l, tip]) => '<button type="button" class="chip' + (r.prio === k ? " on" : "") + '" data-act="rset" data-t="' + esc(r.title) + '" data-v="' + k +
  '" aria-pressed="' + (r.prio === k) + '" title="' + tip + '">' + l + "</button>").join("") + "</span>";

function matchesHTML() {
  if (!reading.titleKey(query)) {
    if (!finishing()) return "";
    // 标题空着：标了 Soon 的那几条全列出来（这是眼下要看的），别的收在 more 里；一条都没标过就列最近 6 条
    const all = reading.wants(), soon = all.filter((r) => r.prio === "soon"), shown = allWants ? all : soon.length ? soon : all.slice(0, 6);
    return all.length ? '<p class="rhead">' + (!allWants && soon.length ? "Soon" : "From Want") + "</p><ul>" + shown.map(pickHTML).join("") + "</ul>" +
      (all.length > shown.length ? '<button type="button" class="link rmore" data-act="rmore">+' + (all.length - shown.length) + " more</button>" : "") : "";
  }
  const hits = reading.search(query);
  if (!hits.length) return '<p class="rnone">Not in your list yet.</p>';
  if (finishing()) return '<p class="rhead">' + (reading.finished(query) ? "Already logged" : "In your list") + "</p><ul>" + hits.map(pickHTML).join("") + "</ul>";
  const same = hits.some((h) => reading.titleKey(h.title) === reading.titleKey(query));
  return '<p class="rhead">' + (same ? "Already in your list" : "Similar") + "</p><ul>" + hits.map((r) =>
    "<li><b>" + esc(r.title) + "</b>" + tags(r, false) + (r.want ? prioChips(r) : "") + (r.note ? "<small>" + esc(r.note) + "</small>" : "") + "</li>").join("") + "</ul>";
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
    row("Type", '<div class="rtypes">' + reading.TYPES.map((t) => chip("rtype", t, t, type === t)).join("") + "</div>") +
    row("Priority", '<div class="rtypes">' + reading.PRIOS.map(([k, l, tip]) => '<button type="button" class="chip' + (prio === k ? " on" : "") + '" data-act="rprio" data-v="' + k + '" aria-pressed="' + (prio === k) + '" title="' + tip + '">' + l + "</button>").join("") + "</div>");
}

function doneFields() {
  const { y, m } = when(), kinds = reading.kindsOf(tab);
  return row("Type", '<div class="rtypes">' + reading.logTypes().map((t) => chip("rtab", t, t, tab === t)).join("") + "</div>") +
    (kinds.length ? row("Kind", '<div class="rtypes">' + kinds.map((k) => chip("rkind", k, k, kind === k)).join("") + "</div>") : "") +
    row("When", '<div class="rwhens"><div class="rtypes ryears">' + [thisYear() - 1, thisYear()].map((v) => chip("ryear", v, v, y === v)).join("") + "</div>" +
      '<div class="rtypes rmonths">' + Array.from({ length: 12 }, (_, i) => chip("rmonth", i + 1, reading.monthName(i + 1), m === i + 1)).join("") + "</div></div>") +
    row("Worth it?", faces(reading.MARKS, "rmark", mark));
}

// ---------- 右边：今年接下来想读的 ----------
let plSeek = "";   // 加的那一格里正在打的字
// 挪完、删完整页会重画：光标放回那一行（重画在下一帧，有时还包着换页的过渡，所以晚一点再找，找两次）
const refocus = (id) => { if (!id) return; for (const ms of [60, 220]) setTimeout(() => document.querySelector('.yl-row[data-yl-id="' + CSS.escape(id) + '"]')?.focus({ preventScroll: true }), ms); };

function planRowHTML(x) {
  const label = x.title + (x.tab ? ", " + x.tab : "") + (x.done ? ", read in " + x.done : x.from ? ", from " + x.from : "");
  return '<li class="yl-row' + (x.done ? " done" : "") + '" data-yl-id="' + esc(x.id) + '" tabindex="0" aria-label="' + esc(label + ". Alt and arrow keys move it") + '">' +
    '<span class="yl-grip" data-yl-grip aria-hidden="true" title="Drag to reorder"><i></i><i></i><i></i></span>' +
    '<span class="yl-t" title="' + esc(x.title) + '">' + esc(x.title) + "</span>" +
    (x.tab ? '<span class="yl-tab">' + esc(x.tab) + "</span>" : "") +
    (x.done ? '<span class="yl-done">✓ ' + esc(x.done) + "</span>" : x.from ? '<span class="yl-from">from ' + x.from + "</span>" : "") +
    '<button type="button" class="yl-x" data-yl="remove" tabindex="-1" aria-label="Remove ' + esc(x.title) + '" title="Remove">×</button></li>';
}
// 加的那一格底下列的：空着 = Want 里标了 Soon 的（没有就是最近加的）；打了字 = Want 里对得上的。已经在单子上的不列
function planSugHTML() {
  const have = new Set(store.readPlan().map((x) => reading.titleKey(x.title))), q = plSeek.trim();
  const pool = q ? reading.search(q, 12).filter((r) => r.want) : reading.wants();
  const list = pool.filter((r) => !have.has(reading.titleKey(r.title))).slice(0, 6);
  const typed = q && !list.some((r) => reading.titleKey(r.title) === reading.titleKey(q)) && !have.has(reading.titleKey(q));
  if (!list.length && !typed) return "";
  return (q ? "" : '<p class="yl-sh">From your Want list</p>') +
    (typed ? '<button type="button" class="yl-sug" data-yl="add" data-t="' + esc(q) + '">Add “' + esc(q) + "”</button>" : "") +
    list.map((r) => '<button type="button" class="yl-sug" data-yl="add" data-t="' + esc(r.title) + '" data-tab="' + esc(r.tab || "") + '">' + esc(r.title) + (r.tab ? ' <span class="yl-tab">' + esc(r.tab) + "</span>" : "") + (r.prio ? ' <span class="yl-tab">' + reading.prioText(r.prio) + "</span>" : "") + "</button>").join("");
}
function planHTML() {
  const y = thisYear(), items = reading.planView(store.readPlan(), reading.finished, y), done = items.filter((x) => x.done).length;
  return '<aside class="yl" aria-label="Rest of ' + y + '"><header class="yl-head"><h3>Rest of ' + y + "</h3>" + (items.length ? '<span class="msub">' + done + " of " + items.length + " read</span>" : "") + "</header>" +
    (items.length ? '<ol class="yl-list">' + items.map(planRowHTML).join("") + "</ol>" : '<p class="yl-empty">What do you want to read before the year is out? Pick from your Want list or type a title.</p>') +
    '<div class="yl-add"><input class="yl-in" data-keep="yl-add" value="' + esc(plSeek) + '" placeholder="Add something to read…" aria-label="Add to the rest-of-year list" autocomplete="off" enterkeyhint="done">' +
    '<div class="yl-sugs" data-yl-sugs></div></div></aside>';
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
  const page = '<div class="reading' + (phone ? " phone-reading" : "") + '">' + head + connect +
    '<form class="radd' + (done ? " done" : "") + '" autocomplete="off">' +
    '<input name="title" class="rtitle" data-keep="read-title" placeholder="' + (done ? "What did you finish?" : "What do you want to read or watch?") + '" enterkeyhint="next" value="' + esc(query) + '">' +
    '<div class="rmatches" data-rmatches>' + matchesHTML() + "</div>" +
    (done ? doneFields() : wantFields()) +
    '<textarea name="note" data-keep="read-note" rows="2" placeholder="Note"></textarea>' +
    '<div data-rstuck>' + stuckHTML() + "</div>" +
    '<div class="rgo"><span class="hint" data-rstatus>' + esc(statusText()) + '</span><button class="btn cta" type="submit">' + (done ? "Log" : "Add") + "</button></div>" +
    "</form></div>";
  // 电脑上右边一栏「Rest of 今年」；手机上没有
  return phone ? page : '<div class="read-cols">' + page + planHTML() + "</div>";
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
    if (act === "rprio") prio = flip(prio);
    // 搜到的那条：标上 / 取消，马上发给表格
    if (act === "rset") { const cur = reading.exists(el.dataset.t); reading.setPrio(el.dataset.t, cur?.prio === v ? "" : v); rerender(); sync.sync(); return; }
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
      reading.add({ title, type, vibe, prio, note: form.note.value });
      toast("Added " + title);
      query = ""; vibe = ""; type = ""; prio = "";
    }
    form.title.value = ""; form.note.value = "";
    rerender();
    sync.sync();
  });
  // ---------- 右边：今年接下来想读的 ----------
  const sugs = () => document.querySelector("[data-yl-sugs]");
  const showSugs = (on) => { const box = sugs(); if (box) box.innerHTML = on ? planSugHTML() : ""; };
  const addPlan = (title, tabName = "") => {
    const t = String(title || "").trim();
    if (!t) return;
    const hit = reading.wantOf(t) || reading.exists(t);
    if (!store.addReadPlan({ title: hit?.title || t, tab: tabName || hit?.tab || "" }, thisYear())) { toast("Already on the list"); return; }
    plSeek = "";
    const input = document.querySelector(".yl-in");
    if (input) input.value = "";
    afterRender(() => { document.querySelector(".yl-in")?.focus(); showSugs(true); });
  };
  on(document, "focusin", ".yl-in", () => showSugs(true));
  on(document, "focusout", ".yl-add", (e, box) => { if (!box.contains(e.relatedTarget)) setTimeout(() => { if (!document.querySelector(".yl-add")?.contains(document.activeElement)) showSugs(false); }, 120); });
  on(document, "input", ".yl-in", (e, el) => { plSeek = el.value; showSugs(true); });
  on(document, "keydown", ".yl-in", (e, el) => {
    if (e.key === "Enter") { e.preventDefault(); addPlan(el.value); }
    else if (e.key === "Escape") { el.value = plSeek = ""; showSugs(false); el.blur(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); sugs()?.querySelector("button")?.focus(); }
  });
  on(document, "keydown", ".yl-sug", (e, el) => {
    const all = [...el.parentNode.querySelectorAll(".yl-sug")], i = all.indexOf(el);
    if (e.key === "ArrowDown") { e.preventDefault(); all[i + 1]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); (all[i - 1] || document.querySelector(".yl-in"))?.focus(); }
  });
  on(document, "click", ".yl [data-yl]", (e, el) => {
    if (el.dataset.yl === "add") addPlan(el.dataset.t, el.dataset.tab || "");
    else if (el.dataset.yl === "remove") store.removeReadPlan(el.closest("[data-yl-id]").dataset.ylId);
  });
  // 键盘：Alt+↑ / ↓ 挪一格，Delete 拿掉
  on(document, "keydown", ".yl-row", (e, row) => {
    if (e.target !== row) return;
    const rows = [...row.parentNode.children], i = rows.indexOf(row), id = row.dataset.ylId;
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const to = i + (e.key === "ArrowUp" ? -1 : 1);
      if (to < 0 || to >= rows.length) return;
      store.moveReadPlan(id, to);
      refocus(id);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); rows[i + (e.key === "ArrowUp" ? -1 : 1)]?.focus(); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); const next = rows[i + 1]?.dataset.ylId || rows[i - 1]?.dataset.ylId || ""; store.removeReadPlan(id); refocus(next); }
  });
  // 拖左边的把手排先后：这一行跟着手走，别的行让开；过了一半就换位置，松手才存
  on(document, "pointerdown", ".yl [data-yl-grip]", (e, grip) => {
    if (e.button > 0) return;
    e.preventDefault();
    const row = grip.closest(".yl-row"), rows = [...row.parentNode.children], from = rows.indexOf(row), h = row.offsetHeight, y0 = e.clientY;
    let to = from;
    grip.setPointerCapture(e.pointerId);
    row.classList.add("drag");
    const move = (ev) => {
      const dy = ev.clientY - y0;
      row.style.transform = "translateY(" + dy + "px)";
      to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / h)));
      rows.forEach((r, k) => { if (r !== row) r.style.transform = k > from && k <= to ? "translateY(" + -h + "px)" : k < from && k >= to ? "translateY(" + h + "px)" : ""; });
    };
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      rows.forEach((r) => { r.style.transform = ""; });
      row.classList.remove("drag");
      if (to !== from) store.moveReadPlan(row.dataset.ylId, to);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
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
