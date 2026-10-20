// Friends 页的纯计算：上次联系是哪天、谁有该做的事、筛选。
// 一个人：{ id, name, more: { 字段名: 值 }（字段是用户自己定的，名字不在代码里）, next（接下来做什么）, nextDate（哪天）}
// 一次记录：{ id, date, friends: [id], note, watch, taskId }；从任务里带出来的那条 id = mt:<任务 id>

export const meetId = (taskId) => "mt:" + taskId;
const low = (s) => String(s ?? "").trim().toLowerCase();

// 算不算已经见过：日期不晚于今天，而且它连着的任务没有标 Delay / Drop
export function happened(meet, today, statusOf = () => "") {
  if (!meet?.date || meet.date > today) return false;
  const st = meet.taskId ? statusOf(meet.taskId) : "";
  return st !== "delay" && st !== "drop";
}

// 每个人上次联系的日子：{ id: "2026-10-01" }
export function lastContact(meets, today, statusOf) {
  const out = {};
  for (const m of meets) {
    if (!happened(m, today, statusOf)) continue;
    for (const id of m.friends || []) if (!out[id] || m.date > out[id]) out[id] = m.date;
  }
  return out;
}

// 有事要做的人：过期的在前，然后按日子，没写日子的最后。late = 已经过了那天；due = 到今天为止该做的有几个
export function todo(friends, today) {
  const list = friends.filter((f) => low(f.next)).map((f) => ({ friend: f, late: Boolean(f.nextDate) && f.nextDate < today, now: Boolean(f.nextDate) && f.nextDate <= today }))
    .sort((a, b) => (a.friend.nextDate || "9999").localeCompare(b.friend.nextDate || "9999") || low(a.friend.name).localeCompare(low(b.friend.name)));
  return { list, due: list.filter((x) => x.now).length };
}

// 某个字段现在都填过哪些值（筛选的下拉用），按出现次数多少排
export function valuesOf(friends, field) {
  const n = new Map();
  for (const f of friends) { const v = String(f.more?.[field] ?? "").trim(); if (v) n.set(v, (n.get(v) || 0) + 1); }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
}

const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);

// 筛选：q 搜名字和所有字段；where = [{ field, value }]（字段里包含这段字，几个条件都要满足）；
// todo = "has" 有事要做 / "late" 过期了；seen = "30" / "90" 这么多天没联系 / "never" 从没记过；
// marks = 只看带着这几个记号的人（记号存在 marksField 那个字段里）
export function filter(friends, { q = "", where = [], todo: td = "", seen = "", marks = [], marksField = "" } = {}, last = {}, today = "") {
  const needle = low(q);
  return friends.filter((f) => {
    if (needle && !low(f.name).includes(needle) && !Object.values(f.more || {}).some((v) => low(v).includes(needle)) && !low(f.next).includes(needle)) return false;
    for (const w of where) if (w.field && low(w.value) && !low(f.more?.[w.field]).includes(low(w.value))) return false;
    if (marks.length && !marks.every((m) => marksOf(f.more?.[marksField]).includes(m))) return false;   // 点亮了几个记号就都要有
    if (td === "has" && !low(f.next)) return false;
    if (td === "late" && !(low(f.next) && f.nextDate && f.nextDate < today)) return false;
    if (seen === "never" && last[f.id]) return false;
    if ((seen === "30" || seen === "90") && last[f.id] && daysBetween(last[f.id], today) < Number(seen)) return false;
    return true;
  });
}

// 「3 days ago」「today」「in 2 days」
export function ago(date, today) {
  if (!date) return "";
  const n = daysBetween(date, today);
  return n === 0 ? "today" : n === 1 ? "yesterday" : n > 1 ? n + " days ago" : n === -1 ? "tomorrow" : "in " + -n + " days";
}

// ---------- 从表格里整片粘进来 ----------

