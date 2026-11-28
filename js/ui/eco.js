// Projects 页最下面的生态圈（她 2026-11-26 要的：取消 North star 那段字，换成「蓄水池 + 星型生态圈 + Laser Beam」那张图）。
// 图在 Obsidian 白板里画（.canvas），导进来；一种侧重（破局 / 扎根 / 复利 / 过载警示……）一个文件，上面一排切换（记在这台设备上：local.ecoMode）。
//   中间是蓄水池：水位画成从底下涨上来的一池水，按最近 7 天记的时间算（js/energy.js，她 2026-11-26 定的；那块里写的「78%」不再用）。
//   四周连着线的那几块就是最上面一层的目标（span: north，原来 North star 里框出来的也是这一层）：右栏的目标、计划都能连到它们，悬停照样飞线（js/ui/links.js）。
//   线按种类画（js/canvas.js 的 flowsOf：看线上写的字；主线 = 写了 Laser Beam 的那几块之间、蓄水池到它们的线；没字看颜色）：
//   主线（Laser Beam）最粗、一段段亮光顺着流、箭头最大，协同细虚线、进水绿、保底点线、漏水红，别的颜色细实线；线上那个小签就是她写的字。
//   每块卡片都带一点光（夜里）/ 贴纸投影（白天），主线那几块最强（她 2026-11-27 选的）。底下一行图例，只列这张图里有的那几种。
//   这几种颜色是她点名要的（贴的图里就是），只在 .pj-eco 里用，借的是现成的状态色：--blue、--ok、--warn。
// 图按宽度缩放（最大原大小），整张图跟着 Projects 左边那一栏的宽度走。
// 没在图上的最上面一层目标（以前 North star 里框的、图里删掉了的）：图下面一排小签，悬停一样能看到连着谁，× 删掉（提示条能撤销）。

import * as store from "../store.js";
import * as C from "../canvas.js";
import { energy, energyText } from "../energy.js";
import { addDays } from "../dates.js";
import { esc, on } from "../dom.js";
import { toast } from "./common.js";

const LEGEND = { laser: "Laser beam · main output", synergy: "Synergy", inflow: "Inflow · recharge", baseline: "Low-friction floor", leak: "Overload leak" };
const PAD = 28;
let into = "";      // 点了 Replace：下一个选的文件换掉这一种侧重
let lastW = 0;      // 上一次量到的宽度：重画时先用它缩放，不闪一下原大小

const ecos = () => store.boards().filter((b) => b.kind === "eco");
const current = () => { const list = ecos(); return list.find((b) => b.id === store.local().ecoMode) || list[0] || null; };
const px = (v) => Math.round(v) + "px";

function swatch(kind) {
  return '<svg class="eco-sw k-' + kind + '" viewBox="0 0 28 8" aria-hidden="true"><path d="M2 4H26"/></svg>';
}

