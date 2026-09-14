// 粘贴到 Google Sheet 的 扩展程序 → Apps Script
// 改掉下面这行的口令，然后和网页设置里的「口令」填成一样的

var SECRET = 'CHANGE_ME';
var SHEET  = 'log';
var HEADER = ['date','seq','done_seq','task','est_min','status','reason','note'];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 读回某一天：GET …/exec?date=2026-09-12&secret=xxx
function doGet(e) {
  if (e.parameter.secret !== SECRET) return json_({ error: 'denied' });
  var date = e.parameter.date;
  var sh = sheet_();
  var data = sh.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== date) continue;
    var o = {};
    HEADER.forEach(function (h, k) { o[h] = data[i][k]; });
    rows.push(o);
  }
  rows.sort(function (a, b) { return a.seq - b.seq; });
  return json_({ date: date, rows: rows });
}

// 写入某一天：整天覆盖，先删旧行再写新行，不会重复
function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) return json_({ error: 'denied' });

  var sh = sheet_();
  var data = sh.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === body.date) sh.deleteRow(i + 1);
  }
  if (body.rows && body.rows.length) {
    var out = body.rows.map(function (r) {
      return [body.date, r.seq, r.done_seq, r.task, r.est_min,
              r.status, r.reason, r.note];
    });
    sh.getRange(sh.getLastRow() + 1, 1, out.length, HEADER.length).setValues(out);
  }
  return json_({ ok: true, count: (body.rows || []).length });
}
