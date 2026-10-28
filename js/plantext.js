// 计划的文字：粘贴一整份（markdown）变成计划和它 Pool 里的项；反过来也能写成文字拿去改（Copy as text），改完再粘回来。
// 认的写法（中英文都行；认不出的原样留在备注里，不丢）：
//   # 计划名
//   ## 分区                        名字取到第一个「：」「（」为止；写着「储备 / reserve / later / someday」的分区先算 Later
//   - [ ] 项 · 30min · ×11 · 备注    「 · 」分开（打成「•」「・」也行）：时长（30min 2h 1h45min 45分钟 2小时）、次数（×11、共 40 次、any）、每周（2/week、每周 2 次），其余是这一项的备注
//     - [ ] 步骤 · 35min             缩进的是上一项的步骤；项自己没写时长就是步骤加起来
//   「L3 ×2、L5 ×3」这样的一行       每周大概几次，按代号（L3）对上那一项
//   YYYY-MM-DD 至 YYYY-MM-DD       计划的起止
// 别的（段落、表格、规则、标准流程）都进计划的 Notes，标题一起留着。纯计算，不碰存储。

// 中间那个点：· 之外，「•」（Mac 上 ⌥8）、「・」「∙」「⋅」看着都一样，她打过「•」读不出来（2026-10-27）
const SEP = /\s+[·•・∙⋅]\s+|\s*[·•・∙⋅]\s*(?=\S)/;
const DUR = /^(?:约\s*|~\s*|about\s+)?(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?|小时|个小时))?\s*(?:(\d+)\s*(?:m|min|mins|minutes?|分钟|分))?$/i;
const ITEM = /^([-*+])\s+\[[ xX]\]\s+(.*)$/;
const CODE = /^([A-Z]{1,3}\d{1,2})(?![\w])/;
const WEEKLY = /([A-Z]{1,3}\d{1,2})\s*[×xX✕]\s*(\d+)/g;
const LATER = /储备|备用|以后|reserve|later|someday/i;

// 「1h45min」→ 105；认不出是 null
export function parseDur(s) {
  const m = DUR.exec(String(s || "").trim());
  if (!m || (!m[1] && !m[2])) return null;
  return Math.round((Number(m[1]) || 0) * 60 + (Number(m[2]) || 0));
}

// 105 → 「1h45min」；写回文字用，和 parseDur 来回一致
export function fmtDur(min) {
  const v = Math.max(0, Math.round(Number(min) || 0));
  if (v < 60) return v + "min";
  return Math.floor(v / 60) + "h" + (v % 60 ? (v % 60) + "min" : "");
}

// 次数：{ n, rest }，rest = 同一段里次数后面剩下的话（「×6（话题从新题库里选）」）；「每天，共 40 次」认了次数、整段话也留着
const countOf = (s) => {
  let m = /^[×xX✕]\s*(\d+)\s*(.*)$/.exec(s) || /^(\d+)\s*(?:次|times)\s*(.*)$/i.exec(s);
  if (m) return { n: Number(m[1]), rest: m[2].trim() };
  if (/^(?:any|as often as i like|随时|不限)$/i.test(s)) return { n: 0, rest: "" };
  m = /共\s*(\d+)\s*次/.exec(s);
  return m ? { n: Number(m[1]), rest: s } : null;
};
const weekOf = (s) => {
  const m = /^(?:about\s+)?(\d+)\s*(?:\/\s*w(?:ee)?k|a week|per week)$/i.exec(s) || /^每周\s*(\d+)\s*次$/.exec(s);
  return m ? Number(m[1]) : null;
};

