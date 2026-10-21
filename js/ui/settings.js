// 设置：连表格、每天能用多少时间、新的一天从几点开始、各个大类算不算数和每周的门槛、季度表（和每天打分的那几列）、阅读表格、外观、
// 这台设备的存储（快满了可以归档）、导出备份（手机上只有外观和连表格）

import * as store from "../store.js";
import * as sync from "../sync.js";
import * as spend from "../spend.js";
import { esc, on, icon } from "../dom.js";
import { WEEKDAYS, isoOf, fmtShort } from "../dates.js";
import { WEEKLY } from "../stats.js";
import { trackOf, ideasOf, TRACK_MIN } from "../groups.js";
import { toast } from "./common.js";
import { looksLikeSheet } from "../reading.js";
import { saveReadingLink } from "./reading.js";

// 手机上只留两块：连表格 / 同步，和白天黑夜；每天的时间这些在电脑上设
export function settingsHTML(phone) {
  const l = store.local(), cap = store.capacitySettings(), pr = store.prefs();
  const weekly = Array.isArray(cap.weekly) ? cap.weekly : [];
  const order = pr.weekStartsOn === "sunday" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  const st = sync.getStatus();

  const sheet = '<section class="card"><h3>Google Sheet</h3>' +
    '<label class="field"><span>Apps Script URL</span><input data-local="url" value="' + esc(l.url) + '" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" spellcheck="false"></label>' +
    '<label class="field"><span>Secret (same as SECRET in Code.gs)</span><input data-local="secret" type="password" value="' + esc(l.secret) + '" autocomplete="off"></label>' +
    '<p class="hint">The Sheet holds your data; this device keeps an offline copy. Both stay in this browser only — they are never in the code.</p>' +
    '<div class="btns"><button type="button" class="btn primary" data-act="sync">' + icon("sync") + ' Sync now</button><button type="button" class="btn" data-act="full">Reload everything from the Sheet</button>' +
    '<span class="sync-status' + (st.bad ? " bad" : "") + '" data-sync-status>' + esc(st.text) + "</span></div></section>";

  const time = '<section class="card"><h3>Time</h3>' +
    '<label class="field small"><span>Minutes per day (default)</span><input data-cap="default" class="num" type="number" min="0" step="15" value="' + esc(cap.default) + '"></label>' +
    '<div class="field"><span>By weekday — leave empty to use the default, 0 = rest day</span><div class="weekly">' +
    order.map((d) => '<label><b>' + WEEKDAYS[d] + '</b><input data-week="' + d + '" class="num" type="number" min="0" step="15" placeholder="' + esc(cap.default) + '" value="' + (weekly.length === 7 && weekly[d] !== cap.default ? esc(weekly[d]) : "") + '"></label>').join("") +
    "</div></div>" +
    '<div class="field-row"><label class="field"><span>A new day starts at</span><input data-pref="dayStartsAt" type="time" value="' + esc(pr.dayStartsAt) + '"></label>' +
    '<label class="field"><span>Week starts on</span><select data-pref="weekStartsOn"><option value="monday"' + (pr.weekStartsOn !== "sunday" ? " selected" : "") + '>Monday</option><option value="sunday"' + (pr.weekStartsOn === "sunday" ? " selected" : "") + ">Sunday</option></select></label></div>" +
    '<label class="check"><input type="checkbox" data-pref="level"' + (pr.level !== false ? " checked" : "") + "> Even out the load across projects (recommended)</label>" +
    '<p class="hint">Staying up past midnight still counts as the same day until the time above.</p></section>';

  // 白天夜里不在这儿选了：跟着钟点走，想换就点那颗日月（js/main.js）
  const look = '<section class="card"><h3>Look</h3>' +
    '<p class="hint look-hint">Day from 6:00, night from 18:00. Tap the sun or moon to switch until the next six o\'clock.</p>' +
    '<label class="check"><input type="checkbox" data-local-check="fx"' + (l.fx !== false ? " checked" : "") + "> Sparkles and confetti</label></section>";

  const read = '<section class="card"><h3>Reading</h3>' +
    '<label class="field"><span>Link to your reading Sheet</span><input data-reading-url value="' + esc(store.setting("reading")?.url || "") + '" placeholder="https://docs.google.com/spreadsheets/d/…/edit" autocomplete="off" spellcheck="false"></label>' +
    '<p class="hint">New entries from the Reading page go to a <b>Want</b> tab in that Sheet (made if it isn\'t there). Search looks through every tab — wherever a row says Name. The Sheet can stay private: it only has to be editable by the Google account your 苦昼短 Sheet belongs to.</p></section>';

  // 记账：单独一张 Google 表格（js/spend.js）。新建一个空白的、把链接贴进来；第一次同步时脚本自己建好几页
  const spendCard = '<section class="card"><h3>Spending</h3>' +
    '<label class="field"><span>Link to your spending Sheet</span><input data-spend-url value="' + esc(store.setting("spend")?.url || "") + '" placeholder="https://docs.google.com/spreadsheets/d/…/edit" autocomplete="off" spellcheck="false"></label>' +
    '<p class="hint">Make a blank Google Sheet and paste its link here. The first sync sets up <b>Transactions</b>, <b>Budgets</b> and <b>Categories</b> tabs — you can edit them there too. Same as reading: it can stay private, as long as the account your 苦昼短 Sheet belongs to can edit it.</p></section>';

  const backup = '<section class="card"><h3>Backup</h3><p class="hint">Everything is in your Sheet already. This saves a copy of this device\'s data as a file.</p>' +
    '<button type="button" class="btn" data-act="export">Export JSON</button></section>';

  // 各个大类：算不算季度表的 progress、算不算成长（全部 / 只算 Deep，剩下的是 Relax）、任务能不能选「和谁」、加任务时能不能从灵感池里挑、Projects 页上看它什么；每周四个门槛（小时）
  const wk = { ...WEEKLY, ...(store.setting("weekly", {}) || {}) };
  const hours = (k) => '<input class="num" type="number" min="0" step="1" data-wk="' + k + '" value="' + (Number(wk[k]) > 0 ? Math.round(Number(wk[k]) / 6) / 10 : "") + '" placeholder="off">';
  const groups = '<section class="card"><h3>Projects</h3><p class="hint">What each project counts towards. Rename, recolour and add projects on the Projects page.</p>' +
    '<div class="table-wrap"><table class="gtable"><thead><tr><th>Project</th><th>Progress <small>quarter sheet</small></th><th>Growth <small>weekly check</small></th><th>With… <small>pick people</small></th><th>Ideas <small>pick from the pool</small></th><th>Watch <small>on Projects</small></th></tr></thead><tbody>' +
    store.groups().map((g) => '<tr data-group="' + esc(g.name) + '"><th><i class="gdot" style="background:' + esc(g.color || "var(--c-None)") + '"></i>' + esc(g.name) + "</th>" +
      '<td><input type="checkbox" data-gf="labor"' + (g.labor ? " checked" : "") + ' aria-label="Counts as progress"></td>' +
      '<td><select data-gf="grow" aria-label="Growth">' + [["all", "All of it"], ["deep", "Only ◆ Deep — the rest is Relax"], ["", "Doesn't count"]].map(([v, l]) => '<option value="' + v + '"' + ((g.grow || "") === v ? " selected" : "") + ">" + l + "</option>").join("") + "</select></td>" +
      '<td><input type="checkbox" data-gf="friends"' + (g.friends ? " checked" : "") + ' aria-label="Tasks can pick people"></td>' +
      '<td><input type="checkbox" data-gf="ideas"' + (ideasOf(g) ? " checked" : "") + ' aria-label="Tasks can pick from Ideas"></td>' +
      '<td class="gwatch"><select data-gf="track" aria-label="What to watch on the Projects page">' + [["progress", "Plan progress"], ["min", "Hours a week, at least"], ["range", "Relax within the weekly limits"], ["contact", "A catch-up every 2 weeks"], ["", "Nothing"]].map(([v, l]) => '<option value="' + v + '"' + (trackOf(g) === v ? " selected" : "") + ">" + l + "</option>").join("") + "</select>" +
      (trackOf(g) === "min" ? '<input class="num" type="number" min="0.5" step="0.5" data-gf="min" value="' + Math.round((Number(g.min) > 0 ? Number(g.min) : TRACK_MIN) / 6) / 10 + '" aria-label="Hours a week"><span>h</span>' : "") + "</td></tr>").join("") + "</tbody></table></div>" +
    '<div class="wk-row"><span>Each week, remind me when growth is under</span>' + hours("growMin") + "<span>h or over</span>" + hours("growMax") + "<span>h, and relax is under</span>" + hours("relaxMin") + "<span>h or over</span>" + hours("relaxMax") + "<span>h.</span></div>" +
    '<p class="hint">Last week\'s numbers show on Today when one of them is off. Leave a box empty to skip that check.</p></section>';

  const q = store.setting("quarter", null) || {};
  // 每天自己打的分：有哪几列、每列几档是下面这段字（一行一列，js/scores.js 读）；今天页右栏照它画，填的数写进季度表同名的列
  const sc = store.scoreSetup(), cols = sc.defs.map((d) => d.col);
  const scoreState = !sc.text.trim() ? "" : (cols.length ? cols.length + (cols.length === 1 ? " column: " : " columns: ") + cols.join(", ") + "." : "No columns yet.") +
    (sc.bad.length ? " Skipped line " + sc.bad.join(", ") + " — it needs a name of its own, and note is the box under the rows." : "");
  const quarter = '<section class="card"><h3>Quarter sheet</h3>' +
    '<label class="field"><span>Link to the Sheet with your quarter tabs</span><input data-quarter="url" value="' + esc(q.url || "") + '" placeholder="https://docs.google.com/spreadsheets/d/…/edit" autocomplete="off" spellcheck="false"></label>' +
    '<p class="hint">Each day from the day you link it, two cells are filled on the tab named like <b>2026 Q4</b>: <b>progress</b> (hours on projects ticked above × 10) and <b>focus</b> (◆ Deep hours ÷ 10). Earlier days are left alone.</p>' +
    (q.url && l.quarterNote ? '<p class="hint qnote">' + esc(l.quarterNote) + "</p>" : "") +
    '<h4 class="dsc-set">Daily scores</h4>' +
    '<label class="field"><span>One line per column, as it\'s named on the tab</span><textarea data-score-set="text" data-keep="score-set-text" rows="9" spellcheck="false" placeholder="gym · moving · 3–15 · 3 stayed in · 5 usual · 8 walk out">' + esc(sc.text) + "</textarea></label>" +
    '<p class="hint">Pieces split by <b>·</b> or <b>|</b>: the column name · what it means · the usual range · then each choice as a number and a few words. They show on Today from the day you add them; what you pick goes into that column, and the box under them into <b>note</b>. Nothing else on the tab changes.</p>' +
    (scoreState ? '<p class="hint">' + esc(scoreState) + "</p>" : "") +
    (q.url && l.scoreNote ? '<p class="hint qnote">' + esc(l.scoreNote) + "</p>" : "") + "</section>";

  // 这台设备的存储：用了多少、还能撑多久；一年多以前的任务可以搬进表格的 Archive 页
  const use = store.storage(), cut = isoOf(Number(store.today().slice(0, 4)) - 1, 1, 1);
  const room = !isFinite(use.daysLeft) ? "Nothing logged in the last 7 days."
    : "At the pace of the last 7 days (" + use.recent + (use.recent === 1 ? " task" : " tasks") + ") there's room for about " + (use.daysLeft > 730 ? Math.round(use.daysLeft / 365) + " years" : use.daysLeft > 60 ? Math.round(use.daysLeft / 30) + " months" : Math.round(use.daysLeft) + " days") + ".";
  const storage = '<section class="card' + (use.warn ? " warn" : "") + '"><h3>Storage</h3>' +
    '<p class="st-line"><b class="num">' + use.tasks.toLocaleString("en") + "</b> tasks on this device · <b class=\"num\">" + (use.used / 1e6).toFixed(2) + " MB</b> of about " + use.limit / 1e6 + " MB</p>" +
    '<div class="st-meter"><i style="width:' + Math.min(100, (use.used / use.limit) * 100).toFixed(1) + '%"></i></div>' +
    '<p class="hint">' + (use.full ? "<b>This device is full</b> — new changes aren't being saved here. Archive below to make room." : room) + "</p>" +
    '<div class="btns"><button type="button" class="btn" data-act="archive" data-before="' + cut + '"' + (l.url ? "" : " disabled") + ">Archive tasks before " + fmtShort(cut) + ", " + cut.slice(0, 4) + "</button></div>" +
    '<p class="hint">Moves them to an <b>Archive</b> tab in your Sheet (still there to read) and off this device. This year and last year stay; tasks a running plan still counts on stay too.</p></section>';

  if (phone) {
    return '<div class="settings phone-settings"><header class="phead"><div class="l"><a class="nav" href="#today">‹ Today</a></div></header>' +
      '<header class="page-head"><div><h2>Settings</h2></div></header>' + look + sheet + "</div>";
  }
  return '<div class="settings"><header class="page-head"><div><h2>Settings</h2></div></header>' + sheet + time + groups + quarter + read + spendCard + look + storage + backup + "</div>";
}