// 一格里带日期的一句：「5.17 coffee」「5/17 coffee」「2026-05-17 coffee」「20260517 coffee」→ { date, note }；不是这种写法返回 null。
// 没写年份的用 year
export function parseDated(cell, year) {
  const s = String(cell ?? "").trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:\s+(.*))?$/.exec(s) || /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:\s+(.*))?$/.exec(s);
  const n = m ? null : /^(\d{1,2})[./](\d{1,2})(?:\s+(.*))?$/.exec(s);
  if (!m && !n) return null;
  const [y, mo, d, note] = m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4]] : [Number(year), Number(n[1]), Number(n[2]), n[3]];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (!(y > 1999 && y < 2101) || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { date: y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0"), note: String(note || "").trim() };
}

// 从表格里复制出来的几行（一格一个 Tab）→ { rows: [{ name, values: { 字段名: 值 }, meets: [{ date, note }] }], fields, added, headed }。
// 每一列是什么：
//   第一行是表头（第一格写着 Name）就照表头来——哪一列的表头和哪个字段同名（不分大小写、空格和符号）就进哪个字段，
//   表头是新名字的算一个新字段（added），表头空着的列不算资料；
//   没有表头就按位置：名字后面的几格依次对应 fields。
// 不算资料的列里，带日期的每格算一次记录（「5.17 coffee」）；不带日期的并进 Note（没有就并进最后一个字段），免得丢。
// 同一个名字出现几行就并成一个人：后面那行填了的格子为准，记录不重复
const plain = (s) => low(s).replace(/[^\p{L}\p{N}]+/gu, "");
const NAME_HEADS = ["name", "名字", "姓名"];

export function parseImport(text, fields, year) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.split("\t").map((c) => c.trim())).filter((c) => c[0]);
  const known = (fields || []).map(String), added = [];
  const headed = lines.length > 0 && NAME_HEADS.includes(plain(lines[0][0]));
  // cols[i] = 名字后面第 i 格进哪个字段（空 = 不算资料）
  const cols = !headed ? known.slice() : lines[0].slice(1).map((h) => {
    if (!plain(h)) return "";
    const hit = [...known, ...added].find((f) => plain(f) === plain(h));
    if (!hit) added.push(h);
    return hit || h;
  });
  const all = [...known, ...added];
  const spare = all.find((f) => ["note", "notes", "备注"].includes(plain(f))) || [...cols].reverse().find(Boolean) || "";
  const out = new Map();
  for (const cells of headed ? lines.slice(1) : lines) {
    const name = cells[0];
    if (!out.has(low(name))) out.set(low(name), { name, values: {}, meets: [] });
    const row = out.get(low(name));
    cells.slice(1).forEach((c, i) => {
      if (!c) return;
      if (cols[i]) { row.values[cols[i]] = c; return; }
      const d = parseDated(c, year);
      if (d) { if (!row.meets.some((x) => x.date === d.date && x.note === d.note)) row.meets.push(d); }
      else if (spare && !String(row.values[spare] || "").split(" · ").includes(c)) row.values[spare] = [row.values[spare], c].filter(Boolean).join(" · ");
    });
  }
  return { rows: [...out.values()], fields: all, added, headed };
}

// 一行一个的字段清单 → 数组（去掉空行和重复的）
export function parseFields(text) {
  const out = [];
  for (const line of String(text || "").split("\n")) { const v = line.trim(); if (v && !out.some((x) => low(x) === low(v))) out.push(v); }
  return out;
}

// ---------- 特别的日子：生日、过节问候、自己记的关键日子 ----------
// 都记在这个人的资料里（more），三个字段的名字是固定的，值是一眼能看懂的文字，表格里也能直接改：
//   Birthday   「03-14」或「1995-03-14」
//   Greetings  「Christmas, New Year's Eve」——哪几个节要问候
//   Key dates  「06-20 graduation; 2027-05-01 moving day」——没写年份的每年都算
// Gift 是自己加的字段：填了东西的人，生日那条带上 🎁 和填的字。
// 到了日子点一下 = 在这个人的记录里记一条，记录的 id 是 oc:<人>:<哪个日子>:<哪一年>，所以每年每个日子只记一次、也不用另存「发过没有」。

