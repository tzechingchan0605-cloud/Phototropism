/** Google Apps Script collector for VL3 (bound or standalone). Deploy as owner, accessible to anyone.
 * Teacher reads require a private password; students can only write their own IDs.
 * No endpoint can list records without the password. Never expose Script Properties.
 */
const MODULE = 'VL_BIO_PHOTOTROPISM';
const TEACHER = 'tzechingchan0605@gmail.com';
const SHEET = 'VL3雲端紀錄';
const CHUNK = 40000;
const MAX_CHUNKS = 24;

function setupCollector() {
  if (Session.getEffectiveUser().getEmail().toLowerCase() !== TEACHER) throw Error('請以 tzechingchan0605@gmail.com 執行設定');
  const properties = PropertiesService.getScriptProperties();
  let source = String(properties.getProperty('SPREADSHEET_ID') || '').trim();
  if (!source) {
    // A bound script may supply its sheet. Standalone projects use a private property.
    let active = null;
    try {active = SpreadsheetApp.getActiveSpreadsheet();} catch (error) {}
    if (active) source = active.getId();
  }
  if (!source) throw Error('請在 Project Settings → Script Properties 加入 SPREADSHEET_ID，值可填 Google Sheet 完整網址，再按 Run 執行 setupCollector');
  const match = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:[/?#]|$)/.exec(source);
  const bookId = match ? match[1] : source;
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(bookId)) throw Error('SPREADSHEET_ID 無效，請填 Google Sheet 完整網址或試算表 ID');
  const password = properties.getProperty('SETUP_TEACHER_PASSWORD');
  let passwordHash = properties.getProperty('TEACHER_PASSWORD_HASH');
  if (password !== null) {
    if (typeof password !== 'string' || password.length < 12) throw Error('SETUP_TEACHER_PASSWORD 須至少 12 字元；請使用獨立密碼，勿使用 Google 帳戶密碼');
    passwordHash = digest(password);
  } else if (!/^[0-9a-f]{64}$/.test(passwordHash || '')) {
    throw Error('請在 Project Settings → Script Properties 加入 SETUP_TEACHER_PASSWORD，值為至少 12 字元的獨立教師密碼，再執行 setupCollector');
  }
  const book = SpreadsheetApp.openById(bookId);
  const sheet = book.getSheetByName(SHEET) || book.insertSheet(SHEET);
  if (sheet.getMaxColumns() < MAX_CHUNKS + 4) sheet.insertColumnsAfter(sheet.getMaxColumns(), MAX_CHUNKS + 4 - sheet.getMaxColumns());
  if (!sheet.getLastRow()) sheet.appendRow(['探究識別碼', '寫入權限雜湊', '版本時間', '分段數', ...Array.from({length: MAX_CHUNKS}, (_, i) => '原始紀錄分段' + (i + 1))]);
  // Keep existing working configuration until the new sheet is ready. No UI APIs.
  properties.setProperties({SPREADSHEET_ID: bookId, TEACHER_PASSWORD_HASH: passwordHash});
  if (password !== null) properties.deleteProperty('SETUP_TEACHER_PASSWORD');
  const message = '設定完成：已連結試算表並建立／保留 VL3雲端紀錄。請返回實驗室按重試同步。';
  Logger.log(message);
  return {ok: true, message};
}
function digest(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8).map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function equalHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let result = 0; for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
function output(value) {return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function doGet(event) {
  if (event?.parameter?.view === 'bridge') return bridgePage_(event.parameter);
  return output({ok: true, service: 'VL3集中紀錄', version: 3});
}
// The embedded page uses Google's own RPC transport instead of cross-origin fetch.
function bridgePage_(parameters) {
  if (!/^[0-9a-f-]{36}$/i.test(parameters.channel || '') || !/^https?:\/\/[^\/\s?#]+$/.test(parameters.parentOrigin || '')) throw Error('連線參數無效');
  const safe = value => JSON.stringify(value).replace(/</g, '\\u003c');
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
    const channel = ${safe(parameters.channel)}, parentOrigin = ${safe(parameters.parentOrigin)};
    const topWindow = window.top;
    function announce() {topWindow.postMessage({type:'vl3-ready',channel},parentOrigin);}
    const readyTimer = setInterval(announce,500);
    window.addEventListener('message',function(event) {
      if(event.source !== topWindow || event.origin !== parentOrigin || !event.data || event.data.channel !== channel) return;
      const message=event.data;
      if(message.type==='vl3-connected') {clearInterval(readyTimer);return;}
      if(message.type!=='vl3-request' || typeof message.id!=='string') return;
      const respond=reply=>topWindow.postMessage(Object.assign({type:'vl3-response',channel,id:message.id},reply),parentOrigin);
      google.script.run.withSuccessHandler(result=>respond({result}))
        .withFailureHandler(error=>respond({error:error.message||'雲端執行失敗'})).collectorBridge(message.payload);
    });
    announce();
  </script></body></html>`;
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function collectorBridge(data) {
  return JSON.parse(doPost({postData:{contents:JSON.stringify(data)}}).getContent());
}
function doPost(event) {
  let lock;
  try {
    const raw = event?.postData?.contents;
    if (!raw || raw.length > 1000000) throw Error('請求過大或沒有內容');
    const data = JSON.parse(raw), properties = PropertiesService.getScriptProperties();
    const bookId = properties.getProperty('SPREADSHEET_ID');
    if (!bookId) throw Error('教師尚未完成收集端設定');
    if (!['save', 'list'].includes(data.action)) throw Error('不支援的操作');
    if (data.action === 'list' && (data.teacherEmail !== TEACHER || typeof data.password !== 'string' || !equalHash(digest(data.password), properties.getProperty('TEACHER_PASSWORD_HASH')))) throw Error('教師密碼不正確');
    const sheet = SpreadsheetApp.openById(bookId).getSheetByName(SHEET);
    if (!sheet) throw Error('找不到收集工作表');
    lock = LockService.getScriptLock(); lock.waitLock(20000);
    if (data.action === 'list') {
      const cursor = data.cursor ?? 0;
      if (!Number.isInteger(cursor) || cursor < 0) throw Error('分頁位置無效');
      const total = Math.max(0, sheet.getLastRow() - 1), count = Math.min(5, Math.max(0, total - cursor));
      const rows = count ? sheet.getRange(cursor + 2, 1, count, MAX_CHUNKS + 4).getValues() : [];
      const records = rows.map(readRecord_);
      return output({ok: true, records, nextCursor: cursor + count < total ? cursor + count : null});
    }
    const r = data.record;
    if (!r || r.moduleId !== MODULE || typeof r.id !== 'string' || (!r.id.length || r.id.length > 200 || /[\u0000-\u001f]/.test(r.id)) || !r.profile || typeof r.profile.email !== 'string' || r.profile.email.toLowerCase() === TEACHER || r.demo === true || r.profile.mode === 'teacher-demo' || !r.profile.email.includes('@')) throw Error('不是有效的學生探究紀錄');
    if (typeof data.token !== 'string' || data.token.length < 64 || data.token.length > 128) throw Error('寫入權限無效');
    if (typeof r.savedAt !== 'string' || !Number.isFinite(Date.parse(r.savedAt))) throw Error('版本時間無效');
    const last = sheet.getLastRow(), tokenHash = digest(data.token);
    const meta = last > 1 ? sheet.getRange(2, 1, last - 1, 3).getValues() : [];
    const index = meta.findIndex(row => row[0] === 'record:' + r.id);
    if (index >= 0 && !equalHash(meta[index][1], tokenHash)) throw Error('無權更新這份探究紀錄');
    if (index >= 0 && Date.parse(meta[index][2]) >= Date.parse(r.savedAt)) return output({ok: true, id: r.id, savedAt: meta[index][2]});
    if (index >= 0) {
      const old = readRecord_(sheet.getRange(index + 2, 1, 1, MAX_CHUNKS + 4).getValues()[0]);
      if (old.profile.email.toLowerCase() !== r.profile.email.toLowerCase()) throw Error('不能更改這份紀錄的學生身分');
      // Original answers remain original even if a client revisits the design step.
      for (const field of ['initialDesign', 'firstObservations', 'firstObservationsAt', 'firstMainAnalysis', 'finalAnswers']) {
        if (old[field] !== null && old[field] !== undefined) r[field] = old[field];
      }
      if (old.extension) {
        r.extension = r.extension || old.extension;
        for (const field of ['initialPrediction', 'firstReadings', 'firstGraph']) {
          if (old.extension[field] !== null && old.extension[field] !== undefined) r.extension[field] = old.extension[field];
        }
      }
      if (old.experimentVersion !== undefined) r.experimentVersion = old.experimentVersion;
      else delete r.experimentVersion;
    }
    const json = JSON.stringify(r), chunks = [];
    for (let i = 0; i < json.length;) {
      let end = Math.min(i + CHUNK, json.length);
      const code = json.charCodeAt(end - 1);
      if (end < json.length && code >= 0xd800 && code <= 0xdbff) end--;
      chunks.push('json:' + json.slice(i, end)); i = end;
    }
    if (chunks.length > MAX_CHUNKS) throw Error('紀錄過大，請減小裝置相片；完整本機紀錄仍會保留');
    const row = ['record:' + r.id, tokenHash, r.savedAt, chunks.length, ...chunks, ...Array(MAX_CHUNKS - chunks.length).fill('')];
    const range = sheet.getRange(index < 0 ? last + 1 : index + 2, 1, 1, row.length);
    // Every chunk has a literal json: prefix so no student text becomes a formula.
    range.setNumberFormat('@'); range.setValues([row]);
    return output({ok: true, id: r.id, savedAt: r.savedAt});
  } catch (e) {return output({ok: false, error: e.message || '收集端錯誤'});}
  finally {if (lock && lock.hasLock()) lock.releaseLock();}
}

function readRecord_(row) {
  const size = Number(row[3]);
  if (!Number.isInteger(size) || size < 1 || size > MAX_CHUNKS) throw Error('雲端紀錄分段損壞，請保留工作表並檢查');
  const chunks = row.slice(4, 4 + size);
  if (chunks.some(chunk => typeof chunk !== 'string' || !chunk.startsWith('json:'))) throw Error('雲端紀錄分段不完整');
  const record = JSON.parse(chunks.map(chunk => chunk.slice(5)).join(''));
  if (record.moduleId !== MODULE || !record.profile || typeof record.profile.email !== 'string' || record.profile.email.toLowerCase() === TEACHER || record.demo === true || record.profile.mode === 'teacher-demo') throw Error('收集表包含不屬於本模組的紀錄，未提供部分全班資料');
  return record;
}
