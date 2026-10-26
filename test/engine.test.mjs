// 运行：node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as D from "../js/dates.js";
import * as E from "../js/engine.js";

const TODAY = "2026-10-05"; // 周一

function ctx(over = {}) {
  return { today: TODAY, projects: [], items: [], tasks: [], capacity: { default: 240, weekly: null, overrides: {} }, log: {}, level: true, ...over };
}

test("dates: add, diff, weekday across DST and month ends", () => {
  assert.equal(D.addDays("2026-03-07", 1), "2026-03-08");
  assert.equal(D.addDays("2026-03-08", 1), "2026-03-09");
  assert.equal(D.diffDays("2026-03-01", "2026-04-01"), 31);
  assert.equal(D.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(D.weekday("2026-10-03"), 6);
  assert.equal(D.startOfWeek("2026-10-04"), "2026-09-28");
  assert.equal(D.startOfWeek("2026-10-04", "sunday"), "2026-10-04");
  assert.equal(D.range("2026-10-01", "2026-10-03").length, 3);
  assert.equal(D.fmtMin(90), "1h 30m");
  assert.equal(D.fmtMin(45), "45m");
  assert.equal(D.daysInMonth("2028-02-10"), 29);
});

test("dates: today starts at dayStartsAt", () => {
  assert.equal(D.todayIso("04:00", new Date(2026, 9, 4, 2, 30)), "2026-10-03");
  assert.equal(D.todayIso("04:00", new Date(2026, 9, 4, 4, 30)), "2026-10-04");
});

test("task minutes: time is only what was recorded; Done is what finishes plan work", () => {
  // 花了多少只看记下的，和状态无关
  assert.equal(E.spentMin({ status: "done", est: 45 }), 0, "Done without a record adds no time");
  assert.equal(E.spentMin({ status: "done", est: 45, actual: 60 }), 60);
  assert.equal(E.spentMin({ status: "delay", est: 45, actual: 20 }), 20);
  assert.equal(E.spentMin({ status: "drop", est: 45, actual: 20 }), 20, "time spent before dropping still counts");
  assert.equal(E.spentMin({ status: "", est: 45, actual: 20 }), 20, "timed but not marked yet");
  assert.equal(E.spentMin({ status: "", est: 45 }), 0);
  // 推进计划：Done 算整条做完，别的按记下的、不超过预计
  assert.equal(E.planMin({ status: "done", est: 45, actual: 10 }), 45, "finished faster than planned");
  assert.equal(E.planMin({ status: "done", est: 45 }), 45);
  assert.equal(E.planMin({ status: "delay", est: 45, actual: 20 }), 20);
  assert.equal(E.planMin({ status: "", est: 45, actual: 90 }), 45);
  assert.equal(E.isPlanned({ status: "delay" }), false);
  assert.equal(E.isPlanned({ status: "drop" }), false);
  assert.equal(E.isPlanned({ status: "done" }), true);
});

test("capacity: weekly, override, rest days", () => {
  const cap = { default: 240, weekly: [0, 300, 300, 300, 300, 300, 120], overrides: { "2026-10-07": 0 } };
  assert.equal(E.capacityFor(cap, "2026-10-04"), 0);
  assert.equal(E.capacityFor(cap, "2026-10-05"), 300);
  assert.equal(E.capacityFor(cap, "2026-10-07"), 0);
  assert.equal(E.isWorkDay(cap, "2026-10-04"), false);
  assert.equal(E.isWorkDay({ weekly: [0, 0, 0, 0, 0, 0, 0] }, "2026-10-04"), true);
});

test("item state: a bucket item split across days", () => {
  const c = ctx({
    items: [{ id: "i1", projectId: "p1", est: 300 }],
    tasks: [
      { id: "a", date: "2026-10-01", est: 45, status: "done", itemId: "i1" },
      { id: "b", date: "2026-10-02", est: 45, status: "delay", actual: 20, itemId: "i1" },
      { id: "c", date: "2026-10-06", est: 60, status: "", itemId: "i1" },
      { id: "d", date: "2026-10-03", est: 45, status: "delay", itemId: "i1" },
      { id: "e", date: "2026-10-07", est: 30, status: "", actual: 10, itemId: "i1" }
    ]
  });
  const s = E.itemState(c, c.items[0]);
  assert.equal(s.progress, 75, "45 done + 20 recorded on the delayed one + 10 recorded on an open one");
  assert.equal(s.remaining, 225);
  assert.equal(s.scheduled, 80, "the open ones still to do: 60 + (30 - 10)");
  assert.equal(s.unscheduled, 145);
  assert.equal(E.poolItems(c).length, 0, "project p1 doesn't exist, so nothing in pool");
});

test("project plan: spreads over work days before the planned finish", () => {
  const c = ctx({
    capacity: { weekly: [0, 240, 240, 240, 240, 240, 0], overrides: {} },
    projects: [{ id: "p1", deadline: "2026-10-16", early: 2 }],
    items: [{ id: "i1", projectId: "p1", est: 600 }]
  });
  const plan = E.projectPlan(c, c.projects[0]);
  assert.equal(plan.planFinish, "2026-10-14");
  assert.equal(plan.days.length, 8); // 5 Mon–Fri + Mon–Wed of next week
  assert.equal(plan.dailyNeed, 75);
  assert.equal(E.needOn(c, c.projects[0], "2026-10-10"), 0, "Saturday is a rest day");
});

test("project plan: buffer in use, overdue, not started, no deadline", () => {
  const items = [{ id: "i1", projectId: "p1", est: 120 }];
  let c = ctx({ projects: [{ id: "p1", deadline: "2026-10-06", early: 3 }], items });
  let plan = E.projectPlan(c, c.projects[0]);
  assert.equal(plan.inBuffer, true);
  assert.equal(plan.days.length, 2);
  c = ctx({ projects: [{ id: "p1", deadline: "2026-10-01" }], items });
  plan = E.projectPlan(c, c.projects[0]);
  assert.equal(plan.overdue, true);
  assert.equal(E.needOn(c, c.projects[0], TODAY), 0);
  c = ctx({ projects: [{ id: "p1", deadline: "2026-10-20", start: "2026-10-12" }], items });
  plan = E.projectPlan(c, c.projects[0]);
  assert.equal(plan.notStarted, true);
  assert.equal(plan.days[0], "2026-10-12");
  assert.equal(E.needOn(c, c.projects[0], TODAY), 0);
  c = ctx({ projects: [{ id: "p1" }], items });
  assert.equal(E.projectPlan(c, c.projects[0]).noDeadline, true);
});

test("levelling: keeps totals, stays inside each window, evens the load", () => {
  const c = ctx({
    projects: [{ id: "a", deadline: "2026-10-08" }, { id: "b", deadline: "2026-10-14" }],
    items: [{ id: "ia", projectId: "a", est: 480 }, { id: "ib", projectId: "b", est: 600 }]
  });
  const plans = E.levelPlans(c);
  const total = (o) => Object.values(o).reduce((x, y) => x + y, 0);
  assert.equal(total(plans.a), 480);
  assert.equal(total(plans.b), 600);
  assert.ok(Object.keys(plans.a).every((d) => d <= "2026-10-08"));
  const days = D.range(TODAY, "2026-10-14").map((d) => c.projects.reduce((a, p) => a + E.needOn(c, p, d), 0));
  assert.ok(Math.max(...days) - Math.min(...days) <= 30, "daily totals within 30 min: " + days.join(","));
  assert.equal(Math.round(days.reduce((x, y) => x + y, 0)), 1080);
});

test("module calibration suggests new estimates after two slow samples", () => {
  const p = { id: "p1", deadline: "2026-12-01" };
  const items = [
    { id: "a", projectId: "p1", module: "Papers", est: 60 },
    { id: "b", projectId: "p1", module: "Papers", est: 60 },
    { id: "c", projectId: "p1", module: "Papers", est: 60 },
    { id: "d", projectId: "p1", module: "Papers", est: 60 },
    { id: "e", projectId: "p1", module: "Vocab", est: 30 }
  ];
  const tasks = [
    { id: "1", date: "2026-10-01", est: 60, actual: 90, status: "done", projectId: "p1", itemId: "a" },
    { id: "2", date: "2026-10-02", est: 60, actual: 90, status: "done", projectId: "p1", itemId: "b" }
  ];
  let s = E.moduleStats(ctx({ projects: [p], items, tasks }), p, "Papers");
  assert.equal(s.suggest, true);
  assert.equal(s.ratio, 1.5);
  assert.deepEqual(s.proposals.map((x) => x.est), [90, 90]);
  s = E.moduleStats(ctx({ projects: [{ ...p, calib: { Papers: 2 } }], items, tasks }), p, "Papers");
  assert.equal(E.moduleStats(ctx({ projects: [{ ...p, calib: { Papers: 2 } }], items, tasks }), { ...p, calib: { Papers: 2 } }, "Papers").suggest, false);
  assert.equal(E.moduleStats(ctx({ projects: [p], items, tasks }), p, "Vocab").suggest, false);
});

test("pace, projected finish and health", () => {
  const p = { id: "p1", deadline: "2026-10-20", early: 0 };
  const items = [{ id: "i", projectId: "p1", est: 1200 }];
  const tasks = ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"].map((d) => ({ id: d, date: d, est: 60, actual: 60, status: "done", projectId: "p1", itemId: "i" }));
  const c = ctx({ capacity: { default: 240 }, projects: [p], items, tasks });
  const pc = E.pace(c, p);
  assert.equal(pc.enough, true);
  assert.equal(pc.days, 6); // Sep 29 – Oct 4; today only counts once worked
  const h = E.health(c, p);
  assert.ok(["safe", "tight", "danger"].includes(h.level));
  assert.equal(E.health(ctx({ projects: [p], items: [] }), p).level, "empty");
  assert.equal(E.health(ctx({ projects: [{ id: "p1" }], items }), { id: "p1" }).level, "open");
});

