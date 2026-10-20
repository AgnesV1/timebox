// 目标板（Projects 页最上面，电脑）。从上往下：North star（一行，没有日期）→ 今年之后的四年 → 这个月 / 这个季度 / 下个季度 / 今年（紧挨着下面的项目）。
// 年份和近期两排都是四栏，上下对齐。每条一行：勾、文字（长的省略，悬停看全文）、标签（项目的标签是一个色点）、哪个月。
// 一栏默认只列前 3 条（近期 4 条），多的折成「+N」；鼠标移到那一栏，栏头出一个「+」，点了才出「加一条」的框（一条目标都没有时一直开着）。
// 点文字改字（「文字 #标签」一起改），同一行还能选它是哪条目标的一部分（Part of = 上级，一条只有一个）；点月份改年月（做完了的改的是实际做完的年月）。
// 谁为谁服务的连线在 js/ui/links.js（悬停才画，拖一下就连上）。栏目跟着今天走，过期没做完的自己滚到当前那栏，见 js/goals.js。

import * as store from "../store.js";
import * as G from "../goals.js";
import { esc, on } from "../dom.js";
import { MONTHS } from "../dates.js";

let edit = null;        // 正在改的那条：{ id, field: "text" | "when" }
let showDone = false;   // 做完了、已经过期的也列出来
let adding = "";        // 哪一栏开着「加一条」的框（栏的 key）
const openCols = new Set();   // 点过「+N」、全部列出来的栏
const LIMIT = { north: 3, far: 3, near: 4 };

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

// 「Part of」：选上级。自己和挂在自己下面的（一层层往下）不能选，不然连成环；按栏分组，远的在前（上级一般比它远）
function upHTML(g, k) {
  const bad = G.descendants(k.goals, g.id);
  const cols = G.board(k.goals, k.T, { showDone: true, rank: k.rank }).cols.reverse();
  const groups = cols.map((col) => {
    const list = col.items.filter((x) => x.goal.id !== g.id && !bad.has(x.goal.id));
    return list.length ? '<optgroup label="' + esc(col.title) + '">' + list.map((x) => '<option value="' + esc(x.goal.id) + '"' + (x.goal.id === g.up ? " selected" : "") + ">" + esc(x.goal.text) + "</option>").join("") + "</optgroup>" : "";
  }).join("");
  return '<label class="gup"><span>Part of</span><select data-g="up" data-keep="goal-up-' + esc(g.id) + '" aria-label="Part of which goal"><option value="">Nothing above</option>' + groups + "</select></label>";
}

