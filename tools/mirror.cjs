/**
 * 本機鏡像伺服器——讓瀏覽器測試能用到「真的」線上資源。
 *
 * 為什麼需要：agent 環境裡 Chromium 對外完全不通（連網路政策允許的網域
 * 也連不到，代理回 200 Connection Established 之後隧道就斷），但 node 透過
 * 代理是通的。所以由 node 去 CDN 抓，瀏覽器從 localhost 拿。
 *
 * 拿到的是真的 Tone.js、真的 React、真的取樣檔，不是本機隨便一份副本——
 * 版本差異造成的問題才驗得出來，音訊引擎也才會真的 ready。
 *
 * 服務的是「工作目錄裡的 index.html」，所以改到一半的東西可以直接配真取樣測。
 * 抓過的檔案存在 tools/.cache/，第二次之後就不用再下載。
 *
 *   node tools/mirror.cjs [port]      預設 3100
 */
const http = require("http"), fs = require("fs"), path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, ".."), CACHE = path.join(__dirname, ".cache");
const PORT = +process.argv[2] || 3100;
// 前綴 → 真正的來源。index.html 裡的網址會被改寫成這些前綴
const UP = {
  __cdnjs: "https://cdnjs.cloudflare.com",
  __jsdelivr: "https://cdn.jsdelivr.net",
  __raw: "https://raw.githubusercontent.com",
  __fonts: "https://fonts.googleapis.com",
  __fontfiles: "https://fonts.gstatic.com",
};
const MIME = { ".js": "application/javascript", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".wav": "audio/wav", ".json": "application/json", ".css": "text/css",
  ".html": "text/html; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };

fs.mkdirSync(CACHE, { recursive: true });
const stat = { hit: 0, miss: 0, fail: [] };

/** index.html 的外部網址改寫成本機前綴，其餘原封不動 */
function rewrite(html) {
  return html
    .replace(/https:\/\/cdnjs\.cloudflare\.com/g, "/__cdnjs")
    .replace(/https:\/\/cdn\.jsdelivr\.net/g, "/__jsdelivr")
    .replace(/https:\/\/raw\.githubusercontent\.com/g, "/__raw")
    .replace(/https:\/\/fonts\.googleapis\.com/g, "/__fonts")
    .replace(/https:\/\/fonts\.gstatic\.com/g, "/__fontfiles");
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const qs = req.url.includes("?") ? "?" + req.url.split("?").slice(1).join("?") : "";
  const seg = url.split("/").filter(Boolean);

  if (UP[seg[0]]) {
    const rest = seg.slice(1).join("/");
    // 查詢字串也要進快取鍵——Google Fonts 靠它區分不同字重
    const key = path.join(CACHE, (seg[0] + "__" + rest + qs).replace(/[^\w.@-]/g, "_").slice(0, 180));
    const ext = path.extname(rest).toLowerCase();
    if (!fs.existsSync(key)) {
      stat.miss++;
      try {
        execFileSync("curl", ["-sS", "--fail", "-L", "--max-time", "45",
          "-o", key, UP[seg[0]] + "/" + rest + qs], { stdio: "pipe" });
      } catch (e) {
        stat.fail.push(seg[0] + "/" + rest);
        res.writeHead(404).end("mirror miss");
        return;
      }
    } else stat.hit++;
    let body = fs.readFileSync(key);
    // 字型 CSS 裡還會指到 fonts.gstatic.com，一併改寫
    if (seg[0] === "__fonts") body = Buffer.from(rewrite(body.toString()));
    res.writeHead(200, { "Content-Type": MIME[ext] || (seg[0] === "__fonts" ? "text/css" : "application/octet-stream"),
      "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
    res.end(body);
    return;
  }

  if (url === "/__stat") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ...stat, failCount: stat.fail.length }));
    return;
  }

  const file = path.join(ROOT, url === "/" ? "index.html" : url.replace(/^\//, ""));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end("not found");
    return;
  }
  if (file.endsWith(".html")) {
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    res.end(rewrite(fs.readFileSync(file, "utf8")));
  } else {
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "text/plain" });
    fs.createReadStream(file).pipe(res);
  }
}).listen(PORT, "127.0.0.1", () => console.log("鏡像伺服器 http://127.0.0.1:" + PORT));
