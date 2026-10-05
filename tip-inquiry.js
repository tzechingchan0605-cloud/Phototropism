"use strict";
// Extension 1 changes only tip presence. The cut-tip result is a teaching-model setting.
const TIP_IDS = ["A", "C"];
const TIP_FIELDS = [
  "tipPrediction",
  "tipReason",
  "tipFair",
  "tipLimit",
  "substancePrediction",
  "tipEvidence",
];
const TIP_PREDICTIONS = {
  less: "伸長較少或沒有明顯伸長",
  same: "伸長表現相近",
  more: "伸長較多",
};
const TIP_ANSWERS = {
  qCap: "tipRole",
  tipLimit: "limited",
  substancePrediction: "possible",
};
let tipRunning = false,
  tipHasRun = false,
  tipGeneration = 0;
function threeStage(record) {
  return record.experimentVersion >= 5;
}
function freshTipInquiry() {
  return {
    unlocked: false,
    hasRun: false,
    initialPrediction: null,
    observations: {},
    firstObservations: null,
    firstAnalysis: null,
  };
}
function tipModel(id, record = state) {
  const model = mainModel(id, record);
  return { growth: model.growth, direction: model.direction };
}
function tipObservationComplete(observation) {
  return (
    !!observation &&
    !!GROWTH[observation.growth] &&
    !!DIRECTIONS[observation.direction]
  );
}
function tipObservationText(observation) {
  return observation
    ? [GROWTH[observation.growth], DIRECTIONS[observation.direction]]
        .filter(Boolean)
        .join("；")
    : "未記錄";
}
function tipTableHTML(observations = {}) {
  return `<div class="table-wrap"><table class="vl3-table"><thead><tr><th>裝置</th><th>處理</th><th>伸長表現及彎曲方向</th></tr></thead><tbody>${TIP_IDS.map((id) => `<tr><td>${id}</td><td>${GROUPS[id].label}</td><td>${esc(tipObservationText(observations[id]))}</td></tr>`).join("")}</tbody></table></div>`;
}
function initTipInquiry() {
  $("#tipSection").innerHTML = `
  <article class="vl3-card"><p class="card-kicker">04 · 延伸探究一</p><h3>頂端除了感受光照，是否也影響伸長？</h3>
  <p>遮光比較為感光部位提供了線索，但頂端是否還有其他作用？這次只改變「頂端是否存在」，比較完整的 A 與切去頂端的 C。</p>
  <p class="notice">唯一獨立變量：頂端是否存在。兩組接受相同左側光照；種類、處理前大小及生長狀況、培養時間、溫度及供水相同。</p>
  <p>延伸一材料：燕麥胚芽鞘 × 2、剪刀 × 1、單側光源 × 1、計時工具 × 1。</p>
  ${selectHTML("tipPrediction", TIP_PREDICTIONS, "", "切去頂端後，與完整胚芽鞘相比，你預測伸長表現如何？")}
  <label for="tipReason">我的理由</label><textarea id="tipReason" maxlength="1500"></textarea>
  <label for="tipFair">比較 A 與 C 時，除了頂端是否存在，哪些條件需要保持相同？</label><textarea id="tipFair" maxlength="1500"></textarea>
  <p class="muted">第一次開始前，固定保存延伸一的原始預測及理由。動畫及 24 小時均為教學模擬。</p>
  <button id="runTipExperiment" class="primary">進行頂端比較（模擬 24 小時）</button><p id="tipStatus" role="status">等待預測及公平比較</p></article>
  <article class="vl3-card" id="tipResults"><h3>A 與 C：初始及培養後的比較</h3>
  <label>查看狀態<select id="tipView"><option value="after">目前培養狀態</option><option value="before">培養開始時</option></select></label>
  <div id="tipBench" class="bench tip-bench"></div><button id="confirmTipObservations" class="primary">確認延伸一觀察</button><div id="tipObservationTable"></div></article>
  <article class="vl3-card" id="tipAnalysis"><h3>頂端與伸長：從比較提出新問題</h3>
  ${selectHTML("qCap", { tipRole: "頂端參與正常伸長及朝光反應。", noEffect: "頂端是否存在不影響伸長及朝光反應。" }, "", "1. A 與 C 的伸長及彎曲比較支持甚麼？")}
  ${selectHTML("tipLimit", { limited: "切頂同時移除組織並造成傷口，不能單靠這個比較確定頂端如何影響生長。", proof: "切頂後不伸長，就能確定頂端只負責感光。" }, "", "2. 這個比較有哪些推論限制？")}
  ${selectHTML("substancePrediction", { possible: "頂端可能產生能向下傳遞的物質 X，促進下方伸長；這個想法仍需測試。", proof: "單靠切頂結果，已能確定物質 X 的身分和作用方式。" }, "", "3. 哪個想法值得下一步測試？")}
  <label for="tipEvidence">引用 A 與 C 的觀察，說明頂端與伸長的關係，以及還不能確定的事情。</label><textarea id="tipEvidence" maxlength="2500"></textarea>
  <button id="toAgar" class="primary">測試物質 X：繼續延伸探究二 →</button></article>`;
  $("#runTipExperiment").onclick = runTipExperiment;
  $("#confirmTipObservations").onclick = confirmTipObservations;
  $("#tipView").onchange = () => {
    renderTipPlants();
    log("tip_view_changed", { view: $("#tipView").value });
  };
  $("#toAgar").onclick = () => {
    readForm();
    const missing = tipMissing();
    if (missing.length)
      return remind("請完成：" + missing.join("、"), tipReminderTarget());
    if (!state.tipInquiry.firstAnalysis)
      state.tipInquiry.firstAnalysis = {
        at: new Date().toISOString(),
        answers: Object.fromEntries(
          Object.keys(TIP_ANSWERS).map((key) => [key, state.form[key]]),
        ),
        evidence: state.form.tipEvidence,
      };
    state.extension.unlocked = true;
    $("#extensionSection").hidden = false;
    log("agar_extension_opened", {
      firstAnalysis: state.tipInquiry.firstAnalysis,
    });
    $("#extensionSection").scrollIntoView({
      block: "start",
      behavior: scrollBehavior(),
    });
  };
}
function resetTipInquiry() {
  tipGeneration++;
  tipRunning = false;
  tipHasRun = false;
  $("#tipSection").hidden = true;
  $("#tipView").value = "after";
  $("#tipStatus").textContent = "等待預測及公平比較";
  $("#tipObservationTable").innerHTML = "";
  renderTipBench();
}
function renderTipBench() {
  $("#tipBench").innerHTML = TIP_IDS.map(
    (id) =>
      `<article class="specimen"><h3>${id} · ${GROUPS[id].label}</h3><div id="tip-plant-${id}">${seedling(id)}</div>${selectHTML("tip-growth-" + id, GROWTH, state.tipInquiry.observations[id]?.growth, "伸長表現")}${selectHTML("tip-direction-" + id, DIRECTIONS, state.tipInquiry.observations[id]?.direction, "彎曲方向")}</article>`,
  ).join("");
  TIP_IDS.forEach((id) =>
    ["growth", "direction"].forEach((field) => {
      $("#tip-" + field + "-" + id).onchange = () =>
        log("tip_observation_selected", {
          group: id,
          field,
          value: $("#tip-" + field + "-" + id).value,
        });
    }),
  );
  renderTipPlants();
  lockTipInquiry();
}
function renderTipPlants(progress) {
  const p =
    progress ?? ($("#tipView").value === "before" ? 0 : tipHasRun ? 1 : 0);
  TIP_IDS.forEach((id) => {
    $("#tip-plant-" + id).innerHTML = seedling(id, p);
  });
}
function runTipExperiment() {
  if (tipRunning || state.submittedAt) return;
  readForm();
  if (
    !state.tipInquiry.unlocked ||
    firstEmptyField(["tipPrediction", "tipReason", "tipFair"])
  )
    return remind(
      "請完成延伸一預測、理由及公平比較。",
      firstEmptyField(["tipPrediction", "tipReason", "tipFair"]),
    );
  if (!state.tipInquiry.initialPrediction)
    state.tipInquiry.initialPrediction = {
      at: new Date().toISOString(),
      prediction: state.form.tipPrediction,
      reason: state.form.tipReason,
      fair: state.form.tipFair,
    };
  tipRunning = true;
  tipHasRun = false;
  $("#tipView").value = "after";
  const generation = ++tipGeneration;
  const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 100
    : 2400;
  const start = performance.now();
  $("#tipStatus").textContent = "頂端比較培養中（加速模型）";
  log("tip_experiment_started", {
    initialPrediction: state.tipInquiry.initialPrediction,
  });
  applyLock();
  function frame(now) {
    if (generation !== tipGeneration) return;
    const progress = Math.min(1, (now - start) / duration);
    renderTipPlants(progress);
    if (progress < 1) requestAnimationFrame(frame);
    else {
      tipRunning = false;
      tipHasRun = true;
      state.tipInquiry.hasRun = true;
      $("#tipStatus").textContent = "培養完成，請記錄 A 與 C 的觀察。";
      log("tip_experiment_completed");
      applyLock();
    }
  }
  requestAnimationFrame(frame);
}
function confirmTipObservations() {
  if (!tipHasRun || tipRunning || state.submittedAt) return;
  const observations = Object.fromEntries(
    TIP_IDS.map((id) => [
      id,
      {
        growth: $("#tip-growth-" + id).value,
        direction: $("#tip-direction-" + id).value,
      },
    ]),
  );
  if (!TIP_IDS.every((id) => tipObservationComplete(observations[id])))
    return remind(
      "請完成 A 與 C 的伸長及彎曲方向觀察。",
      firstEmptyField(
        TIP_IDS.flatMap((id) => ["tip-growth-" + id, "tip-direction-" + id]),
      ),
    );
  if (!state.tipInquiry.firstObservations)
    state.tipInquiry.firstObservations = {
      at: new Date().toISOString(),
      observations: clone(observations),
    };
  state.tipInquiry.observations = observations;
  $("#tipObservationTable").innerHTML = tipTableHTML(observations);
  log("tip_observations_confirmed", { observations });
  message("延伸一觀察已保存。請分析頂端與伸長的關係。");
}
function tipMissing() {
  const missing = [];
  if (
    !state.tipInquiry.unlocked ||
    !state.tipInquiry.initialPrediction ||
    !state.tipInquiry.hasRun
  )
    missing.push("延伸一預測及實驗");
  if (
    !TIP_IDS.every((id) =>
      tipObservationComplete(state.tipInquiry.observations[id]),
    )
  )
    missing.push("A 與 C 的已確認觀察");
  if (firstEmptyField([...Object.keys(TIP_ANSWERS), "tipEvidence"]))
    missing.push("延伸一分析及證據");
  return missing;
}
function tipReminderTarget() {
  if (!state.tipInquiry.unlocked) return "#toExtension";
  if (!state.tipInquiry.initialPrediction || !state.tipInquiry.hasRun)
    return (
      firstEmptyField(["tipPrediction", "tipReason", "tipFair"]) ||
      "#runTipExperiment"
    );
  if (
    !TIP_IDS.every((id) =>
      tipObservationComplete(state.tipInquiry.observations[id]),
    )
  )
    return "#confirmTipObservations";
  return firstEmptyField([...Object.keys(TIP_ANSWERS), "tipEvidence"]);
}
function lockTipInquiry() {
  const locked = !!state.submittedAt;
  $$(
    "#tipSection input,#tipSection select,#tipSection textarea,#tipSection button",
  ).forEach((el) => {
    el.disabled = locked;
  });
  $("#runTipExperiment").disabled = locked || tipRunning;
  $("#confirmTipObservations").disabled = locked || tipRunning || !tipHasRun;
  $$("#tipBench select").forEach((el) => {
    el.disabled = locked || tipRunning || !tipHasRun;
  });
  $("#tipView").disabled = locked || tipRunning;
  $("#toAgar").disabled = locked || tipRunning;
}
function tipReportHTML(record) {
  const inquiry = record.tipInquiry;
  const first = inquiry.initialPrediction;
  const open = (title, value, reference) =>
    reportAnswer(title, value, reference, null, true);
  return `<section class="report-card"><h2>04 · 延伸探究一：頂端與伸長</h2>
  ${reportAnswer("延伸一原始預測", TIP_PREDICTIONS[first?.prediction], "預測須可測試；與模型結果不符不代表假說不合理。")}
  ${open("延伸一原始理由", first?.reason, "說明頂端是否存在與伸長之間的預期關係。")}
  ${open("延伸一公平比較", record.form.tipFair, "只改變頂端是否存在，保持種類、處理前大小及生長狀況、左側光照、時間、溫度及供水相同。")}
  <h3>首次確認觀察</h3>${inquiry.firstObservations ? tipTableHTML(inquiry.firstObservations.observations) : "未確認"}
  <h3>最後觀察</h3>${tipTableHTML(inquiry.observations)}
  ${TIP_IDS.map((id) => reportAnswer(id + " " + GROUPS[id].label, tipObservationText(inquiry.observations[id]), tipObservationText(tipModel(id, record)), inquiry.observations[id] ? ["growth", "direction"].every((key) => inquiry.observations[id][key] === tipModel(id, record)[key]) : null)).join("")}
  <p class="report-reference">C 在本教學模型中不伸長；切頂後不一定完全停止生長，實際結果受植物狀況及條件影響。</p>
  ${Object.entries(TIP_ANSWERS)
    .map(([id, target]) =>
      reportAnswer(
        questionText(id, record),
        answerOption(id, record.form[id], record),
        answerOption(id, target, record),
        record.form[id] ? record.form[id] === target : null,
      ),
    )
    .join("")}
  ${open("延伸一證據解釋", record.form.tipEvidence, "A–C 支持頂端參與正常伸長；切頂造成傷口，仍不能直接確定物質 X 或作用機制。")}
  </section>`;
}
