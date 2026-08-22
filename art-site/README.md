# CHI-SENG LAM 作品集網站

林志城個人作品集，從 Wix Studio 上的
`tony20020123.wixstudio.com/my-site` 1:1 重刻為靜態網站。

**與這個 repo 根目錄的吉他 app 完全無關**，兩者不共用任何檔案、樣式或慣例。

## 檔案

```
index.html          Home
biography.html      Biography
works.html          Works（兩件作品導覽）
work-sediment.html  《沉澱的記憶》
work-weight.html    《聲音的重量》
contact.html        Contact
assets/css/base.css     基礎樣式、字體對應、整站骨架
assets/css/type.css     字級與行高（依原站實測值產生）
assets/css/layout.css   版面幾何（依原站計算值產生）
assets/img/             作品與人像照，原圖等比縮到長邊 1600px
assets/doc/             簡歷 PDF
```

沒有建置步驟，改完就是成品。

## 版面怎麼來的

不是照著截圖目測排的。來源是 Wix 自己的頁面模型 JSON
（`pages.parastorage.com/sites/<id>.json.z`，內含 `structure` 與 `data`）
以及原站算繪出來的 CSS，數值直接轉換而來：

- **`layout.css`**：寬度、外距、對齊、格線全部取自原站的計算結果。
- **`type.css`**：字級與行高取自原站在 1280 / 768 / 390 三種寬度下的實際算繪值。

### 縮放單位

Wix 用一種等比縮放單位 `spx`：

```
1spx = 視窗內容寬 / 基準寬
```

基準寬每個斷點不同——桌機 1265、平板 753、手機 375，都是設計畫布寬減去
15px 捲軸。本站用 `--vw: 100cqw`（`container-type: inline-size` 掛在
`body`）取得同樣的「不含捲軸的內容寬」，所以縮放行為與原站一致。

斷點與原站相同：`> 1000px` / `<= 1000px` / `<= 750px`。

## 驗證方式

把原站存下來的 HTML 與本站放在**同一個瀏覽器、同樣的字體環境**下算繪，
逐一比對每個元件的 x / y / 寬 / 高：

> 三個斷點共 201 項，全部落在 2px 以內。

y 座標會固定差 30px，那是原站頂端 Wix 廣告列的高度，本站沒有。

## 與原站刻意不同的地方

1. **《聲音的重量》的作品標題**——原站誤植為「《沉澱的記憶》」（複製後漏改），
   本站填正確名稱。要還原改 `work-weight.html` 一行字即可。
2. **Biography 頁沒有頁尾**——這是照原站的（該頁版面只有頁首＋內容兩列，
   其餘五頁才有頁尾）。要統一的話把別頁的 `<footer>` 複製過來。
3. **圖片**已等比縮到長邊 1600px 並重新壓縮（6.3MB → 1.0MB）。原圖仍在
   Wix 上，需要更大尺寸可再取。

## 原站就有、重刻時原樣保留的問題

這些不是重刻造成的，已確認原站也一樣，沒有擅自修改：

- Works 頁左側標題「《沉澱的記憶》」會換行，因為文字框比字寬窄。
- 《沉澱的記憶》內頁的標題換行後會壓到下一行的媒材文字。
- Works 頁在手機上仍維持兩欄，文字縮到約 6.5px，實際上讀不到。
- 選單寫 `Works`，但頁面標題是 `Work`；Contact 頁在 Wix 後台拼成 `Cantact`。

## 字體

原站用 Wix 的 `aether` 與 `alfabet`，本站以 `@font-face` 連向 Wix 的 CDN
（`static.parastorage.com`），沒有把字型檔複製進 repo——授權上比較乾淨，
但代價是依賴外部主機。要完全自主的話得換成自有授權的字體。

佈景字體 Madefor 系列是 Wix 專有字體，本站以中性的無襯線堆疊（`--ui`）代替。
中文一律由系統字體（`--cjk`）承接，原站也是如此。
