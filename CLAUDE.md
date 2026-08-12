# CLAUDE.md

## 合作方式

**不要猜。** 講結論時要分清楚來源，三種要說清楚是哪一種：

- 我查到的（讀了程式碼、跑了測試、call 了 API）
- 我算出來的（用真實程式碼模擬推導）
- 我推測的 ← 必須標明，而且要說打算怎麼證實

聽起來合理但沒驗證過的解釋，比說「我不知道」更糟——它會讓問題被當成解決了。

**卡住就當下說。** 遇到查不了、看不到、做不到的事，第一時間講，不要用一個說得通的原因代替。曾經發生過：明明連不到 `github.io`，卻給了「建置還沒跑完」當原因，害對方多花三輪才發現問題根本沒被查過。

**不確定對方要什麼就先問一句。** 曾經發生過：對方講「模塊」（音階盒），卻花了好幾輪分析和弦按法。一句確認就能省下來。

**動手前先講要動什麼，尤其是刪東西。** 曾經發生過：自作主張刪掉 A 型的 min9/dom9/maj9 模板，因為假設「按不出來就該拿掉」。那不是對方要的。

**發現問題直接說**，在它變複雜之前。

## 專案

單一檔案 `index.html`（約 250KB，React + Tone.js 從 CDN 載入，樂器取樣從 jsDelivr 載入）。沒有 build 步驟，改完就是成品。`server.js` 只是本機靜態伺服器。

## 交付流程

1. 從最新的 `main` 開分支
2. 改完 → commit → push
3. 開 PR（寫清楚原因、做法、驗證數據）
4. **自己合併**，不要讓對方手動合
5. **等 GitHub Pages 部署跑完再給連結**，不要合併完馬上給——查法：

   ```
   curl -s "https://api.github.com/repos/11111111-collab/Tony-Lam/actions/runs?per_page=1"
   ```
   等到 `status: completed` 且 `conclusion: success`，且 `head_sha` 是這次的 commit。

6. 部署完之後**核對線上那份就是這次的 commit**，不要只看 API 說成功：

   ```
   curl -s https://11111111-collab.github.io/Tony-Lam/ -o /tmp/live.html
   git show origin/main:index.html | diff -q - /tmp/live.html
   ```
   位元組一致才算數。「部署成功」跟「線上是我寫的那份」是兩件事。

7. 連結：https://11111111-collab.github.io/Tony-Lam/

## 驗證環境（2026-08 起）

環境的 Network access 已改成 `Custom`，放行 `github.io`、`cdn.jsdelivr.net`、
`cdnjs.cloudflare.com`。所以 **curl / node 抓得到線上網站與所有 CDN 資源**。

**但 Chromium 對外完全不通**——連網路政策允許的網域也一樣，代理回
`200 Connection Established` 之後隧道就斷。試過 `--proxy-server`、Playwright
的 `proxy` 選項、關 QUIC、忽略憑證，四種都失敗。所以**不能直接用瀏覽器開真站**。

繞法是 `tools/mirror.cjs`：node 去真的 CDN 抓，瀏覽器從 localhost 拿。

```
npm install --no-save playwright   # 環境沒預裝 playwright 套件，瀏覽器本身有
node tools/mirror.cjs              # 起在 3100，服務工作目錄的 index.html
node tools/audit.cjs               # 用真取樣跑起來並量測
```

Chromium 走 `executablePath: '/opt/pw-browsers/chromium'`，不要 `playwright install`。

鏡像服務的是**工作目錄那份 index.html**，所以改到一半的東西可以直接配真資源測。
抓過的檔存在 `tools/.cache/`（已 gitignore）。

**現在驗得到**（以前只能推導）：

- 真的 Tone.js v15.5.27、真的 React v18.3.1，版本跟線上一致
- 取樣真的載得到——實測 195 個檔、0 失敗
- `AudioContext: running`、`Transport: started`，引擎真的在跑
- 輸出的 RMS 時序（有沒有出聲、音量起伏）
- **從頻譜峰值反推音高**，驗證實際響的音就是預期的和弦組成音。
  實測抓到 `F2 A2 C3 F3 C4 F4 C5`（F 大三）、`C3 E3 G3 C4 E4 G4`（C 大三）

所以「音訊引擎壞了」和「取樣載不到」**現在分得出來**。以前這兩件事在
agent 環境裡長得一模一樣，是個很容易誤判的盲點。

**還是做不到**：容器沒有音效裝置，量到的是訊號不是聽感。「好不好聽、音色
平衡對不對」永遠要人耳判斷，不要假裝驗過。

查網域通不通：`curl -sS -o /dev/null -w "%{http_code}" https://<host>/`，
回 `000` 且 `CONNECT tunnel failed, response 403` 就是被政策擋掉。

## 這個專案的樂理約定

已經討論定案的，不要重新推翻：

**模塊（音階盒）和和弦是兩個層面。** 按和弦時某顆音壓在哪條弦被手型和組成音綁死；模塊是一顆一顆彈旋律用的，同一個音級在哪條弦取，純粹看手指順不順。**框只跟著音階走，不把和弦按的音包進來**——和弦的音落在框外是正常的。

**CAGED 一條弦 2–3 音**是這套系統的定義。上限在 `scaleBoxFrets`，但只在下一條弦接得到那顆音時才收手——**斷格比多一顆音嚴重得多**，接不到就寧可讓那條弦到四音。

**級數的主音不一定是和弦根音。** `SCALES` 的 `tonic` 欄位（關係小調 +9、關係大調 +3）把級數換到關係調的框架，`NeckView` 收 `degTonic`。關係大小調的音階跟原音階**音集完全相同**，差別只在標法——兩個選項亮起來一樣是預期的，選單用「（主音 A）」區分。

**新增音階時注意 `defaultScale` 的順序。** 它按物件順序找第一個「音集等於調性」的七聲音階。`relMinAeolian` / `relMajIonian` 的 `iv` 跟 `ionian` / `aeolian` 完全相同，排在前面會把預設音階搶走，必須放在對應原音階的後面。

**指型的根音位置規則**：C 型與 G 型的根音是最高的品；A 型與 E 型的根音是最低的品。這是分辨根音弦相同的兩組（C/A 與 G/E）的唯一依據。

**強力和弦只有 A、E、D 型**，沒有 C 和 G——它的形狀是根音往高音弦走，根音必然最低，C/G 型放不出來。音階開放標準是「含 R 和純五度」。
