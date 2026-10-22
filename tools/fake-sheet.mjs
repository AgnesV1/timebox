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
const PORT = Number(process.env.FAKE_PORT) || 8002;
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

// 几个计划、一串目标：North star ← 2030 ← 2027 ← 今年 ← 这个季度 ← 这个月，近期的有计划 / 项目为它们服务（Projects 页悬停的连线要有东西画）
{
  const S = "CHANGE_ME", all = g.post({ secret: S, pull: true, since: 0 }).pull.tables;
  const now = new Date(); now.setHours(now.getHours() - 4);
  const T = iso(new Date(now.getTime() - now.getTimezoneOffset() * 60000)), y = Number(T.slice(0, 4)), m = Number(T.slice(5, 7)), q = Math.ceil(m / 3);
  const add = (n) => { const [a, b, c] = T.split("-").map(Number); return iso(new Date(Date.UTC(a, b - 1, c + n))); };
  const ym = (yy, mm) => yy + "-" + String(mm).padStart(2, "0");
  const m4 = (all.projects || []).find((p) => p.name === "Module #4");
  const plan = (id, name, group, color, deadline, items) => ({ row: { id, name, group, kind: "total", place: "pool", status: "active", deadline, early: 2, color, order: 5, updated: 4 },
    items: items.map(([title, est], i) => ({ id: id + "-i" + i, projectId: id, title, est, module: "", order: i + 1, updated: 4 })) });
  const plans = [
    plan("seed-b2", "B2 exam", "Build", "#2F5BFF", add(70), [["Listening drills", 300], ["Mock paper 1", 120], ["Mock paper 2", 120]]),
    plan("seed-port", "Portfolio site", "Build", "#FF3EA5", add(40), [["Case study: timebox", 240], ["Landing page", 180]]),
    plan("seed-q4", "Q4 report", "Work", "#FF8A00", add(25), [["Numbers", 120], ["Deck", 180]])
  ];
  const goal = (id, text, span, due, up, by = [], tag = "", done = "") => ({ key: "goal:" + id, value: { text, tag, span, due, done, order: id.length + text.length, up, by }, updated: 4 });
  // 上个月、上一季：已经过期、收进往期的那几条（做完的、没做完的都有）；B2 exam 还连着它们，悬停时线要越过它们接到还在的那一条
  const pm = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }, pq = q === 1 ? { y: y - 1, q: 4 } : { y, q: q - 1 };
  const goals = [
    goal("n1", "A steady, curious life", "north", "", ""),
    goal("n2", "French as a second home", "north", "", ""),
    goal("y4", "Live and work in French", "year", ym(y + 4, 12), "n2"),
    goal("y1", "C1 French certificate", "year", ym(y + 1, 12), "y4"),
    goal("y2", "Freelance on the side", "year", ym(y + 2, 12), "n1"),
    goal("t1", "Pass B2 (DELF)", "year", ym(y, 12), "y1", ["p:seed-b2"].concat(m4 ? ["p:" + m4.id] : [])),
    goal("t2", "Half marathon under 2h", "year", ym(y, 12), "n1", ["g:Fitness"], "Fitness"),
    goal("q1", "Mock exam ≥ 70 / 100", "quarter", ym(y, q * 3), "t1", ["p:seed-b2"]),
    goal("q2", "Ship the Q4 report on time", "quarter", ym(y, q * 3), "", ["p:seed-q4"], "Work"),
    goal("q3", "Launch the portfolio", "quarter", q === 4 ? ym(y + 1, 3) : ym(y, q * 3 + 3), "y2", ["p:seed-port"], "Build"),
    goal("m1", "Finish Module #4", "month", ym(y, m), "q1", m4 ? ["p:" + m4.id] : []),
    goal("m2", "See friends every two weeks", "month", ym(y, m), "n1", ["g:Friends"], "Friends"),
    goal("q0", "Mock exam ≥ 60 / 100", "quarter", ym(pq.y, pq.q * 3), "t1", ["p:seed-b2"], "", ym(pq.y, pq.q * 3)),
    goal("m0", "Finish Module #3", "month", ym(pm.y, pm.m), Math.ceil(pm.m / 3) === q && pm.y === y ? "q1" : "q0", ["p:seed-b2"], "", ym(pm.y, pm.m)),
    goal("m9", "Read two French novels", "month", ym(pm.y, pm.m), "t1", [], "Leisure")
  ];
  // 今天页：展开第一条看「For B2 exam → …」；第二条不展开，截悬停的样子用（哪天都有这两条，不管 Gym 那天排没排）
  const tasks = [{ id: "seed-t-b2", date: T, title: "Listening drills", est: 45, order: 0, projectId: "seed-b2", itemId: "seed-b2-i0", updated: 4 },
    { id: "seed-t-mail", date: T, title: "Reply to the landlord", est: 20, order: 1, group: "Chores", updated: 4 }];
  // Projects 右栏最上面那一段字：[ ] 里的就是上面那两条 North star
  const north = { key: "north-star", value: { text: "What I'm steering by: [A steady, curious life] — slow mornings to read and write, work that keeps teaching me something, and [French as a second home]. Money is a tool, not the point." }, updated: 4 };
  g.post({ secret: S, push: { rows: { projects: plans.map((p) => p.row), items: plans.flatMap((p) => p.items), settings: [...goals, north], tasks } } });
}

