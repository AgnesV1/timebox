// 苦昼短 · Google Sheet 后端。粘贴到表格的 扩展程序 → Apps Script。
// 把下面第 4 行的 CHANGE_ME 改成你自己的口令（只在 Apps Script 编辑器里改，别改仓库里的文件），
// 然后运行 setup，再「部署 → 管理部署 → 编辑 → 新版本」。
var SECRET = 'CHANGE_ME';

// 每张表：页名、主键、[字段, 表头, 类型, 标记]。列按表头文字找，可以挪位置、中间插自己的列。
// 类型 text / num / date / bool / json / status / pstatus / clock（钟点 09:10，存成文字）。
// 标记 calc = 脚本自己算，App 不写；hide = setup 时把这列藏起来（右键可取消隐藏）。
var VERSION = 3;   // 页面和脚本对版本：页面不是这个版本就不收它的数据，免得新旧格式混在一起
var T = {
  // 计时记录在 Times 一格里：「09:10-09:40 30m; 20m」
  tasks: { sheet: 'Tasks', key: 'id', main: 'title', cols: [
    ['date', 'Date', 'date'], ['title', 'Task', 'text'], ['est', 'Est min', 'num'], ['actual', 'Actual min', 'num'],
    ['status', 'Status', 'status'], ['reason', 'Reason', 'text'], ['project', 'Project', 'text', 'calc'],
    ['optional', 'Optional', 'bool'], ['times', 'Times', 'text'], ['order', 'Order', 'num', 'hide'],
    ['id', 'ID', 'text', 'hide'], ['projectId', 'Project ID', 'text', 'hide'], ['itemId', 'Item ID', 'text', 'hide'],
    ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide'],
    ['desc', 'Description', 'text']] },                               // Description 永远最后一列
  // 一行 = 一个计划。Kind：Total（总时长 + 截止日）/ Regular（规律）；Place：Auto（自动排到每天）/ Pool（进任务池）
  projects: { sheet: 'Projects', key: 'id', main: 'name', cols: [
    ['name', 'Project', 'text'], ['group', 'Group', 'text'], ['kind', 'Kind', 'kind'], ['place', 'Place', 'place'],
    ['status', 'Status', 'pstatus'], ['deadline', 'Deadline', 'date'], ['start', 'Start', 'date'], ['early', 'Finish early', 'num'],
    ['rule', 'Rule', 'json', 'hide'], ['color', 'Color', 'text', 'hide'], ['order', 'Order', 'num', 'hide'],
    ['calib', 'Calibration', 'json', 'hide'], ['id', 'ID', 'text', 'hide'],
    ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide']] },
  items: { sheet: 'Items', key: 'id', main: 'title', cols: [
    ['title', 'Item', 'text'], ['project', 'Project', 'text', 'calc'], ['module', 'Module', 'text'], ['est', 'Est min', 'num'],
    ['origEst', 'Original est', 'num', 'hide'], ['order', 'Order', 'num', 'hide'], ['id', 'ID', 'text', 'hide'],
    ['projectId', 'Project ID', 'text', 'hide'], ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide']] },
  log: { sheet: 'Log', key: 'date', cols: [
    ['date', 'Date', 'date'], ['need', 'Line min', 'num'], ['projects', 'Shares', 'json'],
    ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide']] },
  // capacity（含每天单独改的 overrides）/ prefs / timer / reading 都是 JSON
  settings: { sheet: 'Settings', key: 'key', cols: [
    ['key', 'Key', 'text'], ['value', 'Value', 'json'], ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide']] }
};
// 不再用的列：setup 最后删掉
var DROP = { tasks: ['审核', 'Review', 'Category', 'Done order'], projects: ['Planned min', 'Spent min', 'Progress'] };
// 平时不用看的页：藏起来（右键页签 → 显示）
var HIDE = ['Log', 'Settings', 'Deleted', 'Notes'];
var KEEP_DELETED_DAYS = 90;
var DELETED = 'Deleted';
var DELETED_HEADER = ['Table', 'ID', 'Deleted at', 'Synced'];
var STATUS_OUT = { done: 'Done', partial: 'Partial', later: 'Later', drop: 'Drop' };
var PSTATUS_OUT = { active: 'Active', done: 'Done', dropped: 'Dropped' };
// 老表里出现过的写法都认
var WORDS = { done: 'done', ok: 'done', '完成': 'done', partial: 'partial', '部分': 'partial',
  later: 'later', deferred: 'later', '顺延': 'later', drop: 'drop', dropped: 'drop', '放弃': 'drop' };
var RENAME = {
  '日期': 'Date', '任务内容': 'Task', '预计完成时间（分钟）': 'Est min', '实际时长（分钟）': 'Actual min',
  '拟定顺序': 'Order', '分类': 'Category', '是否完成': 'Status', '实际次序（自动）': 'Done order',
  '任务描述': 'Description', '可用时长（分钟）': 'Available min'
};
var COLORS = ['#C6FF00', '#2F5BFF', '#FF3EA5', '#FF7A1A', '#9B5CFF', '#00C2A8', '#FFC400', '#FF4D4D'];

// ================= 第一次用，以及每次更新代码后：选 setup 点「运行」 =================
// 老表（Tasks 里还没有 ID 列）会先整页备份成「Backup …」，再原地升级：补列、补 ID、
// 状态统一成一个词、按任务名把每日任务挂到同名 Project 上、每个 Project 建一个同名条目。
// 之后的精简（都可以重复跑）：Time 页并进 Tasks 的 Times 列、Day capacity 并进 Settings、
// 用不着的列删掉、Groups 页删掉；搬完的旧页改名「Old …」藏起来，确认没问题后可以自己右键删。
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  rename_(ss, '任务', 'Tasks');
  rename_(ss, '每日时长', 'Day capacity');
  var old = isOld_(ss);
  if (old) backup_(ss);
  Object.keys(T).forEach(ensure_);
  deletedSheet_();
  validate_();
  Object.keys(T).forEach(function (name) { readAll_(name, true); });   // 没有 ID 的行补上
  if (old) migrate_();
  timeIntoTasks_(ss);
  capacityIntoSettings_(ss);
  routinesIntoProjects_();
  fillDefaults_();
  dropColumns_();
  dropGroups_(ss);
  pruneDeleted_();
  recount_();
  hideSheets_(ss);
  Logger.log(old ? 'Migrated the old sheet. Backups: ' + backupNames_(ss).join(', ') : 'Setup done.');
}

function rename_(ss, from, to) {
  var sh = ss.getSheetByName(from);
  if (sh && !ss.getSheetByName(to)) sh.setName(to);
}

function isOld_(ss) {
  var sh = ss.getSheetByName('Tasks');
  return Boolean(sh) && sh.getLastRow() > 0 && head_(sh).indexOf('ID') < 0;
}

function backupNames_(ss) {
  return ss.getSheets().map(function (s) { return s.getName(); }).filter(function (n) { return n.indexOf('Backup ') === 0; });
}

function backup_(ss) {
  var stamp = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  ['Tasks', 'Projects', 'Day capacity'].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    var to = 'Backup ' + name + ' ' + stamp;
    if (sh && !ss.getSheetByName(to)) sh.copyTo(ss).setName(to);
  });
}

function tz_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
}

function head_(sh) {
  if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) return [];
  var names = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  while (names.length && names[names.length - 1] === '') names.pop();
  return names;
}

function sheetOf_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(T[name].sheet);
  if (!sh) {
    sh = ss.insertSheet(T[name].sheet);
    sh.getRange(1, 1, 1, T[name].cols.length).setValues([T[name].cols.map(function (c) { return c[1]; })]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// 建页、改中文表头、补缺的列（Tasks 补在 Description 前面）、格式、隐藏辅助列
function ensure_(name) {
  var t = T[name], sh = sheetOf_(name);
  var names = head_(sh);
  names.forEach(function (h, i) {
    if (RENAME[h]) { sh.getRange(1, i + 1).setValue(RENAME[h]); names[i] = RENAME[h]; }
  });
  if (name === 'tasks') {
    ['审核', 'Review'].forEach(function (h) {
      var i = names.indexOf(h);
      if (i >= 0) { sh.deleteColumn(i + 1); names.splice(i, 1); }
    });
  }
  t.cols.forEach(function (c) {
    if (names.indexOf(c[1]) >= 0) return;
    var d = names.indexOf('Description');
    if (name === 'tasks' && d >= 0) {
      sh.insertColumnBefore(d + 1);
      sh.getRange(1, d + 1).setValue(c[1]);
      names.splice(d, 0, c[1]);
    } else {
      if (sh.getMaxColumns() < names.length + 1) sh.insertColumnAfter(sh.getMaxColumns());
      sh.getRange(1, names.length + 1).setValue(c[1]);
      names.push(c[1]);
    }
  });
  if (name === 'tasks') {
    var d = names.indexOf('Description');
    if (d >= 0 && d < names.length - 1) {
      sh.moveColumns(sh.getRange(1, d + 1, sh.getMaxRows(), 1), names.length + 1);
      names.splice(d, 1);
      names.push('Description');
    }
  }
  sh.setFrozenRows(1);
  var rows = Math.max(sh.getMaxRows() - 1, 1);
  t.cols.forEach(function (c) {
    var i = names.indexOf(c[1]) + 1;
    if (!i) return;
    var range = sh.getRange(2, i, rows, 1);
    if (c[2] === 'date') range.setNumberFormat('yyyy-mm-dd');
    else if (c[2] === 'text' || c[2] === 'json' || c[2] === 'clock') range.setNumberFormat('@');   // 纯文本，「- 第一步」不会被当成公式
    if (String(c[3] || '').indexOf('hide') >= 0) sh.hideColumns(i);
  });
}

function deletedSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(DELETED);
  if (!sh) {
    sh = ss.insertSheet(DELETED);
    sh.getRange(1, 1, 1, DELETED_HEADER.length).setValues([DELETED_HEADER]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// 一列一次写回（只写这一列，别的格子不碰，免得「=…」这种文字被重新当成公式）
function setCol_(sh, c, values) {
  if (values.length) sh.getRange(2, c + 1, values.length, 1).setValues(values.map(function (v) { return [v]; }));
}

function body_(sh, names) {
  var last = sh.getLastRow();
  return last > 1 && names.length ? sh.getRange(2, 1, last - 1, names.length).getValues() : [];
}

function retire_(ss, sh) {
  var to = 'Old ' + sh.getName(), n = 2;
  while (ss.getSheetByName(to)) to = 'Old ' + sh.getName() + ' ' + n++;
  sh.setName(to);
}

// 计时记录：「09:10-09:40 30m; 20m」（和页面 js/times.js 同一个写法）
function timesText_(list) {
  return list.map(function (x) { return (x.from && x.to ? x.from + '-' + x.to + ' ' : '') + Math.round(x.min) + 'm'; }).join('; ');
}

// Time 页（一段一行）并进 Tasks 的 Times 列，Actual = 加起来。任务的 Updated 不动，设备上更晚的改动照样算数
function timeIntoTasks_(ss) {
  var sh = ss.getSheetByName('Time');
  if (!sh) return;
  var names = head_(sh), tz = tz_(), segs = {};
  var at = function (h) { return names.indexOf(h); };
  body_(sh, names).forEach(function (r) {
    var tid = String(r[at('Task ID')] || '').trim(), min = Number(r[at('Min')]) || 0;
    if (!tid || min <= 0) return;
    (segs[tid] = segs[tid] || []).push({ from: fromCell_('clock', r[at('From')], tz), to: fromCell_('clock', r[at('To')], tz), min: min });
  });
  var tsh = sheetOf_('tasks'), tn = head_(tsh), col = cols_(T.tasks, tn), data = body_(tsh, tn), now = Date.now();
  var times = [], actual = [], synced = [];
  data.forEach(function (row) {
    var list = segs[String(row[col.id] || '').trim()];
    var fill = list && String(row[col.times] || '').trim() === '';
    if (fill) list.sort(function (a, b) { return (a.from || '~') < (b.from || '~') ? -1 : (a.from || '~') > (b.from || '~') ? 1 : 0; });
    times.push(fill ? timesText_(list) : row[col.times]);
    actual.push(fill ? list.reduce(function (a, x) { return a + x.min; }, 0) : row[col.actual]);
    synced.push(fill ? now : row[col.synced]);
  });
  setCol_(tsh, col.times, times);
  setCol_(tsh, col.actual, actual);
  setCol_(tsh, col.synced, synced);
  retire_(ss, sh);
}

// Day capacity 页（某天单独改的可用时间）并进 Settings 的 capacity.overrides
function capacityIntoSettings_(ss) {
  var sh = ss.getSheetByName('Day capacity');
  if (!sh) return;
  var names = head_(sh), tz = tz_(), overrides = {}, latest = 1;
  body_(sh, names).forEach(function (r) {
    var d = day_(r[names.indexOf('Date')], tz), v = r[names.indexOf('Available min')];
    if (!d || v === '' || v === null || isNaN(Number(v))) return;
    overrides[d] = Number(v);
    latest = Math.max(latest, Number(r[names.indexOf('Updated')]) || 0);
  });
  var cur = readAll_('settings').filter(function (r) { return r.id === 'capacity'; })[0];
  var value = (cur && cur.value) || { default: 420, weekly: null };
  var merged = {};
  Object.keys(overrides).forEach(function (d) { merged[d] = overrides[d]; });
  Object.keys(value.overrides || {}).forEach(function (d) { merged[d] = value.overrides[d]; });
  value.overrides = merged;
  upsert_('settings', [{ key: 'capacity', value: value, updated: Math.max(latest, (cur && Number(cur.updated)) || 0) }], Date.now());
  retire_(ss, sh);
}

// 以前的重复规则（Settings 的 routines）→ Projects 里的规律计划（Regular + Auto），计划 ID = 规则 ID。
// 以后的、没动过的那几次删掉（页面只画预览，到那天才生成）；留下的挂到计划上。和页面 store.js 的 upgrade 做的一样
function routinesIntoProjects_() {
  var row = readAll_('settings').filter(function (r) { return r.id === 'routines'; })[0];
  if (!row) return;
  var rules = Array.isArray(row.value) ? row.value : [], now = Date.now();
  var today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  var projects = readAll_('projects'), byId = {}, order = 0;
  projects.forEach(function (p) { byId[p.id] = p; order = Math.max(order, Number(p.order) || 0); });
  var rows = [];
  rules.forEach(function (r, k) {
    if (!r || !r.id || byId[r.id]) return;
    var host = byId[r.projectId];
    rows.push({ id: r.id, name: r.title || 'Routine', group: host ? host.group || host.name || '' : '', kind: 'regular', place: 'auto',
      status: r.end && r.end < today ? 'done' : 'active', early: 0,
      rule: { days: r.days || [0, 0, 0, 0, 0, 0, 0], start: r.start || '', end: r.end || '', skip: r.skip || [], optional: Boolean(r.optional) },
      color: (host && host.color) || COLORS[k % COLORS.length], order: ++order, updated: 1 });
    byId[r.id] = rows[rows.length - 1];
  });
  upsert_('projects', rows, now);
  var gone = [], link = [];
  readAll_('tasks').forEach(function (t) {
    var m = /^rt:(.+):(\d{4}-\d{2}-\d{2})$/.exec(t.id);
    if (!m || !byId[m[1]]) return;
    if (t.date > today && !t.status && !t.times && !(Number(t.actual) > 0)) gone.push({ table: 'tasks', id: t.id, at: Number(t.updated) || 1 });
    else if (t.projectId !== m[1]) link.push({ id: t.id, projectId: m[1], updated: Number(t.updated) || 1 });
  });
  upsert_('tasks', link, now);
  remove_(gone.concat([{ table: 'settings', id: 'routines', at: Number(row.updated) || 1 }]), now);
}

// 空着的 Kind / Place 填上默认（Total / Pool），表格里看得明白
function fillDefaults_() {
  writeCol_('projects', 'kind', function (r) { return r.kind; });
  writeCol_('projects', 'place', function (r) { return r.place; });
}

function dropColumns_() {
  Object.keys(DROP).forEach(function (name) {
    var sh = sheetOf_(name), names = head_(sh);
    for (var i = names.length - 1; i >= 0; i--) if (DROP[name].indexOf(names[i]) >= 0) sh.deleteColumn(i + 1);
  });
}

// Groups 页只是以前 Group 下拉的清单，现在项目名在网页里选
function dropGroups_(ss) {
  var sh = ss.getSheetByName('Groups');
  if (sh) ss.deleteSheet(sh);
}

// 删除记录只留最近 90 天（按记下来的时间 Synced 算；太久没打开的设备，在设置里点 Reload everything 就好）
function pruneDeleted_() {
  var sh = deletedSheet_(), data = body_(sh, DELETED_HEADER);
  var cut = Date.now() - KEEP_DELETED_DAYS * 864e5;
  var keep = data.filter(function (r) { return Number(r[3]) >= cut; });
  if (keep.length === data.length) return;
  var blank = DELETED_HEADER.map(function () { return ''; });
  sh.getRange(2, 1, data.length, DELETED_HEADER.length).setValues(keep.concat(data.slice(keep.length).map(function () { return blank; })));
}

function hideSheets_(ss) {
  ss.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (HIDE.indexOf(n) >= 0 || n.indexOf('Backup ') === 0 || n.indexOf('Old ') === 0) {
      try { sh.hideSheet(); } catch (e) { /* 正开着的那页藏不了，没关系 */ }
    }
  });
}

function validate_() {
  var list = function (values) { return SpreadsheetApp.newDataValidation().requireValueInList(values, true).build(); };
  var col = function (name, header) {
    var sh = sheetOf_(name), i = head_(sh).indexOf(header) + 1;
    return i ? sh.getRange(2, i, Math.max(sh.getMaxRows() - 1, 1), 1) : null;
  };
  var r;
  if ((r = col('tasks', 'Status'))) r.setDataValidation(list(['Done', 'Partial', 'Later', 'Drop']));
  if ((r = col('projects', 'Status'))) r.setDataValidation(list(['Active', 'Done', 'Dropped']));
  if ((r = col('projects', 'Kind'))) r.setDataValidation(list(['Total', 'Regular']));
  if ((r = col('projects', 'Place'))) r.setDataValidation(list(['Auto', 'Pool']));
  if ((r = col('projects', 'Group'))) r.clearDataValidations();   // 以前读 Groups 页的下拉，Groups 页不要了
}

// ================= 读、写 =================

function day_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  return String(v === null || v === undefined ? '' : v).trim();
}

function statusIn_(v) {
  var s = String(v || '').trim();
  if (!s) return '';
  return WORDS[s.split(/\s*[｜|]\s*/)[0].toLowerCase()] || 'partial';
}

function pstatusIn_(v) {
  var s = String(v || '').trim().toLowerCase();
  return s === 'done' ? 'done' : s === 'dropped' || s === 'drop' ? 'dropped' : 'active';
}

function fromCell_(type, v, tz) {
  if (type === 'date') return v === '' || v === null ? '' : day_(v, tz);
  if (type === 'num') { if (v === '' || v === null) return null; var n = Number(v); return isNaN(n) ? null : n; }
  if (type === 'bool') return v === true || /^(true|yes|y|1|✓|x)$/i.test(String(v).trim());
  if (type === 'json') { if (v === '' || v === null) return null; try { return JSON.parse(v); } catch (e) { return null; } }
  if (type === 'status') return statusIn_(v);
  if (type === 'pstatus') return pstatusIn_(v);
  if (type === 'kind') return /^reg/i.test(String(v || '').trim()) ? 'regular' : 'total';
  if (type === 'place') return /^auto/i.test(String(v || '').trim()) ? 'auto' : 'pool';
  if (type === 'clock' && Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz, 'HH:mm');
  return v === null || v === undefined ? '' : String(v);
}

function toCell_(type, v) {
  if ((v === null || v === undefined) && type !== 'kind' && type !== 'place') return '';
  if (type === 'bool') return v ? true : '';
  if (type === 'json') return v === '' ? '' : JSON.stringify(v);
  if (type === 'status') return STATUS_OUT[v] || '';
  if (type === 'pstatus') return PSTATUS_OUT[v] || 'Active';
  if (type === 'kind') return v === 'regular' ? 'Regular' : 'Total';
  if (type === 'place') return v === 'auto' ? 'Auto' : 'Pool';
  if (type === 'num') { var n = Number(v); return v === '' || isNaN(n) ? '' : n; }
  var s = String(v);
  return s.charAt(0) === '=' ? "'" + s : s;   // 以 = 开头的文字别变成公式
}

function cols_(t, names) {
  var col = {};
  t.cols.forEach(function (c) { col[c[0]] = names.indexOf(c[1]); });
  return col;
}

function keyOf_(t, row, col, tz) {
  var i = col[t.key];
  if (i < 0) return '';
  return t.key === 'date' ? day_(row[i], tz) : String(row[i] === null ? '' : row[i]).trim();
}

// 整张表读成对象数组。fix=true 时顺手给没有 ID 的行（手动加的、老数据）补上 ID 和时间
function readAll_(name, fix) {
  var t = T[name], sh = sheetOf_(name), tz = tz_();
  var last = sh.getLastRow();
  var names = head_(sh);
  if (last < 2 || !names.length) return [];
  var data = sh.getRange(1, 1, last, names.length).getValues();
  var col = cols_(t, names), out = [], fixes = [], now = Date.now();
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var key = keyOf_(t, row, col, tz);
    if (!key) {
      if (!fix || !t.main || col[t.main] < 0 || String(row[col[t.main]]).trim() === '' || col.id < 0) continue;
      key = Utilities.getUuid();
      row[col.id] = key;
      fixes.push(r);
    } else if (fix && col.synced >= 0 && row[col.synced] === '') fixes.push(r);
    if (fixes[fixes.length - 1] === r) {
      if (col.updated >= 0 && row[col.updated] === '') row[col.updated] = now;
      if (col.synced >= 0) row[col.synced] = now;
    }
    var o = {};
    t.cols.forEach(function (c) { if (col[c[0]] >= 0) o[c[0]] = fromCell_(c[2], row[col[c[0]]], tz); });
    o.id = key;
    out.push(o);
  }
  fixes.forEach(function (r) { sh.getRange(r + 1, 1, 1, names.length).setValues([data[r]]); });
  return out;
}

// 按主键写入：表里那行更新得更晚就不覆盖（Log 例外：两边的份额合并）；
// 删过的行，除非这次的改动比删除还晚（比如撤销），不再写回来——自动生成的任务删了不会「复活」
function upsert_(name, rows, now, dead) {
  if (!rows || !rows.length) return 0;
  var t = T[name], sh = sheetOf_(name), tz = tz_();
  var names = head_(sh), col = cols_(t, names), width = names.length;
  var last = sh.getLastRow();
  var data = last > 1 ? sh.getRange(2, 1, last - 1, width).getValues() : [];
  var at = {};
  data.forEach(function (row, i) { var k = keyOf_(t, row, col, tz); if (k) at[k] = i; });
  var appended = [], changed = 0;
  rows.forEach(function (r) {
    var key = String(r[t.key] || r.id || '').trim();
    if (!key) return;
    if (dead && (dead[name + ':' + key] || 0) >= (Number(r.updated) || 0)) return;
    var i = at[key], row;
    var pending = i !== undefined && i >= data.length;   // 这一批里刚新增的
    if (i !== undefined) {
      row = (pending ? appended[i - data.length] : data[i]).slice();
      if (name === 'log') r = mergeLog_(fromCell_('json', row[col.projects], tz), r);
      else if (name === 'settings' && key === 'capacity') r = mergeCapacity_(fromCell_('json', row[col.value], tz), Number(row[col.updated]) || 0, r);
      else if ((Number(row[col.updated]) || 0) > (Number(r.updated) || 0)) return;
    } else {
      row = names.map(function () { return ''; });
    }
    var fresh = i === undefined;
    t.cols.forEach(function (c) {
      if (col[c[0]] < 0 || String(c[3] || '').indexOf('calc') >= 0) return;
      if (r[c[0]] === undefined && !(fresh && (c[2] === 'kind' || c[2] === 'place'))) return;   // 新行的 Kind / Place 填上默认
      row[col[c[0]]] = toCell_(c[2], r[c[0]]);
    });
    if (col[t.key] >= 0) row[col[t.key]] = key;
    if (col.synced >= 0) row[col.synced] = now;
    if (pending) appended[i - data.length] = row;
    else if (i !== undefined) { sh.getRange(i + 2, 1, 1, width).setValues([row]); data[i] = row; }
    else { at[key] = data.length + appended.length; appended.push(row); }
    changed++;
  });
  if (appended.length) {
    var start = sh.getLastRow() + 1;
    var need = start + appended.length - 1 - sh.getMaxRows();
    if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
    sh.getRange(start, 1, appended.length, width).setValues(appended);
  }
  return changed;
}

// 今日安全线的快照：先到的份额留着，只补没有的项目，免得手机和电脑互相改掉早上的线
function mergeLog_(existing, r) {
  var shares = {};
  var a = existing || {}, b = r.projects || {};
  Object.keys(b).forEach(function (k) { shares[k] = b[k]; });
  Object.keys(a).forEach(function (k) { shares[k] = a[k]; });
  var need = Object.keys(shares).reduce(function (s, k) { return s + (Number(shares[k]) || 0); }, 0);
  return { date: r.date, need: need, projects: shares, updated: r.updated };
}

// 每张表每个 ID 最后一次删除的时间
function deadMap_() {
  var out = {};
  body_(deletedSheet_(), DELETED_HEADER).forEach(function (r) {
    var k = String(r[0]) + ':' + String(r[1]);
    out[k] = Math.max(out[k] || 0, Number(r[2]) || 0);
  });
  return out;
}

// 每天的可用时间：两边各改了不同的日子，都留下（同一天以后改的为准；清空的那天记成 null）
function mergeCapacity_(cur, curAt, r) {
  var inc = r.value || {}, newer = (Number(r.updated) || 0) >= curAt;
  var a = newer ? cur || {} : inc, b = newer ? inc : cur || {};
  var v = {}, ov = {};
  Object.keys(b).forEach(function (k) { v[k] = b[k]; });
  [a.overrides || {}, b.overrides || {}].forEach(function (o) { Object.keys(o).forEach(function (d) { ov[d] = o[d]; }); });
  v.overrides = ov;
  return { key: r.key, value: v, updated: Math.max(Number(r.updated) || 0, curAt) };
}

function remove_(dels, now) {
  if (!dels || !dels.length) return 0;
  var tz = tz_(), log = [], n = 0;
  var byTable = {};
  dels.forEach(function (d) { if (T[d.table] && d.id) (byTable[d.table] = byTable[d.table] || []).push(d); });
  Object.keys(byTable).forEach(function (name) {
    var t = T[name], sh = sheetOf_(name), names = head_(sh), col = cols_(t, names);
    var last = sh.getLastRow();
    var data = last > 1 ? sh.getRange(2, 1, last - 1, names.length).getValues() : [];
    var rows = [];
    byTable[name].forEach(function (d) {
      for (var i = 0; i < data.length; i++) {
        if (keyOf_(t, data[i], col, tz) === String(d.id) && (Number(data[i][col.updated]) || 0) <= (Number(d.at) || now)) rows.push(i + 2);
      }
      log.push([name, String(d.id), Number(d.at) || now, now]);
    });
    rows.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); n++; });
  });
  if (log.length) {
    var sh = deletedSheet_();
    sh.getRange(sh.getLastRow() + 1, 1, log.length, 4).setValues(log);
  }
  return n;
}

