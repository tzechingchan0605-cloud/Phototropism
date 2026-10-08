"use strict";
// Additional inquiry stages. Numeric values are fixed teaching-model parameters.
const EXT_IDS = ["E", "F", "G", "H"];
const EXT_LABELS = {
  E: "空白瓊脂 · 中央",
  F: "處理瓊脂 · 中央",
  G: "處理瓊脂 · 左側",
  H: "處理瓊脂 · 右側",
};
const EXT_MODEL = {
  E: { growth: "reduced", direction: "straight", angle: 0 },
  F: { growth: "clear", direction: "straight", angle: 0 },
  G: { growth: "clear", direction: "right", angle: 35 },
  H: { growth: "clear", direction: "left", angle: 35 },
};
const DIRECTIONS = {
  left: "向左彎曲",
  right: "向右彎曲",
  straight: "沒有明顯彎曲",
};
const GROWTH = {
  clear: "較明顯延長",
  reduced: "較少延長",
  none: "沒有明顯延長",
};
function mainObservationFields(record) {
  if (record.experimentVersion >= 6) return ["direction"];
  return threeStage(record)
    ? ["growth", "direction"]
    : ["growth", "direction", "position"];
}
const POSITIONS = {
  upper: "上部／頂端以下",
  lower: "接近底部",
  whole: "整株一起轉動",
  none: "沒有明顯彎曲",
};
const NEW_FIELDS = [
  "qShade",
  "extPrediction",
  "extReason",
  "extFair",
  "extEF",
  "extPosition",
  "extSides",
  "extDark",
  "extLimit",
  "extEvidence",
  "extControl",
  "knowledgeName",
];
const LEGACY_MAIN_ANSWERS = {
  qTip: "tip",
  qCap: "tipRole",
  qShade: "lessBend",
  qBelow: "bend",
  qSites: "different",
  qLimit: "indirect",
};
const VERSION5_MAIN_ANSWERS = {
  qTip: "tip",
  qShade: "lessBend",
  qBelow: "bend",
  qSites: "different",
  qLimit: "indirect",
};
const MAIN_ANSWERS = { qTip: "tip", qShade: "lessBend", qBelow: "bend" };
function mainAnswersFor(record) {
  if (record.experimentVersion >= 6) return MAIN_ANSWERS;
  return threeStage(record) ? VERSION5_MAIN_ANSWERS : LEGACY_MAIN_ANSWERS;
}
const EXT_ANSWERS = {
  extEF: "transfer",
  extPosition: "position",
  extSides: "opposite",
  extDark: "unequal",
  extLimit: "limited",
};
let extensionRunning = false,
  extensionHasRun = false,
  extensionGeneration = 0;
