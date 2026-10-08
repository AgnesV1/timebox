import { test } from "node:test";
import assert from "node:assert/strict";
import * as D from "../js/day.js";
import * as S from "../js/stats.js";

console.warn = () => {};   // 「Can't save on this device」

test("dial: 6:00 on the left, 9 on top, 12 on the right; 18 starts the inner ring", () => {
  assert.equal(D.dialMin("06:00"), 0);
  assert.equal(D.dialMin("05:59"), 1439);
  assert.equal(D.angleOf(D.dialMin("06:00")), 180, "left");
  assert.equal(D.angleOf(D.dialMin("09:00")), 270, "top (SVG angles grow clockwise)");
  assert.equal(D.angleOf(D.dialMin("12:00")), 360, "right");
  assert.equal(D.angleOf(D.dialMin("15:00")), 450, "bottom");
  assert.equal(D.angleOf(D.dialMin("18:00")), 180, "inner ring starts on the left too");
  assert.equal(D.angleOf(D.dialMin("21:00")), 270);
  assert.equal(D.angleOf(D.dialMin("03:00")), 450);
});

test("dial: a stretch splits at 18:00 between rings and at 6:00 between end and start", () => {
  assert.deepEqual(D.arcs([{ from: "09:10", to: "09:40" }]).map((a) => a.ring + " " + a.a + "-" + a.b), ["outer 190-220"]);
  assert.deepEqual(D.arcs([{ from: "17:00", to: "18:30" }]).map((a) => a.ring + " " + a.a + "-" + a.b), ["outer 660-720", "inner 720-750"]);
  assert.deepEqual(D.arcs([{ from: "23:00", to: "08:00", label: "Sleep" }]).map((a) => a.ring + " " + a.a + "-" + a.b + " " + a.label), ["inner 1020-1440 Sleep", "outer 0-120 Sleep"]);
  assert.deepEqual(D.arcs([{ from: "", to: "" }, { from: "10:00", to: "10:00" }]), [], "no clock or zero length: nothing to draw");
});

test("commute blocks land where they should", () => {
  const arcs = D.arcs(D.COMMUTE_BLOCKS);
  // 画的时候终点角度 = 起点 + 长度（一圈的末尾不绕回 180°）
  assert.deepEqual(arcs.map((a) => a.ring + " " + D.angleOf(a.a) + "→" + (D.angleOf(a.a) + ((a.b - a.a) / 720) * 360)), [
    "inner 330→540", "outer 180→240", "outer 240→270", "outer 510→540", "inner 180→195"
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
