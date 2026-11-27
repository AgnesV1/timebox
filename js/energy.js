// 生态圈中间那个蓄水池的水位（Projects 页最下面，js/ui/eco.js）。纯计算，不碰页面和存储。
// 她 2026-11-26 定的（图上的线只是她自己想事情用的，不参与计算）：
//   · 起点 50%。每天按「到昨天为止的 7 天」重新算一次——等于在今天的基础上加上昨天、去掉第 8 天；今天做的明天才算进去，一天里水位不跳。
//   · 抽走：有效时间 = Build + Work + Chores 记下的时间（和 Stats 顶上、Year 第一条同一个说法，js/stats.js 的 coreGroups），
//     标了 ◆ Deep 的 1 小时算 3 小时；一周 60 小时抽走 55 个点，超了照比例接着抽。
//   · 返回：娱乐、社交达标各 +20；健身她问怎么算，我定的是达标 +15——这样 55 个点抽走、三样都达标正好 55 个点回来，
//     一周干满 60 小时、娱乐社交健身都顾上 = 停在 50%，是一个撑得下去的平衡点。
//   · 达标用 Projects 页各大类头上那句已有的标准（js/stats.js 的 groupHealth）：娱乐 = 看 Relax 范围的那个大类（Leisure，默认每周 5–20 小时），
//     社交 = 看多久没联系的那个（Friends，两周内联系过），健身 = 看够不够钟点的那个（Fitness，7 天够 3 小时，Settings 里能改）。
//   · 0–100 封顶。数都在 ENERGY 里，以后要改就改这里。

import * as E from "./engine.js";
import * as GR from "./groups.js";
import { rowOf, coreGroups, groupHealth } from "./stats.js";
import { addDays } from "./dates.js";

export const ENERGY = { start: 50, weekHours: 60, drain: 55, deepX: 3, back: { range: 20, contact: 20, min: 15 } };
const WHO = { range: "Leisure", contact: "Friends", min: "Fitness" };

// → { level（0–100 的整数）, from, to（算的那 7 天）, hours（有效时间，小时）, deepHours, weighted（Deep 乘过以后）, out（抽走几个点）, backs: [{ kind, name, ok, pts }] }
//   lastContact = 到昨天为止最近一次联系的那天（社交达不达标用）；weekly = Settings 的每周门槛（Relax 范围）
export function energy(ctx, { weekly = {}, lastContact = "", cfg = ENERGY } = {}) {
  const to = addDays(ctx.today, -1), from = addDays(to, -6), core = new Set(coreGroups(ctx));
  let min = 0, deep = 0;
  for (const t of ctx.tasks || []) {
    if (!t.date || t.date < from || t.date > to) continue;
    const m = E.spentMin(t);
    if (!m || !core.has(rowOf(ctx, t, "group").name)) continue;
    min += m;
    if (t.deep) deep += m;
  }
  const weighted = (min + deep * (cfg.deepX - 1)) / 60, out = cfg.drain * weighted / cfg.weekHours;
  const day = { ...ctx, today: to }, backs = [];
  for (const kind of ["range", "contact", "min"]) {
    const g = (ctx.groups || []).find((x) => GR.trackOf(x) === kind);
    if (!g) continue;
    const ok = groupHealth(day, g, { weekly, lastContact })?.level === "ok";
    backs.push({ kind, name: g.name || WHO[kind], ok, pts: ok ? cfg.back[kind] : 0 });
  }
  const raw = cfg.start - out + backs.reduce((a, b) => a + b.pts, 0);
  return { level: Math.round(Math.max(0, Math.min(100, raw))), from, to, hours: min / 60, deepHours: deep / 60, weighted, out, backs, cfg };
}

// 停在蓄水池上看的那句：怎么算出来的
const h1 = (v) => (Math.round(v * 10) / 10).toString();
export function energyText(x) {
  return "Energy " + x.level + "% — the 7 days to yesterday. Starts at " + x.cfg.start + "; Build + Work + Chores " + h1(x.hours) + "h" +
    (x.deepHours ? " (" + h1(x.deepHours) + "h deep, counted ×" + x.cfg.deepX + " = " + h1(x.weighted) + "h)" : "") +
    " takes " + Math.round(x.out) + " (" + x.cfg.drain + " per " + x.cfg.weekHours + "h)" +
    x.backs.map((b) => "; " + b.name + (b.ok ? " on track +" + b.pts : " not yet +0")).join("") + ".";
}
