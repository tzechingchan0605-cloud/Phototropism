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
  E: { growth: "none", direction: "straight", angle: 0 },
  F: { growth: "clear", direction: "straight", angle: 0 },
  G: { growth: "clear", direction: "right", angle: 35 },
  H: { growth: "clear", direction: "left", angle: 35 },
};
function extensionModel(id, record) {
  if (id === "E" && record && record.experimentVersion < 15) return { ...EXT_MODEL.E, growth: "reduced" };
  return EXT_MODEL[id];
}
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
  "extEF",
  "extPosition",
  "extXAmount",
  "extCellElongation",
  "extBendDirection",
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
const MAIN_QUESTION_LABELS = {
  qShade: "1. 比較 A 與 B：頂端遮光後有甚麼不同？",
  qBelow: "2. 比較 A 與 C：下部沒有直接受光，是否仍會彎曲？",
  qTip: "3. 哪個部位可能感受單側光照？",
};
function mainAnswersFor(record) {
  if (record.experimentVersion >= 6) return MAIN_ANSWERS;
  return threeStage(record) ? VERSION5_MAIN_ANSWERS : LEGACY_MAIN_ANSWERS;
}
const PREVIOUS_EXT_ANSWERS = {
  extEF: "transfer",
  extPosition: "position",
  extSides: "opposite",
  extDark: "unequal",
  extLimit: "limited",
};
const VERSION9_EXT_ANSWERS = { extEF: "transfer", extPosition: "position", extSides: "opposite" };
const EXT_CLOZE_ANSWERS = { extXAmount: "more", extCellElongation: "more", extBendDirection: "right" };
const EXT_ANSWERS = { extEF: "transfer", extPosition: "position", ...EXT_CLOZE_ANSWERS };
const EXT_CLOZE_TITLE = "3. 完成句子，解釋處理瓊脂如何影響胚芽鞘的彎曲。";
const EXT_POSITION_QUESTION = "2. F、G、H 的比較支持甚麼？";
const EXT_POSITION_OPTIONS = {
  position: "經處理瓊脂的放置位置影響胚芽鞘的彎曲方向。",
  noEffect: "經處理瓊脂的放置位置不影響胚芽鞘的彎曲方向。",
};
const REFLECTION_PROMPT = "試運用學習重點所學，解釋圖中胚芽鞘為何會向右彎曲。";
const REFLECTION_REFERENCE = "圖中光源在右側，胚芽鞘頂端感受單側光照。生長素移向左側（背光側）並向下傳遞，令左側細胞延長較多，因此胚芽鞘向右側光源彎曲，屬正向光性。由教師評閱，不自動判錯。";
function extensionAnswersFor(record) {
  if (record.experimentVersion >= 16) return EXT_ANSWERS;
  return record.experimentVersion >= 9 ? VERSION9_EXT_ANSWERS : PREVIOUS_EXT_ANSWERS;
}
let extensionRunning = false,
  extensionHasRun = false,
  extensionGeneration = 0;
