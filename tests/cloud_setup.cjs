// Run the real Apps Script setup in standalone and bound contexts without a
// spreadsheet UI. Secrets remain private, and failed setup remains retryable.
"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../cloud/Code.gs"),
  "utf8",
);
const teacher = "tzechingchan0605@gmail.com";
const bookId = "1SetupTestPrivateSheet_12345678901234567890";
const password = "private-setup-password-123";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const clone = (value) => JSON.parse(JSON.stringify(value));

function harness(options = {}) {
  const properties = { ...options.properties };
  const rows = clone(options.rows || []);
  const logs = [];
  const calls = {
    ui: 0,
    active: 0,
    open: [],
    inserted: [],
    grown: [],
    appended: [],
    mutations: [],
  };
  let columns = options.columns ?? 26;
  let exists = options.exists ?? false;
  const sheet = {
    getMaxColumns() {
      return columns;
    },
    insertColumnsAfter(after, count) {
      if (options.failGrowth) throw Error("test sheet column access failure");
      assert.equal(after, columns);
      assert(count > 0);
      calls.grown.push([after, count]);
      columns += count;
      return this;
    },
    getLastRow() {
      return rows.length;
    },
    appendRow(row) {
      if (options.failHeader) throw Error("test sheet header write failure");
      calls.appended.push(clone(row));
      rows.push(clone(row));
      return this;
    },
    clear() {
      assert.fail("Setup must not clear student records");
    },
    clearContents() {
      assert.fail("Setup must not clear student records");
    },
    deleteRows() {
      assert.fail("Setup must not delete student records");
    },
  };
  const book = {
    getId() {
      return bookId;
    },
    getSheetByName(name) {
      assert.equal(name, "VL3雲端紀錄");
      return exists ? sheet : null;
    },
    insertSheet(name) {
      assert.equal(name, "VL3雲端紀錄");
      if (options.failInsert) throw Error("test sheet create failure");
      calls.inserted.push(name);
      exists = true;
      return sheet;
    },
  };
  const scriptProperties = {
    getProperty(key) {
      return properties[key] ?? null;
    },
    getProperties() {
      return { ...properties };
    },
    setProperty(key, value) {
      calls.mutations.push(["set", key]);
      properties[key] = value;
      return this;
    },
    setProperties(values, deleteAll) {
      assert(!deleteAll, "Setup must preserve unrelated private properties");
      for (const [key, value] of Object.entries(values))
        this.setProperty(key, value);
      return this;
    },
    deleteProperty(key) {
      calls.mutations.push(["delete", key]);
      delete properties[key];
      return this;
    },
  };
  const sandbox = {
    Session: {
      getEffectiveUser: () => ({ getEmail: () => options.email ?? teacher }),
    },
    PropertiesService: { getScriptProperties: () => scriptProperties },
    SpreadsheetApp: {
      getUi() {
        calls.ui++;
        throw Error("Cannot call SpreadsheetApp.getUi() from this context");
      },
      getActiveSpreadsheet() {
        calls.active++;
        return options.bound ? book : null;
      },
      openById(id) {
        calls.open.push(id);
        if (options.failOpen) throw Error("test inaccessible spreadsheet");
        assert.equal(
          id,
          bookId,
          "Spreadsheet URLs must be normalized before openById",
        );
        return book;
      },
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest(algorithm, value) {
        assert.equal(algorithm, "sha256");
        return [...crypto.createHash("sha256").update(value).digest()].map(
          (byte) => (byte > 127 ? byte - 256 : byte),
        );
      },
    },
    Logger: { log: (...values) => logs.push(values.map(String).join(" ")) },
    console: { log: (...values) => logs.push(values.map(String).join(" ")) },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "cloud/Code.gs" });
  return {
    properties,
    rows,
    calls,
    logs,
    run: () => sandbox.setupCollector(),
    columns: () => columns,
  };
}

function success(test) {
  const result = test.run();
  assert.equal(result.ok, true);
  assert.equal(
    test.calls.ui,
    0,
    "Standalone setup must never request SpreadsheetApp.getUi()",
  );
  assert(test.logs.length, "Execution log must confirm successful setup");
  assert.equal(test.properties.SPREADSHEET_ID, bookId);
  assert(
    !Object.hasOwn(test.properties, "SETUP_TEACHER_PASSWORD"),
    "Delete the temporary plaintext password after successful setup",
  );
  const messages = JSON.stringify({ result, logs: test.logs });
  for (const secret of [
    password,
    bookId,
    test.properties.TEACHER_PASSWORD_HASH,
  ]) {
    assert(
      !messages.includes(secret),
      "Setup log/result must not disclose secrets or private spreadsheet IDs",
    );
  }
  return result;
}

