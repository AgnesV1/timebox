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

let readingBook = null;
// GET /reading 看它现在的样子。一个假的阅读记录表格（一页一种，表头那行写着 Name）：在页面设置里填 https://docs.google.com/spreadsheets/d/FAKE-READING-0000000000000000/edit
if (g.spreadsheet) {
  const book = g.spreadsheet("https://docs.google.com/spreadsheets/d/FAKE-READING-0000000000000000");
  const tab = (name, rows) => { const sh = book.insertSheet(name); rows.forEach((r, i) => r.forEach((v, j) => sh.put(i + 1, j + 1, v))); return sh; };
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], faces = ["🥰", "🎉", "💢"];
  // 像真的那样带下拉：年份只到今年（记明年的会被拒绝），Book 的小类四种，Game 的两种
  const years = [0, 1, 2, 3].map((n) => String(new Date().getFullYear() - 3 + n));
  tab("Book", [["Year", "Month", "Name", "这一切真的值得吗"], [2024, "March", "《日常生活中的自我呈现》", "🥰", "book"], [2026, "February", "The Last Days Of Socrates", "🥰", "English", "论据都蛮棒的"]])
    .dropdown(1, years).dropdown(2, months).dropdown(4, faces).dropdown(5, ["book", "English", "image", "EN/book"]);
  tab("PodCast", [["Year", "Month", "Name", "这一切真的值得吗"], [2026, "April", "忽左忽右", "🎉"]]).dropdown(1, years).dropdown(2, months).dropdown(4, faces);
  tab("Fiction", [["Year", "Month", "Name", "这一切真的值得吗"], [2026, "May", "迷宫馆事件 by绫辻行人", "🎉"], [2026, "September", "《同学少年都不贱》by张爱玲", "🥰"]]).dropdown(1, years).dropdown(2, months).dropdown(4, faces);
  tab("TV", [[], ["Year", "Month", "Name", "这一切真的值得吗"], [2025, "May", "Severance", "🎉", "", "great"], ["", "", "奥本海默"]]);
  tab("Game", [["Year", "Month", "Name", "这一切真的值得吗"], [2026, "May", "古剑奇谭3", "🥰", "completed", "天行健"]]).dropdown(1, years).dropdown(2, months).dropdown(4, faces).dropdown(5, ["played", "completed"]);
  tab("etc", [["Year", "Month", "Name", "这一切真的值得吗"], [2026, "June", "something by hand", "🥰"]]);
  tab("Want", [["Name", "Type", "Vibe", "Note"], ["The Bear", "TV", "😊", "chef"], ["Dune", "Book", "🎉", ""], ["Hades II", "Game", "👀", ""]]);
  readingBook = book;
}

// 一个假的季度表格（一页一个季度，页名「2026 Q4」，表头写着 progress / focus，后面几列是每天自己打的分和 note）：
// 在页面设置的 Quarter sheet 里填 https://docs.google.com/spreadsheets/d/FAKE-QUARTER-0000000000000000/edit ；GET /quarter 看它现在的样子。
// Daily scores 那一格可以写：read · 6–10 · 6 nothing · 8 something · 10 really good（下一行 gym …、$ … 同样写法）
let quarterBook = null;
if (g.spreadsheet) {
  quarterBook = g.spreadsheet("https://docs.google.com/spreadsheets/d/FAKE-QUARTER-0000000000000000");
  const now = new Date(), y = now.getFullYear(), q = Math.floor(now.getMonth() / 3);
  const sh = quarterBook.insertSheet(y + " Q" + (q + 1));
  const rows = [["", "", "+", "-", "progress", "focus", "read", "gym", "$", "note"], ["", 1.25, 116, 50, 70, 0.4, 10, 15, 2, ""]];
  for (let d = new Date(y, q * 3, 1); d.getMonth() < q * 3 + 3 && d.getFullYear() === y; d.setDate(d.getDate() + 1)) rows.push([new Date(d), "", "", "", d < now - 2 * 864e5 ? 33 : "", d < now - 2 * 864e5 ? 0.1 : "", "", "", "", d < now - 2 * 864e5 ? "by hand" : ""]);
  rows.forEach((r, i) => r.forEach((v, j) => sh.put(i + 1, j + 1, v)));
}
// 一个假的记账表格（空的，第一次同步时脚本自己建好几页）：在页面设置的 Spending sheet 里填
// https://docs.google.com/spreadsheets/d/FAKE-SPEND-00000000000000000000/edit ；GET /spend 看它现在的样子
const spendBook = g.spreadsheet ? g.spreadsheet("https://docs.google.com/spreadsheets/d/FAKE-SPEND-00000000000000000000") : null;
const dump = (ss) => Object.fromEntries(ss.getSheets().map((sh) => [sh.getName(), sh.rows.slice(0, sh.getLastRow()).map((r) => r.slice(0, sh.getLastColumn()).map((v) => (v instanceof Date ? iso(new Date(v.getTime() - v.getTimezoneOffset() * 60000)) : v)))]));

http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Headers", "*"); res.end(); return; }
  if (req.method !== "POST" && req.url.startsWith("/reading")) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(readingBook ? dump(readingBook) : {})); return; }
  if (req.method !== "POST" && req.url.startsWith("/quarter")) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(quarterBook ? dump(quarterBook) : {})); return; }
  if (req.method !== "POST" && req.url.startsWith("/spend")) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(spendBook ? dump(spendBook) : {})); return; }
  if (req.method !== "POST" && req.url.startsWith("/dump")) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(dump(g.ss))); return; }
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
