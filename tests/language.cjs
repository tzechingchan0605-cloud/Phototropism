// Real browser/exports against the isolated Google-service simulation in cloud.cjs.
// Never use the production collector URL or upload test records to Google.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const base = process.env.LAB_URL;
assert(
  base && new URL(base).hostname === "127.0.0.1",
  "Language tests require an isolated local server",
);
const supported = /（(?:胚芽鞘|向光性|生長素|瓊脂|延長|不透光)）/g;
const dialogs = [];
function attachDialogs(page) {
  page.on("dialog", async (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    if (dialog.type() === "prompt") await dialog.dismiss();
    else await dialog.accept();
  });
}
async function switchLanguage(
  page,
  expectedLanguage,
  selector = ".topbar [data-language-switch]",
) {
  const beforeDialogs = dialogs.length;
  const beforeLanguage = await page.evaluate(() => VL3Language.current);
  assert.notEqual(
    beforeLanguage,
    expectedLanguage,
    "Each click must toggle language",
  );
  await page.locator(selector).click();
  await page.waitForTimeout(20);
  assert.equal(
    dialogs.length,
    beforeDialogs,
    "Language switching must not open a dialog",
  );
  assert.equal(
    await page.evaluate(() => VL3Language.current),
    expectedLanguage,
  );
}
async function stateSnapshot(page) {
  return page.evaluate(() => ({
    state: JSON.parse(
      JSON.stringify({ ...state, savedAt: null, phaseDurations: {} }),
    ),
    timing: { ...state.phaseDurations },
    controls: [...document.querySelectorAll("input,textarea,select")].map(
      (el) => [
        el.id,
        el.value,
        el.checked,
        el.disabled,
        [...(el.options || [])].map((option) => option.value),
      ],
    ),
    canvas: document.querySelector("#setupCanvas").toDataURL(),
    running,
    hasRun,
    extensionRunning,
    extensionHasRun,
    runGeneration,
    extensionGeneration,
    pending: cloudSync.getPendingCount(),
  }));
}
async function unchanged(page, action) {
  const before = await stateSnapshot(page);
  await action();
  const after = await stateSnapshot(page);
  for (const key of Object.keys(before.timing))
    assert(
      after.timing[key] >= before.timing[key],
      "Active time must never reset",
    );
  delete before.timing;
  delete after.timing;
  assert.deepEqual(
    after,
    before,
    "Language switching must not mutate inquiry, controls, canvas, locks, counters, events or pending records",
  );
}
async function noChineseSystem(page, root = "body") {
  const leftovers = await page.locator(root).evaluate((element) => {
    const found = [],
      strip = (value) =>
        value.replace(/（(?:胚芽鞘|向光性|生長素|瓊脂|延長|不透光)）/g, "");
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (
        node.parentElement.closest("script,style,textarea,[data-student-text]")
      )
        continue;
      if (/[\u3400-\u9fff]/.test(strip(node.data)))
        found.push(node.data.trim());
    }
    element
      .querySelectorAll("[placeholder],[aria-label],[alt],[title]")
      .forEach((el) => {
        for (const name of ["placeholder", "aria-label", "alt", "title"]) {
          const value = el.getAttribute(name);
          if (value && /[\u3400-\u9fff]/.test(strip(value)))
            found.push(`${el.id || el.tagName}.${name}: ${value}`);
        }
      });
    return [...new Set(found)];
  });
  assert.deepEqual(
    leftovers,
    [],
    "English system text/attributes must be complete (only six approved supports may remain)",
  );
}
async function login(page, name, email) {
  await page.fill("#profileName", name);
  await page.fill("#profileClass", "學生棒形圖");
  await page.fill("#profileEmail", email);
  await page.click("#profileForm button[type=submit]");
}
async function saveExcel(page, target) {
  const download = page.waitForEvent("download");
  await page.click("#exportExcel");
  await (await download).saveAs(target);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  const errors = [],
    external = [];
  async function newPage(options = {}) {
    const context = await browser.newContext(options);
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        ["127.0.0.1", "localhost"].includes(url.hostname) ||
        ["data:", "blob:"].includes(url.protocol)
      )
        return route.continue();
      external.push(url.origin);
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    attachDialogs(page);
    return page;
  }
  try {
    const page = await newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await page.goto(base);
    assert.equal(await page.evaluate(() => VL3Language.current), "zh");
    await page.fill("#profileName", "光源");
    const loginButton = "#profileDialog [data-language-switch]";
    assert.equal(await page.inputValue("#profileName"), "光源");
    await unchanged(page, () => switchLanguage(page, "en", loginButton));
    assert.equal(
      await page.evaluate(() => document.documentElement.lang),
      "en",
    );
    assert.equal(await page.inputValue("#profileName"), "光源");
    await noChineseSystem(page);
    await page.evaluate(() => {
      const draft = fresh({
        name: "保留原名",
        classInfo: "保留原班",
        email: "draft@example.com",
      });
      const probe = document.createElement("div");
      probe.id = "draftLanguageProbe";
      probe.innerHTML = newReport(draft);
      document.body.append(probe);
      VL3Language.translateTree(probe);
    });
    await noChineseSystem(page, "#draftLanguageProbe");
    await page.evaluate(() =>
      document.querySelector("#draftLanguageProbe").remove(),
    );
    const placeholders = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          "input[type=text],input:not([type]),input[type=email],input[type=password],input[type=number],textarea",
        ),
      ].map((el) => [el.id, el.placeholder]),
    );
    assert(
      placeholders.every(([, hint]) => hint.trim()),
      "Every text/number entry must have a translated hint",
    );
    assert.equal(
      await page.getAttribute("#observation", "placeholder"),
      "I observe that…",
    );
    await login(page, "光源", "language-student@example.com");
    assert.equal(await page.locator("#studentName").innerText(), "光源");
    await page.fill("#observation", "我觀察到……");
    await page.click("#toDesign");
    assert.equal(await page.inputValue("#hypothesisPart"), "");
    assert.equal(await page.inputValue("#hypothesisOutcome"), "");
    await page.selectOption("#hypothesisPart", "頂端以下位置");
    await page.selectOption("#hypothesisOutcome", "bend");
    await page.fill("#reason", "光源");
    await page.selectOption("#comparison", "AD");
    for (const [key, values] of Object.entries({
      iv: [0],
      dv: [1],
      cv: [2, 3, 4, 5],
    }))
      for (const value of values)
        await page.check(`[data-variable=${key}][value="${value}"]`);
    for (const id of ["similar", "free", "temperature"])
      await page.check(`[data-assumption=${id}]`);
    await page.fill("#controlPlan", "向左彎曲");
    await page.fill("#setupDescription", "學生實驗裝置設計");
    await page.click("#saveTextSetup");
    const box = await page.locator("#setupCanvas").boundingBox();
    await page.mouse.move(box.x + 20, box.y + 25);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + 95);
    await page.mouse.up();
    await page.click("#saveDrawing");
    await page.evaluate(() => flushSync());
    await unchanged(page, () => switchLanguage(page, "zh"));
    assert.equal(
      await page.getAttribute("#observation", "placeholder"),
      "我觀察到……",
    );
    await unchanged(page, () => switchLanguage(page, "en"));
    assert.equal(await page.inputValue("#reason"), "光源");
    assert.equal(
      await page.inputValue("#setupDescription"),
      "學生實驗裝置設計",
    );
    assert.match(
      await page.locator("#variableChoices").innerText(),
      /the factor changed on purpose/,
    );
    assert.doesNotMatch(
      await page.locator("main").innerText(),
      /auxin|phototropism/i,
    );
    await page.click("#toExperiment");
    const original = await page.evaluate(() =>
      structuredClone(state.initialDesign),
    );
    assert.match(original.hypothesisText, /頂端以下位置/);
    assert.equal(original.form.reason, "光源");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.click("#runExperiment");
    const generation = await page.evaluate(() => runGeneration);
    const controlNode = await page.locator("#growth-A").elementHandle();
    await switchLanguage(page, "zh");
    await switchLanguage(page, "en");
    assert.equal(await page.evaluate(() => runGeneration), generation);
    assert(
      await controlNode.evaluate(
        (node) => node === document.querySelector("#growth-A"),
      ),
      "Switching cannot recreate the experiment controls",
    );
    await page.waitForFunction(() => hasRun);
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const id of ["A", "B", "C", "D"]) {
      await page.selectOption(
        `#growth-${id}`,
        id === "C" ? "reduced" : "clear",
      );
      await page.selectOption(
        `#obs-${id}`,
        ["A", "D"].includes(id) ? "left" : "straight",
      );
      await page.selectOption(
        `#position-${id}`,
        ["A", "D"].includes(id) ? "upper" : "none",
      );
    }
    await page.click("#recordData");
    await page.click("#toAnalysis");
    for (const [id, value] of await page.evaluate(() =>
      Object.entries(MAIN_ANSWERS),
    ))
      await page.selectOption(`#${id}`, value);
    await page.fill("#evidence", "頂端");
    await page.click("#toExtension");
    await page.selectOption("#extPrediction", "left");
    await page.fill("#extReason", "向右彎曲");
    await page.fill("#extFair", "瓊脂");
    await page.click("#runExtension");
    await page.waitForFunction(() => extensionHasRun);
    await page.locator("#ruler-G").fill("35");
    await page.click("#read-angle-G");
    for (const [id, model] of await page.evaluate(() =>
      Object.entries(EXT_MODEL),
    )) {
      await page.fill(`#ext-angle-${id}`, String(model.angle));
      await page.selectOption(`#ext-growth-${id}`, model.growth);
      await page.selectOption(`#ext-direction-${id}`, model.direction);
    }
    await page.evaluate(() => flushSync());
    await unchanged(page, () => switchLanguage(page, "zh"));
    await unchanged(page, () => switchLanguage(page, "en"));
    assert.equal(await page.inputValue("#ruler-G"), "35");
    await page.click("#confirmExtension");
    for (const [id, model] of await page.evaluate(() =>
      Object.entries(EXT_MODEL),
    )) {
      await page.fill(`#graph-angle-${id}`, String(model.angle));
      await page.selectOption(`#graph-direction-${id}`, model.direction);
    }
    await page.click("#saveGraph");
    for (const [id, value] of await page.evaluate(() =>
      Object.entries(EXT_ANSWERS),
    ))
      await page.selectOption(`#${id}`, value);
    await page.fill("#extEvidence", "向光性");
    await page.fill("#extControl", "保持較直");
    await noChineseSystem(page);
    await page.click("#submitInvestigation");
    assert.match(dialogs.at(-1).message, /After submission/);
    assert.deepEqual(await page.evaluate(() => state.initialDesign), original);
    assert.match(
      await page.locator("#learningCard").innerText(),
      /Auxin（生長素）/,
    );
    assert.match(
      await page.locator("#learningCard").innerText(),
      /hormone(?!（)/i,
    );
    assert.equal(
      await page
        .locator("#originalHypothesis [data-student-text]")
        .first()
        .innerText(),
      "光源",
    );
    await page.selectOption("#knowledgeName", "positive");
    await page.fill("#reflection", "我的理由");
    await page.click("#saveReflection");
    await page.evaluate(() => flushSync());
    await unchanged(page, () => switchLanguage(page, "zh"));
    await unchanged(page, () => switchLanguage(page, "en"));
    await page.evaluate(() => {
      window.print = () => {
        window.printedLanguage = document.documentElement.lang;
        window.printedHTML = document.querySelector("#printReport").innerHTML;
      };
    });
    await page.click("#downloadPDF");
    assert.equal(await page.evaluate(() => window.printedLanguage), "en");
    await noChineseSystem(page, "#printReport");
    assert.match(
      await page.locator("#printReport").innerText(),
      /Reference answer/,
    );
    const studentAnswers = await page
      .locator("#printReport [data-student-text]")
      .allTextContents();
    for (const value of [
      "我觀察到……",
      "光源",
      "向左彎曲",
      "學生實驗裝置設計",
      "頂端",
      "向右彎曲",
      "瓊脂",
      "向光性",
      "保持較直",
      "我的理由",
    ])
      assert(studentAnswers.includes(value), `PDF must preserve ${value}`);
    assert(
      await page.evaluate(
        () =>
          document.querySelector("#printReport .mechanism-svg").outerHTML ===
          document.querySelector("#mechanismDiagram svg").outerHTML,
      ),
    );
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: "/tmp/vl3-language-emi.pdf",
      format: "A4",
      printBackground: true,
    });
    await page.emulateMedia({ media: "screen" });
    await page
      .locator("#mechanismDiagram")
      .screenshot({ path: "/tmp/vl3-language-mechanism.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const stage of [1, 2, 3, 4]) {
      await page.evaluate((stage) => phase(stage), stage);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `English stage ${stage} must fit a phone`,
      );
      await noChineseSystem(page);
    }
    await page
      .locator("#extensionResults")
      .screenshot({ path: "/tmp/vl3-language-extension-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await switchLanguage(page, "zh");
    await page.click("#downloadPDF");
    assert.match(await page.locator("#printReport").innerText(), /參考答案/);
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: "/tmp/vl3-language-cmi.pdf",
      format: "A4",
      printBackground: true,
    });
    await page.emulateMedia({ media: "screen" });
    const studentId = await page.evaluate(() => state.id);
    await page.evaluate(() => flushSync());
    await page.context().close();
    const teacher = await newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await teacher.goto(base);
    await login(teacher, "教師", "tzechingchan0605@gmail.com");
    const password = await fs.readFile(
      process.env.VL3_TEST_PASSWORD_FILE,
      "utf8",
    );
    await teacher.fill("#teacherPassword", password);
    await teacher.click("#teacherLogin button[type=submit]");
    await teacher.waitForFunction(
      () => document.querySelector("#teacherLogin").hidden,
    );
    await saveExcel(teacher, "/tmp/vl3-language-cmi.xlsx");
    await unchanged(teacher, () =>
      switchLanguage(teacher, "en", "#teacherDialog [data-language-switch]"),
    );
    await noChineseSystem(teacher);
    await saveExcel(teacher, "/tmp/vl3-language-emi.xlsx");
    assert.deepEqual(
      await fs.readFile("/tmp/vl3-language-emi.xlsx"),
      await fs.readFile("/tmp/vl3-language-cmi.xlsx"),
      "Actual XLSX bytes, Chinese labels, original answers, scores, formulas and embedded images must match in both languages",
    );
    const cloudRecord = await teacher.evaluate(
      (id) => sharedRecords.find((r) => r.id === id),
      studentId,
    );
    assert.equal(cloudRecord.form.reason, "光源");
    assert.equal(cloudRecord.form.reflection, "我的理由");
    assert.equal(cloudRecord.initialDesign.form.hypothesisPart, "頂端以下位置");
    assert.equal(cloudRecord.extension.initialPrediction.reason, "向右彎曲");
    const beforeDemo = await teacher.evaluate(() =>
      JSON.stringify(sharedRecords),
    );
    await teacher.click("#teacherDemo");
    await unchanged(teacher, () => switchLanguage(teacher, "zh"));
    await unchanged(teacher, () => switchLanguage(teacher, "en"));
    await teacher.fill("#observation", "示範原文");
    await teacher.evaluate(() => {
      save();
      return flushSync();
    });
    assert.equal(await teacher.evaluate(() => state.events.length), 0);
    await teacher.click("#teacherButton");
    await teacher.waitForFunction(
      () => document.querySelector("#teacherLogin").hidden,
    );
    assert.equal(
      await teacher.evaluate(() => JSON.stringify(sharedRecords)),
      beforeDemo,
    );
    await teacher.context().close();
    const phone = await newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      deviceScaleFactor: 1,
    });
    await phone.goto(base);
    await switchLanguage(phone, "en", "#profileDialog [data-language-switch]");
    assert(
      await phone.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await login(phone, "手機原文", "language-phone@example.com");
    await phone.fill("#observation", "手机不翻译");
    await phone.click("#toDesign");
    await phone.evaluate(() => flushSync());
    await phone.context().setOffline(true);
    await phone.fill("#reason", "offline 原文");
    const backup = await phone.evaluate(() => {
      save();
      return localStorage.getItem("phototropismLab.appsScriptSync.v1");
    });
    await unchanged(phone, () => switchLanguage(phone, "zh"));
    await unchanged(phone, () => switchLanguage(phone, "en"));
    assert.equal(
      await phone.evaluate(() =>
        localStorage.getItem("phototropismLab.appsScriptSync.v1"),
      ),
      backup,
    );
    assert(
      await phone.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await phone.screenshot({ path: "/tmp/vl3-language-mobile.png" });
    await phone.context().setOffline(false);
    await phone.evaluate(() => flushSync());
    const dialogsBeforeReload = dialogs.length;
    await phone.reload();
    assert(
      dialogs.slice(dialogsBeforeReload).some((d) => d.type === "beforeunload"),
    );
    assert.equal(await phone.evaluate(() => VL3Language.current), "zh");
    assert.equal(await phone.inputValue("#profileName"), "");
    assert.equal(
      await phone.getAttribute("#observation", "placeholder"),
      "我觀察到……",
    );
    assert.equal(
      await phone.evaluate(() => records().at(-1).form.reason),
      "offline 原文",
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(
      external,
      [],
      "Tests must never contact production Google or any external collector",
    );
    console.log(
      "PASS (ISOLATED): direct Chinese/English switching without dialogs, full system text and all placeholders, six approved support terms, unaltered student text/state/canvas/options/locks/originals/events/time, running animations, translated actual PDFs, byte-identical Chinese XLSX/images/formulas, teacher demonstration isolation, phone, offline outbox/retry and Chinese reload default. No production requests.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
