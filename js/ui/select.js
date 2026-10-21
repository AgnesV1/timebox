// 下拉框：页面里还是普通的 <select>（各处的 change 处理都不用改）。电脑上点开时不用系统自带的菜单，
// 换成自己画的一块：分组小标题（组里第一项带 data-self 的，组名自己也能选）、颜色点（option 的 data-color）、当前项打勾、键盘上下 / 回车 / Esc，选项多的顶上带一格搜索。
// 选中后给原来的 <select> 赋值并发 input / change。手机和触屏还是系统自带的选择器。
// 同一个样子还有一种不挂在 <select> 上的：openMenu(按钮, 清单, 选了以后做什么)——能拖的东西不用拖的做法（js/ui/dnd.js 的「Put on…」）就用它。

import { esc } from "../dom.js";

const fine = matchMedia("(hover: hover) and (pointer: fine)");
const SEARCH_FROM = 12;   // 选项到这么多就带搜索
const OPEN_KEYS = [" ", "Enter", "ArrowDown", "ArrowUp"];
let cur = null;   // 开着的那块：{ el, sel, active, watch, typed, typedAt }；openMenu 开的没有 sel，有 anchor（点开它的那个）、list、pick

const usable = (sel) => !sel.multiple && !sel.disabled && fine.matches && !document.body.classList.contains("phone");
const optionsOf = (sel) => [...sel.querySelectorAll("option")];

function listHTML(sel, q = "") {
  const hit = (o) => !q || o.textContent.toLowerCase().includes(q);
  const all = optionsOf(sel);
  const row = (o, nested, top = false) => '<div class="mi' + (nested ? " in" : "") + (top ? " top" : "") + (o.selected ? " on" : "") + (o.disabled ? " off" : "") + '" role="option" aria-selected="' + o.selected + '" data-i="' + all.indexOf(o) + '">' +
    (o.dataset.color ? '<i style="--dot:' + esc(o.dataset.color) + '"></i>' : "") + "<span>" + esc(o.textContent) + "</span></div>";
  let html = "";
  for (const node of sel.children) {
    if (node.tagName === "OPTION") { if (hit(node)) html += row(node, false); continue; }
    if (node.tagName !== "OPTGROUP") continue;
    // 组里第一项带 data-self：这一组的名字自己也能选（大类），就不另画小标题了
    const kids = [...node.children], self = kids[0]?.dataset.self !== undefined ? kids[0] : null;
    const inside = kids.filter((o) => o !== self && hit(o));
    if (self && (hit(self) || inside.length)) html += row(self, false, true) + inside.map((o) => row(o, true)).join("");
    else if (inside.length) html += '<div class="mg">' + esc(node.label) + "</div>" + inside.map((o) => row(o, true)).join("");
  }
  return html || '<div class="mg">Nothing matches</div>';
}

// openMenu 的清单：[{ label, value, group?, color?, top?, indent?, on? }]：同一个 group 的排在一起、上面一行小标题；
// top = 粗体（大类那一行）、indent = 缩进（它下面的计划）、on = 现在选着的（打勾）
function plainHTML(list, q = "") {
  let html = "", last = null;
  list.forEach((x, i) => {
    if (q && !x.label.toLowerCase().includes(q)) return;
    if (x.group && x.group !== last) html += '<div class="mg">' + esc(x.group) + "</div>";
    last = x.group || null;
    html += '<div class="mi' + (x.group || x.indent ? " in" : "") + (x.top ? " top" : "") + (x.on ? " on" : "") + '" role="option" aria-selected="' + Boolean(x.on) + '" data-i="' + i + '">' +
      (x.color ? '<i style="--dot:' + esc(x.color) + '"></i>' : "") + "<span>" + esc(x.label) + "</span></div>";
  });
  return html || '<div class="mg">Nothing matches</div>';
}

const items = () => (cur ? [...cur.el.querySelectorAll(".mi:not(.off)")] : []);

function setActive(el, scroll = true) {
  if (!cur) return;
  cur.el.querySelector(".mi.act")?.classList.remove("act");
  cur.active = el || null;
  if (!el) return;
  el.classList.add("act");
  if (scroll) el.scrollIntoView({ block: "nearest" });
}

