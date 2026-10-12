// 计时
// 正在跑的计时器存在 Settings 的 timer 里（{taskId, start}），所以手机上开始、电脑上也能停。
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

  function writeTimes(taskId, list) {
    const t = get("tasks", taskId);
    if (!t) return;
    const sorted = list.slice().sort((a, b) => clockKey(a.from || a.to) - clockKey(b.from || b.to));
    put("tasks", { ...t, times: formatTimes(sorted), actual: sumTimes(sorted) || null });
  }

  function addTime(taskId, min, to, from) {
    const t = get("tasks", taskId);
    if (!t) return;
    writeTimes(taskId, [...parseTimes(t.times), { from: to ? from ?? fromMin(toMin(to) - min) : "", to: to || "", min }]);
  }

  // 开始：已经有一个在跑就先停下记好（和 Toggl 一样一次只跑一个）
  function startTimer(taskId) {
    if (!get("tasks", taskId) || timer()?.taskId === taskId) return;
    let logged = null;
    change(() => {
      logged = stopRunning();
      setTimer({ taskId, start: Date.now() });
    });
    return logged;
  }

  function stopRunning() {
    const r = timer();
    if (!r) return null;
    setTimer(null);
    const now = Date.now();
    const min = Math.round((now - Number(r.start)) / 60000);
    if (min < 1 || !get("tasks", r.taskId)) return { taskId: r.taskId, min: 0 };
    addTime(r.taskId, min, clockOf(now), clockOf(Number(r.start)));
    return { taskId: r.taskId, min };
  }

  // 停下：返回记了多少分钟（不到 1 分钟不记）
  function stopTimer() {
    let logged = null;
    change(() => { logged = stopRunning(); });
    return logged;
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

  function deleteTime(id) {
    const i = String(id).lastIndexOf("#");
    const taskId = String(id).slice(0, i), n = Number(String(id).slice(i + 1));
    const list = parseTimes(get("tasks", taskId)?.times);
    if (!list[n]) return;
    list.splice(n, 1);
    change(() => writeTimes(taskId, list), "Deleted time");
  }

  return { timer, timeOf, hasTime, timeTotal, clockOf, clockNow, startTimer, stopTimer, discardTimer, logTime, addLogged, deleteTime, setTimer };
}
