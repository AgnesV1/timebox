// 苦昼短 · Google Sheet 后端。粘贴到表格的 扩展程序 → Apps Script。
// 把下面第 4 行的 CHANGE_ME 改成你自己的口令（只在 Apps Script 编辑器里改，别改仓库里的文件），
// 然后运行 setup，再「部署 → 管理部署 → 编辑 → 新版本」。
var SECRET = 'CHANGE_ME';

// 每张表：页名、主键、[字段, 表头, 类型, 标记]。列按表头文字找，可以挪位置、中间插自己的列。
// 类型 text / num / date / bool / json / status / pstatus / clock（钟点 09:10，存成文字）。
// 标记 calc = 脚本自己算，App 不写；hide = setup 时把这列藏起来（右键可取消隐藏）。
var T = {
  tasks: { sheet: 'Tasks', key: 'id', main: 'title', cols: [
    ['date', 'Date', 'date'], ['title', 'Task', 'text'], ['est', 'Est min', 'num'], ['actual', 'Actual min', 'num'],
    ['order', 'Order', 'num'], ['category', 'Category', 'text'], ['status', 'Status', 'status'],
    ['doneOrder', 'Done order', 'num'], ['reason', 'Reason', 'text'], ['project', 'Project', 'text', 'calc'],
    ['optional', 'Optional', 'bool'], ['id', 'ID', 'text', 'hide'], ['projectId', 'Project ID', 'text', 'hide'],
    ['itemId', 'Item ID', 'text', 'hide'], ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide'],
    ['desc', 'Description', 'text']] },                               // Description 永远最后一列
  projects: { sheet: 'Projects', key: 'id', main: 'name', cols: [
    ['name', 'Project', 'text'], ['group', 'Group', 'text'], ['status', 'Status', 'pstatus'],
    ['deadline', 'Deadline', 'date'], ['start', 'Start', 'date'], ['early', 'Finish early', 'num'], ['color', 'Color', 'text'],
    ['planned', 'Planned min', 'num', 'calc'], ['spent', 'Spent min', 'num', 'calc'], ['progress', 'Progress', 'num', 'calc'],
    ['order', 'Order', 'num'], ['calib', 'Calibration', 'json', 'hide'], ['id', 'ID', 'text', 'hide'],
    ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide']] },
  items: { sheet: 'Items', key: 'id', main: 'title', cols: [
    ['title', 'Item', 'text'], ['project', 'Project', 'text', 'calc'], ['module', 'Module', 'text'], ['est', 'Est min', 'num'],
    ['origEst', 'Original est', 'num'], ['order', 'Order', 'num'], ['id', 'ID', 'text', 'hide'],
    ['projectId', 'Project ID', 'text', 'hide'], ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide']] },
  capacity: { sheet: 'Day capacity', key: 'date', cols: [
    ['date', 'Date', 'date'], ['min', 'Available min', 'num'], ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide']] },
  notes: { sheet: 'Notes', key: 'date', cols: [
    ['date', 'Date', 'date'], ['note', 'Note', 'text'], ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide']] },
  log: { sheet: 'Log', key: 'date', cols: [
    ['date', 'Date', 'date'], ['need', 'Line min', 'num'], ['projects', 'Shares', 'json'],
    ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide']] },
  settings: { sheet: 'Settings', key: 'key', cols: [
    ['key', 'Key', 'text'], ['value', 'Value', 'json'], ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide']] },
  // 计时记录：一段一行。From / To 是钟点（09:10），Min 是分钟
  time: { sheet: 'Time', key: 'id', cols: [
    ['date', 'Date', 'date'], ['task', 'Task', 'text', 'calc'], ['from', 'From', 'clock'], ['to', 'To', 'clock'], ['min', 'Min', 'num'],
    ['id', 'ID', 'text', 'hide'], ['taskId', 'Task ID', 'text', 'hide'], ['updated', 'Updated', 'num', 'hide'], ['synced', 'Synced', 'num', 'calc hide']] }
};
var DELETED = 'Deleted';
var DELETED_HEADER = ['Table', 'ID', 'Deleted at', 'Synced'];
var GROUP_SHEET = 'Groups';
var GROUPS = ['Work 1', 'Work 2', 'Main - English', 'Main - French', 'Main - Fitness', 'Fun'];
var CATEGORIES = ['Main', 'Work', 'Fun', 'Chore'];
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
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  rename_(ss, '任务', 'Tasks');
  rename_(ss, '每日时长', 'Day capacity');
  var old = isOld_(ss);
  if (old) backup_(ss);
  Object.keys(T).forEach(ensure_);
  deletedSheet_();
  groupSheet_();
  validate_();
  Object.keys(T).forEach(function (name) { readAll_(name, true); });   // 没有 ID 的行补上
  if (old) migrate_();
  recount_();
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
    if (c[0] === 'progress') range.setNumberFormat('0%');
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

// 大类清单，Projects 的 Group 下拉就读这一列，随便改名增删
function groupSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(GROUP_SHEET);
  if (!sh) {
    sh = ss.insertSheet(GROUP_SHEET);
    sh.getRange(1, 1, GROUPS.length + 1, 1).setValues([['Group']].concat(GROUPS.map(function (g) { return [g]; })));
    sh.setFrozenRows(1);
  }
  return sh;
}

function validate_() {
  var list = function (values) { return SpreadsheetApp.newDataValidation().requireValueInList(values, true).build(); };
  var col = function (name, header) {
    var sh = sheetOf_(name), i = head_(sh).indexOf(header) + 1;
    return i ? sh.getRange(2, i, Math.max(sh.getMaxRows() - 1, 1), 1) : null;
  };
  var r;
  if ((r = col('tasks', 'Category'))) r.setDataValidation(list(CATEGORIES));
  if ((r = col('tasks', 'Status'))) r.setDataValidation(list(['Done', 'Partial', 'Later', 'Drop']));
  if ((r = col('projects', 'Status'))) r.setDataValidation(list(['Active', 'Done', 'Dropped']));
  if ((r = col('projects', 'Group'))) {
    r.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(groupSheet_().getRange('A2:A200'), true).build());
  }
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
  if (type === 'clock' && Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz, 'HH:mm');
  return v === null || v === undefined ? '' : String(v);
}

function toCell_(type, v) {
  if (v === null || v === undefined) return '';
  if (type === 'bool') return v ? true : '';
  if (type === 'json') return v === '' ? '' : JSON.stringify(v);
  if (type === 'status') return STATUS_OUT[v] || '';
  if (type === 'pstatus') return PSTATUS_OUT[v] || 'Active';
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

// 按主键写入：表里那行更新得更晚就不覆盖（Log 例外：两边的份额合并）
function upsert_(name, rows, now) {
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
    var i = at[key], row;
    var pending = i !== undefined && i >= data.length;   // 这一批里刚新增的
    if (i !== undefined) {
      row = (pending ? appended[i - data.length] : data[i]).slice();
      if (name === 'log') r = mergeLog_(fromCell_('json', row[col.projects], tz), r);
      else if ((Number(row[col.updated]) || 0) > (Number(r.updated) || 0)) return;
    } else {
      row = names.map(function () { return ''; });
    }
    t.cols.forEach(function (c) {
      if (col[c[0]] < 0 || String(c[3] || '').indexOf('calc') >= 0 || r[c[0]] === undefined) return;
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

// ================= Projects 的 Planned / Spent / Progress，和名字列 =================
// 和 App 里算法一致：Planned = 条目预计之和；Spent = 挂在项目上的任务实际花的时间
// （填了 Actual 按实际，没填的 Done 按预计，Partial 按实际）；Progress = 计划完成了多少

function spent_(t) {
  var a = Number(t.actual) || 0;
  if (t.status === 'done') return a > 0 ? a : Number(t.est) || 0;
  return t.status === 'partial' || !t.status ? a : 0;   // 还没标状态但计过时的也算
}

function plan_(t) {
  if (t.status === 'done') return Number(t.est) || 0;
  return t.status === 'partial' ? Math.min(Number(t.actual) || 0, Number(t.est) || 0) : 0;
}

function recount_() {
  var projects = readAll_('projects'), items = readAll_('items'), tasks = readAll_('tasks');
  var name = {}, planned = {}, done = {}, spent = {}, progress = {}, title = {};
  projects.forEach(function (p) { name[p.id] = p.name; });
  tasks.forEach(function (t) {
    title[t.id] = t.title;
    if (t.itemId) progress[t.itemId] = (progress[t.itemId] || 0) + plan_(t);
    if (t.projectId) spent[t.projectId] = (spent[t.projectId] || 0) + spent_(t);
  });
  items.forEach(function (i) {
    var est = Number(i.est) || 0;
    planned[i.projectId] = (planned[i.projectId] || 0) + est;
    done[i.projectId] = (done[i.projectId] || 0) + Math.min(progress[i.id] || 0, est);
  });
  writeCol_('projects', 'planned', function (r) { return planned[r.id] || 0; });
  writeCol_('projects', 'spent', function (r) { return spent[r.id] || 0; });
  writeCol_('projects', 'progress', function (r) { return planned[r.id] ? (done[r.id] || 0) / planned[r.id] : ''; });
  writeCol_('tasks', 'project', function (r) { return name[r.projectId] || ''; });
  writeCol_('items', 'project', function (r) { return name[r.projectId] || ''; });
  writeCol_('time', 'task', function (r) { return title[r.taskId] || ''; });
  return { ok: true, projects: projects.length };
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

// 在编辑器里选 recount 点运行：立刻重算一次 Projects
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
    var est = Number(p.planned) > 0 ? Number(p.planned) : planOf[p.id] || 0;   // 升级前手填的 Planned min
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
// App 只发 POST：{ secret, push: { rows: { tasks: [...] }, deletes: [{table, id, at}] }, pull: true, since }
// 返回 { ok, now, pull: { tables, deleted } }。所有请求排队执行，所以 since 不会漏掉数据。

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 浏览器直接打开 …/exec 能看到这一行，说明部署好了
function doGet() {
  return json_({ ok: true, app: '苦昼短' });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'bad request' }); }
  if (body.secret !== SECRET) return json_({ error: 'denied' });
  // 还没刷新的旧版页面发来的是旧格式，直接不写，免得把表弄乱
  if (body.removed !== undefined && !body.push) return json_({ error: 'old page' });
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) { return json_({ error: 'busy' }); }
  try {
    var now = Date.now(), touched = 0, out = { ok: true };
    var push = body.push || {}, rows = push.rows || {};
    Object.keys(rows).forEach(function (name) { if (T[name]) touched += upsert_(name, rows[name], now); });
    touched += remove_(push.deletes, now);
    if (touched) {
      try { recount_(); } catch (err) { out.recount = String(err); }   // Projects 出问题不能影响同步，但要能看见
    }
    out.now = Date.now();
    out.tables = Object.keys(T);   // 页面靠这个知道表格认不认识新加的表
    if (body.pull) out.pull = pull_(Number(body.since) || 0);
    return json_(out);
  } finally {
    lock.releaseLock();
  }
}
