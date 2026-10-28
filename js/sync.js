// 和 Google Sheet（Apps Script）同步：先推本机的改动，再拉表格里比上次新的。
// 改完 2.5 秒推一次（连着点几下只发一次）；页面切走时用 sendBeacon 补发；回到页面、联网时再同步。
// 表格里的 Code.gs 和页面要是同一版（VERSION）：不知道表格是哪版时先问一句，旧版就先不推，改动都留在本机。
// 同步完顺手做的：季度表里这几天的两格和自己打的分（设了链接才发，值变了才发）；每天让表格清一次过期的删除记录。
// 阅读表格、记账表格搭同一趟车（各自设了链接才带）。

import * as store from "./store.js";
import * as reading from "./reading.js";
import * as spend from "./spend.js";
import * as S from "./stats.js";
import * as SC from "./scores.js";
import { debounce } from "./dom.js";
import { quarterOf } from "./dates.js";

export const VERSION = 6;
const KEEP_DELETED_DAYS = 14;   // 表格里的删除记录只留这么久：更久没同步的设备整表重拉一次

let busy = false, again = false;
let status = { text: "", bad: false };
const listeners = new Set();

const ERRORS = {
  denied: "Wrong secret",
  "old page": "Update Code.gs in your Sheet first",
  "old sheet": "Update Code.gs in your Sheet first",
  busy: "Sheet is busy — will retry",
  "bad request": "Sheet couldn't read the request"
};

export const getStatus = () => status;
export function onStatus(fn) { listeners.add(fn); }
function set(text, bad = false) {
  status = { text, bad };
  listeners.forEach((fn) => fn(status));
}

const hhmm = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function configured() {
  return Boolean(store.local().url);
}

async function post(url, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ version: VERSION, ...body }), signal: ctrl.signal });
  clearTimeout(timer);
  const data = await res.json();
  if (data.error) throw new Error(ERRORS[data.error] || data.error);
  return data;
}

const current = () => Number(store.local().serverVersion) >= VERSION;
// 太久没同步：这段时间里别处删掉的东西，表格已经不记得了，只能整表对一遍
const stale = () => store.cursor() > 0 && Date.now() - store.cursor() > (KEEP_DELETED_DAYS - 1) * 864e5;

// archive = { before }：顺便把这天以前的任务搬进表格的 Archive 页（见 Code.gs 的 archive_）
export let lastAt = 0;   // 上次开始同步的时候（main.js 回到窗口时看隔了多久）
export async function sync({ full = false, archive = null } = {}) {
  const { url, secret } = store.local();
  if (!url) {
    set(store.hasPending() ? "Saved on this device" : "Local only");
    return false;
  }
  if (busy) { again = true; return false; }
  busy = true;
  lastAt = Date.now();
  queue.cancel(); soon.cancel();
  set("Syncing…");
  let ok = false;
  try {
    if (!current()) {
      // 先问表格是哪一版（不带数据）；旧版 Code.gs 不回 version
      const hello = await post(url, { secret });
      if (!(Number(hello.version) >= VERSION)) throw new Error(ERRORS["old sheet"]);
      store.setLocal({ serverVersion: Number(hello.version) });
    }
    full = full || store.needsFull() || stale();
    const out = store.outgoing();
    // 阅读表格：设了链接才带（要追加的、要不要列表）
    const rq = store.setting("reading")?.url ? reading.request() : null;
    // 记账表格：一样，设了链接才带（js/spend.js）
    spend.link(Boolean(store.setting("spend")?.url));
    const sq = store.setting("spend")?.url && spend.due() ? spend.request() : null;
    const day = store.today(), tidy = store.local().tidied !== day;
    const data = await post(url, { secret, pull: true, since: full ? 0 : store.cursor(), push: { rows: out.rows, deletes: out.deletes },
      ...(rq ? { reading: rq } : {}), ...(sq ? { spend: sq } : {}), ...(tidy ? { tidy: true } : {}), ...(archive ? { archive } : {}) });
    store.pushed(out, data.tables || store.TABLES);
    store.applyPull(data.pull, data.now, { full });
    if (rq) reading.apply(data.reading, rq);
    if (sq) spend.apply(data.spend, sq);
    if (tidy) store.setLocal({ tidied: day });
    if (archive) { store.forgetStorage(); store.setLocal({ archived: data.archive?.moved ?? 0 }); }
    await quarter(url, secret);
    set("Synced " + hhmm());
    ok = true;
  } catch (e) {
    const msg = e.name === "AbortError" ? "Sheet didn't answer" : navigator.onLine === false ? "Offline" : e instanceof TypeError ? "Can't reach the Sheet" : e.message;
    set(msg + " — saved here", true);
  }
  busy = false;
  if (again) { again = false; queue(); }
  return ok;
}