// 每周那一排：全空 = 每天都用默认值；填了几个就只改那几天
function weeklyFromInputs(root, def) {
  const vals = Array(7).fill(null);
  root.querySelectorAll("[data-week]").forEach((i) => { vals[Number(i.dataset.week)] = i.value.trim() === "" ? null : Math.max(0, Number(i.value) || 0); });
  return vals.every((v) => v === null) ? null : vals.map((v) => (v === null ? def : v));
}

function saveSpendLink(value) {
  const url = String(value || "").trim();
  if (url === (store.setting("spend")?.url || "")) return false;
  if (url && !looksLikeSheet(url)) return false;
  store.setSetting("spend", url ? { url } : null);
  if (url) toast("Spending Sheet linked");
  sync.sync();
  return true;
}

export function initSettings() {
  on(document, "change", ".settings [data-local]", (e, el) => {
    store.setLocal({ [el.dataset.local]: el.value.trim(), ...(el.dataset.local === "url" ? { serverVersion: 0 } : {}) });   // 换了表格：重新问它是哪一版
    if (el.dataset.local === "url" || el.dataset.local === "secret") sync.sync({ full: true });
  });
  on(document, "change", ".settings [data-local-check]", (e, el) => store.setLocal({ [el.dataset.localCheck]: el.checked }));
  // 阅读表格链接：贴进来就存；清空也算（不再连）
  on(document, "input", ".settings [data-reading-url]", (e, el) => { if (looksLikeSheet(el.value)) saveReadingLink(el.value); });
  on(document, "change", ".settings [data-reading-url]", (e, el) => saveReadingLink(el.value));
  // 记账表格链接：一样
  on(document, "input", ".settings [data-spend-url]", (e, el) => { if (looksLikeSheet(el.value)) saveSpendLink(el.value); });
  on(document, "change", ".settings [data-spend-url]", (e, el) => { if (!saveSpendLink(el.value) && el.value.trim() && !looksLikeSheet(el.value)) toast("That doesn't look like a Google Sheets link"); });
  on(document, "change", ".settings [data-cap], .settings [data-week]", (e, el) => {
    const root = el.closest(".settings");
    const def = Math.max(0, Number(root.querySelector('[data-cap="default"]').value) || 0);
    store.setSetting("capacity", { ...store.capacitySettings(), default: def, weekly: weeklyFromInputs(root, def) });
  });
  on(document, "change", ".settings [data-pref]", (e, el) => {
    const v = el.type === "checkbox" ? el.checked : el.value;
    store.setSetting("prefs", { ...store.prefs(), [el.dataset.pref]: v });
  });
  // 大类的三样设置、每周的四个门槛（填的是小时，存成分钟；空着 = 不提醒）
  on(document, "change", ".settings [data-gf]", (e, el) => {
    const f = el.dataset.gf;
    store.saveGroup(el.closest("[data-group]").dataset.group, { [f]: f === "grow" || f === "track" ? el.value : f === "min" ? Math.max(0, Number(el.value) || 0) * 60 : el.checked });
  });
  on(document, "change", ".settings [data-wk]", (e, el) => {
    store.setSetting("weekly", { ...WEEKLY, ...(store.setting("weekly", {}) || {}), [el.dataset.wk]: Math.max(0, Number(el.value) || 0) * 60 });
  });
  // 季度表：贴了链接就存；第一次贴的那天就是「从哪天开始填」（不给改），之前的日子不动
  const saveQuarter = (root) => {
    const url = root.querySelector('[data-quarter="url"]').value.trim();
    const cur = store.setting("quarter", null) || {};
    if ((cur.url || "") === url) return;
    store.setLocal({ quarterSent: {}, quarterNote: "", scoreSent: {}, scoreNote: "" });   // 换了表格：都重新发
    store.setSetting("quarter", url ? { url, from: cur.from || store.today() } : { url: "" });
    if (url) sync.sync();
  };
  on(document, "input", '.settings [data-quarter="url"]', (e, el) => { if (looksLikeSheet(el.value)) saveQuarter(el.closest(".settings")); });
  on(document, "change", ".settings [data-quarter]", (e, el) => saveQuarter(el.closest(".settings")));
  // 打分的那段字：第一次写的那天就是开始日（不给改）；改了就把打过的分全部重发一遍（列名可能刚改对）
  on(document, "change", ".settings [data-score-set]", (e, el) => {
    const text = el.value.replace(/\s+$/, "");
    const cur = store.setting("scores", null) || {};
    const next = { text, from: cur.from || (text.trim() ? store.today() : "") };
    if ((cur.text || "") === next.text && (cur.from || "") === next.from) return;
    store.setLocal({ scoreSent: {}, scoreNote: "" });
    store.setSetting("scores", next);
    if (store.setting("quarter", null)?.url) sync.sync();
  });

  on(document, "click", ".settings [data-act]", (e, el) => {
    const act = el.dataset.act;
    if (act === "archive") {
      const before = el.dataset.before;
      if (!confirm("Move every task before " + before + " to the Archive tab of your Sheet? They leave this app; the Sheet keeps them.")) return;
      sync.sync({ archive: { before } }).then((ok) => {
        const n = store.local().archived;
        toast(ok ? (n ? "Archived " + n + (n === 1 ? " task" : " tasks") : "Nothing that old to archive") : "Couldn't reach the Sheet — nothing was moved");
      });
      return;
    }
    if (act === "full") { spend.forceFull(); sync.sync({ full: true }); }   // 记账表格也整份重拉
    else if (act === "export") {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(store.exportData(), null, 2)], { type: "application/json" }));
      a.download = "kuzhouduan-backup-" + store.today() + ".json";
      a.click();
    }
  });
}
