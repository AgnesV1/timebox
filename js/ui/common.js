// 几个页面都用得到的小块：颜色、安全线卡片、进度条、拖延账单、健康标签、提示条

import * as E from "../engine.js";
import * as store from "../store.js";
import { esc } from "../dom.js";
import { fmtMin } from "../dates.js";
import { zebraFor } from "../patterns.js";

export const STATUS = [["done", "Done"], ["partial", "Partial"], ["later", "Later"], ["drop", "Drop"]];

export const projectOf = (t) => (t.projectId ? store.get("projects", t.projectId) : null);

// 两层：上一层「项目」= 子项目的 group，下面是子项目（projects 表里的行）。
// 按出现顺序分好组：[{ name, subs }]，没有项目的那些放最后（name 为空）
export function groupsOf(projects) {
  const map = new Map();
  for (const p of projects) {
    const g = String(p.group || "").trim();
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(p);
  }
  const out = [...map.entries()].filter(([g]) => g).map(([name, subs]) => ({ name, subs }));
  if (map.has("")) out.push({ name: "", subs: map.get("") });
  return out;
}

// 下拉框：按项目分组列子项目
export function projectOptions(projects, selected = "", none = "No sub-project") {
  const opt = (p) => '<option value="' + p.id + '"' + (p.id === selected ? " selected" : "") + ">" + esc(p.name) + "</option>";
  return (none === null ? "" : '<option value="">' + none + "</option>") + groupsOf(projects).map((g) =>
    g.name ? '<optgroup label="' + esc(g.name) + '">' + g.subs.map(opt).join("") + "</optgroup>" : g.subs.map(opt).join("")).join("");
}

// 「Main - French · Module #4」
export const fullName = (p) => (p.group ? p.group + " · " : "") + p.name;

// 任务的颜色：计划的颜色，没挂计划是灰
export function colorOf(t) {
  return projectOf(t)?.color || "var(--c-None)";
}

export function zebraOf(t) {
  const p = projectOf(t);
  return p?.color ? zebraFor(p.color) : "var(--zebra-None)";
}

// 做完 = 纯色；部分完成 = 豹纹；还没做 = 斑马纹；Later 只剩描边；Drop 淡掉
export function segStyle(t) {
  const c = colorOf(t);
  if (t.status === "done") return "background:" + c;
  if (t.status === "partial") return "background:var(--leo-dark) 0 0/30px 30px," + c;
  if (t.status === "drop") return "background:var(--track);opacity:.4";
  if (t.status === "later") return "background:var(--track);box-shadow:inset 0 0 0 1.5px " + c;
  return "background:" + zebraOf(t) + " 0 0/22px 22px,var(--track)";
}

const perDay = (v) => (v < 1 ? "<1m" : fmtMin(v));

// 某天的安全线：今天用早上的快照；过去的用当天的快照；以后的现算
export function lineInfo(c, d) {
  let line = 0, shares = {};
  if (d === c.today) {
    const tl = E.todayLine(c);
    line = tl.line; shares = tl.shares;
  } else if (d < c.today) {
    const e = c.log[d];
    line = e?.need || 0; shares = e?.projects || {};
  } else {
    for (const p of c.projects) { const n = Math.round(E.needOn(c, p, d)); if (n > 0) shares[p.id] = n; }
    line = Object.values(shares).reduce((a, v) => a + v, 0);
  }
  return { line: Math.round(line), shares, done: Math.round(E.doneOn(c, d)) };
}

