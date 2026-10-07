// 阅读页（电脑和手机都有）：往阅读表格里加一条想看的东西——标题、类型、风格（🎉 爽 / 😊 成长 / 👀 好奇）、Note。
// 标题边打边搜已经有的，免得重复。不显示整个清单，只显示和你打的字对得上的。

import * as store from "../store.js";
import * as sync from "../sync.js";
import * as reading from "../reading.js";
import { esc, on } from "../dom.js";
import { toast } from "./common.js";

let query = "";   // 标题框里正在打的字
let vibe = "";
let type = "";

function matchesHTML() {
  if (!reading.titleKey(query)) return "";
  const hits = reading.search(query);
  if (!hits.length) return '<p class="rnone">Not in your list yet.</p>';
  const same = hits.some((h) => reading.titleKey(h.title) === reading.titleKey(query));
  return '<p class="rhead">' + (same ? "Already in your list" : "Similar") + "</p><ul>" + hits.map((r) =>
    "<li><b>" + esc(r.title) + "</b>" + (r.type ? ' <span class="rtype">' + esc(r.type) + "</span>" : "") + (r.vibe ? " " + esc(r.vibe) : "") +
    (r.queued ? " <em>sending…</em>" : "") + (r.note ? "<small>" + esc(r.note) + "</small>" : "") + "</li>").join("") + "</ul>";
}

function statusText() {
  const R = reading.state();
  if (!store.setting("reading")?.url) return "Add your reading Sheet's link in Settings on the computer.";
  if (R.error) return R.error;
  const n = R.pending.length;
  return (R.at ? R.rows.length + " in your list" : "Loading your list…") + (n ? " · " + n + " waiting to send" : "");
}

export function readingHTML(phone) {
  const head = phone
    ? '<header class="phead"><div class="l"><a class="nav" href="#today">‹ Today</a></div></header><header class="page-head"><div><h2>Reading</h2></div></header>'
    : '<header class="page-head"><div><h2>Reading</h2></div></header>';
  const chips = reading.types().slice(0, 8);
  return '<div class="reading' + (phone ? " phone-reading" : "") + '">' + head +
    '<form class="radd" autocomplete="off">' +
    '<input name="title" class="rtitle" data-keep="read-title" placeholder="What do you want to read or watch?" enterkeyhint="next" value="' + esc(query) + '">' +
    '<div class="rmatches" data-rmatches>' + matchesHTML() + "</div>" +
    '<div class="rrow"><span class="rlab">Vibe</span><div class="vibes">' + reading.VIBES.map((v) =>
      '<button type="button" class="vibe' + (vibe === v ? " on" : "") + '" data-act="vibe" data-v="' + v + '">' + v + "</button>").join("") + "</div></div>" +
    '<div class="rrow"><span class="rlab">Type</span><div class="rtypes">' + chips.map((t) =>
      '<button type="button" class="chip' + (type === t ? " on" : "") + '" data-act="rtype" data-v="' + esc(t) + '">' + esc(t) + "</button>").join("") +
    '<input name="type" class="rtype-in" data-keep="read-type" placeholder="' + (chips.length ? "Other…" : "Book, film, podcast…") + '" value="' + esc(chips.includes(type) ? "" : type) + '"></div></div>' +
    '<textarea name="note" data-keep="read-note" rows="2" placeholder="Note"></textarea>' +
    '<div class="rgo"><span class="hint" data-rstatus>' + esc(statusText()) + '</span><button class="btn cta" type="submit">Add</button></div>' +
    "</form></div>";
}

export function initReading(rerender) {
  on(document, "input", ".radd [name=title]", (e, el) => {
    query = el.value;
    const box = document.querySelector("[data-rmatches]");
    if (box) box.innerHTML = matchesHTML();
  });
  on(document, "input", ".radd [name=type]", (e, el) => {
    type = el.value.trim();
    document.querySelectorAll(".radd [data-act=rtype]").forEach((b) => b.classList.toggle("on", b.dataset.v === type));
  });
  on(document, "click", ".radd [data-act]", (e, el) => {
    if (el.dataset.act === "vibe") vibe = vibe === el.dataset.v ? "" : el.dataset.v;
    if (el.dataset.act === "rtype") {
      type = type === el.dataset.v ? "" : el.dataset.v;
      const input = document.querySelector(".radd [name=type]");
      if (input) input.value = "";
    }
    rerender();
  });
  on(document, "submit", ".radd", (e, form) => {
    e.preventDefault();
    const title = form.title.value.trim();
    if (!title) { form.title.focus(); return; }
    if (reading.exists(title)) { toast("Already in your list"); return; }
    reading.add({ title, type: form.type.value.trim() || type, vibe, note: form.note.value });
    toast("Added " + title);
    query = ""; vibe = ""; type = "";
    form.title.value = ""; form.type.value = ""; form.note.value = "";
    rerender();
    sync.sync();
  });
  // 表格回来说「已经有了」的
  reading.subscribe(() => {
    const d = reading.takeDupes();
    if (d.length) toast("Already in your list: " + d.map((x) => x.title).join(", "));
    const s = document.querySelector("[data-rstatus]");
    if (s) s.textContent = statusText();
  });
}
