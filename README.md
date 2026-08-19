# 東仁安居工務施工回報系統

以 Python 標準函式庫、SQLite 與原生 HTML/JavaScript 建置的區域網路施工回報系統。前台可依樓層、工項、房號與空間填列出工人數及材料實際用量；後台可集中檢視紀錄、管理權限、匯入數量明細並匯出 Excel。

## 功能

- 多裝置共用 SQLite 集中資料
- 前台填報與後台管理權限
- 房號平面圖點選
- Excel 數量明細匯入
- 依範本匯出實際用量回饋表
- 同日、同工項及同區域可重複填報

## 本機啟動

Windows 可雙擊 `啟動工務回報系統.cmd`，或執行：

```powershell
python server.py --host 0.0.0.0 --port 8765
```

本機網址：`http://127.0.0.1:8765/`

同一個 Wi-Fi 的裝置使用：`http://電腦IPv4位址:8765/`

第一次供手機連線時，可執行 `允許手機連線.cmd`，允許同一區域網路存取 8765 連接埠。

更完整的操作方式請見 [`README_使用說明.md`](README_使用說明.md)。

## 資料安全

- `data/app.db` 內含使用者權限及施工回報，已由 `.gitignore` 排除，請勿加入版本控制。
- `node_modules`、快取、檢查圖片及測試匯出檔不需要上傳。
- 目前主管識別字存在前後端原始碼中。若 GitHub 倉庫設為公開，請先更換並改用伺服器環境變數或正式登入驗證。
- 此版本適用於受信任的區域網路，不應直接把 8765 連接埠公開到網際網路。

## GitHub 上傳檔案

必要檔案如下：

- `index.html`
- `app.js`
- `server.py`
- `assets/`
- `data/.gitkeep`
- `README.md`
- `README_使用說明.md`
- `.gitignore`
- Windows 啟動與防火牆設定批次檔

## 測試

```powershell
python -m unittest test_server.py
node test_app_logic.mjs
```