function pull_(since) {
  var out = { tables: {}, deleted: [] };
  Object.keys(T).forEach(function (name) {
    out.tables[name] = readAll_(name, true).filter(function (r) { return !since || (Number(r.synced) || 0) >= since; });
  });
  var sh = deletedSheet_();
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
      if (!since || Number(r[3]) >= since) out.deleted.push({ table: String(r[0]), id: String(r[1]), at: Number(r[2]) });
    });
  }
  return out;
}

// ================= 名字列：Tasks / Items 里显示属于哪个计划 =================

function plan_(t) {
  if (t.status === 'done') return Number(t.est) || 0;
  return t.status === 'partial' ? Math.min(Number(t.actual) || 0, Number(t.est) || 0) : 0;
}

function recount_() {
  var name = {};
  readAll_('projects').forEach(function (p) { name[p.id] = p.name; });
  writeCol_('tasks', 'project', function (r) { return name[r.projectId] || ''; });
  writeCol_('items', 'project', function (r) { return name[r.projectId] || ''; });
  return { ok: true, projects: Object.keys(name).length };
}

// 整列一次写回（只写有 ID 的行，别的行原样留着）
function writeCol_(name, field, f) {
  var t = T[name], sh = sheetOf_(name), names = head_(sh), col = cols_(t, names);
  var c = col[field], last = sh.getLastRow();
  if (c < 0 || last < 2) return;
  var data = sh.getRange(2, 1, last - 1, names.length).getValues(), tz = tz_();
  var type = t.cols.filter(function (x) { return x[0] === field; })[0][2];
  var values = data.map(function (row) {
    var key = keyOf_(t, row, col, tz);
    if (!key) return [row[c]];
    var o = { id: key };
    t.cols.forEach(function (x) { if (col[x[0]] >= 0) o[x[0]] = fromCell_(x[2], row[col[x[0]]], tz); });
    return [toCell_(type, f(o))];
  });
  sh.getRange(2, c + 1, values.length, 1).setValues(values);
}

