// Friends 页的纯计算：上次联系是哪天、谁有该做的事、筛选。
// 一个人：{ id, name, more: { 字段名: 值 }（字段是用户自己定的，名字不在代码里）, next（接下来做什么）, nextDate（哪天）}
// 一次记录：{ id, date, friends: [id], note, watch, taskId }；从任务里带出来的那条 id = mt:<任务 id>

export const meetId = (taskId) => "mt:" + taskId;
const low = (s) => String(s ?? "").trim().toLowerCase();

// 算不算已经见过：日期不晚于今天，而且它连着的任务没有标 Later / Drop
export function happened(meet, today, statusOf = () => "") {
  if (!meet?.date || meet.date > today) return false;
  const st = meet.taskId ? statusOf(meet.taskId) : "";
  return st !== "later" && st !== "drop";
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
// todo = "has" 有事要做 / "late" 过期了；seen = "30" / "90" 这么多天没联系 / "never" 从没记过
export function filter(friends, { q = "", where = [], todo: td = "", seen = "" } = {}, last = {}, today = "") {
  const needle = low(q);
  return friends.filter((f) => {
    if (needle && !low(f.name).includes(needle) && !Object.values(f.more || {}).some((v) => low(v).includes(needle)) && !low(f.next).includes(needle)) return false;
    for (const w of where) if (w.field && low(w.value) && !low(f.more?.[w.field]).includes(low(w.value))) return false;
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

// 从表格里复制出来的几行（一格一个 Tab）→ [{ name, values: [按字段顺序的那几格], meets: [{ date, note }] }]。
// 第一格是名字，后面 fieldCount 格是资料，再后面带日期的每格算一次记录（不带日期的并进最后一个字段，免得丢）。
// 同一个名字出现几行就并成一个人：后面那行填了的格子为准，记录不重复
export function parseImport(text, fieldCount, year) {
  const out = new Map();
  for (const line of String(text || "").split(/\r?\n/)) {
    const cells = line.split("\t").map((c) => c.trim()), name = cells[0];
    if (!name || (!out.size && low(name) === "name")) continue;   // 空行、表头那行不要
    if (!out.has(low(name))) out.set(low(name), { name, values: Array(fieldCount).fill(""), meets: [] });
    const row = out.get(low(name));
    cells.slice(1, 1 + fieldCount).forEach((v, i) => { if (v) row.values[i] = v; });
    for (const c of cells.slice(1 + fieldCount)) {
      if (!c) continue;
      const d = parseDated(c, year);
      if (d) { if (!row.meets.some((x) => x.date === d.date && x.note === d.note)) row.meets.push(d); }
      else if (fieldCount && !row.values[fieldCount - 1].split(" · ").includes(c)) row.values[fieldCount - 1] = [row.values[fieldCount - 1], c].filter(Boolean).join(" · ");
    }
  }
  return [...out.values()];
}

// 一行一个的字段清单 → 数组（去掉空行和重复的）
export function parseFields(text) {
  const out = [];
  for (const line of String(text || "").split("\n")) { const v = line.trim(); if (v && !out.some((x) => low(x) === low(v))) out.push(v); }
  return out;
}
