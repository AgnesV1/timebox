// 每天的打分（js/scores.js）：存在 Settings 里一天一行，score:2026-10-16 = { date, v: { 列: 数 }, note }，列按表头去空格、转小写。
// 有哪几列、每列几档是 Settings 的 scores = { text, from }，自己在 Settings 页写的。
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样（读、写、撤销）。

import * as SC from "../scores.js";

export default function (core) {
  const { entries, put, drop, change, memo, setting } = core;

  const SCORE_RE = /^score:(\d{4}-\d{2}-\d{2})$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // { "2026-10-16": { date, v, note } }
  const scores = () => memo("scores", () => {
    const out = {};
    for (const [key, r] of entries("settings")) {
      const m = SCORE_RE.exec(key);
      if (m && r.value && typeof r.value === "object") out[m[1]] = { date: m[1], v: { ...(r.value.v || {}) }, note: String(r.value.note || "") };
    }
    return out;
  });
  const scoreOf = (date) => scores()[date] || null;
  const scoreSetup = () => memo("scoreSetup", () => SC.setup(setting("scores", null)));
  // 季度表要写的格子：{ 日期: { 列: 数, note: 字 } }，只算 Settings 里现在还有的列
  const scoreCells = () => memo("scoreCells", () => {
    const keys = new Set(scoreSetup().defs.map((d) => d.key));
    return Object.fromEntries(Object.values(scores()).map((r) => [r.date, SC.cellsOf(r, keys)]));
  });

  // 改一天：数和 note 都空了就整行删掉（不弹撤销，点错了再点一下就是）
  function edit(date, fn) {
    if (!DATE_RE.test(String(date))) return;
    const cur = scoreOf(date), next = { v: { ...(cur?.v || {}) }, note: cur?.note || "" };
    fn(next);
    const id = "score:" + date, empty = !Object.keys(next.v).length && !next.note;
    if (empty && !cur) return;
    if (cur && JSON.stringify(next) === JSON.stringify({ v: cur.v, note: cur.note })) return;
    change(() => {
      if (empty) drop("settings", id);
      else put("settings", { id, key: id, value: { date, v: next.v, ...(next.note ? { note: next.note } : {}) } });
    });
  }

  // n = 数（0 也算）；null / 空 = 清掉这一格
  function setScore(date, key, n) {
    const k = SC.keyOf(key), x = n === null || n === "" || n === undefined ? null : Number(n);
    if (!k || (x !== null && !(isFinite(x) && x >= 0))) return;
    edit(date, (r) => { if (x === null) delete r.v[k]; else r.v[k] = Math.round(x * 100) / 100; });
  }

  function setScoreNote(date, text) {
    edit(date, (r) => { r.note = String(text || "").replace(/\s+/g, " ").trim().slice(0, SC.NOTE_MAX); });
  }

  return { scores, scoreOf, scoreSetup, scoreCells, setScore, setScoreNote };
}
