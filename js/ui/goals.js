// 目标板（Projects 页最上面，电脑）：这个月 / 这个季度 / 下个季度 / 今年，下面一排是今年之后的五年。
// 每条一行：勾、文字、标签（项目的标签是一个色点）、哪个月。点文字改字（「文字 #标签」一起改），点月份改年月（做完了的改的是实际做完的年月），
// 每栏底下一格直接加。栏目跟着今天走，过期没做完的自己滚到当前那栏，见 js/goals.js。

import * as store from "../store.js";
import * as G from "../goals.js";
import { esc, on } from "../dom.js";
import { MONTHS } from "../dates.js";

let edit = null;        // 正在改的那条：{ id, field: "text" | "when" }
let showDone = false;   // 做完了、已经过期的也列出来

const afterRender = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));
const low = (s) => String(s || "").trim().toLowerCase();

// 标签的颜色：和哪个项目同名就用它的颜色
function tagColors(c) {
  const out = {};
  for (const g of c.groups) if (g.name && g.color) out[low(g.name)] = g.color;
  return out;
}

// 下拉里的标签：各个项目的名字在前，再加用过的
function tagList(c, goals) {
  const seen = new Map();
  for (const name of [...c.groups.map((g) => g.name), ...goals.map((g) => g.tag)]) if (low(name) && !seen.has(low(name))) seen.set(low(name), String(name).trim());
  return [...seen.values()];
}

function whenEditHTML(g, T) {
  const cur = g.done || g.due || T.slice(0, 7), y = Number(cur.slice(0, 4)), m = Number(cur.slice(5, 7)), y0 = Number(T.slice(0, 4));
  const years = [];
  for (let k = Math.min(y, y0 - 1); k <= Math.max(y, y0 + 8); k++) years.push(k);
  const what = g.done ? "finished" : "due";
  return '<span class="gwhen"><select data-g="m" aria-label="Month ' + what + '">' + MONTHS.map((name, i) => '<option value="' + (i + 1) + '"' + (i + 1 === m ? " selected" : "") + ">" + name + "</option>").join("") +
    '</select><select data-g="y" aria-label="Year ' + what + '">' + years.map((k) => '<option value="' + k + '"' + (k === y ? " selected" : "") + ">" + k + "</option>").join("") + "</select></span>";
}

function rowHTML(x, T, tags, colors) {
  const g = x.goal, id = esc(g.id), tag = String(g.tag || "").trim();
  const field = edit?.id === g.id ? edit.field : "";
  const text = field === "text"
    ? '<input class="gt-in" data-g="text" data-keep="goal-' + id + '" value="' + esc(g.text + (tag ? " #" + tag : "")) + '" aria-label="Goal">'
    : '<button type="button" class="gt" data-act="g-text" title="' + esc(g.text) + '">' + esc(g.text) + "</button>";
  const opts = tags.some((t) => low(t) === low(tag)) || !tag ? tags : [...tags, tag];
  // 标签和某个项目同名：只画一个色点（那个项目的颜色），名字放在 title 里——栏很窄，字要留给目标本身；自己写的标签没有颜色，照旧显示字
  const hue = colors[low(tag)];
  const tagSel = '<select class="gtag' + (tag ? (hue ? " dot" : "") : " none") + '" data-g="tag" aria-label="' + esc(tag ? "Tag: " + tag : "Tag") + '" title="' + esc(tag || "Add a tag") + '" style="--pc:' + esc(hue || "var(--c-None)") + '"><option value="">' + (tag ? "No tag" : "+ tag") + "</option>" +
    opts.map((t) => '<option value="' + esc(t) + '"' + (low(t) === low(tag) ? " selected" : "") + (colors[low(t)] ? ' data-color="' + esc(colors[low(t)]) + '"' : "") + ">" + esc(t) + "</option>").join("") + "</select>";
  const when = field === "when" ? whenEditHTML(g, T)
    : '<button type="button" class="gdue" data-act="g-when" title="' + (x.done ? "Finished — click to change" : x.late ? "Was due — click to change" : "Due — click to change") + '">' + (x.done ? "✓ " : "") + esc(x.when) + "</button>";
  return '<li class="gl' + (x.done ? " done" : "") + (x.late ? " late" : "") + (x.ahead ? " ahead" : "") + '" data-goal="' + id + '">' +
    '<input type="checkbox" data-g="done"' + (x.done ? " checked" : "") + ' aria-label="Done">' + text +
    '<span class="gmeta">' + tagSel + when + '<button type="button" class="gx" data-act="g-del" aria-label="Delete goal">×</button></span></li>';
}

function colHTML(col, T, tags, colors) {
  return '<section class="gcol"><h4>' + col.title + (col.sub ? " <small>" + col.sub + "</small>" : "") + "</h4>" +
    (col.items.length ? "<ul>" + col.items.map((x) => rowHTML(x, T, tags, colors)).join("") + "</ul>" : "") +
    '<form class="gadd" data-span="' + col.span + '" data-due="' + col.due + '" autocomplete="off"><input name="text" data-keep="gadd-' + col.key + '" placeholder="Add…" aria-label="Add a goal: ' + col.title + '"></form></section>';
}