function failure(test, expected) {
  const before = clone(test.properties);
  assert.throws(test.run, expected);
  assert.deepEqual(
    test.properties,
    before,
    "Failed setup must retain private metadata and temporary password for retry",
  );
  assert.equal(test.calls.ui, 0);
  assert.equal(
    test.calls.mutations.length,
    0,
    "Metadata must be committed only after sheet setup succeeds",
  );
  assert(!JSON.stringify(test.logs).includes(password));
}

// Standalone project: no active spreadsheet and getUi would throw, exactly like
// the reported failure. Private property ID is sufficient to complete setup.
const standalone = harness({
  properties: {
    SPREADSHEET_ID: bookId,
    SETUP_TEACHER_PASSWORD: password,
    OTHER_PRIVATE_SETTING: "preserve",
  },
});
success(standalone);
assert.equal(standalone.properties.TEACHER_PASSWORD_HASH, hash(password));
assert.equal(standalone.properties.OTHER_PRIVATE_SETTING, "preserve");
assert.deepEqual(standalone.calls.open, [bookId]);
assert.equal(standalone.calls.active, 0);
assert.equal(standalone.columns(), 28);
assert.equal(standalone.rows.length, 1);
assert.equal(standalone.rows[0].length, 28);
assert.deepEqual(standalone.rows[0].slice(0, 4), [
  "探究識別碼",
  "寫入權限雜湊",
  "版本時間",
  "分段數",
]);
assert.equal(standalone.rows[0][27], "原始紀錄分段24");

// Full pasted Google Sheets URL and surrounding whitespace are accepted.
const pasted = harness({
  properties: {
    SPREADSHEET_ID:
      "  https://docs.google.com/spreadsheets/d/" +
      bookId +
      "/edit?gid=0#gid=0  ",
    SETUP_TEACHER_PASSWORD: password,
  },
});
success(pasted);
assert.deepEqual(pasted.calls.open, [bookId]);

// A genuinely bound script may infer its sheet, retaining the older workflow.
const bound = harness({
  bound: true,
  properties: { SETUP_TEACHER_PASSWORD: password },
});
success(bound);
assert.equal(bound.calls.active, 1);

failure(
  harness({ properties: { SETUP_TEACHER_PASSWORD: password } }),
  /SPREADSHEET_ID/,
);
failure(
  harness({ properties: { SPREADSHEET_ID: bookId } }),
  /SETUP_TEACHER_PASSWORD/,
);
failure(
  harness({
    properties: { SPREADSHEET_ID: bookId, SETUP_TEACHER_PASSWORD: "too-short" },
  }),
  /12/,
);
const wrongUser = harness({
  email: "student@example.com",
  properties: { SPREADSHEET_ID: bookId, SETUP_TEACHER_PASSWORD: password },
});
failure(wrongUser, /tzechingchan0605@gmail\.com|教師|teacher|帳戶|account/i);
assert.equal(
  wrongUser.calls.open.length,
  0,
  "Reject other accounts before spreadsheet access",
);

// Access and setup failures must not remove a temporary password or overwrite
// the previous successful password. The teacher can correct access and retry.
for (const kind of ["failOpen", "failInsert", "failGrowth", "failHeader"]) {
  const test = harness({
    [kind]: true,
    properties: {
      SPREADSHEET_ID: bookId,
      SETUP_TEACHER_PASSWORD: password,
      TEACHER_PASSWORD_HASH: hash("older-private-password"),
    },
  });
  failure(test, /test /);
}

const storedRows = [
  ["existing header"],
  [
    "record:student-1",
    "writehash",
    "2026-10-05T01:00:00Z",
    1,
    'json:{"answer":"保留答案"}',
  ],
];
const rerun = harness({
  exists: true,
  columns: 30,
  rows: storedRows,
  properties: { SPREADSHEET_ID: bookId, TEACHER_PASSWORD_HASH: hash(password) },
});
success(rerun);
assert.equal(rerun.properties.TEACHER_PASSWORD_HASH, hash(password));
assert.deepEqual(
  rerun.rows,
  storedRows,
  "Rerunning setup must preserve every student row",
);
assert.equal(rerun.calls.inserted.length, 0);
assert.equal(rerun.calls.appended.length, 0);
assert.equal(rerun.calls.grown.length, 0);

// A deliberate new temporary password replaces the old hash only on success.
const reset = harness({
  exists: true,
  rows: storedRows,
  properties: {
    SPREADSHEET_ID: bookId,
    TEACHER_PASSWORD_HASH: hash("older-private-password"),
    SETUP_TEACHER_PASSWORD: password,
  },
});
success(reset);
assert.equal(reset.properties.TEACHER_PASSWORD_HASH, hash(password));
assert.deepEqual(reset.rows, storedRows);

console.log(
  "PASS: standalone setup without UI, bound fallback, URL normalization, account/password checks, retry-safe properties, preserved rows, private logs and password cleanup.",
);
