// 大类（界面上叫 Project，计划的上一层）：名字、颜色、几样设置。存在 Settings 的 groups 里，有顺序，可以改名、加减。
//   labor    这个大类的时间算进季度表的 progress
//   grow     "all" 全部时间算成长 / "deep" 只有标了 ◆ Deep 的算成长，没标的算 Relax / "" 都不算
//   friends  这个大类的任务可以选「和谁」
//   ideas    这个大类加任务时可以从灵感池里挑（见最下面的 ideasOf）
//   track    Projects 页上看它什么（进度 / 每周够不够钟点 / Relax 在不在范围里 / 多久没联系 / 不看），见最下面的 trackOf；min = 够不够的那个钟点（分钟）
// 任务可以直接挂在大类上（task.group），不一定要挂在哪个计划下面。只算数，不碰页面和存储。

// 颜色照油画颜料来：绿 viridian、蓝 ultramarine、橘 cadmium orange、紫 mauve、白 ivory、棕 burnt sienna、赭黄 ochre、茜红 alizarin
export const PALETTE = ["#3E8E6E", "#3F62B5", "#E07A2B", "#8B62AE", "#E6DCC3", "#9A5A36", "#D2A52E", "#B5413F"];
const [GREEN, BLUE, ORANGE, PURPLE, IVORY, BROWN, OCHRE, CRIMSON] = PALETTE;

export const DEFAULTS = [
  { name: "Build", color: GREEN, labor: true, grow: "all" },
  { name: "Work", color: BLUE, labor: true, grow: "all" },
  { name: "Friends", color: PURPLE, labor: true, grow: "", friends: true },
  { name: "Leisure", color: ORANGE, labor: false, grow: "deep" },
  { name: "Fitness", color: IVORY, labor: false, grow: "all" },
  { name: "Chores", color: BROWN, labor: true, grow: "" }
];

// 大类永远按这个顺序摆（她定的，2026-10）：Projects 页、下拉、Stats 的饼图 / 时间表 / 图例都是。清单里别的名字排在后面，照原来的先后
export const ORDER = ["Build", "Work", "Friends", "Leisure", "Fitness", "Chores"];
const rankOf = (name) => { const i = ORDER.indexOf(name); return i < 0 ? ORDER.length : i; };
export const sortGroups = (list) => list.map((g, i) => [g, i]).sort((a, b) => rankOf(a[0].name) - rankOf(b[0].name) || a[1] - b[1]).map(([g]) => g);
// 按大类清单排：清单里的按清单的先后，不在清单里的排后面，空名字（No project）最后
export function byGroupOrder(groups) {
  const at = new Map((groups || []).map((g, i) => [g.name, i]));
  const key = (name) => (!name ? Infinity : at.has(name) ? at.get(name) : (groups || []).length + rankOf(name));
  return (a, b) => key(a.name) - key(b.name);
}

// 圆盘上用的霓虹版：色块压在金属上，要比油画色亮得多。八个颜色一个对一个（绿 → 薄荷霓虹、蓝 → 电光蓝、橘 → 霓虹橙、紫 → 霓虹紫、
// 白 → 纯白、棕 → 琥珀、赭黄 → 霓虹黄、茜红 → 霓虹红）；自己另选的颜色没有对应的，返回空（圆盘那边会把它调亮）
const NEON = { [GREEN]: "#00E58F", [BLUE]: "#3A6BFF", [ORANGE]: "#FF6A00", [PURPLE]: "#B44CFF", [IVORY]: "#FFFFFF", [BROWN]: "#FFB300", [OCHRE]: "#FFE500", [CRIMSON]: "#FF2D4A" };
export const neon = (c) => NEON[String(c || "").toUpperCase()] || "";

// 三个大类换过默认颜色（Fitness 橘 → 白、Leisure 紫 → 橘、Friends 白 → 紫）：三个都还是原来那套才换，换过一次就不再满足、不会重复；
// 自己改过其中任何一个的不动。→ [{ name, color }]（要换的；没有就是空）
const RECOLOR = [["Fitness", ORANGE, IVORY], ["Leisure", PURPLE, ORANGE], ["Friends", IVORY, PURPLE]];
export function recolor(list) {
  const hits = RECOLOR.map(([name, from, to]) => { const g = (list || []).find((x) => match(x.name) === name); return g && String(g.color || "").toUpperCase() === from ? { name: g.name, color: to } : null; });
  return hits.every(Boolean) ? hits : [];
}

