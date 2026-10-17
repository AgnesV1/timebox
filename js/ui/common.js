// 几个页面都用得到的小块：颜色、安全线卡片、进度条、拖延账单、健康标签、提示条

import * as E from "../engine.js";
import * as store from "../store.js";
import { esc } from "../dom.js";
import { fmtMin } from "../dates.js";
import { zebraFor } from "../patterns.js";

export const STATUS = [["done", "Done"], ["partial", "Partial"], ["later", "Later"], ["drop", "Drop"]];

// 侧栏左上 / 手机顶栏的那颗日月：白天是太阳、夜里是月亮（颜色在 css 的 .ball），点一下换白天 / 夜里（js/main.js）。
// 上面一层镜面球的细格：纬线不动，八条经线各自走到下一条的位置（--a → --b 是这一格起止的 sin 值），首尾相接，看着就是球绕着竖轴在转
const RAD = Math.PI / 180;
const BALL = '<svg viewBox="0 0 100 100" aria-hidden="true"><g class="ball-grid">' +
  [-67.5, -45, -22.5, 0, 22.5, 45, 67.5].map((f) => { const y = 50 + 50 * Math.sin(f * RAD), w = 50 * Math.cos(f * RAD); return '<path d="M' + (50 - w).toFixed(1) + " " + y.toFixed(1) + "H" + (50 + w).toFixed(1) + '"/>'; }).join("") +
  Array.from({ length: 8 }, (_, k) => -90 + k * 22.5).map((t) => '<path class="ball-lon" style="--a:' + Math.sin(t * RAD).toFixed(3) + ";--b:" + Math.sin((t + 22.5) * RAD).toFixed(3) + '" d="M50 0A50 50 0 0 1 50 100"/>').join("") +
  '</g><circle class="ball-shine" cx="33" cy="30" r="9"/></svg>';
export const ballHTML = () => '<button type="button" class="ball" data-act="theme-flip" aria-label="Switch between day and night" title="Day / night">' + BALL + "</button>";

export const projectOf = (t) => (t.projectId ? store.get("projects", t.projectId) : null);

// 两层：上一层「项目」= 大类（计划的 group），下面是计划（projects 表里的行）。
// 分好组：[{ name, subs }]，先按大类清单的顺序，再是清单里没有的名字，没有大类的那些放最后（name 为空）。
// all = 清单里的大类哪怕下面没有计划也列出来（Projects 页用）
export function groupsOf(projects, { all = false } = {}) {
  const map = new Map();
  for (const g of store.groups()) map.set(g.name, []);
  for (const p of projects) {
    const g = String(p.group || "").trim();
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(p);
  }
  const listed = new Set(store.groups().map((g) => g.name));
  const out = [...map.entries()].filter(([g, subs]) => g && (subs.length || (all && listed.has(g)))).map(([name, subs]) => ({ name, subs }));
  if (map.get("")?.length) out.push({ name: "", subs: map.get("") });
  return out;
}

// 下拉框：每个大类一组，组里第一项是大类自己（直接挂在大类上，值 g:<名字>），下面是它的计划（值 = 计划 id）。
// direct = false 时只列计划（任务池里加条目要落在某个计划上）
export function projectOptions(projects, selected = "", none = "No project", direct = true) {
  const opt = (p) => '<option value="' + p.id + '"' + (p.id === selected ? " selected" : "") + ' data-color="' + esc(p.color || "") + '">' + esc(p.name) + "</option>";
  const self = (g) => { const v = "g:" + g.name, x = store.groupByName(g.name); return x && direct ? '<option value="' + esc(v) + '"' + (v === selected ? " selected" : "") + ' data-self data-color="' + esc(x.color || "") + '">' + esc(g.name) + "</option>" : ""; };
  return (none === null ? "" : '<option value="">' + none + "</option>") + groupsOf(projects, { all: direct }).map((g) =>
    g.name ? '<optgroup label="' + esc(g.name) + '">' + self(g) + g.subs.map(opt).join("") + "</optgroup>" : g.subs.map(opt).join("")).join("");
}

// 下拉选中的值 → 任务挂在哪：计划，或者直接挂在大类上
export const pickTarget = (v) => (String(v || "").startsWith("g:") ? { projectId: "", group: String(v).slice(2) } : { projectId: String(v || ""), group: "" });
// 任务现在挂在哪（下拉的值）
export const targetOf = (t) => t.projectId || (t.group ? "g:" + t.group : "");

// 「Main - French · Module #4」
export const fullName = (p) => (p.group ? p.group + " · " : "") + p.name;

// 任务的颜色：计划的颜色；直接挂在大类上的用大类的；都没有是灰
export function colorOf(t) {
  return projectOf(t)?.color || store.groupByName(t.group)?.color || "var(--c-None)";
}

// 加任务 / 改任务 / 补时间的下拉里能选的计划：在用的，不含循环小事（那是一条重复，不是能往下挂任务的计划）。keep = 任务现在挂着的那个，留着
export const pickable = (projects, keep = "") => projects.filter((p) => (E.isActive(p) && !E.isRepeat(p)) || (keep && p.id === keep));

// 任务旁边那个小标签：计划的名字；直接挂在大类上的、还有循环小事的那一次（它直接算在大类上），是大类的名字
export function badgeOf(t) {
  const p = projectOf(t);
  if (p && E.isRepeat(p)) return p.group ? { name: p.group, color: store.groupByName(p.group)?.color || p.color || "" } : null;
  return p ? { name: p.name || "", color: p.color || "" } : t.group ? { name: t.group, color: store.groupByName(t.group)?.color || "" } : null;
}

