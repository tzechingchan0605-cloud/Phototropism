# VL3 Google 收集端設定 / Collector setup

程式：[Code.gs](Code.gs)。這是 VL3 專用收集端：模組 `VL_BIO_PHOTOTROPISM`、工作表 `VL3雲端紀錄`。前端使用 Apps Script 嵌入頁的 `google.script.run`，以核對來源、視窗及隨機通道的 `postMessage` 連線。不要把 VL1／VL2 的 `/exec` 網址填入 VL3，也不要覆蓋它們的 Apps Script。

## 中文步驟

1. 使用 `tzechingchan0605@gmail.com` 建立私人 Google 試算表及**獨立的 VL3 Apps Script 專案**。亦可從該試算表的「擴充功能 → Apps Script」建立綁定專案。將本目錄完整 `Code.gs` 貼入編輯器並儲存。
2. 在「專案設定 → 指令碼屬性（Script Properties）」加入：
   - `SPREADSHEET_ID`：私人試算表的 ID 或完整網址。
   - `SETUP_TEACHER_PASSWORD`：你自行設定、至少 12 字元的獨立教師密碼。不要使用 Google 帳戶密碼；不要把密碼放進程式碼、GitHub、前端或聊天。
3. 選取 `setupCollector`，按「執行」，以教師帳戶授權。此函式不用 `SpreadsheetApp.getUi()`；建立／保留 VL3 工作表，保存密碼雜湊並刪除暫存的 `SETUP_TEACHER_PASSWORD`。重跑不清空紀錄。綁定專案可省略 `SPREADSHEET_ID`，但建議明確設定。
4. 「部署 → 新增部署 → 網頁應用程式」：執行身分選「我」，誰可以存取選「所有人」。複製以 `/exec` 結尾的網址。若學校管理政策不容許「所有人」，需由管理員處理存取設定，否則手機或其他帳戶不能使用這個收集端。
5. 將網址填入儲存庫的 `cloud-config.js` 的 `endpoint`，保持 `transport: "bridge"`，再發布前端。也可只把 `/exec` 網址交給本聊天接入；**不需要提供密碼或試算表 ID**。目前已填入使用者提供的 VL3 部署網址；正式儲存仍須按下方步驟核對。
6. 更新 `Code.gs` 後，使用「部署 → 管理部署 → 編輯 → 新版本 → 部署」更新原部署，保留同一網址。只儲存編輯器不會更新已部署版本。
7. 教師在 VL3 輸入 `tzechingchan0605@gmail.com`，再輸入上述獨立密碼。密碼只保留於頁面記憶體；登出清除。學生自行填寫電郵，瀏覽器登入哪個 Google 帳戶不影響收集。這不是 Google 身分驗證；學生填寫的電郵並未經 Google 核實。

## English steps

1. As `tzechingchan0605@gmail.com`, create a private Google Sheet and a **separate VL3 Apps Script project**, or open Extensions → Apps Script from that Sheet. Paste the complete `Code.gs` and save. Leave VL1 and VL2 collectors unchanged.
2. In Project Settings → Script Properties, set `SPREADSHEET_ID` to the Sheet ID or URL and `SETUP_TEACHER_PASSWORD` to your own separate password of at least 12 characters. Do not put passwords in source code, GitHub, the frontend, or chat.
3. Run `setupCollector` as the teacher and authorize it. Setup preserves existing rows, stores a password hash and deletes the temporary password property. No spreadsheet UI API is used. A bound project can infer its Sheet, but an explicit ID is recommended.
4. Deploy → New deployment → Web app. Execute as **Me**, access **Anyone**. Copy the `/exec` URL. Organizational restrictions on anonymous web apps must be resolved before other accounts and phones can connect.
5. Put that URL into `cloud-config.js` → `endpoint`, keep `transport: "bridge"`, and publish the frontend. You may send only the `/exec` URL in this chat for integration; no password or Sheet ID is needed. The user-provided VL3 deployment URL is now configured. Verify live saving using the checks below.
6. After collector changes, edit the existing deployment and select **New version**. Saving the editor alone does not update a deployed web app. Keeping the deployment retains its URL.
7. Teachers use the fixed teacher email plus the separate password. The frontend holds the password only in memory and clears it on logout. Student emails are self-entered, not Google-verified; the browser's Google login does not determine record ownership.

