// 计时
// 正在跑的计时器存在 Settings 的 timer 里（{taskId, start, tag}），所以手机上开始、电脑上也能停。tag = 这一段的记号（Chore 的 emoji），停的时候写进那一段。
// 忘了按 / 停晚了：开始的钟点能往前挪（setTimerStart），也能按某个钟点停（stopTimer(at)），记下的那段能改头尾（editTime）。
// 每段时间记在任务自己的 times 里（js/times.js 的写法）：「09:10-09:40 30m; 20m」。
// 任务的实际分钟 = 这些加起来。每段的 id = 「任务 id#第几段」。
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样（读、写、撤销）。

import { parseTimes, formatTimes, sumTimes } from "../times.js";

export default function (core) {
  const { get, put, change, setting, prefs, addTask } = core;

  const timer = () => setting("timer", null);
  function timeOf(taskId) {
    const t = get("tasks", taskId);
    return t ? parseTimes(t.times).map((x, i) => ({ ...x, id: taskId + "#" + i, taskId, date: t.date })) : [];
  }
  const hasTime = (taskId) => timeOf(taskId).length > 0;
  const timeTotal = (taskId) => sumTimes(timeOf(taskId));

  const pad2 = (n) => String(n).padStart(2, "0");
  const clockOf = (ms) => { const d = new Date(ms); return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); };
  const clockNow = () => clockOf(Date.now());
  const toMin = (hm) => { const [h, m] = String(hm).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const fromMin = (v) => { const x = ((v % 1440) + 1440) % 1440; return pad2(Math.floor(x / 60)) + ":" + pad2(x % 60); };
  // 一天从 dayStartsAt 算起：凌晨 1 点排在晚上 11 点后面；没有钟点的排最后
  function clockKey(hm) { return hm ? (toMin(hm) - toMin(prefs().dayStartsAt) + 1440) % 1440 : 9999; }

  function setTimer(value) { put("settings", { id: "timer", key: "timer", value }); }

  // 「09:10」→ 毫秒：按 now 那天算；比 now 还晚就当是昨天的（计时跨过了零点）。离 now 超过 12 小时的不收（多半是填错了）
  function clockToMs(hm, now = Date.now()) {
    if (!/^\d{1,2}:\d{2}$/.test(String(hm || ""))) return null;
    const d = new Date(now), [h, m] = String(hm).split(":").map(Number);
    let ms = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
    if (ms > now + 30e3) ms -= 864e5;
    return now - ms > 12 * 36e5 ? null : ms;
  }

  function writeTimes(taskId, list) {
    const t = get("tasks", taskId);
    if (!t) return;
    const sorted = list.slice().sort((a, b) => clockKey(a.from || a.to) - clockKey(b.from || b.to));
    // Chore 键那条（chore-日期）没有「打算做多久」：est 跟着记下的合计走
    put("tasks", { ...t, times: formatTimes(sorted), actual: sumTimes(sorted) || null, ...(String(taskId).startsWith("chore-") ? { est: sumTimes(sorted) } : {}) });
  }

  function addTime(taskId, min, to, from, tag = "") {
    const t = get("tasks", taskId);
    if (!t) return;
    writeTimes(taskId, [...parseTimes(t.times), { from: to ? from ?? fromMin(toMin(to) - min) : "", to: to || "", min, ...(tag ? { tag } : {}) }]);
  }

  // 开始：已经有一个在跑就先停下记好（和 Toggl 一样一次只跑一个）。tag = 这一段的记号（可以不给）
  function startTimer(taskId, tag = "") {
    if (!get("tasks", taskId) || timer()?.taskId === taskId) return;
    let logged = null;
    change(() => {
      logged = stopRunning();
      setTimer({ taskId, start: Date.now(), ...(tag ? { tag } : {}) });
    });
    return logged;
  }

  function stopRunning(at = Date.now()) {
    const r = timer();
    if (!r) return null;
    setTimer(null);
    const min = Math.round((at - Number(r.start)) / 60000);
    if (min < 1 || !get("tasks", r.taskId)) return { taskId: r.taskId, min: 0 };
    addTime(r.taskId, min, clockOf(at), clockOf(Number(r.start)), r.tag || "");
    return { taskId: r.taskId, min };
  }

  // 停下：返回记了多少分钟（不到 1 分钟不记）。at = 「其实几点就停了」（钟点），要在开始之后、现在之前；不对就返回 { error }
  function stopTimer(at = "") {
    const r = timer();
    let when = Date.now();
    if (at && r) {
      when = clockToMs(at);
      if (when === null || when > Date.now() + 30e3) return { error: "later" };
      if (when < Number(r.start)) return { error: "before" };
    }
    let logged = null;
    change(() => { logged = stopRunning(Math.min(when, Date.now())); });
    return logged;
  }

  // 「其实几点就开始了」：开始的钟点挪过去。比现在晚、离现在超过 12 小时的不收，返回 false
  function setTimerStart(hm) {
    const r = timer(), ms = clockToMs(hm);
    if (!r || ms === null || ms > Date.now()) return false;
    change(() => setTimer({ ...r, start: ms }));
    return true;
  }

  // 正在跑的这一段的记号（再点同一个 = 不要了）
  function setTimerTag(tag) {
    const r = timer();
    if (r) change(() => setTimer({ ...r, tag: r.tag === tag ? "" : tag }));
  }

  function discardTimer() {
    if (!timer()) return;
    change(() => setTimer(null), "Timer discarded");
  }

  // 手动补一段：用了多少分钟、几点结束（不填结束时间也行，只记分钟）
  function logTime(taskId, min, to) {
    min = Math.round(Number(min) || 0);
    if (min < 1 || !get("tasks", taskId)) return;
    change(() => addTime(taskId, min, to || ""), "Logged " + min + " min");
  }

  // 补记一段已经做完的：哪天、几点到几点（过了零点也算）。存成那天一条 Done 的任务，带这一段时间。返回任务 id
  function addLogged(fields, from, to) {
    const min = (((toMin(to) - toMin(from)) % 1440) + 1440) % 1440;
    if (min < 1) return "";
    let id = "";
    change(() => {
      id = addTask({ ...fields, est: min, actual: min, status: "done", times: formatTimes([{ from: fromMin(toMin(from)), to: fromMin(toMin(to)), min }]) });
    }, "Logged " + min + " min");
    return id;
  }

  // 一段的记号换一个（再点同一个 = 不要了）
  function tagTime(id, tag) {
    const i = String(id).lastIndexOf("#");
    const taskId = String(id).slice(0, i), n = Number(String(id).slice(i + 1));
    const list = parseTimes(get("tasks", taskId)?.times);
    if (!list[n]) return;
    list[n] = { ...list[n], tag: list[n].tag === tag ? "" : tag };
    change(() => writeTimes(taskId, list));
  }

  // 改一段的头尾（钟点）：分钟按新的头尾重算（过了零点也算）。不到 1 分钟不收，返回 false
  function editTime(id, from, to) {
    const i = String(id).lastIndexOf("#");
    const taskId = String(id).slice(0, i), n = Number(String(id).slice(i + 1));
    const list = parseTimes(get("tasks", taskId)?.times);
    const ok = (v) => /^\d{1,2}:\d{2}$/.test(String(v || ""));
    if (!list[n] || !ok(from) || !ok(to)) return false;
    const min = (((toMin(to) - toMin(from)) % 1440) + 1440) % 1440;
    if (min < 1) return false;
    list[n] = { ...list[n], from: fromMin(toMin(from)), to: fromMin(toMin(to)), min };
    change(() => writeTimes(taskId, list), "Time changed");
    return true;
  }

  function deleteTime(id) {
    const i = String(id).lastIndexOf("#");
    const taskId = String(id).slice(0, i), n = Number(String(id).slice(i + 1));
    const list = parseTimes(get("tasks", taskId)?.times);
    if (!list[n]) return;
    list.splice(n, 1);
    change(() => writeTimes(taskId, list), "Deleted time");
  }

  return { timer, timeOf, hasTime, timeTotal, clockOf, clockNow, startTimer, stopTimer, setTimerStart, setTimerTag, discardTimer, logTime, addLogged, tagTime, editTime, deleteTime, setTimer };
}
