// Paste into your Google Sheet: Extensions → Apps Script
// Change the secret below, then put the same one in the web app's Settings → Secret

var SECRET = 'CHANGE_ME';

var SHEET       = 'Tasks';
var CAP_SHEET   = 'Day capacity';
var PROJ_SHEET  = 'Projects';
var GROUP_SHEET = 'Groups';

// Description 永远放最后一列
var HEADER       = ['Date', 'Task', 'Est min', 'Actual min', 'Order', 'Category', 'Status', 'Done order', 'Reason', 'Description'];
var CAP_HEADER   = ['Date', 'Available min'];
var PROJ_HEADER  = ['Project', 'Group', 'Planned min', 'Status', 'Spent min', 'Progress'];
var GROUP_HEADER = ['Group'];
var CATEGORIES   = ['Main', 'Work', 'Fun', 'Chore'];
var PROJ_STATUS  = ['Active', 'Done', 'Dropped'];
var GROUPS       = ['Work 1', 'Work 2', 'Main - English', 'Main - French', 'Main - Fitness', 'Fun'];

// 同步用到的列按表头文字找，所以列可以挪位置、中间也能插自己的列
var COLS = { date: 'Date', task: 'Task', est: 'Est min', seq: 'Order', result: 'Status', doneSeq: 'Done order' };
// 这几列没有也能跑
var OPT  = { cat: 'Category', actual: 'Actual min', reason: 'Reason', desc: 'Description' };
// 老表的中文表头 → 新表头
var RENAME = {
  '日期': 'Date', '任务内容': 'Task', '预计完成时间（分钟）': 'Est min', '实际时长（分钟）': 'Actual min',
  '拟定顺序': 'Order', '分类': 'Category', '是否完成': 'Status', '实际次序（自动）': 'Done order',
  '任务描述': 'Description', '可用时长（分钟）': 'Available min'
};

// 第一次用，以及每次更新代码后：在编辑器顶部选 setup 点「运行」。
// 会把老表改成英文表头、删掉「审核」列、补上缺的列、把 Description 挪到最后，并建好 Projects / Groups
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  rename_(ss, '任务', SHEET);
  rename_(ss, '每日时长', CAP_SHEET);
  migrate_(sheet_());
  capSheet_();
  projSheet_();
  groupSheet_();
  recount_();
}

function rename_(ss, from, to) {
  var old = ss.getSheetByName(from);
  if (old && !ss.getSheetByName(to)) old.setName(to);
}

function head_(sh) {
  var names = sh.getDataRange().getValues()[0].map(function (h) { return String(h).trim(); });
  while (names.length && names[names.length - 1] === '') names.pop();   // 表头右边的空列不算
  return names;
}

function migrate_(sh) {
  var names = head_(sh);
  names.forEach(function (h, i) {                       // 中文表头改成英文
    if (RENAME[h]) { sh.getRange(1, i + 1).setValue(RENAME[h]); names[i] = RENAME[h]; }
  });
  ['审核', 'Review'].forEach(function (h) {             // 「审核」这一列不要了
    var i = names.indexOf(h);
    if (i >= 0) { sh.deleteColumn(i + 1); names.splice(i, 1); }
  });
  HEADER.forEach(function (h) {                         // 缺的列补在最后
    if (names.indexOf(h) < 0) { sh.getRange(1, names.length + 1).setValue(h); names.push(h); }
  });
  var d = names.indexOf('Description');                 // Description 永远最后一列
  if (d >= 0 && d < names.length - 1) {
    sh.moveColumns(sh.getRange(1, d + 1, sh.getMaxRows(), 1), names.length + 1);
    names.splice(d, 1);
    names.push('Description');
  }
  var rows = sh.getMaxRows() - 1;
  sh.getRange(2, names.indexOf('Date') + 1, rows, 1).setNumberFormat('yyyy-mm-dd');
  // 描述和理由设成纯文本，免得「- 第一步」这种开头被当成公式
  ['Description', 'Reason'].forEach(function (h) {
    sh.getRange(2, names.indexOf(h) + 1, rows, 1).setNumberFormat('@');
  });
  var cat = names.indexOf('Category') + 1;
  if (cat) sh.getRange(2, cat, rows, 1).setDataValidation(list_(CATEGORIES));
  return names;
}

function list_(values) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true).build();
}

