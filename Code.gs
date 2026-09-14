// 粘贴到 Google Sheet 的 扩展程序 → Apps Script
// 改掉下面这行的口令，然后和网页设置里的「口令」填成一样的

var SECRET = 'CHANGE_ME';
var SHEET  = '任务';
var HEADER = ['日期', '任务内容', '预计完成时间（分钟）', '拟定顺序', '分类', '审核', '是否完成', '实际次序（自动）'];
var CATEGORIES = ['必须', '主线', '享乐', '琐碎', '其他'];
// 同步用到的列按表头文字找，所以列可以挪位置、中间也能插自己的列（分类、审核只给人看，脚本不读不写）
var COLS = { date: '日期', task: '任务内容', est: '预计完成时间（分钟）', seq: '拟定顺序',
             result: '是否完成', doneSeq: '实际次序（自动）' };

// 第一次用：在编辑器顶部选 setup 点「运行」，建好「任务」表并完成授权
function setup() {
  sheet_();
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
    var n = sh.getMaxRows() - 1;
    sh.getRange(2, HEADER.indexOf('日期') + 1, n, 1).setNumberFormat('yyyy-mm-dd');
    sh.getRange(2, HEADER.indexOf('分类') + 1, n, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(CATEGORIES, true).build());
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
      done_seq: d[c.doneSeq], result: String(d[c.result]).trim(),
      _k: Number(d[c.seq]) || 1e6 + i
    });
  }
  // 按拟定顺序排；没填顺序的按表里的行顺序排在后面
  rows.sort(function (a, b) { return a._k - b._k; });
  rows.forEach(function (r) { delete r._k; });
  return json_({ date: date, rows: rows });
}

// 写入某一天：手机只回写「是否完成」「实际次序」，写在原来那行；计划相关的列以表为准。
// 手机上新加的追加到末尾，手机上 ✕ 掉的删掉。按任务内容对行，同名的按先后一一对上
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
    sh.appendRow(row);
  });
  return json_({ ok: true, count: (body.rows || []).length });
}