export function heroHTML(c, d) {
  const { line, shares, done } = lineInfo(c, d);
  const day = E.daySummary(c, d);
  const isToday = d === c.today;
  const streak = isToday ? E.streak(c) : 0;
  const pct = (v, scale) => Math.min(100, (v / scale) * 100).toFixed(1) + "%";
  if (line < 1) {
    const scale = Math.max(day.cap, day.planned, day.done, 60);
    return '<section class="hero free">' +
      '<div class="k">' + (isToday ? "Today" : "This day") + "</div>" +
      '<div class="nums"><span class="big">' + Math.round(day.done) + '</span><span class="of">/ ' + day.planned + ' min</span><span class="state quiet">No project line</span></div>' +
      '<div class="meter"><div class="fill" style="width:' + pct(day.done, scale) + '"></div></div>' +
      '<div class="meta"><span>' + (streak ? "🔥 " + streak + "-day streak" : "Nothing due from projects") + "</span></div></section>";
  }
  const scale = Math.max(day.cap, line * 1.2, done, 60);
  const held = done >= line - 1;
  const state = held ? (done - line >= 5 ? "+" + fmtMin(done - line) + " ahead" : "Line held ✓") : fmtMin(line - done) + " to go";
  const ahead = isToday ? E.todayAhead(c) : null;
  const chips = Object.entries(shares).filter(([, v]) => v > 0).map(([pid, min]) => {
    const p = store.get("projects", pid);
    if (!p) return "";
    const doneP = Math.round(E.tasksOn(c, d).filter((t) => t.projectId === pid).reduce((a, t) => a + E.spentMin(t), 0));
    return '<span class="share' + (doneP >= min - 1 ? " met" : "") + '" style="--pc:' + esc(p.color) + '"><i></i>' + esc(p.name) + " <b>" + doneP + "/" + min + "m</b></span>";
  }).join("");
  return '<section class="hero' + (held ? " held" : "") + '">' +
    '<div class="k">' + (isToday ? "Today's line" : d < c.today ? "That day's line" : "Planned line") + "</div>" +
    '<div class="nums"><span class="big">' + done + '</span><span class="of">/ ' + line + ' min</span><span class="state">' + state + "</span></div>" +
    '<div class="meter"><div class="fill" style="width:' + pct(done, scale) + '"></div><i class="tick" style="left:' + pct(line, scale) + '"><span>line ' + line + "</span></i></div>" +
    (chips ? '<div class="shares">' + chips + "</div>" : "") +
    '<div class="meta"><span>' + (streak ? "🔥 " + streak + "-day streak" : "") + "</span><span>" +
    (ahead ? "Ahead " + fmtMin(ahead.extra) + " · " + perDay(ahead.lessPerDay) + " less a day for " + ahead.days + "d" : "") + "</span></div></section>";
}

export function stripHTML(c, d, tasks) {
  const day = E.daySummary(c, d);
  const over = day.cap > 0 && day.planned > day.cap;
  return '<div class="strip">' + tasks.map((t) => '<i title="' + esc(t.title) + " · " + t.est + ' min" style="flex-grow:' + Math.max(5, Number(t.est) || 0) + ";" + segStyle(t) + '"></i>').join("") + "</div>" +
    '<div class="stripmeta' + (over ? " over" : "") + '"><span>' + day.planned + " / " + (day.cap || "—") + " min planned" + (over ? " · over" : "") + "</span><span>" + Math.round(day.done) + " min done</span></div>";
}

export function billHTML(bill) {
  if (!bill || bill.kind === "met") return "";
  let text;
  if (bill.kind === "ahead") text = "<b>Yesterday you did " + fmtMin(bill.extra) + " extra.</b> Spread over the next " + bill.days + " days — " + perDay(bill.lessPerDay) + " less a day.";
  else if (bill.kind === "rest") text = "<b>Yesterday was a rest day.</b> Deadlines didn't move — " + perDay(bill.extraPerDay) + " more a day for " + bill.days + " days catches up.";
  else text = "<b>Yesterday ran " + fmtMin(bill.short) + " short.</b> Spread over the next " + bill.days + " days — about +" + perDay(bill.extraPerDay) + " a day.";
  return '<div class="bill ' + bill.kind + '">' + text + "</div>";
}

const HEALTH = { safe: "●", tight: "●", danger: "●", done: "✓", empty: "○", open: "○", waiting: "◷", dropped: "×" };
export function healthPill(h) {
  return '<span class="health h-' + h.level + '">' + (HEALTH[h.level] || "●") + " " + esc(h.text) + "</span>";
}

// ---------- 提示条（带撤销） ----------

let toastTimer = 0;
export function toast(msg, undoFn) {
  const box = document.getElementById("toast");
  if (!box) return;
  box.innerHTML = "<span>" + esc(msg) + "</span>" + (undoFn ? '<button type="button">Undo</button>' : "");
  box.hidden = false;
  box.classList.remove("show");
  void box.offsetWidth;
  box.classList.add("show");
  const btn = box.querySelector("button");
  if (btn) btn.onclick = () => { undoFn(); hide(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, 6000);
  function hide() { box.classList.remove("show"); box.hidden = true; }
}