export function zebraOf(t) {
  const c = projectOf(t)?.color || store.groupByName(t.group)?.color;
  return c ? zebraFor(c) : "var(--zebra-None)";
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
  const pct = (v, scale) => Math.min(100, (v / scale) * 100).toFixed(1) + "%";
  if (line < 1) {
    const scale = Math.max(day.cap, day.planned, day.done, 60);
    return '<section class="hero free">' +
      '<div class="hero-k">' + (isToday ? "Today" : "This day") + "</div>" +
      '<div class="nums"><span class="big" data-roll="hero-' + d + '">' + Math.round(day.done) + '</span><span class="of">/ ' + day.planned + ' min</span><span class="state quiet">No project line</span></div>' +
      '<div class="meter"><div class="fill" style="width:' + pct(day.done, scale) + '"></div></div>' +
      '<div class="meta"><span>Nothing due from projects</span></div></section>';
  }
  const scale = Math.max(day.cap, line * 1.2, done, 60);
  const held = done >= line - 1;
  const state = held ? (done - line >= 5 ? "+" + fmtMin(done - line) + " ahead" : "Line held ✓") : fmtMin(line - done) + " to go";
  const ahead = isToday ? E.todayAhead(c) : null;
  // 线来自哪几个计划：只有一个的话，大字的「/ 15 min」就是它，小签只写名字；两个以上才各写各的「做了 / 要做」
  const parts = Object.entries(shares).filter(([, v]) => v > 0).map(([pid, min]) => ({ p: store.get("projects", pid), pid, min })).filter((x) => x.p);
  const chips = parts.map(({ p, pid, min }) => {
    const doneP = Math.round(E.tasksOn(c, d).filter((t) => t.projectId === pid).reduce((a, t) => a + E.spentMin(t), 0));
    return '<span class="share' + (doneP >= min - 1 ? " met" : "") + '" style="--pc:' + esc(p.color) + '"><i></i>' + esc(p.name) + (parts.length > 1 ? " <b>" + doneP + "/" + min + "m</b>" : "") + "</span>";
  }).join("");
  return '<section class="hero' + (held ? " held" : "") + '">' +
    '<div class="hero-k">' + (isToday ? "Today's line" : d < c.today ? "That day's line" : "Planned line") + "</div>" +
    '<div class="nums"><span class="big" data-roll="hero-' + d + '">' + done + '</span><span class="of">/ ' + line + ' min</span><span class="state">' + state + "</span></div>" +
    '<div class="meter"><div class="fill" style="width:' + pct(done, scale) + '"></div><i class="tick" style="left:' + pct(line, scale) + '"></i></div>' +
    (chips ? '<div class="shares">' + chips + "</div>" : "") +
    (ahead ? '<div class="meta"><span></span><span>Ahead ' + fmtMin(ahead.extra) + " · " + perDay(ahead.lessPerDay) + " less a day for " + ahead.days + "d</span></div>" : "") + "</section>";
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

// ---------- emoji 记号（Restock 的标记、Ideas 的类别） ----------
// tags = [[key, emoji, 名字]]。名字只在 title / aria-label 里，界面上只露 emoji。

// 挑一个：一排 emoji 小块，选着的那个亮；再点一下选着的 = 不要了（由调用的地方决定）
export function emojiPickHTML(act, tags, cur) {
  return '<span class="em-pick">' + tags.map(([k, e, name]) => '<button type="button" class="chip' + (cur === k ? " on" : "") + '" data-act="' + act + '" data-v="' + k + '" aria-pressed="' + (cur === k) + '" title="' + esc(name) + '" aria-label="' + esc(name) + '">' + e + "</button>").join("") + "</span>";
}

// 页面顶上的筛选：All + 有东西的那几个记号（带个数）；cur = 正在看的那个，空 = 全部。一样东西都没有就不画
export function tagFilterHTML(act, tags, counts, cur) {
  const total = Object.values(counts).reduce((a, n) => a + n, 0);
  if (!total) return "";
  const b = (k, label, n, title) => '<button type="button" class="tagf-b' + (cur === k ? " on" : "") + '" data-act="' + act + '" data-v="' + k + '" aria-pressed="' + (cur === k) + '"' + (title ? ' title="' + esc(title) + '"' : "") + ">" + label + ' <small class="num">' + n + "</small></button>";
  return '<div class="tagf" role="group" aria-label="Filter">' + b("", "All", total) + tags.filter(([k]) => counts[k] || cur === k).map(([k, e, name]) => b(k, e, counts[k] || 0, name)).join("") + "</div>";
}

// ---------- 提示条（带撤销） ----------

let toastTimer = 0;
export function toast(msg, undoFn) {
  const box = document.getElementById("toast");
  if (!box) return;
  box.innerHTML = "<span>" + esc(msg) + "</span>" + (undoFn ? '<button type="button">Undo</button>' : "");
  box.hidden = false;
  box.classList.remove("show", "out");
  void box.offsetWidth;
  box.classList.add("show");
  const btn = box.querySelector("button");
  if (btn) btn.onclick = () => { undoFn(); hide(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, 6000);
  // 走的时候往下沉着淡掉（css 的 #toast.out，0.2 秒）；系统要求减少动态就直接收
  function hide() {
    box.classList.remove("show");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { box.hidden = true; return; }
    box.classList.add("out");
    setTimeout(() => { if (box.classList.contains("out")) { box.classList.remove("out"); box.hidden = true; } }, 200);
  }
}