function newExperiment(r) {
  return r.experimentVersion >= 3;
}
function mainModel(id, record = state) {
  if (record.experimentVersion >= 6)
    return { direction: ["A", "D"].includes(id) ? "left" : "straight" };
  return {
    growth:
      id === "C"
        ? record.experimentVersion >= 4
          ? "none"
          : "reduced"
        : "clear",
    direction: ["A", "D"].includes(id) ? "left" : "straight",
    ...(threeStage(record)
      ? {}
      : { position: ["A", "D"].includes(id) ? "upper" : "none" }),
  };
}
function mainObservationText(obs) {
  return obs && typeof obs === "object"
    ? [GROWTH[obs.growth], DIRECTIONS[obs.direction], POSITIONS[obs.position]]
        .filter(Boolean)
        .join("；")
    : OUTCOMES[obs] || "未記錄";
}
function mainObservationComplete(obs) {
  return !!obs && !!DIRECTIONS[obs.direction];
}
function mainObservationScore(r) {
  if (!newExperiment(r))
    return (
      Object.keys(GROUPS).filter(
        (id) =>
          r.observations[id] ===
          (groupDefinitions(r)[id].bend ? "bend" : "straight"),
      ).length / 2
    );
  const groups = Object.keys(groupDefinitions(r));
  const correct = groups.reduce(
    (sum, id) =>
      sum +
      mainObservationFields(r).filter(
        (key) => r.observations[id]?.[key] === mainModel(id, r)[key],
      ).length,
    0,
  );
  if (!threeStage(r)) return correct / 6;
  const tipCorrect = TIP_IDS.reduce(
    (sum, id) =>
      sum +
      tipObservationFields(r).filter(
        (key) => r.tipInquiry.observations[id]?.[key] === tipModel(id, r)[key],
      ).length,
    0,
  );
  return (
    Math.round(
      (correct / (mainObservationFields(r).length * 3) + tipCorrect / (tipObservationFields(r).length * 2)) * 100,
    ) / 100
  );
}
function assumptionsFor(r) {
  return newExperiment(r) ? ASSUMPTIONS : LEGACY_ASSUMPTIONS;
}
function selectHTML(id, values, value = "", label = "") {
  return `<label for="${id}">${label}<select id="${id}"><option value="">請選擇</option>${Object.entries(
    values,
  )
    .map(
      ([k, v]) =>
        `<option value="${k}" ${k === value ? "selected" : ""}>${v}</option>`,
    )
    .join("")}</select></label>`;
}
function initExtension() {
  document.querySelector("#extensionSection").innerHTML = `
    <article class="vl3-card"><p class="card-kicker">04 · 延伸探究二</p><h3>物質 X 能否傳遞生長作用？位置如何影響彎曲？</h3>
    <p>延伸一提供頂端參與延長的線索。我們提出一個待測試的想法：頂端可能產生「物質 X」，把生長作用傳到下方。研究員準備了曾接觸頂端的瓊脂，讓你測試這種作用能否傳遞，以及作用位置如何影響彎曲。</p>
    <p>延伸二材料：切去頂端的燕麥胚芽鞘 × 4、培養容器 × 4、空白瓊脂 × 1、處理瓊脂 × 3、計時工具 × 1。</p>
    <p>兩種瓊脂外觀相同。<strong>空白瓊脂</strong>未接觸胚芽鞘頂端；<strong>處理瓊脂</strong>曾與胚芽鞘頂端接觸。瓊脂可讓一些物質進入及通過。</p>
    ${selectHTML("extPrediction", { left: "向左彎曲", right: "向右彎曲", straight: "保持較直" }, "", "把處理瓊脂放在切頂胚芽鞘左側，你預測它會怎樣生長？")}
    <label for="extReason">我的理由</label><textarea id="extReason" maxlength="1500"></textarea>
    <label for="extFair">E 與 F 的公平比較：需要保持哪些條件相同？</label><textarea id="extFair" maxlength="1500"></textarea>
    <p class="muted">本段分開兩項公平比較：E–F 只改變瓊脂是否曾接觸頂端，位置同在中央；F–G–H 只改變處理瓊脂的放置位置，瓊脂種類相同。每項比較只改變一個因素。首次開始時固定保存延伸二原始預測及理由。</p>
    <button id="runExtension" class="primary">進行物質 X 比較（模擬 24 小時）</button><p id="extensionStatus" role="status">等待預測及公平比較</p></article>
    <article class="vl3-card"><h3>量度方法示例</h3><p>這是獨立示例，不是裝置讀數。以鉛直線為 0°，移動量角器的指針，對齊胚芽鞘頂端的方向。角度記錄大小；左右方向另選。不能把彎曲後的鉛直高度差當作延長量。</p><div id="angleExample"></div><p class="muted">示例偏離鉛直線 20°。各裝置的量角器要由你自行調整。</p></article>
    <article class="vl3-card" id="extensionResults"><h3>黑暗中的四個延伸二裝置</h3><p>所有胚芽鞘均切去頂端，初始大小相近，置於黑暗；瓊脂大小、培養時間、溫度及供水相同。初始與培養後可切換查看。套上瓊脂不代表機械壓住胚芽鞘。</p><p class="notice">培養時間、逐漸生長動畫及角度均為教學模擬，不是真實量度或精確實驗常數。</p><label>查看狀態<select id="extensionView"><option value="after">目前培養狀態</option><option value="before">培養開始時</option></select></label><div id="extensionBench" class="bench"></div><button id="confirmExtension" class="primary">確認延伸觀察及讀數</button><div id="extensionTable"></div></article>
    <article class="vl3-card"><h3>根據你的讀數製作棒形圖</h3><p>X 軸是 E、F、G、H；Y 軸是最終偏離鉛直方向的角度（°）。填入每條棒的角度及方向。類別處理不連成連續曲線。</p><div id="graphInputs" class="graph-inputs"></div><button id="saveGraph" class="secondary">繪製並確認棒形圖</button><div id="barChart"></div></article>
    <article class="vl3-card" id="extensionAnalysis"><h3>分析物質 X 的作用線索</h3>
    ${selectHTML("extEF", { transfer: "頂端可能產生可轉移的生長促進作用。", agar: "所有瓊脂都會產生相同的生長促進作用。" }, "", "1. E 與 F 的比較支持甚麼？")}
    ${selectHTML("extPosition", { position: "生長作用的位置影響彎曲方向。", noEffect: "放置位置不影響彎曲方向。" }, "", "2. F、G、H 的比較支持甚麼？")}
    ${selectHTML("extSides", { opposite: "左側延長較多向右彎曲；右側延長較多向左彎曲。", same: "哪側延長較多，就向哪側彎曲。" }, "", "3. 兩側延長差異與彎曲方向有甚麼關係？")}
    ${selectHTML("extDark", { unequal: "彎曲可由不均勻生長造成，並非一定要直接受光才發生。", light: "黑暗下的彎曲必定是光直接推動胚芽鞘。" }, "", "4. 黑暗下仍可彎曲提供甚麼線索？")}
    ${selectHTML("extLimit", { limited: "只能支持可轉移的生長促進作用，不能單獨確定物質身分，也沒有直接量得光照下的分布。", proof: "可以單靠瓊脂結果確定物質身分及光照下的分布。" }, "", "5. 延伸結果的證據限制是甚麼？")}
    <label for="extEvidence">引用 E–F 及 G–H 的比較，說明你的推論。</label><textarea id="extEvidence" maxlength="2500"></textarea>
    <label for="extControl">選答：若想排除瓊脂放在一側本身的影響，應額外設計甚麼對照？</label><textarea id="extControl" maxlength="1500"></textarea></article>`;
  document.querySelector("#angleExample").innerHTML = angleExample();
  document.querySelector("#runExtension").onclick = runExtension;
  document.querySelector("#confirmExtension").onclick = confirmExtension;
  document.querySelector("#saveGraph").onclick = saveGraph;
  document.querySelector("#extensionView").onchange = () => {
    renderExtensionPlants();
    log("extension_view_changed", { view: $("#extensionView").value });
  };
  document.querySelector("#toExtension").onclick = () => {
    readForm();
    if (
      !Object.keys(MAIN_ANSWERS).every((k) => state.form[k]) ||
      !state.form.evidence.trim()
    )
      return remind(
        "請先完成主探究的三項推論及觀察解釋。",
        firstEmptyField([...Object.keys(MAIN_ANSWERS), "evidence"]),
      );
    state.tipInquiry.unlocked = true;
    if (!state.firstMainAnalysis)
      state.firstMainAnalysis = {
        at: new Date().toISOString(),
        answers: Object.fromEntries(
          Object.keys(MAIN_ANSWERS).map((k) => [k, state.form[k]]),
        ),
        evidence: state.form.evidence,
      };
    $("#tipSection").hidden = false;
    log("tip_extension_opened");
    $("#tipSection").scrollIntoView({
      block: "start",
      behavior: scrollBehavior(),
    });
  };
}
function scrollBehavior() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "instant"
    : "smooth";
}
function extensionGeometry(id, p) {
  const model = EXT_MODEL[id],
    signed = (model.direction === "left" ? -1 : 1) * model.angle * p;
  const a = (signed * Math.PI) / 180;
  const growth = (id === "E" ? 8 : 45) * p;
  const x = 150 + Math.sin(a) * 65,
    y = 135 - growth;
  return {
    x,
    y,
    signed,
    stem: `M150 235 L150 180 C150 156 ${x - Math.sin(a) * 35} ${y + Math.cos(a) * 35} ${x - Math.sin(a) * 20} ${y + Math.cos(a) * 20} L${x} ${y}`,
  };
}
function extensionPlant(id, p = 0, ruler = 0, tool = true) {
  const { x, y, signed, stem } = extensionGeometry(id, p);
  const offset = id === "G" ? -11 : id === "H" ? 11 : 0;
  return `<svg class="extension-plant" viewBox="0 0 300 280" role="img" aria-label="延伸裝置 ${id}，黑暗培養示意，請自行觀察及量度"><rect x="1" y="1" width="298" height="276" rx="16" fill="#f2f4f8"/><text x="12" y="274" font-size="12" fill="#526170">黑暗 · ${p === 0 ? "開始時" : "培養後"}</text><path data-ext-stem="${id}" d="${stem}" fill="none" stroke="#58a16b" stroke-width="12"/><path d="${stem}" fill="none" stroke="#a1d38a" stroke-width="3"/>
  <rect x="${x + offset - 12}" y="${y - 10}" width="24" height="10" rx="2" fill="#b5e4e6" stroke="#7dabad"/><path d="M118 235H182L172 267H128Z" fill="#d6a878"/><rect x="111" y="231" width="78" height="12" rx="4" fill="#af7851"/>
  ${tool ? protractorSVG(x, y, ruler) : ""}</svg>`;
}
function protractorSVG(x, y, angle) {
  const radius = 62,
    a = (angle * Math.PI) / 180;
  const marks = Array.from({ length: 19 }, (_, i) => i * 10 - 90)
    .map((d) => {
      const r = (d * Math.PI) / 180;
      return `<path d="M${x + Math.sin(r) * 55} ${y - Math.cos(r) * 55}L${x + Math.sin(r) * 62} ${y - Math.cos(r) * 62}" stroke="#789399"/><text x="${x + Math.sin(r) * 76}" y="${y - Math.cos(r) * 76 + 4}" text-anchor="middle" font-size="9" fill="#526a70">${Math.abs(d)}</text>`;
    })
    .join("");
  return `<g data-protractor="true"><path d="M${x - radius} ${y}A${radius} ${radius} 0 0 1 ${x + radius} ${y}" fill="none" stroke="#9cbbc2"/>${marks}<path d="M${x} ${y + 14}V${Math.max(24, y - 90)}" stroke="#79868c" stroke-dasharray="4 3"/><path d="M${x} ${y}L${x + Math.sin(a) * 88} ${y - Math.cos(a) * 88}" stroke="#cc7b30" stroke-width="2"/><circle cx="${x}" cy="${y}" r="3" fill="#cc7b30"/></g>`;
}
function angleExample() {
  const a = (20 * Math.PI) / 180,
    x = 150,
    y = 145;
  return `<svg class="angle-example" viewBox="0 0 300 220" role="img" aria-label="獨立量度示例：偏離鉛直線20度，方向向右"><path d="M150 200L150 145L${x + Math.sin(a) * 80} ${y - Math.cos(a) * 80}" stroke="#59a16a" stroke-width="8" fill="none"/>${protractorSVG(x, y, 20)}<text x="150" y="215" text-anchor="middle" font-size="12">鉛直為 0°；示例為 20°</text></svg>`;
}
function resetExtension() {
  extensionGeneration++;
  extensionRunning = false;
  extensionHasRun = false;
  $("#extensionSection").hidden = true;
  $("#extensionStatus").textContent = "等待預測及公平比較";
  $("#extensionView").value = "after";
  renderExtensionBench();
  $("#extensionTable").innerHTML = "";
  $("#barChart").innerHTML = "";
  $("#graphInputs").innerHTML = EXT_IDS.map(
    (id) =>
      `<div>${id}<label for="graph-angle-${id}">棒高（°）<input id="graph-angle-${id}" type="number" min="0" max="90" step="1"></label>${selectHTML("graph-direction-" + id, DIRECTIONS, "", "棒的方向")}</div>`,
  ).join("");
  $$("#graphInputs input,#graphInputs select").forEach(
    (el) =>
      (el.oninput = () => {
        state.extension.graphSaved = false;
        log("graph_changed", { field: el.id, value: el.value });
      }),
  );
}
function renderExtensionBench() {
  $("#extensionBench").innerHTML = EXT_IDS.map(
    (id) =>
      `<article class="specimen"><h3>${id} · ${EXT_LABELS[id]}</h3><div id="ext-plant-${id}">${extensionPlant(id)}</div><label for="ruler-${id}">量角器指針（左右調整）<input id="ruler-${id}" type="range" min="-90" max="90" step="1" value="0"><output id="ruler-output-${id}">0°</output></label><button id="read-angle-${id}" class="secondary">把指針讀數填入角度</button><label for="ext-angle-${id}">偏離鉛直角度（°）<input id="ext-angle-${id}" type="number" min="0" max="90" step="1"></label>${selectHTML("ext-growth-" + id, GROWTH, "", "延長表現")}${selectHTML("ext-direction-" + id, DIRECTIONS, "", "彎曲方向")}</article>`,
  ).join("");
  EXT_IDS.forEach((id) => {
    $("#ruler-" + id).oninput = () => {
      const v = Number($("#ruler-" + id).value);
      $("#ruler-output-" + id).value = Math.abs(v) + "°";
      renderExtensionPlants();
      log("protractor_adjusted", { group: id, signed: v });
    };
    $("#read-angle-" + id).onclick = () => {
      if (!extensionHasRun || extensionRunning || state.submittedAt) return;
      $("#ext-angle-" + id).value = Math.abs(Number($("#ruler-" + id).value));
      log("angle_read", {
        group: id,
        angle: Number($("#ext-angle-" + id).value),
      });
    };
    ["angle", "growth", "direction"].forEach(
      (k) =>
        ($("#ext-" + k + "-" + id).oninput = () =>
          log("extension_reading_changed", {
            group: id,
            field: k,
            value: $("#ext-" + k + "-" + id).value,
          })),
    );
  });
}
function renderExtensionPlants(progress) {
  const p =
    progress ??
    ($("#extensionView").value === "before" ? 0 : extensionHasRun ? 1 : 0);
  EXT_IDS.forEach(
    (id) =>
      ($("#ext-plant-" + id).innerHTML = extensionPlant(
        id,
        p,
        Number($("#ruler-" + id).value),
        extensionHasRun && !extensionRunning && p === 1,
      )),
  );
}
function runExtension() {
  if (threeStage(state) && tipMissing().length)
    return remind(
      "請先完成延伸一觀察及分析，再測試物質 X。",
      tipReminderTarget(),
    );
  if (extensionRunning || state.submittedAt) return;
  readForm();
  if (
    !state.extension.unlocked ||
    !["extPrediction", "extReason", "extFair"].every((k) =>
      state.form[k].trim(),
    )
  )
    return remind(
      "請完成延伸預測、理由及公平比較。",
      firstEmptyField(["extPrediction", "extReason", "extFair"]),
    );
  if (!state.extension.initialPrediction)
    state.extension.initialPrediction = {
      at: new Date().toISOString(),
      prediction: state.form.extPrediction,
      reason: state.form.extReason,
      fair: state.form.extFair,
    };
  extensionRunning = true;
  extensionHasRun = false;
  state.extension.hasRun = false;
  const generation = ++extensionGeneration;
  const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 2400,
    start = performance.now();
  $("#extensionView").value = "after";
  $("#extensionStatus").textContent = "黑暗培養中（加速模型）";
  lockExtension();
  log("extension_started");
  $("#extensionResults").scrollIntoView({
    block: "start",
    behavior: scrollBehavior(),
  });
  function frame(now) {
    if (generation !== extensionGeneration) return;
    const p = duration ? Math.min(1, (now - start) / duration) : 1;
    renderExtensionPlants(p);
    if (p < 1) requestAnimationFrame(frame);
    else {
      extensionRunning = false;
      extensionHasRun = true;
      state.extension.hasRun = true;
      renderExtensionPlants();
      $("#extensionStatus").textContent = "培養完成，請自行觀察並調整量角器。";
      lockExtension();
      log("extension_completed");
    }
  }
  requestAnimationFrame(frame);
}
function validAngle(value) {
  return (
    value !== "" &&
    value !== null &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= 90
  );
}
function confirmExtension() {
  if (!extensionHasRun || extensionRunning || state.submittedAt) return;
  const readings = Object.fromEntries(
    EXT_IDS.map((id) => [
      id,
      {
        angle: $("#ext-angle-" + id).value,
        growth: $("#ext-growth-" + id).value,
        direction: $("#ext-direction-" + id).value,
      },
    ]),
  );
  const incomplete = EXT_IDS.find(
    (id) =>
      !validAngle(readings[id].angle) ||
      !GROWTH[readings[id].growth] ||
      !DIRECTIONS[readings[id].direction],
  );
  if (incomplete) {
    const field = !validAngle(readings[incomplete].angle)
      ? "angle"
      : !GROWTH[readings[incomplete].growth]
        ? "growth"
        : "direction";
    return remind(
      "請完成四組延長、角度（0–90°）及方向。",
      `#ext-${field}-${incomplete}`,
    );
  }
  EXT_IDS.forEach((id) => (readings[id].angle = Number(readings[id].angle)));
  if (!state.extension.firstReadings)
    state.extension.firstReadings = {
      at: new Date().toISOString(),
      readings: clone(readings),
    };
  state.extension.readings = readings;
  state.extension.graphSaved = false;
  $("#extensionTable").innerHTML = extensionTableHTML(readings);
  log("extension_readings_confirmed", { readings });
  message("延伸讀數已保存，請用自己的讀數繪圖及分析。");
}
function extensionTableHTML(readings) {
  return `<div class="table-wrap"><table class="vl3-table"><thead><tr><th>裝置</th><th>延長</th><th>角度（°）</th><th>方向</th></tr></thead><tbody>${EXT_IDS.map((id) => `<tr><td>${id}</td><td>${esc(GROWTH[readings[id]?.growth] || "未記錄")}</td><td>${esc(readings[id]?.angle ?? "未記錄")}</td><td>${esc(DIRECTIONS[readings[id]?.direction] || "未記錄")}</td></tr>`).join("")}</tbody></table></div>`;
}
function barChartSVG(points) {
  const bars = EXT_IDS.map((id, i) => {
    const p = points[id];
    const height = (Number(p?.angle) || 0) * 2;
    return `<rect x="${100 + i * 120}" y="${240 - height}" width="58" height="${height}" fill="#168c84"/><text x="${129 + i * 120}" y="${230 - height}" text-anchor="middle" font-size="13">${esc(p?.angle ?? "")}°</text><text x="${129 + i * 120}" y="260" text-anchor="middle" font-size="14">${id}</text><text x="${129 + i * 120}" y="281" text-anchor="middle" font-size="12">${esc(DIRECTIONS[p?.direction] || "")}</text>`;
  }).join("");
  const ticks = [0, 15, 30, 45, 60, 75, 90]
    .map(
      (v) =>
        `<path d="M76 ${240 - v * 2}H565" stroke="#dce9e7"/><text x="65" y="${244 - v * 2}" text-anchor="end" font-size="12">${v}</text>`,
    )
    .join("");
  return `<svg class="bar-chart" viewBox="0 0 600 320" role="img" aria-label="學生製作的棒形圖：延伸裝置E至H的最終偏離鉛直角度及方向"><text x="300" y="22" text-anchor="middle" font-size="15">最終偏離鉛直方向的角度（°）</text>${ticks}<path d="M76 48V240H565" fill="none" stroke="#15333b"/>${bars}<text x="300" y="310" text-anchor="middle" font-size="14">延伸裝置</text></svg>`;
}
function saveGraph() {
  if (state.submittedAt) return;
  if (!EXT_IDS.every((id) => state.extension.readings[id]))
    return remind("請先確認全部延伸讀數。", "#confirmExtension");
  const points = Object.fromEntries(
    EXT_IDS.map((id) => [
      id,
      {
        angle: $("#graph-angle-" + id).value,
        direction: $("#graph-direction-" + id).value,
      },
    ]),
  );
  const incomplete = EXT_IDS.find(
    (id) => !validAngle(points[id].angle) || !DIRECTIONS[points[id].direction],
  );
  if (incomplete) {
    const field = !validAngle(points[incomplete].angle) ? "angle" : "direction";
    return remind(
      "請填寫四條棒的角度及方向。",
      `#graph-${field}-${incomplete}`,
    );
  }
  EXT_IDS.forEach((id) => (points[id].angle = Number(points[id].angle)));
  state.extension.graph = points;
  state.extension.graphSaved = true;
  if (!state.extension.firstGraph) state.extension.firstGraph = clone(points);
  $("#barChart").innerHTML = barChartSVG(points);
  log("graph_confirmed", { points });
  message("棒形圖已保存。圖表按你的讀數評分，量度準確性另行比較。");
}
function extensionMissing() {
  const missing = [];
  if (!state.extension.initialPrediction) missing.push("延伸原始預測及實驗");
  if (
    !state.extension.hasRun ||
    !EXT_IDS.every((id) => state.extension.readings[id])
  )
    missing.push("四組延伸讀數");
  if (!state.extension.graphSaved) missing.push("已確認棒形圖");
  if (
    !Object.keys(EXT_ANSWERS).every((k) => state.form[k]) ||
    !state.form.extEvidence.trim()
  )
    missing.push("延伸分析及證據");
  return missing;
}
function lockExtension() {
  const locked = !!state.submittedAt;
  $$(
    "#extensionSection input,#extensionSection select,#extensionSection textarea,#extensionSection button",
  ).forEach((el) => (el.disabled = locked));
  $("#runExtension").disabled = locked || extensionRunning;
  $("#confirmExtension").disabled =
    locked || extensionRunning || !extensionHasRun;
  $$(
    "#extensionBench input,#extensionBench select,#extensionBench button",
  ).forEach(
    (el) => (el.disabled = locked || extensionRunning || !extensionHasRun),
  );
  $("#extensionView").disabled = locked || extensionRunning;
  $("#knowledgeName").disabled = !locked || complete();
}
function mechanismSVG() {
  return `<svg class="mechanism-svg" viewBox="0 0 820 390" role="img" aria-label="左側光照時右側背光側延長較多而向左彎曲；處理瓊脂放左側時左側延長較多而向右彎曲"><rect x="5" y="5" width="395" height="375" rx="18" fill="#edf8f2"/><rect x="420" y="5" width="395" height="375" rx="18" fill="#edf8f2"/>
  <text x="202" y="35" text-anchor="middle" font-size="17">1 · 左側光照</text><path d="M202 310L202 240C202 196 167 150 133 131" fill="none" stroke="#65a772" stroke-width="26"/><path d="M212 306L212 240C213 191 171 143 139 122" fill="none" stroke="#d5e989" stroke-width="5"/><rect x="30" y="92" width="13" height="55" rx="4" fill="#f3b946"/><path d="M50 120H108M99 112L108 120L99 128" stroke="#bb8725" fill="none"/><text x="34" y="76" font-size="14">光源</text><text x="68" y="178" font-size="14">向左彎曲</text><text x="240" y="115" font-size="14">右側＝背光側</text><text x="240" y="141" font-size="14">生長素較多</text><text x="240" y="167" font-size="14">細胞延長較多</text><path d="M239 178L189 191" fill="none" stroke="#526d71"/><text x="225" y="260" font-size="13">頂端以下彎曲</text><text x="35" y="348" font-size="13">頂端感光 → 生長訊號向下傳遞</text>
  <text x="618" y="35" text-anchor="middle" font-size="17">2 · 黑暗：處理瓊脂放左側</text><path d="M619 310L619 240C619 196 654 150 688 131" fill="none" stroke="#65a772" stroke-width="26"/><path d="M609 306L609 240C608 191 650 143 682 122" fill="none" stroke="#d5e989" stroke-width="5"/><rect x="666" y="110" width="25" height="12" fill="#b5e4e6" stroke="#7dabad"/><text x="450" y="94" font-size="14">處理瓊脂</text><path d="M525 98L672 112" stroke="#526d71"/><text x="444" y="159" font-size="14">左側延長較多</text><path d="M550 167L633 181" stroke="#526d71"/><text x="677" y="210" font-size="14">向右彎曲</text><text x="445" y="348" font-size="13">兩側生長不均 → 向延長較少的一側彎曲</text></svg>`;
}
const PREVIOUS_Q_LIMIT = {
  indirect:
    "切頂也移除其他組織並造成傷口；遮光比較須假設溫度及機械限制受到控制，不能確定頂端只負責感光。",
  proof: "只要切頂組不彎曲，就能確定頂端只負責感光。",
};
const VERSION5_MAIN_QUESTIONS = {
  qCap: "1. A 與 C 的延長及彎曲比較支持甚麼？",
  qShade: "1. A 與 B：頂端遮光後有甚麼不同？",
  qBelow: "2. A 與 D：下部沒有直接受光，是否仍可彎曲？",
  qTip: "3. 哪個部位可能感受單側光照？",
  qSites: "4. 感光部位與彎曲部位是否一定相同？",
  qLimit: "5. 本實驗的證據限制是甚麼？",
};
const PREVIOUS_MAIN_QUESTIONS = {
  qCap: "1. A 與 C：頂端是否參與正常延長及向光反應？",
  qShade: "2. A 與 B：頂端遮光後有甚麼不同？",
  qBelow: "3. A 與 D：下部沒有直接受光，是否仍可彎曲？",
  qTip: "4. 哪個部位可能感受單側光照？",
  qSites: "5. 感光部位與彎曲部位是否一定相同？",
  qLimit: "6. 本實驗的證據限制是甚麼？",
};
function questionText(id, record) {
  if (record.experimentVersion === 5 && VERSION5_MAIN_QUESTIONS[id]) return VERSION5_MAIN_QUESTIONS[id];
  if (!threeStage(record) && PREVIOUS_MAIN_QUESTIONS[id])
    return PREVIOUS_MAIN_QUESTIONS[id];
  return (
    VL3Language.sourceText(
      document.querySelector("#" + id)?.closest("label")?.childNodes[0],
    ).trim() || id
  );
}
function answerOption(id, value, record) {
  if (id === "tipFair") return value || "";
  if (id === "tipLimit") return { limited: "切頂同時移除組織並造成傷口，不能單靠這個比較確定頂端如何影響生長。", proof: "切頂後不延長，就能確定頂端只負責感光。" }[value] || "";
  if (record && record.experimentVersion < 6 && id === "qShade")
    return {
      lessBend: "仍可延長，但沒有明顯向光彎曲。",
      same: "仍有相同的向光彎曲。",
    }[value] || "未回答";
  if (id === "qSites") return { different: "不一定相同，頂端可能影響下方的生長。", same: "必定是同一部位。" }[value] || "未回答";
  if (record?.experimentVersion === 5 && id === "qLimit") return { indirect: "遮光比較提供感光部位的線索，不能單靠它確定內部機制；須控制溫度及機械限制。", proof: "只要遮光組不彎曲，就能完全確定頂端的所有作用。" }[value] || "未回答";
  if (record && !threeStage(record) && newExperiment(record) && id === "qLimit")
    return PREVIOUS_Q_LIMIT[value] || "未回答";
  if (id === "comparison")
    return (
      {
        AB: "A 與 B：頂端遮光處理",
        AC: "A 與 C：頂端是否存在",
        AD: "A 與 D：下部遮光處理",
      }[value] ||
      value ||
      "未回答"
    );
  const option = document
    .querySelector("#" + id)
    ?.querySelector(`option[value="${CSS.escape(value || "")}"]`);
  // Export and scoring always use the original Chinese option text, regardless of UI language.
  return (
    (option ? VL3Language.sourceText(option).trim() : "") || value || "未回答"
  );
}
function reportAnswer(
  title,
  value,
  reference,
  correct = null,
  studentText = false,
) {
  return `<div class="report-answer"><strong>${esc(title)}</strong>${correct === null ? "" : ` <b class="${correct ? "answer-correct" : "answer-wrong"}">${correct ? "✓" : "✕"}</b>`}<p${studentText && value ? " data-student-text" : ""}>${esc(value || "未回答")}</p><p class="report-reference">${correct === null ? "參考說明" : "參考答案"}：${esc(reference)}</p></div>`;
}
function newReport(r) {
  const f = r.form,
    e = r.extension,
    o = r.initialDesign;
  const rawTitles = new Set([
    "初步觀察",
    "初步想法（舊版）",
    "原始理由",
    "對照設計",
    "裝置設計",
    "數據推論",
    "公平比較",
    "延伸證據",
    "額外對照（選答）",
    "實際反思",
  ]);
  const open = (title, value, ref) =>
    reportAnswer(title, value, ref, null, rawTitles.has(title));
  const questions = (answers) =>
    Object.entries(answers)
      .map(([id, target]) =>
        reportAnswer(
          questionText(id, r),
          answerOption(id, f[id], r),
          answerOption(id, target, r),
          f[id] ? f[id] === target : null,
        ),
      )
      .join("");
  const initial = o?.form || f;
  // Earlier versions accepted a free-text hypothesis. Its saved sentence is student text.
  if (Object.hasOwn(initial, "initialIdea")) rawTitles.add("原始假說");
  if (Object.hasOwn(f, "initialIdea")) rawTitles.add("最後假說");
  const firstMain = r.firstObservations
    ? tableHTML(r.firstObservations, groupDefinitions(r), r)
    : "未確認";
  const firstExt = e.firstReadings
    ? extensionTableHTML(e.firstReadings.readings)
    : "未確認";
  return `<h1>VL3 · 幼芽為甚麼向光生長？</h1><p data-student-text>${esc(r.profile.classInfo)}｜${esc(r.profile.name)}｜${esc(r.profile.email)}</p><p>${esc(r.id)} · ${statusOf(r)}</p>
  <section class="report-card"><h2>01 · 了解情境</h2><p>學校園藝小組發現，窗邊胚芽鞘逐漸朝窗戶方向彎曲。大家知道植物會向光源方向生長，但不知道植物哪個部位感受光照，以及甚麼令它彎曲。</p>${contextComparison()}${open("初步觀察", f.observation, "描述外形及生長方向的可觀察變化，不必先解釋機制。")}${f.initialIdea ? open("初步想法（舊版）", f.initialIdea, "保留舊版探究的原始回答；不因與模型不同直接判錯。") : ""}</section>
  <section class="report-card"><h2>02 · 設計主探究</h2>${open("原始假說", o?.hypothesisText || hypothesis(initial, 3), "可測試的部位、遮光處理及預期反應；預測不符不代表假說不合理。")}${open("原始理由", initial.reason, "說明為甚麼作出該預測。")}${open("最後假說", hypothesis(f, 3), "保留修訂後內容，原始答案不覆蓋。")}${initial.comparison ? open("指定比較（舊版）", answerOption("comparison", initial.comparison), "A–B：頂端遮光；A–C：頂端是否存在；A–D：下部遮光。") : ""}${["iv", "dv", "cv"].map((key, i) => open(["獨立變量", "因變量", "控制變量"][i], r.variables[key].map((n) => variableDefinitions(r)[n]).join("；"), [threeStage(r) ? "只比較遮光處理；三組頂端均完整。" : "比較遮光處理／部位或頂端是否存在。", (r.experimentVersion >= 6 ? "彎曲方向。" : "延長及彎曲反應。"), "種類、處理前大小與狀況、光照、溫度、供水及培養時間。"][i])).join("")}${open("探究假設", r.assumptions.map((id) => assumptionsFor(r).find((a) => a[0] === id)?.[1]).join("；"), "初始狀況相近；帽及套不限制生長；處理不造成明顯溫差。相同種類仍需控制大小。")}${open("對照設計", f.controlPlan, threeStage(r) ? `保留 A 完整不遮蓋，與 B 頂端遮光及 ${sampleName("D", r)} 下部遮光比較，其他條件相同。` : "保留 A 完整不遮蓋；按三項指定比較保持其他條件相同。")}${open("裝置設計", r.setup.description, threeStage(r) ? `A、B、${sampleName("D", r)} 三組遮光處理、單側光源及固定條件清楚；圖片與文字由教師評閱。` : "四組處理、單側光源及固定條件清楚；圖片與文字由教師評閱。")}${safeImage(r.setup.image) ? `<img src="${r.setup.image}" alt="學生實驗裝置設計">` : ""}</section>
  <section class="report-card"><h2>03 · 主探究記錄</h2><h3>首次確認</h3>${firstMain}<h3>最後記錄</h3>${tableHTML(r.observations, groupDefinitions(r), r)}${Object.keys(
    groupDefinitions(r),
  )
    .map((id) => {
      const expected = mainModel(id, r),
        obs = r.observations[id];
      return reportAnswer(
        sampleName(id, r) + " " + GROUPS[id].label,
        mainObservationText(obs),
        mainObservationText(expected),
        obs
          ? mainObservationFields(r).every(
              (k) => obs[k] === expected[k],
            )
          : null,
      );
    })
    .join(
      "",
    )}<p class="report-reference">${threeStage(r) ? "主探究三組頂端均完整，唯一改變因素為遮光處理。" : r.experimentVersion >= 4 ? "C 在本教學模型中不延長；切頂後不一定完全停止生長，實際結果受植物狀況及條件影響。" : "C 的延長減少是本模型設定；切頂後不一定完全停止生長。"}</p></section>
  <section class="report-card"><h2>04 · 主探究分析</h2>${questions(mainAnswersFor(r))}${open("數據推論", f.evidence, threeStage(r) ? `比較 A–B 及 A–${sampleName("D", r)} 的彎曲方向，說明哪個部位可能感受光。` : "以 A–B、A–C、A–D 的具體比較支持推論，留意傷口、溫度及機械限制。")}</section>
  ${threeStage(r) ? tipReportHTML(r) : ""}
  <section class="report-card"><h2>${threeStage(r) ? "04 · 延伸探究二：物質 X" : "04 · 延伸預測與觀察"}</h2>${open("原始預測", DIRECTIONS[e.initialPrediction?.prediction], "處理瓊脂放左側，模型中左側延長較多而向右彎曲；原始預測由教師按可測試性評閱。")}${open("原始理由", e.initialPrediction?.reason, "合理理由不因結果不符直接判錯。")}${open("公平比較", f.extFair, "E–F 均放中央，保持瓊脂大小、胚芽鞘初始大小及狀況、黑暗、溫度、供水及時間相同。")}<h3>首次確認讀數</h3>${firstExt}<h3>最後讀數</h3>${extensionTableHTML(e.readings)}${EXT_IDS.map((id) => reportAnswer(id + " 最終角度", e.readings[id]?.angle === undefined ? "" : e.readings[id].angle + "°", EXT_MODEL[id].angle + "°（教學模型；±3°）", e.readings[id] ? Math.abs(e.readings[id].angle - EXT_MODEL[id].angle) <= 3 : null)).join("")}<h3>學生棒形圖</h3>${Object.keys(e.graph).length ? barChartSVG(e.graph) : "未確認"}<p class="report-reference">圖表以學生本身讀數核對；量度準確性另與模型比較。不用鉛直高度差推算延長量。</p></section>
  <section class="report-card"><h2>${threeStage(r) ? "04 · 延伸二分析" : "04 · 延伸分析"}</h2>${questions(EXT_ANSWERS)}${open("延伸證據", f.extEvidence, "E–F 支持可轉移的生長促進作用；G–H 支持作用位置影響彎曲方向。")}${open("額外對照（選答）", f.extControl, "可把空白瓊脂放左側及右側，以排除單側放置本身的影響。")}</section>
  ${r.submittedAt ? `<section class="report-card"><h2>學習重點</h2><p>向光性是因光照方向而產生的定向生長；向光源屬正向光性。頂端參與感光，生長素是影響植物生長的激素。${threeStage(r) ? "探究中的物質 X 可結合其他研究理解為生長素；瓊脂比較本身並未鑑定其身分。" : ""}背光側生長素較多、細胞延長較多，使胚芽鞘向光彎曲。</p>${mechanismSVG()}<p class="report-reference">本模型未直接鑑定瓊脂內的物質或量得單側光下的生長素分布；名稱及機制由其他研究支持。</p>${reportAnswer("名稱檢核", answerOption("knowledgeName", f.knowledgeName), "正向光性", f.knowledgeName ? f.knowledgeName === "positive" : null)}</section>` : ""}
  <section class="report-card"><h2>學習反思</h2>${open("實際反思", f.reflection, threeStage(r) ? "引用遮光主探究、頂端比較及瓊脂延伸各一項比較，修訂三段原始預測，連結感光、生長訊號與不均勻延長。由教師評閱，不自動判錯。" : "引用主探究及延伸各一項比較，修訂兩次原始預測，連結感光、生長訊號與不均勻延長。由教師評閱，不自動判錯。")}</section><p class="report-reference">動畫、24 小時及角度為教學模擬。學生報告不顯示分數。</p>`;
}
function graphScore(r) {
  if (!newExperiment(r)) return complete(r) ? 2 : 0;
  return (
    EXT_IDS.filter(
      (id) =>
        r.extension.graph[id] &&
        r.extension.readings[id] &&
        r.extension.graph[id]?.angle === r.extension.readings[id]?.angle &&
        r.extension.graph[id]?.direction ===
          r.extension.readings[id]?.direction,
    ).length / 2
  );
}
function angleScore(r) {
  return (
    EXT_IDS.filter(
      (id) =>
        r.extension.readings[id] &&
        Math.abs(r.extension.readings[id].angle - EXT_MODEL[id].angle) <= 3,
    ).length / 2
  );
}
function inferenceScore(r) {
  if (!newExperiment(r))
    return (
      (r.form.qCap === comparisonAnswer(r) ? 1 : 0) +
      (r.form.qBelow === ANSWERS.qBelow ? 1 : 0)
    );
  const answers = {
    ...mainAnswersFor(r),
    ...(threeStage(r) ? tipAnswersFor(r) : {}),
    ...EXT_ANSWERS,
  };
  return (
    Math.round(
      (Object.keys(answers).filter((k) => r.form[k] === answers[k]).length /
        Object.keys(answers).length) *
        200,
    ) / 100
  );
}
async function svgPNG(svg) {
  const url = URL.createObjectURL(
    new Blob(
      [svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')],
      { type: "image/svg+xml" },
    ),
  );
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 480;
    const context = c.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, c.width, c.height);
    context.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
