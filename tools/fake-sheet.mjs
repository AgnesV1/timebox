// Local fake Apps Script endpoint: runs Code.gs against an in-memory "old" sheet, migrated with setup().
import http from "node:http";
import { fileURLToPath } from "node:url";
import { load } from "../test/mock-gas.mjs";

const g = load(fileURLToPath(new URL("../Code.gs", import.meta.url)));
const D = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const iso = (d) => d.toISOString().slice(0, 10);
const t = g.ss.insertSheet("Tasks");
const rows = [["Date", "Task", "Est min", "Actual min", "Order", "Category", "Status", "Done order", "Reason", "Description"]];
const base = new Date(2026, 8, 21);
for (let k = 0; k < 12; k++) {
  const d = new Date(base); d.setDate(base.getDate() + k);
  rows.push([d, "Module #4", 45, k % 3 ? 50 : "", 1, "Main", k % 4 ? "Done" : "Partial｜tired", 1, "", ""]);
  rows.push([d, "Work 1: deck", 60, "", 2, "Work", k % 2 ? "Done" : "Later", 2, k % 2 ? "" : "meetings", ""]);
  rows.push([d, "Gym", 40, "", 3, "Fun", k % 3 ? "Done" : "Drop", 3, "", ""]);
  rows.push([d, "Read 30 pages", 30, "", 4, "Fun", k % 2 ? "" : "Done", "", "", ""]);
}
rows.push([D("2026-10-03"), "Module #4", 45, "", 1, "Main", "", "", "", "listening part 3"]);
rows.push([D("2026-10-03"), "Laundry", 20, "", 2, "Chore", "", "", "", ""]);
rows.push([D("2026-10-03"), "Read 30 pages", 30, "", 3, "Fun", "", "", "", ""]);
rows.forEach((r, i) => r.forEach((v, j) => t.put(i + 1, j + 1, v)));
const p = g.ss.insertSheet("Projects");
[["Project", "Group", "Planned min", "Status", "Spent min", "Progress"], ["Module #4", "Main - French", 1500, "Active", "", ""]]
  .forEach((r, i) => r.forEach((v, j) => p.put(i + 1, j + 1, v)));
g.sandbox.setup();
console.log("migrated:", g.logs.join(" | "));

http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Headers", "*"); res.end(); return; }
  if (req.method !== "POST") { res.setHeader("Content-Type", "application/json"); res.end(g.sandbox.doGet().getContent()); return; }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let out;
    try { out = g.sandbox.doPost({ postData: { contents: body } }).getContent(); }
    catch (e) { console.error(e); out = JSON.stringify({ error: String(e) }); }
    const parsed = JSON.parse(body || "{}");
    console.log(new Date().toISOString().slice(11, 19), "push", Object.entries(parsed.push?.rows || {}).map(([k, v]) => k + ":" + v.length).join(","), "del", (parsed.push?.deletes || []).length, "since", parsed.since);
    res.setHeader("Content-Type", "application/json");
    res.end(out);
  });
}).listen(8002, "127.0.0.1", () => console.log("fake sheet on http://127.0.0.1:8002/exec"));

// dump the Tasks sheet on demand: GET /dump
export { g };
