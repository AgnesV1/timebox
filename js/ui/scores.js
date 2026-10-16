// 每天的打分（电脑今天页右栏，开始日到今天）：有哪几列、每列几档是 Settings 里自己写的那段（js/scores.js）。
// 一列一块：上面一行是名字、意思和一格只有下划线的数字（也能自己敲，0、7、9 都行，灰字是平常的范围），下面一行是几档
// （字，和名字左边对齐；点一下 = 填上那个数，再点一下 = 清掉）；底下一格 note。全是改完就存（change），
// 同步时写进季度表那天那一行（js/sync.js 的 quarter）。几列都有数了马上收成一行摘要，点 Edit 再展开、Done 收回去。
// 日历里还没填满的过去日子有红点（js/ui/calendar.js）。手机上没有这块。

import * as store from "../store.js";
import * as SC from "../scores.js";
import { esc, on } from "../dom.js";
import { toast } from "./common.js";

let editing = "";   // 点了 Edit 的那一天：填满了也先不收（换页就收回去）

export function scoreHTML(c, d) {
  const set = store.scoreSetup();
  if (!SC.inRange(set, d, c.today)) return "";
  const rec = store.scoreOf(d), v = rec?.v || {}, done = SC.filled(set.defs, v), msg = store.local().scoreNote;
  const head = '<div class="dsc-head"><span>' + (d === c.today ? "How was today?" : "How was the day?") + "</span>" + (done ? '<b title="All filled in">✓</b>' : "") + "</div>";
  const tail = msg ? '<p class="dsc-msg">' + esc(msg) + "</p>" : "";
  if (done && editing !== d) {
    return '<section class="dsc" data-dsc-date="' + d + '" aria-label="Scores for the day">' + head +
      '<p class="dsc-sum">' + set.defs.map((def) => esc(def.col) + " <b>" + v[def.key] + "</b>").join("<i> · </i>") + "</p>" +
      (rec?.note ? '<p class="dsc-sumnote">' + esc(rec.note) + "</p>" : "") +
      '<button type="button" class="link" data-dsc-edit>Edit</button>' + tail + "</section>";
  }
  return '<section class="dsc" data-dsc-date="' + d + '" aria-label="Scores for the day">' + head +
    set.defs.map((def, i) => {
      const n = v[def.key], has = typeof n === "number";
      return '<div class="dsc-row"><div class="dsc-top"><span class="dsc-name"><b>' + esc(def.col) + "</b>" + (def.means ? "<span>" + esc(def.means) + "</span>" : "") + "</span>" +
        '<input class="dsc-num" data-dsc-num="' + i + '" data-keep="score-' + d + "-" + i + '" value="' + (has ? n : "") + '" placeholder="' + esc(SC.rangeText(def)) + '" inputmode="decimal" autocomplete="off" aria-label="' + esc(def.col) + '"></div>' +
        (def.choices.length ? '<div class="dsc-opts">' + def.choices.map((ch) => '<button type="button" data-dsc="' + i + '" data-n="' + ch.n + '" aria-pressed="' + (has && n === ch.n) + '"' + (has && n === ch.n ? ' class="on"' : "") + ">" + esc(ch.label) + "</button>").join("") + "</div>" : "") + "</div>";
    }).join("") +
    '<input class="dsc-note" data-dsc-note data-keep="score-' + d + '-note" value="' + esc(rec?.note || "") + '" placeholder="Note" maxlength="' + SC.NOTE_MAX + '" autocomplete="off" aria-label="Note">' +
    (done ? '<button type="button" class="link dsc-fold" data-dsc-fold>Done</button>' : "") + tail + "</section>";
}

export function initScores(rerender) {
  const dateOf = (el) => el.closest("[data-dsc-date]")?.dataset.dscDate;
  const defOf = (i) => store.scoreSetup().defs[Number(i)];

  // 收好的一行摘要 → Edit 展开（填满了也不马上收）；Done / 换到别的页 → 收回去
  on(document, "click", "[data-dsc-edit]", (e, el) => { editing = dateOf(el) || ""; rerender(); });
  on(document, "click", "[data-dsc-fold]", () => { editing = ""; rerender(); });
  addEventListener("hashchange", () => { editing = ""; });

  // 点一档：填上它的数；已经是这个数了 = 清掉。右边那格先改好：整页重画时带 data-keep 的格子照重画前的样子放回去
  on(document, "click", "[data-dsc]", (e, el) => {
    const d = dateOf(el), def = defOf(el.dataset.dsc);
    if (!d || !def) return;
    const n = Number(el.dataset.n), next = store.scoreOf(d)?.v?.[def.key] === n ? null : n;
    const box = el.closest(".dsc-row")?.querySelector("[data-dsc-num]");
    if (box) box.value = next === null ? "" : String(next);
    store.setScore(d, def.key, next);
  });

  // 自己敲的数：只收数字（逗号当小数点）；空 = 清掉
  on(document, "input", "[data-dsc-num]", (e, el) => {
    const t = el.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
    if (t !== el.value) el.value = t;
  });
  on(document, "change", "[data-dsc-num]", (e, el) => {
    const d = dateOf(el), def = defOf(el.dataset.dscNum);
    if (!d || !def) return;
    const t = el.value.trim();
    if (t !== "" && !(Number(t) >= 0)) { toast("Type a number"); return; }
    if (t !== "") el.value = String(Math.round(Number(t) * 100) / 100);   // 08 → 8、7. → 7，和存下的一样
    store.setScore(d, def.key, t === "" ? null : Number(t));
  });
  on(document, "change", "[data-dsc-note]", (e, el) => {
    const d = dateOf(el);
    if (!d) return;
    el.value = el.value.replace(/\s+/g, " ").trim();
    store.setScoreNote(d, el.value);
  });

  // 回车 = 存了跳到下一格（焦点一走，change 就发了）；最后一格回车就收起键盘
  on(document, "keydown", ".dsc input", (e, el) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    const all = [...el.closest(".dsc").querySelectorAll("input")], next = all[all.indexOf(el) + 1];
    if (next) next.focus();
    else el.blur();
  });
}