const extensionRulerUsed = new Set();
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
function extensionClozeSentence(fill) {
  return `<span>將處理瓊脂放在切去頂端的胚芽鞘</span> <strong class="inquiry-highlight">左側</strong> <span>時，與右側相比，左側會獲得較</span> ${fill("extXAmount")} <span>的物質 X，令左側</span> <strong class="inquiry-highlight" data-en="elongate">細胞延長</strong><span data-en="">較</span> ${fill("extCellElongation")} <span>，最終使胚芽鞘向</span> ${fill("extBendDirection")} <span>方彎曲。</span>`;
}
function extensionPositionHTML() {
  return `<fieldset class="extension-position-question"><legend>${EXT_POSITION_QUESTION}</legend><input id="extPosition" type="hidden" value="">
    <label><input id="extPosition-position" type="radio" name="extPositionChoice" value="position"><span>${EXT_POSITION_OPTIONS.position}</span></label>
    <label><input id="extPosition-noEffect" type="radio" name="extPositionChoice" value="noEffect"><span><span>經處理瓊脂的放置位置</span> <strong data-en="does not">不</strong> <span>影響胚芽鞘的彎曲方向。</span></span></label>
  </fieldset>`;
}
function extensionClozeSelect(id) {
  const labels = {extXAmount:"左側物質 X 的量", extCellElongation:"左側細胞延長", extBendDirection:"胚芽鞘彎曲方向"};
  const options = id === "extBendDirection" ? {left:"左",right:"右"} : {more:"多",less:"少"};
  return `<select id="${id}" aria-label="${labels[id]}"><option value="">請選擇</option>${Object.entries(options).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select>`;
}
function initExtension() {
  document.querySelector("#extensionSection").innerHTML = `
    <p id="agarTransition" class="notice"><strong class="inquiry-highlight" data-en="The tip">頂端</strong> <span>可能產生能</span> <strong class="inquiry-highlight" data-en="pass down">向下傳遞</strong><span data-en="">的</span> <strong class="inquiry-highlight">物質 X</strong><span>，促進下方</span> <strong class="inquiry-highlight" data-en="elongation">延長</strong> <span>；這個想法仍需測試。</span></p>
    <article class="vl3-card"><p class="card-kicker">04 · 延伸探究二</p><h3>物質 X 能否傳遞生長作用？位置如何影響彎曲？</h3>
    <p><span>研究員準備了</span> <strong class="inquiry-highlight">曾接觸頂端的瓊脂</strong> <span>，讓你測試這種作用能否</span> <strong class="inquiry-highlight">傳遞</strong> <span>，以及作用位置如何</span> <strong class="inquiry-highlight">影響彎曲</strong><span>。</span></p>
    <p class="materials-note">延伸二材料：切去頂端的燕麥胚芽鞘 × 4、培養容器 × 4、空白瓊脂 × 1、處理瓊脂 × 3、計時工具 × 1。</p>
    <p><span>兩種瓊脂外觀相同。</span> <strong>空白瓊脂</strong> <strong class="inquiry-highlight">未接觸</strong> <span>胚芽鞘頂端；</span> <strong>處理瓊脂</strong> <strong class="inquiry-highlight">曾接觸</strong> <span>胚芽鞘頂端。瓊脂可讓一些物質進入及通過。</span></p>
    ${selectHTML("extPrediction", { left: "向左彎曲", right: "向右彎曲", straight: "保持較直" }, "", '<span data-en="If">把</span> <strong class="inquiry-highlight" data-en="treated agar">處理瓊脂</strong> <span>放在切頂胚芽鞘</span> <strong class="inquiry-highlight">左側</strong> <span>，你預測它會怎樣生長？</span>')}
    <label for="extReason">我的理由</label><textarea id="extReason" maxlength="1500"></textarea>
    <button id="runExtension" class="primary">進行物質 X 比較（模擬 24 小時）</button><p id="extensionStatus" role="status">等待預測及理由</p></article>
    <article class="vl3-card" id="extensionResults"><h3>黑暗中的四個延伸二裝置</h3><p>所有胚芽鞘均切去頂端，初始大小相近，置於黑暗；瓊脂大小、培養時間、溫度及供水相同。初始與培養後可切換查看。套上瓊脂不代表機械壓住胚芽鞘。</p><p class="notice">培養時間、逐漸生長動畫及角度均為教學模擬，不是真實量度或精確實驗常數。</p><label>查看狀態<select id="extensionView"><option value="after">目前培養狀態</option><option value="before">培養開始時</option></select></label><div id="extensionBench" class="bench"></div><button id="confirmExtension" class="primary">確認延伸觀察及讀數</button><div id="extensionTable"></div></article>
    <article class="vl3-card" id="extensionAnalysis"><h3>分析物質 X 的作用線索</h3>
    ${selectHTML("extEF", { transfer: "頂端可能產生可轉移的生長促進作用。", agar: "所有瓊脂都會產生相同的生長促進作用。" }, "", "1. E 與 F 的比較支持甚麼？")}
    ${extensionPositionHTML()}
    <fieldset class="cloze-question" aria-label="瓊脂作用推論"><p>3. ${extensionClozeSentence(extensionClozeSelect)}</p></fieldset>
    </article>`;
  document.querySelector("#runExtension").onclick = runExtension;
  document.querySelector("#confirmExtension").onclick = confirmExtension;
  document.querySelectorAll('[name="extPositionChoice"]').forEach(input => {
    input.onchange = () => {
      $("#extPosition").value = input.value;
      $("#extPosition").dispatchEvent(new Event("input", {bubbles:true}));
    };
  });
  document.querySelector("#extensionView").onchange = () => {
    renderExtensionPlants();
    log("extension_view_changed", { view: $("#extensionView").value });
  };
  document.querySelector("#toExtension").onclick = () => {
    readForm();
    if (
      !Object.keys(MAIN_ANSWERS).every((k) => state.form[k])
    )
      return remind(
        "請先完成主探究的三項推論。",
        firstEmptyField(Object.keys(MAIN_ANSWERS)),
      );
    state.tipInquiry.unlocked = true;
    if (!state.firstMainAnalysis)
      state.firstMainAnalysis = {
        at: new Date().toISOString(),
        answers: Object.fromEntries(
          Object.keys(MAIN_ANSWERS).map((k) => [k, state.form[k]]),
        ),
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
  const growth = (model.growth === "none" ? 0 : 45) * p;
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
  const offset = id === "G" ? -8 : id === "H" ? 8 : 0;
  return `<svg class="extension-plant" viewBox="0 0 300 280" role="img" aria-label="延伸裝置 ${id}，黑暗培養示意，請自行觀察及量度"><rect x="1" y="1" width="298" height="276" rx="16" fill="#f2f4f8"/><text x="12" y="274" font-size="12" fill="#526170">黑暗 · ${p === 0 ? "開始時" : "培養後"}</text><path data-ext-stem="${id}" d="${stem}" fill="none" stroke="#58a16b" stroke-width="12"/><path d="${stem}" fill="none" stroke="#a1d38a" stroke-width="3"/>
  <g data-agar-block="${id}" transform="translate(${x} ${y}) rotate(${signed})"><rect x="${offset - 9}" y="-10" width="18" height="10" rx="2" fill="#b5e4e6" stroke="#7dabad"/></g><path d="M118 235H182L172 267H128Z" fill="#d6a878"/><rect x="111" y="231" width="78" height="12" rx="4" fill="#af7851"/>
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
  return `<g data-protractor="true"><path d="M${x - radius} ${y}A${radius} ${radius} 0 0 1 ${x + radius} ${y}" fill="none" stroke="#9cbbc2"/>${marks}<path data-vertical-reference="true" d="M${x} ${y + 14}V${Math.max(24, y - 90)}" stroke="#79868c" stroke-dasharray="4 3"/><path data-protractor-pointer="true" d="M${x - Math.sin(a) * 80} ${y + Math.cos(a) * 80}L${x + Math.sin(a) * 88} ${y - Math.cos(a) * 88}" stroke="#cc7b30" stroke-width="2"/><circle cx="${x}" cy="${y}" r="3" fill="#cc7b30"/></g>`;
}
function resetExtension() {
  extensionGeneration++;
  extensionRunning = false;
  extensionHasRun = false;
  extensionRulerUsed.clear();
  $$('[name="extPositionChoice"]').forEach(input => input.checked = false);
  $("#extensionSection").hidden = true;
  $("#extensionStatus").textContent = "等待預測及理由";
  $("#extensionView").value = "after";
  renderExtensionBench();
  $("#extensionTable").innerHTML = "";
}
function renderExtensionBench() {
  $("#extensionBench").innerHTML = EXT_IDS.map(
    (id) =>
      `<article class="specimen"><h3>${id} · ${EXT_LABELS[id]}</h3><div id="ext-plant-${id}">${extensionPlant(id)}</div><label for="ruler-${id}">量角器指針（左右調整）<span class="ruler-control">${["G", "H"].includes(id) ? `<svg id="ruler-hint-${id}" class="ruler-hint" viewBox="0 0 22 24" aria-hidden="true" hidden><path d="M11 2V20M4 13L11 20L18 13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}<input id="ruler-${id}" type="range" min="-90" max="90" step="1" value="0"></span><output id="ruler-output-${id}">0°</output></label><button id="read-angle-${id}" class="secondary">把指針讀數填入角度</button><label for="ext-angle-${id}">偏離鉛直角度（°）<input id="ext-angle-${id}" type="number" min="0" max="90" step="1"></label>${selectHTML("ext-direction-" + id, DIRECTIONS, "", "彎曲方向")}</article>`,
  ).join("");
  EXT_IDS.forEach((id) => {
    $("#ruler-" + id).oninput = () => {
      extensionRulerUsed.add(id);
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
    ["angle", "direction"].forEach(
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
  EXT_IDS.forEach(id => {
      $("#ext-plant-" + id).innerHTML = extensionPlant(
        id,
        p,
        Number($("#ruler-" + id).value),
        extensionHasRun && !extensionRunning && p === 1,
      );
      const hint = $("#ruler-hint-" + id);
      if (hint) {
        hint.toggleAttribute("hidden", p !== 1 || !extensionHasRun || extensionRunning || !!state.submittedAt || extensionRulerUsed.has(id));
        hint.style.left = ((Number($("#ruler-" + id).value) + 90) / 180 * 100) + "%";
      }
  });
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
    !["extPrediction", "extReason"].every((k) =>
      state.form[k].trim(),
    )
  )
    return remind(
      "請完成延伸預測及理由。",
      firstEmptyField(["extPrediction", "extReason"]),
    );
  if (!state.extension.initialPrediction)
    state.extension.initialPrediction = {
      at: new Date().toISOString(),
      prediction: state.form.extPrediction,
      reason: state.form.extReason,
    };
  extensionRunning = true;
  extensionHasRun = false;
  extensionRulerUsed.clear();
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
        direction: $("#ext-direction-" + id).value,
      },
    ]),
  );
  const incomplete = EXT_IDS.find(
    (id) =>
      !validAngle(readings[id].angle) ||
      !DIRECTIONS[readings[id].direction],
  );
  if (incomplete) {
    const field = !validAngle(readings[incomplete].angle)
      ? "angle"
      : "direction";
    return remind(
      "請完成四組角度（0–90°）及方向。",
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
  message("延伸讀數已保存，請用自己的讀數分析。");
}
function extensionTableHTML(readings) {
  const showGrowth = Object.values(readings).some((reading) => reading.growth);
  return `<div class="table-wrap"><table class="vl3-table"><thead><tr><th>裝置</th><th>處理</th>${showGrowth ? "<th>延長</th>" : ""}<th>角度（°）</th><th>方向</th></tr></thead><tbody>${EXT_IDS.map((id) => `<tr><td>${id}</td><td>${esc(EXT_LABELS[id])}</td>${showGrowth ? `<td>${esc(GROWTH[readings[id]?.growth] || "未記錄")}</td>` : ""}<td>${esc(readings[id]?.angle ?? "未記錄")}</td><td>${esc(DIRECTIONS[readings[id]?.direction] || "未記錄")}</td></tr>`).join("")}</tbody></table></div>`;
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
function extensionMissing() {
  const missing = [];
  if (!state.extension.initialPrediction) missing.push("延伸原始預測及實驗");
  if (
    !state.extension.hasRun ||
    !EXT_IDS.every((id) => state.extension.readings[id])
  )
    missing.push("四組延伸讀數");
  if (
    !Object.keys(EXT_ANSWERS).every((k) => state.form[k])
  )
    missing.push("延伸分析");
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
  if (locked) $$(".ruler-hint").forEach(hint => hint.setAttribute("hidden", ""));
}
function learningPointsHTML() {
  return `<ol class="learning-points">
    <li><span>植物因光照方向而產生的定向生長反應稱為</span> <strong class="learning-highlight">「向光性」</strong><span>；向光源生長屬於「正向光性」。</span></li>
    <li><span>在這個燕麥胚芽鞘模型中，</span> <strong class="learning-highlight">頂端</strong> <span>參與</span> <strong class="learning-highlight">感受單側光照</strong><span>。</span></li>
    <li><span>本探究中暫稱的「物質 X」，可結合其他研究理解為</span> <strong class="learning-highlight">生長素</strong><span>。生長素是影響植物生長的激素；頂端可產生能</span> <strong class="learning-highlight">向下傳遞</strong><span>的生長促進作用。</span></li>
    <li><span>單側光照下，</span> <strong class="learning-highlight">背光側生長素較多，該側細胞延長較多，使胚芽鞘向光彎曲</strong><span>。</span></li>
  </ol>`;
}
function mechanismSVG() {
  const dots = (positions, radius = 2.5) => positions.map(([x, y]) =>
    `<circle cx="${x}" cy="${y}" r="${radius}" fill="#d94b4b"/>`).join("");
  const auxin = dots([
    [144.5, 128.9], [197.9, 204], [178.8, 158.1], [152.2, 133],
    [199.8, 190.3], [189.3, 182], [190.9, 188.3], [182.5, 169],
    [202.8, 200.5], [164, 151.2], [157.4, 145.5], [194.9, 182.2],
    [172.1, 158.8], [179.1, 163.4], [184.2, 178.3], [135.9, 131.1],
    [204.4, 208.1], [143.6, 134.7], [186.6, 172.6], [174.3, 153.8],
    [196.6, 198], [164.6, 145.6], [148.3, 137.2], [154.9, 138.8],
    [190.8, 176.8], [161.8, 140.2], [207.4, 212.7], [169.2, 170.2],
    [155.9, 155.7], [191.1, 208], [181.9, 189.2], [192.8, 214.2],
  ]);
  // Equal numbers of cells on the two sides: the outer (shaded) cells have longer arcs.
  const point = (radius, angle) => {
    const radians = angle * Math.PI / 180;
    return [490 + radius * Math.cos(radians), 292 - radius * Math.sin(radians)];
  };
  const xy = (radius, angle) => point(radius, angle).map(n => n.toFixed(1)).join(" ");
  const cell = (inner, outer, start, end, side) =>
    `<path data-cell-side="${side}" d="M${xy(inner, start)}L${xy(outer, start)}A${outer} ${outer} 0 0 0 ${xy(outer, end)}L${xy(inner, end)}A${inner} ${inner} 0 0 1 ${xy(inner, start)}Z" fill="${side === "shaded" ? "#d7edaa" : "#e4f3d7"}" stroke="#65a772" stroke-width="2"/>`;
  const cells = Array.from({length: 5}, (_, i) => {
    const start = i * 11.2, end = start + 11.2, middle = (start + end) / 2;
    return cell(125, 165, start, end, "lit") + cell(165, 205, start, end, "shaded") +
      dots([point(145, middle)]) +
      dots([point(180, middle - 2), point(191, middle - 2), point(180, middle + 2), point(191, middle + 2)]);
  }).join("");
  const cellLengthArrow = (radius, side, color) => {
    const start = 11.2, end = 22.4;
    const head = (angle, direction) => {
      const [x, y] = point(radius, angle), radians = angle * Math.PI / 180;
      const tx = -Math.sin(radians) * direction, ty = -Math.cos(radians) * direction;
      const nx = Math.cos(radians), ny = -Math.sin(radians);
      return `M${(x + tx * 4 + nx * 3).toFixed(1)} ${(y + ty * 4 + ny * 3).toFixed(1)}L${x.toFixed(1)} ${y.toFixed(1)}L${(x + tx * 4 - nx * 3).toFixed(1)} ${(y + ty * 4 - ny * 3).toFixed(1)}`;
    };
    return `<g data-cell-length-arrow="${side}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M${xy(radius, start)}A${radius} ${radius} 0 0 0 ${xy(radius, end)}"/><path d="${head(start, 1)}${head(end, -1)}"/></g>`;
  };
  const lengthArrows = cellLengthArrow(116, "lit", "#2572b8") + cellLengthArrow(214, "shaded", "#c22b32");
  const [tipX, tipY] = point(165, 56);
  return `<svg class="mechanism-svg" viewBox="0 0 820 390" role="img" aria-label="左側光照下，完整頂端的胚芽鞘背光側生長素較多；放大圖顯示背光側細胞延長較多，使胚芽鞘向光彎曲。"><rect x="5" y="5" width="395" height="375" rx="18" fill="#edf8f2"/><rect x="420" y="5" width="395" height="375" rx="18" fill="#edf8f2"/>
  <text x="202" y="35" text-anchor="middle" font-size="17">1 · 左側光照</text><path d="M202 310L202 240C202 196 167 150 133 131" fill="none" stroke="#65a772" stroke-width="26"/><circle data-intact-tip="true" cx="133" cy="131" r="13" fill="#65a772"/><path d="M212 306L212 240C213 191 171 143 139 122" fill="none" stroke="#d5e989" stroke-width="5" stroke-linecap="round"/><g data-auxin-dots="true">${auxin}</g><rect x="30" y="92" width="13" height="55" rx="4" fill="#f3b946"/><path d="M50 120H108M99 112L108 120L99 128" stroke="#bb8725" fill="none"/><text x="34" y="76" font-size="14">光源</text><text x="68" y="178" font-size="14">向左彎曲</text><text x="240" y="115" font-size="14" fill="#c22b32">右側＝背光側</text><text x="240" y="141" font-size="14" fill="#c22b32">生長素較多</text><text x="240" y="167" font-size="14" fill="#c22b32">細胞延長較多</text><path d="M239 178L189 191" fill="none" stroke="#526d71"/><text x="225" y="260" font-size="13">頂端以下彎曲</text><text x="35" y="342" font-size="13">頂端感光 → 生長訊號向下傳遞</text><circle cx="40" cy="363" r="3" fill="#d94b4b"/><text x="52" y="368" font-size="12">紅點＝生長素</text>
  <text x="618" y="35" text-anchor="middle" font-size="17">2 · 左側光照：細胞放大</text><circle cx="${tipX}" cy="${tipY}" r="40" fill="#e4f3d7" stroke="#65a772" stroke-width="2"/>${cells}${lengthArrows}<rect x="438" y="170" width="10" height="46" rx="3" fill="#f3b946"/><path d="M455 193H515M507 185L515 193L507 201" fill="none" stroke="#bb8725"/><text x="437" y="155" font-size="13">光源</text><text x="440" y="92" font-size="14">向左彎曲</text><text x="695" y="101" font-size="13">右側＝背光側</text><text x="695" y="124" font-size="13">生長素較多</text><path d="M695 132L645 169" fill="none" stroke="#526d71"/><text x="592" y="265" text-anchor="end" data-label-width="152" font-size="13" fill="#2572b8">細胞延長較少</text><text x="713" y="237" data-label-width="92" font-size="13" fill="#c22b32">細胞延長較多</text><text x="440" y="342" font-size="13">背光側延長較多 → 向左彎曲</text></svg>`;
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
  if (record.experimentVersion >= 6 && MAIN_QUESTION_LABELS[id]) return MAIN_QUESTION_LABELS[id];
  if (id === "extPosition") return EXT_POSITION_QUESTION;
  if (id === "extSides") return "3. 兩側延長差異與彎曲方向有甚麼關係？";
  if (id === "substancePrediction") return "2. 哪個想法值得下一步測試？";
  if (id === "extDark") return "4. 黑暗下仍可彎曲提供甚麼線索？";
  if (id === "extLimit") return "5. 延伸結果的證據限制是甚麼？";
  if (record.experimentVersion === 5 && VERSION5_MAIN_QUESTIONS[id]) return VERSION5_MAIN_QUESTIONS[id];
  if (!threeStage(record) && PREVIOUS_MAIN_QUESTIONS[id])
    return PREVIOUS_MAIN_QUESTIONS[id];
  const label = document.querySelector("#" + id)?.closest("label");
  return label ? [...label.childNodes]
    .filter(node => node.nodeType !== Node.ELEMENT_NODE || !node.matches("input,select,textarea"))
    .map(node => VL3Language.sourceText(node)).join("").trim() || id : id;
}
function answerOption(id, value, record) {
  if (id === "extPosition") return (record && record.experimentVersion < 18
    ? {position:"生長作用的位置影響彎曲方向。", noEffect:"放置位置不影響彎曲方向。"}
    : EXT_POSITION_OPTIONS)[value] || "未回答";
  if (Object.hasOwn(EXT_CLOZE_ANSWERS, id)) return (id === "extBendDirection" ? {left:"左",right:"右"} : {more:"多",less:"少"})[value] || "未回答";
  if (id === "extSides") return {opposite:"左側延長較多向右彎曲；右側延長較多向左彎曲。",same:"哪側延長較多，就向哪側彎曲。"}[value] || "";
  if (id === "substancePrediction") return { possible: "頂端可能產生能向下傳遞的物質 X，促進下方延長；這個想法仍需測試。", proof: "單靠切頂結果，已能確定物質 X 的身分和作用方式。" }[value] || "";
  if (["extFair", "extEvidence", "extControl"].includes(id)) return value || "";
  if (id === "extDark") return { unequal: "彎曲可由不均勻生長造成，並非一定要直接受光才發生。", light: "黑暗下的彎曲必定是光直接推動胚芽鞘。" }[value] || "";
  if (id === "extLimit") return { limited: "只能支持可轉移的生長促進作用，不能單獨確定物質身分，也沒有直接量得光照下的分布。", proof: "可以單靠瓊脂結果確定物質身分及光照下的分布。" }[value] || "";
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
function variableReportHTML(record) {
  const definitions = variableDefinitions(record);
  return [["iv", "獨立變量"], ["dv", "因變量"], ["cv", "控制變量"]]
    .map(([key, title]) => {
      const selected = record.variables[key];
      return reportAnswer(
        title,
        selected.map(id => definitions[id]).join("；"),
        EXPECTED[key].map(id => definitions[id]).join("；"),
        selected.length ? sameSet(selected, EXPECTED[key]) : null,
      );
    }).join("");
}
function extensionClozeReport(record) {
  const answered = Object.keys(EXT_CLOZE_ANSWERS).every(id => record.form[id]);
  const correct = Object.entries(EXT_CLOZE_ANSWERS).every(([id, target]) => record.form[id] === target);
  const sentence = answers => extensionClozeSentence(id => `<span>${esc(answerOption(id, answers[id], record))}</span>`);
  return `<div class="report-answer" data-cloze-report>${record.experimentVersion < 18 ? `<strong>${EXT_CLOZE_TITLE}</strong>` : ""}${answered ? ` <b class="${correct ? "answer-correct" : "answer-wrong"}">${correct ? "✓" : "✕"}</b>` : ""}<p>${record.experimentVersion >= 18 ? "3. " : ""}${sentence(record.form)}</p><p class="report-reference"><span>參考答案：</span>${sentence(EXT_CLOZE_ANSWERS)}</p></div>`;
}
function reflectionReport(record, open) {
  const reference = record.experimentVersion >= 17 ? REFLECTION_REFERENCE : threeStage(record)
    ? "引用遮光主探究、頂端比較及瓊脂延伸各一項比較，修訂三段原始預測，連結感光、生長訊號與不均勻延長。由教師評閱，不自動判錯。"
    : "引用主探究及延伸各一項比較，修訂兩次原始預測，連結感光、生長訊號與不均勻延長。由教師評閱，不自動判錯。";
  return `<section class="report-card"><h2>學習反思</h2>${record.experimentVersion >= 17 ? `<p>${REFLECTION_PROMPT}</p>${reflectionContext()}` : ""}${open("實際反思", record.form.reflection, reference)}</section>`;
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
    "單側光與物質 X 的推論",
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
  <section class="report-card"><h2>02 · 設計主探究</h2>${open("原始假說", o?.hypothesisText || hypothesis(initial, 3), "可測試的部位、遮光處理及預期反應；預測不符不代表假說不合理。")}${open("原始理由", initial.reason, "說明為甚麼作出該預測。")}${open("最後假說", hypothesis(f, 3), "保留修訂後內容，原始答案不覆蓋。")}${initial.comparison ? open("指定比較（舊版）", answerOption("comparison", initial.comparison), "A–B：頂端遮光；A–C：頂端是否存在；A–D：下部遮光。") : ""}${variableReportHTML(r)}${open("探究假設", r.assumptions.map((id) => assumptionsFor(r).find((a) => a[0] === id)?.[1]).join("；"), "初始狀況相近；帽及套不限制生長；處理不造成明顯溫差。相同種類仍需控制大小。")}${open("對照設計", f.controlPlan, threeStage(r) ? `保留 A 完整不遮蓋，與 B 頂端遮光及 ${sampleName("D", r)} 下部遮光比較，其他條件相同。` : "保留 A 完整不遮蓋；按三項指定比較保持其他條件相同。")}${open("裝置設計", r.setup.description, threeStage(r) ? `A、B、${sampleName("D", r)} 三組遮光處理、單側光源及固定條件清楚；圖片與文字由教師評閱。` : "四組處理、單側光源及固定條件清楚；圖片與文字由教師評閱。")}${safeImage(r.setup.image) ? `<img src="${r.setup.image}" alt="學生實驗裝置設計">` : ""}</section>
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
  <section class="report-card"><h2>04 · 主探究分析</h2>${questions(mainAnswersFor(r))}${r.experimentVersion < 10 ? open("數據推論", f.evidence, threeStage(r) ? `比較 A–B 及 A–${sampleName("D", r)} 的彎曲方向，說明哪個部位可能感受光。` : "以 A–B、A–C、A–D 的具體比較支持推論，留意傷口、溫度及機械限制。") : ""}</section>
  ${threeStage(r) ? tipReportHTML(r) : ""}
  <section class="report-card"><h2>${threeStage(r) ? "04 · 延伸探究二：物質 X" : "04 · 延伸預測與觀察"}</h2>${open("原始預測", DIRECTIONS[e.initialPrediction?.prediction], "處理瓊脂放左側，模型中左側延長較多而向右彎曲；原始預測由教師按可測試性評閱。")}${open("原始理由", e.initialPrediction?.reason, "合理理由不因結果不符直接判錯。")}${r.experimentVersion < 12 ? open("公平比較", f.extFair, "E–F 均放中央，保持瓊脂大小、胚芽鞘初始大小及狀況、黑暗、溫度、供水及時間相同。") : ""}<h3>首次確認讀數</h3>${firstExt}<h3>最後讀數</h3>${extensionTableHTML(e.readings)}${EXT_IDS.map((id) => reportAnswer(id + " 最終角度", e.readings[id]?.angle === undefined ? "" : e.readings[id].angle + "°", extensionAngleReference(id), e.readings[id] ? extensionAngleCorrect(id, e.readings[id].angle) : null)).join("")}${r.experimentVersion < 9 ? `<h3>學生棒形圖</h3>${Object.keys(e.graph).length ? barChartSVG(e.graph) : "未確認"}<p class="report-reference">圖表以學生本身讀數核對；量度準確性另與模型比較。不用鉛直高度差推算延長量。</p>` : ""}</section>
  <section class="report-card"><h2>${threeStage(r) ? "04 · 延伸二分析" : "04 · 延伸分析"}</h2>${r.experimentVersion >= 16 ? questions({extEF:"transfer",extPosition:"position"}) + extensionClozeReport(r) : questions(extensionAnswersFor(r))}${r.experimentVersion >= 13 && r.experimentVersion < 17 ? open("單側光與物質 X 的推論", f.extLightInference, "單側光可能使物質 X 移向背光側，再向下傳遞，促進背光側細胞延長。背光側延長較多，使胚芽鞘向光彎曲；這是結合比較結果提出的推論，瓊脂實驗並未直接觀察光照下物質 X 的分布。") : ""}${r.experimentVersion < 9 ? open("延伸證據", f.extEvidence, "E–F 支持可轉移的生長促進作用；G–H 支持作用位置影響彎曲方向。") : ""}${r.experimentVersion < 9 ? open("額外對照（選答）", f.extControl, "可把空白瓊脂放左側及右側，以排除單側放置本身的影響。") : ""}</section>
  ${r.submittedAt ? `<section class="report-card"><h2>學習重點</h2>${r.experimentVersion >= 17 ? learningPointsHTML() : `<p>向光性是因光照方向而產生的定向生長；向光源屬正向光性。頂端參與感光，生長素是影響植物生長的激素。${threeStage(r) ? "探究中的物質 X 可結合其他研究理解為生長素；瓊脂比較本身並未鑑定其身分。" : ""}背光側生長素較多、細胞延長較多，使胚芽鞘向光彎曲。</p>`}${mechanismSVG()}${r.experimentVersion < 14 ? `<p class="report-reference">本模型未直接鑑定瓊脂內的物質或量得單側光下的生長素分布；名稱及機制由其他研究支持。</p>` : ""}${r.experimentVersion < 14 ? reportAnswer("名稱檢核", answerOption("knowledgeName", f.knowledgeName), "正向光性", f.knowledgeName ? f.knowledgeName === "positive" : null) : ""}</section>` : ""}
  ${reflectionReport(r, open)}<p class="report-reference">動畫、24 小時及角度為教學模擬。學生報告不顯示分數。</p>`;
}
function graphScore(r) {
  if (r.experimentVersion >= 9) return null;
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
function extensionAngleTolerance(id) {
  return ["G", "H"].includes(id) ? 2 : 0;
}
function extensionAngleReference(id) {
  const tolerance = extensionAngleTolerance(id);
  return EXT_MODEL[id].angle + "°（教學模型" + (tolerance ? "；±" + tolerance + "°" : "") + "）";
}
function extensionAngleCorrect(id, angle) {
  return validAngle(angle) && Math.abs(Number(angle) - EXT_MODEL[id].angle) <= extensionAngleTolerance(id);
}
function angleScore(r) {
  return (
    EXT_IDS.filter(
      (id) =>
        r.extension.readings[id] &&
        extensionAngleCorrect(id, r.extension.readings[id].angle),
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
    ...extensionAnswersFor(r),
  };
  const weight = id => r.experimentVersion >= 16 && Object.hasOwn(EXT_CLOZE_ANSWERS, id) ? 1 / 3 : 1;
  const possible = Object.keys(answers).reduce((sum, id) => sum + weight(id), 0);
  const earned = Object.entries(answers).reduce((sum, [id, target]) => sum + (r.form[id] === target ? weight(id) : 0), 0);
  return Math.round(earned / possible * 200) / 100;
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
