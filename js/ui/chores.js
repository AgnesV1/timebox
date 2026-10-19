// Chore 键（今天页列表顶上那一行，手机电脑都有）：按一下开始计时，再按一下停；每天一条 Chores 任务，每按一次多一段（store.js 的 startChore）。
// 计时中旁边五个 emoji 是这一段的记号（🍳 做饭 / ☎️ 邮件电话 / 🗃️ 整理材料、提交 / 🪪 证件这类必须办的 / 🏠 家务、收拾房间），点一下选、再点一下清掉，不选就是没分类。
// 记下的按记号并成小块跟在键前面：「🍳 40m ×3 · ☎️ 25m · 8m = 1h 13m」，放不下才折行；点小块展开每一段（改钟点、换记号、删）。计时中这些先收起来。
// 过去的日子只剩记下的那一行，以后的日子不画。这条任务不进普通的任务列表。

import * as store from "../store.js";
import { esc } from "../dom.js";
import { fmtMin } from "../dates.js";
import { groupTags } from "../times.js";
import { toast } from "./common.js";
import { elapsed } from "./timer.js";
import { timeEditHTML, timeRangeHTML, timeEditing } from "./today.js";

export const CHORE_TAGS = [["🍳", "Cooking"], ["☎️", "Emails, calls, messages"], ["🗃️", "Paperwork and filing"], ["🪪", "ID and must-dos"], ["🏠", "Housework and tidying"]];
let open = "";   // 展开着每一段的那一天

// 四个记号：cur = 选着的那个；act 决定改的是正在跑的这一段，还是记下的某一段（tid）
function tagsHTML(act, cur, tid = "") {
  return '<span class="chore-tags">' + CHORE_TAGS.map(([e, name]) => '<button type="button" class="chip' + (cur === e ? " on" : "") + '" data-act="' + act + '" data-v="' + e + '"' +
    (tid ? ' data-tid="' + esc(tid) + '"' : "") + ' aria-pressed="' + (cur === e) + '" title="' + esc(name) + '" aria-label="' + esc(name) + '">' + e + "</button>").join("") + "</span>";
}
// 浮条上（计时的是 Chores 时）：不要 Deep 那个按钮；记号在今天页那一行上点（浮条上再放四个，手机上要折成三行）
export const choreDockHTML = () => "";

export function choreHTML(c, d) {
  const id = store.choreId(d), list = store.timeOf(id), run = store.timer(), live = run?.taskId === id;
  const isToday = d === c.today;
  if (!isToday && !list.length) return "";
  const groups = groupTags(list), total = list.reduce((a, x) => a + x.min, 0);
  // 计时中只留四个记号、走着的时间和键（手机上一行放得下），合计等停了再出来
  const sum = list.length && !live ? '<button type="button" class="chore-sum" data-act="chore-open" aria-expanded="' + (open === d) + '" title="Each time">' +
    groups.map((g) => '<span class="chore-cc">' + (g.tag ? g.tag + " " : "") + fmtMin(g.min) + (g.n > 1 ? " ×" + g.n : "") + "</span>").join("") +
    '<b class="num">= ' + fmtMin(total) + "</b></button>" : "";
  const key = isToday ? (live ? tagsHTML("chore-tag", run.tag || "") + '<b class="num chore-time" data-since="' + run.start + '">' + elapsed(run.start) + "</b>" : '<span class="chore-k">Chore</span>') +
    '<button type="button" class="chore-key' + (live ? " run" : "") + '" data-act="chore-key" aria-label="' + (live ? "Stop the chore timer" : "Start timing a chore") + '">' + (live ? '<i class="sq"></i>' : '<i class="tri"></i>') + "</button>" : "";
  const each = open === d && list.length ? '<div class="chore-each">' + list.map((x) => (timeEditing() === x.id && x.from ? timeEditHTML(x)
    : '<span class="tm">' + timeRangeHTML(x) + fmtMin(x.min) + tagsHTML("chore-seg-tag", x.tag || "", x.id) +
      '<button type="button" class="tm-x" data-act="time-del" data-tid="' + x.id + '" aria-label="Delete this time">×</button></span>')).join("") + "</div>" : "";
  return '<div class="chore' + (live ? " live" : "") + '" data-chore="' + d + '"><div class="chore-line">' + sum + key + "</div>" + each + "</div>";
}

export function initChores(rerender) {
  document.addEventListener("click", (e) => {
    const el = e.target.closest?.("[data-act]");
    if (!el || !el.closest(".chore, #dock")) return;
    const act = el.dataset.act;
    if (act === "chore-key") {
      const r = store.timer();
      if (r?.taskId === store.choreId(store.today())) {
        const done = store.stopTimer();
        if (done && !done.error) toast(done.min < 1 ? "Under a minute — not logged" : "Logged " + fmtMin(done.min) + " of chores");
      } else {
        const logged = store.startChore();
        if (logged?.min) toast("Logged " + fmtMin(logged.min) + " on the last one");
      }
    } else if (act === "chore-tag") store.setTimerTag(el.dataset.v);
    else if (act === "chore-seg-tag") store.tagTime(el.dataset.tid, el.dataset.v);
    else if (act === "chore-open") { const d = el.closest("[data-chore]").dataset.chore; open = open === d ? "" : d; rerender(); }
  });
}