// 在编辑器里选 recount 点运行：立刻把名字列重填一次
function recount() {
  var r = recount_();
  Logger.log(JSON.stringify(r));
  return r;
}

// ================= 老表升级（setup 发现 Tasks 没有 ID 列时自动跑一次） =================

function key_(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function migrate_() {
  var tz = tz_(), now = Date.now();
  var projects = readAll_('projects');
  var tasks = readAll_('tasks');
  var planned = {};   // 升级前手填的 Planned min（这一列最后会删掉，先读出来）
  var psh = sheetOf_('projects'), pn = head_(psh), pc = pn.indexOf('Planned min'), pid = pn.indexOf('ID');
  if (pc >= 0 && pid >= 0) body_(psh, pn).forEach(function (r) { planned[String(r[pid])] = Number(r[pc]) || 0; });
  var byName = {};
  projects.forEach(function (p, k) { if (p.name) byName[key_(p.name)] = p; });

  // 每个 Project 建一个同名条目：预计 = 原来的 Planned min；没填的话按已经做了的算
  var planOf = {};
  tasks.forEach(function (t) {
    var p = byName[key_(t.title)];
    if (p) planOf[p.id] = (planOf[p.id] || 0) + plan_(t);
  });
  var pRows = [], iRows = [], itemOf = {};
  projects.forEach(function (p, k) {
    var est = planned[p.id] > 0 ? planned[p.id] : planOf[p.id] || 0;
    if (est > 0) {
      var id = Utilities.getUuid();
      itemOf[p.id] = id;
      iRows.push({ id: id, title: p.name, module: '', est: est, projectId: p.id, order: 1, updated: now });
    }
    pRows.push({ id: p.id, status: p.status || 'active', color: p.color || COLORS[k % COLORS.length], order: k + 1, early: p.early === null ? 0 : p.early, updated: now });
  });
  upsert_('items', iRows, now);
  upsert_('projects', pRows, now);

  // 每日任务：状态统一成一个词、拆出写在状态里的理由、按任务名挂到项目上、当天最大的 Order = 可选
  var tSheet = sheetOf_('tasks'), names = head_(tSheet), col = cols_(T.tasks, names);
  var raw = tSheet.getLastRow() > 1 ? tSheet.getRange(2, 1, tSheet.getLastRow() - 1, names.length).getValues() : [];
  var orders = {};
  raw.forEach(function (row) {
    var d = day_(row[col.date], tz), o = Number(row[col.order]);
    if (d && o > 0) (orders[d] = orders[d] || []).push(o);
  });
  var tRows = [];
  raw.forEach(function (row) {
    var id = String(row[col.id] || '').trim();
    if (!id) return;
    var r = { id: id, updated: now };
    var s = String(row[col.status] || '').trim();
    if (s) {
      var bits = s.split(/\s*[｜|]\s*/);
      r.status = statusIn_(s);
      var why = WORDS[bits[0].toLowerCase()] ? bits.slice(1).join('｜') : s;
      if (why && String(row[col.reason] || '').trim() === '') r.reason = why;
    }
    var d = day_(row[col.date], tz), list = orders[d] || [];
    var distinct = list.filter(function (v, i) { return list.indexOf(v) === i; });
    if (distinct.length > 1 && Number(row[col.order]) === Math.max.apply(null, distinct)) r.optional = true;
    var p = byName[key_(row[col.title])];
    if (p) { r.projectId = p.id; if (itemOf[p.id]) r.itemId = itemOf[p.id]; }
    tRows.push(r);
  });
  upsert_('tasks', tRows, now);
}

// ================= 网页接口 =================
// App 只发 POST：{ secret, version, push: { rows: { tasks: [...] }, deletes: [{table, id, at}] }, pull: true, since }
// 返回 { ok, now, pull: { tables, deleted } }。所有请求排队执行，所以 since 不会漏掉数据。

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 浏览器直接打开 …/exec 能看到这一行，说明部署好了
function doGet() {
  return json_({ ok: true, app: '苦昼短', version: VERSION });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'bad request' }); }
  if (body.secret !== SECRET) return json_({ error: 'denied' });
  // 还没刷新的旧版页面发来的是旧格式，直接不写，免得把表弄乱（它的改动还留在设备上，刷新成新版再推）
  if (!(Number(body.version) >= VERSION)) return json_({ error: 'old page' });
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) { return json_({ error: 'busy' }); }
  try {
    var now = Date.now(), touched = 0, out = { ok: true };
    var push = body.push || {}, rows = push.rows || {}, dead = deadMap_();
    Object.keys(rows).forEach(function (name) { if (T[name]) touched += upsert_(name, rows[name], now, dead); });
    touched += remove_(push.deletes, now);
    if (touched) {
      try { recount_(); } catch (err) { out.recount = String(err); }   // 名字列出问题不能影响同步，但要能看见
    }
    out.now = Date.now();
    out.version = VERSION;
    out.tables = Object.keys(T);
    if (body.pull) out.pull = pull_(Number(body.since) || 0);
    return json_(out);
  } finally {
    lock.releaseLock();
  }
}
