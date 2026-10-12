// 苦昼短 · Google Sheet 后端。粘贴到表格的 扩展程序 → Apps Script。
// 把下面第 4 行的 CHANGE_ME 改成你自己的口令（只在 Apps Script 编辑器里改，别改仓库里的文件），
// 然后运行 setup，再「部署 → 管理部署 → 编辑 → 新版本」。
var SECRET = 'CHANGE_ME';

// 每张表：页名、主键、[字段, 表头, 类型, 标记]。列按表头文字找，可以挪位置、中间插自己的列。
// 类型 text / num / date / bool / json / status / pstatus / clock（钟点 09:10，存成文字）。
// 标记 calc = 脚本自己算，App 不写；hide = setup 时把这列藏起来（右键可取消隐藏）。
var VERSION = 5;   // 页面和脚本对版本：页面不是这个版本就不收它的数据，免得新旧格式混在一起
var T = {
  // 计时记录在 Times 一格里：「09:10-09:40 30m; 20m」。Project = 挂在哪个计划上（脚本填名字）；Group = 属于哪个大类（可以不挂计划、直接挂在大类上）
  tasks: { sheet: 'Tasks', key: 'id', main: 'title', cols: [
    ['date', 'Date', 'date'], ['title', 'Task', 'text'], ['est', 'Est min', 'num'], ['actual', 'Actual min', 'num'],
    ['status', 'Status', 'status'], ['reason', 'Reason', 'text'], ['project', 'Project', 'text', 'calc'], ['group', 'Group', 'text'],
    ['optional', 'Optional', 'bool'], ['deep', 'Deep', 'bool'], ['times', 'Times', 'text'], ['order', 'Order', 'num', 'hide'],
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
    ['key', 'Key', 'text'], ['value', 'Value', 'json'], ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide']] },
  // 一行一个人。more = 这页里别的列都算他的资料：表头写什么，网页里那一格就叫什么（自己加列、改表头都行）
  friends: { sheet: 'Friends', key: 'id', main: 'name', more: true, cols: [
    ['name', 'Name', 'text'], ['next', 'Next', 'text'], ['nextDate', 'By', 'date'], ['last', 'Last', 'date', 'calc'],
    ['id', 'ID', 'text', 'hide'], ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide']] },
  // 每次的记录：哪天、和谁（With 是脚本按 Friend IDs 填的名字）、聊了什么、要记住的
  meets: { sheet: 'Catch-ups', key: 'id', main: 'note', cols: [
    ['date', 'Date', 'date'], ['who', 'With', 'text', 'calc'], ['note', 'Notes', 'text'], ['watch', 'Remember', 'text'],
    ['friends', 'Friend IDs', 'json', 'hide'], ['taskId', 'Task ID', 'text', 'hide'], ['id', 'ID', 'text', 'hide'],
    ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide']] }
};
// 不再用的列：setup 最后删掉
var DROP = { tasks: ['审核', 'Review', 'Category', 'Done order'], projects: ['Planned min', 'Spent min', 'Progress'] };
// 平时不用看的页：藏起来（右键页签 → 显示）
var HIDE = ['Log', 'Settings', 'Deleted', 'Notes'];
var KEEP_DELETED_DAYS = 14;   // 删除记录只是给还没同步的设备看的；更久没同步的设备会自己整表重拉
var ARCHIVE = 'Archive';
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
var COLORS = ['#3E8E6E', '#3F62B5', '#E07A2B', '#8B62AE', '#E6DCC3', '#9A5A36', '#D2A52E', '#B5413F'];

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
  friendCols_();
  recount_();
  recountFriends_();
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

// 删除记录只留最近两周（按记下来的时间 Synced 算；更久没同步的设备，页面会自己整表重拉一次）
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
    if (t.more) o.more = moreOf_(t, names, row, tz);
    o.id = key;
    out.push(o);
  }
  fixes.forEach(function (r) { sh.getRange(r + 1, 1, 1, names.length).setValues([data[r]]); });
  return out;
}

// ---- 自己加的列（T 里写了 more 的页）：表头不在上面那张清单里的，都读成 more = { 表头: 值 } ----

function known_(t) {
  var k = {};
  t.cols.forEach(function (c) { k[c[1]] = true; });
  return k;
}

function moreOf_(t, names, row, tz) {
  var known = known_(t), out = {};
  names.forEach(function (h, i) {
    if (!h || known[h]) return;
    var v = row[i];
    if (v !== '' && v !== null && v !== undefined) out[h] = day_(v, tz);
  });
  return out;
}

// 缺的列补上（插在 Next 前面，没有 Next 就接在最后），整列设成纯文本
function moreCols_(name, headers) {
  var t = T[name], sh = sheetOf_(name), names = head_(sh), known = known_(t);
  (headers || []).forEach(function (h) {
    h = String(h === null || h === undefined ? '' : h).trim();
    if (!h || known[h] || names.indexOf(h) >= 0) return;
    var at = names.indexOf('Next');
    if (at >= 0) { sh.insertColumnBefore(at + 1); names.splice(at, 0, h); }
    else { if (sh.getMaxColumns() < names.length + 1) sh.insertColumnAfter(sh.getMaxColumns()); at = names.length; names.push(h); }
    sh.getRange(1, at + 1).setValue(h);
    sh.getRange(2, at + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  });
}

// Settings 的 friend-fields（网页 Friends 页里排好的那几个名字）→ Friends 页的列
function friendCols_() {
  var row = readAll_('settings').filter(function (r) { return r.id === 'friend-fields'; })[0];
  if (row && Array.isArray(row.value)) moreCols_('friends', row.value);
}

// 按主键写入：表里那行更新得更晚就不覆盖（Log 例外：两边的份额合并）；
// 删过的行，除非这次的改动比删除还晚（比如撤销），不再写回来——自动生成的任务删了不会「复活」
function upsert_(name, rows, now, dead) {
  if (!rows || !rows.length) return 0;
  var t = T[name], sh = sheetOf_(name), tz = tz_();
  if (t.more) {
    var extra = [];
    rows.forEach(function (r) { if (r.more && typeof r.more === 'object') Object.keys(r.more).forEach(function (h) { if (extra.indexOf(h) < 0) extra.push(h); }); });
    moreCols_(name, extra);
  }
  if (name === 'projects') PLAN_NAMES = null;
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
    if (t.more && r.more && typeof r.more === 'object') {
      Object.keys(r.more).forEach(function (h) { var i = names.indexOf(h); if (i >= 0 && !known_(t)[h]) row[i] = toCell_('text', r.more[h]); });
    }
    // 任务 / 条目写进来时顺手把计划的名字填上（不用每次同步整页重填）
    if ((name === 'tasks' || name === 'items') && col.project >= 0 && col.projectId >= 0) row[col.project] = planNames_()[String(row[col.projectId] || '')] || '';
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

var PLAN_NAMES = null;   // 这一次请求里用的：计划 ID → 名字（Projects 一有改动就作废）
function planNames_() {
  if (!PLAN_NAMES) {
    PLAN_NAMES = {};
    readAll_('projects').forEach(function (p) { PLAN_NAMES[p.id] = p.name; });
  }
  return PLAN_NAMES;
}

function plan_(t) {
  if (t.status === 'done') return Number(t.est) || 0;
  return t.status === 'partial' ? Math.min(Number(t.actual) || 0, Number(t.est) || 0) : 0;
}

function recount_() {
  var name = {}, group = {};
  readAll_('projects').forEach(function (p) { name[p.id] = p.name; group[p.id] = p.group || p.name || ''; });
  writeCol_('tasks', 'project', function (r) { return name[r.projectId] || ''; });
  // 挂了计划的任务，大类跟着计划走（计划改了大类、大类改了名，这里补上）；直接挂在大类上的不动
  writeCol_('tasks', 'group', function (r) { return r.projectId && group[r.projectId] !== undefined ? group[r.projectId] : r.group; });
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

// Friends / Catch-ups 里脚本自己填的两列：With = 这次有谁（名字），Last = 这个人最近一次是哪天（到今天为止）
function recountFriends_() {
  var name = {}, last = {}, today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  readAll_('friends').forEach(function (f) { name[f.id] = f.name; });
  readAll_('meets').forEach(function (m) {
    if (!m.date || m.date > today) return;
    (m.friends || []).forEach(function (id) { if (!last[id] || m.date > last[id]) last[id] = m.date; });
  });
  writeCol_('meets', 'who', function (r) { return (r.friends || []).map(function (id) { return name[id] || ''; }).filter(String).join(', '); });
  writeCol_('friends', 'last', function (r) { return last[r.id] || ''; });
}

// 在编辑器里选 recount 点运行：立刻把名字列重填一次
function recount() {
  var r = recount_();
  recountFriends_();
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

// ================= 阅读：你自己的另一个表格 =================
// 链接在 Settings 的 reading（{url}），在网页电脑端的设置里填一次（整个表格的链接就行）。
// 那个表格每一页是一种（Book、PodCast、TV……），各页找到写着 Name 的那一行当表头，下面每一行是一条：
// Year | Month | Name | 评价（emoji）| 小类（Book 页的 book / English…，Game 页的 played / completed）| 备注。
// 网页加的「想看的」只放进单独一页 Want（没有就建一个）；「看完的」写进它自己那一页，Want 里那行拿掉。
// 别的格子不改不删；查重和搜索看所有页。
var READING_TAB = 'Want';
var READING_HEAD = ['Name', 'Type', 'Vibe', 'Note', 'Priority'];   // Priority：多想看（Soon / 5 years / 空着），网页里点的，这里也能直接改
var NAME_HEADS = ['name', 'title', '名字', '书名', '名称', '标题'];
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function readingBook_() {
  var row = readAll_('settings').filter(function (r) { return r.id === 'reading'; })[0];
  var url = row && row.value && String(row.value.url || '').trim();
  if (!url) return null;
  var id = (/\/d\/([a-zA-Z0-9_-]{20,})/.exec(url) || [])[1];   // 链接后面带 ?usp=sharing、#gid= 都没关系
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.openByUrl(url);
}

// 前 8 行里找表头：有一格写着 Name（或 Title / 书名……）的那一行
function readingHead_(sh) {
  var last = sh.getLastRow(), width = sh.getLastColumn();
  if (last < 1 || width < 1) return null;
  var top = sh.getRange(1, 1, Math.min(8, last), width).getValues();
  for (var r = 0; r < top.length; r++) {
    var low = top[r].map(function (v) { return String(v === null ? '' : v).trim().toLowerCase(); });
    for (var i = 0; i < low.length; i++) if (NAME_HEADS.indexOf(low[i]) >= 0) return { row: r + 1, name: i, cols: low, width: width, last: last };
  }
  return null;
}

// 表头下面的所有行
function readingBody_(sh, h) {
  return h && h.last > h.row ? sh.getRange(h.row + 1, 1, h.last - h.row, h.width).getValues() : [];
}

// 查重用：不分大小写，书名号、引号、空格都不算
function titleKey_(s) {
  return String(s || '').toLowerCase().replace(/[《》<>「」『』"'“”‘’\s]+/g, '');
}

function cellText_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz || tz_(), 'yyyy-MM-dd');
  return typeof v === 'number' && v % 1 === 0 ? String(v) : String(v === null || v === undefined ? '' : v).trim();
}

// 一页里的每一条：名字、哪一页、什么时候（Year + Month）、名字后面那格的 emoji、再后面的几格当备注。
// row（第几行）和 full（Want 页没截短的备注）只给这边用，不发给网页
function readingRows_(sh, tz, h, body) {
  if (!h) return [];
  var at = function (k) { return h.cols.indexOf(k); };
  var year = at('year'), month = at('month'), added = at('added'), vibe = at('vibe'), type = at('type'), note = at('note'), prio = at('priority');
  var str = function (v) { return cellText_(v, tz); };
  var mine = sh.getName() === READING_TAB;
  return body.map(function (r, n) {
    var title = str(r[h.name]);
    if (!title) return null;
    var when = added >= 0 ? str(r[added]) : [year >= 0 ? str(r[year]) : '', month >= 0 ? str(r[month]).slice(0, 3) : ''].join(' ').trim();
    var mark = mine && vibe >= 0 ? str(r[vibe]) : str(r[h.name + 1]);
    if (mark.length > 4) mark = '';   // 名字后面那格只有 emoji 才当成评价
    var rest = [];
    if (mine) { if (note >= 0 && str(r[note])) rest.push(str(r[note])); }
    else for (var i = h.name + 2; i < r.length; i++) if (str(r[i])) rest.push(str(r[i]));
    var full = rest.join(' · ');
    return { title: title, tab: mine && type >= 0 && str(r[type]) ? str(r[type]) : sh.getName(), want: mine, when: when, mark: mark, note: full.slice(0, 120), prio: mine && prio >= 0 ? str(r[prio]) : '', row: h.row + 1 + n, full: mine ? full : '' };
  }).filter(Boolean);
}

// 这一格的下拉：{ list: 选项, strict: 不在选项里的值收不收 }；没有下拉（或不是列表型的）是 null
function dropdown_(cell) {
  try {
    var rule = cell.getDataValidation();
    if (!rule) return null;
    var kind = String(rule.getCriteriaType()), args = rule.getCriteriaValues();
    var vals = kind === 'VALUE_IN_LIST' ? args[0] : kind === 'VALUE_IN_RANGE' ? [].concat.apply([], args[0].getValues()) : null;
    if (!vals) return null;
    vals = vals.map(function (v) { return cellText_(v, ''); }).filter(function (v) { return v !== ''; });
    return vals.length ? { list: vals, strict: !rule.getAllowInvalid() } : null;
  } catch (err) { return null; }
}

// 小类那一格（名字后面第二格）能选什么：有下拉就照下拉的选项；没有就看这一列写过什么（短的、就那么几种才算）
function readingKinds_(sh, h, body) {
  var col = h.name + 2;
  if (col >= sh.getMaxColumns()) return [];
  var drop = dropdown_(sh.getRange(h.row + 1, col + 1));
  if (drop) return drop.list;
  var count = {}, names = [];
  for (var i = 0; i < body.length; i++) {
    var v = cellText_(body[i][col], '');
    if (!v) continue;
    if (v.length > 12) return [];
    if (!count[v]) { count[v] = 0; names.push(v); }
    count[v]++;
  }
  return names.length > 6 ? [] : names.sort(function (a, b) { return count[b] - count[a]; });
}

// Want 页：没有就建，表头缺的补在后面（旧的 Want 页没有 Priority 那一列，第一次用到时补上）；返回 { sh, col: {name, type, vibe, note, priority} }
function wantTab_(book) {
  var sh = book.getSheetByName(READING_TAB);
  if (!sh) {
    sh = book.insertSheet(READING_TAB);
    sh.getRange(1, 1, 1, READING_HEAD.length).setValues([READING_HEAD]);
    sh.setFrozenRows(1);
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), READING_HEAD.length).setNumberFormat('@');
  }
  var names = head_(sh), col = {};
  READING_HEAD.forEach(function (hd) {
    var i = names.map(function (n) { return n.toLowerCase(); }).indexOf(hd.toLowerCase());
    if (i < 0) {
      if (sh.getMaxColumns() < names.length + 1) sh.insertColumnAfter(sh.getMaxColumns());
      sh.getRange(1, names.length + 1).setValue(hd);
      i = names.length;
      names.push(hd);
    }
    col[hd.toLowerCase()] = i;
  });
  return { sh: sh, col: col, width: names.length };
}

var plainKey_ = function (v) { return String(v).replace(/️/g, '').trim().toLowerCase(); };

// 月份照这一页已有的写法：下拉选项 / 已有的格子里开头三个字母一样的原样用；这一页写的是数字就写数字；都没有就写英文全名
function monthText_(m, known) {
  var want = MONTHS[m - 1].slice(0, 3).toLowerCase(), digits = false;
  for (var i = 0; i < known.length; i++) {
    var s = cellText_(known[i], '');
    if (s.slice(0, 3).toLowerCase() === want) return s;
    if (/^\d{1,2}$/.test(s)) digits = true;
  }
  return digits ? m : MONTHS[m - 1];
}

// 要写进有下拉的格子：照选项里的写法写（大小写、emoji 的变体符不算差别）；选项里没有、下拉又不收别的值 → 说清楚缺什么
function fit_(sh, row, col, v, what) {
  var drop = dropdown_(sh.getRange(row, col + 1));
  if (!drop) return v;
  for (var i = 0; i < drop.list.length; i++) if (plainKey_(drop.list[i]) === plainKey_(v)) return typeof v === 'number' ? v : drop.list[i];
  if (drop.strict) throw new Error(sh.getName() + ': the ' + what + ' dropdown has no "' + v + '" — add it in the Sheet');
  return v;
}

// 看完的一条写进它那一页。all = 现在所有页里的条目 [{r, sh}]。返回 {} / { dupe: 已经在哪一页 } / { why: 为什么没写 }
function finish_(book, d, all) {
  var title = String(d.title).trim(), key = titleKey_(title);
  var hits = all.filter(function (x) { return titleKey_(x.r.title) === key; });
  var dated = hits.filter(function (x) { return !x.r.want && x.r.when; })[0];
  if (dated) return { dupe: dated.r.tab };
  var open = hits.filter(function (x) { return !x.r.want; })[0];   // 某一页里已经有、还没写日期：就地填
  var wants = hits.filter(function (x) { return x.r.want; });
  var tab = String(d.tab || '').trim().toLowerCase();
  var sh = open ? open.sh : book.getSheets().filter(function (s) { return s.getName() !== READING_TAB && s.getName().trim().toLowerCase() === tab; })[0];
  if (!sh) return { why: 'There is no ' + (d.tab || '?') + ' tab in your reading Sheet' };
  var h = readingHead_(sh), yc = h ? h.cols.indexOf('year') : -1, mc = h ? h.cols.indexOf('month') : -1;
  if (yc < 0 || mc < 0) return { why: sh.getName() + ': no Year / Month / Name headings' };
  var m = Math.min(12, Math.max(1, Number(d.month) || 1)), year = Number(d.year);
  if (!(year > 1900)) return { why: 'No year' };
  var body = readingBody_(sh, h), row = open ? open.r.row : 0, fresh = false;
  if (!row) {
    // 最后一条有日期的下面那一行；那一行有东西（比如放在底下、还没看的）就先插一行
    var last = h.row;
    body.forEach(function (r, n) { if (cellText_(r[h.name], '') && cellText_(r[yc], '')) last = h.row + 1 + n; });
    row = last + 1;
    var taken = row <= h.last && body[row - h.row - 1].some(function (v) { return v !== '' && v !== null; });
    if (taken || row > sh.getMaxRows()) { sh.insertRowsAfter(row - 1, 1); fresh = true; }
  }
  var was = open ? body[row - h.row - 1] : [], wrote = [];
  var set = function (col, v, what) {
    while (sh.getMaxColumns() < col + 1) sh.insertColumnAfter(sh.getMaxColumns());
    var cell = fit_(sh, row, col, v, what);
    sh.getRange(row, col + 1).setValue(typeof cell === 'number' ? cell : toCell_('text', cell));
    wrote.push(col);
  };
  // Want 页里写过的备注跟着过去，这次写的接在后面
  var notes = wants.map(function (x) { return x.r.full; }).concat(open ? [cellText_(was[h.name + 3], '')] : []).concat([String(d.note || '').trim()]);
  var note = notes.filter(function (s, i) { return s && notes.indexOf(s) === i; }).join('\n');
  try {
    set(yc, year, 'Year');
    set(mc, monthText_(m, ((dropdown_(sh.getRange(row, mc + 1)) || {}).list || []).concat(body.map(function (r) { return r[mc]; }))), 'Month');
    if (d.mark) set(h.name + 1, String(d.mark), 'rating');
    if (d.kind) set(h.name + 2, String(d.kind), 'kind');
    if (note) set(h.name + 3, note, 'note');
    if (!open) set(h.name, title, 'Name');
    SpreadsheetApp.flush();   // 下拉不收的值最晚在这里报出来
  } catch (err) {
    // 写到一半：这一行恢复原样，这条留在网页那边等着
    try {
      if (fresh) sh.deleteRow(row);
      else wrote.forEach(function (col) { sh.getRange(row, col + 1).setValue(was[col] === undefined ? '' : was[col]); });
    } catch (e) { /* 恢复不了就算了，原因照样报回去 */ }
    return { why: String(err.message || err) };
  }
  // 行号从下往上删，上面的不会挪位置
  wants.map(function (x) { return x.r.row; }).sort(function (a, b) { return b - a; }).forEach(function (n) { wants[0].sh.deleteRow(n); });
  return {};
}

// req = { list: true, add: [{id, title, type, vibe, note, prio}], rank: [{id, title, prio}], done: [{id, title, tab, year, month, mark, kind, note}] }
// rank = 改 Want 页里已有那一条的 Priority（prio 是要写进格子的字，空 = 清掉）
// → { rows, types, kinds: {页名: [小类…]}, added: [id], logged: [id], dupes: [{id, title, tab}], failed: [{id, title, why}] }
function reading_(req) {
  var book = readingBook_();
  if (!book) return { error: 'no sheet' };
  var tz = tz_(), all, types, kinds;
  var scan = function (withKinds) {
    all = []; types = []; kinds = {};
    book.getSheets().forEach(function (sh) {
      var mine = sh.getName() === READING_TAB, h = readingHead_(sh), body = readingBody_(sh, h);
      if (!mine) types.push(sh.getName());
      readingRows_(sh, tz, h, body).forEach(function (r) { all.push({ r: r, sh: sh }); });
      if (withKinds && h && !mine) { var k = readingKinds_(sh, h, body); if (k.length) kinds[sh.getName()] = k; }
    });
  };
  var adds = (req.add || []).filter(function (a) { return a && String(a.title || '').trim(); });
  var dones = (req.done || []).filter(function (d) { return d && String(d.title || '').trim(); });
  var ranks = (req.rank || []).filter(function (k) { return k && String(k.title || '').trim(); });
  var writes = adds.length + dones.length + ranks.length > 0;
  scan(Boolean(req.list) && !writes);
  var out = { added: [], dupes: [], logged: [], ranked: [], failed: [] }, changed = false;
  if (adds.length) {
    var seen = {}, fresh = [], w = wantTab_(book);
    all.forEach(function (x) { if (!seen[titleKey_(x.r.title)]) seen[titleKey_(x.r.title)] = x.r; });
    adds.forEach(function (a) {
      var title = String(a.title).trim(), hit = seen[titleKey_(title)];
      if (hit) { out.dupes.push({ id: a.id, title: title, tab: hit.tab }); return; }
      var line = [];
      for (var i = 0; i < w.width; i++) line.push('');
      line[w.col.name] = toCell_('text', title);
      line[w.col.type] = toCell_('text', String(a.type || '').trim());
      line[w.col.vibe] = toCell_('text', String(a.vibe || '').trim());
      line[w.col.note] = toCell_('text', String(a.note || '').trim());
      line[w.col.priority] = toCell_('text', String(a.prio || '').trim());
      fresh.push(line);
      seen[titleKey_(title)] = { tab: String(a.type || '').trim() };
      out.added.push(a.id);
    });
    if (fresh.length) {
      var start = w.sh.getLastRow() + 1, need = start + fresh.length - 1 - w.sh.getMaxRows();
      if (need > 0) w.sh.insertRowsAfter(w.sh.getMaxRows(), need);
      w.sh.getRange(start, 1, fresh.length, w.width).setValues(fresh);
      changed = true;
    }
  }
  if (ranks.length) {
    if (changed) scan(false);   // 刚加过行：重新读一遍再找
    var wt = book.getSheetByName(READING_TAB) ? wantTab_(book) : null;
    ranks.forEach(function (k) {
      var key = titleKey_(k.title), hit = all.filter(function (x) { return x.r.want && titleKey_(x.r.title) === key; })[0];
      if (!wt || !hit) { out.failed.push({ id: k.id, title: String(k.title).trim(), why: 'is not in Want any more' }); return; }
      wt.sh.getRange(hit.r.row, wt.col.priority + 1).setValue(toCell_('text', String(k.prio || '').trim()));
      out.ranked.push(k.id);
    });
  }
  dones.forEach(function (d) {
    if (changed) scan(false);   // 上一条挪过行：重新读一遍再找
    var res;
    try { res = finish_(book, d, all); } catch (err) { res = { why: String(err.message || err) }; }
    if (res.dupe) out.dupes.push({ id: d.id, title: String(d.title).trim(), tab: res.dupe });
    else if (res.why) out.failed.push({ id: d.id, title: String(d.title).trim(), why: res.why });
    else out.logged.push(d.id);
    changed = true;
  });
  if (req.list) {
    if (writes) scan(true);   // 写过东西：重新读一遍，回去的就是表格现在的样子
    out.rows = all.map(function (x) { return { title: x.r.title, tab: x.r.tab, want: x.r.want, when: x.r.when, mark: x.r.mark, note: x.r.note, prio: x.r.prio }; });
    out.types = types;
    out.kinds = kinds;
  }
  return out;
}

// ================= 季度表：你自己的另一个表格 =================
// 链接在 Settings 的 quarter（{url, from}），在网页电脑端的设置里填一次。那个表格每个季度一页，页名「2026 Q4」。
// 网页把每天的两个数算好发来（progress、focus）；这里只管找到那一天那一行，写这两格，别的格子一概不碰。
var QUARTER_COLS = ['progress', 'focus'];

function quarterBook_() {
  var row = readAll_('settings').filter(function (r) { return r.id === 'quarter'; })[0];
  var url = row && row.value && String(row.value.url || '').trim();
  if (!url) return null;
  var id = (/\/d\/([a-zA-Z0-9_-]{20,})/.exec(url) || [])[1];
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.openByUrl(url);
}

// 页名不分大小写、不管空格（2026 Q4 / 2026Q4 / 2026 q4）；没有这一页、但整个表格就叫这个名字，就用第一页
function quarterTab_(book, name) {
  var flat = function (v) { return String(v || '').replace(/\s+/g, '').toLowerCase(); };
  var sheets = book.getSheets();
  for (var i = 0; i < sheets.length; i++) if (flat(sheets[i].getName()) === flat(name)) return sheets[i];
  return flat(book.getName()) === flat(name) ? sheets[0] : null;
}

// req = { rows: [{date, progress, focus}] } → { done: [date], missing: [{date, why}] }
function quarter_(req) {
  var book = quarterBook_();
  if (!book) return { error: 'no sheet' };
  var tz = book.getSpreadsheetTimeZone(), out = { done: [], missing: [] }, byTab = {};
  (req.rows || []).forEach(function (r) {
    var m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(r && r.date || ''));
    if (!m) return;
    var tab = m[1] + ' Q' + (Math.floor((Number(m[2]) - 1) / 3) + 1);
    (byTab[tab] = byTab[tab] || []).push(r);
  });
  Object.keys(byTab).forEach(function (tab) {
    var miss = function (why) { byTab[tab].forEach(function (r) { out.missing.push({ date: r.date, why: why }); }); };
    var sh = quarterTab_(book, tab);
    if (!sh) return miss('No tab named ' + tab);
    var last = sh.getLastRow(), width = sh.getLastColumn();
    if (last < 2 || width < 1) return miss('The ' + tab + ' tab is empty');
    // 前 5 行里找表头：同一行里写着 progress 和 focus
    var top = sh.getRange(1, 1, Math.min(5, last), width).getValues(), head = 0, col = {};
    for (var r = 0; r < top.length && !head; r++) {
      var low = top[r].map(function (v) { return String(v === null ? '' : v).trim().toLowerCase(); });
      if (QUARTER_COLS.every(function (k) { return low.indexOf(k) >= 0; })) { head = r + 1; QUARTER_COLS.forEach(function (k) { col[k] = low.indexOf(k) + 1; }); }
    }
    if (!head) return miss('No progress / focus columns on ' + tab);
    if (last <= head) return miss('No dates on ' + tab);
    // 前 3 列里找日期：哪一行是哪一天
    var at = {};
    sh.getRange(head + 1, 1, last - head, Math.min(3, width)).getValues().forEach(function (row, i) {
      for (var c = 0; c < row.length; c++) {
        var d = day_(row[c], tz);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { at[d] = head + 1 + i; break; }
      }
    });
    byTab[tab].forEach(function (r) {
      var row = at[r.date];
      if (!row) { out.missing.push({ date: r.date, why: 'No row for ' + r.date + ' on ' + tab }); return; }
      QUARTER_COLS.forEach(function (k) {
        var v = Number(r[k]);
        if (r[k] === null || r[k] === undefined || isNaN(v)) return;
        var cell = sh.getRange(row, col[k]);
        if (cell.getValue() !== v) cell.setValue(v);
      });
      out.done.push(r.date);
    });
  });
  return out;
}

// ================= 归档：很久以前的任务搬到 Archive 页 =================
// 网页设置里点 Archive 才会跑。before 这天以前的任务整行抄到 Archive 页（没有就建，表头和 Tasks 一样），
// 再从 Tasks 删掉、记进 Deleted（各台设备下次同步跟着清掉）。还挂在进行中的整块计划的条目上的不动，不然计划进度会少算。
function archive_(before, now) {
  before = String(before || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) return { moved: 0 };
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = sheetOf_('tasks'), tz = tz_();
  var names = head_(sh), col = cols_(T.tasks, names), data = body_(sh, names);
  var live = {};
  readAll_('projects').forEach(function (p) { if (p.kind !== 'regular' && p.status === 'active') live[p.id] = true; });
  var moved = [], gone = [], log = [];
  data.forEach(function (row, i) {
    var id = String(row[col.id] || '').trim(), d = day_(row[col.date], tz);
    if (!id || !d || d >= before) return;
    if (String(row[col.itemId] || '').trim() && live[String(row[col.projectId] || '').trim()]) return;
    moved.push(row); gone.push(i + 2); log.push(['tasks', id, now, now]);
  });
  if (!moved.length) return { moved: 0 };
  var ar = ss.getSheetByName(ARCHIVE);
  if (!ar) {
    ar = ss.insertSheet(ARCHIVE);
    ar.getRange(1, 1, 1, names.length).setValues([names]);
    ar.setFrozenRows(1);
  }
  // 按表头对齐（Tasks 后来多了列，Archive 也补上），文字原样留着
  var an = head_(ar);
  names.forEach(function (h) {
    if (!h || an.indexOf(h) >= 0) return;
    if (ar.getMaxColumns() < an.length + 1) ar.insertColumnAfter(ar.getMaxColumns());
    ar.getRange(1, an.length + 1).setValue(h);
    an.push(h);
  });
  var lines = moved.map(function (row) {
    return an.map(function (h) {
      var i = names.indexOf(h), v = i >= 0 ? row[i] : '';
      return typeof v === 'string' && v.charAt(0) === '=' ? "'" + v : v;
    });
  });
  var start = ar.getLastRow() + 1, need = start + lines.length - 1 - ar.getMaxRows();
  if (need > 0) ar.insertRowsAfter(ar.getMaxRows(), need);
  ar.getRange(start, 1, lines.length, an.length).setValues(lines);
  // 从下往上删，挨着的几行一次删掉
  for (var k = gone.length - 1; k >= 0; k--) {
    var end = gone[k], first = end;
    while (k > 0 && gone[k - 1] === first - 1) { first--; k--; }
    sh.deleteRows(first, end - first + 1);
  }
  var del = deletedSheet_();
  del.getRange(del.getLastRow() + 1, 1, log.length, 4).setValues(log);
  return { moved: moved.length };
}

// ================= 网页接口 =================
// App 只发 POST：{ secret, version, push: { rows: { tasks: [...] }, deletes: [{table, id, at}] }, pull: true, since }
// 返回 { ok, now, pull: { tables, deleted } }。所有请求排队执行，所以 since 不会漏掉数据。
// 还可以带：tidy（清过期的删除记录）、quarter（季度表的两格）、archive（{before}，旧任务搬进 Archive 页）、reading（阅读表格）

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
    PLAN_NAMES = null;
    var push = body.push || {}, rows = push.rows || {}, dels = push.deletes || [], dead = deadMap_();
    // Settings 先写：Friends 页的列按网页里排好的顺序建好，再写每个人的那几格
    var fields = (rows.settings || []).some(function (r) { return (r.key || r.id) === 'friend-fields'; });
    Object.keys(rows).sort(function (a, b) { return (a === 'settings' ? 0 : 1) - (b === 'settings' ? 0 : 1); }).forEach(function (name) {
      if (T[name]) touched += upsert_(name, rows[name], now, dead);
      if (name === 'settings' && fields) friendCols_();
    });
    touched += remove_(dels, now);
    // 脚本自己填的列：哪张表这次被动到了才重填（任务 / 条目的计划名在写入时已经顺手填了）
    var hit = function (name) { return (rows[name] && rows[name].length) || dels.some(function (d) { return d.table === name; }); };
    try {
      if (hit('projects')) recount_();
      if (hit('friends') || hit('meets')) recountFriends_();
    } catch (err) { out.recount = String(err); }   // 名字列出问题不能影响同步，但要能看见
    if (body.tidy) pruneDeleted_();
    if (body.archive) {
      try { out.archive = archive_(body.archive.before, now); } catch (err) { out.archive = { error: String(err.message || err) }; }
    }
    if (body.quarter) {
      try { out.quarter = quarter_(body.quarter); } catch (err) { out.quarter = { error: String(err.message || err) }; }   // 季度表出问题不影响同步
    }
    if (body.reading) {
      try { out.reading = reading_(body.reading); } catch (err) { out.reading = { error: String(err.message || err) }; }   // 阅读表格出问题不影响同步
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
