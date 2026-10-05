"use strict";
const MODULE_ID = "VL_BIO_PHOTOTROPISM";
const CURRENT_KEY = "phototropismLab.current.v1",
  RECORDS_KEY = "phototropismLab.records.v1";
const TEACHER_EMAIL = "tzechingchan0605@gmail.com";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const clone = (v) => structuredClone(v);
const GROUPS = {
  A: { label: "不遮光", bend: true },
  B: { label: "頂端不透光罩", bend: false },
  C: { label: "切去頂端", bend: false },
  D: { label: "頂端以下位置遮光", bend: true },
};
// Preserve the meaning and scoring of records from the original transparent-cap experiment.
const LEGACY_GROUPS = { ...GROUPS, C: { label: "頂端透明罩", bend: true } };
function groupDefinitions(record) {
  return record.experimentVersion >= 2 ? GROUPS : LEGACY_GROUPS;
}
function comparisonAnswer(record) {
  return record.experimentVersion >= 2 ? "tipRole" : "light";
}
function limitationText(record) {
  if (newExperiment(record))
    return (
      {
        indirect:
          "切頂也移除其他組織並造成傷口；遮光比較須假設溫度及機械限制受到控制，不能確定頂端只負責感光。",
        proof: "只要切頂組不彎曲，就能確定頂端只負責感光。",
      }[record.form.qLimit] || ""
    );
  if (record.experimentVersion >= 2)
    return (
      {
        indirect:
          "只比較處理方法與彎曲反應，不能單靠這些觀察確定內部作用機制。",
        proof: "只要看到彎曲，就能完全確定胚芽鞘內部的作用機制。",
      }[record.form.qLimit] || ""
    );
  return (
    { indirect: "沒有直接量度生長素。", proof: "彎曲直接證明生長素濃度。" }[
      record.form.qLimit
    ] || ""
  );
}
function comparisonText(record) {
  if (record.experimentVersion >= 2)
    return (
      {
        tipRole: "頂端對向光彎曲起重要作用。",
        noEffect: "切去頂端不影響向光彎曲。",
      }[record.form.qCap] || ""
    );
  return (
    {
      light: "頂端是否受光會影響向光彎曲。",
      cap: "只要頂端套有罩子，就不會向光彎曲。",
    }[record.form.qCap] || ""
  );
}
const OUTCOMES = { bend: "仍向光彎曲", straight: "沒有明顯向光彎曲" };
const VARIABLES = [
  "遮光處理／部位或頂端是否存在",
  "胚芽鞘的伸長及彎曲反應",
  "光源方向及光強度",
  "胚芽鞘種類、初始高度及生長階段",
  "照射時間",
  "溫度及供水條件",
];
// Display order is independent of the stable IDs stored in student records.
const VARIABLE_DISPLAY_ORDER = [4, 1, 2, 3, 0, 5];
const EXPECTED = { iv: [0], dv: [1], cv: [2, 3, 4, 5] };
const LEGACY_ASSUMPTIONS = [
  ["similar", "胚芽鞘種類、初始高度及生長階段相近。", true],
  ["different", "各組可使用不同溫度及供水條件。", false],
  ["free", "罩子及套筒不限制胚芽鞘生長。", true],
  ["light", "各組使用相同方向、強度及照射時間的單側光照。", true],
];
const ASSUMPTIONS = [
  ["similar", "各胚芽鞘的初始生長狀況相近。", true],
  ["free", "遮光帽及遮光套不限制胚芽鞘伸長或彎曲。", true],
  ["temperature", "各處理不會令裝置溫度明顯不同。", true],
  ["size", "植物種類相同便毋須控制初始大小。", false],
];
const FIELDS = [
  "observation",
  "hypothesisPart",
  "hypothesisOutcome",
  "reason",
  "controlPlan",
  "setupDescription",
  "qTip",
  "qCap",
  "qBelow",
  "qLimit",
  "evidence",
  "reflection",
  ...NEW_FIELDS,
];
const ANSWERS = {
  qTip: "tip",
  qCap: "tipRole",
  qBelow: "bend",
  qLimit: "indirect",
};
let state,
  running = false,
  hasRun = false,
  drawMade = false,
  drawing = false,
  runGeneration = 0,
  lastActive = Date.now(),
  timingVisible = !document.hidden,
  persistenceOK = true,
  allowUnload = false;
let sharedRecords = [],
  dashboardGeneration = 0;
