// Friends：人、每次的记录（见 js/friends.js）
// friends 表：{ name, more: { 字段名: 值 }, next, nextDate }；字段是自己定的（Settings 的 friend-fields，一行一个）。
// meets 表：{ date, friends: [id], note, watch, taskId }。任务带出来的那条 id = mt:<任务 id>：任务改日期它跟着改，任务删了一起删。
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样（读、写、撤销）。

import * as F from "../friends.js";

export default function (core) {
  const { all, get, put, drop, change, newId, today, setting } = core;

  const byLowName = (a, b) => String(a.name || "").toLowerCase().localeCompare(String(b.name || "").toLowerCase());
  const friends = () => all("friends").sort(byLowName);
  const meets = () => all("meets").sort((a, b) => String(b.date).localeCompare(String(a.date)) || (Number(b.updated) || 0) - (Number(a.updated) || 0));
  const meetOfTask = (taskId) => get("meets", F.meetId(taskId));

  // 字段清单：设置里排好的在前，再加表格里手动加出来的列
  function friendFields() {
    const out = (setting("friend-fields", []) || []).filter(Boolean).map(String);
    for (const f of all("friends")) for (const k of Object.keys(f.more || {})) if (!out.includes(k)) out.push(k);
    return out;
  }

  // 上次联系：{ 人的 id: 日期 }
  const lastContact = () => F.lastContact(all("meets"), today(), (taskId) => get("tasks", taskId)?.status || "");

  function saveFriend(row, label, opts) {
    const id = row.id || newId();
    change(() => put("friends", { name: "", more: {}, next: "", nextDate: "", ...(get("friends", id) || {}), ...row, id }), label, opts);
    return id;
  }

  // 删一个人：他的记录一起删（几个人一起的那条只把他拿掉）
  function deleteFriend(id) {
    change(() => {
      for (const m of all("meets")) {
        if (!(m.friends || []).includes(id)) continue;
        const left = m.friends.filter((x) => x !== id);
        if (left.length) put("meets", { ...m, friends: left });
        else drop("meets", m.id);
      }
      drop("friends", id);
    }, "Deleted");
  }

  function saveMeet(row, label, opts) {
    const id = row.id || newId();
    change(() => put("meets", { date: today(), friends: [], note: "", watch: "", taskId: "", ...(get("meets", id) || {}), ...row, id }), label, opts);
    return id;
  }

  function deleteMeet(id) {
    change(() => drop("meets", id), "Deleted");
  }

  // 任务带的那条记录：和谁（friends）、聊了什么（note）、要记住的（watch）。三样都空了就不留
  function setTaskMeet(taskId, patch, opts) {
    const t = get("tasks", taskId);
    if (!t) return;
    const id = F.meetId(taskId), cur = get("meets", id);
    const next = { date: t.date, friends: [], note: "", watch: "", ...(cur || {}), ...patch, id, taskId, date: t.date };
    const empty = !next.friends.length && !String(next.note).trim() && !String(next.watch).trim();
    if (empty && !cur) return;
    change(() => (empty ? drop("meets", id) : put("meets", next)), "", opts);
  }

  // 整片粘进来的（js/friends.js 的 parseImport）：按名字对上已有的人、把填了的格子补上（不清空原来的），没有的新建；
  // 带日期的那几句记进各自的记录里，一模一样的不重复记——同一片再粘一次什么都不会多。
  // added = 表头里新出现的字段名：接在字段清单后面
  function importFriends(rows, added = []) {
    const key = (s) => String(s || "").trim().toLowerCase();
    change(() => {
      const extra = added.filter((f) => f && !friendFields().includes(f));
      if (extra.length) put("settings", { id: "friend-fields", key: "friend-fields", value: [...friendFields(), ...extra] });
      const ids = new Map(all("friends").map((f) => [key(f.name), f.id]));
      for (const r of rows) {
        if (!key(r.name)) continue;
        let id = ids.get(key(r.name));
        const cur = id ? get("friends", id) : null, more = { ...(cur?.more || {}) };
        for (const [field, v] of Object.entries(r.values || {})) if (field && v) more[field] = v;
        if (!cur) { id = newId(); ids.set(key(r.name), id); put("friends", { id, name: r.name, more, next: "", nextDate: "" }); }
        else if (JSON.stringify(more) !== JSON.stringify(cur.more || {})) put("friends", { ...cur, more });
        for (const m of r.meets || []) {
          const dup = all("meets").some((x) => x.date === m.date && (x.note || "") === m.note && (x.friends || []).length === 1 && x.friends[0] === id);
          if (!dup) put("meets", { id: newId(), date: m.date, friends: [id], note: m.note, watch: "", taskId: "" });
        }
      }
    }, "Imported " + rows.length + (rows.length === 1 ? " person" : " people"));
  }

  // 特别的日子（生日、过节问候、关键日子，见 js/friends.js）：字段清单里哪个是哪个
  const friendSpecial = () => F.specialFields(friendFields());
  // 记号换过样子：还写着以前那两个的格子改成现在的（不出声，改过的下次同步写回表格）
  function adoptMarks() {
    const field = friendSpecial().marks || F.SPECIAL_NAME.marks;
    const stale = all("friends").filter((f) => F.freshMarks(f.more?.[field]) !== String(f.more?.[field] ?? ""));
    if (stale.length) change(() => stale.forEach((f) => put("friends", { ...f, more: { ...f.more, [field]: F.freshMarks(f.more[field]) } })), "", { quiet: true });
  }
  const occasionDone = (id) => Boolean(get("meets", id));
  // 到了日子点一下：在这个人的记录里记一条（id 是固定的，一年里这个日子只记一次）；再点一下 = 其实没做，把那条删掉
  function toggleOccasion(id, friendId, note) {
    if (get("meets", id)) { change(() => drop("meets", id), "Marked as not done"); return; }
    const f = get("friends", friendId);
    if (!f) return;
    change(() => put("meets", { id, date: today(), friends: [friendId], note: String(note || ""), watch: "", taskId: "" }), "Noted for " + (f.name || "them"));
  }

  function moveMeet(fromTask, toTask, date) {
    const m = get("meets", F.meetId(fromTask));
    if (!m) return;
    put("meets", { ...m, id: F.meetId(toTask), taskId: toTask, date });
    drop("meets", m.id);
  }

  // 该做的事做完了：在这个人的记录里记一条（今天 + 写的那句），再把这件事清掉
  function doneNext(friendId, note) {
    const f = get("friends", friendId);
    if (!f) return;
    change(() => {
      put("meets", { id: newId(), date: today(), friends: [friendId], note: String(note || "").trim(), watch: "", taskId: "" });
      put("friends", { ...f, next: "", nextDate: "" });
    }, "Logged with " + (f.name || "them"));
  }

  return { friends, meets, meetOfTask, friendFields, lastContact, saveFriend, deleteFriend, saveMeet, deleteMeet, setTaskMeet, importFriends, friendSpecial, adoptMarks, occasionDone, toggleOccasion, doneNext, moveMeet };
}
