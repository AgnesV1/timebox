// Projects 页右边那一栏（电脑）。从上往下：North star 那一段字（一直在，切到 Ideas 也不变）→ Goals | Ideas → 下面一块自己滚。
// North star：一段长文字，[ ] 里的词是一条条 North star 目标（画成细框，括号只在改字的时候看得到）。点这段字就能改：
//   选中一段点「Frame as goal」给它加上括号；Esc 不改，⌘/Ctrl+Enter、Done 或点到外面就存（js/store/goals.js 的 saveNorth：改了措辞还是原来那条）。
// Goals：这个月 / 这个季度 / 下个季度 / 今年 / 明年（Next year）/ 再三个年份，一段段竖着排（年份跟着今天走，见 js/goals.js 的 columns）。
//   每条一行：勾、文字（长的省略，悬停看全文）、标签（项目的标签是一个色点）、哪个月。一段默认只列前 4 条（年份 3 条），多的折成「+N more」；
//   鼠标移到那一段，标题旁出一个「+」，点了才出「加一条」的框（一条目标都没有时 This month 那一格一直开着）。
//   点文字改字（「文字 #标签」一起改），同一行还能选它是哪条目标的一部分（Part of = 上级，一条只有一个）；点月份改年月（做完了的改的是实际做完的年月）。
// Ideas：灵感池（js/ui/ideas.js 的 ideasHTML，窄栏的样子见 css）。选的是哪个记在这台设备上（projSide）。
// 谁为谁服务的连线在 js/ui/links.js（悬停才画，拖一下就连上；拖的时候右栏整个展开：North star 那段放开、折起来的目标露出来）。
// North star 那段平时只露前三行（她嫌大），里面能滚；往下还有字的时候底下淡出。
// 往期：过了那一期的目标（做没做完都一样）不在上面几段，收在最底下——选一个季度（2026 Q3），展开看那一季的季度、月度目标和那一年的年度目标，
//   打没打勾都看得到、还能补勾；没做完还想做的，用左边的小把手挪回现在的某一段（js/goals.js 的 past）。

import * as store from "../store.js";
import * as G from "../goals.js";
import { esc, on } from "../dom.js";
import { MONTHS } from "../dates.js";
import { ideasHTML } from "./ideas.js";

let edit = null;        // 正在改的那条：{ id, field: "text" | "when" }
let pastOpen = false;   // 往期展开着
let pastKey = "";       // 往期看的是哪一季（"2026-3"；空 = 最近的那一季）
let railTop = 0, railTab = "";   // 右栏滚到哪了：整页重画时放回去（不然在往期里打个勾整栏跳回顶上）
let adding = "";        // 哪一段开着「加一条」的框（栏的 key）
let northEdit = false;  // North star 那段字正在改
let northPick = -1;     // 点的是第几个框：打开来改的时候把它选上
const openCols = new Set();   // 点过「+N」、全部列出来的段
const LIMIT = { far: 3, near: 4 };

const afterRender = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));
const low = (s) => String(s || "").trim().toLowerCase();
export const sideTab = () => (store.local().projSide === "ideas" ? "ideas" : "goals");

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
  const cols = G.board(k.goals, k.T, { rank: k.rank }).cols.reverse();
  const groups = cols.map((col) => {
    const list = col.items.filter((x) => x.goal.id !== g.id && !bad.has(x.goal.id));
    return list.length ? '<optgroup label="' + esc(col.title) + '">' + list.map((x) => '<option value="' + esc(x.goal.id) + '"' + (x.goal.id === g.up ? " selected" : "") + ">" + esc(x.goal.text) + "</option>").join("") + "</optgroup>" : "";
  }).join("");
  return '<label class="gup"><span>Part of</span><select data-g="up" data-keep="goal-up-' + esc(g.id) + '" aria-label="Part of which goal"><option value="">Nothing above</option>' + groups + "</select></label>";
}