const storageErrors = new Set();
let cloudSync;
let toastTimer;
function fresh(profile = null) {
  return {
    moduleId: MODULE_ID,
    schemaVersion: 1,
    experimentVersion: 4,
    id: crypto.randomUUID(),
    profile,
    createdAt: new Date().toISOString(),
    savedAt: null,
    phase: 1,
    unlocked: 1,
    form: Object.fromEntries(FIELDS.map((f) => [f, ""])),
    variables: { iv: [], dv: [], cv: [] },
    assumptions: [],
    setup: { saved: false, method: "", image: "", description: "" },
    initialDesign: null,
    observations: {},
    firstObservations: null,
    firstObservationsAt: null,
    finalAnswers: null,
    extension: {
      unlocked: false,
      hasRun: false,
      initialPrediction: null,
      firstReadings: null,
      readings: {},
      firstGraph: null,
      graph: {},
      graphSaved: false,
    },
    submittedAt: null,
    reflectionSubmittedAt: null,
    events: [],
    phaseDurations: { 1: 0, 2: 0, 3: 0, 4: 0 },
  };
}
function teacher() {
  return state?.profile?.email === TEACHER_EMAIL;
}
function message(text) {
  $("#status").textContent = text;
  const toast = $("#toast");
  toast.textContent = text;
  toast.classList.toggle("show", !!text);
  clearTimeout(toastTimer);
  if (text) toastTimer = setTimeout(() => toast.classList.remove("show"), 6500);
}
function firstEmptyField(ids) {
  const id = ids.find((id) => !$("#" + id).value.trim());
  return id ? "#" + id : null;
}
function remind(text, selector) {
  message(text);
  const target = selector && $(selector);
  if (!target) return;
  target.scrollIntoView({ block: "center", behavior: scrollBehavior() });
  const control = target.matches("input,textarea,select,button")
    ? target
    : target.querySelector(
        "input:not(:disabled),textarea:not(:disabled),select:not(:disabled),button:not(:disabled)",
      );
  control?.focus({ preventScroll: true });
}
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    storageErrors.add(key);
    return fallback;
  }
}
function valid(r) {
  return (
    !!r &&
    r.moduleId === MODULE_ID &&
    r.schemaVersion === 1 &&
    typeof r.id === "string" &&
    r.profile &&
    typeof r.profile.name === "string" &&
    typeof r.profile.classInfo === "string" &&
    typeof r.profile.email === "string" &&
    r.form &&
    FIELDS.filter((f) => !NEW_FIELDS.includes(f) || newExperiment(r)).every(
      (f) => typeof r.form[f] === "string",
    ) &&
    r.variables &&
    ["iv", "dv", "cv"].every((g) => Array.isArray(r.variables[g])) &&
    Array.isArray(r.assumptions) &&
    Array.isArray(r.events) &&
    r.setup &&
    r.observations &&
    r.phaseDurations &&
    (!newExperiment(r) ||
      (r.extension && r.extension.readings && r.extension.graph)) &&
    (!r.initialDesign ||
      (r.initialDesign.form && typeof r.initialDesign.form.reason === "string"))
  );
}
function records() {
  const r = readJSON(RECORDS_KEY, []);
  if (storageErrors.has(RECORDS_KEY) || !Array.isArray(r))
    throw Error("本機學生紀錄損壞，原資料已保留，未以空紀錄覆寫");
  if (r.some((record) => !valid(record))) {
    storageErrors.add(RECORDS_KEY);
    throw Error("本機紀錄包含不完整資料，原值保留，未以部分資料覆寫");
  }
  return r;
}
function accountTime() {
  const now = Date.now();
  if (state?.profile && timingVisible)
    state.phaseDurations[state.phase] += (now - lastActive) / 1000;
  lastActive = now;
}
function readForm() {
  if (!state.submittedAt)
    FIELDS.filter((f) => !["reflection", "knowledgeName"].includes(f)).forEach(
      (f) => (state.form[f] = $("#" + f).value),
    );
  if (!state.reflectionSubmittedAt)
    state.form.reflection = $("#reflection").value;
  if (state.submittedAt && !state.reflectionSubmittedAt)
    state.form.knowledgeName = $("#knowledgeName").value;
}
function save() {
  if (!state?.profile || teacher()) return;
  accountTime();
  readForm();
  state.savedAt = new Date(
    Math.max(Date.now(), (Date.parse(state.savedAt) || 0) + 1),
  ).toISOString();
  try {
    const rows = records().filter((r) => r.id !== state.id);
    rows.push(clone(state));
    localStorage.setItem(RECORDS_KEY, JSON.stringify(rows));
    if (!storageErrors.has(CURRENT_KEY))
      localStorage.setItem(CURRENT_KEY, JSON.stringify(state));
    persistenceOK = true;
  } catch {
    persistenceOK = false;
    message("瀏覽器未能儲存紀錄。請下載紀錄備份，避免關閉後遺失。");
  }
  queueSync(state);
}
function log(type, detail = {}) {
  if (!state?.profile || teacher()) return;
  state.events.push({
    at: new Date().toISOString(),
    phase: state.phase,
    type,
    detail: clone(detail),
  });
  save();
}
function phase(n) {
  if (n > state.unlocked) return;
  accountTime();
  state.phase = n;
  $$(".phase").forEach((el) =>
    el.classList.toggle("active", el.id === "phase-" + n),
  );
  $$("[data-phase]").forEach((b) => {
    b.classList.toggle("active", +b.dataset.phase === n);
    b.disabled = +b.dataset.phase > state.unlocked;
    b.setAttribute("aria-current", +b.dataset.phase === n ? "step" : "false");
  });
  if (n === 4) renderEvidence();
  log("phase_opened", { phase: n });
}
function hypothesis(form, version = state?.experimentVersion) {
  if (version >= 3) {
    // Preserve the sentence used by previous free-text investigations.
    const condition = Object.hasOwn(form, "initialIdea")
      ? "即使下部仍然受光"
      : "而其他部位仍然受光";
    return `若胚芽鞘${form.hypothesisPart || "【未選擇部位】"}被遮光，${condition}，胚芽鞘將會${OUTCOMES[form.hypothesisOutcome] || "【未選擇反應】"}。`;
  }
  return `若胚芽鞘的${form.hypothesisPart === "tip" ? "頂端" : form.hypothesisPart === "below" ? "頂端以下位置" : "【未選擇部位】"}被遮光，而其他部位仍然受光，胚芽鞘將會${OUTCOMES[form.hypothesisOutcome] || "【未選擇反應】"}。`;
}
function seedling(id, progress = 0) {
  const p = Math.max(0, Math.min(1, progress));
  const bent = GROUPS[id].bend;
  // An intact tip supports elongation; the decapitated model has no obvious elongation.
  const tipX = 130 + (bent ? 55 * p : 0);
  const tipY = id === "C" ? 130 : 110 - 32 * p;
  const jointY = 158 - (bent ? 8 * p : 0);
  const stem = `M130 207 L130 ${jointY} C130 ${jointY - 34} ${130 + (bent ? 15 * p : 0)} ${tipY + 17} ${tipX} ${tipY}`;
  let cover = "";
  if (id === "B")
    cover = `<path d="M${tipX - 13} ${tipY + 23}V${tipY - 8}Q${tipX} ${tipY - 22} ${tipX + 13} ${tipY - 8}V${tipY + 23}Z" fill="#344a50" stroke="#15333b" stroke-width="2"/>`;
  if (id === "C")
    cover = `<path data-cut-surface="true" d="M122 ${tipY}H138" stroke="#d6eaba" stroke-width="4" stroke-linecap="butt"/>`;
  if (id === "D") {
    const endX = 130 + 39 * p,
      endY = tipY + 13;
    const sleeve = `M130 205 L130 ${jointY} C130 ${jointY - 31} ${130 + 12 * p} ${endY + 14} ${endX} ${endY}`;
    cover = `<path data-sleeve="true" d="${sleeve}" fill="none" stroke="#15333b" stroke-width="26" stroke-linecap="butt"/><path d="${sleeve}" fill="none" stroke="#344a50" stroke-width="22" stroke-linecap="butt"/>`;
  }
  const description = `${id} 組：${GROUPS[id].label}，${p === 1 ? (id === "C" ? "沒有明顯伸長，沒有明顯彎曲" : bent ? "下部保持直立，上部向光彎曲並伸長" : "保持直立並伸長") : "開始時"}`;
  return `<svg class="seedling" viewBox="0 0 270 260" role="img" aria-label="${description}" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(270 0) scale(-1 1)"><path d="M235 46L157 27L157 145L235 100Z" fill="#f9d779" opacity=".2"/><rect x="232" y="45" width="17" height="55" rx="5" fill="#f3b946"/><path d="M236 100V222M219 223H253" stroke="#658087" stroke-width="5"/><path d="M221 69H203M208 64L203 69L208 74" stroke="#c28c1a" stroke-width="2" fill="none"/>
    <path data-stem="${id}" d="${stem}" fill="none" stroke="#59a16a" stroke-width="13" stroke-linecap="${id === "C" ? "butt" : "round"}"/><path d="${stem}" fill="none" stroke="#a1d38a" stroke-width="4" stroke-linecap="${id === "C" ? "butt" : "round"}"/>${cover}</g><text x="40" y="30" text-anchor="middle" fill="#9c731d" font-size="13">光源</text>
    <rect x="83" y="205" width="95" height="16" rx="5" fill="#af7851"/><path d="M91 221L103 250H158L170 221" fill="#d6a878"/><text x="130" y="258" text-anchor="middle" fill="#658087" font-size="11">${p === 0 ? "開始時" : p === 1 ? "生長後" : "生長中"}</text>
  </svg>`;
}
// The opening scene uses window light and keeps the lower stem upright.
function windowSeedling(after = false) {
  const stem = after
    ? "M100 207 L100 140 C100 110 123 89 156 78"
    : "M100 207 L100 90";
  const description = after ? "窗邊胚芽鞘：24小時後" : "窗邊胚芽鞘：開始時";
  return `<svg class="window-seedling" viewBox="0 0 260 270" role="img" aria-label="${description}" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="5" width="250" height="255" rx="16" fill="#f4f8f1"/>
    <path d="M210 65 L58 38 L58 181 L210 172 Z" fill="#f9d779" opacity=".24"/>
    <rect x="205" y="45" width="43" height="132" rx="3" fill="#cfeef3" stroke="#7dadae" stroke-width="5"/>
    <circle cx="231" cy="67" r="10" fill="#f6c45d"/>
    <path d="M226 46V176M207 110H247" stroke="#7dadae" stroke-width="4"/>
    <path d="M199 181H253" stroke="#87ada7" stroke-width="7" stroke-linecap="round"/>
    <path d="M191 98H171M177 92L171 98L177 104" stroke="#c28c1a" stroke-width="2" fill="none"/>
    <path data-stem="${after ? "after" : "before"}" d="${stem}" fill="none" stroke="#59a16a" stroke-width="13" stroke-linecap="round"/>
    <path d="${stem}" fill="none" stroke="#a1d38a" stroke-width="4" stroke-linecap="round"/>
    <path d="M28 249H248" stroke="#d5e1d5" stroke-width="2"/>
    <rect x="60" y="205" width="80" height="14" rx="5" fill="#af7851"/>
    <path d="M66 219L77 248H123L134 219" fill="#d6a878"/>
  </svg>`;
}
function contextComparison() {
  return `<div class="context-comparison">
    <figure class="context-frame">${windowSeedling(false)}</figure>
    <div class="context-transition"><span>24小時後</span><svg viewBox="0 0 64 26" aria-hidden="true"><path d="M3 13H57M45 3L57 13L45 23" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <figure class="context-frame">${windowSeedling(true)}</figure>
  </div><p class="context-timing-note muted">生長變化示意；24小時為情境設定。</p>`;
}
function renderBench(p = 0) {
  $("#bench").innerHTML = Object.keys(GROUPS)
    .map(
      (id) =>
        `<article class="specimen"><h3>${id} · ${GROUPS[id].label}</h3><div id="plant-${id}">${seedling(id, p)}</div>${selectHTML("growth-" + id, GROWTH, state.observations[id]?.growth, "伸長表現")}${selectHTML("obs-" + id, DIRECTIONS, state.observations[id]?.direction, "彎曲方向")}${selectHTML("position-" + id, POSITIONS, state.observations[id]?.position, "彎曲位置")}</article>`,
    )
    .join("");
  Object.keys(GROUPS).forEach((id) =>
    ["growth", "obs", "position"].forEach(
      (k) =>
        ($("#" + k + "-" + id).onchange = () =>
          log("observation_selected", {
            group: id,
            field: k,
            value: $("#" + k + "-" + id).value,
          })),
    ),
  );
  $$("#bench select").forEach(
    (el) => (el.disabled = !hasRun || !!state.submittedAt || running),
  );
}
function renderVariables() {
  $("#variableChoices").innerHTML = [
    ["iv", "獨立變量", "主動改變的因素"],
    ["dv", "因變量", "量度或觀察的結果"],
    ["cv", "控制變量", "保持不變的因素"],
  ]
    .map(
      ([key, label, description]) =>
        `<fieldset class="variable-group"><legend>${label}<span>（${description}）</span></legend><div class="variable-pills">${VARIABLE_DISPLAY_ORDER.map((i) => `<label class="variable-pill"><input type="checkbox" data-variable="${key}" value="${i}"><span>${VARIABLES[i]}</span></label>`).join("")}</div></fieldset>`,
    )
    .join("");
  $$("[data-variable]").forEach(
    (el) =>
      (el.onchange = () => {
        state.variables[el.dataset.variable] = $$(
          `[data-variable="${el.dataset.variable}"]:checked`,
        ).map((x) => +x.value);
        log("variable_changed", {
          group: el.dataset.variable,
          values: state.variables[el.dataset.variable],
        });
      }),
  );
  $("#assumptions").innerHTML = ASSUMPTIONS.map(
    ([id, text]) =>
      `<label><input type="checkbox" data-assumption="${id}"> ${text}</label>`,
  ).join("");
  $$("[data-assumption]").forEach(
    (el) =>
      (el.onchange = () => {
        state.assumptions = $$("[data-assumption]:checked").map(
          (x) => x.dataset.assumption,
        );
        log("assumptions_changed", { values: state.assumptions });
      }),
  );
}
function designMissing() {
  readForm();
  const missing = [];
  if (
    !state.form.hypothesisPart.trim() ||
    !state.form.hypothesisOutcome ||
    !state.form.reason.trim()
  )
    missing.push("假說部位、預期反應及理由");
  if (!["iv", "dv", "cv"].every((k) => state.variables[k].length))
    missing.push("三類變量");
  if (!state.assumptions.length) missing.push("實驗前提");
  if (!state.form.controlPlan.trim()) missing.push("對照組設計");
  if (!state.setup.saved) missing.push("已儲存的裝置設計");
  return missing;
}
function tableHTML(obs, groups = GROUPS) {
  return `<div class="table-wrap"><table class="vl3-table"><thead><tr><th>組別</th><th>處理</th><th>我的觀察</th></tr></thead><tbody>${Object.entries(
    groups,
  )
    .map(
      ([id, g]) =>
        `<tr><td>${id}</td><td>${g.label}</td><td>${esc(mainObservationText(obs[id]))}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}
