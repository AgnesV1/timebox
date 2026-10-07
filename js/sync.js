// 和 Google Sheet（Apps Script）同步：先推本机的改动，再拉表格里比上次新的。
// 改完 2.5 秒推一次（连着点几下只发一次）；页面切走时用 sendBeacon 补发；回到页面、联网时再同步。
// 表格里的 Code.gs 和页面要是同一版（VERSION）：不知道表格是哪版时先问一句，旧版就先不推，改动都留在本机。

import * as store from "./store.js";
import { debounce } from "./dom.js";

export const VERSION = 3;

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

export async function sync({ full = false } = {}) {
  const { url, secret } = store.local();
  if (!url) {
    set(store.hasPending() ? "Saved on this device" : "Local only");
    return false;
  }
  if (busy) { again = true; return false; }
  busy = true;
  queue.cancel();
  set("Syncing…");
  let ok = false;
  try {
    if (!current()) {
      // 先问表格是哪一版（不带数据）；旧版 Code.gs 不回 version
      const hello = await post(url, { secret });
      if (!(Number(hello.version) >= VERSION)) throw new Error(ERRORS["old sheet"]);
      store.setLocal({ serverVersion: Number(hello.version) });
    }
    full = full || store.needsFull();
    const out = store.outgoing();
    const data = await post(url, { secret, pull: true, since: full ? 0 : store.cursor(), push: { rows: out.rows, deletes: out.deletes } });
    store.pushed(out, data.tables || store.TABLES);
    store.applyPull(data.pull, data.now, { full });
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

export const queue = debounce(() => sync(), 2500);

// 页面切走或关掉：等不到 2.5 秒了，直接发出去。不确定一定送到，所以待推送的记录先留着，下次再推一遍
export function beacon() {
  const { url, secret } = store.local();
  if (!url || !current() || !store.hasPending() || !navigator.sendBeacon) return;
  queue.cancel();
  const out = store.outgoing();
  navigator.sendBeacon(url, new Blob([JSON.stringify({ secret, version: VERSION, push: { rows: out.rows, deletes: out.deletes } })], { type: "text/plain;charset=utf-8" }));
}