// dflt：月份就是这一栏的默认（这个月的目标写着这个月）——平时不显示，悬停才出来（点它改年月）
function rowHTML(x, k, north, dflt) {
  const g = x.goal, id = esc(g.id), tag = String(g.tag || "").trim();
  const field = edit?.id === g.id ? edit.field : "";
  const text = field === "text"
    ? '<input class="gt-in" data-g="text" data-keep="goal-' + id + '" value="' + esc(g.text + (tag ? " #" + tag : "")) + '" aria-label="Goal">'
    : '<button type="button" class="gt" data-act="g-text" title="' + esc(g.text) + '">' + esc(g.text) + "</button>";
  const opts = k.tags.some((t) => low(t) === low(tag)) || !tag ? k.tags : [...k.tags, tag];
  // 标签和某个项目同名：只画一个色点（那个项目的颜色），名字放在 title 里——栏很窄，字要留给目标本身；自己写的标签没有颜色，照旧显示字
  const hue = k.colors[low(tag)];
  const tagSel = '<select class="gtag' + (tag ? (hue ? " dot" : "") : " none") + '" data-g="tag" aria-label="' + esc(tag ? "Tag: " + tag : "Tag") + '" title="' + esc(tag || "Add a tag") + '" style="--pc:' + esc(hue || "var(--c-None)") + '"><option value="">' + (tag ? "No tag" : "+ tag") + "</option>" +
    opts.map((t) => '<option value="' + esc(t) + '"' + (low(t) === low(tag) ? " selected" : "") + (k.colors[low(t)] ? ' data-color="' + esc(k.colors[low(t)]) + '"' : "") + ">" + esc(t) + "</option>").join("") + "</select>";
  // North star 没有日期：没有月份，也不打勾（以前标过做完的照旧给勾，好取消）
  const when = north ? "" : field === "when" ? whenEditHTML(g, k.T)
    : '<button type="button" class="gdue' + (dflt ? " dflt" : "") + '" data-act="g-when" title="' + (x.done ? "Finished — click to change" : x.late ? "Was due — click to change" : "Due — click to change") + '">' + (x.done ? "✓ " : "") + esc(x.when) + "</button>";
  const tick = north && !x.done ? '<i class="gstar" aria-hidden="true">✦</i>' : '<input type="checkbox" data-g="done"' + (x.done ? " checked" : "") + ' aria-label="Done">';
  return '<li class="gl' + (x.done ? " done" : "") + (x.late ? " late" : "") + (x.ahead ? " ahead" : "") + (field === "text" ? " editing" : "") + '" data-goal="' + id + '">' + tick + text +
    '<span class="gmeta">' + (field === "text" ? upHTML(g, k) : "") + tagSel + when + '<button type="button" class="gx" data-act="g-del" aria-label="Delete goal">×</button></span></li>';
}

function colHTML(col, k) {
  const north = col.span === "north", limit = north ? LIMIT.north : col.far ? LIMIT.far : LIMIT.near;
  const all = openCols.has(col.key) || col.items.slice(limit).some((x) => x.goal.id === edit?.id);
  const shown = all ? col.items : col.items.slice(0, limit), more = col.items.length - shown.length;
  const add = k.empty || adding === col.key;
  const title = esc(col.title);
  return '<section class="gcol' + (north ? " gnorth" : "") + '" data-col="' + col.key + '"><h4>' + title + (col.sub ? " <small>" + col.sub + "</small>" : "") +
    (k.empty ? "" : '<button type="button" class="gplus" data-act="g-add" aria-expanded="' + add + '" aria-label="Add a goal: ' + title + '" title="Add a goal">+</button>') + "</h4>" +
    (shown.length ? "<ul>" + shown.map((x) => rowHTML(x, k, north, !x.done && !x.late && !x.ahead && x.goal.due === col.due)).join("") + "</ul>" : "") +
    (more ? '<button type="button" class="gmore" data-act="g-more">+' + more + " more</button>" : all && col.items.length > limit ? '<button type="button" class="gmore" data-act="g-less">Less</button>' : "") +
    (add ? '<form class="gadd" data-span="' + col.span + '" data-due="' + col.due + '" autocomplete="off"><input name="text" data-keep="gadd-' + col.key + '" placeholder="Add…" aria-label="Add a goal: ' + title + '"></form>' : "") + "</section>";
}

