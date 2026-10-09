const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const base = process.env.LAB_URL || "http://127.0.0.1:8001";
async function login(p, name, email) {
  await p.fill("#profileName", name);
  await p.fill("#profileClass", "S4A-05");
  await p.fill("#profileEmail", email);
  await p.click("#profileForm button");
}
async function authenticate(p) {
  await p.fill(
    "#teacherPassword",
    (
      await fs.readFile(
        process.env.VL3_TEST_PASSWORD_FILE || ".data/teacher-password",
        "utf8",
      )
    ).trim(),
  );
  await p.click("#teacherLogin button");
  await p.waitForFunction(() => document.querySelector("#teacherLogin").hidden);
}
async function reminder(p, button, text, focusId) {
  await p.click(button);
  assert(await p.locator("#toast.show").isVisible());
  assert.match(await p.locator("#toast").innerText(), text);
  if (focusId)
    assert.equal(await p.evaluate(() => document.activeElement.id), focusId);
}
async function flow(p, student = true) {
  assert.doesNotMatch(await p.locator("main").innerText(), /向光性|生長素/);
  assert.equal(
    (await p.locator("h1").innerText()).replace(/\s/g, ""),
    "幼芽為甚麼向光生長？",
  );
  assert.doesNotMatch(
    await p
      .locator("#phase-1,#phase-2,#phase-3,#phase-4")
      .allTextContents()
      .then((texts) => texts.join("")),
    /幼芽/,
  );
  const contextLengths = await p.evaluate(() =>
    ["before", "after"].map((id) =>
      document
        .querySelector(`#contextPlant [data-stem="${id}"]`)
        .getTotalLength(),
    ),
  );
  assert(
    contextLengths[0] < contextLengths[1],
    "The initial coleoptile must be shorter than the grown one",
  );
  await reminder(p, "#toDesign", /請先完成初步觀察/, "observation");
  assert(await p.locator("#phase-1").isVisible());
  await p.fill("#observation", "窗邊幼苗下部直立，上部朝窗戶彎曲。");
  assert.equal(await p.locator("#initialIdea").count(), 0);
  await p.click("#toDesign");
  assert(await p.locator("#phase-2").isVisible());
  await p.waitForFunction(() => window.scrollY === 0);
  assert.equal(await p.inputValue("#hypothesisPart"), "");
  assert.equal(await p.inputValue("#hypothesisOutcome"), "");
  const hint = p.locator("#assumptionDefinition");
  assert.equal(
    await hint.innerText(),
    "提示：假設是指在沒有直接證據或未經證實的情況下，為了進行探究而先行設定為「正確」的預設條件。",
  );
  assert(
    await hint.evaluate(
      (el) =>
        parseFloat(getComputedStyle(el).fontSize) <
        parseFloat(getComputedStyle(el.previousElementSibling).fontSize),
    ),
  );
  await reminder(
    p,
    "#toExperiment",
    /假說部位、預期反應及理由/,
    "hypothesisPart",
  );
  assert.equal(await p.evaluate(() => state.initialDesign), null);
  assert.deepEqual(
    await p.locator("#hypothesisPart option").allTextContents(),
    ["請選擇", "頂端", "頂端以下位置"],
  );
  await p.selectOption("#hypothesisPart", "頂端以下位置");
  assert.match(
    await p.locator(".hypothesis-sentence").innerText(),
    /而其他部位仍然受光/,
  );
  await p.selectOption("#hypothesisPart", "頂端");
  await p.selectOption("#hypothesisOutcome", "bend");
  await p.fill("#reason", "若上方只是被動生長，遮光後可能仍向光彎曲。");
  assert.equal(await p.locator("#comparison").count(), 0);
  await reminder(p, "#toExperiment", /三類變量/);
  for (const [g, ids] of Object.entries({ iv: [0], dv: [1], cv: [2, 3, 4, 5] }))
    for (const id of ids)
      await p.locator(`[data-variable=${g}][value="${id}"]`).check();
  assert.equal(await p.evaluate(() => VARIABLES[0]), "遮光處理");
  await reminder(p, "#toExperiment", /實驗前提/);
  for (const id of ["similar", "free", "temperature"])
    await p.locator(`[data-assumption=${id}]`).check();
  await reminder(p, "#toExperiment", /對照組設計/, "controlPlan");
  await p.fill(
    "#controlPlan",
    "保留A完整不遮蓋；每項比較保持光照、時間、供水、溫度、種類及處理前大小相近。",
  );
  await p.fill(
    "#setupDescription",
    "A完整 B不透光帽 D下部長遮光套；左側光照，帽及套留足空間。",
  );
  await reminder(p, "#toExperiment", /已儲存的裝置設計/);
  await p.click("#saveDrawing");
  const b = await p.locator("#setupCanvas").boundingBox();
  await p.mouse.move(b.x + 20, b.y + 30);
  await p.mouse.down();
  await p.mouse.move(b.x + 100, b.y + 100);
  await p.mouse.up();
  await p.click("#saveDrawing");
  await p.click("#toExperiment");
  assert(await p.locator("#phase-3").isVisible());
  assert.equal(await p.evaluate(() => state.experimentVersion), 14);
  assert.deepEqual(await p.evaluate(() => MAIN_IDS), ["A", "B", "D"]);
  assert.equal(await p.locator("#bench .specimen").count(), 3);
  assert.equal(await p.locator("#growth-C").count(), 0);
  assert.equal(await p.locator('[id^="position-"]').count(), 0);
  assert.match(await p.locator("#bench").innerText(), /B · 頂端遮光/);
  assert.equal(await p.locator("#bench select").count(), 3);
  assert.equal(await p.locator("#growth-A").count(), 0);
  assert.match(await p.locator("#bench").innerText(), /C · 頂端以下位置遮光/);
  assert.equal(await p.locator("#qSites,#qLimit").count(), 0);
  assert.doesNotMatch(
    await p.locator("#phase-2").innerText(),
    /頂端是否存在|切去頂端|A.?C/,
  );
  const original = await p.evaluate(() => structuredClone(state.initialDesign));
  assert.match(original.hypothesisText, /頂端.*仍向光彎曲/);
  assert.match(original.hypothesisText, /而其他部位仍然受光/);
  await p.click('[data-back="2"]');
  await p.selectOption("#hypothesisOutcome", "straight");
  await p.fill("#reason", "修訂：頂端可能感受光。");
  await p.click("#toExperiment");
  assert.deepEqual(await p.evaluate(() => state.initialDesign), original);
  assert(await p.locator("#recordData").isDisabled());
  const before = await p.evaluate(() =>
    Object.fromEntries(MAIN_IDS.map((id) => [id, seedling(id, 0)])),
  );
  await p.emulateMedia({ reducedMotion: "no-preference" });
  await p.click("#runExperiment");
  assert(await p.locator("#recordData").isDisabled());
  await p.waitForFunction(() => hasRun);
  await p.emulateMedia({ reducedMotion: "reduce" });
  const after = await p.evaluate(() =>
    Object.fromEntries(MAIN_IDS.map((id) => [id, seedling(id, 1)])),
  );
  for (const id of ["A", "B", "D"]) assert.notEqual(before[id], after[id]);
  assert.match(after.A, /M130 207 L130 150/);
  assert.match(after.A, /translate\(270 0\) scale\(-1 1\)/);
  assert.match(after.D, /data-sleeve/);
  assert.doesNotMatch(await p.locator("#equipmentBank").innerText(), /剪刀/);
  assert.doesNotMatch(
    await p.locator("#equipmentBank").innerText(),
    /培養容器/,
  );
  assert.match(await p.locator("#equipmentBank").innerText(), /計時工具/);
  assert.match(await p.locator("#equipmentBank").innerText(), /單側光源 × 3/);
  assert.match(await p.locator("#equipmentBank").innerText(), /直尺 × 1/);
  assert.equal(await p.locator("#equipmentBank .equipment").count(), 6);
  await reminder(p, "#recordData", /三組的彎曲方向/, "obs-A");
  assert.equal(await p.evaluate(() => state.firstObservations), null);
  for (const id of ["A", "B", "D"]) {
    await p.selectOption(
      "#obs-" + id,
      ["A", "D"].includes(id) ? "left" : "straight",
    );
  }
  await p.selectOption("#obs-D", "straight");
  await p.click("#recordData");
  await p.selectOption("#obs-D", "left");
  await p.click("#recordData");
  assert.equal(
    await p.evaluate(() => state.firstObservations.D.direction),
    "straight",
  );
  assert.equal(await p.evaluate(() => state.observations.D.direction), "left");
  if (student)
    await p.screenshot({ path: "/tmp/vl3-experiment.png", fullPage: true });
  await p.click("#toAnalysis");
  await reminder(p, "#toExtension", /三項推論/, "qTip");
  assert(await p.locator("#learningReveal").isHidden());
  await p.click("#toExtension");
  assert(await p.locator("#tipSection").isHidden());
  assert(await p.locator("#extensionSection").isHidden());
  for (const [id, v] of Object.entries({
    qTip: "tip",
    qShade: "lessBend",
    qBelow: "bend",
  }))
    await p.selectOption("#" + id, v);
  assert.equal(await p.locator("#evidence").count(), 0);
  assert.doesNotMatch(
    await p.locator("#conclusionForm").innerText(),
    /生長素|向光性/,
  );
  await p.click("#submitInvestigation");
  assert(await p.locator("#learningReveal").isHidden());
  await p.click("#toExtension");
  assert(await p.locator("#tipSection").isVisible());
  assert.doesNotMatch(await p.locator("#tipSection").innerText(), /延伸一材料|唯一獨立變量/);
  assert.equal(await p.locator("#tipFair,#tipLimit").count(), 0);
  assert.deepEqual(
    await p.locator("#tip-growth-A option").allTextContents(),
    ["請選擇", "有", "沒有"],
  );
  assert.doesNotMatch(await p.locator("#qCap").innerText(), /向光/);
  assert(await p.locator("#extensionSection").isHidden());
  await reminder(
    p,
    "#runTipExperiment",
    /預測.*理由/,
    "tipPrediction",
  );
  assert.equal(await p.evaluate(() => tipHasRun), false);
  await p.selectOption("#tipPrediction", "same");
  await p.fill("#tipReason", "我預測沒有頂端也可同樣延長。");
  await p.emulateMedia({ reducedMotion: "no-preference" });
  await p.click("#runTipExperiment");
  assert(await p.locator("#confirmTipObservations").isDisabled());
  await p.waitForFunction(() => Math.abs(document.querySelector("#tipResults").getBoundingClientRect().top) < 5);
  await p.waitForFunction(() => tipHasRun);
  await p.emulateMedia({ reducedMotion: "reduce" });
  const tipOriginal = await p.evaluate(() =>
    structuredClone(state.tipInquiry.initialPrediction),
  );
  await p.selectOption("#tipPrediction", "less");
  await p.fill("#tipReason", "修訂：頂端可能提供生長訊號。");
  assert.deepEqual(
    await p.evaluate(() => state.tipInquiry.initialPrediction),
    tipOriginal,
  );
  assert.match(await p.locator("#tip-plant-C").innerHTML(), /data-cut-surface/);
  const cutPaths = await p.evaluate(() =>
    [0, 0.5, 1].map((progress) => {
      const svg = new DOMParser().parseFromString(
        seedling("C", progress),
        "image/svg+xml",
      );
      return svg.querySelector('[data-stem="C"]').getAttribute("d");
    }),
  );
  assert(
    cutPaths.every((path) => path === cutPaths[0]),
    "C must keep its length throughout the tip animation",
  );
  await reminder(p, "#confirmTipObservations", /延長表現/, "tip-growth-A");
  assert.equal(
    await p.evaluate(() => state.tipInquiry.firstObservations),
    null,
  );
  for (const id of ["A", "C"]) {
    await p.selectOption(`#tip-growth-${id}`, id === "C" ? "none" : "clear");
  }
  await p.click("#confirmTipObservations");
  assert.equal(await p.locator('[id^="tip-direction-"]').count(), 0);
  await p.selectOption("#tipView", "before");
  assert.match(await p.locator("#tip-plant-A").innerHTML(), /開始時/);
  await p.selectOption("#tipView", "after");
  await reminder(p, "#toAgar", /分析|推論|證據/, "qCap");
  assert(await p.locator("#extensionSection").isHidden());
  for (const [id, value] of Object.entries({
    qCap: "tipRole",
  }))
    await p.selectOption(`#${id}`, value);
  assert.equal(await p.locator("#tipEvidence,#substancePrediction").count(), 0);
  assert.doesNotMatch(await p.locator("main").innerText(), /生長素|向光性/);
  await reminder(p, "#submitInvestigation", /延伸/, "toAgar");
  assert(await p.locator("#learningReveal").isHidden());
  await p.click("#toAgar");
  assert(await p.locator("#agarTransition").isVisible());
  assert.equal(await p.locator("#agarTransition").innerText(), "頂端可能產生能向下傳遞的物質 X，促進下方延長；這個想法仍需測試。");
  const firstTipAnalysis = await p.evaluate(() =>
    structuredClone(state.tipInquiry.firstAnalysis),
  );
  await p.selectOption("#qCap", "noEffect");
  await p.click("#toAgar");
  assert.deepEqual(
    await p.evaluate(() => state.tipInquiry.firstAnalysis),
    firstTipAnalysis,
  );
  await p.selectOption("#qCap", "tipRole");
  assert(await p.locator("#extensionSection").isVisible());
  await reminder(
    p,
    "#runExtension",
    /延伸預測及理由/,
    "extPrediction",
  );
  assert.equal(await p.evaluate(() => extensionHasRun), false);
  await p.selectOption("#extPrediction", "left");
  await p.fill("#extReason", "我預測接觸瓊脂的一側會向該側生長。");
  assert.equal(await p.locator("#extFair,#angleExample").count(), 0);
  await p.emulateMedia({ reducedMotion: "no-preference" });
  await p.click("#runExtension");
  assert(await p.locator("#confirmExtension").isDisabled());
  await p.waitForFunction(() => extensionHasRun);
  const agar = await p.locator("[data-agar-block]").evaluateAll(blocks => blocks.map(block => {
    const matrix = block.transform.baseVal.consolidate().matrix;
    return { angle: Math.round(Math.atan2(matrix.b, matrix.a) * 180 / Math.PI), width: Number(block.querySelector("rect").getAttribute("width")) };
  }));
  assert.deepEqual(agar, [{angle:0,width:18},{angle:0,width:18},{angle:35,width:18},{angle:-35,width:18}]);
  await p.emulateMedia({ reducedMotion: "reduce" });
  const extOriginal = await p.evaluate(() =>
    structuredClone(state.extension.initialPrediction),
  );
  await p.selectOption("#extPrediction", "right");
  await p.fill("#extReason", "修訂：左側延長較多可能向右彎曲。");
  assert.deepEqual(
    await p.evaluate(() => state.extension.initialPrediction),
    extOriginal,
  );
  await reminder(p, "#confirmExtension", /四組角度/, "ext-angle-E");
  assert.equal(await p.evaluate(() => state.extension.firstReadings), null);
  for (const id of ["E", "F", "G", "H"]) {
    const angle = id === "G" ? 30 : id === "H" ? -35 : 0;
    await p.locator("#ruler-" + id).fill(String(angle));
    await p.click("#read-angle-" + id);
    assert.equal(
      await p.inputValue("#ext-angle-" + id),
      String(Math.abs(angle)),
    );
    await p.selectOption(
      "#ext-direction-" + id,
      id === "G" ? "right" : id === "H" ? "left" : "straight",
    );
  }
  const pointer = await p.locator('#ext-plant-G [data-protractor-pointer]').getAttribute('d');
  const coordinates = pointer.match(/-?[\d.]+/g).map(Number);
  assert(Math.abs(Math.hypot(coordinates[2] - coordinates[0], coordinates[3] - coordinates[1]) - 168) < 0.01);
  await p.click("#confirmExtension");
  assert.equal(await p.locator("#saveGraph,#graphInputs,#barChart").count(), 0);
  assert.equal(
    await p.evaluate(() => state.extension.firstReadings.readings.G.angle),
    30,
  );
  await p.locator("#ruler-G").fill("35");
  await p.click("#read-angle-G");
  await p.click("#confirmExtension");
  assert.equal(
    await p.evaluate(() => state.extension.firstReadings.readings.G.angle),
    30,
  );
  assert.equal(await p.evaluate(() => state.extension.readings.G.angle), 35);
  await p.selectOption("#extensionView", "before");
  assert.match(await p.locator("#ext-plant-G").innerHTML(), /開始時/);
  await p.selectOption("#extensionView", "after");
  await reminder(p, "#submitInvestigation", /延伸分析/, "extEF");
  for (const [id, v] of Object.entries({
    extEF: "transfer",
    extPosition: "position",
    extSides: "opposite",
  }))
    await p.selectOption("#" + id, v);
  await reminder(p, "#submitInvestigation", /單側光與物質 X 的推論/, "extLightInference");
  await p.fill("#extLightInference", "單側光可能使物質X移向背光側並向下傳遞；背光側延長較多，因此向光彎曲。");
  assert.equal(await p.locator("#extDark,#extLimit,#extEvidence,#extControl").count(), 0);
  assert.doesNotMatch(await p.locator("main").innerText(), /生長素|向光性/);
  await p.click("#submitInvestigation");
  assert(await p.locator("#learningReveal").isVisible());
  await p.waitForFunction(() =>
    Math.abs(document.querySelector("#learningCard").getBoundingClientRect().top) < 2,
  );
  assert(await p.locator("#qTip").isDisabled());
  assert(await p.locator("#tipPrediction").isDisabled());
  assert(await p.locator("#qCap").isDisabled());
  assert(await p.locator("#extPrediction").isDisabled());
  assert.match(await p.locator("#originalHypothesis").innerText(), /向左彎曲/);
  assert.match(
    await p.locator("#originalHypothesis").innerText(),
    /仍向光彎曲/,
  );
  assert.match(
    await p.locator("#originalHypothesis").innerText(),
    /沒有頂端也可同樣延長/,
  );
  assert(await p.locator("#downloadPDF").isDisabled());
  assert.equal(await p.locator("#knowledgeName,#referenceDesign").count(), 0);
  assert(await p.locator("#downloadPDF").isDisabled());
  await reminder(p, "#saveReflection", /學習反思/, "reflection");
  await p.fill(
    "#reflection",
    "主探究原始假說需要修訂：A與B表明頂端遮光後仍延長但沒有明顯向光彎曲，支持頂端感光。延伸1原預測需要修訂：A延長而C沒有明顯延長，頂端可能產生促進生長的物質X。延伸2原預測方向不符：G與H顯示左側延長較多向右彎曲。生長素是生長激素，頂端的生長訊號可向下傳遞；光照下右側背光側細胞延長較多使幼芽向左彎曲，屬正向光性。這些實驗沒有直接鑑定物質或測量光照下分布。",
  );
  await p.click("#saveReflection");
  assert(await p.locator("#reflection").isDisabled());
  assert(await p.locator("#downloadPDF").isEnabled());
  await p.evaluate(() => {
    window.print = () => {
      window.printCalled = true;
      window.printTitle = document.title;
    };
  });
  await p.click("#downloadPDF");
  assert(await p.evaluate(() => window.printCalled));
  assert.match(
    await p.evaluate(() => window.printTitle),
    /^VL3_幼芽為甚麼向光生長_S4A-05_/,
  );
  const report = await p.locator("#printReport").innerHTML();
  assert.match(report, /首次確認讀數/);
  assert.match(report, /參考答案/);
  assert.match(report, /參考說明/);
  assert.match(report, /✓/);
  assert.doesNotMatch(report, /整體分數|SPS 總分/);
  assert.doesNotMatch(report, /初步想法/);
  assert.match(
    await p.evaluate(() =>
      newReport({
        ...state,
        form: { ...state.form, initialIdea: "舊版初步想法" },
      }),
    ),
    /舊版初步想法/,
  );
  assert.equal(
    await p.evaluate(
      () =>
        document.querySelector("#printReport .mechanism-svg").outerHTML ===
        document.querySelector("#mechanismDiagram svg").outerHTML,
    ),
    true,
  );
  if (student) {
    await fs.writeFile(
      "/tmp/vl3-record.json",
      await p.evaluate(() =>
        JSON.stringify({ moduleId: MODULE_ID, records: [state] }),
      ),
    );
    await p.emulateMedia({ media: "print" });
    await p.pdf({
      path: "/tmp/vl3-report.pdf",
      format: "A4",
      printBackground: true,
    });
    await p.emulateMedia({ media: "screen" });
    const check = await p.evaluate(() => {
      const r = structuredClone(state);
      r.extension.readings.G.angle = 30;
      return { angle: angleScore(r), graph: graphScore(r) };
    });
    assert.deepEqual(check, { angle: 1.5, graph: null });
  }
  return await p.evaluate(() => structuredClone(state));
}
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  });
  try {
    const p = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce",
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    await p.goto(base);
    assert.equal(await p.evaluate(() => graphScore(fresh())), null);
    await login(p, "陳小明", "student@example.com");
    const final = await flow(p);
    assert(final.finalAnswers.tipInquiry);
    assert(final.finalAnswers.extension);
    assert.deepEqual(Object.keys(final.observations), ["A", "B", "D"]);
    for (const observation of Object.values(final.observations))
      assert.deepEqual(Object.keys(observation), ["direction"]);
    assert.equal(final.tipInquiry.initialPrediction.prediction, "same");
    assert.equal(
      final.tipInquiry.firstObservations.observations.C.growth,
      "none",
    );
    assert.deepEqual(final.finalAnswers.tipInquiry, final.tipInquiry);
    assert.equal(final.extension.initialPrediction.prediction, "left");
    assert.deepEqual(
      await p.evaluate(() => {
        const mainOnly = structuredClone(state),
          tipOnly = structuredClone(state);
        mainOnly.tipInquiry.observations = {};
        tipOnly.observations = {};
        return {
          all: mainObservationScore(state),
          main: mainObservationScore(mainOnly),
          tip: mainObservationScore(tipOnly),
          inferences: inferenceScore(state),
        };
      }),
      { all: 2, main: 1, tip: 1, inferences: 2 },
    );
    assert(final.reflectionSubmittedAt);
    assert(await p.evaluate(() => flushSync()));
    await p.click("#newSession");
    assert.equal(await p.inputValue("#hypothesisPart"), "");
    assert.equal(await p.evaluate(() => extensionRunning), false);
    assert.equal(await p.evaluate(() => tipRunning), false);
    assert.equal(await p.evaluate(() => tipHasRun), false);
    assert.equal(
      await p.evaluate(() => state.tipInquiry.initialPrediction),
      null,
    );
    assert.deepEqual(await p.evaluate(() => state.tipInquiry.observations), {});
    assert(await p.locator("#tipSection").isHidden());
    assert.equal(await p.locator("#barChart").count(), 0);
    await login(p, "教師", "tzechingchan0605@gmail.com");
    await authenticate(p);
    assert.match(await p.locator("#teacherRows").innerText(), /陳小明/);
    const x = p.waitForEvent("download");
    await p.click("#exportExcel");
    await (await x).saveAs("/tmp/vl3-records.xlsx");
    const legacy = await p.evaluate(() => {
      const r = structuredClone(records()[0]);
      delete r.experimentVersion;
      r.form.qCap = "light";
      r.observations = { A: "bend", B: "straight", C: "bend", D: "bend" };
      r.assumptions = ["similar", "free", "light"];
      return {
        valid: valid(r),
        label: groupDefinitions(r).C.label,
        score: mainObservationScore(r),
        report: report(r).includes("頂端透明罩"),
      };
    });
    assert.deepEqual(legacy, {
      valid: true,
      label: "頂端透明罩",
      score: 2,
      report: true,
    });
    const version5 = await p.evaluate(() => {
      const r = structuredClone(records()[0]);
      r.experimentVersion = 5;
      r.form.qSites = "different";
      r.form.qLimit = "indirect";
      for (const id of ["A", "B", "D"])
        r.observations[id] = mainModel(id, r);
      for (const id of TIP_IDS) r.tipInquiry.observations[id] = tipModel(id, r);
      return {
        score: mainObservationScore(r),
        mainLabels: MAIN_IDS.map((id) => sampleName(id, r)),
        tipLabels: TIP_IDS.map((id) => sampleName(id, r)),
        questions: Object.keys(mainAnswersFor(r)).length,
        deletedQuestionRetained: newReport(r).includes("感光部位與彎曲部位是否一定相同"),
      };
    });
    assert.deepEqual(version5, {
      score: 2,
      mainLabels: ["A", "B", "D"],
      tipLabels: ["A", "C"],
      questions: 5,
      deletedQuestionRetained: true,
    });
    const version3 = await p.evaluate(() => {
      const r = structuredClone(records()[0]);
      r.experimentVersion = 3;
      delete r.form.extLightInference;
      for (const id of ["A", "B", "D"])
        Object.assign(r.observations[id], mainModel(id, r));
      r.form.comparison = "AB";
      r.initialDesign.form.comparison = "AB";
      r.observations.C = {
        growth: "reduced",
        direction: "straight",
        position: "none",
      };
      return {
        valid: valid(r),
        growth: mainModel("C", r).growth,
        score: mainObservationScore(r),
        oldComparison: newReport(r).includes("A 與 B：頂端遮光處理"),
        oldModel: newReport(r).includes("C 的延長減少是本模型設定"),
      };
    });
    assert.deepEqual(version3, {
      valid: true,
      growth: "reduced",
      score: 2,
      oldComparison: true,
      oldModel: true,
    });
    const version4 = await p.evaluate(() => {
      const r = structuredClone(records()[0]);
      r.experimentVersion = 4;
      delete r.form.extLightInference;
      for (const id of ["A", "B", "D"])
        Object.assign(r.observations[id], mainModel(id, r));
      r.observations.C = {
        growth: "none",
        direction: "straight",
        position: "none",
      };
      r.firstObservations.C = structuredClone(r.observations.C);
      delete r.tipInquiry;
      delete r.finalAnswers.tipInquiry;
      for (const key of [
        "tipPrediction",
        "tipReason",
        "tipFair",
        "tipLimit",
        "substancePrediction",
        "tipEvidence",
      ])
        delete r.form[key];
      const html = newReport(r);
      return {
        valid: valid(r),
        groups: Object.keys(groupDefinitions(r)),
        label: groupDefinitions(r).C.label,
        growth: mainModel("C", r).growth,
        score: mainObservationScore(r),
        cutReference: html.includes("C 在本教學模型中不延長"),
        analysis: html.includes("A 與 C"),
        cutLimit: html.includes("切頂也移除其他組織並造成傷口"),
        originalVariable: html.includes("遮光處理／部位或頂端是否存在"),
        fabricatedExtension: html.includes("延伸一原始預測"),
      };
    });
    assert.deepEqual(version4, {
      valid: true,
      groups: ["A", "B", "C", "D"],
      label: "切去頂端",
      growth: "none",
      score: 2,
      cutReference: true,
      analysis: true,
      cutLimit: true,
      originalVariable: true,
      fabricatedExtension: false,
    });
    const teacher = await browser.newPage();
    teacher.on("dialog", (d) => d.accept());
    teacher.on("pageerror", (e) => errors.push(e.message));
    await teacher.goto(base);
    await login(teacher, "教師", "tzechingchan0605@gmail.com");
    await authenticate(teacher);
    assert.equal(await teacher.evaluate(() => records().length), 0);
    assert.match(await teacher.locator("#teacherRows").innerText(), /陳小明/);
    await teacher
      .locator("#importRecords")
      .setInputFiles("/tmp/vl3-record.json");
    await teacher.waitForFunction(() => sharedRecords.length === 1);
    await teacher
      .locator("#importRecords")
      .setInputFiles("/tmp/vl3-record.json");
    assert.equal(await teacher.evaluate(() => sharedRecords.length), 1);
    const phone = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    phone.on("dialog", (d) => d.accept());
    phone.on("pageerror", (e) => errors.push(e.message));
    await phone.goto(base);
    await login(phone, "李同學", "phone-student@example.com");
    await phone.fill("#observation", "手機瀏覽器的答案。");
    assert(await phone.evaluate(() => flushSync()));
    await teacher.click("#refreshTeacher");
    await teacher.waitForFunction(() => sharedRecords.length === 2);
    const multi = teacher.waitForEvent("download");
    await teacher.click("#exportExcel");
    await (await multi).saveAs("/tmp/vl3-multi.xlsx");
    await phone.context().setOffline(true);
    await phone.fill("#observation", "離線補傳答案。");
    assert.equal(await phone.evaluate(() => flushSync()), false);
    await phone.context().setOffline(false);
    assert(await phone.evaluate(() => flushSync()));
    assert(
      await phone.evaluate(async () => {
        try {
          await cloudSync.list();
          return false;
        } catch {
          return true;
        }
      }),
    );
    await phone.reload();
    assert(await phone.locator("#profileDialog").isVisible());
    assert.equal(await phone.inputValue("#profileEmail"), "");
    assert.equal(await phone.evaluate(() => state.profile), null);
    assert.equal(await phone.evaluate(() => records().length), 1);
    await login(phone, "李同學", "phone-student@example.com");
    assert.equal(await phone.evaluate(() => records().length), 2);
    // Full teacher demonstration must not change student records, events or exports.
    const count = await p.evaluate(() => records().length);
    await p.click("#teacherDemo");
    await flow(p, false);
    assert.equal(await p.evaluate(() => records().length), count);
    assert.equal(await p.evaluate(() => state.events.length), 0);
    await p.evaluate(() => flushSync());
    await teacher.click("#refreshTeacher");
    await teacher.waitForFunction(() => sharedRecords.length === 3);
    assert(
      await teacher.evaluate(() =>
        sharedRecords.every(
          (r) => r.profile.email !== "tzechingchan0605@gmail.com",
        ),
      ),
    );
    await p.setViewportSize({ width: 390, height: 844 });
    for (const n of [1, 2, 3, 4]) {
      await p.evaluate((n) => phase(n), n);
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await p.evaluate(() => phase(4));
    await p
      .locator("#extensionResults")
      .screenshot({ path: "/tmp/vl3-extension-mobile.png" });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.evaluate(() => phase(1));
    await p.screenshot({ path: "/tmp/vl3-mobile.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: ABD main + AC tip + EFGH agar inquiry, sequential gates, three locked original predictions, first observations/readings/analysis, growth/directions, adjustable protractor, bar-chart consistency, delayed teaching reveal, reflection/PDF, real XLSX, cloud browsers, offline retries, reload login, separate attempts, version 1/3/4 compatibility, complete teacher demo exclusion and mobile layout.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
