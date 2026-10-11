// 计时记录的文字写法，和加任务框里的一句话补记
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTimes, formatTimes, parseLogLine } from "../js/times.js";

test("times text round-trips", () => {
  const list = parseTimes("09:10-09:40 30m; 20m");
  assert.deepEqual(list, [{ from: "09:10", to: "09:40", min: 30 }, { from: "", to: "", min: 20 }]);
  assert.equal(formatTimes(list), "09:10-09:40 30m; 20m");
});

test("a line that ends in a time range is something already done", () => {
  assert.deepEqual(parseLogLine("Reading 14:00-15:10"), { title: "Reading", from: "14:00", to: "15:10" });
  assert.deepEqual(parseLogLine("Read 2:30-3"), { title: "Read", from: "02:30", to: "03:00" });
  assert.deepEqual(parseLogLine("Mock test 9–10:15"), { title: "Mock test", from: "09:00", to: "10:15" });
  assert.deepEqual(parseLogLine("Late call 23:30 - 0:20"), { title: "Late call", from: "23:30", to: "00:20" }, "past midnight is fine");
  assert.deepEqual(parseLogLine("Until midnight 22:00-24:00"), { title: "Until midnight", from: "22:00", to: "00:00" });
});

test("ordinary titles are left alone", () => {
  for (const text of ["Chapter 3-4", "Gym 40", "Gym 40m", "Call at 14:00", "14:00-15:00", "Run 25:00-26:00", "Nap 14:00-14:00", "Read 9:75-10", ""]) {
    assert.equal(parseLogLine(text), null, text);
  }
});