export function goalsHTML(c) {
  const open = store.local().goalsOpen !== false;
  const goals = store.goals();
  // 标签按项目的顺序排（c.groups 已经是 Build、Work、Friends… 的顺序）；不是项目名的标签排在后面，没标签的最后
  const at = new Map(c.groups.map((g, i) => [low(g.name), i]));
  const rank = (tag) => (!low(tag) ? Infinity : at.has(low(tag)) ? at.get(low(tag)) : c.groups.length);
  const b = G.board(goals, c.today, { showDone, rank });
  const left = b.cols.reduce((a, col) => a + col.items.filter((x) => !x.done).length, 0);
  const head = "<header><h3>Goals</h3>" + (left ? '<span class="msub">' + left + " open</span>" : "") +
    '<span class="gtools">' + (open && (b.hidden || showDone) ? '<button type="button" class="link" data-act="g-finished">' + (showDone ? "Hide finished" : "Show " + b.hidden + " finished") + "</button>" : "") +
    '<button type="button" class="link" data-act="g-fold" aria-expanded="' + open + '">' + (open ? "Hide" : "Show") + "</button></span></header>";
  if (!open) return '<section class="goals folded">' + head + "</section>";
  const k = { T: c.today, tags: tagList(c, goals), colors: tagColors(c), goals, rank, empty: !goals.length };
  const col = (x) => colHTML(x, k);
  const linked = goals.some((g) => g.up || (Array.isArray(g.by) && g.by.length));
  const hint = !goals.length ? "Type a goal and press Enter — add <b>#tag</b> to label it. Click the month to change when; tick it when it's done."
    : linked ? "" : "Hover a goal, project or plan to see what it's for. Drag the little <b>◦</b> that shows up onto a goal to link them.";
  return '<section class="goals">' + head + col(b.cols.find((x) => x.span === "north")) +
    '<div class="ggrid far">' + b.cols.filter((x) => x.far && x.span !== "north").map(col).join("") + "</div>" +
    '<div class="ggrid near">' + b.cols.filter((x) => !x.far).map(col).join("") + "</div>" +
    (hint ? '<p class="hint">' + hint + "</p>" : "") + "</section>";
}

export function initGoals(rerender) {
  const rowOf = (el) => el.closest("[data-goal]")?.dataset.goal;
  const goal = (id) => store.goals().find((g) => g.id === id);

  on(document, "click", ".goals [data-act]", (e, el) => {
    const act = el.dataset.act, id = rowOf(el), col = el.closest("[data-col]")?.dataset.col || "";
    if (act === "g-fold") { edit = null; store.setLocal({ goalsOpen: store.local().goalsOpen === false }); return; }
    if (act === "g-del") { edit = null; store.deleteGoal(id); return; }
    if (act === "g-finished") showDone = !showDone;
    else if (act === "g-add") {
      adding = adding === col ? "" : col;
      if (adding) afterRender(() => document.querySelector('.goals [data-col="' + CSS.escape(col) + '"] .gadd input')?.focus());
    } else if (act === "g-more") openCols.add(col);
    else if (act === "g-less") openCols.delete(col);
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

  // 改字：回车 / 点到这一行外面就存（「文字 #标签」）；清空不算删，留着原来的；Esc 不改。
  // 在同一行里挪到 Part of、标签的下拉不算离开
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
  on(document, "focusout", ".goals .gl.editing", (e, row) => {
    if (row.contains(e.relatedTarget) || document.querySelector(".menu")?.contains(e.relatedTarget)) return;
    const input = row.querySelector("[data-g=text]");
    if (input) saveText(input);
  });

  on(document, "change", ".goals [data-g]", (e, el) => {
    const f = el.dataset.g, g = goal(rowOf(el));
    if (!g) return;
    if (f === "done") store.saveGoal({ ...g, done: el.checked ? store.today().slice(0, 7) : "" });
    else if (f === "tag") store.saveGoal({ ...g, tag: el.value });
    else if (f === "up") store.setParent(g.id, el.value);
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

  // 加一条：回车存，框留着接着加（新的那条要是排在折起来的那几条里，这一栏就全部列出来）；Esc、空着点到别处就收起来
  on(document, "submit", ".goals .gadd", (e, form) => {
    e.preventDefault();
    const p = G.parseGoal(form.text.value);
    if (!p.text) return;
    form.text.value = "";
    const col = form.closest("[data-col]")?.dataset.col;
    if (col) openCols.add(col);
    store.saveGoal({ text: p.text, tag: p.tag, span: form.dataset.span, due: form.dataset.due, done: "" });
  });
  const closeAdd = () => { if (adding) { adding = ""; rerender(); } };
  on(document, "keydown", ".goals .gadd input", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeAdd(); } });
  on(document, "focusout", ".goals .gadd input", (e, input) => {
    if (!input.value.trim() && !input.closest(".gcol").contains(e.relatedTarget)) closeAdd();
  });
}
