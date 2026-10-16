// 每天的打分：季度表那一行里 progress / focus 后面那几列，没法自动算，每天在电脑的今天页上点一点、敲一敲（js/ui/scores.js）。
// 有哪几列、每列有哪几档，是自己在 Settings 里写的一段文字（Settings 的 scores = { text, from }），代码里不写具体的列；
// 每天填的数存在 Settings 里一天一行（score:日期，见 js/store/scores.js），同步时写进季度表那一天那一行（js/sync.js 的 quarter）。
//
// 那段文字一行一列，各段用 · 或 | 隔开：表头原名 · 它是什么意思（可省）· 平常的范围 a–b（可省，省了就取最小到最大那档）· 再往后一段一档「数字 + 几个字」
//   gym · moving · 3–15 · 3 stayed in · 5 usual · 8 walk out
// 列名按「去空格、转小写」对表头（Code.gs 那边一样），所以大小写、空格对不齐也认得。note 那一列是底下单独那一格，不能当打分的列。

export const NOTE = "note";
export const NOTE_MAX = 200;

const NUM = "(\\d+(?:\\.\\d+)?)";
const RANGE_RE = new RegExp("^" + NUM + "\\s*[-–—~]\\s*" + NUM + "$");
const CHOICE_RE = new RegExp("^" + NUM + "\\s+(\\S.*)$");

export const keyOf = (col) => String(col ?? "").replace(/\s+/g, "").toLowerCase();

// → { defs: [{ col, key, means, lo, hi, choices: [{ n, label }] }], bad: [行号] }。空行跳过；没有列名、列名重了、叫 note 的行算坏行
export function parse(text) {
  const defs = [], bad = [], seen = new Set();
  String(text || "").split(/\r?\n/).forEach((line, i) => {
    const parts = line.split(/[·|]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const col = parts[0], key = keyOf(col);
    if (!key || /^\d/.test(col) || key === NOTE || seen.has(key)) { bad.push(i + 1); return; }
    seen.add(key);
    let means = "", lo = null, hi = null;
    const choices = [];
    for (const p of parts.slice(1)) {
      const r = RANGE_RE.exec(p), c = CHOICE_RE.exec(p);
      if (r && lo === null) { lo = Math.min(Number(r[1]), Number(r[2])); hi = Math.max(Number(r[1]), Number(r[2])); }
      else if (c) choices.push({ n: Number(c[1]), label: c[2] });
      else if (!means && !choices.length && !/^\d/.test(p)) means = p;
    }
    if (lo === null && choices.length) { const ns = choices.map((c) => c.n); lo = Math.min(...ns); hi = Math.max(...ns); }
    defs.push({ col, key, means, lo, hi, choices });
  });
  return { defs, bad };
}

// Settings 的 scores（{ text, from }）→ { text, from, defs, bad }
export function setup(raw) {
  const text = String(raw?.text || ""), from = /^\d{4}-\d{2}-\d{2}$/.test(String(raw?.from || "")) ? raw.from : "";
  return { text, from, ...parse(text) };
}

// 空着的格子里的灰字
export const rangeText = (def) => (def.lo === null ? "" : def.lo === def.hi ? String(def.lo) : def.lo + "–" + def.hi);

// 这一天要不要打分：从开始日到今天（以后的日子还没到；开始日以前的是自己在表里填的）
export const inRange = (set, date, today) => Boolean(set.defs.length && set.from && date >= set.from && date <= today);

// 几列是不是都有数了（note 不算）
export const filled = (defs, v) => defs.length > 0 && defs.every((d) => typeof v?.[d.key] === "number");

// 日历上标红点：开始日以后、已经过完、还没填满的日子（今天还没过完，不标）
export const unscored = (set, rec, date, today) => inRange(set, date, today) && date < today && !filled(set.defs, rec?.v);

// 一天存下来的样子（{ v, note }）→ 季度表那一行要写的格子 { 列: 数 | note 的字 }。
// keys = 现在 Settings 里还有的那几列：从那段字里删掉的列，以前打的分留着（加回来还在），但不再往表格里写
export function cellsOf(rec, keys = null) {
  const out = {};
  for (const [k, n] of Object.entries(rec?.v || {})) if (typeof n === "number" && isFinite(n) && (!keys || keys.has(k))) out[k] = n;
  const note = String(rec?.note || "").trim();
  if (note) out[NOTE] = note;
  return out;
}

// 和上次写进表格的比：改了的、新的照发；上次写过、现在清掉的发 ""（表格那边清空那一格）。没有要发的 → null。
// keys = 现在还有的列（加上 note）：从 Settings 里拿掉的列只是不管了，绝不去清表格里那一格（别的设备改了 Settings 也一样）
export function cellsToSend(cur, sent, keys = null) {
  const out = {};
  for (const [k, v] of Object.entries(cur || {})) if (sent?.[k] !== v) out[k] = v;
  for (const k of Object.keys(sent || {})) if (!(k in (cur || {})) && (!keys || keys.has(k))) out[k] = "";
  return Object.keys(out).length ? out : null;
}
