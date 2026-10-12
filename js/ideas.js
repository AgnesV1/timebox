// 灵感池的纯计算（Projects 页的 Ideas）：想去哪玩、想吃什么、想参加什么活动。没有时长，大多也没有期限。
// 一条灵感：{ id, text, kind: "event" | "eat" | "go" | ""（还没归类）, date: "YYYY-MM-DD" | ""（少数才有）,
//            by: true = 最晚这天 / 不是 = 就在这天, note, taskId（挑进了哪条任务）, doneAt（那条任务做完的那天）, order }
// 挑进某天的任务 = 在池子里划掉；任务做完 = 去过了；任务标了 Later / Drop、或者删了 = 回到池子。只算数，不碰页面和存储。

import { addDays, fmtShort, weekday, WEEKDAYS } from "./dates.js";

export const KINDS = [["event", "Event"], ["eat", "Eat"], ["go", "Go"]];
const KEYS = KINDS.map(([k]) => k);
export const kindOf = (idea) => (KEYS.includes(idea?.kind) ? idea.kind : "");
const low = (s) => String(s ?? "").trim().toLowerCase();
export const sameText = (a, b) => low(a) === low(b);

// 挂着的那条任务还算不算数：在，而且没标 Later / Drop
const live = (task) => Boolean(task) && task.status !== "later" && task.status !== "drop";
const fin = (task) => task.status === "done" || task.status === "partial";

// "done" 去过了 / "planned" 排进某天了 / "missed" 有日子、已经过了、没排 / "open" 在池子里
export function stateOf(idea, taskOf, today) {
  if (idea.doneAt) return "done";
  const t = idea.taskId ? taskOf(idea.taskId) : null;
  if (live(t)) return fin(t) ? "done" : "planned";
  return idea.date && idea.date < today ? "missed" : "open";
}

// 排在哪天 / 哪天去的；还在池子里的是空
export function dayOf(idea, taskOf) {
  if (idea.doneAt) return idea.doneAt;
  const t = idea.taskId ? taskOf(idea.taskId) : null;
  return live(t) ? t.date : "";
}

// 「on Sat Oct 17」/「by Oct 25」；没有日子是空
export const whenText = (idea) => (idea.date ? (idea.by ? "by " : "on " + WEEKDAYS[weekday(idea.date)] + " ") + fmtShort(idea.date) : "");

// 有日子的按日子，没有的新加的在前
const byDate = (a, b) => (a.date || "9999").localeCompare(b.date || "9999") || (Number(b.order) || 0) - (Number(a.order) || 0);
const RANK = { open: 0, missed: 1, planned: 2 };

// 整页的样子 → { groups: [{ kind, title, items: [{ idea, state, day }] }], done: [{ idea, day }], open }
//   groups：没归类的（Unsorted）在最前，然后照 KINDS 的顺序，空的不列；组里先是还在池子里的，过了日子的、已经排了的沉到后面
//   done：去过的，最近的在前        open：还能挑的有几条
export function board(ideas, taskOf, today) {
  const rows = ideas.map((idea) => ({ idea, state: stateOf(idea, taskOf, today), day: dayOf(idea, taskOf) }));
  const left = rows.filter((r) => r.state !== "done");
  const groups = [["", "Unsorted"], ...KINDS].map(([kind, title]) => ({ kind, title,
    items: left.filter((r) => kindOf(r.idea) === kind).sort((a, b) => RANK[a.state] - RANK[b.state] || byDate(a.idea, b.idea)) })).filter((g) => g.items.length);
  const done = rows.filter((r) => r.state === "done").sort((a, b) => String(b.day).localeCompare(String(a.day)) || byDate(a.idea, b.idea));
  return { groups, done, open: left.filter((r) => r.state !== "planned").length };
}

// 快到日子、还没排的：今天起 days 天以内（过了的不算），近的在前
export function soon(ideas, taskOf, today, days = 7) {
  const until = addDays(today, days);
  return ideas.filter((i) => i.date && i.date >= today && i.date <= until && stateOf(i, taskOf, today) === "open").sort(byDate);
}

// 加任务时能挑的：还在池子里的；打了字就只要对得上的。有日子的在前，过了日子的在最后
export function match(ideas, taskOf, today, query = "", limit = 6) {
  const q = low(query);
  return ideas.map((idea) => ({ idea, state: stateOf(idea, taskOf, today) }))
    .filter((r) => (r.state === "open" || r.state === "missed") && (!q || low(r.idea.text).includes(q)))
    .sort((a, b) => RANK[a.state] - RANK[b.state] || byDate(a.idea, b.idea)).slice(0, limit).map((r) => r.idea);
}

// 粘进来的几行 = 几条：空行不算，行首的 - • * 1. 去掉；池子里已经有的（不分大小写）、这次粘重了的不再加
export function parseLines(text, have = []) {
  const seen = new Set(have.map((i) => low(i.text)));
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const t = raw.replace(/^\s*(?:[-•*·]|\d+[.)、])\s*/, "").trim();
    if (!t || seen.has(low(t))) continue;
    seen.add(low(t));
    out.push(t);
  }
  return out;
}