// dflt：月份就是这一段的默认（这个月的目标写着这个月）——平时不显示，悬停才出来（点它改年月）
function rowHTML(x, k, dflt, fold = false) {
  const g = x.goal, id = esc(g.id), tag = String(g.tag || "").trim();
  const field = edit?.id === g.id ? edit.field : "";
  const text = field === "text"
    ? '<input class="gt-in" data-g="text" data-keep="goal-' + id + '" value="' + esc(g.text + (tag ? " #" + tag : "")) + '" aria-label="Goal">'
    : '<button type="button" class="gt" data-act="g-text" title="' + esc(g.text) + '"><span class="gtx">' + esc(g.text) + "</span></button>";   // .gtx：悬停画线时荧光笔只涂字那一截
  const opts = k.tags.some((t) => low(t) === low(tag)) || !tag ? k.tags : [...k.tags, tag];
  // 标签和某个项目同名：只画一个色点（那个项目的颜色），名字放在 title 里——栏很窄，字要留给目标本身；自己写的标签没有颜色，照旧显示字
  const hue = k.colors[low(tag)];
  const tagSel = '<select class="gtag' + (tag ? (hue ? " dot" : "") : " none") + '" data-g="tag" aria-label="' + esc(tag ? "Tag: " + tag : "Tag") + '" title="' + esc(tag || "Add a tag") + '" style="--pc:' + esc(hue || "var(--c-None)") + '"><option value="">' + (tag ? "No tag" : "+ tag") + "</option>" +
    opts.map((t) => '<option value="' + esc(t) + '"' + (low(t) === low(tag) ? " selected" : "") + (k.colors[low(t)] ? ' data-color="' + esc(k.colors[low(t)]) + '"' : "") + ">" + esc(t) + "</option>").join("") + "</select>";
  const when = field === "when" ? whenEditHTML(g, k.T)
    : '<button type="button" class="gdue' + (dflt ? " dflt" : "") + '" data-act="g-when" title="' + (x.done ? "Finished — click to change" : "Due — click to change") + '">' + (x.done ? "✓ " : "") + esc(x.when) + "</button>";
  // 左边的小把手：拖到别的一段 = 改成那一段的默认期限；点一下 / 回车 = 挑一段（js/ui/dnd.js）。拖目标本身是连线（js/ui/links.js），两个不打架
  const grip = field ? "" : '<span class="ggrip" data-drag="goal:' + id + '" role="button" tabindex="0" aria-haspopup="listbox" aria-label="Move to another time" title="Drag to another time, or click"></span>';
  return '<li class="gl' + (x.done ? " done" : "") + (x.ahead ? " ahead" : "") + (fold ? " fold" : "") + (field === "text" ? " editing" : "") + '" data-goal="' + id + '" data-drag-show>' + grip +
    '<input type="checkbox" data-g="done"' + (x.done ? " checked" : "") + ' aria-label="Done">' + text +
    '<span class="gmeta">' + (field === "text" ? upHTML(g, k) : "") + tagSel + when + '<button type="button" class="gx" data-act="g-del" aria-label="Delete goal">×</button></span></li>';
}