function newSheet_(name, header) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().insertSheet(name);
  sh.appendRow(header);
  sh.setFrozenRows(1);
  return sh;
}

function sheet_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET);
  if (!sh) {
    sh = newSheet_(SHEET, HEADER);
    sh.getRange(2, 1, sh.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');
  }
  return sh;
}

function capSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CAP_SHEET);
  if (!sh) {
    sh = newSheet_(CAP_SHEET, CAP_HEADER);
    sh.getRange(2, 1, sh.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');
  } else {
    head_(sh).forEach(function (h, i) {
      if (RENAME[h]) sh.getRange(1, i + 1).setValue(RENAME[h]);
    });
  }
  return sh;
}

// 大类清单，Projects 的 Group 下拉就读这一列，随便改名增删
function groupSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(GROUP_SHEET);
  if (!sh) {
    sh = newSheet_(GROUP_SHEET, GROUP_HEADER);
    GROUPS.forEach(function (g) { sh.appendRow([g]); });
  }
  return sh;
}

// 总任务：预期总时长 + 已花时长 + 完成度，按名字和每日任务对上
function projSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PROJ_SHEET);
  if (!sh) sh = newSheet_(PROJ_SHEET, PROJ_HEADER);
  var names = head_(sh);
  var rows = sh.getMaxRows() - 1;
  var group = names.indexOf('Group') + 1;
  if (group) {
    sh.getRange(2, group, rows, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInRange(groupSheet_().getRange('A2:A200'), true).build());
  }
  var status = names.indexOf('Status') + 1;
  if (status) sh.getRange(2, status, rows, 1).setDataValidation(list_(PROJ_STATUS));
  var progress = names.indexOf('Progress') + 1;
  if (progress) sh.getRange(2, progress, rows, 1).setNumberFormat('0%');
  return sh;
}

function cols_(header) {
  var names = header.map(function (h) { return String(h).trim(); });
  var c = {};
  for (var k in COLS) {
    c[k] = names.indexOf(COLS[k]);
    if (c[k] < 0) return { error: 'Tasks sheet has no "' + COLS[k] + '" column' };
  }
  for (var o in OPT) c[o] = names.indexOf(OPT[o]);
  return c;
}

function pcols_(header) {
  var names = header.map(function (h) { return String(h).trim(); });
  var c = { project: names.indexOf('Project'), planned: names.indexOf('Planned min'),
            spent: names.indexOf('Spent min'), progress: names.indexOf('Progress') };
  for (var k in c) if (c[k] < 0) return { error: 'Projects sheet has no "' + k + '" column' };
  return c;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 表格会把手填或写入的 2026-09-12 自动识别成日期，读出来是 Date 对象；
// 统一转回 yyyy-MM-dd 再比较，否则永远对不上
function day_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return String(v).trim();
}

// 一行任务算多少分钟：填了实际时长按实际；没填的 Done 按预计；其余不算
function minutes_(row, c) {
  var actual = c.actual >= 0 ? Number(row[c.actual]) : 0;
  if (actual > 0) return actual;
  return /^(done|ok|完成)$/i.test(String(row[c.result]).trim()) ? (Number(row[c.est]) || 0) : 0;
}

// 每日任务的 Task 和 Projects 里的 Project 完全一致（首尾空格忽略）时，这件任务的时间计入该 Project
function recount_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pj = ss.getSheetByName(PROJ_SHEET);
  var sh = ss.getSheetByName(SHEET);
  if (!pj || !sh) return;
  var pdata = pj.getDataRange().getValues();
  var pc = pcols_(pdata[0]);
  if (pc.error) return;
  var data = sh.getDataRange().getValues();
  var c = cols_(data[0]);
  if (c.error) return;

  var spent = {};
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][c.task]).trim();
    if (name) spent[name] = (spent[name] || 0) + minutes_(data[i], c);
  }
  for (var r = 1; r < pdata.length; r++) {
    var p = String(pdata[r][pc.project]).trim();
    if (!p) continue;
    var min = spent[p] || 0;
    var planned = Number(pdata[r][pc.planned]) || 0;
    pj.getRange(r + 1, pc.spent + 1).setValue(min);
    pj.getRange(r + 1, pc.progress + 1).setValue(planned > 0 ? min / planned : '');
  }
}

// 某天可用的分钟数；同一天填了多行取最下面那行，没填返回 null（页面用 Settings 里的默认值）
function cap_(date, tz) {
  var data = capSheet_().getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (day_(data[i][0], tz) === date && Number(data[i][1]) > 0) return Number(data[i][1]);
  }
  return null;
}

