// 粘贴到 Google Sheet 的 扩展程序 → Apps Script
// 改掉下面这行的口令，然后和网页 Settings 里的 Secret 填成一样的

var SECRET = 'CHANGE_ME';
var SHEET  = '任务';
var HEADER = ['日期', '任务内容', '任务描述', '预计完成时间（分钟）', '实际时长（分钟）', '拟定顺序', '分类', '审核', '是否完成', '实际次序（自动）'];
var CATEGORIES = ['主线', '工作', '娱乐', '琐事'];
// 同步用到的列按表头文字找，所以列可以挪位置、中间也能插自己的列（审核只给人看，脚本不读不写；分类、任务描述、实际时长可以没有）
var COLS = { date: '日期', task: '任务内容', est: '预计完成时间（分钟）', seq: '拟定顺序',
             result: '是否完成', doneSeq: '实际次序（自动）' };
// 每天可用的分钟数，一天一行
var CAP_SHEET  = '每日时长';
var CAP_HEADER = ['日期', '可用时长（分钟）'];

// 第一次用：在编辑器顶部选 setup 点「运行」，建好「任务」「每日时长」两页并完成授权；
// 以后更新了代码再运行一次：刷新分类下拉、给老表补上缺的「任务描述」「实际时长（分钟）」列
function setup() {
  var sh = sheet_();
  var names = sh.getDataRange().getValues()[0].map(function (h) { return String(h).trim(); });
  ['任务描述', '实际时长（分钟）'].forEach(function (h) {
    if (names.indexOf(h) < 0) {
      sh.getRange(1, names.length + 1).setValue(h);   // 补在最后一列，可以再拖到任何位置
      names.push(h);
    }
  });
  // 描述设成纯文本，免得「- 第一步」这种开头被当成公式
  sh.getRange(2, names.indexOf('任务描述') + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  var col = names.indexOf('分类') + 1;
  if (col) {
    sh.getRange(2, col, sh.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(CATEGORIES, true).build());
  }
  capSheet_();
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
    sh.getRange(2, HEADER.indexOf('日期') + 1, sh.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');
  }
  return sh;
}

function capSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CAP_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CAP_SHEET);
    sh.appendRow(CAP_HEADER);
    sh.setFrozenRows(1);
    sh.getRange(2, 1, sh.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');
  }
  return sh;
}

function cols_(header) {
  var names = header.map(function (h) { return String(h).trim(); });
  var c = {};
  for (var k in COLS) {
    c[k] = names.indexOf(COLS[k]);
    if (c[k] < 0) return { error: '表头缺少「' + COLS[k] + '」' };
  }
  c.cat = names.indexOf('分类');   // 可以没有
  c.desc = names.indexOf('任务描述');
  c.actual = names.indexOf('实际时长（分钟）');
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
      actual: c.actual >= 0 ? d[c.actual] : '',
      done_seq: d[c.doneSeq], result: String(d[c.result]).trim(),
      _k: Number(d[c.seq]) || 1e6 + i
    });
  }
  // 按拟定顺序排；没填顺序的按表里的行顺序排在后面
  rows.sort(function (a, b) { return a._k - b._k; });
  rows.forEach(function (r) { delete r._k; });
  return json_({ date: date, cap: cap_(date, tz), rows: rows });
}

// 写入某一天：手机只回写「是否完成」「实际次序」和手机上改过的「任务描述」「实际时长」，写在原来那行；计划相关的列以表为准。
// 手机上新加的追加到末尾，removed 里的删掉。按任务内容对行，同名的按先后一一对上
function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) return json_({ error: 'denied' });
  // 还没刷新的旧版页面发来的是旧格式，直接不写，免得把表里的「是否完成」清空
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

  var added = [];
  (body.rows || []).forEach(function (r) {
    var i = take(r.task);
    if (i < 0) { added.push(r); return; }
    sh.getRange(i + 1, c.result + 1).setValue(r.result);
    sh.getRange(i + 1, c.doneSeq + 1).setValue(r.done_seq);
    if (r.desc !== undefined && c.desc >= 0) sh.getRange(i + 1, c.desc + 1).setNumberFormat('@').setValue(r.desc);
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
    if (r.desc && c.desc >= 0) sh.getRange(sh.getLastRow(), c.desc + 1).setNumberFormat('@').setValue(r.desc);
  });
  return json_({ ok: true, count: (body.rows || []).length });
}
