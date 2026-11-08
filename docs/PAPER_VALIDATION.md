# WS3實際驗證紀錄

日期：2026-11-08（香港）；題目版本19；rubric `vl19-causal-5`；教材版本見materials/manifest.json。

已讀WS1學生版附件（四頁）及VL1 `a9ea711`、VL2 `a5ec00a`現行教材與生成來源。部署前實讀線上VL3仍為版本18；GitHub Pages API確認來源為main根目錄，legacy build。VL1／VL2線上manifest與參考checkout比對，非只讀提示詞。

## 實際執行

`npm ci`、`python -m pip install -r requirements-test.txt`、`npm run materials:build`、`npm test`。Node24、Python3.12、Chromium／Playwright、Noto CJK、PyMuPDF、poppler-utils、python-docx、CairoSVG及LibreOffice。

- 兩語共十個真檔：學生PDF／Word及完整答案PDF／Word各4頁，D PDF各5頁。三PDF預覽、五類下載，MIME、magic bytes、SHA-256及來源fingerprint核對。
- 六PDF文字可選、圖形為向量；全頁A4、可見字至少11pt、正文12pt、一般行距19pt、課題需知33pt。四Word以LibreOffice實際開啟及轉PDF，各4頁，正文／表格／作答可編輯，含SVG與高解像後備圖，深灰1pt作答線、藍色答案、紅色概念。全頁渲染於/tmp供版面檢閱；自動檢查文字及圖形邊界。
- 原變量每列重複全部六因素及順序，多選剔選；原單選全部選項、前提定義與對照括號提示、A/B/C、A/D及E–H全部保留。不加假說補位／指定比較／理由／限制追問或棒形圖。量角用0/0/35/35模型且學生版不印角度答案。
- 教師及教師示範入口、未登入學生隱藏、390px手機、兩語各五檔下載與三PDF預覽通過。面板跟隨介面語言；刻意延遲舊語言請求，切換後舊回應不能回填。缺英文、404、錯MIME、損壞Word/PDF、過期版本及來源digest錯誤拒絕，重新載入可恢復。
- 材料操作前後完整state、local/sessionStorage、答案、控制項、繪圖、計時、事件、本機及模擬雲端紀錄相同；正式collector請求為0；前後實際教師Excel位元組相同。
- 學生三段探究、原始預測、首次／最後觀察、鎖定、延後揭示、反思後PDF、雙語、離線／重整／補傳、教師排除、分頁、錯誤確認、不完整匯出阻擋及歷史版本回歸通過。
- 真XLSX八頁、圖像、驗證、底色及條件色彩檢查；LibreOffice實際重算混合19/18/8/3/1紀錄，新版29／歷史32，空白待評、0有效、負數／超限／小數／文字不能產生有效總分。不適用欄不阻擋。原文、ID、快照、事件及雲端佇列保留。
- 隔離副本變更現行題目，重建十檔、更新fingerprint/checksum並移除舊生成檔。SQLite後備伺服器驗證所有檔案MIME、私密檔案保護、權限、重啟持久性。

## 限制

Google流程使用隔離模擬，未寫入正式學生試算表。自動驗證不等同學生試教、實體列印、Microsoft Word／Excel各版本相容或效度研究。15–20分鐘、實體量角器／灰階、兩語負荷及評分者校準仍待試教。WS23與VL29不可直接宣稱等值。正式部署結果以提交及GitHub Actions／線上checksum核對為準。
