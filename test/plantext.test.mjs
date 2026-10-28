import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "../js/plantext.js";

// 编的样例，形状和她那种长计划一样（一次性、每天 ×N、标题里写次数的带步骤那项、计次池 + 每周量、储备、规则和流程）
const SAMPLE = `# 法语 B2 · 30 天计划

- 目标：一次考到 B2
- 周期：30 天（2026-11-02 至 2026-12-01）

## 阶段

| 阶段 | 天数 |
|---|---|
| 打底 | 第 1–5 天 |

## 一次性任务

- [ ] 报名考试，查清改期规则 · 30min · 第 1–2 天
- [ ] G1 语法总表 · 2h · 第 1 周
- [ ] E1 错题统计 #1 · 30min · 第 4 套之后

## 每日任务

- [ ] V1 单词 · 20min · 每天，共 30 次

## 周末任务：模拟考 + 复盘（×4，约 3h / 次）

日期：11/07–08、11/14–15

- [ ] 模拟考 #N
  - [ ] 听力 · 30min
  - [ ] 阅读 · 1h
  - [ ] 复盘 · 1h45min

模拟考第一次顺便当诊断。

## 工作日任务池（轮换）

- [ ] L1 听力套题 + 复盘 · 1.5h · ×8
- [ ] W1 作文提纲 · 8min · ×30
- [ ] Shadowing · 20 minutes · any

每周大致量：L1 ×2、W1 ×6

## 储备任务（第二次考试前用）

- [ ] L1 听力套题 · 1.5h · ×3（换新题库）

## Rules

Pick two a day at most.

### Listening review
1. Mark answers
2. Listen again
`;

test("durations both ways", () => {
  assert.equal(T.parseDur("30min"), 30);
  assert.equal(T.parseDur("1h45min"), 105);
  assert.equal(T.parseDur("1.5h"), 90);
  assert.equal(T.parseDur("2 hours"), 120);
  assert.equal(T.parseDur("45分钟"), 45);
  assert.equal(T.parseDur("2小时"), 120);
  assert.equal(T.parseDur("35m"), 35);
  assert.equal(T.parseDur("第 1 周"), null);
  assert.equal(T.parseDur(""), null);
  for (const m of [8, 30, 60, 90, 105, 455]) assert.equal(T.parseDur(T.fmtDur(m)), m);
});

test("one line: name, minutes, times, a week, the rest is a note", () => {
  assert.deepEqual(T.parseLine("L3 Listening set · 2h · ×11"), { title: "L3 Listening set", est: 120, n: 11, perWeek: null, note: "", code: "L3" });
  assert.deepEqual(T.parseLine("V1 单词 · 20min · 每天，共 30 次"), { title: "V1 单词", est: 20, n: 30, perWeek: null, note: "每天，共 30 次", code: "V1" });
  assert.deepEqual(T.parseLine("Gym · any · 2/week"), { title: "Gym", est: null, n: 0, perWeek: 2, note: "", code: "" });
  assert.deepEqual(T.parseLine("S2 loop · 1h · ×6（new topics）"), { title: "S2 loop", est: 60, n: 6, perWeek: null, note: "（new topics）", code: "S2" });
  assert.equal(T.parseLine("Mock test #N").title, "Mock test", "the #N placeholder goes");
  // 「•」（Mac 上 ⌥8）、「・」也当分隔的点；x12 也是次数
  assert.deepEqual(T.parseLine("L4 listening error stats • 30min • ×3"), { title: "L4 listening error stats", est: 30, n: 3, perWeek: null, note: "", code: "L4" });
  assert.deepEqual(T.parseLine("S2 speaking Part 1・15min・x12"), { title: "S2 speaking Part 1", est: 15, n: 12, perWeek: null, note: "", code: "S2" });
  assert.equal(T.parseLine("E1 错题统计 #1 · 30min").title, "E1 错题统计 #1", "a real number stays");
});

