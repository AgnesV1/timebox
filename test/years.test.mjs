// Spending 的 All years：每年年底的余额、收入、支出，按 CPI 和固定汇率折成基准年（2021）的钱，再写成「基准年的几倍」
import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "../js/years.js";

test("defaults: base 2021, 4% a year, fixed rates, and where she lived (Hong Kong in 2018–2019)", () => {
  const cfg = Y.settings(undefined);
  assert.equal(cfg.base, 2021);
  assert.equal(cfg.cpi, 4);
  assert.deepEqual([cfg.rates.cny, cfg.rates.hkd, cfg.rates.aud, cfg.rates.cad], [1, 0.9, 5, 5]);
  assert.deepEqual(cfg.homes.map((h) => [h.from, h.place, h.cur]), [["2017-01", "Australia", "aud"], ["2018-01", "Hong Kong", "hkd"], ["2020-01", "China", "cny"], ["2023-09", "Canada", "cad"]]);
  assert.deepEqual(Y.homesIn(cfg.homes, 2019).map((h) => h.place), ["Hong Kong"]);
  assert.deepEqual(Y.homesIn(cfg.homes, 2023).map((h) => h.place), ["China", "Canada"], "moved mid-year: both");
  assert.equal(Y.homeAt(cfg.homes, "2016-05").place, "Australia", "before the first line counts as the first");
});

test("year-end totals: several currencies, k / 万, symbols; no currency = where she lived", () => {
  assert.deepEqual(Y.parseTotal("52,000 CAD + 3万 RMB + ¥1200").parts, [{ v: 5200000, cur: "cad" }, { v: 3000000, cur: "cny" }, { v: 120000, cur: "cny" }]);
  assert.deepEqual(Y.parseTotal("45k", "hkd").parts, [{ v: 4500000, cur: "hkd" }]);
  assert.deepEqual(Y.parseTotal("-1200 A$").parts, [{ v: -120000, cur: "aud" }]);
  assert.deepEqual(Y.parseTotal("12 apples").bad, ["12 apples"]);
  assert.equal(Y.bagText({ cny: 3000000, cad: 5200000 }), "$52,000 + ¥30,000");
});

test("CPI: 4% a year by default, one year can differ; earlier money is worth more in 2021 money", () => {
  const cfg = Y.settings({ cpiBy: { 2022: 6 } });
  assert.equal(Y.cpiFactor(cfg, 2021), 1);
  assert.ok(Math.abs(Y.cpiFactor(cfg, 2019) - 1.04 * 1.04) < 1e-9);
  assert.ok(Math.abs(Y.cpiFactor(cfg, 2023) - 1 / (1.06 * 1.04)) < 1e-9);
});

test("each year: totals in base-year money as a multiple of 2021; income and spending against their own 2021", () => {
  const entries = [
    { d: "2019-03-01", v: 1000000, cur: "hkd" }, { d: "2019-05-01", v: -500000, cur: "hkd" },
    { d: "2021-02-01", v: 10000000, cur: "cny" }, { d: "2021-06-01", v: -6000000, cur: "cny" },
    { d: "2024-02-01", v: 2000000, cur: "cad" }, { d: "2024-03-01", v: -1500000, cur: "cad" }
  ];
  const r = Y.build(entries, { totals: { 2021: "100000 RMB", 2024: "30000 CAD" } }, "2026-11-26");
  assert.deepEqual(r.years.map((x) => x.y), [2019, 2020, 2021, 2022, 2023, 2024]);
  const at = (y) => r.years.find((x) => x.y === y);
  assert.equal(at(2021).x.total, 1);
  assert.equal(at(2021).x.inc, 1);
  // 2024：30000 加币 × 5 = 15 万人民币，折回 2021 年的钱 ÷ 1.04³
  assert.ok(Math.abs(at(2024).x.total - 1.5 / 1.04 ** 3) < 1e-9);
  assert.ok(Math.abs(at(2024).change - (1.5 / 1.04 ** 3 - 1)) < 1e-9, "change against the last year with a total");
  // 2019 收入 1 万港币 × 0.9 × 1.04² ÷ 2021 年的 10 万人民币
  assert.ok(Math.abs(at(2019).x.inc - 0.09 * 1.04 ** 2) < 1e-9);
  assert.ok(at(2019).early && !at(2021).early, "before the base year: rent wasn't recorded");
  assert.equal(at(2019).x.total, null, "no total entered: no point");
  assert.equal(Y.bagText(at(2019).inc), "HK$10,000");
  // 账本那条淡线：从第一个填了余额的年份（2021）起，加上之后每年的收入减支出
  assert.equal(at(2021).x.ledger, 1);
  assert.equal(at(2019).real.ledger, null);
  assert.ok(Math.abs(at(2024).x.ledger - (1 + (5000 * 5 * 100) / 1.04 ** 3 / 10000000)) < 1e-9);
  // 中间又填了一年：从那一年的数重新起算，不一路累加下去
  const again = Y.build(entries, { totals: { 2021: "100000 RMB", 2022: "200000 RMB", 2024: "30000 CAD" } }, "2026-11-26");
  const at2 = (y) => again.years.find((x) => x.y === y);
  assert.ok(Math.abs(at2(2022).x.ledger - 1) < 1e-9, "2022: 2021's total (already 2021 money), nothing saved on the ledger that year");
  assert.ok(Math.abs(at2(2023).x.ledger - 2 / 1.04) < 1e-9, "after 2022 it starts again from 2022's total");
});

test("nothing entered: no years; axis ticks are tidy multiples", () => {
  assert.deepEqual(Y.build([], {}, "2026-11-26").years, []);
  assert.deepEqual(Y.ticks(1.8), [0, 0.5, 1, 1.5, 2]);
  assert.equal(Y.times(1.3), "×1.3");
  assert.equal(Y.times(1), "×1");
  assert.equal(Y.times(0.857), "×0.86");
});