// FAKE_WORST=1（tools/look.mjs --worst）：再造一份极端数据，看名字很长、一天很多条、只有一两个字的时候界面撑不撑得住
if (process.env.FAKE_WORST) {
  const now = new Date(); now.setHours(now.getHours() - 4);
  const T = iso(new Date(now.getTime() - now.getTimezoneOffset() * 60000));
  const titles = [
    "Write the literature review for chapter three, including every figure, table and the appendix the committee asked for",
    "整理去年所有的报销单据、发票和银行流水，然后发给会计核对一遍再提交",
    "Supercalifragilistic-unbreakable-identifier-without-any-spaces-at-all-2026",
    "Jo",
    "Reply to 王老师 about the 课题 proposal（第二版）and attach the revised budget",
    "Gym", "Read 30 pages", "Laundry", "Call mom", "Fix the flaky test in the sync code", "Grocery run", "Plan the trip"
  ];
  const tasks = titles.map((title, i) => ({ id: "worst-" + i, date: T, title, est: [90, 45, 30, 5, 25, 40, 30, 20, 15, 60, 30, 45][i], order: i + 1,
    status: ["", "done", "delay", "drop", "", "done", "", "", "done", "", "", ""][i], actual: [0, 45, 10, 0, 0, 0, 12, 0, 15, 0, 0, 0][i] || null,
    times: [0, 45, 10, 0, 0, 0, 12, 0, 15, 0, 0, 0][i] ? [0, 45, 10, 0, 0, 0, 12, 0, 15, 0, 0, 0][i] + "m" : "", reason: i === 2 ? "waiting on the data" : "", group: ["Build", "Chores", "Work", "Friends", "Work", "Fitness", "Leisure", "Chores", "Friends", "Build", "Chores", "Leisure"][i], updated: 10 }));
  // 目标：这个月一栏 12 条（有很长的、中文的），North star 一条很长的
  const ym = T.slice(0, 7);
  const goals = Array.from({ length: 12 }, (_, i) => ({ key: "goal:worst-g" + i, value: { text: i === 0 ? "Get the whole literature review, every figure and the appendix the committee asked for, done and sent" : i === 1 ? "把去年所有的报销单据整理完交给会计" : "Small goal number " + (i + 1), tag: i % 3 ? "" : "Build", span: "month", due: ym, done: i === 5 ? ym : "", order: 100 + i, up: i < 4 ? "q1" : "", by: i < 2 ? ["p:seed-port"] : [] }, updated: 10 }));
  goals.push({ key: "goal:worst-north", value: { text: "Live somewhere quiet with time to read, cook slowly, and see the people I love without rushing", tag: "", span: "north", due: "", done: "", order: 200, up: "", by: [] }, updated: 10 });
  // North star 那一段：很长，一个框跨好几行，还有中文
  goals.push({ key: "north-star", value: { text: "这几年想清楚的事：[A steady, curious life]，以及 [Live somewhere quiet with time to read, cook slowly, and see the people I love without rushing]。\n\nWork should pay for the life, not eat it. Keep learning things that compound — [French as a second home], writing, cooking — and say no to almost everything else. 每年留出一整个月什么都不安排。" }, updated: 10 });
  g.post({ secret: "CHANGE_ME", push: { rows: { tasks, settings: goals } } });
  console.log("worst-case data:", tasks.length, "tasks,", goals.length, "goals on", T);
}

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
}).listen(PORT, "127.0.0.1", () => console.log("fake sheet on http://127.0.0.1:" + PORT + "/exec"));

// dump the Tasks sheet on demand: GET /dump
export { g };
