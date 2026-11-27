// 生态圈蓄水池的水位（js/energy.js）：起点 50，到昨天为止的 7 天，Build + Work + Chores 抽走（Deep ×3，60 小时 55 个点），娱乐 / 社交 / 健身达标各 +20 / +20 / +15
import { test } from "node:test";
import assert from "node:assert/strict";
import { energy, energyText, ENERGY } from "../js/energy.js";

const groups = [{ name: "Build", grow: "all" }, { name: "Work", grow: "all" }, { name: "Chores", grow: "" }, { name: "Fitness", grow: "all" }, { name: "Leisure", grow: "deep" }, { name: "Friends", grow: "", friends: true }];
const t = (date, group, actual, extra = {}) => ({ id: date + group + actual + (extra.deep ? "d" : ""), date, group, status: "done", est: actual, actual, ...extra });
const ctx = (tasks) => ({ today: "2026-11-27", groups, items: [], projects: [], tasks });

test("an empty week stays at the start", () => {
  const x = energy(ctx([]));
  assert.equal(x.level, ENERGY.start);
  assert.deepEqual([x.from, x.to], ["2026-11-20", "2026-11-26"]);
  assert.deepEqual(x.backs.map((b) => [b.name, b.ok]), [["Leisure", false], ["Friends", false], ["Fitness", false]]);
});

test("60 effective hours take 55 points, deep hours count three times, today and the 8th day back don't count", () => {
  const sixty = [];
  for (let i = 0; i < 6; i++) sixty.push(t("2026-11-2" + i, i % 2 ? "Work" : "Build", 600));   // 20–25 号，每天 10 小时
  assert.equal(energy(ctx(sixty)).level, 0, "50 − 55 stops at 0");
  const x = energy(ctx([t("2026-11-26", "Build", 360), t("2026-11-25", "Chores", 120), t("2026-11-27", "Work", 600), t("2026-11-19", "Work", 600)]));
  assert.equal(x.hours, 8);
  assert.equal(x.level, Math.round(50 - 55 * 8 / 60));
  const deep = energy(ctx([t("2026-11-26", "Build", 600, { deep: true })]));
  assert.equal(deep.weighted, 30);
  assert.equal(deep.level, Math.round(50 - 55 * 30 / 60));
  assert.equal(energy(ctx([t("2026-11-26", "Leisure", 600)])).hours, 0, "leisure isn't effective time");
});

test("leisure, friends and fitness on track give back 20, 20 and 15 — a full, balanced week holds at 50", () => {
  const week = [t("2026-11-21", "Build", 1200, { deep: true })];   // 20 小时 Deep = 60 小时
  const back = [t("2026-11-22", "Leisure", 360), t("2026-11-23", "Fitness", 200)];
  const x = energy(ctx([...week, ...back]), { weekly: { relaxMin: 300, relaxMax: 1200 }, lastContact: "2026-11-18" });
  assert.deepEqual(x.backs.map((b) => b.pts), [20, 20, 15]);
  assert.equal(x.level, 50);
  assert.equal(energy(ctx(back), { weekly: { relaxMin: 300, relaxMax: 1200 }, lastContact: "2026-11-18" }).level, 100, "rest only, capped at 100");
  assert.equal(energy(ctx([]), { lastContact: "2026-11-10" }).backs[1].ok, false, "more than two weeks since the last catch-up");
  assert.match(energyText(x), /^Energy 50% — the 7 days to yesterday\. Starts at 50; Build \+ Work \+ Chores 20h \(20h deep, counted ×3 = 60h\) takes 55/);
});
