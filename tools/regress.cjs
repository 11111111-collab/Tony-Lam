/**
 * 行為指紋——重構用的回歸基準。
 *
 * 重構的定義是「行為完全不變」，所以要有東西能證明「不變」，不然只是憑感覺。
 * 這支把 app 跑起來，把可觀測的行為壓成一份 JSON，改之前存一份基準，
 * 改完再跑一次比對。有任何一個欄位對不上就是動到行為了。
 *
 *   node tools/mirror.cjs &
 *   node tools/regress.cjs baseline.json          # 產生基準
 *   node tools/regress.cjs after.json baseline.json  # 產生並比對
 *
 * 涵蓋：載入、指板把位、音階盒十個圖形、和弦性質分組、dim7 標法、
 * 轉位標示、範本清單、接續建議、以及（可選）真取樣的音訊指紋。
 */
const { chromium } = require("playwright");
const fs = require("fs");

const OUT = process.argv[2] || "tools/.cache/fingerprint.json";
const BASE = process.argv[3] || null;
const URL_ = process.env.REGRESS_URL || "http://127.0.0.1:3100/";
const WITH_AUDIO = process.env.REGRESS_AUDIO === "1";


(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [], samplesLoaded = [];
  page.on("response", (r) => { if (/\.(mp3|ogg|wav)$/.test(r.url())) samplesLoaded.push(r.status()); });
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
  page.on("console", (m) => {
    const where = (m.location() && m.location().url) || "";
    if (m.type() === "error" && !/favicon/.test(where)) errors.push(m.text().slice(0, 120));
  });

  const fp = {};
  await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  fp.libs = await page.evaluate(() => ({
    tone: window.Tone ? window.Tone.version : null,
    react: window.React ? window.React.version : null,
  }));

  const cta = await page.$(".lp-cta");
  if (cta) await cta.click();
  await page.waitForTimeout(WITH_AUDIO ? 22000 : 3000);

  /**
   * 可以指定要在哪個主題下量——兩套外觀的行為必須一致。
   * 主題按鈕在 App 的頂欄，首頁上還不存在，所以一定要等進了 App 才切，
   * 不然這段是無聲的 no-op，測起來會像過了其實根本沒切過去。
   */
  if (process.env.REGRESS_THEME) {
    const ok = await page.evaluate((t) => {
      const b = [...document.querySelectorAll(".theme-seg button")].find((x) => x.textContent.trim() === t);
      if (!b) return false; b.click(); return true;
    }, process.env.REGRESS_THEME);
    if (!ok) throw new Error("找不到主題按鈕：" + process.env.REGRESS_THEME);
    await page.waitForTimeout(600);
    // 只印出來不放進指紋——放進去的話每個主題輪次都會多一筆差異，那是噪訊
    console.log("  （本輪主題：" + (await page.$eval(".cl-root", (e) => e.className)) + "）");
  }

  // 範本清單（名稱＋速度），順序也要一樣
  fp.templates = await page.$$eval(".tmpl-row", (ns) =>
    ns.map((n) => n.textContent.trim().replace(/\s+/g, " ").slice(0, 70)));

  const first = await page.$(".card");
  if (first) { await first.click(); await page.waitForTimeout(600); }

  // 和弦性質分組
  fp.qualGroups = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll(".qual-grp").forEach((g) => {
      out[g.textContent.trim()] = [...g.nextElementSibling.querySelectorAll("button")]
        .map((b) => b.textContent.trim());
    });
    return out;
  });

  // 每個性質：把位數、堆疊、轉位、各弦組的預覽
  const qualities = Object.values(fp.qualGroups).flat();
  fp.chords = {};
  for (const q of qualities) {
    const ok = await page.evaluate((l) => {
      const n = [...document.querySelectorAll("button.chip.q")].find((x) => x.textContent.trim() === l);
      if (!n) return false; n.click(); return true;
    }, q);
    if (!ok) { fp.chords[q] = "MISSING"; continue; }
    await page.waitForTimeout(240);
    fp.chords[q] = await page.evaluate(() => {
      const nm = document.querySelector(".voice-name");
      const st = document.querySelector(".voice-stack");
      const nav = document.querySelector(".voice-nav span");
      const wins = [...document.querySelectorAll(".win-row button")]
        .map((b) => b.textContent.trim().replace(/\s+/g, " "));
      const brk = [...document.querySelectorAll(".brk-btn")]
        .map((b) => b.textContent.trim().replace(/\s+/g, " "));
      return {
        name: nm ? nm.textContent.trim().replace(/\s+/g, " ") : null,
        stack: st ? st.textContent.trim() : null,
        nav: nav ? nav.textContent.trim().replace(/\s+/g, " ") : null,
        wins, brk,
      };
    });
  }

  // 指板：音階盒的十個圖形。
  // 前面的性質迴圈會停在最後一個（aug），它配全音音階只有六個音，
  // 本來就排不出一弦三音的圖形——先切回大三，量到的才是圖形本身。
  await page.evaluate(() => {
    const n = [...document.querySelectorAll("button.chip.q")].find((x) => x.textContent.trim() === "大三");
    if (n) n.click();
  });
  await page.waitForTimeout(400);
  for (const btn of await page.$$("button")) {
    const t = ((await btn.textContent()) || "").trim();
    if (t.includes("看整個指板") && (await btn.isEnabled())) { await btn.click(); break; }
  }
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const n = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "三音一弦");
    if (n) n.click();
  });
  await page.waitForTimeout(700);
  const readBox = () => page.evaluate(() => {
    const NUT = 58, fw = (962 - 58) / 22, out = [[], [], [], [], [], []];
    document.querySelectorAll(".nk-dot.lit circle:not(.nk-ring)").forEach((c) => {
      const cx = +c.getAttribute("cx"), cy = +c.getAttribute("cy");
      if (!cx || !cy) return;
      const i = Math.round((178 - cy) / 27), f = Math.round((cx - NUT) / fw + 0.5);
      if (i >= 0 && i < 6 && !out[i].includes(f)) out[i].push(f);
    });
    return out.map((a) => a.sort((x, y) => x - y).join(","));
  });
  fp.patternButtons = await page.$$eval(".seg.tiny.pat button", (ns) =>
    ns.map((n) => n.textContent.trim() + "|" + (n.getAttribute("title") || "")));
  fp.patterns = [];
  const nPat = (await page.$$(".seg.tiny.pat button")).length;
  for (let i = 1; i < nPat; i++) {
    await page.evaluate((i) => { [...document.querySelectorAll(".seg.tiny.pat button")][i].click(); }, i);
    await page.waitForTimeout(220);
    fp.patterns.push(await readBox());
  }

  // 指板上所有點的標籤分佈（抓標法有沒有變）
  fp.neckLabels = await page.evaluate(() => {
    const o = {};
    document.querySelectorAll(".nk-dot text").forEach((t) => {
      const l = t.textContent.trim(); if (l) o[l] = (o[l] || 0) + 1;
    });
    return o;
  });

  // 接續建議
  /**
   * 接續建議有兩段：調內的接法是算出來的，後面兩顆「加味」是 suggestNext
   * 用 Math.random 從 SPICE 挑的——本來就每次不同。
   *
   * 所以固定的部分逐字比對，隨機的部分只驗「數量對、而且都出自 SPICE」。
   * 硬要求隨機值一樣只會製造假警報。
   */
  const SPICE_TAGS = ["♭VII・借用大調外", "iv・小下屬", "♭VI・借用", "VI7・副屬", "III7・副屬", "II7・副屬"];
  const sugAll = await page.$$eval(".sug-chip", (ns) =>
    ns.map((n) => n.textContent.trim().replace(/\s+/g, " ")));
  const spicy = sugAll.filter((t) => SPICE_TAGS.some((x) => t.includes(x)));
  fp.suggestFixed = sugAll.filter((t) => !SPICE_TAGS.some((x) => t.includes(x)));
  fp.suggestSpiceCount = spicy.length;

  if (WITH_AUDIO) {
    /**
     * 音訊要量得「可重複」才能當回歸基準。
     *
     * 一開始抓四張瞬時頻譜當指紋，結果同一份程式跑兩次就對不上——取樣點
     * 跟播放的相位對不齊，抓到的峰值自然不同。會誤報的測試比沒有測試更糟，
     * 它會讓人習慣忽略紅燈。
     *
     * 改成兩種都量：
     *   確定性指標  取樣數、AudioContext、Transport、有沒有出聲 —— 進嚴格比對
     *   音級聯集    整個循環累積下來聽到的所有音級 —— 跑滿一圈才穩定
     */
    await page.evaluate(() => {
      const ctx = window.Tone.getContext().rawContext;
      const an = ctx.createAnalyser(); an.fftSize = 16384; an.smoothingTimeConstant = 0;
      window.Tone.getDestination().connect(an); window.__an = an; window.__sr = ctx.sampleRate;
    });
    await page.evaluate(() => {
      const n = [...document.querySelectorAll("button")].find((x) => /播放/.test(x.textContent));
      if (n) n.click();
    });
    await page.waitForTimeout(1200);
    const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    // 只出現一兩幀的音級是邊緣噪訊——某個泛音剛好越過門檻。實測會讓
    // G♯ 這種音時有時無，指紋就不穩了。要出現在夠多幀才算數。
    const hits = {};
    let peakRms = 0;
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(150);
      const d = await page.evaluate(() => {
        const an = window.__an;
        const t = new Float32Array(an.fftSize); an.getFloatTimeDomainData(t);
        let s = 0; for (let i = 0; i < t.length; i++) s += t[i] * t[i];
        const rms = Math.sqrt(s / t.length);
        const f = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(f);
        return { rms, spec: Array.from(f), sr: window.__sr };
      });
      peakRms = Math.max(peakRms, d.rms);
      const bw = d.sr / (d.spec.length * 2);
      for (let k = 2; k < d.spec.length - 2; k++) {
        const hz = k * bw; if (hz < 70 || hz > 1200) continue;
        if (d.spec[k] > d.spec[k - 1] && d.spec[k] > d.spec[k + 1] &&
            d.spec[k] > d.spec[k - 2] && d.spec[k] > d.spec[k + 2] && d.spec[k] > -46) {
          const m = Math.round(69 + 12 * Math.log2(hz / 440));
          const pc = NAMES[((m % 12) + 12) % 12];
          hits[pc] = (hits[pc] || 0) + 1;
        }
      }
    }
    fp.audio = {
      samples: samplesLoaded.length,
      sampleFails: samplesLoaded.filter((x) => x >= 400).length,
      ctx: await page.evaluate(() => window.Tone.getContext().state),
      transport: await page.evaluate(() => window.Tone.getTransport().state),
      hasSound: peakRms > 0.005,
      pitchClasses: Object.keys(hits).filter((k) => hits[k] >= 8).sort().join(" ")
    };
  }
  fp.errors = errors;
  await browser.close();

  fs.mkdirSync(require("path").dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(fp, null, 1));
  console.log("指紋已寫入", OUT, "（" + Object.keys(fp).length + " 個欄位）");

  if (BASE) {
    const base = JSON.parse(fs.readFileSync(BASE, "utf8"));
    const diffs = [];
    const walk = (a, b, path) => {
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
        [...new Set([...Object.keys(a), ...Object.keys(b)])].forEach((k) => walk(a[k], b[k], path + "." + k));
      } else diffs.push(`  ${path}\n     基準: ${JSON.stringify(a)}\n     現在: ${JSON.stringify(b)}`);
    };
    walk(base, fp, "");
    if (!diffs.length) console.log("✓ 與基準完全一致，行為沒有改變");
    else { console.log("✗ 有 " + diffs.length + " 處不同：\n" + diffs.slice(0, 20).join("\n")); process.exitCode = 1; }
  }
})();