function colHTML(col, k, first) {
  const limit = col.far ? LIMIT.far : LIMIT.near;
  const all = openCols.has(col.key) || col.items.slice(limit).some((x) => x.goal.id === edit?.id);
  const shown = all ? col.items : col.items.slice(0, limit), more = col.items.length - shown.length;
  // 折起来的那几条也画出来、带 .fold（平时藏着；拖连线时 css 让它们露出来，才放得上去）
  const rows = col.items.map((x, i) => rowHTML(x, k, !x.done && !x.ahead && x.goal.due === col.due, !all && i >= limit));
  const add = adding === col.key || (k.empty && col.key === "month");
  const title = esc(col.title);
  return '<section class="gcol' + (shown.length || add ? "" : " empty") + (first ? " far1" : "") + '" data-col="' + col.key + '" data-drop="gcol:' + col.key + '" data-name="' + esc(col.title + (col.sub ? " · " + col.sub : "")) + '"><h4>' + title + (col.sub ? " <small>" + col.sub + "</small>" : "") +
    '<button type="button" class="gplus" data-act="g-add" aria-expanded="' + add + '" aria-label="Add a goal: ' + title + '" title="Add a goal">+</button></h4>' +
    (shown.length ? "<ul>" + rows.join("") + "</ul>" : "") +
    (more ? '<button type="button" class="gmore" data-act="g-more">+' + more + " more</button>" : all && col.items.length > limit ? '<button type="button" class="gmore" data-act="g-less">Less</button>' : "") +
    (add ? '<form class="gadd" data-span="' + col.span + '" data-due="' + col.due + '" autocomplete="off"><input name="text" data-keep="gadd-' + col.key + '" placeholder="Add…" aria-label="Add a goal: ' + title + '"></form>' : "") + "</section>";
}

// ---------- North star 那一段字 ----------

const STAR = '<i class="gstar" aria-hidden="true">✦</i>';
const rowsFor = (text) => Math.min(14, Math.max(4, String(text).split("\n").reduce((n, line) => n + Math.ceil((line.length + 1) / 38), 0)));

function northHTML() {
  const text = store.northStar();
  if (northEdit) {
    return '<section class="ns editing"><h3>' + STAR + "North star</h3>" +
      '<textarea class="ns-in" data-keep="north-star" rows="' + rowsFor(text) + '" aria-label="North star. Put [brackets] around the parts that are goals.">' + esc(text) + "</textarea>" +
      '<div class="ns-bar"><button type="button" class="btn ghosty" data-act="ns-frame" disabled title="Put brackets around the selected words">[ ] Frame as goal</button>' +
      '<span class="ns-tip">⌘↵ saves · Esc cancels</span><button type="button" class="btn" data-act="ns-done">Done</button></div></section>';
  }
  const north = store.goals().filter((g) => g.span === "north"), at = new Map(north.map((g) => [g.id, g]));
  const phrases = G.parseNorth(text), { ids } = G.matchNorth(phrases, north);
  let h = "", from = 0;
  phrases.forEach((p, i) => {
    h += esc(text.slice(from, p.start));
    const g = at.get(ids[i]);
    // 用行内的 span（不是 button）：长的词跟着字一行行折下去，每一截都有框；Tab 能停、回车 / 空格能点（见下面的 keydown）
    h += g ? '<span class="ns-g' + (g.done ? " done" : "") + '" role="button" tabindex="0" data-goal="' + esc(g.id) + '" data-act="ns-edit" data-i="' + i + '">' + esc(p.text) + "</span>"
      : '<span class="ns-g ghost">' + esc(p.text) + "</span>";
    from = p.end;
  });
  h += esc(text.slice(from));
  return '<section class="ns"><h3>' + STAR + 'North star<button type="button" class="link" data-act="ns-edit">Edit</button></h3>' +
    (text.trim() ? '<p class="ns-text" data-act="ns-edit">' + h + "</p>"
      : '<p class="ns-text empty" data-act="ns-edit">What are you steering by? Write it here, and put [brackets] around the parts that are goals.</p>') + "</section>";
}

