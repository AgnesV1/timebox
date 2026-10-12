// 大类（界面上叫 Project，计划的上一层）：名字、颜色、几样设置。存在 Settings 的 groups 里，有顺序，可以改名、加减。
//   labor    这个大类的时间算进季度表的 progress
//   grow     "all" 全部时间算成长 / "deep" 只有标了 ◆ Deep 的算成长，没标的算 Relax / "" 都不算
//   friends  这个大类的任务可以选「和谁」
// 任务可以直接挂在大类上（task.group），不一定要挂在哪个计划下面。只算数，不碰页面和存储。

// 颜色照油画颜料来：绿 viridian、蓝 ultramarine、橘 cadmium orange、紫 mauve、白 ivory、棕 burnt sienna、赭黄 ochre、茜红 alizarin
export const PALETTE = ["#3E8E6E", "#3F62B5", "#E07A2B", "#8B62AE", "#E6DCC3", "#9A5A36", "#D2A52E", "#B5413F"];
const [GREEN, BLUE, ORANGE, PURPLE, IVORY, BROWN, OCHRE, CRIMSON] = PALETTE;

export const DEFAULTS = [
  { name: "Work", color: BLUE, labor: true, grow: "all" },
  { name: "Fitness", color: ORANGE, labor: false, grow: "all" },
  { name: "Chores", color: BROWN, labor: true, grow: "" },
  { name: "Build", color: GREEN, labor: true, grow: "all" },
  { name: "Leisure", color: PURPLE, labor: false, grow: "deep" },
  { name: "Friends", color: IVORY, labor: true, grow: "", friends: true }
];

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