// 读回某一天：GET …/exec?date=2026-09-12&secret=xxx
function doGet(e) {
  if (e.parameter.secret !== SECRET) return json_({ error: 'denied' });
  var date = e.parameter.date;
  var sh = sheet_();
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var data = sh.getDataRange().getValues();
  var c = cols_(data[0]);
  if (c.error) return json_(c);
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var d = data[i];
    if (day_(d[c.date], tz) !== date || String(d[c.task]).trim() === '') continue;
    rows.push({
      task: String(d[c.task]).trim(), est_min: d[c.est], seq: d[c.seq],
      category: c.cat >= 0 ? String(d[c.cat]).trim() : '',
      desc: c.desc >= 0 ? String(d[c.desc]) : '',
      reason: c.reason >= 0 ? String(d[c.reason]) : '',
      actual: c.actual >= 0 ? d[c.actual] : '',
      done_seq: d[c.doneSeq], result: String(d[c.result]).trim(),
      _k: Number(d[c.seq]) || 1e6 + i
    });
  }
  // 按 Order 排；没填的按表里的行顺序排在后面
  rows.sort(function (a, b) { return a._k - b._k; });
  rows.forEach(function (r) { delete r._k; });
  return json_({ date: date, cap: cap_(date, tz), rows: rows });
}

// 写入某一天：手机只回写 Status、Done order，以及在手机上改过的 Reason / Description / Actual min，
// 写在原来那行；计划相关的列以表为准。手机上新加的追加到末尾，removed 里的删掉。
// 按 Task 对行，同名的按先后一一对上
function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) return json_({ error: 'denied' });
  // 还没刷新的旧版页面发来的是旧格式，直接不写，免得把表里的 Status 清空
  if (body.removed === undefined) return json_({ error: 'old page' });

  var sh = sheet_();
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var data = sh.getDataRange().getValues();
  var c = cols_(data[0]);
  if (c.error) return json_(c);

  var mine = [];
  for (var i = 1; i < data.length; i++) {
    if (day_(data[i][c.date], tz) === body.date) mine.push(i);
  }
  function take(task) {
    for (var k = 0; k < mine.length; k++) {
      if (mine[k] >= 0 && String(data[mine[k]][c.task]).trim() === String(task).trim()) {
        var row = mine[k];
        mine[k] = -1;
        return row;
      }
    }
    return -1;
  }
  function text_(row, col, value) {          // 纯文本写入，别被当成公式
    sh.getRange(row, col + 1).setNumberFormat('@').setValue(value);
  }

  var added = [];
  (body.rows || []).forEach(function (r) {
    var i = take(r.task);
    if (i < 0) { added.push(r); return; }
    sh.getRange(i + 1, c.result + 1).setValue(r.result);
    sh.getRange(i + 1, c.doneSeq + 1).setValue(r.done_seq);
    if (r.desc !== undefined && c.desc >= 0) text_(i + 1, c.desc, r.desc);
    if (r.reason !== undefined && c.reason >= 0) text_(i + 1, c.reason, r.reason);
    if (r.actual !== undefined && c.actual >= 0) sh.getRange(i + 1, c.actual + 1).setValue(r.actual);
  });

  var gone = [];
  (body.removed || []).forEach(function (task) {
    var i = take(task);
    if (i >= 0) gone.push(i);
  });
  gone.sort(function (a, b) { return b - a; });
  gone.forEach(function (i) { sh.deleteRow(i + 1); });

  added.forEach(function (r) {
    var row = [];
    for (var k = 0; k < data[0].length; k++) row.push('');
    row[c.date] = body.date;
    row[c.task] = r.task;
    row[c.est] = r.est_min;
    row[c.result] = r.result;
    row[c.doneSeq] = r.done_seq;
    if (c.actual >= 0 && r.actual !== undefined) row[c.actual] = r.actual;
    sh.appendRow(row);
    if (r.desc && c.desc >= 0) text_(sh.getLastRow(), c.desc, r.desc);
    if (r.reason && c.reason >= 0) text_(sh.getLastRow(), c.reason, r.reason);
  });

  try { recount_(); } catch (err) {}   // Projects 出问题也不能影响同步
  return json_({ ok: true, count: (body.rows || []).length });
}
