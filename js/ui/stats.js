// 统计页（电脑）：选一段时间，看花了多少、做完多少、守住几天线、估时准不准，
// 每天用了多少 vs 计划多少、各分类、星期几的节奏、没做完的原因、各项目计划和实际。
// 图都是 HTML 画的；每张图都有「表格」可以展开，鼠标移上去有读数。

import * as store from "../store.js";
import * as S from "../stats.js";
import { esc, on, icon } from "../dom.js";
import { fmtMin, fmtShort, fmtDay, WEEKDAYS, MONTHS, MONTHS_LONG, weekday, addDays } from "../dates.js";
import { healthPill, groupsOf } from "./common.js";

let kind = "d30";
let anchor = "";
const tips = {};   // 图表 id → 每根柱子的读数

const PREV = { week: "last week", d30: "the 30 days before", month: "last month", year: "last year" };
const pct = (v) => Math.round(v * 100) + "%";

function niceMax(v) {
  const steps = [30, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720, 900, 1200, 1500, 1800, 2400, 3000, 3600, 4800, 6000, 7200, 9000, 12000, 18000];
  return steps.find((s) => s >= v) || Math.ceil(v / 6000) * 6000;
}

function rangeLabel(r) {
  const y = r.from.slice(0, 4);
  if (kind === "month") return MONTHS_LONG[Number(r.from.slice(5, 7)) - 1] + " " + y;
  if (kind === "year") return y;
  return fmtShort(r.from) + " – " + fmtShort(r.to) + (r.to.slice(0, 4) !== String(new Date().getFullYear()) ? ", " + r.to.slice(0, 4) : "");
}

// 和上一段比：▲ / ▼ 加文字，涨了是好事就用「好」的颜色
function delta(cur, prev, fmt, goodUp = true) {
  if (cur === null || prev === null || prev === undefined) return "";
  const d = cur - prev;
  if (Math.abs(d) < 1e-6) return '<span class="delta">Same as ' + PREV[kind] + "</span>";
  const up = d > 0;
  return '<span class="delta ' + (up === goodUp ? "good" : "bad") + '">' + (up ? "▲ " : "▼ ") + fmt(Math.abs(d)) + " vs " + PREV[kind] + "</span>";
}

function tile(label, value, sub, dlt = "") {
  return '<div class="tile"><p class="tl">' + label + '</p><p class="tv">' + value + "</p>" + (sub ? '<p class="ts">' + sub + "</p>" : "") + dlt + "</div>";
}

function kpis(s, p) {
  const acc = s.accuracy;
  const accText = acc === null ? "Fill in Actual min on done tasks to see this"
    : Math.abs(acc - 1) < 0.05 ? "Your estimates are about right"
    : acc > 1 ? "Tasks take " + pct(acc - 1) + " longer than planned" : "Tasks take " + pct(1 - acc) + " less than planned";
  return '<div class="kpis">' +
    tile("Time spent", fmtMin(s.spent), s.days ? "About " + fmtMin(s.avgSpent) + " a day" : "Nothing yet", delta(s.spent, p.spent, fmtMin)) +
    tile("Tasks done", String(s.done), s.counted ? pct(s.rate) + " of " + s.counted + " planned" : "No tasks yet", delta(s.done, p.done, String)) +
    tile("Line held", s.lineDays ? s.held + " / " + s.lineDays : "—", s.lineDays ? "days you reached the project line" : "Projects with deadlines set a line", s.lineDays && p.lineDays ? delta(s.held / s.lineDays, p.held / p.lineDays, pct) : "") +
    tile("Active days", String(s.active), "of " + s.days + " days", delta(s.active, p.active, String)) +
    tile("Estimates", acc === null ? "—" : acc.toFixed(2) + "×", accText + (s.timed ? " · " + s.timed + " timed" : "")) +
    "</div>";
}

// ---------- 每天用了多少（柱）vs 计划多少（底色）和当天的线（横线） ----------

