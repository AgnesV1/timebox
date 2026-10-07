// 设置：连表格、每天能用多少时间、新的一天从几点开始、外观、导出备份（手机上只有外观和连表格）

import * as store from "../store.js";
import * as sync from "../sync.js";
import { esc, on, icon } from "../dom.js";
import { WEEKDAYS } from "../dates.js";

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

  const look = '<section class="card"><h3>Look</h3><div class="seg">' +
    [["auto", "Auto"], ["light", "Day"], ["dark", "Night"]].map(([v, t]) => '<button type="button" data-act="theme" data-v="' + v + '"' + (l.theme === v ? ' class="on"' : "") + ">" + t + "</button>").join("") + "</div>" +
    '<p class="hint look-hint">Auto follows your phone or computer.</p>' +
    '<label class="check"><input type="checkbox" data-local-check="fx"' + (l.fx !== false ? " checked" : "") + "> Sparkles and confetti</label></section>";

  const read = '<section class="card"><h3>Reading</h3>' +
    '<label class="field"><span>Link to your reading Sheet (the tab you keep the list in)</span><input data-reading-url value="' + esc(store.setting("reading")?.url || "") + '" placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=…" autocomplete="off" spellcheck="false"></label>' +
    '<p class="hint">New entries from the Reading page are added at the bottom of that tab. Columns are found by their header (Title, Type, Vibe, Note); Vibe and Note are added if missing.</p></section>';

  const backup = '<section class="card"><h3>Backup</h3><p class="hint">Everything is in your Sheet already. This saves a copy of this device\'s data as a file.</p>' +
    '<button type="button" class="btn" data-act="export">Export JSON</button></section>';

  if (phone) {
    return '<div class="settings phone-settings"><header class="phead"><div class="l"><a class="nav" href="#today">‹ Today</a></div></header>' +
      '<header class="page-head"><div><p class="eyebrow">Settings</p><h2>苦昼短</h2></div></header>' + look + sheet + "</div>";
  }
  return '<div class="settings"><header class="page-head"><div><p class="eyebrow">Settings</p><h2>苦昼短</h2></div></header>' + sheet + time + read + look + backup + "</div>";
}

// 每周那一排：全空 = 每天都用默认值；填了几个就只改那几天
function weeklyFromInputs(root, def) {
  const vals = Array(7).fill(null);
  root.querySelectorAll("[data-week]").forEach((i) => { vals[Number(i.dataset.week)] = i.value.trim() === "" ? null : Math.max(0, Number(i.value) || 0); });
  return vals.every((v) => v === null) ? null : vals.map((v) => (v === null ? def : v));
}

export function initSettings(applyTheme) {
  on(document, "change", ".settings [data-local]", (e, el) => {
    store.setLocal({ [el.dataset.local]: el.value.trim(), ...(el.dataset.local === "url" ? { serverVersion: 0 } : {}) });   // 换了表格：重新问它是哪一版
    if (el.dataset.local === "url" || el.dataset.local === "secret") sync.sync({ full: true });
  });
  on(document, "change", ".settings [data-local-check]", (e, el) => store.setLocal({ [el.dataset.localCheck]: el.checked }));
  on(document, "change", ".settings [data-reading-url]", (e, el) => {
    store.setSetting("reading", { url: el.value.trim() });
    sync.sync();
  });
  on(document, "change", ".settings [data-cap], .settings [data-week]", (e, el) => {
    const root = el.closest(".settings");
    const def = Math.max(0, Number(root.querySelector('[data-cap="default"]').value) || 0);
    store.setSetting("capacity", { ...store.capacitySettings(), default: def, weekly: weeklyFromInputs(root, def) });
  });
  on(document, "change", ".settings [data-pref]", (e, el) => {
    const v = el.type === "checkbox" ? el.checked : el.value;
    store.setSetting("prefs", { ...store.prefs(), [el.dataset.pref]: v });
  });
  on(document, "click", ".settings [data-act]", (e, el) => {
    const act = el.dataset.act;
    if (act === "theme") { store.setLocal({ theme: el.dataset.v }); applyTheme(); }
    else if (act === "full") sync.sync({ full: true });
    else if (act === "export") {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(store.exportData(), null, 2)], { type: "application/json" }));
      a.download = "kuzhouduan-backup-" + store.today() + ".json";
      a.click();
    }
  });
}