let tried = { key: "", at: 0 };
const OLD_SCRIPT = "Update Code.gs in your Sheet so the daily scores reach the quarter sheet";
// 季度表：把最近两周里和上次发的不一样的那几天发过去（数据刚拉过，是最新的）；再加上自己打的分和 note，
// 凡是和上次写进去的不一样的那几天（不管多久以前）都带上 cells——两周以前的只带 cells，不带 progress / focus，
// 免得归档掉的任务把那几天的旧数算成 0。出了问题只记一句，不影响同步
async function quarter(url, secret) {
  const q = store.setting("quarter");
  if (!q?.url) return;
  const L = store.local(), sent = L.quarterSent || {}, scoreSent = L.scoreSent || {};
  const mark = (r) => r.progress + "|" + r.focus;
  const all = S.quarterRows(store.ctx(), q.from || store.today());
  const byDate = new Map(all.filter((r) => sent[r.date] !== mark(r)).map((r) => [r.date, { ...r }]));
  const cur = store.scoreCells(), keys = new Set([...store.scoreSetup().defs.map((d) => d.key), SC.NOTE]);
  for (const date of new Set([...Object.keys(cur), ...Object.keys(scoreSent)])) {
    const cells = SC.cellsToSend(cur[date], scoreSent[date], keys);
    if (cells) byDate.set(date, { ...(byDate.get(date) || { date }), cells });
  }
  let rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  // 没有要填的（比如刚贴链接、今天还没记东西）：还没说过话就先探一下——只发今天的日期、不带数，表格那边什么都不写，
  // 只回这一天那一行找不找得到。这样贴完链接马上知道对不对
  const T = store.today(), probe = !rows.length && !L.quarterNote;
  if (probe) rows = [{ date: T }];
  if (!rows.length) return;
  // 上次发的就是这几行、没填进去（比如那个季度的页签还没建）：十分钟内不重发
  const key = q.url + JSON.stringify(rows);   // 换了链接就不算「上次发过」
  if (key === tried.key && Date.now() - tried.at < 6e5) return;
  tried = { key, at: Date.now() };
  const asked = rows.some((r) => r.cells);
  let note = "", done = [], cellsOk = false, scoreNote = L.scoreNote || "";
  try {
    const res = (await post(url, { secret, quarter: { rows } })).quarter || {};
    if (res.error) note = res.error === "no sheet" ? "Can't open that Sheet" : String(res.error);
    else {
      done = res.done || [];
      cellsOk = res.cells === true;
      const miss = (res.missing || [])[0];
      note = miss ? miss.why : !done.length ? "" : probe ? "Connected — found today on the " + T.slice(0, 4) + " Q" + quarterOf(T) + " tab. It fills in once you log something today." : "Filled through " + done.slice().sort().pop();
      // 打的分：旧版 Code.gs 不认 cells（不回 cells: true），先不算发过，等换了新版再发；表格里没有的那一列照样算发过，只提示一句
      if (asked) scoreNote = !cellsOk ? OLD_SCRIPT : (res.skipped || [])[0]?.why || "";
    }
  } catch (e) { note = e.message || "Couldn't reach the quarter sheet"; }
  // 只记着还在这两周里的日子
  const keep = Object.fromEntries(all.map((r) => [r.date, sent[r.date]]).filter(([, v]) => v !== undefined));
  if (!probe) for (const r of rows) if (done.includes(r.date) && "progress" in r) keep[r.date] = mark(r);
  const keepScores = { ...scoreSent };
  if (cellsOk) for (const r of rows) {
    if (!r.cells || !done.includes(r.date)) continue;
    const s = Object.fromEntries(Object.entries(keepScores[r.date] || {}).filter(([k]) => keys.has(k)));   // 拿掉了的列不再记着
    for (const [k, v] of Object.entries(r.cells)) { if (v === "") delete s[k]; else s[k] = v; }
    if (Object.keys(s).length) keepScores[r.date] = s; else delete keepScores[r.date];
  }
  const patch = {};
  if (JSON.stringify(keep) !== JSON.stringify(sent)) patch.quarterSent = keep;
  if (note && note !== L.quarterNote) patch.quarterNote = note;
  if (JSON.stringify(keepScores) !== JSON.stringify(scoreSent)) patch.scoreSent = keepScores;
  if (scoreNote !== (L.scoreNote || "")) patch.scoreNote = scoreNote;
  if (Object.keys(patch).length) store.setLocal(patch);
}

export const queue = debounce(() => sync(), 2500);
// 记账改了：0.6 秒就推（她 10-25 说手机上改了，电脑一直没反应——记完马上锁屏的话，2.5 秒等不到）
export const soon = debounce(() => sync(), 600);

// 页面切走或关掉：等不到了，直接发出去（任务那些表 + 记账排着的）。不确定一定送到，所以待推送的先留着，下次再推一遍
// （表格按 id + 修改时间写，重复发不会出错）。记账的 since 设成现在：回应收不到，不用表格回一堆行
export function beacon() {
  const { url, secret } = store.local();
  if (!url || !current() || !navigator.sendBeacon) return;
  const sq = store.setting("spend")?.url ? spend.request() : null;
  const money = sq && (sq.put.length || sq.del.length || sq.budgets || sq.cats);
  if (!store.hasPending() && !money) return;
  queue.cancel(); soon.cancel();
  const out = store.outgoing();
  navigator.sendBeacon(url, new Blob([JSON.stringify({ secret, version: VERSION, push: { rows: out.rows, deletes: out.deletes }, ...(money ? { spend: { ...sq, since: Date.now() } } : {}) })], { type: "text/plain;charset=utf-8" }));
}