function renderEvidence() {
  $("#evidenceTable").innerHTML = tableHTML(state.observations);
  $("#observationTable").innerHTML = Object.entries(GROUPS)
    .map(
      ([id, g]) =>
        `<tr><td>${id}</td><td>${g.label}</td><td>${esc(mainObservationText(state.observations[id]))}</td></tr>`,
    )
    .join("");
}
function complete(r = state) {
  return (
    !!r.submittedAt && !!r.reflectionSubmittedAt && !!r.form.reflection.trim()
  );
}
function applyLock() {
  const locked = !!state.submittedAt;
  $$(
    "#phase-1 input,#phase-1 textarea,#phase-2 input,#phase-2 textarea,#phase-2 select,#phase-2 button,#phase-3 select,#phase-3 button,#conclusionForm textarea,#conclusionForm select,#conclusionForm button,#submitInvestigation",
  ).forEach((el) => {
    if (!el.dataset.back) el.disabled = locked;
  });
  $("#recordData").disabled = locked || !hasRun || running;
  $("#runExperiment").disabled = locked || running;
  $$("#bench select").forEach(
    (el) => (el.disabled = locked || !hasRun || running),
  );
  $("#setupCanvas").setAttribute("aria-disabled", String(locked));
  $("#learningReveal").hidden = !locked;
  lockExtension();
  $("#reflection").disabled = complete();
  $("#saveReflection").disabled = !locked || complete();
  $("#downloadPDF").disabled = !complete();
  $("#reflectionStatus").textContent = complete()
    ? "學習反思已提交，可以列印／儲存 PDF。"
    : "提交反思後，才可列印／儲存 PDF。";
  if (locked) {
    const original = state.initialDesign.form;
    $("#originalHypothesis").innerHTML =
      `<strong>你的主探究原始假說</strong><p${Object.hasOwn(original, "initialIdea") ? " data-student-text" : ""}>${esc(state.initialDesign.hypothesisText || hypothesis(original))}</p><p><span>原始理由：</span><span data-student-text>${esc(original.reason)}</span></p><strong>你的延伸原始預測</strong><p>${esc(DIRECTIONS[state.extension.initialPrediction?.prediction] || "")}</p><p><span>原始理由：</span><span data-student-text>${esc(state.extension.initialPrediction?.reason || "")}</span></p>`;
  }
}
function saveSetup(method, image = "") {
  readForm();
  state.setup = {
    saved: true,
    method,
    image,
    description: state.form.setupDescription,
  };
  $("#setupStatus").textContent = "裝置設計已儲存。";
  log("setup_saved", { method });
}
let drawingTool = "pencil";
const canvas = $("#setupCanvas"),
  ctx = canvas.getContext("2d");