test("a whole plan: sections, items, steps, weekly amounts, later, notes", () => {
  const p = T.parse(SAMPLE);
  assert.equal(p.name, "法语 B2 · 30 天计划");
  assert.deepEqual([p.start, p.end], ["2026-11-02", "2026-12-01"]);
  assert.deepEqual(p.sections.map((s) => s.name + (s.later ? "*" : "")), ["一次性任务", "每日任务", "周末任务", "工作日任务池", "储备任务*"], "headings cut at the first ： or （; only sections with items; reserve starts as Later");
  const [once, daily, weekend, pool, reserve] = p.sections;
  assert.deepEqual(once.items.map((i) => [i.title, i.est, i.n, i.note]), [["报名考试，查清改期规则", 30, 1, "第 1–2 天"], ["G1 语法总表", 120, 1, "第 1 周"], ["E1 错题统计 #1", 30, 1, "第 4 套之后"]]);
  assert.deepEqual([daily.items[0].n, daily.items[0].est], [30, 20]);
  const mock = weekend.items[0];
  assert.deepEqual([mock.title, mock.n, mock.est], ["模拟考", 4, 195], "×4 comes from the heading; minutes add up from the steps");
  assert.deepEqual(mock.steps, [{ t: "听力", min: 30 }, { t: "阅读", min: 60 }, { t: "复盘", min: 105 }]);
  assert.deepEqual(pool.items.map((i) => [i.code, i.n, i.perWeek]), [["L1", 8, 2], ["W1", 30, 6], ["", 0, 0]], "weekly amounts by code, only in their own section");
  assert.deepEqual([reserve.items[0].perWeek, reserve.items[0].n, reserve.items[0].note], [0, 3, "（换新题库）"]);
  assert.match(p.notes, /^- 目标：一次考到 B2/);
  assert.match(p.notes, /## 阶段\n\| 阶段 \| 天数 \|/);
  assert.match(p.notes, /## 周末任务：模拟考 \+ 复盘（×4，约 3h \/ 次）\n日期：11\/07–08、11\/14–15\n\n模拟考第一次顺便当诊断。/, "lines around the items stay in the notes under their heading");
  assert.match(p.notes, /## Rules\nPick two a day at most\.\n\n### Listening review\n1\. Mark answers/);
  assert.doesNotMatch(p.notes, /## 一次性任务/, "sections with nothing but items add no heading to the notes");
});

test("summary: hours times counts, later apart", () => {
  const s = T.summary(T.parse(SAMPLE));
  assert.equal(s.min, 30 + 120 + 30 + 20 * 30 + 195 * 4 + 90 * 8 + 8 * 30 + 20);
  assert.equal(s.later, 90 * 3);
  assert.deepEqual(s.sections.map((x) => [x.count, x.times]), [[3, 3], [1, 30], [1, 4], [3, 38], [1, 3]]);
});

test("written back as text, it reads the same", () => {
  const p = T.parse(SAMPLE);
  const again = T.parse(T.format(p));
  assert.deepEqual(again.sections, p.sections);
  assert.equal(again.notes, p.notes);
  assert.deepEqual([again.name, again.start, again.end], [p.name, p.start, p.end]);
  const custom = { name: "Swim", notes: "", sections: [{ name: "Drills", later: true, items: [{ title: "Kick sets", est: 25, n: 0, perWeek: 1, steps: [], note: "fins", code: "" }] }] };
  assert.deepEqual(T.parse(T.format(custom)).sections, custom.sections, "a section turned to Later by hand gets (later) after its name");
});

test("pasting back: matched by name, then by a code used once", () => {
  const old = [{ id: "a", title: "L3 Listening set" }, { id: "b", title: "W1 outline" }, { id: "c", title: "Book the exam" }, { id: "d", title: "S2 loop" }, { id: "e", title: "S2 loop (reserve)" }];
  const parsed = [{ title: "L3 Listening set + review", code: "L3" }, { title: "Book the exam" }, { title: "Score sheet" }, { title: "S2 loop v2", code: "S2" }, { title: "S2 again", code: "S2" }];
  const m = T.match(parsed, old);
  assert.deepEqual(m.pairs.map(([n, o]) => n.title + "=" + o.id), ["Book the exam=c", "L3 Listening set + review=a"]);
  assert.deepEqual(m.added.map((x) => x.title), ["Score sheet", "S2 loop v2", "S2 again"], "a code used twice on either side doesn't match");
  assert.deepEqual(m.gone.map((x) => x.id), ["b", "d", "e"]);
});
