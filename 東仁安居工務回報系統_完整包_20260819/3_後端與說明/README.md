# 東仁安居工務施工回報系統

原生 HTML/JavaScript 前端 + Google Apps Script／Google 試算表後端。
同事登入後填報，資料即時寫進你的 Google 試算表；後台可集中檢視、匯入數量明細、依範本匯出 Excel。

## 架構

```
瀏覽器 (index.html + app.js)
   │  POST JSON（帳號密碼登入、送出回報）
   ▼
Google Apps Script 網頁應用程式 (gas/Code.gs)
   │  驗證權杖與權限後讀寫
   ▼
Google 試算表  ←── 你直接開來看，或下載成 .xlsx
   users / reports / sessions / source / log
```

- 全部免費，不需要信用卡，沒有閒置暫停
- 資料本體就是試算表，隨時可下載成 Excel

## 功能

- 帳號密碼登入，分「後台管理」與「僅前端填報」兩種權限
- 填表人姓名由後端依登入帳號寫入，同事無法冒名
- 房號平面圖點選、依樓層／工項／房號／空間填列出工人數與材料實際用量
- Excel 數量明細匯入
- 依範本匯出實際用量回饋表
- 同日、同工項及同區域可重複填報
- `log` 分頁記錄登入、新增、刪除、權限異動

## 開始使用

完整步驟見 **[`gas/部署說明.md`](gas/部署說明.md)**。摘要：

1. 建 Google 試算表 → 擴充功能 → Apps Script → 貼上 `gas/Code.gs`
2. 改 `setup()` 裡的管理員帳密 → 執行一次 `setup`
3. 部署為網頁應用程式（執行身分「我」、存取權「**任何人**」）
4. 把 `/exec` 網址填進 `config.js`
5. 開 `index.html` 登入，或上傳到 GitHub Pages 給同事用

## 需要上傳到 GitHub Pages 的檔案

```
index.html
app.js
config.js
.nojekyll
assets/floor-plan-04.png
assets/xlsx.full.min.js
assets/report-template.xlsx
```

`gas/`、`data/`、`server.py`、`test_*`、`*.cmd` 都不需要上傳。

### 資料夾被攤平也沒關係

用 GitHub 網頁拖曳上傳時，`assets/` 常會被攤平成根目錄的散檔。程式**兩種結構都吃得下**：
先找 `assets/檔名`，找不到自動改找根目錄的同名檔。

三個檔案缺一不可：

| 檔案 | 缺了會怎樣 |
|---|---|
| `floor-plan-04.png` | 平面圖一片空白（畫面會直接顯示錯誤原因） |
| `xlsx.full.min.js` | 匯入數量明細與匯出 Excel 都會失敗 |
| `report-template.xlsx` | 匯出 Excel 時找不到範本 |

> `floor-plan-numbered.png` 與 `floor-plan.gif` 是舊版素材，程式沒有用到，可以不上傳。

### repo 設成 Public 的注意事項

Pages 免費版可搭配 Private repo，但如果你的 repo 是 Public，
`config.js` 裡的 Apps Script 網址等於公開。安全性仍然靠帳號密碼把關，
但這代表**密碼強度更重要**，也不要把任何機密寫進前端檔案。

## 帳號與權限

| 權限 | 可做的事 |
|---|---|
| `admin` 後台管理 | 前端填報 + 後台檢視全部回報、刪除回報、匯入數量明細、匯出 Excel、管理帳號 |
| `front` 僅前端填報 | 只能填報，只看得到自己送出的紀錄 |

密碼以 1000 次迭代 HMAC-SHA256 + 個人 salt 雜湊後儲存，試算表內無明碼、無法反查。
忘記密碼由管理員在「後台管理中心 → 帳號管理 → 重設密碼」給一組新的。

## 資料安全

- 網址是公開的，安全性完全靠帳號密碼，請勿使用弱密碼
- 那份 Google 試算表**不要**設成「知道連結的人都可以編輯」，否則等於繞過全部權限
- 停用帳號會立即清除該帳號所有登入狀態
- 備份：試算表 → 檔案 → 建立副本 / 下載 .xlsx

## 舊版檔案（已不再使用）

以下是先前區域網路版的遺留檔案，前端已改接 Apps Script，**不再與它們相容**，保留僅供參考：

- `server.py`、`test_server.py`
- `啟動工務回報系統.cmd`、`允許手機連線.cmd`
- `data/`（舊的 SQLite 位置）
- `app.js.bak`、`index.html.bak`（改版前的備份）

確認新版運作正常後可自行刪除。

## 測試

```powershell
node gas/test_code.mjs      # 後端：登入、權限、防偽造、分段儲存、停用、稽核
node test_access.mjs        # 前端：未登入 / front / admin 三種身分的後台可見性
node test_app_logic.mjs     # 統計、空間對應、匯出欄位
```
