// 灵感池的纯计算（Projects 页的 Ideas）：想去哪玩、想吃什么、想参加什么活动。没有时长，大多也没有期限。
// 一条灵感：{ id, text, kind: 见 KINDS | ""（还没归类）, date: "YYYY-MM-DD" | ""（少数才有）,
//            by: true = 最晚这天 / 不是 = 就在这天, note, taskId（挑进了哪条任务）, order }
// 挑进某天的任务 = 在池子里划掉；任务标了 Later / Drop、或者删了 = 回到池子；
// 任务做完 = 去过了，这条就不要了：马上不再显示，过一周删掉（这一周里取消 Done、改成 Drop，它还回得来）。只算数，不碰页面和存储。

import { addDays, fmtShort, weekday, WEEKDAYS } from "./dates.js";

// 类别 = [key, emoji, 名字]：界面上只露 emoji，名字在分组标题和 title 里。
// 现场音乐归 🎭；户外、逛街市集这些不常去的都归 🛰️。以前的 Outing（"out"）当成 🎭（那时只有一条，是舞台剧），数据不改写
export const KINDS = [["stage", "🎭", "Stage & exhibitions"], ["trip", "✈️", "Travel"], ["eat", "🍽️", "Eat"], ["bar", "🍹", "Bars"], ["other", "🛰️", "Other"]];
const KEYS = KINDS.map(([k]) => k);
const OLD = { out: "stage" };
export const kindOf = (idea) => { const k = OLD[idea?.kind] || idea?.kind; return KEYS.includes(k) ? k : ""; };
export const emojiOf = (idea) => KINDS.find(([k]) => k === kindOf(idea))?.[1] || "";
// 每个类别下还能挑的有几条（筛选那一排的个数）；没归类的算在 "" 下
export function kindCounts(ideas, taskOf, today) {
  const out = {};
  for (const i of ideas) if (stateOf(i, taskOf, today) !== "done") out[kindOf(i)] = (out[kindOf(i)] || 0) + 1;
  return out;
}
const low = (s) => String(s ?? "").trim().toLowerCase();
export const sameText = (a, b) => low(a) === low(b);

// 挂着的那条任务还算不算数：在，而且没标 Delay / Drop
const live = (task) => Boolean(task) && task.status !== "delay" && task.status !== "drop";
const fin = (task) => task.status === "done";

// "done" 去过了（不再显示）/ "planned" 排进某天了 / "missed" 有日子、已经过了、没排 / "open" 在池子里
export function stateOf(idea, taskOf, today) {
  const t = idea.taskId ? taskOf(idea.taskId) : null;
  if (live(t)) return fin(t) ? "done" : "planned";
  return idea.date && idea.date < today ? "missed" : "open";
}

// 排在哪天；还在池子里的是空
export function dayOf(idea, taskOf) {
  const t = idea.taskId ? taskOf(idea.taskId) : null;
  return live(t) ? t.date : "";
}

// 还算数的：去过的不算（查重、数数用）
export const left = (ideas, taskOf, today) => ideas.filter((i) => stateOf(i, taskOf, today) !== "done");

// 可以删掉的：挂着的任务做完了，而且那条任务已经一周没再动过（now 是毫秒）
export const KEEP_DONE_DAYS = 7;
export function stale(ideas, taskOf, now) {
  return ideas.filter((i) => { const t = i.taskId ? taskOf(i.taskId) : null; return live(t) && fin(t) && now - (Number(t.updated) || 0) > KEEP_DONE_DAYS * 864e5; });
}

// 「on Sat Oct 17」/「by Oct 25」；没有日子是空
export const whenText = (idea) => (idea.date ? (idea.by ? "by " : "on " + WEEKDAYS[weekday(idea.date)] + " ") + fmtShort(idea.date) : "");

// 有日子的按日子，没有的新加的在前
const byDate = (a, b) => (a.date || "9999").localeCompare(b.date || "9999") || (Number(b.order) || 0) - (Number(a.order) || 0);
const RANK = { open: 0, missed: 1, planned: 2 };

// 整页的样子 → { groups: [{ kind, emoji, title, items: [{ idea, state, day }] }], open }（去过的不在里面）
//   groups：没归类的（Unsorted）在最前，然后照 KINDS 的顺序，空的不列；组里先是还在池子里的，过了日子的、已经排了的沉到后面
//   open：还能挑的有几条
export function board(ideas, taskOf, today) {
  const rows = ideas.map((idea) => ({ idea, state: stateOf(idea, taskOf, today), day: dayOf(idea, taskOf) })).filter((r) => r.state !== "done");
  const groups = [["", "", "Unsorted"], ...KINDS].map(([kind, emoji, title]) => ({ kind, emoji, title,
    items: rows.filter((r) => kindOf(r.idea) === kind).sort((a, b) => RANK[a.state] - RANK[b.state] || byDate(a.idea, b.idea)) })).filter((g) => g.items.length);
  return { groups, open: rows.filter((r) => r.state !== "planned").length };
}

// 有日子、还没过（今天也算）、还没排的，近的在前（日历的任务池里列的就是这些；过了日子的不列，不催）
export function upcoming(ideas, taskOf, today) {
  return ideas.filter((i) => i.date && i.date >= today && stateOf(i, taskOf, today) === "open").sort(byDate);
}

// 快到日子、还没排的：今天起 days 天以内，近的在前
export function soon(ideas, taskOf, today, days = 7) {
  const until = addDays(today, days);
  return upcoming(ideas, taskOf, today).filter((i) => i.date <= until);
}

// 放到某天时默认占多久（分钟）：看演出 / 吃一顿 / 喝一杯算半天，出去玩一整天，别的四小时，还没归类的先按一小时
const EST = { stage: 180, trip: 480, eat: 180, bar: 180, other: 240, "": 60 };
export const defaultEst = (idea) => EST[kindOf(idea)];

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
