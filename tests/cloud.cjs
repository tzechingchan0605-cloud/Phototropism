// Simulated Google services + actual Apps Script, nested bridge, real browsers.
// This does not claim a live Google deployment or real cross-device verification.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const vm = require("node:vm");
const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const rows = [["headers"]],
  properties = {
    SPREADSHEET_ID: "test-sheet",
    TEACHER_PASSWORD_HASH: crypto
      .createHash("sha256")
      .update("test-teacher-password")
      .digest("hex"),
  };
const sheet = {
  getLastRow: () => rows.length,
  getRange(start, col, count, width) {
    return {
      getValues: () =>
        Array.from({ length: count }, (_, i) =>
          Array.from(
            { length: width },
            (_, j) => rows[start + i - 1]?.[col + j - 1] ?? "",
          ),
        ),
      setNumberFormat() {},
      setValues(values) {
        values.forEach((value, i) => {
          rows[start + i - 1] = value;
        });
      },
    };
  },
};
const sandbox = {
  PropertiesService: {
    getScriptProperties: () => ({ getProperty: (k) => properties[k] }),
  },
  SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: "sha256" },
    Charset: { UTF_8: "utf8" },
    computeDigest: (_, value) => [
      ...crypto.createHash("sha256").update(value).digest(),
    ],
  },
  LockService: {
    getScriptLock: () => ({
      waitLock() {},
      hasLock: () => true,
      releaseLock() {},
    }),
  },
  ContentService: {
    MimeType: { JSON: "json" },
    createTextOutput: (text) => ({
      text,
      getContent() {
        return text;
      },
      setMimeType() {
        return this;
      },
    }),
  },
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: "all" },
    createHtmlOutput: (html) => ({
      html,
      setXFrameOptionsMode() {
        return this;
      },
    }),
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("cloud/Code.gs", "utf8"), sandbox);
const call = (data) =>
  JSON.parse(
    sandbox.doPost({ postData: { contents: JSON.stringify(data) } }).text,
  );