## 備份、舊紀錄及限制 / Backups and migration

- 每次探究有不同 ID 及寫入權限；同一電郵可保留多次探究。重試更新原紀錄，不新增副本；較舊版本不能覆蓋新作答。原始假說、第一次觀察及遞交快照固定保存。
- 原有 `phototropismLab.current.v1`、`records.v1`、`outbox.v1` 不清除；同步額外使用 `phototropismLab.appsScriptSync.v1` 保存完整備份及權限。離線重整後會重試；保留原瀏覽器資料直到真正儲存確認。
- 同一網站來源的舊本機紀錄可自動補傳。其他來源需在原網站下載 JSON 後由教師匯入。既有雲端紀錄的寫入權限不能由另一部裝置的 JSON 備份取代；未具權限的更新會拒絕，原資料保留。
- 若以前使用 Python／SQLite 收集端，保留 `.data`，在原主機執行 `python3 server.py --export-records > /tmp/vl3-legacy-backup.json`，將備份由教師匯入，再核對雲端內容。不要把學生備份加入 Git。
- 圖片、答案、反思、事件及用時隨完整紀錄保存。圖片使用 data URL，JSON 分段存入 Sheet。單筆 JSON 上限約 960,000 個 UTF-16 字元；超大圖片會拒絕上傳並保留本機備份，可縮小相片重試。Google 配額或暫停服務也可能延遲同步。
- 教師列表逐頁讀完雲端資料；Excel 匯出前重新讀取。任何分頁失敗都停止匯出，不把本機子集當作全班。下載的 Excel 是快照；新增紀錄後須重新下載，原 Excel 的人工分數不會自動回寫到雲端。
- Each attempt keeps its own ID and write token. Retries are idempotent; stale writes cannot replace newer answers. Original design, first observations and submitted snapshots are preserved. Existing local keys and SQLite files are retained. Migration across website origins requires JSON export/import; an imported copy cannot replace the write token of an existing cloud record. Full records include images, answers, reflections, events and timing. Oversized records and service errors retain local backups for retry. Teacher export reads every cloud page again and stops on any failure. Downloaded Excel files are snapshots; manual scores remain in those files.

## 正式部署驗證 / Live deployment verification

`npm test` 使用真實前端與收集程式，模擬 Google 服務及嵌入 RPC，以獨立瀏覽器和手機尺寸驗證。這**不是完整正式 Google 部署或實體手機驗證**。最新 `/exec` 的匿名健康檢查已回覆 VL3、版本 3，嵌入頁可匿名讀取並包含 `vl3-ready` 及 `google.script.run`；開發環境 Chromium 的憑證信任錯誤仍阻止實際嵌入 RPC，尚未取得正式儲存確認。匿名讀取成功不等於儲存成功。請在正式網站另行確認：

1. 用兩個獨立瀏覽器（其中一個手機）作答，待兩者均收到「已確認儲存」。同一學生電郵再開新探究，確認保留兩筆。
2. 離線作答後重整、恢復連線並重試，確認不重複新增；核對圖片、原始及最後答案、反思、事件與用時。
3. 教師以密碼取得全部雲端紀錄並下載 Excel，逐筆核對學生及多次探究。教師示範不能新增學生紀錄。故意暫停收集端時，全班 Excel 匯出應停止。
4. 核對舊紀錄仍按原實驗版本顯示、評分。保留工作表及 JSON 備份。

After deployment, repeat these checks with actual Google services and a physical phone. A health response only proves that the endpoint responds; it does not prove saving, teacher authentication, complete export, or mobile access.