function trendHTML(s) {
  const ws = store.prefs().weekStartsOn;
  const rows = kind === "year" ? S.weekly(s.daily, ws) : s.daily;
  const max = niceMax(Math.max(60, ...rows.map((r) => Math.max(r.spent, r.planned, r.line))));
  const h = (v) => Math.min(100, (v / max) * 100).toFixed(2) + "%";
  const unit = kind === "year" ? "week" : "day";
  tips.trend = rows.map((r) => ({
    title: kind === "year" ? "Week of " + fmtShort(r.date) : fmtDay(r.date),
    rows: [["Done", fmtMin(r.spent), "dn"], ["Planned", fmtMin(r.planned), "pl"], ["Line", r.line ? fmtMin(r.line) : "—", "ln"]]
  }));
  // 横轴只标几个点：周 = 星期几；年 = 每月第一周标月份（按这一周的周四算，跨年那周不会多标一个月）；其他 = 1 号和 5 的倍数。
  // 离上一个标签不到 3 根柱子的就不标，免得挤在一起
  let lastShown = -9;
  const label = (r, i) => {
    if (kind === "week") return WEEKDAYS[weekday(r.date)];
    let text = "";
    if (kind === "year") {
      const m = addDays(r.date, 3).slice(5, 7);
      if (i === 0 || addDays(rows[i - 1].date, 3).slice(5, 7) !== m) text = MONTHS[Number(m) - 1];
    } else {
      const d = Number(r.date.slice(8));
      if (i === 0 || d === 1) text = fmtShort(r.date);
      else if (d % 5 === 0) text = String(d);
    }
    if (!text || i - lastShown < 3) return "";
    lastShown = i;
    return text;
  };
  const insight = s.days
    ? "On average you planned <b>" + fmtMin(s.avgPlanned) + "</b> and spent <b>" + fmtMin(s.avgSpent) + "</b> a day" + (s.avgCap ? ", with " + fmtMin(s.avgCap) + " available." : ".")
    : "This period hasn't started yet.";
  return '<figure class="card chart"><figcaption><div><h3>Time per ' + unit + "</h3><p>" + insight + "</p></div>" +
    '<div class="legend"><span><i class="k dn"></i>Done</span><span><i class="k pl"></i>Planned</span><span><i class="k ln"></i>Project line</span></div></figcaption>' +
    '<div class="plot">' + [1, 0.5, 0].map((f) => '<i class="grid" style="bottom:' + f * 100 + '%"><span class="num">' + (f ? fmtMin(max * f) : "0") + "</span></i>").join("") +
    '<div class="cols" data-chart="trend">' + rows.map((r, i) =>
      '<div class="col' + (r.future ? " future" : "") + '" data-i="' + i + '" tabindex="0" aria-label="' + esc(tips.trend[i].title + ": " + fmtMin(r.spent) + " done of " + fmtMin(r.planned) + " planned") + '">' +
      '<i class="pl" style="height:' + h(r.planned) + '"></i>' + (r.future ? "" : '<i class="dn" style="height:' + h(r.spent) + '"></i>') +
      (r.line ? '<i class="ln" style="bottom:' + h(r.line) + '"></i>' : "") + "</div>").join("") + "</div></div>" +
    '<div class="xaxis">' + rows.map((r, i) => "<span>" + label(r, i) + "</span>").join("") + "</div>" +
    '<details class="tview"><summary>Show as table</summary><table><thead><tr><th>' + (kind === "year" ? "Week of" : "Day") + "</th><th>Done</th><th>Planned</th><th>Line</th></tr></thead><tbody>" +
    rows.filter((r) => !r.future).map((r) => "<tr><td>" + fmtShort(r.date) + '</td><td class="num">' + fmtMin(r.spent) + '</td><td class="num">' + fmtMin(r.planned) + '</td><td class="num">' + (r.line ? fmtMin(r.line) : "—") + "</td></tr>").join("") +
    "</tbody></table></details></figure>";
}

// ---------- 各项目 ----------

function projectHTML(s) {
  if (!s.byProject.length) return '<section class="card"><h3>By project</h3><p class="empty">No tasks in this period.</p></section>';
  const max = Math.max(1, ...s.byProject.map((x) => x.spent));
  return '<section class="card"><h3>By project</h3><p class="lede">Time spent, how much got done, and how close the estimates were.</p><div class="crows">' +
    s.byProject.map((x) => {
      const c = esc(x.color || "var(--c-None)");
      return '<div class="crow"><span class="cname"><i style="background:' + c + '"></i>' + esc(x.name || "No project") + "</span>" +
        '<span class="ctrack"><i class="cbar" style="width:' + ((x.spent / max) * 100).toFixed(1) + "%;background:" + c + '"></i></span>' +
        '<span class="cval num">' + fmtMin(x.spent) + "</span>" +
        '<span class="cdone num">' + x.done + "/" + x.counted + (x.counted ? " · " + pct(x.done / x.counted) : "") + "</span>" +
        '<span class="cacc num">' + (x.accuracy === null ? "—" : x.accuracy.toFixed(2) + "×") + "</span></div>";
    }).join("") +
    '<div class="crow head"><span></span><span></span><span>Spent</span><span>Done</span><span>Est.</span></div></div></section>';
}