function place() {
  const r = (cur.anchor || cur.sel).getBoundingClientRect(), m = cur.el;
  m.style.minWidth = Math.max(150, r.width) + "px";
  // openMenu 开的：不盖住点开它的那个——上下哪边地方大就往哪边开，放不下就在里面滚（css 的 max-height 是上限）
  if (cur.anchor) { m.style.maxHeight = ""; const room = Math.max(innerHeight - r.bottom - 12, r.top - 12); if (m.offsetHeight > room) m.style.maxHeight = Math.max(160, room) + "px"; }
  const w = m.offsetWidth, h = m.offsetHeight;
  const below = r.bottom + 4 + h <= innerHeight - 8 || r.top < h + 12;
  const left = Math.max(8, Math.min(innerWidth - w - 8, r.left));
  m.style.left = left + "px";
  m.style.top = Math.max(8, below ? Math.min(r.bottom + 4, innerHeight - h - 8) : r.top - h - 4) + "px";
  // 从按钮那里长出来：往下开从上沿、往上开从下沿，横着对准按钮左边进来一点（css 的 menu-in）
  m.style.setProperty("--mo", Math.max(0, r.left - left + 14).toFixed(0) + "px " + (below ? "0" : "100%"));
  m.style.setProperty("--my0", below ? "-6px" : "6px");
}

function open(sel) {
  close();
  const el = document.createElement("div");
  el.className = "menu";
  el.setAttribute("role", "listbox");
  const search = optionsOf(sel).length >= SEARCH_FROM;
  el.innerHTML = (search ? '<input class="ms" type="search" placeholder="Search" aria-label="Search" autocomplete="off" spellcheck="false">' : "") + '<div class="ml">' + listHTML(sel) + "</div>";
  document.body.appendChild(el);
  cur = { el, sel, active: null, typed: "", typedAt: 0 };
  sel.classList.add("open");
  place();
  setActive(el.querySelector(".mi.on:not(.off)") || items()[0]);
  if (search) el.querySelector(".ms").focus({ preventScroll: true });
  else sel.focus({ preventScroll: true });
  // 页面重画把这个 <select> 换掉了：带 data-keep 的（重画前后是同一格、选项也没变）接到新的那个上，这块留着；别的收起来
  cur.watch = new MutationObserver(() => {
    if (!cur || cur.sel.isConnected) return;
    const k = cur.sel.dataset.keep;
    const next = k ? [...document.querySelectorAll("select[data-keep]")].find((x) => x.dataset.keep === k && usable(x)) : null;
    if (!next || optionsOf(next).length !== optionsOf(cur.sel).length) { close(); return; }
    cur.sel = next;
    next.classList.add("open");
    place();
  });
  cur.watch.observe(document.body, { childList: true, subtree: true });
}

export function close() {
  if (!cur) return;
  cur.watch?.disconnect();
  (cur.sel || cur.anchor).classList.remove("open");
  // 收的时候缩一点淡掉（0.13 秒）再拿掉；系统要求减少动态就直接拿掉
  const el = cur.el;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) el.remove();
  else { el.classList.add("out"); setTimeout(() => el.remove(), 130); }
  cur = null;
}

// 收起来、焦点还给 <select>：先还焦点再收。有的 <select> 只在它那个表单里有焦点（或这块开着）时才显示（加任务那一排），
// 带搜索框的时候焦点在这块里：先收的话，那一排跟着藏起来，焦点就还不回去了
function closeTo(sel) {
  sel?.focus({ preventScroll: true });
  close();
}

// 不挂在 <select> 上的小菜单。anchor = 点开它的那个（菜单从它那里长出来，收起时焦点回到它）；
// list = [{ label, value, group?, color?, top?, indent?, on? }]；挑了一项 → pick(value)。再开同一个 = 收起。
// search：要不要顶上那格搜索（默认选项多就要；手机上别要，一点就弹键盘）；cls：多加一个 class（手机上的 menu-touch：行高一点、粗边硬投影）
export function openMenu(anchor, list, pick, { title = "", search = list.length >= SEARCH_FROM, cls = "" } = {}) {
  if (cur?.anchor === anchor) { closeTo(anchor); return; }
  close();
  const el = document.createElement("div");
  el.className = "menu" + (cls ? " " + cls : "");
  el.setAttribute("role", "listbox");
  if (title) el.setAttribute("aria-label", title);
  el.innerHTML = (title ? '<div class="mg">' + esc(title) + "</div>" : "") + (search ? '<input class="ms" type="search" placeholder="Search" aria-label="Search" autocomplete="off" spellcheck="false">' : "") +
    '<div class="ml">' + (list.length ? plainHTML(list) : '<div class="mg">Nowhere to put it on this page</div>') + "</div>";
  document.body.appendChild(el);
  cur = { el, sel: null, anchor, list, pick, active: null, typed: "", typedAt: 0, at: performance.now() };
  anchor.classList.add("open");
  place();
  setActive(el.querySelector(".mi.on") || items()[0]);
  if (search) el.querySelector(".ms").focus({ preventScroll: true });
  // 页面重画把点开它的那个换掉了：收起来
  cur.watch = new MutationObserver(() => { if (cur && !cur.anchor.isConnected) close(); });
  cur.watch.observe(document.body, { childList: true, subtree: true });
}
export const menuOpen = () => Boolean(cur);

