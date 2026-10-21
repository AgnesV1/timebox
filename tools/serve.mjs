// 本地预览用的静态服务器（不缓存）：node tools/serve.mjs .  → http://127.0.0.1:8000（第三个参数换端口：node tools/serve.mjs . 8010）
// 要在手机上试（同一个 Wi-Fi）：HOST=0.0.0.0 node tools/serve.mjs . ，手机开 http://电脑的IP:8000（局域网的 http 不算安全来源，service worker 不生效，不影响看样子）
// 和 serve.py 一样；Claude 的预览面板里 python 读不了「文稿」文件夹，所以有这个 node 版。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(process.argv[2] || ".");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(buf);
  });
}).listen(Number(process.argv[3]) || 8000, process.env.HOST || "127.0.0.1");