// 一行项 / 步骤：「名字 · 30min · ×11 · 备注」
export function parseLine(text) {
  const [head, ...rest] = String(text || "").trim().split(SEP);
  const out = { title: head.replace(/\s*#N$/i, "").trim(), est: null, n: null, perWeek: null, note: "" };
  const notes = [];
  for (const raw of rest) {
    const s = raw.trim();
    if (!s) continue;
    const d = parseDur(s), w = weekOf(s), c = out.n === null ? countOf(s) : null;
    if (d !== null && out.est === null) { out.est = d; continue; }
    if (w !== null) { out.perWeek = w; continue; }
    if (c) { out.n = c.n; if (c.rest) notes.push(c.rest); continue; }
    notes.push(s);
  }
  out.note = notes.join(" · ");
  const code = CODE.exec(out.title);
  out.code = code ? code[1] : "";
  return out;
}

const sectionName = (s) => s.split(/[：:（(]/)[0].trim() || s.trim();
const indentOf = (s) => s.length - s.trimStart().length;

// 整份文字 → { name, start, end, notes, sections: [{ name, later, items: [{ title, est, n, perWeek, steps, note, code }] }] }
export function parse(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const out = { name: "", start: "", end: "", notes: "", sections: [] };
  const notes = [];
  let sec = null, item = null, secNoted = false;
  const weekly = {};   // 不在哪个分区里的「L3 ×2、L5 ×3」；在分区里的只管那个分区（储备里同代号的不跟着）
  // 进备注的一行：这个分区第一次有字进来时先写它的标题；空行只留一个
  const note = (line) => {
    if (!line.trim()) { if (notes.length && notes[notes.length - 1] !== "") notes.push(""); return; }
    if (sec && !secNoted) { notes.push("", "## " + sec.head); secNoted = true; }
    notes.push(line);
  };
  for (const line of lines) {
    const t = line.trim();
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      item = null;
      if (h[1] === "#" && !out.name) { out.name = h[2].trim(); continue; }
      if (h[1] === "##") {
        sec = { head: h[2].trim(), name: sectionName(h[2]), later: LATER.test(h[2]), items: [], count: /[×xX✕]\s*(\d+)/.exec(h[2]) };
        out.sections.push(sec);
        secNoted = false;
        continue;
      }
      note(line);
      continue;
    }
    const m = ITEM.exec(t);
    if (m && item && indentOf(line) >= 2) {
      const s = parseLine(m[2]);
      item.steps.push({ t: s.title, min: s.est || 0 });
      continue;
    }
    if (m && indentOf(line) < 2) {
      if (!sec) { sec = { head: "", name: "", later: false, items: [], count: null }; out.sections.push(sec); secNoted = true; }
      const s = parseLine(m[2]);
      item = { title: s.title, est: s.est, n: s.n, perWeek: s.perWeek, steps: [], note: s.note, code: s.code };
      sec.items.push(item);
      continue;
    }
    if (t && indentOf(line) < 2) item = null;
    const pairs = [...t.matchAll(WEEKLY)];
    if (pairs.length >= 2 && !m) for (const [, code, n] of pairs) (sec ? (sec.weekly = sec.weekly || {}) : weekly)[code] = Number(n);
    if (!out.start) {
      const d = /(\d{4}-\d{2}-\d{2})\s*(?:至|到|to|–|—|~|-)\s*(\d{4}-\d{2}-\d{2})/.exec(t);
      if (d) { out.start = d[1]; out.end = d[2]; }
    }
    note(line);
  }
  for (const s of out.sections) {
    // 分区标题里写了 ×5、下面只有一项又没写次数的：次数就是标题里那个
    if (s.count && s.items.length === 1 && s.items[0].n === null) s.items[0].n = Number(s.count[1]);
    for (const i of s.items) {
      if (i.est === null && i.steps.length) i.est = i.steps.reduce((a, x) => a + (Number(x.min) || 0), 0) || null;
      if (i.perWeek === null && i.code) i.perWeek = s.weekly?.[i.code] ?? weekly[i.code] ?? null;
      i.est = i.est ?? 0;
      i.n = i.n ?? 1;
      i.perWeek = i.perWeek ?? 0;
    }
    delete s.head;
    delete s.count;
    delete s.weekly;
  }
  out.sections = out.sections.filter((s) => s.items.length);
  out.notes = notes.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

// 认出了什么：每个分区几项、加起来多少（时长 × 次数，Any 只算一次），Later 另算
export function summary(plan) {
  const sum = (items) => items.reduce((a, i) => a + (Number(i.est) || 0) * (i.n > 0 ? i.n : 1), 0);
  const secs = plan.sections.map((s) => ({ name: s.name, later: Boolean(s.later), count: s.items.length, times: s.items.reduce((a, i) => a + (i.n > 0 ? i.n : 0), 0), min: sum(s.items), steps: s.items.reduce((a, i) => a + i.steps.length, 0) }));
  return { sections: secs, min: secs.filter((s) => !s.later).reduce((a, s) => a + s.min, 0), later: secs.filter((s) => s.later).reduce((a, s) => a + s.min, 0) };
}

// 写回文字（Copy as text）：parse(format(x)) 认出来的和 x 一样
export function format(plan) {
  const out = ["# " + (plan.name || "Plan")];
  if (plan.start && plan.end && !String(plan.notes || "").includes(plan.start)) out.push("", "- " + plan.start + " to " + plan.end);
  if (String(plan.notes || "").trim()) out.push("", String(plan.notes).trim());
  for (const s of plan.sections || []) {
    out.push("", "## " + (s.name || "Pool") + (s.later && !LATER.test(s.name || "") ? " (later)" : ""), "");
    for (const i of s.items || []) {
      const bits = [i.title];
      if (Number(i.est) > 0 && !(i.steps?.length && sumSteps(i.steps) === Number(i.est))) bits.push(fmtDur(i.est));
      if (i.n === 0) bits.push("any");
      else if (i.n > 1) bits.push("×" + i.n);
      if (i.perWeek > 0) bits.push(i.perWeek + "/week");
      if (i.note) bits.push(i.note);
      out.push("- [ ] " + bits.join(" · "));
      for (const st of i.steps || []) out.push("  - [ ] " + st.t + (Number(st.min) > 0 ? " · " + fmtDur(st.min) : ""));
    }
  }
  return out.join("\n") + "\n";
}
const sumSteps = (steps) => steps.reduce((a, x) => a + (Number(x.min) || 0), 0);

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

// 粘回已有的计划：新文字里的每一项对上旧的哪一项（先比名字，再比只出现一次的代号）。
// 返回 { pairs: [[新, 旧]], added: [新], gone: [旧] }，旧的 = { id, title, code }
export function match(parsedItems, oldItems) {
  const left = new Map(oldItems.map((o) => [o.id, o]));
  const pairs = [], added = [];
  const codeOf = (x) => x.code || CODE.exec(x.title || "")?.[1] || "";
  const once = (list, code) => list.filter((x) => codeOf(x) === code).length === 1;
  const pending = [];
  for (const it of parsedItems) {
    const hit = [...left.values()].find((o) => norm(o.title) === norm(it.title));
    if (hit) { pairs.push([it, hit]); left.delete(hit.id); } else pending.push(it);
  }
  for (const it of pending) {
    const code = codeOf(it);
    const hit = code && once(parsedItems, code) ? [...left.values()].find((o) => codeOf(o) === code && once(oldItems, code)) : null;
    if (hit) { pairs.push([it, hit]); left.delete(hit.id); } else added.push(it);
  }
  return { pairs, added, gone: [...left.values()] };
}