const ALIASES = { birthday: ["birthday", "bday", "生日"], greet: ["greetings", "greeting", "greet", "问候"], dates: ["keydates", "dates", "节点", "关键节点"], gift: ["gift", "gifts", "礼物"], marks: ["marks", "mark", "标注", "记号"] };
export const SPECIAL_NAME = { birthday: "Birthday", greet: "Greetings", dates: "Key dates", marks: "Marks" };

// 三个记号：每个人可以点亮其中几个（各代表什么，用的人自己知道）。存在 Marks 字段里，值就是点亮的那几个连在一起
export const MARKS = ["🏛️", "🧠", "✨"];
const OLD_MARKS = { "🎩": "🏛️", "🫂": "✨" };   // 以前用的两个：格子里还写着的照样认，下次写回去就是新的
const bare = (s) => String(s ?? "").replace(/️/g, "");   // 🏛️ 带不带变体符都算
export const marksOf = (text) => {
  const t = bare(text);
  return MARKS.filter((m) => t.includes(bare(m)) || Object.keys(OLD_MARKS).some((old) => OLD_MARKS[old] === m && t.includes(old)));
};
export const formatMarks = (list) => MARKS.filter((m) => (list || []).includes(m)).join("");
// 格子里还写着以前的记号：换成现在的写法；没有就原样
export const freshMarks = (text) => (Object.keys(OLD_MARKS).some((old) => String(text ?? "").includes(old)) ? formatMarks(marksOf(text)) : String(text ?? ""));
export const toggleMark = (text, m) => { const have = marksOf(text); return formatMarks(have.includes(m) ? have.filter((x) => x !== m) : [...have, m]); };

// 字段清单里哪个是生日、问候、关键日子、礼物（名字不分大小写、空格）；没有的是空
export function specialFields(fields) {
  const out = {};
  for (const [k, names] of Object.entries(ALIASES)) out[k] = (fields || []).find((f) => names.includes(plain(f))) || "";
  return out;
}

const pad = (n) => String(n).padStart(2, "0");
const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
// 某一年的几月几号；2 月 29 号遇到平年算 28 号
const dayIn = (y, m, d) => y + "-" + pad(m) + "-" + pad(m === 2 && d === 29 && !leap(y) ? 28 : d);

// 春节（正月初一）的日子，照紫金山天文台的历表；除夕是前一天
const SPRING = { 2025: "01-29", 2026: "02-17", 2027: "02-06", 2028: "01-26", 2029: "02-13", 2030: "02-03", 2031: "01-23", 2032: "02-11", 2033: "01-31", 2034: "02-19", 2035: "02-08", 2036: "01-28", 2037: "02-15", 2038: "02-04", 2039: "01-24", 2040: "02-12" };
export function lunarEve(year) {
  let day = SPRING[year];
  if (!day) {
    // 表以外的年份：用浏览器自带的农历找正月初一（个别年份可能差一天）
    try {
      const f = new Intl.DateTimeFormat("en-u-ca-chinese", { month: "numeric", day: "numeric", timeZone: "UTC" });
      for (let t = Date.UTC(year, 0, 15); t < Date.UTC(year, 2, 1) && !day; t += 864e5) {
        const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
        if (p.month === "1" && p.day === "1") day = new Date(t).toISOString().slice(5, 10);
      }
    } catch { /* 没有农历就算不出来 */ }
  }
  if (!day) return "";
  return new Date(Date.UTC(year, Number(day.slice(0, 2)) - 1, Number(day.slice(3)) - 1)).toISOString().slice(0, 10);
}

export const HOLIDAYS = [
  { key: "teachers", name: "Teachers' Day", on: (y) => y + "-09-10" },
  { key: "christmas", name: "Christmas", on: (y) => y + "-12-25" },
  { key: "new-year-eve", name: "New Year's Eve", on: (y) => y + "-12-31" },
  { key: "lunar-eve", name: "Lunar New Year's Eve", on: lunarEve }
];