// 一张生态圈
function diagramHTML(b, c) {
  const canvas = b.canvas, B = C.bounds(canvas, PAD), at = new Map(canvas.nodes.map((n) => [n.id, n]));
  const goals = new Map(store.goals().map((g) => [g.id, g]));
  const { pool, members, notes } = C.ecoParts(canvas);
  // 主线卡片（发光最强）：写了 Laser Beam 的那几块，加上主线箭头指着的（2026-11-27 起主线只认 [Laser Beam] 那几块之间，见 C.flowsOf）
  const flows = C.flowsOf(canvas), laser = C.laserCards(canvas), member = new Set(members.map((n) => n.id));
  let lines = "", beams = "", chips = "";   // 主线最后画，压在别的线上面
  for (const e of canvas.edges) {
    const a = at.get(e.fromNode), z = at.get(e.toNode);
    if (!a || !z) continue;
    const f = flows.get(e), g = C.edgeGeo(a, z, e, { bend: 0.35 }), ah = f.kind === "laser" ? 20 : 10;
    if (f.kind === "laser" && e.toEnd !== "none") laser.add(z.id);
    if (f.kind === "laser" && e.fromEnd === "arrow") laser.add(a.id);
    const head = (e.toEnd !== "none" ? '<path class="eco-ah" d="' + C.arrowPath(g.p3, g.a3, ah) + '"/>' : "") +
      (e.fromEnd === "arrow" ? '<path class="eco-ah" d="' + C.arrowPath(g.p0, g.a0, ah) + '"/>' : "");
    // 流动的那一层（主线、进水、漏水）：一串小点（主线是一段段亮光）顺着线跑，看得出往哪流；减少动态、关了 Sparkles 就不跑
    const flow = f.kind === "laser" || f.kind === "inflow" || f.kind === "leak" ? '<path class="eco-fl" d="' + g.d + '"/>' : "";
    // 她在 Obsidian 里给线上的颜色照用（2026-11-26：「我原本的色系比较多」）；线的粗细、虚实、流动照种类，没上色的线照旧按种类上色
    const own = C.cssColor(e.color);
    const svg = '<g class="eco-e k-' + f.kind + '"' + (own ? ' style="--lc:' + own + '"' : "") + '><path class="eco-ln" d="' + g.d + '"/>' + flow + head + "</g>";
    if (f.kind === "laser") beams += svg; else lines += svg;
    if (e.label) chips += '<span class="eco-chip k-' + f.kind + (own ? " tint" : "") + '" style="left:' + px(g.mid.x - B.x) + ";top:" + px(g.mid.y - B.y) + (own ? ";--kc:" + own : "") + '">' + esc(e.label) + "</span>";
  }
  // 块的颜色也照 Obsidian 里的（边 + 淡淡的底）；没上色的照旧
  const box = (n) => "left:" + px(n.x - B.x) + ";top:" + px(n.y - B.y) + ";width:" + px(n.width) + ";height:" + px(n.height) + (n.color ? ";--cc:" + C.cssColor(n.color) : "");
  const tint = (n) => (n.color ? " tint" : "");
  const nodes = canvas.nodes.map((n) => {
    if (n === pool) {
      // 水位不再手填，按最近 7 天记的时间算（js/energy.js，她 2026-11-26 定的）；停上去看怎么算出来的
      const p = C.partsOf(n.text), x = poolEnergy(c), lv = x.level, why = energyText(x);
      // 矮的那种（她的 energy pool 只有 125 × 50）：名字和水位排成一行，不然大数字把名字挤出去
      return '<div class="eco-pool' + (n.height < 110 ? " small" : "") + '" style="' + box(n) + '" title="' + esc(why) + '" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + lv + '" aria-label="' + esc((p.title || "Reservoir") + ". " + why) + '">' +
        '<i class="eco-water" style="--lv:' + lv + '%" aria-hidden="true"></i><span class="eco-pt">' + esc(p.title) + "</span>" +
        '<b class="eco-lv num">' + lv + "%</b>" + (p.sub ? '<small class="eco-ps">' + esc(p.sub) + "</small>" : "") + "</div>";
    }
    if (member.has(n.id)) {
      const gid = b.goals[n.id], g = goals.get(gid), p = C.partsOf(n.text);
      return '<div class="eco-n' + (laser.has(n.id) ? " laser" : "") + (g?.done ? " done" : "") + tint(n) + '"' + (g ? ' data-goal="' + esc(g.id) + '" tabindex="0"' : "") + ' style="' + box(n) + '">' +
        '<span class="eco-t">' + esc(p.title) + "</span>" + (p.sub ? '<small class="eco-s">' + esc(p.sub) + "</small>" : "") + "</div>";
    }
    if (n.type === "group") return '<div class="eco-grp' + tint(n) + '" style="' + box(n) + '">' + (n.label ? "<span>" + esc(n.label) + "</span>" : "") + "</div>";
    if (notes.includes(n) && n.type === "text") return '<div class="eco-note" style="' + box(n) + '"><div class="cv-md">' + C.md(n.text) + "</div></div>";
    return "";
  }).join("");
  const kinds = C.kindsIn(canvas);
  return '<div class="eco-fit" style="--w:' + Math.round(B.w) + ";--h:" + Math.round(B.h) + (lastW ? ";--k:" + Math.min(1, lastW / B.w).toFixed(4) : "") + '">' +
    '<div class="eco-world" style="width:' + px(B.w) + ";height:" + px(B.h) + '">' +
    '<svg class="eco-lines" width="' + Math.round(B.w) + '" height="' + Math.round(B.h) + '" viewBox="' + Math.round(B.x) + " " + Math.round(B.y) + " " + Math.round(B.w) + " " + Math.round(B.h) + '" aria-hidden="true">' + lines + beams + "</svg>" +
    nodes + chips + "</div></div>" +
    // 线带着自己的颜色时，图例只说粗细虚实（画成墨色），不然颜色对不上
    (kinds.length ? '<ul class="eco-legend' + (canvas.edges.some((e) => e.color) ? " mono" : "") + '" aria-label="Legend">' + kinds.map((k) => "<li>" + swatch(k) + esc(LEGEND[k]) + "</li>").join("") + "</ul>" : "");
}