// ---------- 星期几 ----------

function weekdayHTML(s) {
  const ws = store.prefs().weekStartsOn;
  const order = ws === "sunday" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  const rows = order.map((wd) => s.byWeekday[wd]);
  const top = Math.max(...rows.map((r) => r.avg));
  const max = niceMax(Math.max(30, top));
  tips.weekday = rows.map((r) => ({ title: WEEKDAYS[r.wd] + " · " + r.days + " day" + (r.days === 1 ? "" : "s"), rows: [["Average", fmtMin(r.avg), "dn"]] }));
  return '<figure class="card chart small"><figcaption><div><h3>Weekly rhythm</h3><p>Average time spent on each weekday.</p></div></figcaption>' +
    '<div class="plot short">' + [1, 0.5, 0].map((f) => '<i class="grid" style="bottom:' + f * 100 + '%"><span class="num">' + (f ? fmtMin(max * f) : "0") + "</span></i>").join("") +
    '<div class="cols wide" data-chart="weekday">' + rows.map((r, i) =>
      '<div class="col" data-i="' + i + '" tabindex="0" aria-label="' + esc(WEEKDAYS[r.wd] + ": " + fmtMin(r.avg) + " on average") + '">' +
      '<i class="dn solo" style="height:' + ((r.avg / max) * 100).toFixed(2) + '%"></i>' +
      (top > 0 && r.avg === top ? '<b class="cap-label num" style="bottom:' + ((r.avg / max) * 100).toFixed(2) + '%">' + fmtMin(r.avg) + "</b>" : "") + "</div>").join("") + "</div></div>" +
    '<div class="xaxis wide">' + rows.map((r) => "<span>" + WEEKDAYS[r.wd] + "</span>").join("") + "</div>" +
    '<details class="tview"><summary>Show as table</summary><table><tbody>' + rows.map((r) => "<tr><td>" + WEEKDAYS[r.wd] + '</td><td class="num">' + fmtMin(r.avg) + "</td></tr>").join("") + "</tbody></table></details></figure>";
}

// ---------- 没做完的原因 ----------

function reasonsHTML(s) {
  const total = s.status.partial + s.status.later + s.status.drop;
  const head = '<div class="statuses"><span><b class="num">' + s.status.partial + '</b> ◐ Partial</span><span><b class="num">' + s.status.later + '</b> → Later</span><span><b class="num">' + s.status.drop + "</b> × Drop</span></div>";
  if (!total) return '<section class="card"><h3>Why things slipped</h3>' + head + '<p class="empty">Nothing slipped in this period.</p></section>';
  const list = s.reasons.slice(0, 8);
  const max = Math.max(1, ...list.map((g) => g.count));
  return '<section class="card"><h3>Why things slipped</h3>' + head +
    (list.length ? '<ol class="reasons">' + list.map((g) =>
      '<li><span class="rtext">' + esc(g.text) + '</span><span class="rtrack"><i style="width:' + ((g.count / max) * 100).toFixed(1) + '%"></i></span><b class="num">' + g.count + "</b></li>").join("") + "</ol>"
      : "") +
    (s.withoutReason ? '<p class="lede">' + s.withoutReason + " without a reason written down.</p>" : "") + "</section>";
}

// ---------- 项目 ----------

function projectsHTML(c, s) {
  const rows = S.projectRows(c, s.from, s.last);
  if (!rows.length) return "";
  return '<section class="card wide"><h3>Projects</h3><p class="lede">Planned = all items; done = how much of the plan is finished; spent = the real time it took.</p>' +
    '<div class="table-wrap"><table class="ptable"><thead><tr><th>Plan</th><th>Planned</th><th>Done</th><th>Spent</th><th>This period</th><th>Health</th></tr></thead><tbody>' +
    groupsOf(rows.map((r) => r.p)).map((g) => {
      const rs = g.subs.map((p) => rows.find((r) => r.p === p));
      const sum = (k) => rs.reduce((a, r) => a + r[k], 0);
      const head = g.name && rs.length > 1
        ? '<tr class="grow"><td>' + esc(g.name) + '</td><td class="num">' + fmtMin(sum("planned")) + '</td><td class="num">' + fmtMin(sum("done")) + '</td><td class="num">' + fmtMin(sum("spent")) + '</td><td class="num">' + fmtMin(sum("spentHere")) + "</td><td></td></tr>"
        : "";
      return head + rs.map((r) => '<tr' + (head ? ' class="nested"' : "") + '><td><span class="pdot" style="background:' + esc(r.p.color) + '"></span>' + (g.name && !head ? '<small class="gname">' + esc(g.name) + " · </small>" : "") + esc(r.p.name) + '</td><td class="num">' + fmtMin(r.planned) + '</td><td class="num">' + fmtMin(r.done) +
        (r.planned ? " <small>" + pct(r.done / r.planned) + "</small>" : "") + '</td><td class="num">' + fmtMin(r.spent) +
        (r.done > 0 && r.spent > 0 ? " <small>" + (r.spent / r.done).toFixed(2) + "×</small>" : "") + '</td><td class="num">' + fmtMin(r.spentHere) + "</td><td>" + (r.p.kind === "regular" ? '<span class="health h-regular">↻ Regular</span>' : healthPill(r.health)) + "</td></tr>").join("");
    }).join("") +
    "</tbody></table></div></section>";
}

