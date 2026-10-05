const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const URL = process.env.LAB_URL || "http://127.0.0.1:8001";
const passwordPath =
  process.env.VL3_TEST_PASSWORD_FILE || ".data/teacher-password";
async function authenticate(page) {
  await page
    .locator("#teacherPassword")
    .fill((await fs.readFile(passwordPath, "utf8")).trim());
  await page.locator("#teacherLogin button").click();
  await page.waitForFunction(
    () => document.querySelector("#teacherLogin").hidden,
  );
}
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL);
  await page.locator("#profileName").fill("陳小明");
  await page.locator("#profileClass").fill("S4A-05");
  await page.locator("#profileEmail").fill("student@example.com");
  await page.locator("#profileForm button").click();
  assert.equal(await page.locator("#phase-1").isVisible(), true);
  await page.locator("#toDesign").click();
  assert.equal(await page.locator("#phase-2").isVisible(), false);
  await page.locator("#observation").fill("幼芽向右方光源彎曲。");
  await page.locator("#toDesign").click();
  assert.equal(await page.locator("#hypothesisPart").inputValue(), "");
  assert.equal(await page.locator("#hypothesisOutcome").inputValue(), "");
  await page.locator("#toExperiment").click();
  assert.equal(await page.locator("#phase-2").isVisible(), true);
  await page.locator("#hypothesisPart").selectOption("tip");
  await page.locator("#hypothesisOutcome").selectOption("bend");
  await page
    .locator("#reason")
    .fill("我預測頂端不是感光部位，需要比較才能知道。");
  for (const [g, ns] of Object.entries({ iv: [0], dv: [1], cv: [2, 3, 4, 5] }))
    for (const n of ns)
      await page.locator(`[data-variable=${g}][value="${n}"]`).check();
  for (const id of ["similar", "light", "free"])
    await page.locator(`[data-assumption=${id}]`).check();
  await page
    .locator("#controlPlan")
    .fill("以 A 不遮光、C 透明罩與 B 不透光罩比較，區分罩子及遮光作用。");
  await page
    .locator("#setupDescription")
    .fill(
      "四組 A 不遮光 B 頂端不透光罩 C 透明罩 D 下部遮光；相同單側光照、時間、溫度及供水。",
    );
  await page.locator("#saveTextSetup").click();
  // A real drawing is retained and exported as an embedded image.
  const box = await page.locator("#setupCanvas").boundingBox();
  await page.mouse.move(box.x + 20, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.up();
  await page.locator("#saveDrawing").click();
  await page.locator("#toExperiment").click();
  assert.equal(await page.locator("#phase-3").isVisible(), true);
  const original = await page.evaluate(() => state.initialDesign);
  assert.match(original.hypothesisText, /頂端.*仍向光彎曲/);
  await page.locator('[data-back="2"]').click();
  await page.locator("#hypothesisOutcome").selectOption("straight");
  await page.locator("#reason").fill("修訂理由：頂端可能感光。");
  await page.locator("#toExperiment").click();
  assert.deepEqual(await page.evaluate(() => state.initialDesign), original);
  assert.equal(await page.locator("#recordData").isDisabled(), true);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator("#runExperiment").click();
  assert.equal(await page.locator("#recordData").isDisabled(), true);
  await page.waitForFunction(() => hasRun);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [id, v] of Object.entries({
    A: "bend",
    B: "straight",
    C: "bend",
    D: "straight",
  }))
    await page.locator("#obs-" + id).selectOption(v);
  await page.locator("#recordData").click();
  assert.equal(
    await page.evaluate(() => state.firstObservations.D),
    "straight",
  );
  await page.locator("#obs-D").selectOption("bend");
  await page.locator("#recordData").click();
  assert.equal(
    await page.evaluate(() => state.firstObservations.D),
    "straight",
  );
  assert.equal(await page.evaluate(() => state.observations.D), "bend");
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/vl3-experiment.png", fullPage: true });
  await page.locator("#toAnalysis").click();
  assert.equal(await page.locator("#learningReveal").isVisible(), false);
  for (const [id, v] of Object.entries({
    qTip: "tip",
    qCap: "light",
    qBelow: "bend",
    qLimit: "indirect",
  }))
    await page.locator("#" + id).selectOption(v);
  await page
    .locator("#evidence")
    .fill(
      "B 頂端遮光沒有彎曲，A 與 C 仍彎曲；D 頂端外露也彎曲，支持頂端感光。",
    );
  await page.locator("#submitInvestigation").click();
  assert.equal(await page.locator("#learningReveal").isVisible(), true);
  assert.equal(await page.locator("#qTip").isDisabled(), true);
  assert.match(
    await page.locator("#originalHypothesis").innerText(),
    /仍向光彎曲/,
  );
  assert.match(
    await page.locator("#originalHypothesis").innerText(),
    /不是感光部位/,
  );
  assert.equal(await page.locator("#downloadPDF").isDisabled(), true);
  await page.locator("#saveReflection").click();
  assert.equal(await page.locator("#downloadPDF").isDisabled(), true);
  await page
    .locator("#reflection")
    .fill(
      "原始假說不獲支持。B 沒有彎曲但 C 彎曲，顯示頂端感光；D 頂端外露仍彎曲。背光側生長素較多促進幼芽細胞伸長，彎曲發生在頂端以下。此實驗沒有直接量度生長素。",
    );
  await page.locator("#saveReflection").click();
  assert.equal(await page.locator("#reflection").isDisabled(), true);
  assert.equal(await page.locator("#downloadPDF").isDisabled(), false);
  await page.evaluate(() => {
    window.print = () => {
      window.printCalled = true;
    };
  });
  await page.locator("#downloadPDF").click();
  assert.equal(await page.evaluate(() => window.printCalled), true);
  assert.match(await page.locator("#printReport").innerHTML(), /不是感光部位/);
  const recordDownload = page.waitForEvent("download");
  await page.locator("#downloadRecord").click();
  await (await recordDownload).saveAs("/tmp/vl3-record.json");
  const record = JSON.parse(await fs.readFile("/tmp/vl3-record.json", "utf8"))
    .records[0];
  assert(record.reflectionSubmittedAt);
  assert.equal(record.initialDesign.form.hypothesisOutcome, "bend");
  assert.equal(record.form.hypothesisOutcome, "straight");
  await page.evaluate(() => flushSync());
  await page.locator("#newSession").click();
  await page.locator("#profileName").fill("教師");
  await page.locator("#profileClass").fill("教師");
  await page.locator("#profileEmail").fill("tzechingchan0605@gmail.com");
  await page.locator("#profileForm button").click();
  assert.equal(await page.locator("#teacherDialog").isVisible(), true);
  await authenticate(page);
  assert.match(await page.locator("#teacherRows").innerText(), /陳小明/);
  const xlsx = page.waitForEvent("download");
  await page.locator("#exportExcel").click();
  await (await xlsx).saveAs("/tmp/vl3-records.xlsx");
  // Teacher records are excluded; JSON is transferable to a fresh browser.
  assert.equal(await page.evaluate(() => records().length), 1);
  const p2 = await browser.newPage();
  await p2.goto(URL);
  await p2.locator("#profileName").fill("教師");
  await p2.locator("#profileClass").fill("教師");
  await p2.locator("#profileEmail").fill("tzechingchan0605@gmail.com");
  await p2.locator("#profileForm button").click();
  await authenticate(p2);
  assert.match(await p2.locator("#teacherRows").innerText(), /陳小明/);
  assert.equal(await p2.evaluate(() => records().length), 0);
  await p2.locator("#importRecords").setInputFiles("/tmp/vl3-record.json");
  await p2.waitForFunction(() =>
    document.querySelector("#teacherRows").textContent.includes("陳小明"),
  );
  await p2.locator("#importRecords").setInputFiles("/tmp/vl3-record.json");
  assert.equal(await p2.evaluate(() => sharedRecords.length), 1);
  // A separate student's browser uploads without teacher login or manual transfer.
  const student2 = await browser.newPage();
  await student2.goto(URL);
  await student2.locator("#profileName").fill("李同學");
  await student2.locator("#profileClass").fill("S4B-09");
  await student2.locator("#profileEmail").fill("phone-student@example.com");
  await student2.locator("#profileForm button").click();
  await student2.locator("#observation").fill("手機瀏覽器的作答會自動上傳。");
  await student2.evaluate(() => flushSync());
  await p2.locator("#refreshTeacher").click();
  await p2.waitForFunction(() => sharedRecords.length === 2);
  assert.match(await p2.locator("#teacherRows").innerText(), /李同學/);
  const multiDownload = p2.waitForEvent("download");
  await p2.locator("#exportExcel").click();
  await (await multiDownload).saveAs("/tmp/vl3-multi.xlsx");
  // Offline answers remain queued and appear after reconnection.
  await student2.context().setOffline(true);
  await student2.locator("#observation").fill("離線後再連線的手機作答。");
  assert.equal(await student2.evaluate(() => flushSync()), false);
  await student2.context().setOffline(false);
  assert.equal(await student2.evaluate(() => flushSync()), true);
  await p2.locator("#refreshTeacher").click();
  await p2.waitForFunction(() =>
    sharedRecords.some(
      (r) =>
        r.profile.name === "李同學" &&
        r.form.observation === "離線後再連線的手機作答。",
    ),
  );
  assert.equal(
    await student2.evaluate(async () => (await fetch("/api/records")).status),
    401,
  );
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: "/tmp/vl3-report.pdf",
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.locator("#closeTeacher").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/vl3-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "PASS: gates, frozen original hypothesis, four trials, original observations, submission locks, reflection, PDF, XLSX, automatic cross-browser storage, protected teacher access, portable imports, mobile layout, no browser errors.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
