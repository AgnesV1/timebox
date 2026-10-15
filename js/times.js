// 计时记录存在任务自己的 Times 一格里（不再单独一张 Time 表），一段一节，用「; 」隔开：
//   "09:10-09:40 30m; 14:00-14:45 45m; 20m"   ← 最后一段是手动补的、没填几点
//   "18:00-18:40 40m 🍳"                        ← 段尾可以跟一个 emoji 当记号（Chore 键记的那几种），没有就没有
// 只做文字和数组互转，不碰存储。表格里手改成「9:10-9:40」不写分钟也认（按钟点算）。

const pad2 = (n) => String(n).padStart(2, "0");
const toMin = (hm) => { const [h, m] = String(hm).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const clock = (hm) => { const [h, m] = String(hm).split(":").map(Number); return pad2(h || 0) + ":" + pad2(m || 0); };

// "…" → [{from, to, min, tag?}]（有记号的那段才有 tag）
export function parseTimes(text) {
  const out = [];
  for (const part of String(text || "").split(/\s*[;；\n]\s*/)) {
    const m = /^(?:(\d{1,2}:\d{2})\s*[-–~]\s*(\d{1,2}:\d{2}))?\s*(?:(\d+)\s*(?:m|min|mins)?)?\s*(\p{Extended_Pictographic}\uFE0F?)?$/iu.exec(part.trim());
    if (!m || (!m[1] && !m[3])) continue;
    const from = m[1] ? clock(m[1]) : "", to = m[2] ? clock(m[2]) : "";
    const min = m[3] ? Number(m[3]) : (((toMin(to) - toMin(from)) % 1440) + 1440) % 1440;
    if (min > 0) out.push(m[4] ? { from, to, min, tag: m[4] } : { from, to, min });
  }
  return out;
}

// [{from, to, min, tag?}] → "…"
export function formatTimes(list) {
  return (list || []).filter((x) => Number(x.min) > 0)
    .map((x) => (x.from && x.to ? x.from + "-" + x.to + " " : "") + Math.round(Number(x.min)) + "m" + (x.tag ? " " + x.tag : "")).join("; ");
}

export const sumTimes = (list) => (list || []).reduce((a, x) => a + (Number(x.min) || 0), 0);

// 按记号并起来（Chore 那一条一行放得下）：[{ tag, min, n }]，多的在前，没记号的放最后
export function groupTags(list) {
  const by = new Map();
  for (const x of list || []) {
    const k = x.tag || "", g = by.get(k) || { tag: k, min: 0, n: 0 };
    g.min += Number(x.min) || 0; g.n += 1;
    by.set(k, g);
  }
  return [...by.values()].sort((a, b) => (!a.tag) - (!b.tag) || b.min - a.min);
}

// 加任务框里一句话补记：「Reading 14:00-15:10」「Read 2:30-3」→ { title, from, to }；不是这种写法就是 null。
// 至少一头要带冒号，「Chapter 3-4」这种不算；钟点不合理的也不算。
export function parseLogLine(text) {
  const m = /^(.*\S)\s+(\d{1,2})(?::(\d{2}))?\s*[-–~]\s*(\d{1,2})(?::(\d{2}))?$/.exec(String(text || "").trim());
  if (!m || (m[3] === undefined && m[5] === undefined)) return null;
  const [h1, m1, h2, m2] = [m[2], m[3] || 0, m[4], m[5] || 0].map(Number);
  if (h1 > 23 || h2 > 24 || m1 > 59 || m2 > 59 || (h2 === 24 && m2 > 0)) return null;
  if (h1 === h2 % 24 && m1 === m2) return null;
  return { title: m[1], from: pad2(h1) + ":" + pad2(m1), to: pad2(h2 % 24) + ":" + pad2(m2) };
}