export function statsHTML(c) {
  if (!anchor) anchor = c.today;
  const ws = store.prefs().weekStartsOn;
  const r = S.periodRange(kind, anchor, ws);
  const p = S.previousRange(kind, r, ws);
  const s = S.summarize(c, r.from, r.to);
  const prev = S.summarize(c, p.from, p.to);
  return '<div class="stats"><header class="page-head"><div><h2>' + rangeLabel(r) + "</h2></div>" +
    '<div class="tools"><span class="seg">' + Object.entries(S.PERIODS).map(([k, t]) => '<button type="button" data-act="period" data-k="' + k + '"' + (k === kind ? ' class="on"' : "") + ">" + t + "</button>").join("") + "</span>" +
    '<button type="button" class="nav" data-act="st-prev" aria-label="Earlier">' + icon("left") + '</button><button type="button" class="nav" data-act="st-today">Now</button>' +
    '<button type="button" class="nav" data-act="st-next" aria-label="Later"' + (r.to >= c.today ? " disabled" : "") + ">" + icon("right") + "</button></div></header>" +
    kpis(s, prev) + trendHTML(s) +
    '<div class="stat-grid">' + projectHTML(s) + weekdayHTML(s) + reasonsHTML(s) + "</div>" +
    projectsHTML(c, s) + "</div>";
}

// ---------- 交互：切时间段、读数提示 ----------

function showTip(col) {
  const chart = col.closest("[data-chart]")?.dataset.chart;
  const data = tips[chart]?.[Number(col.dataset.i)];
  const tip = document.getElementById("ctip");
  if (!data || !tip) return;
  tip.textContent = "";
  const title = document.createElement("p");
  title.className = "tt";
  title.textContent = data.title;
  tip.appendChild(title);
  for (const [name, value, cls] of data.rows) {
    const row = document.createElement("p");
    const k = document.createElement("i");
    k.className = "k " + cls;
    const v = document.createElement("b");
    v.textContent = value;
    row.append(k, v, " " + name);
    tip.appendChild(row);
  }
  tip.hidden = false;
  const b = col.getBoundingClientRect(), t = tip.getBoundingClientRect();
  let x = b.left + b.width / 2 - t.width / 2;
  x = Math.max(8, Math.min(innerWidth - t.width - 8, x));
  tip.style.transform = "translate(" + x + "px," + Math.max(8, b.top - t.height - 8) + "px)";
  col.classList.add("hot");
}

function hideTip(col) {
  col?.classList.remove("hot");
  const tip = document.getElementById("ctip");
  if (tip) tip.hidden = true;
}

export function initStats(rerender) {
  const tip = document.createElement("div");
  tip.id = "ctip";
  tip.className = "ctip";
  tip.hidden = true;
  document.body.appendChild(tip);
  on(document, "click", ".stats [data-act]", (e, el) => {
    const act = el.dataset.act;
    if (act === "period") kind = el.dataset.k;
    else if (act === "st-prev") anchor = S.shiftAnchor(kind, anchor || store.today(), -1);
    else if (act === "st-next") anchor = S.shiftAnchor(kind, anchor || store.today(), 1);
    else if (act === "st-today") anchor = store.today();
    if (anchor > store.today()) anchor = store.today();
    rerender();
  });
  on(document, "pointerover", ".stats .col", (e, col) => showTip(col));
  on(document, "pointerout", ".stats .col", (e, col) => hideTip(col));
  on(document, "focusin", ".stats .col", (e, col) => showTip(col));
  on(document, "focusout", ".stats .col", (e, col) => hideTip(col));
}
