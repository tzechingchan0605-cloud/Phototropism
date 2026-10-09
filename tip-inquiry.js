"use strict";
// Extension 1 changes only tip presence. The cut-tip result is a teaching-model setting.
const TIP_IDS = ["A", "C"];
const TIP_FIELDS = [
  "tipPrediction",
  "tipReason",
];
const TIP_PREDICTIONS = {
  less: "不會延長",
  same: "延長表現相近",
  more: "延長較多",
};
const PREVIOUS_TIP_ANSWERS = {
  qCap: "tipRole",
  tipLimit: "limited",
  substancePrediction: "possible",
};
const VERSION7_TIP_ANSWERS = { qCap: "tipRole", substancePrediction: "possible" };
const TIP_ANSWERS = { qCap: "tipRole" };
const TIP_GROWTH = { clear: "有", none: "沒有" };
function tipObservationFields(record) {
  return record.experimentVersion >= 7 ? ["growth"] : ["growth", "direction"];
}
function tipAnswersFor(record) {
  if (record.experimentVersion >= 11) return TIP_ANSWERS;
  return record.experimentVersion >= 7 ? VERSION7_TIP_ANSWERS : PREVIOUS_TIP_ANSWERS;
}
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
  return { growth: record.experimentVersion >= 6 ? (id === "C" ? "none" : "clear") : model.growth, ...(record.experimentVersion >= 7 ? {} : { direction: model.direction }) };
}
function tipObservationComplete(observation) {
  return (
    !!observation &&
    !!GROWTH[observation.growth]
  );
}
function tipObservationText(observation) {
  return observation
    ? [GROWTH[observation.growth], DIRECTIONS[observation.direction]]
        .filter(Boolean)
        .join("；")
    : "未記錄";
}
function tipTableHTML(observations = {}, record) {
  return `<div class="table-wrap"><table class="vl3-table"><thead><tr><th>裝置</th><th>處理</th><th>延長表現</th></tr></thead><tbody>${TIP_IDS.map((id) => `<tr><td>${sampleName(id, record)}</td><td>${GROUPS[id].label}</td><td>${esc(tipObservationText(observations[id]))}</td></tr>`).join("")}</tbody></table></div>`;
}
function initTipInquiry() {
  $("#tipSection").innerHTML = `
  <article class="vl3-card"><p class="card-kicker">04 · 延伸探究一</p><h3>頂端除了感受光照，是否也影響胚芽鞘的生長／延長？</h3>
  <p>透過遮光比較實驗，我們確認了植物的感光部位，但試想想頂端是否還有其他作用？這次加入新裝置，只改變「頂端是否存在」，比較完整的 A 與切去頂端的 D。</p>
  ${selectHTML("tipPrediction", TIP_PREDICTIONS, "", "切去頂端後，與完整胚芽鞘相比，你預測延長表現如何？")}
  <label for="tipReason">我的理由</label><textarea id="tipReason" maxlength="1500"></textarea>
  <p class="muted">第一次開始前，固定保存延伸一的原始預測及理由。動畫及 24 小時均為教學模擬。</p>
  <button id="runTipExperiment" class="primary">進行頂端比較（模擬 24 小時）</button><p id="tipStatus" role="status">等待預測及理由</p></article>
  <article class="vl3-card" id="tipResults"><h3>A 與 D：初始及培養後的比較</h3>
  <label>查看狀態<select id="tipView"><option value="after">目前培養狀態</option><option value="before">培養開始時</option></select></label>
  <div id="tipBench" class="bench tip-bench"></div><button id="confirmTipObservations" class="primary">確認延伸一觀察</button><div id="tipObservationTable"></div></article>
  <article class="vl3-card" id="tipAnalysis"><h3>頂端與延長：從比較提出新問題</h3>
  ${selectHTML("qCap", { tipRole: "頂端的存在亦影響胚芽鞘的生長／延長。", noEffect: "頂端的存在不影響胚芽鞘的生長／延長。" }, "", "1. A 與 D 的延長比較支持甚麼？")}
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
  $("#tipStatus").textContent = "等待預測及理由";
  $("#tipObservationTable").innerHTML = "";
  renderTipBench();
}
function renderTipBench() {
  $("#tipBench").innerHTML = TIP_IDS.map(
    (id) =>
      `<article class="specimen"><h3>${sampleName(id)} · ${GROUPS[id].label}</h3><div id="tip-plant-${id}">${seedling(id)}</div>${selectHTML("tip-growth-" + id, TIP_GROWTH, state.tipInquiry.observations[id]?.growth, "延長表現")}</article>`,
  ).join("");
  TIP_IDS.forEach((id) =>
    ["growth"].forEach((field) => {
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
    firstEmptyField(["tipPrediction", "tipReason"])
  )
    return remind(
      "請完成延伸一預測及理由。",
      firstEmptyField(["tipPrediction", "tipReason"]),
    );
  if (!state.tipInquiry.initialPrediction)
    state.tipInquiry.initialPrediction = {
      at: new Date().toISOString(),
      prediction: state.form.tipPrediction,
      reason: state.form.tipReason,
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
  $("#tipResults").scrollIntoView({ block: "start", behavior: scrollBehavior() });
  function frame(now) {
    if (generation !== tipGeneration) return;
    const progress = Math.min(1, (now - start) / duration);
    renderTipPlants(progress);
    if (progress < 1) requestAnimationFrame(frame);
    else {
      tipRunning = false;
      tipHasRun = true;
      state.tipInquiry.hasRun = true;
      $("#tipStatus").textContent = "培養完成，請記錄 A 與 D 的觀察。";
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
      },
    ]),
  );
  if (!TIP_IDS.every((id) => tipObservationComplete(observations[id])))
    return remind(
      "請完成 A 與 D 的延長表現觀察。",
      firstEmptyField(
        TIP_IDS.flatMap((id) => ["tip-growth-" + id]),
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
  message("延伸一觀察已保存。請分析頂端與延長的關係。");
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
    missing.push("A 與 D 的已確認觀察");
  if (firstEmptyField(Object.keys(TIP_ANSWERS)))
    missing.push("延伸一分析");
  return missing;
}
function tipReminderTarget() {
  if (!state.tipInquiry.unlocked) return "#toExtension";
  if (!state.tipInquiry.initialPrediction || !state.tipInquiry.hasRun)
    return (
      firstEmptyField(["tipPrediction", "tipReason"]) ||
      "#runTipExperiment"
    );
  if (
    !TIP_IDS.every((id) =>
      tipObservationComplete(state.tipInquiry.observations[id]),
    )
  )
    return "#confirmTipObservations";
  return firstEmptyField(Object.keys(TIP_ANSWERS));
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
  return `<section class="report-card"><h2>04 · 延伸探究一：頂端與延長</h2>
  ${reportAnswer("延伸一原始預測", TIP_PREDICTIONS[first?.prediction], "預測須可測試；與模型結果不符不代表假說不合理。")}
  ${open("延伸一原始理由", first?.reason, "說明頂端是否存在與延長之間的預期關係。")}
  ${record.experimentVersion < 7 ? open("延伸一公平比較", record.form.tipFair, "只改變頂端是否存在，保持種類、處理前大小及生長狀況、左側光照、時間、溫度及供水相同。") : ""}
  <h3>首次確認觀察</h3>${inquiry.firstObservations ? tipTableHTML(inquiry.firstObservations.observations, record) : "未確認"}
  <h3>最後觀察</h3>${tipTableHTML(inquiry.observations, record)}
  ${TIP_IDS.map((id) => reportAnswer(sampleName(id, record) + " " + GROUPS[id].label, tipObservationText(inquiry.observations[id]), tipObservationText(tipModel(id, record)), inquiry.observations[id] ? tipObservationFields(record).every((key) => inquiry.observations[id][key] === tipModel(id, record)[key]) : null)).join("")}
  <p class="report-reference">${sampleName("C", record)} 在本教學模型中不延長；切頂後不一定完全停止生長，實際結果受植物狀況及條件影響。</p>
  ${Object.entries(tipAnswersFor(record))
    .map(([id, target]) =>
      reportAnswer(
        questionText(id, record),
        answerOption(id, record.form[id], record),
        answerOption(id, target, record),
        record.form[id] ? record.form[id] === target : null,
      ),
    )
    .join("")}
  ${record.experimentVersion < 10 ? open("延伸一證據解釋", record.form.tipEvidence, `A–${sampleName("C", record)} 支持頂端參與正常延長；切頂造成傷口，仍不能直接確定物質 X 或作用機制。`) : ""}
  </section>`;
}
