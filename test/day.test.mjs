import { test } from "node:test";
import assert from "node:assert/strict";
import * as D from "../js/day.js";
import * as S from "../js/stats.js";

console.warn = () => {};   // 「Can't save on this device」

test("spiral: 6:00 on the left, noon on top, 18:00 on the right, midnight at the bottom; each day one more turn", () => {
  const deg = (t) => ((D.angleAt(t) % 360) + 360) % 360;
  const o = "2026-10-06";
  assert.equal(D.absMin(o, o, "06:00"), 0);
  assert.equal(deg(D.absMin(o, o, "06:00")), 180, "left");
  assert.equal(deg(D.absMin(o, o, "12:00")), 270, "top (SVG angles grow clockwise)");
  assert.equal(deg(D.absMin(o, o, "18:00")), 0, "right");
  assert.equal(deg(D.absMin(o, o, "23:00")), 75, "toward the bottom");
  assert.equal(D.absMin(o, "2026-10-07", "06:00"), D.TURN, "the next day starts the next turn");
  assert.equal(D.angleAt(D.TURN) - D.angleAt(0), 360, "angles keep growing so the turns join up");
  assert.equal(D.absMin(o, "2026-10-07", "01:00"), 2 * D.TURN - 300, "1 am is still that day (before dayStartsAt) — late that night");
  assert.equal(D.absMin(o, "2026-10-07", "01:00", "00:00"), D.TURN - 300, "with the day starting at midnight it is early that morning");
});

test("spiral: timed stretches and commute blocks land in real time", () => {
  const o = "2026-10-06";
  assert.deepEqual(D.stretch(o, "2026-10-07", "09:10", "09:40"), { a: D.TURN + 190, b: D.TURN + 220 });
  assert.deepEqual(D.stretch(o, "2026-10-07", "23:30", "00:30"), { a: D.TURN + 1050, b: D.TURN + 1110 }, "past midnight");
  assert.deepEqual(D.stretch(o, "2026-10-07", "03:30", "04:30"), { a: D.TURN + 1290, b: D.TURN + 1350 }, "across dayStartsAt");
  assert.equal(D.stretch(o, "2026-10-07", "10:00", "10:00"), null);
  assert.equal(D.stretch(o, "2026-10-07", "", "10:00"), null);
  // 通勤日 10-07：前一晚 23:00 睡到 08:00，08–09 通勤，17–18:30 通勤
  assert.deepEqual(D.COMMUTE_BLOCKS.map((b) => D.blockSpan(o, "2026-10-07", b.from, b.to)), [
    { a: 1020, b: D.TURN + 120 }, { a: D.TURN + 120, b: D.TURN + 180 }, { a: D.TURN + 660, b: D.TURN + 750 }
  ]);
  assert.equal(D.isCommute({ days: { "2026-10-08": true } }, "2026-10-08"), true);
  assert.equal(D.isCommute(null, "2026-10-08"), false);
});

test("hours: a stretch splits across the hours it touches, counted from 6:00", () => {
  assert.deepEqual(D.hourMinutes("09:40", "11:15"), { 3: 20, 4: 60, 5: 15 });
  assert.deepEqual(D.hourMinutes("05:30", "06:20"), { 23: 30, 0: 20 }, "across 6:00");
  assert.equal(D.hourLabel(0), "06:00");
  assert.equal(D.hourLabel(20), "02:00");
});

test("heat grid: per day per hour, averages by weekday, weeks newest first, commute hours marked", () => {
  const ctx = { today: "2026-10-07", commute: { days: { "2026-10-06": true } }, tasks: [
    { date: "2026-10-05", times: "09:00-10:30 90m; 20m" },
    { date: "2026-10-06", times: "09:15-09:45 30m" },
    { date: "2026-10-12", times: "09:00-10:00 60m" }   // 明天以后，不算
  ] };
  const grid = S.hourGrid(ctx, "2026-09-28", "2026-10-11");
  assert.equal(grid.length, 10, "up to today");
  const mon = grid.find((x) => x.date === "2026-10-05");
  assert.equal(mon.hours[3], 60);
  assert.equal(mon.hours[4], 30);
  assert.equal(mon.hours.reduce((a, v) => a + v, 0), 90, "the untimed 20m isn't on the clock");
  assert.deepEqual(mon.fixed, {});
  const tue = grid.find((x) => x.date === "2026-10-06");
  assert.equal(tue.fixed[2], 60, "08:00–09:00 commute");
  assert.equal(tue.fixed[11], 60, "17:00–18:00");
  assert.equal(tue.fixed[12], 30, "18:00–18:30");
  const byWd = S.heatByWeekday(grid);
  assert.equal(byWd[1].days, 2, "two Mondays in range");
  assert.equal(byWd[1].hours[3], 30, "60 min over two Mondays");
  const weeks = S.heatWeeks(grid, "monday");
  assert.deepEqual(weeks.map((w) => w.from), ["2026-10-05", "2026-09-28"]);
  assert.equal(weeks[0].days[0].date, "2026-10-05");
  assert.equal(weeks[0].days[3], null, "Thursday hasn't happened");
});

test("store: commute days toggle, and old ones are tidied away", async () => {
  const store = await import("../js/store.js?commute");
  const t = store.today();
  store.toggleCommute(t);
  assert.equal(store.isCommuteDay(t), true);
  assert.equal(store.ctx().commute.days[t], true);
  store.setSetting("commute", { days: { ...store.ctx().commute.days, "2020-01-01": true } });
  store.toggleCommute(t);
  assert.equal(store.isCommuteDay(t), false);
  assert.deepEqual(store.setting("commute").days, {}, "a day from years ago is dropped");
});

test("reading errors read as advice, not Google's raw message", async () => {
  const R = await import("../js/reading.js");
  assert.match(R.readingError("Exception: You do not have permission to access the requested document."), /share it .*Google account/);
  assert.match(R.readingError("Exception: Unexpected error while getting the method or property openById on object SpreadsheetApp."), /can stay private/);
  assert.match(R.readingError("no sheet"), /Settings/);
  assert.equal(R.readingError("something else"), "something else");
});
