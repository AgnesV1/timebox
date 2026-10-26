import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../js/stats.js";

const TODAY = "2026-10-05";
const ctx = (over = {}) => ({ today: TODAY, projects: [], items: [], tasks: [], capacity: { default: 240, weekly: null, overrides: {} }, log: {}, level: true, ...over });

test("period ranges and the one before", () => {
  assert.deepEqual(S.periodRange("season", TODAY), { from: "2026-10-01", to: "2026-12-31" });
  assert.deepEqual(S.periodRange("season", "2027-02-14"), { from: "2027-01-01", to: "2027-03-31" });
  assert.deepEqual(S.periodRange("week", TODAY), { from: "2026-10-05", to: "2026-10-11" });
  assert.deepEqual(S.periodRange("month", TODAY), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(S.periodRange("year", TODAY), { from: "2026-01-01", to: "2026-12-31" });
  assert.deepEqual(S.previousRange("month", S.periodRange("month", TODAY)), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(S.previousRange("season", S.periodRange("season", TODAY)), { from: "2026-07-01", to: "2026-09-30" });
  assert.equal(S.shiftAnchor("season", "2026-11-20", 1), "2027-02-01");
  assert.equal(S.shiftAnchor("season", "2026-02-20", -1), "2025-11-01");
  assert.equal(S.shiftAnchor("month", "2026-01-31", 1), "2026-02-01");
});

test("summary: time, completion, accuracy, projects, reasons", () => {
  const t = (id, date, est, status, extra = {}) => ({ id, date, est, status, ...extra });
  const c = ctx({
    projects: [{ id: "p", name: "Module #4", group: "Main - French", color: "#f0f" }],
    log: { "2026-10-01": { need: 60, projects: { p: 60 } }, "2026-10-02": { need: 60, projects: { p: 60 } } },
    tasks: [
      t("a", "2026-10-01", 60, "done", { actual: 75, projectId: "p", category: "Main" }),
      t("b", "2026-10-01", 30, "delay", { actual: 10, category: "Work", reason: "Meetings " }),
      t("c", "2026-10-02", 40, "delay", { category: "Work", reason: "meetings" }),
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
  assert.equal(s.accuracy, 1.25);
  assert.equal(s.active, 1);
  assert.deepEqual(s.status, { delay: 2, drop: 1 });
  assert.equal(s.reasons[0].count, 2, "same reason, different case and spaces");
  assert.equal(s.reasons[0].text, "Meetings");
  assert.equal(s.byProject[0].name, "Main - French");
  assert.equal(s.byProject[0].spent, 75);
  assert.equal(s.byProject[0].color, "#f0f");
  assert.equal(s.byProject.find((x) => x.name === "").counted, 3, "the dropped one counts, the optional one does not");
  assert.equal(s.daily.length, 7);
  assert.equal(s.daily.find((x) => x.date === "2026-10-06").future, true);
  assert.equal(s.byWeekday[4].avg, 85, "Thursday Oct 1");
  assert.deepEqual(s.byWeekday[4].parts, [{ name: "Main - French", color: "#f0f", avg: 75 }, { name: "", color: "", avg: 10 }], "split by project, biggest first, adding up to the average");
  assert.deepEqual(s.byWeekday[6].parts, [], "nothing on Saturday");
});

test("weekly roll-up for the year view", () => {
  const daily = ["2026-09-28", "2026-09-29", "2026-10-05"].map((date) => ({ date, spent: 10, planned: 20, line: 5, future: false }));
  const w = S.weekly(daily, "monday");
  assert.equal(w.length, 2);
  assert.equal(w[0].spent, 20);
});

test("custom periods; there is no single-day one", () => {
  assert.deepEqual(Object.keys(S.PERIODS), ["week", "month", "season", "year", "custom"]);
  assert.deepEqual(S.previousRange("custom", { from: TODAY, to: TODAY }), { from: "2026-10-04", to: "2026-10-04" }, "one day picked by hand still works");
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
      t("b", "2026-10-03", 30, { actual: 30, projectId: "l", deep: true }),   // 周六
      t("c", "2026-10-03", 20, { actual: 20, projectId: "c" }),
      t("g", "2026-10-03", 50, { projectId: "c" }),                           // 标了 Done 但一点没记：时间里不算
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

test("where the time went: 24 hours a day; sleep and meals are counted but hidden, weekend housework goes into Chores", () => {
  const c = deepCtx();
  assert.deepEqual(S.lifeOn(S.lifeOf(c), "2026-10-03"), { sleep: 420, care: 180, chores: 60 }, "Saturday gets half the weekend chores");
  assert.equal(S.lifeOn(S.lifeOf(c), "2026-10-05").chores, 0);
  const s = S.summarize(c, "2026-10-01", "2026-10-07");   // 到今天（10-05）为止 5 天，其中周六周日各一天
  const pie = S.clockPie(c, s);
  assert.equal(pie.total, 5 * 1440);
  const part = (k) => pie.parts.find((x) => x.key === k)?.min;
  assert.equal(part("sleep"), 5 * 420);
  assert.equal(part("care"), 5 * 180);
  assert.ok(pie.parts.filter((x) => x.kind === "life").every((x) => x.hidden), "sleep and meals: counted, not drawn");
  assert.equal(part("chores"), undefined, "no Housework slice of its own");
  const logged = S.clockPie(c, s, { trackedOnly: true }).parts.find((x) => x.key === "p:Chores").min;
  assert.equal(part("p:Chores"), logged + 120, "the usual weekend housework sits in Chores");
  assert.equal(part("p:IELTS"), 135);
  assert.equal(part("p:"), 40);
  assert.equal(pie.tracked, 195);
  assert.equal(part("blank"), 5 * 1440 - 5 * 600 - 120 - 195);
  assert.equal(pie.parts.reduce((a, x) => a + x.min, 0), pie.total);
  assert.deepEqual(pie.parts.map((x) => x.key), ["sleep", "care", "p:Chores", "p:IELTS", "p:", "blank"], "projects in the fixed order, not by size");
  const only = S.clockPie(c, s, { trackedOnly: true });
  assert.equal(only.total, 195);
  assert.ok(only.parts.every((x) => x.kind === "project" || x.kind === "none"));
  // 只看 IELTS：别的记录合成一片；默认值调得再大，空白也不会是负的
  const ielts = { ...c, tasks: c.tasks.filter((t) => t.projectId === "r" || t.projectId === "l") };
  const f = S.clockPie(ielts, S.summarize(ielts, "2026-10-01", "2026-10-07", { by: "plan" }), { rest: 60, filtered: true });
  assert.equal(f.parts.find((x) => x.key === "rest").min, 60 + 120, "filtered: the housework goes with everything else");
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
  assert.deepEqual(ielts.subs.map((x) => x.name + " " + x.total), ["Reading 90", "Listening 30"], "the plans under it, biggest first");
  assert.deepEqual(ielts.subs[0].cells, [0, 0, 0, 0, 90, 0, 0]);
  for (const r of week.rows) assert.equal(r.subs.reduce((a, x) => a + x.total, 0), r.total, "sub-rows add up to their row");
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
  assert.ok(year.rows.every((r) => r.subs.length === 0), "rows that are already plans don't open");
});

test("weekly roll-up carries deep time and the goal", () => {
  const w = S.weekly([{ date: "2026-10-05", spent: 60, deep: 40, planned: 60, line: 0, goal: 60, future: false }, { date: "2026-10-06", spent: 30, deep: 30, planned: 30, line: 0, goal: 60, future: false }], "monday");
  assert.equal(w[0].deep, 70);
  assert.equal(w[0].goal, 120);
});

// ---------- 大类：直接挂在大类上的任务、占比、每周、季度表 ----------

const GROUPS = [
  { name: "Work", color: "#00f", labor: true, grow: "all" }, { name: "Fitness", color: "#f80", labor: false, grow: "all" },
  { name: "Chores", color: "#840", labor: true, grow: "" }, { name: "Leisure", color: "#80f", labor: false, grow: "deep" }
];
const gctx = (tasks) => ctx({
  today: "2026-10-12", groups: GROUPS,
  projects: [{ id: "deck", name: "Deck", group: "Work", color: "#00f" }, { id: "gym", name: "Gym", group: "Fitness", color: "#f80" }, { id: "solo", name: "Solo plan", group: "", color: "#999" }],
  tasks
});
const done = (id, date, min, extra = {}) => ({ id, date, est: min, actual: min, status: "done", ...extra });

test("a task can sit right on a project, with or without a plan", () => {
  const c = gctx([done("a", "2026-10-06", 60, { projectId: "deck" }), done("b", "2026-10-06", 30, { group: "Work" }), done("c", "2026-10-07", 20, { group: "Chores" }), done("d", "2026-10-07", 15, { projectId: "solo" }), done("e", "2026-10-07", 10)]);
  const rows = (by) => Object.fromEntries(S.summarize(c, "2026-10-05", "2026-10-11", { by }).byProject.map((x) => [x.name, x.spent]));
  assert.deepEqual(rows("group"), { Work: 90, Chores: 20, "Solo plan": 15, "": 10 });
  assert.deepEqual(rows("plan"), { Deck: 60, Work: 30, Chores: 20, "Solo plan": 15, "": 10 }, "by plan, a task without a plan stays on its project's row");
  assert.deepEqual(rows((t) => ({ name: t.id < "c" ? "first" : "rest", color: "" })), { first: 90, rest: 45 }, "rows can be decided by a function");
  assert.equal(S.rowOf(c, c.tasks[2], "group").color, "#840", "the project's colour when there's no plan");
});

test("weekly check: growth and relax, too little or too much", () => {
  const c = gctx([
    done("w", "2026-10-05", 1800, { projectId: "deck" }), done("g", "2026-10-06", 300, { projectId: "gym" }),
    done("r", "2026-10-07", 200, { group: "Leisure", deep: true }), done("l", "2026-10-08", 240, { group: "Leisure" }),
    done("c", "2026-10-08", 500, { group: "Chores" }), done("x", "2026-10-12", 999, { group: "Work" })
  ]);
  const w = S.weekCheck(c, "2026-10-05", "2026-10-11");
  assert.equal(w.growth, 2300, "work + fitness + deep leisure; chores and the next week don't count");
  assert.equal(w.relax, 240, "leisure that isn't deep");
  assert.deepEqual(w.warn, [{ what: "growth", dir: "low", min: 2300, limit: 2400 }, { what: "relax", dir: "low", min: 240, limit: 300 }]);
  assert.deepEqual(S.weekCheck(c, "2026-10-05", "2026-10-11", { growMin: 0, growMax: 2000, relaxMin: 0, relaxMax: 200 }).warn.map((x) => x.what + ":" + x.dir), ["growth:high", "relax:high"]);
  assert.deepEqual(S.weekCheck(c, "2026-10-05", "2026-10-11", { growMin: 2300, relaxMin: 240 }).warn, []);
});

test("quarter sheet: progress is labour hours x 10, focus is deep hours / 10", () => {
  const c = gctx([
    done("a", "2026-10-10", 360, { projectId: "deck" }), done("b", "2026-10-10", 30, { group: "Chores", deep: true }), done("c", "2026-10-10", 120, { projectId: "gym", deep: true }),
    done("d", "2026-10-11", 84, { group: "Work" }), done("e", "2026-10-11", 29, { group: "Leisure", deep: true }),
    { id: "f", date: "2026-10-12", est: 30, status: "" }
  ]);
  assert.deepEqual(S.quarterRow(c, "2026-10-10"), { date: "2026-10-10", progress: 65, focus: 0.3, any: true }, "6.5 h of work + chores; 2.5 h deep rounds to 3");
  assert.deepEqual(S.quarterRow(c, "2026-10-11"), { date: "2026-10-11", progress: 14, focus: 0, any: true });
  assert.deepEqual(S.quarterRows(c, "2026-10-09"), [{ date: "2026-10-09", progress: 0, focus: 0 }, { date: "2026-10-10", progress: 65, focus: 0.3 }, { date: "2026-10-11", progress: 14, focus: 0 }],
    "from the start day; a past day with nothing is 0; today waits until something is logged");
  assert.equal(S.quarterRows(c, "2026-01-01").length, 13, "at most the last two weeks");
});

test("a project's last 14 days: done, planned but not done, nothing", () => {
  const fit = GROUPS[1];
  const c = gctx([
    done("a", "2026-10-12", 40, { projectId: "gym" }), { id: "b", date: "2026-10-11", est: 30, status: "", group: "Fitness" },
    { id: "c", date: "2026-10-10", est: 30, status: "later", group: "Fitness" }, { id: "d", date: "2026-10-09", est: 30, status: "partial", actual: 10, group: "Fitness" },
    { id: "e", date: "2026-10-08", est: 30, status: "", actual: 12, projectId: "gym" }, { id: "f", date: "2026-10-07", est: 30, status: "", group: "Fitness" },
    done("g", "2026-10-07", 20, { group: "Fitness" }), done("h", "2026-10-06", 60, { group: "Work" }),
    done("i", "2026-09-29", 30, { group: "Fitness" }), done("j", "2026-09-28", 30, { group: "Fitness" })
  ]);
  const days = S.groupDays(c, fit);
  assert.equal(days.length, 14);
  assert.equal(days[0].date, "2026-09-29", "oldest first, today last");
  assert.equal(days[13].date, "2026-10-12");
  const at = (d) => days.find((x) => x.date === d).state;
  assert.equal(at("2026-10-12"), "done");
  assert.equal(at("2026-10-11"), "open", "planned, not marked");
  assert.equal(at("2026-10-10"), "", "moved to later: nothing that day");
  assert.equal(at("2026-10-09"), "done", "partial counts");
  assert.equal(at("2026-10-08"), "done", "time logged counts even before it is marked");
  assert.equal(at("2026-10-07"), "done", "one done task is enough, whatever else was planned");
  assert.equal(at("2026-10-06"), "", "another project's day");
  assert.equal(at("2026-09-29"), "done", "the 14th day back is in");
  assert.equal(S.groupDays(c, fit, 7).length, 7);
  assert.equal(S.groupDays(c, GROUPS[3], 14, ["2026-10-03", "2026-01-01"]).filter((x) => x.state === "done").map((x) => x.date).join(), "2026-10-03", "extra dates inside the window count");
});

test("on the side: one total a month, spread over its days, only ever a haze", () => {
  const side = [{ month: "2026-09", min: 1800 }, { month: "2026-10", min: 310 }, { month: "bad", min: 99 }];
  const c = ctx({ side });
  assert.equal(S.sideHaze(c, "2026-09-01", "2026-09-30").min, 1800);
  assert.equal(Math.round(S.sideHaze(c, "2026-09-28", "2026-10-04").min), 3 * 60 + 4 * 10, "a week gets its days' share");
  assert.equal(S.sideHaze(c, "2026-10-01", "2026-10-31").min, 50, "this month only up to today");
  const s = S.summarize(c, "2026-09-01", "2026-09-30");
  assert.equal(s.spent, 0, "it never adds to the time spent");
  assert.deepEqual(S.sideMonths("2026-10-14"), ["2026-09", "2026-08"], "usually the two months before");
  assert.deepEqual(S.sideMonths("2026-10-29"), ["2026-10", "2026-09", "2026-08"], "in the last three days, this month too");
  assert.deepEqual(S.sideMonths("2026-10-28"), ["2026-09", "2026-08"]);
  assert.deepEqual(S.sideMonths("2026-02-27"), ["2026-02", "2026-01", "2025-12"], "February's last three days; and across the year");
});

test("on the side in the store: one row a month; older rows folded in; 0 counts as filled, empty takes it out", async () => {
  const store = await import("../js/store.js?side");
  store.setSetting("side:old1", { month: "2026-09", min: 600, kind: "show", full: true });   // 上一版的写法
  store.setSetting("side:old2", { month: "2026-09", min: 120 });
  assert.equal(store.sideOf("2026-09"), 720, "the same month adds up");
  store.setSide("2026-09", 900);
  assert.deepEqual(store.sides(), [{ month: "2026-09", min: 900 }]);
  assert.ok(!store.get("settings", "side:old1"), "the old row is gone");
  assert.equal(store.sideFilled("2026-08"), false);
  store.setSide("2026-09", 0);
  assert.deepEqual(store.sides(), [{ month: "2026-09", min: 0 }], "0 is an answer: that month had none");
  assert.equal(store.sideFilled("2026-09"), true);
  store.setSide("2026-09", null);
  assert.deepEqual(store.sides(), [], "clearing the box takes the month out");
  assert.equal(store.sideFilled("2026-09"), false);
});

test("the Chores task from the chore key counts its minutes, not as a done task", () => {
  const c = ctx({ tasks: [
    { id: "a", date: "2026-10-02", est: 30, status: "done", actual: 30 },
    { id: "chore-2026-10-02", date: "2026-10-02", est: 45, status: "done", actual: 45, group: "Chores" }
  ] });
  const s = S.summarize(c, "2026-10-01", "2026-10-07");
  assert.deepEqual([s.spent, s.done, s.counted], [75, 1, 1]);
  assert.equal(s.byProject.find((x) => x.name === "Chores").done, 0);
});
