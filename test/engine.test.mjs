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

test("task minutes: time is only what was recorded", () => {
  // 花了多少只看记下的，和状态无关
  assert.equal(E.spentMin({ status: "done", est: 45 }), 0, "Done without a record adds no time");
  assert.equal(E.spentMin({ status: "done", est: 45, actual: 60 }), 60);
  assert.equal(E.spentMin({ status: "delay", est: 45, actual: 20 }), 20);
  assert.equal(E.spentMin({ status: "drop", est: 45, actual: 20 }), 20, "time spent before dropping still counts");
  assert.equal(E.spentMin({ status: "", est: 45, actual: 20 }), 20, "timed but not marked yet");
  assert.equal(E.spentMin({ status: "", est: 45 }), 0);
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
