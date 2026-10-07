// Local fake Apps Script endpoint, in memory. Builds the sheet the way a real one got here:
// an "old" v1 sheet → last version's Code.gs (git main) runs setup and gets some v2 data (Time rows,
// day capacity, a routine) → the current Code.gs runs setup, like pasting the new one in.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { load } from "../test/mock-gas.mjs";

const repo = fileURLToPath(new URL("..", import.meta.url));
const current = fileURLToPath(new URL("../Code.gs", import.meta.url));
let prevPath = current;
try {
  prevPath = path.join(os.tmpdir(), "kuzhouduan-prev-Code.gs");
  fs.writeFileSync(prevPath, execFileSync("git", ["show", (process.env.FAKE_FROM || "main") + ":Code.gs"], { cwd: repo }));
} catch { prevPath = current; }
const g = load(prevPath);
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
console.log("v1 → previous:", g.logs.join(" | "));

// 上一版留下的数据：计时记录、某天改过的可用时间、一个重复任务（整段都已经生成好）
{
  const S = "CHANGE_ME", all = g.post({ secret: S, pull: true, since: 0 }).pull.tables;
  const on = (d, title) => all.tasks.find((t) => t.date === d && t.title === title);
  const today = new Date(); today.setHours(today.getHours() - 4);
  const T = iso(new Date(today.getTime() - today.getTimezoneOffset() * 60000));
  const add = (iso0, n) => { const [y, m, d] = iso0.split("-").map(Number); return iso(new Date(Date.UTC(y, m - 1, d + n))); };
  const rule = { id: "seed-gym", title: "Gym", category: "Fun", projectId: "", optional: false, days: [0, 40, 0, 40, 0, 40, 0], start: add(T, -7), end: add(T, 30), skip: [], order: 1 };
  const rt = [];
  for (let k = -7; k <= 30; k++) {
    const d = add(T, k), wd = new Date(d + "T12:00:00Z").getUTCDay();
    if (rule.days[wd]) rt.push({ id: "rt:seed-gym:" + d, date: d, title: "Gym", est: 40, status: k < 0 ? "done" : "", order: 9, category: "Fun", updated: 1 });
  }
  const m4 = on("2026-10-03", "Module #4");
  g.post({ secret: S, push: { rows: {
    settings: [{ key: "routines", value: [rule], updated: 2 }],
    tasks: rt.concat(m4 ? [{ id: m4.id, actual: 50, updated: 3 }] : []),
    time: m4 ? [{ id: "seed-x1", date: m4.date, taskId: m4.id, from: "09:10", to: "09:40", min: 30, updated: 3 }, { id: "seed-x2", date: m4.date, taskId: m4.id, from: "", to: "", min: 20, updated: 3 }] : [],
    capacity: [{ date: add(T, 2), min: 90, updated: 3 }]
  } } });
}

// 现在这版 Code.gs 接手同一份表
Object.assign(g, load(current, g.ss));
g.sandbox.setup();
console.log("→ current:", g.logs.join(" | "));

// 一个假的阅读记录表格：在页面设置里填 https://docs.google.com/spreadsheets/d/FAKE-READING/edit
if (g.spreadsheet) {
  const sh = g.spreadsheet("https://docs.google.com/spreadsheets/d/FAKE-READING").insertSheet("Reading");
  [["Title", "Type", "Author", "Finished"], ["三体", "Novel", "刘慈欣", D("2025-03-01")], ["Severance", "TV", "", ""], ["Bad Blood", "Nonfiction", "", ""],
    ["Dune", "Novel", "", ""], ["The Rest Is History", "Podcast", "", ""], ["Hollow Knight", "Game", "", ""]].forEach((r, i) => r.forEach((v, j) => sh.put(i + 1, j + 1, v)));
}

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