// 最上面一层、却不在任何一张图上的目标
function loose() {
  const on = new Set(ecos().flatMap((b) => Object.values(b.goals)));
  return store.goals().filter((g) => g.span === "north" && !on.has(g.id));
}

// 图下面那排小签：还有几样挂在它下面（下一层的目标 + 为它服务的计划 / 项目）。她 2026-11-26 说原来的大块不要了、拆到图上的小块里：
// 悬停看是哪几样，一样样拖到图上的块，拖完数字没了再 × 删掉（删的时候还挂着的，下面那几条就没有上级了）
const under = (g) => store.goals().filter((x) => x.up === g.id).length + (Array.isArray(g.by) ? g.by.length : 0);

// 蓄水池的水位：到昨天为止的 7 天（社交看到昨天为止最近一次联系）
function poolEnergy(c) {
  const to = addDays(c.today, -1), last = Object.values(store.lastContact()).filter((d) => d && d <= to).sort().pop() || "";
  return energy(c, { weekly: store.setting("weekly", {}), lastContact: last });
}

export function ecoHTML(c) {
  const list = ecos(), b = current(), rest = loose();
  const input = '<input type="file" class="eco-file" accept=".canvas,application/json" multiple hidden>';
  const restHTML = rest.length ? '<p class="eco-also"><span>' + (list.length ? "Not on the diagram" : "Top-level goals") + "</span>" +
    rest.map((g) => { const n = under(g); return '<span class="eco-o' + (g.done ? " done" : "") + '" data-goal="' + esc(g.id) + '" tabindex="0"' +
      (n ? ' title="' + n + (n > 1 ? " goals and plans still hang" : " goal or plan still hangs") + ' under it — hover to see them, drag each onto a card above, then delete this one"' : "") + ">" + esc(g.text) +
      (n ? '<small class="eco-on num">' + n + "</small>" : "") +
      '<button type="button" class="eco-ox" data-act="eco-drop" aria-label="Delete goal: ' + esc(g.text) + '" title="Delete">×</button></span>'; }).join("") + "</p>" : "";
  if (!b) {
    return '<section class="pj-eco none" aria-label="Ecosystem"><header class="eco-head"><h3>Ecosystem</h3>' +
      '<span class="eco-tools"><button type="button" class="btn" data-act="eco-import">Import .canvas</button>' + input + "</span></header>" +
      '<p class="hint">Draw it on an Obsidian canvas: a card for each area of life, a reservoir card in the middle (call it 蓄水池, reservoir or pool — its level is worked out from the last 7 days of logged time), ' +
      "and arrows labelled with what they carry and their share — 主线 55%, 进水 10%, 保底 15%, 协同, 漏水 (or main, inflow, floor, synergy, leak). One file per emphasis. " +
      "Every card with an arrow becomes a top-level goal, so goals and plans can link up to it.</p>" + restHTML + "</section>";
  }
  const tabs = list.length > 1 ? '<span class="seg eco-modes" role="tablist" aria-label="Emphasis">' + list.map((x) => '<button type="button" role="tab" data-act="eco-mode" data-id="' + esc(x.id) + '" aria-selected="' + (x === b) + '"' + (x === b ? ' class="on"' : "") + ">" + esc(x.name) + "</button>").join("") + "</span>"
    : '<span class="eco-name">' + esc(b.name) + "</span>";
  return '<section class="pj-eco" aria-label="Ecosystem"><header class="eco-head"><h3>Ecosystem</h3>' + tabs +
    '<span class="eco-tools"><button type="button" class="link" data-act="eco-import" title="Add another emphasis, or update one by importing its file again">Import</button>' +
    '<button type="button" class="link" data-act="eco-replace">Replace</button><button type="button" class="link" data-act="eco-del">Remove</button>' + input + "</span></header>" +
    (b.canvas ? diagramHTML(b, c) : '<p class="hint">This diagram is still syncing.</p>') + restHTML + "</section>";
}