// ---------- 往期 ----------
// 最底下一行：Past（点了展开 / 收起）+ 季度下拉 + 这一季做完了几条；展开后一小组一小组：那一年的年度目标、这一季的季度目标、三个月的月度目标。
// 一条一行：小把手（没做完的才有：拖回 / 点了挑现在的某一段）、勾（补勾也行）、字、月份。行是 .gh 不是 .gl：悬停不画线、也不能连
function pastHTML(goals, T) {
  const list = G.past(goals, T);
  if (!list.length) return "";
  const cur = list.find((x) => x.key === pastKey) || list[0];
  const own = [...cur.quarter, ...cur.months.flatMap((x) => x.items)], done = own.filter((g) => g.done).length;
  const row = (g) => '<li class="gh' + (g.done ? " done" : "") + '" data-goal="' + esc(g.id) + '" data-drag-show>' +
    (g.done ? "" : '<span class="ggrip" data-drag="goal:' + esc(g.id) + '" role="button" tabindex="0" aria-haspopup="listbox" aria-label="Move back to a current section" title="Drag to a current section, or click"></span>') +
    '<input type="checkbox" data-g="done"' + (g.done ? " checked" : "") + ' aria-label="Done"><span class="gh-t" title="' + esc(g.text) + '">' + esc(g.text) + "</span>" +
    '<span class="gh-w">' + esc(g.done ? "✓ " + G.whenText(g.done, cur.y) : G.whenText(g.due, cur.y)) + "</span></li>";
  const group = (title, items) => (items.length ? "<h5>" + esc(title) + "</h5><ul>" + items.map(row).join("") + "</ul>" : "");
  return '<section class="gpast' + (pastOpen ? " open" : "") + '" aria-label="Past goals">' +
    '<div class="gpast-h"><button type="button" class="gpast-t" data-act="past-toggle" aria-expanded="' + pastOpen + '">Past</button>' +
    '<select data-g="pastq" aria-label="Which quarter">' + list.map((x) => '<option value="' + x.key + '"' + (x === cur ? " selected" : "") + ">" + esc(x.label) + "</option>").join("") + "</select>" +
    (own.length ? '<small class="msub">' + done + " of " + own.length + " done</small>" : "") + "</div>" +
    (pastOpen ? '<div class="gpast-b">' + group(cur.y + " · Year", cur.year) + group("Q" + cur.q + " · Quarter", cur.quarter) + cur.months.map((x) => group(x.label, x.items)).join("") + "</div>" : "") + "</section>";
}

function listHTML(c) {
  const goals = store.goals();
  // 标签按项目的顺序排（c.groups 已经是 Build、Work、Friends… 的顺序）；不是项目名的标签排在后面，没标签的最后
  const at = new Map(c.groups.map((g, i) => [low(g.name), i]));
  const rank = (tag) => (!low(tag) ? Infinity : at.has(low(tag)) ? at.get(low(tag)) : c.groups.length);
  const b = G.board(goals, c.today, { rank });
  const k = { T: c.today, tags: tagList(c, goals), colors: tagColors(c), goals, rank, empty: !goals.some((g) => g.span !== "north") };
  const cols = b.cols.filter((x) => x.span !== "north");
  const linked = goals.some((g) => g.up || (Array.isArray(g.by) && g.by.length));
  const hint = k.empty ? "Type a goal and press Enter — add <b>#tag</b> to label it. Click the month to change when; tick it when it's done."
    : linked ? "" : "Hover a goal, project or plan to see what it's for. Drag the little <b>◦</b> that shows up onto a goal to link them.";
  return cols.map((x, i) => colHTML(x, k, x.far && !cols[i - 1]?.far)).join("") + pastHTML(goals, c.today) +
    (hint ? '<p class="hint">' + hint + "</p>" : "");
}

export function goalsHTML(c) {
  const tab = sideTab();
  const open = store.goals().filter((g) => g.span !== "north" && !g.done && !G.isOld(g, c.today)).length;
  const seg = '<span class="seg">' + [["goals", "Goals"], ["ideas", "Ideas"]].map(([v, l]) => '<button type="button" data-act="rail-tab" data-v="' + v + '"' + (v === tab ? ' class="on"' : "") + ">" + l + "</button>").join("") + "</span>";
  return '<aside class="goals pj-rail" aria-label="Goals and ideas">' + northHTML() +
    '<div class="rail-tabs">' + seg + (tab === "goals" && open ? '<span class="msub">' + open + " open</span>" : "") + "</div>" +
    '<div class="rail-body" data-rail="' + tab + '">' + (tab === "ideas" ? ideasHTML(c) : listHTML(c)) + "</div></aside>";
}