const auth = {
  action: "list",
  teacherEmail: "tzechingchan0605@gmail.com",
  password: "test-teacher-password",
};
function allCloud() {
  const all = [];
  let cursor = 0;
  do {
    const page = call({ ...auth, cursor });
    assert(page.ok);
    all.push(...page.records);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return all;
}
const record = {
  moduleId: "VL_BIO_PHOTOTROPISM",
  id: crypto.randomUUID(),
  profile: { name: "測試", email: "backend@example.com" },
  savedAt: "2026-10-05T01:00:00.000Z",
  setup: { image: "data:image/jpeg;base64," + "A".repeat(120000) },
  events: [{ type: "answer_changed", value: '=IMPORTXML("test")' }],
};
const token = "a".repeat(72);
assert(call({ action: "save", record, token }).ok);
assert.equal(rows.length, 2);
assert.equal(rows[1][3], 4);
assert(
  !call({
    action: "save",
    record: { ...record, savedAt: "2026-10-05T02:00:00Z" },
    token: "b".repeat(72),
  }).ok,
);
assert.equal(call({ ...auth, password: "wrong" }).code, "TEACHER_AUTH_FAILED");
assert.equal(
  call({ ...auth, teacherEmail: "other@example.com" }).code,
  "TEACHER_AUTH_FAILED",
);
const configuredHash = properties.TEACHER_PASSWORD_HASH;
delete properties.TEACHER_PASSWORD_HASH;
assert.equal(call(auth).code, "TEACHER_PASSWORD_NOT_CONFIGURED");
properties.TEACHER_PASSWORD_HASH = "invalid-hash";
assert.equal(call(auth).code, "TEACHER_PASSWORD_NOT_CONFIGURED");
properties.TEACHER_PASSWORD_HASH = configuredHash;
properties.SETUP_TEACHER_PASSWORD = "new-pending-teacher-password";
assert(
  call(auth).ok,
  "Pending setup must not revoke the current working password",
);
const pendingAuth = call({
  ...auth,
  password: properties.SETUP_TEACHER_PASSWORD,
});
assert.equal(pendingAuth.code, "TEACHER_PASSWORD_SETUP_PENDING");
assert.equal(properties.TEACHER_PASSWORD_HASH, configuredHash);
assert.equal(
  rows.length,
  2,
  "Authentication failures must preserve all records",
);
assert(
  !JSON.stringify(pendingAuth).includes(properties.SETUP_TEACHER_PASSWORD),
);
assert(!JSON.stringify(pendingAuth).includes(configuredHash));
delete properties.SETUP_TEACHER_PASSWORD;
assert(
  !call({
    action: "save",
    record: {
      ...record,
      id: crypto.randomUUID(),
      profile: { email: "tzechingchan0605@gmail.com" },
    },
    token,
  }).ok,
);
assert(
  !call({
    action: "save",
    record: { ...record, id: crypto.randomUUID(), demo: true },
    token,
  }).ok,
);
assert(
  !call({
    action: "save",
    record: { ...record, moduleId: "VL_BIO_DIGESTION_OPTION_A" },
    token,
  }).ok,
);
assert(
  call({
    action: "save",
    record: { ...record, savedAt: "2026-10-04T00:00:00Z" },
    token,
  }).ok,
);
assert.deepEqual(call(auth).records[0], record);
assert.equal(rows.length, 2);
for (let i = 0; i < 6; i++)
  assert(
    call({ action: "save", record: { ...record, id: "legacy-" + i }, token })
      .ok,
  );
assert.equal(call({ ...auth, cursor: 0 }).records.length, 5);
assert.equal(call({ ...auth, cursor: 5 }).records.length, 2);
assert(
  rows
    .slice(1)
    .every((row) =>
      row.slice(4, 4 + row[3]).every((chunk) => chunk.startsWith("json:")),
    ),
);
// Frozen original/submitted snapshots and legacy experiment versions survive updates.
const frozen = {
  ...record,
  id: crypto.randomUUID(),
  initialDesign: { hypothesisText: "原始假說" },
  firstObservations: { A: "bend" },
  firstObservationsAt: record.savedAt,
  finalAnswers: { evidence: "原始遞交" },
};
assert(call({ action: "save", record: frozen, token }).ok);
assert(
  call({
    action: "save",
    token,
    record: {
      ...frozen,
      savedAt: "2026-10-06T01:00:00Z",
      experimentVersion: 2,
      initialDesign: { hypothesisText: "覆蓋" },
      firstObservations: { A: "straight" },
      finalAnswers: { evidence: "覆蓋" },
    },
  }).ok,
);
const kept = call({ ...auth, cursor: 5 }).records.find(
  (r) => r.id === frozen.id,
);
assert.deepEqual(kept.initialDesign, frozen.initialDesign);
assert.deepEqual(kept.firstObservations, frozen.firstObservations);
assert.deepEqual(kept.finalAnswers, frozen.finalAnswers);
assert.equal(kept.experimentVersion, undefined);
assert(
  !call({
    action: "save",
    record: {
      ...frozen,
      savedAt: "2026-10-07T01:00:00Z",
      profile: { email: "other@example.com" },
    },
    token,
  }).ok,
);
rows.splice(1);
let unavailable = false,
  mismatch = false,
  legacyAuthError = false,
  failSecondPage = false,
  collectorPort;
const collector = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${collectorPort}`);
  if (
    req.method === "GET" &&
    url.pathname === "/collector" &&
    url.searchParams.get("view") === "bridge"
  ) {
    const inner = new URL("/bridge-content", url.origin);
    inner.search = url.search;
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><iframe src="' +
        inner.href.replaceAll("&", "&amp;") +
        '"></iframe>',
    );
    return;
  }
  if (req.method === "GET" && url.pathname === "/bridge-content") {
    const output = sandbox.doGet({
      parameter: Object.fromEntries(url.searchParams),
    });
    const stub = `<script>window.google={script:{run:{withSuccessHandler(success){return{withFailureHandler(failure){return{collectorBridge(payload){fetch('/rpc',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(payload)}).then(r=>{if(!r.ok)throw Error('服務離線');return r.json();}).then(success).catch(failure);}};}};}}}};</script>`;
    res.setHeader("Content-Type", "text/html");
    res.end(output.html.replace("<body>", "<body>" + stub));
    return;
  }
  if (req.method === "POST" && ["/collector", "/rpc"].includes(url.pathname)) {
    if (unavailable) {
      res.writeHead(503);
      res.end("offline");
      return;
    }
    let body = "";
    req.on("data", (b) => (body += b));
    req.on("end", () => {
      const data = JSON.parse(body);
      let result = sandbox.collectorBridge(data);
      if (legacyAuthError && data.action === "list")
        result = { ok: false, error: "教師密碼不正確" };
      if (mismatch && data.action === "save") result.id = "incorrect-id";
      if (failSecondPage && data.action === "list" && data.cursor > 0)
        result = { ok: false, error: "第二頁失敗" };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result));
    });
    return;
  }
  res.writeHead(404);
  res.end();
});
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/cloud-config.js") {
    res.setHeader("Content-Type", "application/javascript");
    res.end(
      `window.VL3_CLOUD_CONFIG={endpoint:'http://127.0.0.1:${collectorPort}/collector',transport:'bridge'};`,
    );
    return;
  }
  const target = path.resolve(
    ".",
    "." + (url.pathname === "/" ? "/index.html" : url.pathname),
  );
  if (!target.startsWith(process.cwd() + path.sep)) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
      }[path.extname(target)] || "application/octet-stream",
    );
    res.end(fs.readFileSync(target));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
(async () => {
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), "vl3-cloud-tests-"));
  await new Promise((r) => collector.listen(0, "127.0.0.1", r));
  collectorPort = collector.address().port;
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const passwordFile = path.join(temp, "test-password");
  await fsp.writeFile(passwordFile, "test-teacher-password", { mode: 0o600 });
  async function languageTests() {
    await new Promise((resolve, reject) =>
      execFile(
        process.execPath,
        ["tests/language.cjs"],
        {
          env: {
            ...process.env,
            LAB_URL: base,
            VL3_TEST_PASSWORD_FILE: passwordFile,
          },
          timeout: 180000,
        },
        (error, stdout, stderr) => {
          process.stdout.write(stdout);
          process.stderr.write(stderr);
          error ? reject(error) : resolve();
        },
      ),
    );
  }
  let browser;
  try {
    if (process.env.VL3_LANGUAGE_ONLY === "1") {
      await languageTests();
      return;
    }
    // Existing full lab workflow now runs through the actual nested Apps Script bridge.
    await new Promise((resolve, reject) =>
      execFile(
        process.execPath,
        ["tests/smoke.cjs"],
        {
          env: {
            ...process.env,
            LAB_URL: base,
            VL3_TEST_PASSWORD_FILE: passwordFile,
          },
          timeout: 120000,
        },
        (error, stdout, stderr) => {
          process.stdout.write(stdout);
          process.stderr.write(stderr);
          error ? reject(error) : resolve();
        },
      ),
    );
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    });
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } }),
      t = await browser.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    t.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base);
    await t.goto(base);
    assert.equal(
      await p.locator("#loginCloudStatus").getAttribute("data-state"),
      "configured",
    );
    await p.evaluate(() => cloudSync.flush());
    assert.equal(
      await p.locator("#loginCloudStatus").getAttribute("data-state"),
      "configured",
    );
    assert(
      await p.evaluate(async (endpoint) => {
        try {
          await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: "{}",
          });
          return false;
        } catch {
          return true;
        }
      }, `http://127.0.0.1:${collectorPort}/collector`),
    );
    async function login(page, name, email) {
      await page.fill("#profileName", name);
      await page.fill("#profileClass", "S4-01");
      await page.fill("#profileEmail", email);
      await page.click("#profileForm button");
    }
    await login(p, "同電郵學生", "repeat@example.com");
    await p.fill("#observation", "第一次探究");
    assert(await p.evaluate(() => flushSync()));
    const first = await p.evaluate(() => state.id);
    await p.click("#newSession");
    await login(p, "同電郵學生", "repeat@example.com");
    const second = await p.evaluate(() => state.id);
    assert.notEqual(first, second);
    unavailable = true;
    await p.fill("#observation", "離線重新整理後補傳");
    assert.equal(await p.evaluate(() => flushSync()), false);
    p.on("dialog", (d) => d.accept());
    await p.reload();
    await p.waitForFunction(
      () => document.querySelector("#syncStatus").dataset.state === "error",
    );
    unavailable = false;
    await p.click("#loginRetryCloud");
    await p.waitForFunction(
      () => document.querySelector("#syncStatus").dataset.state === "synced",
    );
    const cloud = allCloud();
    assert.equal(
      cloud.find((r) => r.id === second).form.observation,
      "離線重新整理後補傳",
    );
    assert.equal(
      cloud.filter((r) => r.profile.email === "repeat@example.com").length,
      2,
    );
    await login(p, "確認測試", "ack@example.com");
    mismatch = true;
    await p.fill("#observation", "錯誤 ID 不算同步");
    assert.equal(await p.evaluate(() => flushSync()), false);
    assert.equal(
      await p.locator("#syncStatus").getAttribute("data-state"),
      "error",
    );
    mismatch = false;
    assert(await p.evaluate(() => flushSync()));
    // Genuine stale write is idempotent and cannot overwrite a newer answer.
    const metadata = await p.evaluate(() =>
      JSON.parse(localStorage.getItem("phototropismLab.appsScriptSync.v1")),
    );
    const id = await p.evaluate(() => state.id);
    const entry = metadata[id];
    const stale = {
      ...entry.record,
      savedAt: "2020-01-01T00:00:00Z",
      form: { ...entry.record.form, observation: "stale" },
    };
    assert(call({ action: "save", token: entry.token, record: stale }).ok);
    assert.notEqual(
      allCloud().find((r) => r.id === id).form.observation,
      "stale",
    );
    await login(t, "教師", "tzechingchan0605@gmail.com");
    await t.fill("#teacherPassword", "wrong");
    await t.click("#teacherLogin button");
    await t.waitForFunction(() =>
      document
        .querySelector("#teacherStatus")
        .textContent.includes("教師登入未通過驗證"),
    );
    assert(await t.locator("#teacherAuthHelp").isVisible());
    assert(await t.locator("#exportExcel").isDisabled());
    assert.equal(await t.locator("#teacherPassword").inputValue(), "");
    legacyAuthError = true;
    await t.fill("#teacherPassword", "test-teacher-password");
    await t.click("#teacherLogin button");
    await t.waitForFunction(() =>
      document
        .querySelector("#teacherStatus")
        .textContent.includes("可能尚未設定"),
    );
    assert(await t.locator("#teacherAuthHelp").isVisible());
    assert(await t.locator("#exportExcel").isDisabled());
    legacyAuthError = false;
    delete properties.TEACHER_PASSWORD_HASH;
    await t.fill("#teacherPassword", "test-teacher-password");
    await t.click("#teacherLogin button");
    await t.waitForFunction(() =>
      document
        .querySelector("#teacherStatus")
        .textContent.includes("尚未完成教師密碼設定"),
    );
    assert(await t.locator("#teacherAuthHelp").isVisible());
    assert(await t.locator("#exportExcel").isDisabled());
    properties.TEACHER_PASSWORD_HASH = configuredHash;
    properties.SETUP_TEACHER_PASSWORD = "new-pending-teacher-password";
    await t.fill("#teacherPassword", properties.SETUP_TEACHER_PASSWORD);
    await t.click("#teacherLogin button");
    await t.waitForFunction(() =>
      document.querySelector("#teacherStatus").textContent.includes("尚未套用"),
    );
    assert(await t.locator("#teacherAuthHelp").isVisible());
    assert(await t.locator("#exportExcel").isDisabled());
    delete properties.SETUP_TEACHER_PASSWORD;
    await t.fill("#teacherPassword", "test-teacher-password");
    await t.click("#teacherLogin button");
    await t.waitForFunction(
      () => document.querySelector("#teacherLogin").hidden,
    );
    assert(await t.locator("#teacherAuthHelp").isHidden());
    assert.equal(await t.evaluate(() => sharedRecords.length), rows.length - 1);
    assert.equal(
      await t.evaluate(() =>
        JSON.stringify(localStorage).includes("test-teacher-password"),
      ),
      false,
    );
    const before = JSON.stringify(rows);
    await t.click("#teacherDemo");
    await t.fill("#observation", "教師示範排除");
    await t.evaluate(() => {
      save();
      return flushSync();
    });
    assert.equal(JSON.stringify(rows), before);
    // More than one page must be read. Incomplete reads must not export anything.
    const sample = call(auth).records[0];
    assert(
      call({
        action: "save",
        token: "c".repeat(72),
        record: { ...sample, id: crypto.randomUUID() },
      }).ok,
    );
    failSecondPage = true;
    let downloaded = false;
    t.on("download", () => (downloaded = true));
    assert.equal(await t.evaluate(() => teacherDashboard()), false);
    await t.evaluate(() => exportExcel());
    assert.equal(downloaded, false);
    assert.equal(await t.locator("#teacherRows").innerText(), "");
    failSecondPage = false;
    // Corrupt local storage is retained byte-for-byte and does not overwrite old data.
    const corrupt = await browser.newPage();
    await corrupt.addInitScript(() =>
      localStorage.setItem("phototropismLab.records.v1", "{broken"),
    );
    await corrupt.goto(base);
    await login(corrupt, "資料損壞測試", "corrupt@example.com");
    await corrupt.fill("#observation", "新作答另有同步備份");
    assert.equal(
      await corrupt.evaluate(() =>
        localStorage.getItem("phototropismLab.records.v1"),
      ),
      "{broken",
    );
    assert(await corrupt.evaluate(() => flushSync()));
    assert.deepEqual(errors, []);
    console.log(
      "PASS (SIMULATED): actual collector + nested google.script.run bridge; CORS fetch fails; real lab workflow; separate browsers; same-email attempts; offline reload/retry; true ID/version acknowledgements; stale ownership protection; pagination; password-only reads; teacher exclusion; corrupt backups retained; incomplete cloud export blocked.",
    );
    await browser.close();
    browser = null;
    await languageTests();
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
    await new Promise((r) => collector.close(r));
    await fsp.rm(temp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  server.close();
  collector.close();
  process.exitCode = 1;
});