export function goalsHTML(c) {
  const open = store.local().goalsOpen !== false;
  const goals = store.goals();
  const b = G.board(goals, c.today, { showDone });
  const left = b.cols.reduce((a, col) => a + col.items.filter((x) => !x.done).length, 0);
  const head = "<header><h3>Goals</h3>" + (left ? '<span class="msub">' + left + " open</span>" : "") +
    '<span class="gtools">' + (open && (b.hidden || showDone) ? '<button type="button" class="link" data-act="g-finished">' + (showDone ? "Hide finished" : "Show " + b.hidden + " finished") + "</button>" : "") +
    '<button type="button" class="link" data-act="g-fold" aria-expanded="' + open + '">' + (open ? "Hide" : "Show") + "</button></span></header>";
  if (!open) return '<section class="goals folded">' + head + "</section>";
  const tags = tagList(c, goals), colors = tagColors(c);
  const col = (x) => colHTML(x, c.today, tags, colors);
  return '<section class="goals">' + head +
    '<div class="ggrid near">' + b.cols.filter((x) => !x.far).map(col).join("") + "</div>" +
    '<div class="ggrid far">' + b.cols.filter((x) => x.far).map(col).join("") + "</div>" +
    (goals.length ? "" : '<p class="hint">Type a goal and press Enter — add <b>#tag</b> to label it. Click the month to change when; tick it when it\'s done.</p>') + "</section>";
}

export function initGoals(rerender) {
  const rowOf = (el) => el.closest("[data-goal]")?.dataset.goal;
  const goal = (id) => store.goals().find((g) => g.id === id);

  on(document, "click", ".goals [data-act]", (e, el) => {
    const act = el.dataset.act, id = rowOf(el);
    if (act === "g-fold") { edit = null; store.setLocal({ goalsOpen: store.local().goalsOpen === false }); return; }
    if (act === "g-del") { edit = null; store.deleteGoal(id); return; }
    if (act === "g-finished") showDone = !showDone;
    else if (act === "g-text" || act === "g-when") {
      edit = { id, field: act === "g-text" ? "text" : "when" };
      afterRender(() => {
        const i = document.querySelector('.goals [data-goal="' + CSS.escape(id) + '"] ' + (act === "g-text" ? "[data-g=text]" : "[data-g=m]"));
        i?.focus();
        if (act === "g-text") i?.select();
      });
    }
    rerender();
  });

  // 改字：回车 / 点到别处就存（「文字 #标签」）；清空不算删，留着原来的；Esc 不改
  const saveText = (input) => {
    const id = rowOf(input), g = goal(id);
    if (!g || edit?.id !== id || edit.field !== "text") return;
    edit = null;
    const p = G.parseGoal(input.value);
    if (p.text && (p.text !== g.text || p.tag !== String(g.tag || ""))) store.saveGoal({ ...g, text: p.text, tag: p.tag });
    else rerender();
  };
  on(document, "keydown", ".goals [data-g=text]", (e, input) => {
    if (e.key === "Enter") { e.preventDefault(); saveText(input); }
    else if (e.key === "Escape") { e.stopPropagation(); edit = null; rerender(); }
  });
  on(document, "focusout", ".goals [data-g=text]", (e, input) => saveText(input));

  on(document, "change", ".goals [data-g]", (e, el) => {
    const f = el.dataset.g, g = goal(rowOf(el));
    if (!g) return;
    if (f === "done") store.saveGoal({ ...g, done: el.checked ? store.today().slice(0, 7) : "" });
    else if (f === "tag") store.saveGoal({ ...g, tag: el.value });
    else if (f === "m" || f === "y") {
      const box = el.closest(".gwhen");
      const when = G.ymOf(Number(box.querySelector("[data-g=y]").value), Number(box.querySelector("[data-g=m]").value));
      store.saveGoal({ ...g, [g.done ? "done" : "due"]: when });
    }
  });

  // 改年月的两个下拉：点到别处、按 Esc 就收起来
  document.addEventListener("click", (e) => {
    if (edit?.field !== "when" || e.target.closest?.(".gwhen, .menu, [data-act=g-when]")) return;
    edit = null;
    rerender();
  });
  on(document, "keydown", ".goals .gwhen select", (e) => { if (e.key === "Escape") { edit = null; rerender(); } });

  on(document, "submit", ".goals .gadd", (e, form) => {
    e.preventDefault();
    const p = G.parseGoal(form.text.value);
    if (!p.text) return;
    form.text.value = "";
    store.saveGoal({ text: p.text, tag: p.tag, span: form.dataset.span, due: form.dataset.due, done: "" });
  });
}