// 整页重画完（main.js 的 draw，在连线重画之前）：右栏滚回原来的地方（同一个页签才放），North star 那段看底下还有没有字
export function goalsAfterRender() {
  const body = document.querySelector(".goals .rail-body");
  if (body && railTop && body.dataset.rail === railTab && Math.abs(body.scrollTop - railTop) > 1) body.scrollTop = railTop;
  fitNorth();
}
function fitNorth(p = document.querySelector(".goals .ns-text")) {
  if (p) p.classList.toggle("more", p.scrollHeight - p.scrollTop - p.clientHeight > 2);
}

// 拖到 / 挑了另一段（js/ui/dnd.js 转过来的）：改成那一段的长短和默认期限（这个月 = 这个月，这一季 = 季末，今年 = 12 月……）；提示条能撤销
export function goalDrop(payload, target) {
  const id = payload.slice(payload.indexOf(":") + 1), key = target.slice(target.indexOf(":") + 1);
  const g = store.goals().find((x) => x.id === id), col = G.columns(store.today()).find((c) => c.key === key);
  if (!g || !col || col.span === "north") return;
  if (g.span === col.span && g.due === col.due) return;
  edit = null;
  openCols.add(key);   // 落到折起来的那几条里也看得到
  store.saveGoal({ ...g, span: col.span, due: col.due }, "Moved to " + col.title + (col.sub ? " (" + col.sub + ")" : ""));
}