function resetCanvas() {
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#15333b";
  drawMade = false;
  selectDrawingTool("pencil");
}
function selectDrawingTool(tool) {
  drawingTool = tool;
  $$("[data-drawing-tool]").forEach((button) => {
    const selected = button.dataset.drawingTool === tool;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}
$$("[data-drawing-tool]").forEach(
  (button) =>
    (button.onclick = () => {
      if (!state.submittedAt) selectDrawingTool(button.dataset.drawingTool);
    }),
);
$(".upload-control").onkeydown = (e) => {
  if (["Enter", " "].includes(e.key) && !state.submittedAt) {
    e.preventDefault();
    $("#setupPhoto").click();
  }
};
function point(e) {
  const r = canvas.getBoundingClientRect();
  return [
    ((e.clientX - r.left) * canvas.width) / r.width,
    ((e.clientY - r.top) * canvas.height) / r.height,
  ];
}
canvas.onpointerdown = (e) => {
  if (state.submittedAt) return;
  canvas.setPointerCapture(e.pointerId);
  drawing = true;
  ctx.strokeStyle = drawingTool === "eraser" ? "white" : "#15333b";
  ctx.lineWidth = drawingTool === "eraser" ? 22 : 4;
  ctx.beginPath();
  ctx.moveTo(...point(e));
};
canvas.onpointermove = (e) => {
  if (!drawing || state.submittedAt) return;
  ctx.lineTo(...point(e));
  ctx.stroke();
  drawMade = true;
  state.setup.saved = false;
  $("#setupStatus").textContent = "繪圖已更新，請儲存。";
};
canvas.onpointerup = canvas.onpointercancel = () => {
  if (drawing && drawMade) log("drawing_updated");
  drawing = false;
};
$("#clearDrawing").onclick = () => {
  if (state.submittedAt) return;
  resetCanvas();
  state.setup = { saved: false, method: "", image: "", description: "" };
  $("#setupStatus").textContent = "繪圖已清除，請重新儲存設計。";
  log("setup_cleared");
};
$("#saveDrawing").onclick = () => {
  if (!drawMade)
    return remind("請先繪畫裝置，或改用文字設計。", "#setupCanvas");
  saveSetup("drawing", canvas.toDataURL("image/png"));
};
$("#saveTextSetup").onclick = () => {
  if (!$("#setupDescription").value.trim())
    return remind("請先描述你的裝置設計。", "#setupDescription");
  saveSetup("text");
};
$("#setupPhoto").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f || state.submittedAt) return;
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(f.type) ||
    f.size > 5e6
  )
    return message("請選擇 5 MB 以下的 PNG、JPEG 或 WebP 圖片。");
  try {
    const bitmap = await createImageBitmap(f);
    resetCanvas();
    const scale = Math.min(
      canvas.width / bitmap.width,
      canvas.height / bitmap.height,
    );
    ctx.drawImage(bitmap, 0, 0, bitmap.width * scale, bitmap.height * scale);
    bitmap.close();
    drawMade = true;
    saveSetup("photo", canvas.toDataURL("image/jpeg", 0.72));
  } catch {
    message("無法讀取這張圖片，請換一個檔案。");
  }
};
initExtension();
FIELDS.forEach((f) =>
  $("#" + f).addEventListener("input", () => {
    if (
      (state.submittedAt && !["reflection", "knowledgeName"].includes(f)) ||
      (state.reflectionSubmittedAt && f === "reflection")
    )
      return;
    if (f === "setupDescription") {
      state.setup.saved = false;
      $("#setupStatus").textContent = "文字設計已更新，請儲存。";
    }
    state.form[f] = $("#" + f).value;
    log("answer_changed", { field: f, value: state.form[f] });
  }),
);
$("#toDesign").onclick = () => {
  readForm();
  if (!state.form.observation.trim())
    return remind("請先完成初步觀察。", "#observation");
  state.unlocked = Math.max(state.unlocked, 2);
  phase(2);
  message("先提出你的預測，再設計公平的比較。");
};
$("#toExperiment").onclick = () => {
  const missing = designMissing();
  if (missing.length) {
    const target =
      firstEmptyField(["hypothesisPart", "hypothesisOutcome", "reason"]) ||
      ["iv", "dv", "cv"]
        .filter((key) => !state.variables[key].length)
        .map((key) => `[data-variable="${key}"]`)[0] ||
      (!state.assumptions.length && "#assumptions") ||
      (!state.form.controlPlan.trim() && "#controlPlan") ||
      ".setup-card";
    return remind("請完成：" + missing.join("、"), target);
  }
  if (!state.initialDesign)
    state.initialDesign = {
      at: new Date().toISOString(),
      hypothesisText: hypothesis(state.form),
      form: clone(state.form),
      variables: clone(state.variables),
      assumptions: clone(state.assumptions),
      setup: clone(state.setup),
    };
  state.unlocked = Math.max(state.unlocked, 3);
  log("design_confirmed", { initialDesign: state.initialDesign });
  phase(3);
  message("原始假說及理由已固定保存。請觀察四組胚芽鞘。");
};
$("#runExperiment").onclick = () => {
  if (running || state.submittedAt) return;
  running = true;
  hasRun = false;
  const generation = ++runGeneration;
  renderBench(0);
  applyLock();
  const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : 2400;
  const start = performance.now();
  $("#runStatus").textContent = "生長中（加速模型）";
  log("experiment_started");
  const frame = (now) => {
    if (generation !== runGeneration) return;
    const p = duration ? Math.min(1, (now - start) / duration) : 1;
    Object.keys(GROUPS).forEach(
      (id) => ($("#plant-" + id).innerHTML = seedling(id, p)),
    );
    if (p < 1) requestAnimationFrame(frame);
    else {
      running = false;
      hasRun = true;
      $("#runStatus").textContent = "生長完成，請自行選擇各組觀察";
      applyLock();
      log("experiment_completed");
    }
  };
  requestAnimationFrame(frame);
};
$("#recordData").onclick = () => {
  if (!hasRun || running || state.submittedAt) return;
  const obs = Object.fromEntries(
    Object.keys(GROUPS).map((id) => [
      id,
      {
        growth: $("#growth-" + id).value,
        direction: $("#obs-" + id).value,
        position: $("#position-" + id).value,
      },
    ]),
  );
  if (Object.values(obs).some((v) => !mainObservationComplete(v)))
    return remind(
      "請先選擇四組的伸長、彎曲方向及位置。",
      firstEmptyField(
        Object.keys(GROUPS).flatMap((id) => [
          "growth-" + id,
          "obs-" + id,
          "position-" + id,
        ]),
      ),
    );
  if (!state.firstObservations) {
    state.firstObservations = clone(obs);
    state.firstObservationsAt = new Date().toISOString();
  }
  state.observations = obs;
  renderEvidence();
  log("observations_recorded", { observations: obs });
  message("四組觀察已記錄。你可以再次實驗，或進入分析。");
};
$("#toAnalysis").onclick = () => {
  if (
    !Object.keys(GROUPS).every((id) =>
      mainObservationComplete(state.observations[id]),
    )
  )
    return remind(
      "請先記錄全部四組的觀察。",
      hasRun ? "#recordData" : "#runExperiment",
    );
  state.unlocked = 4;
  phase(4);
  message("請引用你記錄的組別比較，完成結論。");
};
$("#submitInvestigation").onclick = () => {
  readForm();
  if (
    !Object.keys(MAIN_ANSWERS).every((k) => state.form[k]) ||
    !state.form.evidence.trim()
  )
    return remind(
      "請完成主探究六項推論及數據解釋。",
      firstEmptyField([...Object.keys(MAIN_ANSWERS), "evidence"]),
    );
  const missing = extensionMissing();
  if (missing.length) {
    const target = !state.extension.unlocked
      ? "#toExtension"
      : !state.extension.initialPrediction
        ? firstEmptyField(["extPrediction", "extReason", "extFair"]) ||
          "#runExtension"
        : !EXT_IDS.every((id) => state.extension.readings[id])
          ? "#extensionResults"
          : !state.extension.graphSaved
            ? "#saveGraph"
            : firstEmptyField([...Object.keys(EXT_ANSWERS), "extEvidence"]);
    return remind("請完成：" + missing.join("、"), target);
  }
  if (running || extensionRunning) return message("請等待實驗完成。");
  if (state.submittedAt) return;
  if (
    !confirm(
      VL3Language.t("遞交後主探究及延伸答案不能修改；仍可填寫反思。確定遞交？"),
    )
  )
    return;
  state.submittedAt = new Date().toISOString();
  state.finalAnswers = {
    at: state.submittedAt,
    form: clone(state.form),
    observations: clone(state.observations),
    setup: clone(state.setup),
    variables: clone(state.variables),
    assumptions: clone(state.assumptions),
    extension: clone(state.extension),
  };
  log("investigation_submitted", {
    form: state.form,
    observations: state.observations,
  });
  applyLock();
  message("探究答案已鎖定。請閱讀學習重點，然後回顧原始假說。");
};
$("#saveReflection").onclick = () => {
  if (!state.submittedAt || state.reflectionSubmittedAt) return;
  if (!$("#reflection").value.trim() || !$("#knowledgeName").value)
    return remind(
      "請完成學習檢核及反思。",
      firstEmptyField(["knowledgeName", "reflection"]),
    );
  state.form.reflection = $("#reflection").value;
  state.reflectionSubmittedAt = new Date().toISOString();
  log("reflection_submitted", { reflection: state.form.reflection });
  applyLock();
  message("反思已提交。請保存 PDF 或下載紀錄交給教師。");
};
$$("[data-back],[data-phase]").forEach(
  (b) => (b.onclick = () => phase(+(b.dataset.back || b.dataset.phase))),
);
function statusOf(r) {
  return complete(r) ? "已完成" : r.submittedAt ? "待提交反思" : "進行中";
}
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function safeImage(s) {
  return typeof s === "string" &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)
    ? s
    : "";
}
function report(r) {
  if (newExperiment(r)) return newReport(r);
  const f = r.form,
    original = r.initialDesign?.form;
  const answer = (title, value) =>
    `<div class="report-block"><strong>${esc(title)}</strong><p style="white-space:pre-wrap"${["初步觀察", "原始理由", "目前理由", "對照組設計", "裝置文字設計", "我的數據解釋", "學習反思"].includes(title) && value ? " data-student-text" : ""}>${esc(value || "未回答")}</p></div>`;
  return `<h1>VL3 · 胚芽鞘的向光性</h1><p data-student-text>${esc(r.profile.name)}｜${esc(r.profile.classInfo)}｜${esc(r.profile.email)}</p><p>紀錄 ${esc(r.id)} · ${statusOf(r)}</p><h2>01 了解情境</h2>${answer("初步觀察", f.observation)}<h2>02 設計探究</h2>${answer("第一次實驗前固定保存的原始假說", original ? r.initialDesign.hypothesisText || hypothesis(original, r.experimentVersion) : "尚未開始實驗")}${answer("原始理由", original?.reason)}${answer("目前假說", hypothesis(f, r.experimentVersion))}${answer("目前理由", f.reason)}${["iv", "dv", "cv"].map((g, i) => answer(["獨立變量", "因變量", "控制變量"][i], r.variables[g].map((n) => VARIABLES[n]).join("；"))).join("")}${answer("實驗前提", r.assumptions.map((id) => assumptionsFor(r).find((a) => a[0] === id)?.[1]).join("；"))}${answer("對照組設計", f.controlPlan)}${answer("裝置文字設計", r.setup.description)}${safeImage(r.setup.image) ? `<img src="${r.setup.image}" alt="學生裝置設計">` : ""}<h2>03 觀察紀錄</h2>${tableHTML(r.observations, groupDefinitions(r))}<h2>04 分析與反思</h2>${answer("感光部位", f.qTip === "tip" ? "頂端" : f.qTip === "below" ? "頂端以下位置" : "")}${answer("組別比較", comparisonText(r))}${answer("頂端以下位置遮光的反應", OUTCOMES[f.qBelow])}${answer("證據限制", limitationText(r))}${answer("我的數據解釋", f.evidence)}${answer("學習反思", f.reflection)}<p>實驗模型：四組相同單側光照；動畫是典型反應示意，並非真實量度。紀錄可同步至共用資料庫。</p>`;
}
function printRecord(r) {
  $("#printReport").innerHTML = report(r);
  VL3Language.translateTree($("#printReport"));
  const title = document.title;
  document.title =
    "VL3_" +
    VL3Language.t("幼芽為甚麼朝光生長") +
    "_" +
    r.profile.classInfo +
    "_" +
    r.profile.name;
  window.print();
  document.title = title;
}
$("#downloadPDF").onclick = () => {
  if (!complete()) return;
  save();
  log("pdf_print_requested");
  printRecord(state);
};
// Portable records allow students to transfer local browser data to a teacher.
const backupButton = document.createElement("button");
backupButton.id = "downloadRecord";
backupButton.hidden = true;
backupButton.className = "secondary";
backupButton.textContent = "下載學習紀錄（供教師匯入）";
$("#downloadPDF").after(backupButton);
backupButton.onclick = () => {
  save();
  download(
    new Blob(
      [JSON.stringify({ moduleId: MODULE_ID, records: [state] }, null, 2)],
      { type: "application/json" },
    ),
    "VL3_" + state.profile.classInfo + "_" + state.profile.name + ".json",
  );
};
function mergeRecords(local, remote) {
  const result = new Map();
  for (const r of [...remote, ...local]) {
    if (
      !valid(r) ||
      r.profile.email.toLowerCase() === TEACHER_EMAIL ||
      r.demo ||
      r.profile.mode === "teacher-demo"
    )
      continue;
    const old = result.get(r.id);
    if (!old || Date.parse(r.savedAt) > Date.parse(old.savedAt))
      result.set(r.id, r);
  }
  return [...result.values()].sort((a, b) =>
    String(a.createdAt).localeCompare(String(b.createdAt)),
  );
}
async function teacherDashboard(password) {
  if (!teacher()) return false;
  const generation = ++dashboardGeneration;
  $("#exportExcel").disabled = true;
  $("#importRecords").disabled = true;
  $("#teacherAuthHelp").hidden = true;
  $("#teacherStatus").textContent = "正在讀取 VL3 全部雲端分頁……";
  try {
    const remote = await cloudSync.list(password);
    if (generation !== dashboardGeneration || !teacher()) return false;
    let local = [];
    try {
      local = records();
    } catch (e) {
      message(e.message);
    }
    sharedRecords = mergeRecords(local, remote);
    $("#teacherLogin").hidden = true;
    $("#exportExcel").disabled = false;
    $("#importRecords").disabled = false;
    $("#teacherStatus").textContent =
      `已完整讀取 ${remote.length} 份雲端紀錄；按 ID／版本合併本機備份後共 ${sharedRecords.length} 份。匯出前會重新讀取全部雲端分頁。`;
    $("#teacherRows").innerHTML =
      sharedRecords
        .map(
          (r, i) =>
            `<tr><td data-student-text>${esc(r.profile.name)}</td><td data-student-text>${esc(r.profile.classInfo)}</td><td>${statusOf(r)}</td><td><button class="secondary" data-report="${i}">列印 PDF</button></td></tr>`,
        )
        .join("") || '<tr><td colspan="4">暫無學生紀錄。</td></tr>';
    $$("[data-report]").forEach(
      (button) =>
        (button.onclick = () =>
          printRecord(clone(sharedRecords[+button.dataset.report]))),
    );
    return true;
  } catch (e) {
    if (generation !== dashboardGeneration) return false;
    sharedRecords = [];
    $("#teacherRows").innerHTML = "";
    $("#teacherLogin").hidden = false;
    const authError =
      [
        "TEACHER_AUTH_FAILED",
        "TEACHER_PASSWORD_NOT_CONFIGURED",
        "TEACHER_PASSWORD_SETUP_PENDING",
      ].includes(e.code) || e.message === "教師密碼不正確";
    $("#teacherAuthHelp").hidden = !authError;
    $("#teacherStatus").textContent =
      "未取得完整全班紀錄，未匯出：" +
      (e.message === "教師密碼不正確"
        ? "教師登入未通過驗證；此部署的密碼可能尚未設定，或與你預期不同。"
        : e.message);
    return false;
  }
}
$("#teacherButton").onclick = () => {
  teacherDashboard();
  $("#teacherDialog").showModal();
};
$("#closeTeacher").onclick = () => $("#teacherDialog").close();
$("#teacherDemo").onclick = () => {
  const profile = clone(state.profile);
  reset(profile);
  $("#teacherDialog").close();
  message("教師示範：不儲存學生紀錄、事件或評分。");
};
$("#refreshTeacher").onclick = () => teacherDashboard();
$("#teacherLogin").onsubmit = (e) => {
  e.preventDefault();
  const password = $("#teacherPassword").value;
  $("#teacherPassword").value = "";
  teacherDashboard(password);
};
$("#teacherLogout").onclick = () => {
  cloudSync.clearCredential();
  dashboardGeneration++;
  sharedRecords = [];
  $("#teacherRows").innerHTML = "";
  $("#teacherLogin").hidden = false;
  $("#exportExcel").disabled = true;
  $("#importRecords").disabled = true;
  $("#teacherStatus").textContent = "教師雲端讀取已登出。";
  $("#teacherAuthHelp").hidden = true;
};
$("#importRecords").onchange = async (e) => {
  if (!teacher()) return;
  let accepted = 0,
    rejected = 0;
  try {
    const cloudRows = await cloudSync.list();
    const cloudVersions = new Map(
      cloudRows.map((r) => [r.id, Date.parse(r.savedAt)]),
    );
    const rows = records();
    for (const file of e.target.files) {
      try {
        if (file.size > 10e6) throw Error("檔案過大");
        const payload = JSON.parse(await file.text());
        if (payload.moduleId !== MODULE_ID || !Array.isArray(payload.records))
          throw Error("格式不符");
        for (const r of payload.records) {
          if (
            !valid(r) ||
            r.profile.email.toLowerCase() === TEACHER_EMAIL ||
            r.demo
          ) {
            rejected++;
            continue;
          }
          const old = rows.findIndex((x) => x.id === r.id);
          if (old < 0) rows.push(r);
          else if (Date.parse(r.savedAt) > Date.parse(rows[old].savedAt))
            rows[old] = r;
          if (
            !cloudVersions.has(r.id) ||
            cloudVersions.get(r.id) < Date.parse(r.savedAt)
          )
            cloudSync.enqueue(r);
          accepted++;
        }
      } catch {
        rejected++;
      }
    }
    localStorage.setItem(RECORDS_KEY, JSON.stringify(rows));
    await cloudSync.flush();
    $("#importStatus").textContent =
      `已處理 ${accepted} 份紀錄；${rejected} 份未匯入。相同 ID 不新增重複紀錄。`;
    await teacherDashboard();
  } catch (e) {
    $("#importStatus").textContent =
      "匯入尚未完整確認：" + e.message + "；原資料保留。";
  }
  e.target.value = "";
};
function reset(profile) {
  runGeneration++;
  running = false;
  hasRun = false;
  state = fresh(profile);
  FIELDS.forEach((f) => ($("#" + f).value = ""));
  resetExtension();
  drawing = false;
  lastActive = Date.now();
  timingVisible = !document.hidden;
  $("#setupPhoto").value = "";
  $("#printReport").innerHTML = "";
  renderVariables();
  resetCanvas();
  renderBench();
  renderEvidence();
  $("#setupStatus").textContent = "";
  $("#runStatus").textContent = "等待開始";
  $("#studentName").textContent = profile?.name || "同學";
  $("#studentName").toggleAttribute("data-student-text", Boolean(profile));
  $("#teacherButton").hidden = !teacher();
  applyLock();
  phase(1);
  message("");
}
function showLogin() {
  save();
  reset(null);
  $("#profileForm").reset();
  $("main").inert = true;
  $("#profileDialog").showModal();
}
$("#newSession").onclick = () => {
  cloudSync.clearCredential();
  dashboardGeneration++;
  sharedRecords = [];
  $("#teacherRows").innerHTML = "";
  $("#teacherPassword").value = "";
  $("#teacherLogin").hidden = false;
  $("#teacherAuthHelp").hidden = true;
  showLogin();
};
$("#profileDialog").addEventListener("cancel", (e) => e.preventDefault());
$("#profileForm").onsubmit = (e) => {
  e.preventDefault();
  const p = {
    name: $("#profileName").value.trim(),
    classInfo: $("#profileClass").value.trim(),
    email: $("#profileEmail").value.trim().toLowerCase(),
  };
  if (!p.name || !p.classInfo || !p.email) return;
  reset(p);
  $("#profileDialog").close();
  $("main").inert = false;
  log("lab_started");
  if (teacher()) {
    teacherDashboard();
    $("#teacherDialog").showModal();
  }
};
const materials = [
  [
    "燕麥幼苗 × 4",
    '<path d="M60 87V25" stroke="#65a772" stroke-width="9" stroke-linecap="round"/><rect x="36" y="84" width="48" height="10" rx="3" fill="#af7851"/><path d="M40 94L47 110H74L81 94" fill="#d6a878"/>',
  ],
  [
    "單側光源 × 1",
    '<path d="M70 22L32 8V78L70 58Z" fill="#f9d779" opacity=".35"/><rect x="70" y="20" width="15" height="40" rx="5" fill="#f3b946"/><path d="M78 61V104M60 105H97" stroke="#658087" stroke-width="4"/>',
  ],
  [
    "不透光帽 × 1",
    '<path d="M43 90V40Q60 14 77 40V90Z" fill="#344a50" stroke="#15333b" stroke-width="3"/>',
  ],
  [
    "剪刀 × 1",
    '<path d="M55 68L85 20M65 68L35 20" stroke="#93a7aa" stroke-width="8" stroke-linecap="round"/><circle cx="48" cy="84" r="15" fill="none" stroke="#087b78" stroke-width="7"/><circle cx="73" cy="84" r="15" fill="none" stroke="#087b78" stroke-width="7"/><circle cx="60" cy="58" r="5" fill="#536c70"/>',
  ],
  [
    "下部遮光套 × 1",
    '<path d="M43 18V103Q60 114 77 103V18" fill="#344a50" stroke="#15333b" stroke-width="3"/><ellipse cx="60" cy="18" rx="17" ry="7" fill="#edf5ee" stroke="#15333b" stroke-width="3"/>',
  ],
  [
    "計時工具 × 1",
    '<circle cx="60" cy="64" r="34" fill="#edf8f2" stroke="#658087" stroke-width="3"/><path d="M60 64V40M60 64L80 72M49 20H71" stroke="#087b78" stroke-width="4"/>',
  ],
];
$("#equipmentBank").innerHTML = materials
  .map(
    ([label, shapes]) =>
      `<div class="equipment"><svg viewBox="0 0 120 120" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${shapes}</svg><span>${label}</span></div>`,
  )
  .join("");
