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
  assert.equal(Y.bagText({ cny: 2452000, cad: -876000 }, true), "+¥24,520 · −$8,760", "a balance: each currency with its own sign");
});

test("CPI: 4% a year by default, one year can differ; earlier money is worth more in 2021 money", () => {
  const cfg = Y.settings({ cpiBy: { 2022: 6 } });
  assert.equal(Y.cpiFactor(cfg, 2021), 1);
  assert.ok(Math.abs(Y.cpiFactor(cfg, 2019) - 1.04 * 1.04) < 1e-9);
  assert.ok(Math.abs(Y.cpiFactor(cfg, 2023) - 1 / (1.06 * 1.04)) < 1e-9);
});

test("each year: balance, income and spending in base-year money, all against what a year cost in 2021", () => {
  const entries = [
    { d: "2019-03-01", v: 1000000, cur: "hkd" }, { d: "2019-05-01", v: -1500000, cur: "hkd" },
    { d: "2021-02-01", v: 10000000, cur: "cny" }, { d: "2021-06-01", v: -8000000, cur: "cny" },
    { d: "2024-02-01", v: 1000000, cur: "cad" }, { d: "2024-03-01", v: -2000000, cur: "cad" }
  ];
  const r = Y.build(entries, { totals: { 2024: "30000 CAD" } }, "2026-11-26");
  assert.deepEqual(r.years.map((x) => x.y), [2019, 2020, 2021, 2022, 2023, 2024]);
  assert.equal(r.unitYear, 2021);
  const at = (y) => r.years.find((x) => x.y === y);
  assert.equal(at(2021).x.out, 1, "×1 = what 2021 cost");
  assert.equal(at(2021).x.inc, 1.25);
  assert.equal(at(2021).x.bal, 0.25, "balance on the same scale: income − spending");
  // 2024：只花不挣的那种年份，结余在轴下面。1 万加币 − 2 万加币 = −1 万 × 5 = −5 万人民币，折回 2021 年的钱 ÷ 1.04³，除以 2021 年的 8 万
  assert.ok(Math.abs(at(2024).x.bal - -50000 / 1.04 ** 3 / 80000) < 1e-9);
  assert.ok(Math.abs(at(2024).x.total - 150000 / 1.04 ** 3 / 80000) < 1e-9, "a year-end total, when typed in, uses the same scale");
  // 2019：港币 × 0.9，再乘 1.04²
  assert.ok(Math.abs(at(2019).x.bal - -5000 * 0.9 * 1.04 ** 2 / 80000) < 1e-9);
  assert.ok(at(2019).early && !at(2021).early, "before the base year: rent wasn't recorded");
  assert.equal(at(2020).x.bal, null, "nothing recorded: no bar");
  assert.equal(Y.bagText(at(2019).net), "−HK$5,000");
  // 基准年没有账：尺子用离它最近、有支出的那一年
  const moved = Y.build(entries, { base: 2022 }, "2026-11-26");
  assert.equal(moved.unitYear, 2021);
});

test("a new year shows up once it begins; the total since the first record, up to today, in one currency", () => {
  const entries = [{ d: "2017-03-01", v: 100000, cur: "aud" }, { d: "2026-02-01", v: -50000, cur: "cad" }, { d: "2026-12-30", v: -1000, cur: "cad" }, { d: "2027-01-01", v: -145000, cur: "cad" }];
  assert.deepEqual(Y.build(entries, {}, "2026-11-26").years.map((r) => r.y).slice(-1), [2026], "next January's rent written down early doesn't add 2027 yet");
  assert.equal(Y.build(entries, {}, "2027-01-02").years.at(-1).y, 2027);
  const conv = (v, cur) => (cur === "aud" ? Math.round(v * 0.9) : v);
  assert.deepEqual(Y.totalSince(entries, "2026-11-26", conv), { from: 2017, inc: 90000, out: 50000, net: 40000, n: 2 }, "records dated after today don't count yet");
  assert.equal(Y.totalSince([], "2026-11-26", conv), null);
});

test("records in each place by currency: the Hong Kong years typed as another currency show up to be fixed", () => {
  const homes = Y.parseHomes(Y.DEFAULT_HOMES);
  const entries = [{ id: "a", d: "2017-05-01" , cur: "aud" }, { id: "b", d: "2018-03-01" }, { id: "c", d: "2019-12-31", cur: "hkd" }, { id: "d", d: "2019-07-01" }, { id: "e", d: "2023-09-02" }, { id: "f", d: "2023-08-30", cur: "cny" }];
  const by = Y.recordsByHome(entries, homes);
  assert.deepEqual(by.map((x) => [x.home.place, x.total]), [["Australia", 1], ["Hong Kong", 3], ["China", 1], ["Canada", 1]]);
  assert.deepEqual(by[1].by, { cad: ["b", "d"], hkd: ["c"] }, "no currency = CAD");
  assert.equal(by[1].to, "2020-01");
});

test("nothing entered: no years; axis ticks are tidy multiples", () => {
  assert.deepEqual(Y.build([], {}, "2026-11-26").years, []);
  assert.deepEqual(Y.ticks(1.8), [0, 0.5, 1, 1.5, 2]);
  assert.equal(Y.times(1.3), "×1.3");
  assert.equal(Y.times(1), "×1");
  assert.equal(Y.times(0.857), "×0.86");
  assert.equal(Y.signedTimes(-0.3), "−×0.3");
  assert.equal(Y.signedTimes(0), "0");
  assert.deepEqual(Y.ticksAround(0.8), [-1, -0.5, 0, 0.5, 1]);
});

test("the balance line passes every point and never overshoots a turn", () => {
  const d = Y.smooth([{ x: 0, y: 0 }, { x: 10, y: -20 }, { x: 20, y: 15 }, { x: 30, y: 5 }]);
  assert.match(d, /^M0 0C/);
  assert.match(d, / [\d.]+ -20 10 -20C/, "a peak: the curve arrives flat");
  assert.equal(Y.smooth([{ x: 0, y: 1 }]), "M0 1");
});
