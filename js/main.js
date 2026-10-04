// 苦昼短：入口。管页面切换（#today / #calendar / #projects / #settings）、主题、同步时机、整页重画。
// 手机（≤760px）只有「今天」和设置；电脑有侧栏、日历和任务池、项目、重复任务、统计。

import * as store from "./store.js";
import * as sync from "./sync.js";
import * as E from "./engine.js";
import { esc, on, icon } from "./dom.js";
import { fmtMin } from "./dates.js";
import { paintPatterns } from "./patterns.js";
import { initFx, setFx, burst, confetti, refreshFxColors } from "./fx.js";
import { toast, lineInfo, groupsOf } from "./ui/common.js";
import { initModal, closeModal } from "./ui/modal.js";
import { todayHTML, initToday, shownDate } from "./ui/today.js";
import { calendarHTML, poolHTML, initCalendar, handleDrop, refreshDayModal } from "./ui/calendar.js";
import { projectsHTML, initProjects, refreshProjectEditor, openProjectEditor } from "./ui/projects.js";
import { settingsHTML, initSettings } from "./ui/settings.js";
import { initEditor, refreshEditor } from "./ui/editor.js";
import { initDnd } from "./ui/dnd.js";
import { statsHTML, initStats } from "./ui/stats.js";
import { routinesHTML, initRoutines } from "./ui/routines.js";

const phoneMQ = matchMedia("(max-width: 760px)");
const darkMQ = matchMedia("(prefers-color-scheme: dark)");
const VIEWS = ["today", "calendar", "projects", "routines", "stats", "settings"];
const side = document.getElementById("side");
const main = document.getElementById("main");
const pool = document.getElementById("pool");

function route() {
  let v = location.hash.replace("#", "").split("/")[0] || "today";
  if (!VIEWS.includes(v)) v = "today";
  if (phoneMQ.matches && v !== "settings") v = "today";
  return v;
}

function applyTheme() {
  const t = store.local().theme;
  const dark = t === "dark" || (t === "auto" && darkMQ.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0C0C13" : "#FFFFFF");
  paintPatterns();
  refreshFxColors();
}

// ---------- 侧栏（电脑） ----------

function sidebarHTML(c, view) {
  const todayOpen = c.tasks.filter((t) => t.date === c.today && !t.status).length;
  const nav = [["today", "Today", todayOpen || ""], ["calendar", "Calendar", ""], ["projects", "Projects", ""], ["routines", "Routines", ""], ["stats", "Stats", ""], ["settings", "Settings", ""]];
  // 项目（group）下面缩进列子项目
  const sub = (p) => {
    const h = E.health(c, p);
    const need = Math.round(E.needOn(c, p, c.today));
    return '<button type="button" class="sp h-' + h.level + (p.group ? " nested" : "") + '" data-open-project="' + p.id + '" style="--pc:' + esc(p.color) + '" title="' + esc(h.text) + '"><i></i><span>' + esc(p.name) + "</span>" + (need ? '<b class="num">' + fmtMin(need) + "</b>" : "") + "</button>";
  };
  const projects = groupsOf(c.projects.filter(E.isActive)).map((g) => (g.name ? '<p class="sp-group">' + esc(g.name) + "</p>" : "") + g.subs.map(sub).join("")).join("");
  const theme = store.local().theme;
  const st = sync.getStatus();
  return '<div class="brand"><span class="ball" data-act="ball"></span><h1>苦昼短</h1></div><i class="tape" aria-hidden="true"></i>' +
    '<nav class="snav">' + nav.map(([v, t, n]) => '<a href="#' + v + '" class="' + (view === v ? "on" : "") + '">' + icon(v) + "<span>" + t + "</span>" + (n ? "<b>" + n + "</b>" : "") + "</a>").join("") + "</nav>" +
    '<section class="sprojects"><div class="sp-head"><a href="#projects">Projects</a><button type="button" class="icon-btn" data-act="new-project-side" aria-label="New project">' + icon("plus") + "</button></div>" +
    (projects || '<p class="sp-empty">None yet</p>') + "</section>" +
    '<footer class="sfoot"><button type="button" class="sync-pill' + (st.bad ? " bad" : "") + '" data-act="sync" title="Sync now">' + icon("sync") + '<span data-sync-status>' + esc(st.text) + "</span></button>" +
    '<button type="button" class="icon-btn" data-act="theme-cycle" title="Theme: ' + theme + '">' + icon(theme === "dark" ? "moon" : theme === "light" ? "sun" : "auto") + "</button></footer>";
}

// ---------- 整页重画（正在打字的输入框，值、光标都留住） ----------

function captureKeep() {
  const keep = {};
  document.querySelectorAll("#main [data-keep], #pool [data-keep]").forEach((el) => {
    keep[el.dataset.keep] = { value: el.value, start: el.selectionStart, end: el.selectionEnd };
  });
  const a = document.activeElement;
  return { keep, active: a?.dataset?.keep && a.closest("#main, #pool") ? a.dataset.keep : "" };
}

function restoreKeep({ keep, active }) {
  for (const [k, v] of Object.entries(keep)) {
    const el = document.querySelector('#main [data-keep="' + k + '"], #pool [data-keep="' + k + '"]');
    if (!el) continue;
    if (el.value !== v.value) el.value = v.value;
    if (k === active) {
      el.focus({ preventScroll: true });
      try { el.setSelectionRange(v.start, v.end); } catch { /* number / date 输入框不支持 */ }
    }
  }
}

let raf = 0;
function render() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(draw);
}