// 以前那套亮色 → 现在的颜色（没归进大类的计划换一次）
const OLD_COLORS = { "#B8F000": GREEN, "#C6FF00": GREEN, "#2F5BFF": BLUE, "#FF3EA5": CRIMSON, "#FF7A1A": ORANGE, "#9B5CFF": PURPLE, "#00C2A8": GREEN, "#FFC400": OCHRE, "#FF4D4D": BROWN };
export const newColor = (c) => OLD_COLORS[String(c || "").toUpperCase()] || c || "";

// 旧名字归到哪个大类：「Main - English」→ Build，「Work 1」→ Work，「Fun」→ Leisure……认不出的返回空
const RULES = [
  [/work|job|office/i, "Work"],
  [/gym|fit|sport|workout/i, "Fitness"],
  [/chore|house|errand|admin/i, "Chores"],
  [/english|french|ielts|study|learn|course|exam|language|side|build/i, "Build"],
  [/fun|leisure|play|game|relax/i, "Leisure"],
  [/friend/i, "Friends"]
];
export function match(name) {
  const s = String(name || "").trim();
  if (!s) return "";
  const same = DEFAULTS.find((g) => g.name.toLowerCase() === s.toLowerCase());
  return same ? same.name : (RULES.find(([re]) => re.test(s)) || [])[1] || "";
}

const blank = (name, color) => ({ name, color, labor: false, grow: "" });

// 还没存过大类清单时先这样用：默认的六个，加上计划里出现过、不在清单里的名字（什么都不改）
export function withPlans(list, projects) {
  const out = list.map((g) => ({ ...g }));
  for (const p of projects) {
    const name = String(p.group || "").trim();
    if (name && !out.some((g) => g.name === name)) out.push(blank(name, p.color || PALETTE[out.length % PALETTE.length]));
  }
  return out;
}

// 第一次：现有的计划按名字归进六个大类（计划自己的名字不动），颜色跟着大类；认不出的大类原样排在后面、换成新颜色。
// → { groups, moves: [{ id, group, color }] }（只列要改的计划）
export function adopt(projects) {
  const groups = DEFAULTS.map((g) => ({ ...g }));
  const moves = [];
  for (const p of projects) {
    const old = String(p.group || "").trim();
    const to = match(old) || (old ? "" : match(p.name));
    let group = old, color = newColor(p.color);
    if (to) { group = to; color = groups.find((g) => g.name === to).color; }
    else if (old) {
      let g = groups.find((x) => x.name === old);
      if (!g) groups.push((g = blank(old, color || PALETTE[groups.length % PALETTE.length])));
      color = g.color;
    }
    if (group !== old || color !== p.color) moves.push({ id: p.id, group, color });
  }
  return { groups, moves };
}

export const byName = (list, name) => (list || []).find((g) => g.name === name) || null;

// 这个大类在 Projects 页上看什么（g.track，Settings 里能改）：
//   "progress" 计划的进度（进度条、健康度）        "min"     最近 7 天至少做够 g.min 分钟（默认 3 小时）
//   "range"    最近 7 天的 Relax 在每周的门槛之间    "contact" 最近两周里至少联系过一次        ""  不看
// 没设过就猜：没标 Deep 算 Relax 的那种 = range（哪怕它也能选人——和朋友出去玩还是玩）；别的能选人的 = contact；名字像 Work / Chores 的不看（进度不由自己定），
// 像 Fitness 的看够不够钟点，像 Build 的看进度；认不出的照旧看进度。
export const TRACKS = ["progress", "min", "range", "contact", ""];
export const TRACK_MIN = 180;
const TRACK_BY_NAME = { Work: "", Chores: "", Build: "progress", Fitness: "min", Leisure: "range", Friends: "contact" };
export function trackOf(g) {
  if (!g) return "progress";
  if (TRACKS.includes(g.track)) return g.track;
  if (g.grow === "deep") return "range";
  if (g.friends) return "contact";
  const known = match(g.name);
  return known in TRACK_BY_NAME ? TRACK_BY_NAME[known] : "progress";
}

// 这个大类加任务时能不能从灵感池里挑（g.ideas，Settings 里能改）。没设过就猜：能选人的、没标 Deep 就算 Relax 的那种（Friends、Leisure）
export const ideasOf = (g) => Boolean(g) && (typeof g.ideas === "boolean" ? g.ideas : Boolean(g.friends) || g.grow === "deep");