function choose(item) {
  if (!cur.sel) {
    const x = cur.list[Number(item.dataset.i)], fn = cur.pick, a = cur.anchor;
    closeTo(a);
    if (x) fn(x.value);
    return;
  }
  const sel = cur.sel, o = optionsOf(sel)[Number(item.dataset.i)];
  closeTo(sel);
  if (!o || o.disabled) return;
  if (sel.value !== o.value || !o.selected) {
    sel.value = o.value;
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (sel.isConnected) sel.focus({ preventScroll: true });
}

function move(n) {
  const list = items();
  if (!list.length) return;
  const i = list.indexOf(cur.active);
  setActive(list[Math.max(0, Math.min(list.length - 1, i < 0 ? (n > 0 ? 0 : list.length - 1) : i + n))]);
}

// 没有搜索框的：直接打字跳到那一项（半秒内连着打算一个词）
function typeAhead(ch) {
  const now = Date.now();
  cur.typed = (now - cur.typedAt < 600 ? cur.typed : "") + ch.toLowerCase();
  cur.typedAt = now;
  const hit = items().find((x) => x.textContent.trim().toLowerCase().startsWith(cur.typed));
  if (hit) setActive(hit);
}

export function initSelect() {
  // 点 <select>：拦下系统菜单，开自己的；再点一下收起
  document.addEventListener("mousedown", (e) => {
    if (cur && (cur.el.contains(e.target))) return;
    if (cur && !cur.sel && cur.anchor.contains(e.target)) return;   // 再点一下点开它的那个：交给 openMenu 收起
    const sel = e.target.closest?.("select");
    if (sel && e.button === 0 && usable(sel)) {
      e.preventDefault();
      if (cur?.sel === sel) closeTo(sel);
      else open(sel);
      return;
    }
    close();
  }, true);

  document.addEventListener("keydown", (e) => {
    if (!cur) {
      const sel = e.target.closest?.("select");
      if (sel && OPEN_KEYS.includes(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && usable(sel)) { e.preventDefault(); open(sel); }
      return;
    }
    const typing = e.target.classList?.contains("ms");
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeTo(cur.sel || cur.anchor); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); move(e.key === "ArrowDown" ? 1 : -1); }
    else if (e.key === "Home" && !typing) { e.preventDefault(); setActive(items()[0]); }
    else if (e.key === "End" && !typing) { e.preventDefault(); setActive(items().pop()); }
    else if (e.key === "Enter" || (e.key === " " && !typing)) { e.preventDefault(); if (cur.active) choose(cur.active); else close(); }
    else if (e.key === "Tab") close();
    else if (!typing && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); typeAhead(e.key); }
  }, true);

  document.addEventListener("input", (e) => {
    if (!cur || !e.target.classList?.contains("ms")) return;
    const q = e.target.value.trim().toLowerCase();
    cur.el.querySelector(".ml").innerHTML = cur.sel ? listHTML(cur.sel, q) : plainHTML(cur.list, q);
    setActive(items()[0]);
    place();
  });
  document.addEventListener("mousemove", (e) => {
    const item = cur && e.target.closest?.(".menu .mi:not(.off)");
    if (item && item !== cur.active) setActive(item, false);
  });
  document.addEventListener("click", (e) => {
    const item = cur && e.target.closest?.(".menu .mi");
    if (item) choose(item);
  });
  // 页面滚了、窗口变了：位置对不上，收起来（在这块里面滚不算）。openMenu 刚开的那一小会儿（手机上收键盘，页面会挪一下、变一下大小）只跟着挪
  const fresh = () => cur && !cur.sel && performance.now() - cur.at < 450;
  addEventListener("scroll", (e) => { if (!cur || cur.el.contains(e.target)) return; if (fresh()) place(); else close(); }, true);
  addEventListener("resize", () => { if (fresh()) place(); else close(); });
  addEventListener("hashchange", close);
}
