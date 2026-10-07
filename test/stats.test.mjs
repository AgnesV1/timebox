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
