// Minimal Google Apps Script mock to exercise Code.gs in Node.
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sh.cell(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  // 表格里显示的那串字（日期照格子的样子 yyyy-mm-dd，不经过时区）
  getDisplayValues() {
    const pad = (n) => String(n).padStart(2, "0");
    return this.getValues().map((row) => row.map((v) => (v instanceof Date ? v.getFullYear() + "-" + pad(v.getMonth() + 1) + "-" + pad(v.getDate()) : v === null || v === undefined ? "" : String(v))));
  }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some((row) => row.length !== this.nc)) throw new Error(`setValues size mismatch ${vals.length}x${vals[0]?.length} vs ${this.nr}x${this.nc}`);
    vals.forEach((row, i) => row.forEach((v, j) => this.sh.check(this.c + j, v)));
    vals.forEach((row, i) => row.forEach((v, j) => this.sh.put(this.r + i, this.c + j, v)));
    return this;
  }
  setValue(v) { this.sh.check(this.c, v); this.sh.put(this.r, this.c, v); return this; }
  // 这一列设了下拉（见 Sheet.dropdown）才有
  getDataValidation() {
    const d = this.sh.lists[this.c];
    return d ? { getCriteriaType: () => "VALUE_IN_LIST", getCriteriaValues: () => [d.list.slice(), true], getAllowInvalid: () => !d.strict } : null;
  }
  getValue() { return this.sh.cell(this.r, this.c); }
  setNumberFormat(f) { for (let j = 0; j < this.nc; j++) this.sh.fmt[this.c + j] = f; return this; }
  setDataValidation() { return this; }
  clearDataValidations() { return this; }
}

class Sheet {
  constructor(ss, name, rows = 1000, cols = 26) { this.ss = ss; this.name = name; this.rows = Array.from({ length: rows }, () => Array(cols).fill("")); this.cols = cols; this.fmt = {}; this.hidden = new Set(); this.lists = {}; }
  getName() { return this.name; }
  getSheetId() { return this.ss.sheets.indexOf(this) * 1000; }
  setName(n) { this.name = n; return this; }
  cell(r, c) { if (r > this.rows.length || c > this.cols) throw new Error(`read out of bounds ${r},${c} in ${this.name}`); return this.rows[r - 1][c - 1]; }
  put(r, c, v) {
    if (r > this.rows.length || c > this.cols) throw new Error(`write out of bounds ${r},${c} in ${this.name} (max ${this.rows.length}x${this.cols})`);
    if (typeof v === "string" && v.startsWith("'")) v = v.slice(1);
    else if (typeof v === "string" && ISO.test(v) && this.fmt[c] !== "@") { const [y, m, d] = v.split("-").map(Number); v = new Date(y, m - 1, d); }
    this.rows[r - 1][c - 1] = v;
  }
  getMaxRows() { return this.rows.length; }
  getMaxColumns() { return this.cols; }
  getLastRow() { for (let i = this.rows.length - 1; i >= 0; i--) if (this.rows[i].some((v) => v !== "")) return i + 1; return 0; }
  getLastColumn() { let m = 0; this.rows.forEach((r) => r.forEach((v, j) => { if (v !== "" && j + 1 > m) m = j + 1; })); return m; }
  getRange(r, c, nr = 1, nc = 1) { if (typeof r === "string") return new Range(this, 2, 1, 1, 1); return new Range(this, r, c, nr, nc); }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  insertColumnBefore(c) { this.rows.forEach((r) => r.splice(c - 1, 0, "")); this.cols++; this.shiftFmt(c, 1); }
  insertColumnAfter(c) { this.rows.forEach((r) => r.splice(c, 0, "")); this.cols++; this.shiftFmt(c + 1, 1); }
  deleteColumn(c) { this.rows.forEach((r) => r.splice(c - 1, 1)); this.cols--; }
  shiftFmt(from, n) { const f = {}; Object.entries(this.fmt).forEach(([k, v]) => { k = Number(k); f[k >= from ? k + n : k] = v; }); this.fmt = f; }
  deleteRow(r) { this.rows.splice(r - 1, 1); this.rows.push(Array(this.cols).fill("")); }
  deleteRows(r, n) { for (let k = 0; k < n; k++) this.deleteRow(r); }
  insertRowsAfter(r, n) { this.rows.splice(r, 0, ...Array.from({ length: n }, () => Array(this.cols).fill(""))); }
  moveColumns(range, dest) {
    const c = range.c;
    this.rows.forEach((row) => { const v = row.splice(c - 1, 1)[0]; row.splice(dest > c ? dest - 2 : dest - 1, 0, v); });
  }
  setFrozenRows() { return this; }
  hideSheet() { this.sheetHidden = true; return this; }
  isSheetHidden() { return Boolean(this.sheetHidden); }
  hideColumns(c) { this.hidden.add(c); }
  copyTo(ss) { const s = new Sheet(ss, "Copy of " + this.name); s.rows = this.rows.map((r) => r.slice()); s.cols = this.cols; ss.sheets.push(s); return s; }
  // test helpers
  // 给一列设下拉：strict = 不在选项里的值写不进去（和真表格的「拒绝输入」一样）
  dropdown(c, list, strict = true) { this.lists[c] = { list, strict }; return this; }
  check(c, v) {
    const d = this.lists[c];
    if (d && d.strict && v !== "" && !d.list.some((x) => String(x) === String(v))) throw new Error("The data that you entered violates the data validation rules set on this cell.");
  }
  header() { return this.rows[0].filter((v) => v !== ""); }
  objects() {
    const h = this.rows[0];
    return this.rows.slice(1, this.getLastRow()).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]).filter(([k]) => k !== "")));
  }
}

class Spreadsheet {
  constructor(name = "Untitled") { this.sheets = []; this.name = name; }
  getName() { return this.name; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(this, n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets; }
  deleteSheet(sh) { this.sheets = this.sheets.filter((s) => s !== sh); }
  getSpreadsheetTimeZone() { return "America/Toronto"; }
}

// ss：接着用另一份 Code.gs 留下的表（测从上一版升级）
export function load(codePath, ss = new Spreadsheet()) {
  const others = {};   // openByUrl 能打开的别的表格：url → Spreadsheet
  const byUrl = (url) => { const k = Object.keys(others).find((u) => String(url).startsWith(u)); if (!k) throw new Error("Spreadsheet not found"); return others[k]; };
  const logs = [];
  const props = {};   // Script Properties
  const pad = (n) => String(n).padStart(2, "0");
  const validation = { requireValueInList() { return this; }, requireValueInRange() { return this; }, build() { return {}; } };
  const sandbox = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openByUrl: byUrl, openById: (id) => byUrl(Object.keys(others).find((u) => u.includes("/d/" + id)) || "?"), flush() {}, newDataValidation: () => Object.create(validation) },
    Utilities: { getUuid: () => crypto.randomUUID(), formatDate: (d, tz, f) => (f === "HH:mm" ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: (k) => { delete props[k]; } }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }) },
    Logger: { log: (m) => logs.push(m) },
    Date, JSON, Math, Object, String, Number, isNaN, console
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(codePath, "utf8"), sandbox);
  const post = (body) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify({ version: sandbox.VERSION || 6, ...body }) } }).getContent());
  // 测试用：再开一个表格（比如阅读记录），网页里填它的链接
  const spreadsheet = (url) => (others[url] = others[url] || new Spreadsheet());
  return { ss, sandbox, logs, post, spreadsheet };
}