function draw() {
  const c = store.ctx();
  const phone = phoneMQ.matches;
  const view = route();
  document.body.dataset.view = view;
  document.body.classList.toggle("phone", phone);
  const kept = captureKeep();
  side.innerHTML = phone ? "" : sidebarHTML(c, view);
  main.innerHTML = view === "calendar" ? calendarHTML(c) : view === "projects" ? projectsHTML(c) : view === "routines" ? routinesHTML() : view === "stats" ? statsHTML(c) : view === "settings" ? settingsHTML(phone) : todayHTML(c, phone);
  const showPool = !phone && view === "calendar" && store.local().pool;
  pool.hidden = !showPool;
  pool.innerHTML = showPool ? poolHTML(c) : "";
  restoreKeep(kept);
  paintSync();
  refreshEditor();
  refreshDayModal();
  refreshProjectEditor();
  celebrate(c, view);
}

function paintSync() {
  const st = sync.getStatus();
  const pending = store.pendingCount();
  const text = st.text === "Syncing…" || st.bad || !pending ? st.text : sync.configured() ? "Unsynced changes" : st.text;
  document.querySelectorAll("[data-sync-status]").forEach((el) => {
    el.textContent = text;
    el.closest(".sync-pill, .sync-status, .psync")?.classList.toggle("bad", st.bad);
  });
}

// 守住今天的线：一天只庆祝一次
function celebrate(c, view) {
  if (view !== "today" || shownDate() !== c.today) return;
  const { line, done } = lineInfo(c, c.today);
  if (line < 1 || done < line - 1) return;
  if (localStorage.getItem("kuzhouduan-celebrated") === c.today) return;
  localStorage.setItem("kuzhouduan-celebrated", c.today);
  confetti();
  toast("Line held ✓ Nice.");
}

// ---------- 同步时机 ----------

// 同步完：拍今天的安全线快照，补上重复任务接下来两周的那几次
async function syncThenLog() {
  await sync.sync();
  store.ensureTodayLog();
  store.materializeRoutines();
}

let lastToday = store.today();
function tickDay() {
  const t = store.today();
  if (t === lastToday) return;
  lastToday = t;
  store.ensureTodayLog();
  store.materializeRoutines();
  render();
}

// ---------- 启动 ----------

applyTheme();
initFx();
setFx(store.local().fx !== false);
initModal();
initToday(render);
initCalendar(render);
initProjects(render);
initSettings(applyTheme);
initEditor();
initDnd(handleDrop);
initStats(render);
initRoutines();

store.subscribe((meta) => {
  if (meta.local) setFx(store.local().fx !== false);
  if (!meta.quiet) render();
  else paintSync();
  if (meta.dirty) sync.queue();
});
store.onUndo((label, before) => toast(label, () => store.undo(before)));
sync.onStatus(paintSync);

addEventListener("hashchange", () => { closeModal(); render(); scrollTo(0, 0); });
phoneMQ.addEventListener("change", render);
darkMQ.addEventListener("change", () => { if (store.local().theme === "auto") { applyTheme(); render(); } });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") sync.beacon();
  else { tickDay(); syncThenLog(); }
});
addEventListener("online", () => syncThenLog());
setInterval(() => { if (document.visibilityState === "visible") syncThenLog(); }, 120000);
setInterval(tickDay, 60000);

on(document, "click", "[data-act=sync]", () => syncThenLog());
on(document, "click", "[data-act=ball]", (e, el) => { const b = el.getBoundingClientRect(); burst(b.left + b.width / 2, b.top + b.height / 2); });
on(document, "click", "[data-act=theme-cycle]", () => {
  const next = { auto: "light", light: "dark", dark: "auto" }[store.local().theme] || "auto";
  store.setLocal({ theme: next });
  applyTheme();
});
on(document, "click", "[data-open-project]", (e, el) => openProjectEditor(el.dataset.openProject));
on(document, "click", "[data-act=new-project-side]", () => openProjectEditor(""));

// 装到主屏后没网也能打开（只在 https 上，也就是 GitHub Pages）
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("./sw.js").catch(() => {});

render();
// 早上的线要等表格里的数据拉下来再拍；连不上就 6 秒后用本机的
if (sync.configured()) await Promise.race([syncThenLog(), new Promise((r) => setTimeout(r, 6000))]);
store.ensureTodayLog();
store.materializeRoutines();