$("#contextPlant").innerHTML = contextComparison();
$("#mechanismDiagram").innerHTML = mechanismSVG();
$("#referenceDesign").innerHTML =
  "對照設計參考：保留 A 完整不遮蓋作基準；A–B 比較頂端遮光，A–C 比較頂端是否存在，A–D 比較下部遮光。每項比較保持種類、處理前大小與生長狀況、光照方向及強度、溫度、供水與培養時間相同；留意傷口、溫度與機械限制。延伸 E–F 保持瓊脂位置同在中央；F–G–H 保持處理瓊脂種類相同。";
document.addEventListener("visibilitychange", () => {
  accountTime();
  timingVisible = !document.hidden;
  lastActive = Date.now();
  if (document.hidden) save();
});
window.addEventListener("pagehide", () => {
  save();
  cloudSync.leave();
});
window.addEventListener("beforeunload", (e) => {
  save();
  if (state?.profile && !allowUnload) {
    e.preventDefault();
    e.returnValue = "";
  }
});
setInterval(save, 15000);
cloudSync = createCloudSync({
  endpoint: window.VL3_CLOUD_CONFIG?.endpoint || "",
  storage: localStorage,
  records,
  validate: valid,
  status(kind, text) {
    for (const id of ["syncStatus", "loginCloudStatus"]) {
      $("#" + id).textContent = text;
      $("#" + id).dataset.state = kind;
    }
  },
});
showLogin();
function sameSet(a, b) {
  return a.length === b.length && b.every((x) => a.includes(x));
}
function colourRule(cell, ref, max) {
  return {
    cell,
    formulas: [
      `AND(ISNUMBER(${ref}),${ref}=${max})`,
      `AND(ISNUMBER(${ref}),${ref}=0)`,
      `AND(ISNUMBER(${ref}),${ref}>0,${ref}<${max})`,
    ],
  };
}
function scoringWorkbook(all) {
  const cols = [
    ["id", "紀錄識別碼", "identity"],
    ["name", "姓名", "identity"],
    ["class", "班別", "identity"],
    ["status", "完成狀態", "identity"],
    ["initial", "觀察｜初步觀察・教師（0–2）", "observing", 2],
    ["observations", "觀察｜主探究定性反應・自動（0–2）", "observing"],
    ["observing", "SPS 觀察（0–4）", "observing"],
    ["iv", "分類｜獨立變量（0–1）", "classifying"],
    ["dv", "分類｜因變量（0–1）", "classifying"],
    ["cv", "分類｜控制變量（0–2）", "classifying"],
    ["classifying", "SPS 分類（0–4）", "classifying"],
    ["hypothesis", "設計｜兩項原始預測與理由・教師（0–2）", "designing", 2],
    ["assumptions", "設計｜公平比較前提（0–1）", "designing"],
    ["control", "設計｜對照組・教師（0–1）", "designing", 1],
    ["designing", "SPS 設計（0–4）", "designing"],
    ["run", "實作｜延伸角度量度準確性（0–2）", "conducting"],
    ["setup", "實作｜裝置設計・教師（0–2）", "conducting", 2],
    ["conducting", "SPS 實作（0–4）", "conducting"],
    ["conclusions", "推論｜主探究及延伸比較（0–2）", "inferring"],
    ["evidence", "推論｜數據解釋・教師（0–2）", "inferring", 2],
    ["inferring", "SPS 推論（0–4）", "inferring"],
    ["reflection", "溝通｜反思表達・教師（0–2）", "communicating", 2],
    ["submission", "溝通｜棒形圖與自身讀數一致（0–2）", "communicating"],
    ["communicating", "SPS 溝通（0–4）", "communicating"],
    ["sps", "SPS 總分（0–24）", "score"],
    ["tip", "知識｜向光性名稱及感光部位・教師（0–2）", "knowledge", 2],
    ["growth", "知識｜不均勻伸長及彎曲方向・教師（0–2）", "knowledge", 2],
    ["auxin", "知識｜生長素與生長訊號・教師（0–2）", "knowledge", 2],
    ["revision", "知識｜依據證據修訂及限制・教師（0–2）", "knowledge", 2],
    ["knowledge", "新知識總分（0–8）", "score"],
    ["overall", "整體（0–32）", "score"],
    ["marking", "評分狀態", "score"],
  ];
  const col = Object.fromEntries(cols.map((c, i) => [c[0], colName(i)]));
  const rows = [cols.map((c) => excelCell(c[1], c[2]))],
    validations = [],
    conditional = [];
  all.forEach((r, i) => {
    const n = i + 2,
      ref = (id) => col[id] + n;
    const sum = (ids, required = ids) =>
      `IF(COUNT(${required.map(ref).join(",")})=${required.length},ROUND(SUM(${ids.map(ref).join(",")}),2),"待評")`;
    const raw = {
      id: r.id,
      name: r.profile.name,
      class: r.profile.classInfo,
      status: statusOf(r),
      observations: mainObservationScore(r),
      iv: sameSet(r.variables.iv, EXPECTED.iv) ? 1 : 0,
      dv: sameSet(r.variables.dv, EXPECTED.dv) ? 1 : 0,
      cv: sameSet(r.variables.cv, EXPECTED.cv) ? 2 : 0,
      assumptions: sameSet(
        r.assumptions,
        assumptionsFor(r)
          .filter((a) => a[2])
          .map((a) => a[0]),
      )
        ? 1
        : 0,
      run: newExperiment(r)
        ? angleScore(r)
        : r.events.some((e) => e.type === "experiment_completed") &&
            Object.keys(GROUPS).every((id) => OUTCOMES[r.observations[id]])
          ? 2
          : 0,
      conclusions: inferenceScore(r),
      submission: graphScore(r),
      tip: !newExperiment(r) ? (r.form.qTip === ANSWERS.qTip ? 2 : 0) : "",
    };
    const formula = {
      observing: sum(["initial", "observations"], ["initial"]),
      classifying: `SUM(${ref("iv")},${ref("dv")},${ref("cv")})`,
      designing: sum(
        ["hypothesis", "assumptions", "control"],
        ["hypothesis", "control"],
      ),
      conducting: sum(["run", "setup"], ["setup"]),
      inferring: sum(["conclusions", "evidence"], ["evidence"]),
      communicating: sum(["reflection", "submission"], ["reflection"]),
      sps: sum([
        "observing",
        "classifying",
        "designing",
        "conducting",
        "inferring",
        "communicating",
      ]),
      knowledge: sum(
        ["tip", "growth", "auxin", "revision"],
        newExperiment(r)
          ? ["tip", "growth", "auxin", "revision"]
          : ["growth", "auxin", "revision"],
      ),
      overall: `IF(AND(COUNT(${ref("sps")},${ref("knowledge")})=2,${ref("status")}="已完成"),ROUND(SUM(${ref("sps")},${ref("knowledge")}),2),"待評／未完成")`,
      marking: `IF(AND(COUNT(${cols
        .filter((c) => c[3] && (newExperiment(r) || c[0] !== "tip"))
        .map((c) => ref(c[0]))
        .join(
          ",",
        )})=${newExperiment(r) ? 10 : 9},${ref("status")}="已完成"),"評分完成","待教師評分／學生未完成")`,
    };
    rows.push(
      cols.map((c) => {
        if (c[3] && (newExperiment(r) || c[0] !== "tip")) {
          validations.push({ range: ref(c[0]), max: c[3] });
          conditional.push(colourRule(ref(c[0]), ref(c[0]), c[3]));
        }
        return formula[c[0]]
          ? excelFormula(formula[c[0]], c[2])
          : excelCell(raw[c[0]] ?? "", c[2]);
      }),
    );
    [
      "observing",
      "classifying",
      "designing",
      "conducting",
      "inferring",
      "communicating",
    ].forEach((id) => conditional.push(colourRule(ref(id), ref(id), 4)));
    conditional.push(
      colourRule(ref("sps"), ref("sps"), 24),
      colourRule(ref("knowledge"), ref("knowledge"), 8),
      colourRule(ref("overall"), ref("overall"), 32),
    );
  });
  const rubric = [
    ["評分項目", "滿分", "準則／注意事項"],
    [
      "跨 VL 校準狀態",
      "",
      "此 rubric 為待跨VL校準初稿，尚未驗證；不以用時、完成率或點擊次數直接換算能力。",
    ],
    [
      "初步觀察",
      2,
      "2：準確描述胚芽鞘與單側光源及彎曲；1：部分描述；0：沒有相關描述。",
    ],
    [
      "四組反應",
      2,
      "新版：主探究 12 項伸長／方向／位置每項得 1/6，共2；舊版四組每組0.5。原始觀察保留。",
    ],
    ["變量分類", 4, "獨立及因變量各 1；控制變量完整選對得 2，錯選或漏選得 0。"],
    [
      "原始假說與理由",
      2,
      "主探究及延伸各1：有可測試預測與合理理由；每項部分完整0.5、無可測試內容0。預測與模型不符不直接扣分。舊版只評主探究共2。",
    ],
    [
      "實驗前提",
      1,
      "完整選擇初始狀況、無機械限制、無明顯溫差三項，且不選種類相同毋須控制大小得1；舊版按原選項。",
    ],
    [
      "對照組",
      1,
      "以不遮光組作對照，與頂端遮光、切去頂端及下部遮光組比較，保持其餘條件相同得 1；舊版透明罩紀錄按原設計評分。",
    ],
    [
      "實驗操作",
      2,
      "新版延伸四組角度與教學模型相差不超過3°，每組0.5；量度方法與裝置品質仍由教師評閱。不以點擊或用時評分。",
    ],
    [
      "裝置設計",
      2,
      "2：四組處理、單側光源及固定條件清楚；1：部分完整；0：不能形成有效比較。",
    ],
    [
      "結論比較",
      2,
      "新版主探究6項及延伸5項選擇共2，按答對比例；舊版按原頂端處理及下部遮光比較。",
    ],
    [
      "數據解釋",
      2,
      "2：引用主探究及延伸的實際觀察形成合理比較；1：部分證據；0：無證據。",
    ],
    [
      "反思表達",
      2,
      "2：連貫表達兩項原始想法、主探究及延伸證據與修訂；1：部分連結；0：無相關反思。",
    ],
    [
      "棒形圖溝通",
      2,
      "四條棒角度及方向與學生自身讀數一致，每組0.5；不因自身量度錯誤再扣繪圖分。完成率及用時不換算能力。",
    ],
    [
      "名稱及感光部位",
      2,
      "教師：正確運用向光性／正向光性名稱及頂端感光各1；綜合學習檢核與反思。",
    ],
    [
      "感光與生長部位",
      2,
      "2：正確連結兩側不均勻伸長及彎曲方向，包括主探究左光向左及瓊脂左置向右；1：部分正確；0：未顯示理解。",
    ],
    [
      "生長素機制",
      2,
      "2：說明生長素是植物激素、頂端產生可向下傳遞的生長促進作用；1：部分正確；0：未顯示理解。",
    ],
    [
      "依證據修訂與限制",
      2,
      "2：比較兩项原始預測並引用主探究及延伸各一項證據修訂解釋，指出未鑑定物質／直接量度光照下分布；1：部分完成；0：無相關內容。",
    ],
    [
      "總分",
      32,
      "六項 SPS 各 4，共 24；新知識共 8。十項教師分數填妥及反思完成後才顯示整體分數。",
    ],
    ["空白與零分", "", "空白為待評，0 為明確零分。公式由 Excel 開啟時重算。"],
    [
      "人工分數保存",
      "",
      "分數只存在教師保存的 Excel 檔案；再次下載不會讀入舊檔人工分數。",
    ],
  ];
  return {
    sheet: { name: "教師評分", rows, validations, conditional },
    rubric: {
      name: "評分準則",
      rows: rubric.map((row) => row.map((v) => excelCell(v, "reference"))),
    },
    col,
  };
}
async function exportExcel() {
  if (!teacher() || !(await teacherDashboard())) return;
  const all = sharedRecords;
  if (!all.length) return message("暫無學生紀錄可匯出。");
  const scoring = scoringWorkbook(all);
  const headers = [
    ["紀錄識別碼", "identity"],
    ["姓名", "identity"],
    ["班別", "identity"],
    ["狀態", "identity"],
    ["初步觀察", "observing"],
    ["原始假說", "designing"],
    ["原始理由", "designing"],
    ["獨立變量", "classifying"],
    ["因變量", "classifying"],
    ["控制變量", "classifying"],
    ["實驗前提", "designing"],
    ["對照組設計", "designing"],
    ["裝置文字設計", "conducting"],
    ["感光部位", "knowledge"],
    ["組別比較", "inferring"],
    ["下部遮光反應", "inferring"],
    ["證據限制", "knowledge"],
    ["數據解釋", "inferring"],
    ["學習反思", "communicating"],
    ["總時間（秒）", "identity"],
  ];
  const extraFields = [
    // Keep this historical export column so older answers and workbook layout survive.
    ["initialIdea", "初步想法（舊版）", "observing"],
    ["comparison", "指定比較（舊版）", "classifying"],
    ["qShade", "頂端遮光比較", "inferring"],
    ["qSites", "感光與彎曲位置", "inferring"],
    ["extPrediction", "延伸原始預測", "designing"],
    ["extReason", "延伸原始理由", "designing"],
    ["extFair", "延伸公平比較", "designing"],
    ["extEF", "E–F 比較", "inferring"],
    ["extPosition", "F–G–H 比較", "inferring"],
    ["extSides", "兩側伸長與方向", "knowledge"],
    ["extDark", "黑暗彎曲推論", "inferring"],
    ["extLimit", "延伸證據限制", "knowledge"],
    ["extEvidence", "延伸數據解釋", "inferring"],
    ["extControl", "額外對照（選答）", "designing"],
    ["knowledgeName", "向光性名稱檢核", "knowledge"],
  ];
  extraFields.forEach(([, label, category]) => headers.push([label, category]));
  const extensionRows = [
    [
      "紀錄識別碼",
      "姓名",
      "裝置",
      "瓊脂處理／位置",
      "首次伸長",
      "首次角度（°）",
      "首次方向",
      "最後伸長",
      "最後角度（°）",
      "最後方向",
      "模型角度（°）",
      "模型方向",
      "棒高（°）",
      "棒方向",
      "與自身讀數一致",
    ],
  ];
  const answers = [headers.map(([v, g]) => excelCell(v, g))],
    observations = [
      [
        ...[
          "紀錄識別碼",
          "姓名",
          "組別",
          "處理",
          "第一次觀察",
          "目前觀察",
          "模型典型反應",
        ].map((v) => excelCell(v, "observing")),
      ],
    ],
    events = [
      ["紀錄識別碼", "時間", "階段", "事件", "詳細內容"].map((v) =>
        excelCell(v, "identity"),
      ),
    ],
    designs = [
      ["紀錄識別碼", "姓名", "班別", "設計方式", "裝置圖"].map((v) =>
        excelCell(v, "conducting"),
      ),
    ],
    snapshots = [
      ["紀錄識別碼", "片段", "完整紀錄 JSON"].map((v) =>
        excelCell(v, "reference"),
      ),
    ],
    images = [],
    conditional = [];
  all.forEach((r, i) => {
    const f = r.form,
      original = r.initialDesign?.form,
      values = [
        r.id,
        r.profile.name,
        r.profile.classInfo,
        statusOf(r),
        f.observation,
        original
          ? r.initialDesign.hypothesisText ||
            hypothesis(original, r.experimentVersion)
          : "尚未開始",
        original?.reason || "",
        ...["iv", "dv", "cv"].map((g) =>
          r.variables[g].map((n) => VARIABLES[n]).join("；"),
        ),
        r.assumptions
          .map((id) => assumptionsFor(r).find((a) => a[0] === id)?.[1])
          .join("；"),
        f.controlPlan,
        r.setup.description,
        f.qTip === "tip" ? "頂端" : f.qTip === "below" ? "頂端以下位置" : "",
        newExperiment(r) ? answerOption("qCap", f.qCap) : comparisonText(r),
        OUTCOMES[f.qBelow] || "",
        limitationText(r),
        f.evidence,
        f.reflection,
        Math.round(Object.values(r.phaseDurations).reduce((a, b) => a + b, 0)),
        ...extraFields.map(([id]) => {
          if (id === "initialIdea") return f.initialIdea || "";
          if (id === "extPrediction")
            return DIRECTIONS[r.extension?.initialPrediction?.prediction] || "";
          if (id === "extReason")
            return r.extension?.initialPrediction?.reason || "";
          return NEW_FIELDS.includes(id) && newExperiment(r)
            ? answerOption(id, f[id])
            : "";
        }),
      ];
    const marks = {
      7: sameSet(r.variables.iv, EXPECTED.iv),
      8: sameSet(r.variables.dv, EXPECTED.dv),
      9: sameSet(r.variables.cv, EXPECTED.cv),
      10: sameSet(
        r.assumptions,
        assumptionsFor(r)
          .filter((a) => a[2])
          .map((a) => a[0]),
      ),
      13: f.qTip ? f.qTip === ANSWERS.qTip : null,
      14: f.qCap ? f.qCap === comparisonAnswer(r) : null,
      15: f.qBelow ? f.qBelow === ANSWERS.qBelow : null,
      16: f.qLimit ? f.qLimit === ANSWERS.qLimit : null,
    };
    extraFields.forEach(([id], j) => {
      const target = {
        ...MAIN_ANSWERS,
        ...EXT_ANSWERS,
        knowledgeName: "positive",
      }[id];
      if (target && f[id]) marks[20 + j] = f[id] === target;
    });
    answers.push(
      values.map((v, c) => excelCell(v, headers[c][1], marks[c] ?? null)),
    );
    const n = i + 2;
    [
      [4, "initial", 2],
      [5, "hypothesis", 2],
      [6, "hypothesis", 2],
      [11, "control", 1],
      [12, "setup", 2],
      [17, "evidence", 2],
      [18, "reflection", 2],
    ].forEach(([c, id, max]) =>
      conditional.push(
        colourRule(
          colName(c) + n,
          `INDIRECT("'教師評分'!${scoring.col[id]}${n}")`,
          max,
        ),
      ),
    );
    Object.entries(groupDefinitions(r)).forEach(([id, g]) => {
      const outcome = g.bend ? "bend" : "straight";
      const expected = newExperiment(r) ? mainModel(id, r) : outcome;
      const correct = r.observations[id]
        ? newExperiment(r)
          ? ["growth", "direction", "position"].every(
              (k) => r.observations[id][k] === expected[k],
            )
          : r.observations[id] === outcome
        : null;
      observations.push([
        r.id,
        r.profile.name,
        id,
        g.label,
        mainObservationText(r.firstObservations?.[id]),
        excelCell(
          mainObservationText(r.observations[id]),
          "observing",
          correct,
        ),
        mainObservationText(expected),
      ]);
    });
    if (newExperiment(r))
      EXT_IDS.forEach((id) => {
        const e = r.extension,
          first = e.firstReadings?.readings[id],
          final = e.readings[id],
          point = e.graph[id],
          model = EXT_MODEL[id];
        const consistent =
          !!final &&
          !!point &&
          final.angle === point.angle &&
          final.direction === point.direction;
        extensionRows.push([
          r.id,
          r.profile.name,
          id,
          EXT_LABELS[id],
          GROWTH[first?.growth] || "",
          first?.angle ?? "",
          DIRECTIONS[first?.direction] || "",
          excelCell(
            GROWTH[final?.growth] || "",
            "observing",
            final ? final.growth === model.growth : null,
          ),
          excelCell(
            final?.angle ?? "",
            "conducting",
            final ? Math.abs(final.angle - model.angle) <= 3 : null,
          ),
          excelCell(
            DIRECTIONS[final?.direction] || "",
            "observing",
            final ? final.direction === model.direction : null,
          ),
          model.angle,
          DIRECTIONS[model.direction],
          excelCell(
            point?.angle ?? "",
            "communicating",
            point && final ? point.angle === final.angle : null,
          ),
          excelCell(
            DIRECTIONS[point?.direction] || "",
            "communicating",
            point && final ? point.direction === final.direction : null,
          ),
          consistent ? "是" : "尚未一致",
        ]);
      });
    r.events.forEach((e) =>
      events.push([r.id, e.at, e.phase, e.type, JSON.stringify(e.detail)]),
    );
    const designRow = designs.length;
    designs.push([
      r.id,
      r.profile.name,
      r.profile.classInfo,
      r.setup.method,
      "",
    ]);
    if (
      safeImage(r.setup.image) &&
      !r.setup.image.startsWith("data:image/webp")
    )
      images.push({
        row: designRow,
        ext: r.setup.image.startsWith("data:image/jpeg") ? "jpeg" : "png",
        data: r.setup.image,
      });
    const json = JSON.stringify(r);
    for (let j = 0; j < json.length; j += 30000)
      snapshots.push([
        r.id,
        Math.floor(j / 30000) + 1,
        json.slice(j, j + 30000),
      ]);
  });
  for (const r of all.filter(newExperiment)) {
    if (!Object.keys(r.extension.graph).length) continue;
    const row = designs.length;
    designs.push([r.id, r.profile.name, r.profile.classInfo, "學生棒形圖", ""]);
    const png = await svgPNG(barChartSVG(r.extension.graph));
    images.push({ row, ext: "png", data: png });
  }
  download(
    workbook(
      [
        { name: "學生探究答案", rows: answers, conditional },
        { name: "四組觀察紀錄", rows: observations },
        { name: "延伸量度與棒形圖", rows: extensionRows },
        scoring.sheet,
        scoring.rubric,
        { name: "操作事件紀錄", rows: events },
        { name: "原始與遞交快照", rows: snapshots },
        { name: "裝置設計圖", rows: designs },
      ],
      images,
    ),
    "VL3_胚芽鞘朝光生長_全班學習紀錄.xlsx",
  );
}
$("#exportExcel").onclick = exportExcel;

function queueSync(record) {
  cloudSync?.enqueue(record);
}
async function flushSync() {
  try {
    await cloudSync.flush();
    return true;
  } catch {
    return false;
  }
}
function retryCloud() {
  cloudSync.recover();
  cloudSync.flush().catch(() => {});
}
$("#retryCloud").onclick = $("#loginRetryCloud").onclick = retryCloud;
window.addEventListener("online", retryCloud);
// Keep the previous Python outbox intact; migrate its records to this collector.
const legacyOutbox = readJSON("phototropismLab.outbox.v1", {});
if (!storageErrors.has("phototropismLab.outbox.v1"))
  Object.values(legacyOutbox || {}).forEach((entry) => {
    if (valid(entry?.record)) cloudSync.enqueue(entry.record);
  });
const previousCurrent = readJSON(CURRENT_KEY, null);
if (valid(previousCurrent)) cloudSync.enqueue(previousCurrent);
cloudSync.recover();
setInterval(() => cloudSync.flush().catch(() => {}), 15000);

if (storageErrors.size)
  message(
    "部分本機備份損壞，原資料保留；請下載現有紀錄備份，不要清除瀏覽器資料。",
  );
