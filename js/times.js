// 计时记录存在任务自己的 Times 一格里（不再单独一张 Time 表），一段一节，用「; 」隔开：
//   "09:10-09:40 30m; 14:00-14:45 45m; 20m"   ← 最后一段是手动补的、没填几点
// 只做文字和数组互转，不碰存储。表格里手改成「9:10-9:40」不写分钟也认（按钟点算）。

const pad2 = (n) => String(n).padStart(2, "0");
const toMin = (hm) => { const [h, m] = String(hm).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const clock = (hm) => { const [h, m] = String(hm).split(":").map(Number); return pad2(h || 0) + ":" + pad2(m || 0); };

// "…" → [{from, to, min}]
export function parseTimes(text) {
  const out = [];
  for (const part of String(text || "").split(/\s*[;；\n]\s*/)) {
    const m = /^(?:(\d{1,2}:\d{2})\s*[-–~]\s*(\d{1,2}:\d{2}))?\s*(?:(\d+)\s*(?:m|min|mins)?)?$/i.exec(part.trim());
    if (!m || (!m[1] && !m[3])) continue;
    const from = m[1] ? clock(m[1]) : "", to = m[2] ? clock(m[2]) : "";
    const min = m[3] ? Number(m[3]) : (((toMin(to) - toMin(from)) % 1440) + 1440) % 1440;
    if (min > 0) out.push({ from, to, min });
  }
  return out;
}

// [{from, to, min}] → "…"
export function formatTimes(list) {
  return (list || []).filter((x) => Number(x.min) > 0)
    .map((x) => (x.from && x.to ? x.from + "-" + x.to + " " : "") + Math.round(Number(x.min)) + "m").join("; ");
}

export const sumTimes = (list) => (list || []).reduce((a, x) => a + (Number(x.min) || 0), 0);