// 「3.14」「03-14」「3/14」「1995-03-14」「19950314」→ { y（没写是 0）, m, d }；看不懂返回 null
export function parseDay(text) {
  const s = String(text ?? "").trim();
  const full = /^(\d{4})(\d{2})(\d{2})$/.exec(s) || /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(s);
  const short = full ? null : /^(\d{1,2})[-./](\d{1,2})$/.exec(s);
  if (!full && !short) return null;
  const [y, m, d] = full ? [Number(full[1]), Number(full[2]), Number(full[3])] : [0, Number(short[1]), Number(short[2])];
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y || 2000, m, 0)).getUTCDate()) return null;
  return { y, m, d };
}
export const formatDay = (x) => (x ? (x.y ? x.y + "-" : "") + pad(x.m) + "-" + pad(x.d) : "");

// Key dates 那一格：「06-20 graduation; 2027-05-01 moving day」⇄ [{ y, m, d, label }]
export function parseDates(text) {
  return String(text ?? "").split(/[;\n]+/).map((part) => {
    const m = /^\s*(\S+)\s*(.*)$/.exec(part), day = m && parseDay(m[1]);
    return day ? { ...day, label: m[2].trim() } : null;
  }).filter(Boolean);
}
export const formatDates = (list) => (list || []).map((x) => formatDay(x) + (x.label ? " " + x.label : "")).join("; ");

// Greetings 那一格里勾了哪几个节
export function greetKeys(text) {
  const have = String(text ?? "").split(/[,;，、\n]+/).map(plain).filter(Boolean);
  return HOLIDAYS.filter((h) => have.includes(plain(h.name)) || have.includes(plain(h.key))).map((h) => h.key);
}
export const formatGreet = (keys) => HOLIDAYS.filter((h) => (keys || []).includes(h.key)).map((h) => h.name).join(", ");

const slug = (s) => plain(s).slice(0, 24) || "day";

// 一个人在 from..to 之间的日子：[{ id, friend, kind: birthday / holiday / date, key, label, date, gift }]
export function occasions(friend, names, from, to) {
  const more = friend.more || {}, out = [], years = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) years.push(y);
  const push = (kind, key, label, date, gift = "") => {
    if (date && date >= from && date <= to) out.push({ id: "oc:" + friend.id + ":" + key + ":" + date.slice(0, 4), friend, kind, key, label, date, gift });
  };
  const b = names.birthday ? parseDay(more[names.birthday]) : null;
  if (b) for (const y of years) push("birthday", "birthday", "Birthday", dayIn(y, b.m, b.d), names.gift ? String(more[names.gift] || "").trim() : "");
  for (const k of names.greet ? greetKeys(more[names.greet]) : []) {
    const h = HOLIDAYS.find((x) => x.key === k);
    for (const y of years) push("holiday", h.key, h.name, h.on(y));
  }
  for (const x of names.dates ? parseDates(more[names.dates]) : []) {
    for (const y of x.y ? [x.y] : years) push("date", "d" + pad(x.m) + pad(x.d) + "-" + slug(x.label), x.label || "Key date", dayIn(y, x.m, x.d));
  }
  return out;
}

// 接下来的日子（往后 ahead 天；过了还没做的往前留 back 天），同一天同一件事的人排在一起：
// → { groups: [{ date, label, kind, late, items: [{ ...occasion, done }] }], due: 三天之内（含过了的）还没做的有几个 }
export function comingUp(friends, names, today, { ahead = 30, back = 7 } = {}, isDone = () => false) {
  const shift = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const from = shift(today, -back), to = shift(today, ahead), soon = shift(today, 3);
  const groups = new Map();
  let due = 0;
  for (const f of friends) for (const oc of occasions(f, names, from, to)) {
    const done = Boolean(isDone(oc.id));
    if (oc.date < today && done) continue;   // 过去了、也做了的不用再看
    if (!done && oc.date <= soon) due++;
    const k = oc.date + "|" + oc.kind + "|" + low(oc.label);
    if (!groups.has(k)) groups.set(k, { date: oc.date, label: oc.label, kind: oc.kind, late: oc.date < today, items: [] });
    groups.get(k).items.push({ ...oc, done });
  }
  const list = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  for (const g of list) g.items.sort((a, b) => low(a.friend.name).localeCompare(low(b.friend.name)));
  return { groups: list, due };
}