// 整页重画完：按这一栏的宽度缩放（css 拿 --k 乘），窗口变了再量
let ro = null;
export function ecoAfterRender() {
  const fit = document.querySelector(".pj-eco .eco-fit");
  if (!fit) return;
  const size = () => {
    const w = fit.clientWidth;
    if (!w) return;
    lastW = w;
    fit.style.setProperty("--k", Math.min(1, w / (Number(fit.style.getPropertyValue("--w")) || w)).toFixed(4));
  };
  size();
  ro?.disconnect();
  ro = new ResizeObserver(size);
  ro.observe(fit);
}

async function importFiles(files, id = "") {
  let last = null;
  for (const f of [...files]) {
    if (!/\.canvas$/i.test(f.name) && f.type !== "application/json") { toast(f.name + " isn't a .canvas file"); continue; }
    try {
      const canvas = C.parseCanvas(await f.text());
      if (!canvas.edges.length) { toast(f.name + " has no arrows — label them like 主线 55% or 进水 10%"); continue; }
      last = store.importBoard({ id, file: f.name, canvas, kind: "eco" });
      id = "";
    } catch (err) { toast(err.message || "Couldn't read " + f.name); }
  }
  if (last) store.setLocal({ ecoMode: last.id });
}

export function initEco() {
  on(document, "click", ".pj-eco [data-act]", (e, el) => {
    const act = el.dataset.act, b = current();
    if (act === "eco-import" || act === "eco-replace") {
      into = act === "eco-replace" && b ? b.id : "";
      document.querySelector(".pj-eco .eco-file")?.click();
    } else if (act === "eco-mode") store.setLocal({ ecoMode: el.dataset.id });
    else if (act === "eco-del" && b) store.deleteBoard(b.id);
    else if (act === "eco-drop") { e.stopPropagation(); const id = el.closest("[data-goal]")?.dataset.goal; if (id) store.deleteGoal(id); }
  });
  on(document, "change", ".pj-eco .eco-file", (e, input) => {
    const files = [...input.files], id = into;
    into = "";
    input.value = "";
    if (files.length) importFiles(files, id);
  });
  const files = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  on(document, "dragover", ".pj-eco", (e, sec) => { if (!files(e)) return; e.preventDefault(); sec.classList.add("drop-on"); });
  on(document, "dragleave", ".pj-eco", (e, sec) => { if (!sec.contains(e.relatedTarget)) sec.classList.remove("drop-on"); });
  on(document, "drop", ".pj-eco", (e, sec) => { if (!files(e)) return; e.preventDefault(); sec.classList.remove("drop-on"); importFiles(e.dataTransfer.files); });
}
