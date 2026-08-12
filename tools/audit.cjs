/**
 * 用真的取樣把 index.html 跑起來，量它實際發出什麼聲音。
 *
 * 這是 2026-08 才有的能力。在那之前音訊在 agent 環境裡永遠不會 ready，
 * 「引擎壞了」和「取樣載不到」長得一模一樣，只能推導。現在可以：
 *
 *   - 確認取樣真的載得到（幾個檔、有沒有失敗）
 *   - 確認 AudioContext 跑起來、Transport 在走
 *   - 量輸出的 RMS 時序（有沒有出聲、音量起伏對不對）
 *   - 從頻譜峰值反推音高，驗證實際響的音就是預期的和弦組成音
 *
 * 仍然做不到：容器沒有音效裝置，「好不好聽、音色平衡」還是得人耳判斷。
 * 這裡量到的是訊號，不是聽感。
 *
 * 先開 `node tools/mirror.cjs`，再跑：
 *   node tools/audit.cjs [url] [抓幾次頻譜]
 */
const { chromium } = require("playwright");

const URL_ = process.argv[2] || "http://127.0.0.1:3100/";
const SHOTS = +process.argv[3] || 4;
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteOf = (hz) => {
  const m = Math.round(69 + 12 * Math.log2(hz / 440));
  return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
};

(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    // 沒有真實使用者手勢時也讓音訊跑起來；headless 用 null sink，圖仍會處理
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [], samples = [];
  // index.html 沒宣告 favicon，瀏覽器還是會自己要一個，真站上也一樣 404。
  // 這行雜訊會蓋掉真正的錯誤，所以濾掉
  const noise = (s) => /favicon/i.test(s);
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
  page.on("console", (m) => {
    // 子資源載入失敗時，訊息本文不含網址，要從 location 取才濾得掉
    const where = (m.location() && m.location().url) || "";
    if (m.type() === "error" && !noise(m.text()) && !noise(where)) {
      errors.push("CONSOLE " + m.text().slice(0, 150) + (where ? "  ← " + where.slice(0, 70) : ""));
    }
  });
  page.on("requestfailed", (r) => {
    if (!noise(r.url())) errors.push("REQFAIL " + r.failure().errorText + " " + r.url().slice(0, 80));
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !noise(r.url())) errors.push("HTTP " + r.status() + " " + r.url().slice(0, 80));
  });
  page.on("response", (r) => { if (/\.(mp3|ogg|wav)$/.test(r.url())) samples.push(r.status()); });

  await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  console.log("  Tone.js ", await page.evaluate(() => window.Tone ? "v" + window.Tone.version : "沒載到"));
  console.log("  React   ", await page.evaluate(() => window.React ? "v" + window.React.version : "沒載到"));

  const cta = await page.$(".lp-cta");
  if (cta) await cta.click();

  // 取樣要下載加解碼，四層力度的吉他最久，給它時間；連續三輪沒新檔就當載完
  let last = -1, still = 0;
  for (let i = 0; i < 30 && still < 3; i++) {
    await page.waitForTimeout(2000);
    if (samples.length === last) still++; else { still = 0; last = samples.length; }
    process.stdout.write("\r  取樣載入: " + samples.length + " 個 ");
  }
  console.log("\n  取樣失敗:", samples.filter((s) => s >= 400).length, "個");

  await page.evaluate(() => {
    const ctx = window.Tone.getContext().rawContext;
    const an = ctx.createAnalyser();
    an.fftSize = 16384;          // ~2.7Hz 解析度，夠分辨低音區的半音
    an.smoothingTimeConstant = 0; // 不要平滑，要看瞬時頻譜
    window.Tone.getDestination().connect(an);
    window.__an = an; window.__sr = ctx.sampleRate;
  });

  const play = await page.evaluateHandle(() =>
    [...document.querySelectorAll("button")].find((n) => /播放|▶|play/i.test(n.textContent)) || null);
  if (await play.evaluate((n) => !!n)) { await play.asElement().click(); console.log("  → 已按播放"); }

  console.log("  AudioContext:", await page.evaluate(() => window.Tone.getContext().state),
    " Transport:", await page.evaluate(() => window.Tone.getTransport().state));

  for (let shot = 0; shot < SHOTS; shot++) {
    await page.waitForTimeout(2700);
    const { spec, sr, rms } = await page.evaluate(() => {
      const an = window.__an;
      const f = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(f);
      const t = new Float32Array(an.fftSize); an.getFloatTimeDomainData(t);
      let s = 0; for (let i = 0; i < t.length; i++) s += t[i] * t[i];
      return { spec: Array.from(f), sr: window.__sr, rms: Math.sqrt(s / t.length) };
    });
    const bw = sr / (spec.length * 2), peaks = [];
    for (let i = 2; i < spec.length - 2; i++) {
      const hz = i * bw;
      if (hz < 70 || hz > 1600) continue;   // 低於 70Hz 多是鼓，高於 1600Hz 多是泛音
      if (spec[i] > spec[i - 1] && spec[i] > spec[i + 1] &&
          spec[i] > spec[i - 2] && spec[i] > spec[i + 2] && spec[i] > -52) peaks.push({ hz, db: spec[i] });
    }
    peaks.sort((a, b) => b.db - a.db);
    const top = peaks.slice(0, 8).sort((a, b) => a.hz - b.hz);
    const pcs = [...new Set(top.map((x) => noteOf(x.hz).replace(/-?\d+$/, "")))];
    console.log(`  第${shot + 1}次 RMS=${rms.toFixed(4)}  ` +
      (top.length ? top.map((x) => noteOf(x.hz)).join(" ") + "   音級集合: " + pcs.join(" ") : "(靜音)"));
  }

  await page.screenshot({ path: "tools/.cache/audit.png" });
  console.log("  截圖: tools/.cache/audit.png");
  console.log("  錯誤:", errors.length ? "\n    " + errors.slice(0, 6).join("\n    ") : "無");
  await browser.close();
})();