export function initGoals(rerender) {
  const rowOf = (el) => el.closest("[data-goal]")?.dataset.goal;
  const goal = (id) => store.goals().find((g) => g.id === id);

  on(document, "click", ".goals [data-act]", (e, el) => {
    if (el.closest(".idea-page")) return;   // 灵感池自己管（js/ui/ideas.js）
    const act = el.dataset.act, id = rowOf(el), col = el.closest("[data-col]")?.dataset.col || "";
    if (act === "rail-tab") { edit = null; adding = ""; store.setLocal({ projSide: el.dataset.v === "ideas" ? "ideas" : "goals" }); return; }
    if (act === "ns-edit") { if (!northEdit) openNorth(el.dataset.i === undefined ? -1 : Number(el.dataset.i)); return; }
    if (act === "ns-frame") { frame(); return; }
    if (act === "ns-done") { saveNorth(document.querySelector(".goals .ns-in")?.value); return; }
    if (act === "g-del") { edit = null; store.deleteGoal(id); return; }
    if (act === "past-toggle") pastOpen = !pastOpen;
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
    } else return;
    rerender();
  });

  // ---------- North star：点开来改、给选中的字加括号、存 ----------
  function openNorth(pick) {
    northEdit = true;
    northPick = pick;
    rerender();
    afterRender(() => {
      const ta = document.querySelector(".goals .ns-in");
      if (!ta) return;
      ta.focus();
      const p = northPick >= 0 ? G.parseNorth(ta.value)[northPick] : null;
      if (p) ta.setSelectionRange(p.start + 1, p.end - 1); else ta.setSelectionRange(ta.value.length, ta.value.length);
      northPick = -1;
      grow(ta);
      canFrame(ta);
    });
  }
  function saveNorth(value) {
    if (!northEdit) return;
    northEdit = false;
    if (typeof value === "string" && value.replace(/\s+$/, "") !== store.northStar()) store.saveNorth(value);
    else rerender();
  }
  const grow = (ta) => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight + 2, innerHeight * 0.4) + "px"; };
  // 选中了一段（不跨行、里面没有括号）才能框
  const selected = (ta) => { const s = ta.value.slice(ta.selectionStart, ta.selectionEnd); return s.trim() && !/[[\]\n]/.test(s) ? s : ""; };
  const canFrame = (ta) => { const b = ta.closest(".ns")?.querySelector('[data-act="ns-frame"]'); if (b) b.disabled = !selected(ta); };
  function frame() {
    const ta = document.querySelector(".goals .ns-in");
    if (!ta || !selected(ta)) return;
    const a = ta.selectionStart, b = ta.selectionEnd, s = ta.value.slice(a, b);
    const lead = s.length - s.trimStart().length, tail = s.length - s.trimEnd().length;   // 选到的前后空格留在括号外面
    const word = s.trim(), at = a + lead;
    ta.focus();
    ta.setSelectionRange(at, b - tail);
    // 用 insertText：能撤销（⌘Z），也会触发 input
    if (!document.execCommand?.("insertText", false, "[" + word + "]")) ta.setRangeText("[" + word + "]", at, b - tail, "end");
    ta.setSelectionRange(at + word.length + 2, at + word.length + 2);
    grow(ta);
    canFrame(ta);
  }
  on(document, "keydown", ".goals .ns-g[role=button]", (e, el) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } });
  // 按钮按下时别把输入框的选中弄丢
  on(document, "mousedown", '.goals [data-act="ns-frame"]', (e) => e.preventDefault());
  on(document, "input", ".goals .ns-in", (e, ta) => { grow(ta); canFrame(ta); });
  ["select", "keyup", "mouseup"].forEach((t) => on(document, t, ".goals .ns-in", (e, ta) => canFrame(ta)));
  on(document, "keydown", ".goals .ns-in", (e, ta) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); northEdit = false; rerender(); }
    else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveNorth(ta.value); }
  });
  // 点到这一块外面就存。页面重画时（同步拉下来之类）旧的框会被换掉：新的框接着在改，不算离开
  on(document, "focusout", ".goals .ns.editing", (e, sec) => {
    if (sec.contains(e.relatedTarget)) return;
    const value = sec.querySelector(".ns-in")?.value;
    setTimeout(() => {
      if (!northEdit) return;
      const now = document.querySelector(".goals .ns-in");
      if (now && now === document.activeElement) return;
      saveNorth(value);
    }, 0);
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

  on(document, "change", ".goals [data-g=pastq]", (e, el) => { pastKey = el.value; pastOpen = true; rerender(); });
  on(document, "change", ".goals [data-g]", (e, el) => {
    const f = el.dataset.g, g = goal(rowOf(el));
    if (!g) return;
    // 往期里补勾：记成它原定的那个月（那时候做完的），不是今天
    if (f === "done") store.saveGoal({ ...g, done: el.checked ? (G.isOld(g, store.today()) ? String(g.due).slice(0, 7) : store.today().slice(0, 7)) : "" });
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

  // 加一条：回车存，框留着接着加（新的那条要是排在折起来的那几条里，这一段就全部列出来）；Esc、空着点到别处就收起来
  on(document, "submit", ".goals .gadd", (e, form) => {
    e.preventDefault();
    const p = G.parseGoal(form.text.value);
    if (!p.text) return;
    form.text.value = "";
    const col = form.closest("[data-col]")?.dataset.col;
    if (col) openCols.add(col);
    store.saveGoal({ text: p.text, tag: p.tag, span: form.dataset.span, due: form.dataset.due, done: "" });
  });
  document.addEventListener("scroll", (e) => {
    const t = e.target;
    if (t?.classList?.contains("rail-body") && t.closest(".goals")) { railTop = t.scrollTop; railTab = t.dataset.rail; }
    else if (t?.classList?.contains("ns-text")) fitNorth(t);
  }, true);
  addEventListener("hashchange", () => { railTop = 0; });
  const closeAdd = () => { if (adding) { adding = ""; rerender(); } };
  on(document, "keydown", ".goals .gadd input", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeAdd(); } });
  on(document, "focusout", ".goals .gadd input", (e, input) => {
    if (!input.value.trim() && !input.closest(".gcol").contains(e.relatedTarget)) closeAdd();
  });
}
