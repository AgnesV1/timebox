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

test("task minutes: spent vs plan progress", () => {
  assert.equal(E.spentMin({ status: "done", est: 45 }), 45);
  assert.equal(E.spentMin({ status: "done", est: 45, actual: 60 }), 60);
  assert.equal(E.spentMin({ status: "partial", est: 45 }), 0);
  assert.equal(E.spentMin({ status: "partial", est: 45, actual: 20 }), 20);
  assert.equal(E.spentMin({ status: "later", est: 45, actual: 20 }), 0);
  assert.equal(E.planMin({ status: "done", est: 45, actual: 90 }), 45);
  assert.equal(E.planMin({ status: "partial", est: 45, actual: 90 }), 45);
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
      { id: "b", date: "2026-10-02", est: 45, status: "partial", actual: 20, itemId: "i1" },
      { id: "c", date: "2026-10-06", est: 60, status: "", itemId: "i1" },
      { id: "d", date: "2026-10-03", est: 45, status: "later", itemId: "i1" }
    ]
  });
  const s = E.itemState(c, c.items[0]);
  assert.equal(s.progress, 65);
  assert.equal(s.remaining, 235);
  assert.equal(s.scheduled, 60);
  assert.equal(s.unscheduled, 175);
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
  assert.equal(E.lineOn(c, TODAY), 0);
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
  const days = D.range(TODAY, "2026-10-14").map((d) => E.lineOn(c, d));
  assert.ok(Math.max(...days) - Math.min(...days) <= 30, "daily totals within 30 min: " + days.join(","));
  assert.equal(Math.round(days.reduce((x, y) => x + y, 0)), 1080);
});

test("today's line is frozen in the morning; new projects add their share", () => {
  const projects = [{ id: "p1", deadline: "2026-10-09" }];
  const items = [{ id: "i1", projectId: "p1", est: 300 }];
  let c = ctx({ projects, items });
  const first = E.todayLine(c);
  assert.equal(first.fresh, true);
  assert.equal(first.line, 60);
  const log = { [TODAY]: { need: first.line, projects: first.shares } };
  c = ctx({ projects, items, log, tasks: [{ id: "t", date: TODAY, est: 60, status: "done", projectId: "p1", itemId: "i1" }] });
  assert.equal(E.todayLine(c).line, 60, "finishing work does not lower today's line");
  c = ctx({ projects: [...projects, { id: "p2", deadline: "2026-10-06" }], items: [...items, { id: "i2", projectId: "p2", est: 100 }], log });
  const t = E.todayLine(c);
  assert.equal(t.added, true);
  assert.ok(t.line > 60);
});

test("yesterday's bill: short, ahead, rest, met", () => {
  const y = "2026-10-04";
  const base = {
    capacity: { default: 240 },
    projects: [{ id: "p1", deadline: "2026-10-14" }],
    items: [{ id: "i1", projectId: "p1", est: 1000 }],
    log: { [y]: { need: 100, projects: { p1: 100 } } }
  };
  const done = (min, actual) => [{ id: "t", date: y, est: min, status: "done", actual, projectId: "p1", itemId: "i1" }];
  let b = E.yesterdayBill(ctx({ ...base, tasks: done(40) }));
  assert.equal(b.kind, "short");
  assert.equal(b.short, 60);
  assert.equal(b.days, 10);
  assert.equal(Math.round(b.extraPerDay), 6);
  b = E.yesterdayBill(ctx({ ...base, tasks: done(100, 150) }));
  assert.equal(b.kind, "ahead");
  assert.equal(b.extra, 50);
  b = E.yesterdayBill(ctx({ ...base, tasks: [] }));
  assert.equal(b.kind, "rest");
  b = E.yesterdayBill(ctx({ ...base, tasks: done(100, 102) }));
  assert.equal(b.kind, "met");
  assert.equal(E.yesterdayBill(ctx({ ...base, log: {} })), null);
});

test("streak counts met days and skips days with nothing due", () => {
  const p = [{ id: "p1", deadline: "2026-12-01" }];
  const log = {
    "2026-10-01": { need: 60, projects: { p1: 60 } },
    "2026-10-02": { need: 60, projects: { p1: 60 } },
    "2026-10-03": { need: 0, projects: { p1: 0 } },
    "2026-10-04": { need: 60, projects: { p1: 60 } }
  };
  const t = (d, est) => ({ id: d, date: d, est, status: "done", projectId: "p1" });
  const c = ctx({ projects: p, log, tasks: [t("2026-10-01", 20), t("2026-10-02", 60), t("2026-10-04", 70)] });
  assert.equal(E.streak(c), 2);
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

test("overdue spread never passes the project's planned finish", () => {
  const c = ctx({
    capacity: { default: 120 },
    projects: [{ id: "p1", deadline: "2026-10-08", early: 1 }],
    tasks: [
      { id: "x", date: "2026-10-02", est: 60, status: "", projectId: "p1" },
      { id: "y", date: "2026-10-03", est: 60, status: "" },
      { id: "z", date: TODAY, est: 100, status: "" }
    ]
  });
  const moves = E.planOverdue(c);
  const mx = moves.find((m) => m.id === "x");
  assert.ok(mx.to >= TODAY && mx.to <= "2026-10-07");
  assert.notEqual(mx.to, TODAY, "today is already full");
  assert.equal(moves.length, 2);
});
