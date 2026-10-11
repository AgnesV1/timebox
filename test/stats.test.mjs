import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../js/stats.js";

const TODAY = "2026-10-05";
const ctx = (over = {}) => ({ today: TODAY, projects: [], items: [], tasks: [], capacity: { default: 240, weekly: null, overrides: {} }, log: {}, level: true, ...over });

test("period ranges and the one before", () => {
  assert.deepEqual(S.periodRange("d30", TODAY), { from: "2026-09-06", to: TODAY });
  assert.deepEqual(S.periodRange("week", TODAY), { from: "2026-10-05", to: "2026-10-11" });
  assert.deepEqual(S.periodRange("month", TODAY), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(S.periodRange("year", TODAY), { from: "2026-01-01", to: "2026-12-31" });
  assert.deepEqual(S.previousRange("month", S.periodRange("month", TODAY)), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(S.previousRange("d30", S.periodRange("d30", TODAY)), { from: "2026-08-07", to: "2026-09-05" });
  assert.equal(S.shiftAnchor("month", "2026-01-31", 1), "2026-02-01");
});

test("summary: time, completion, line held, accuracy, projects, reasons", () => {
  const t = (id, date, est, status, extra = {}) => ({ id, date, est, status, ...extra });
  const c = ctx({
    projects: [{ id: "p", name: "Module #4", group: "Main - French", color: "#f0f" }],
    log: { "2026-10-01": { need: 60, projects: { p: 60 } }, "2026-10-02": { need: 60, projects: { p: 60 } } },
    tasks: [
      t("a", "2026-10-01", 60, "done", { actual: 75, projectId: "p", category: "Main" }),
      t("b", "2026-10-01", 30, "partial", { actual: 10, category: "Work", reason: "Meetings " }),
      t("c", "2026-10-02", 40, "later", { category: "Work", reason: "meetings" }),
      t("d", "2026-10-02", 20, "drop", { reason: "Too tired" }),
      t("e", "2026-10-02", 30, "", { optional: true }),
      t("f", "2026-10-06", 45, "")   // 明天的，不算
    ]
  });
  const s = S.summarize(c, "2026-10-01", "2026-10-07");
  assert.equal(s.days, 5);
  assert.equal(s.spent, 85);
  assert.equal(s.done, 1);
  assert.equal(s.counted, 4, "an optional task that wasn't done doesn't count");
  assert.equal(s.held, 1);
  assert.equal(s.lineDays, 2);
  assert.equal(s.accuracy, 1.25);
  assert.equal(s.active, 1);
  assert.deepEqual(s.status, { partial: 1, later: 1, drop: 1 });
  assert.equal(s.reasons[0].count, 2, "same reason, different case and spaces");
  assert.equal(s.reasons[0].text, "Meetings");
  assert.equal(s.byProject[0].name, "Main - French");
  assert.equal(s.byProject[0].spent, 75);
  assert.equal(s.byProject[0].color, "#f0f");
  assert.equal(s.byProject.find((x) => x.name === "").counted, 3, "the dropped one counts, the optional one does not");
  assert.equal(s.daily.length, 7);
  assert.equal(s.daily.find((x) => x.date === "2026-10-06").future, true);
  assert.equal(s.byWeekday[4].avg, 85, "Thursday Oct 1");
});

test("weekly roll-up for the year view", () => {
  const daily = ["2026-09-28", "2026-09-29", "2026-10-05"].map((date) => ({ date, spent: 10, planned: 20, line: 5, future: false }));
  const w = S.weekly(daily, "monday");
  assert.equal(w.length, 2);
  assert.equal(w[0].spent, 20);
});

test("day and custom periods", () => {
  assert.deepEqual(S.periodRange("day", TODAY), { from: TODAY, to: TODAY });
  assert.deepEqual(S.previousRange("day", S.periodRange("day", TODAY)), { from: "2026-10-04", to: "2026-10-04" });
  assert.equal(S.shiftAnchor("day", "2026-10-01", -1), "2026-09-30");
  assert.deepEqual(S.previousRange("custom", { from: "2026-10-01", to: "2026-10-03" }), { from: "2026-09-28", to: "2026-09-30" });
});

const deepCtx = (over = {}) => {
  const t = (id, date, est, extra = {}) => ({ id, date, est, status: "done", ...extra });
  return ctx({
    projects: [
      { id: "r", name: "Reading", group: "IELTS", color: "#f00" },
      { id: "l", name: "Listening", group: "IELTS", color: "#f80" },
      { id: "c", name: "Chores", group: "", color: "#888" }
    ],
    tasks: [
      t("a", "2026-10-02", 60, { actual: 90, projectId: "r", deep: true }),    // 周五
      t("b", "2026-10-03", 30, { projectId: "l", deep: true }),               // 周六：没填实际，按估的算
      t("c", "2026-10-03", 20, { projectId: "c" }),
      t("d", "2026-10-05", 45, { actual: 40 }),                               // 没挂计划
      t("e", "2026-10-05", 60, { status: "", actual: 15, projectId: "r", deep: true })   // 还没标，记了 15 分钟
    ],
    ...over
  });
};

test("deep work: totals, per day, per project, and the daily goal on work days only", () => {
  const c = deepCtx({ life: { deepGoal: 60 }, capacity: { default: 240, weekly: [0, 240, 240, 240, 240, 240, 240], overrides: {} } });
  const s = S.summarize(c, "2026-10-01", "2026-10-05");
  assert.equal(s.spent, 90 + 30 + 20 + 40 + 15);
  assert.equal(s.deep, 90 + 30 + 15);
  assert.equal(s.daily.find((x) => x.date === "2026-10-02").deep, 90);
  assert.equal(s.byProject.find((x) => x.name === "IELTS").deep, 135);
  assert.equal(s.byProject.find((x) => x.name === "").deep, 0);
  assert.equal(s.goal, 60);
  assert.equal(s.goalDays, 4, "Sunday Oct 4 is a rest day, so it doesn't count");
  assert.equal(s.goalHit, 1, "only Friday reached an hour");
  assert.equal(s.daily.find((x) => x.date === "2026-10-04").goal, 0);
  const plans = S.summarize(c, "2026-10-01", "2026-10-05", { by: "plan" });
  assert.deepEqual(plans.byProject.map((x) => x.name), ["Reading", "Listening", "Chores", ""]);
  const none = S.summarize(deepCtx(), "2026-10-01", "2026-10-05");
  assert.equal(none.goal, 0);
  assert.equal(none.goalDays, 0);
});

test("where the time went: 24 hours a day, usual life first, then what was tracked, then the blank", () => {
  const c = deepCtx();
  assert.deepEqual(S.lifeOn(S.lifeOf(c), "2026-10-03"), { sleep: 420, care: 180, chores: 60 }, "Saturday gets half the weekend chores");
  assert.equal(S.lifeOn(S.lifeOf(c), "2026-10-05").chores, 0);
  const s = S.summarize(c, "2026-10-01", "2026-10-07");   // 到今天（10-05）为止 5 天，其中周六周日各一天
  const pie = S.clockPie(c, s);
  assert.equal(pie.total, 5 * 1440);
  const part = (k) => pie.parts.find((x) => x.key === k)?.min;
  assert.equal(part("sleep"), 5 * 420);
  assert.equal(part("care"), 5 * 180);
  assert.equal(part("chores"), 120);
  assert.equal(part("p:IELTS"), 135);
  assert.equal(part("p:"), 40);
  assert.equal(pie.tracked, 195);
  assert.equal(part("blank"), 5 * 1440 - 5 * 600 - 120 - 195);
  assert.equal(pie.parts.reduce((a, x) => a + x.min, 0), pie.total);
  assert.deepEqual(pie.parts.map((x) => x.key), ["sleep", "care", "chores", "p:IELTS", "p:Chores", "p:", "blank"]);
  const only = S.clockPie(c, s, { trackedOnly: true });
  assert.equal(only.total, 195);
  assert.ok(only.parts.every((x) => x.kind === "project" || x.kind === "none"));
  // 只看 IELTS：别的记录合成一片；默认值调得再大，空白也不会是负的
  const ielts = { ...c, tasks: c.tasks.filter((t) => t.projectId === "r" || t.projectId === "l") };
  const f = S.clockPie(ielts, S.summarize(ielts, "2026-10-01", "2026-10-07", { by: "plan" }), { rest: 60 });
  assert.equal(f.parts.find((x) => x.key === "rest").min, 60);
  assert.equal(f.tracked, 195);
  const busy = { ...c, life: { sleep: 1000, care: 440 } };
  assert.equal(S.clockPie(busy, S.summarize(busy, "2026-10-05", "2026-10-05")).blank, 0);
});

test("timesheet: a column per day, week or month depending on how long the period is", () => {
  const c = deepCtx();
  const week = S.sheet(c, "2026-09-28", "2026-10-04");
  assert.equal(week.cols.length, 7);
  assert.equal(week.cols[0].kind, "day");
  const ielts = week.rows.find((r) => r.name === "IELTS");
  assert.deepEqual(ielts.cells, [0, 0, 0, 0, 90, 30, 0]);
  assert.equal(ielts.total, 120);
  assert.deepEqual(week.total, [0, 0, 0, 0, 90, 50, 0]);
  assert.deepEqual(week.deep, [0, 0, 0, 0, 90, 30, 0]);
  assert.equal(week.sum, 140);
  assert.equal(week.deepSum, 120);
  const month = S.sheet(c, "2026-10-01", "2026-10-31");
  assert.deepEqual(month.cols.map((x) => x.kind + " " + x.from + ".." + x.to).slice(0, 2), ["week 2026-10-01..2026-10-04", "week 2026-10-05..2026-10-11"]);
  assert.equal(month.rows[month.rows.length - 1].name, "", "no plan goes last");
  assert.equal(month.cols[2].future, true);
  const year = S.sheet(c, "2026-01-01", "2026-12-31", { by: "plan" });
  assert.equal(year.cols.length, 12);
  assert.equal(year.cols[9].kind, "month");
  assert.equal(year.rows.find((r) => r.name === "Reading").cells[9], 105);
});

test("weekly roll-up carries deep time and the goal", () => {
  const w = S.weekly([{ date: "2026-10-05", spent: 60, deep: 40, planned: 60, line: 0, goal: 60, future: false }, { date: "2026-10-06", spent: 30, deep: 30, planned: 30, line: 0, goal: 60, future: false }], "monday");
  assert.equal(w[0].deep, 70);
  assert.equal(w[0].goal, 120);
});
