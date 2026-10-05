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
  C: { label: "頂端透明罩", bend: true },
  D: { label: "頂端以下位置遮光", bend: true },
};
const OUTCOMES = { bend: "仍向光彎曲", straight: "沒有明顯向光彎曲" };
const VARIABLES = [
  "遮光處理／部位",
  "胚芽鞘的彎曲反應",
  "光源方向及光強度",
  "胚芽鞘種類、初始高度及生長階段",
  "照射時間",
  "溫度及供水條件",
];
const EXPECTED = { iv: [0], dv: [1], cv: [2, 3, 4, 5] };
const ASSUMPTIONS = [
  ["similar", "胚芽鞘種類、初始高度及生長階段相近。", true],
  ["light", "各组使用相同方向、強度及照射時間的單側光照。", true],
  ["free", "罩子及套筒不限制胚芽鞘生長，頂端以下遮光組的頂端仍外露。", true],
  ["different", "各組可使用不同溫度及供水條件。", false],
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
];
const ANSWERS = {
  qTip: "tip",
  qCap: "light",
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
  persistenceOK = true,
  allowUnload = false;
let sharedRecords = [],
  syncing = null,
  syncTimer = null;
const OUTBOX_KEY = "phototropismLab.outbox.v1";
let outbox = readJSON(OUTBOX_KEY, {});
if (!outbox || typeof outbox !== "object" || Array.isArray(outbox)) outbox = {};
function fresh(profile = null) {
  return {
    moduleId: MODULE_ID,
    schemaVersion: 1,
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
}
function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
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
    FIELDS.every((f) => typeof r.form[f] === "string") &&
    r.variables &&
    ["iv", "dv", "cv"].every((g) => Array.isArray(r.variables[g])) &&
    Array.isArray(r.assumptions) &&
    Array.isArray(r.events) &&
    r.setup &&
    r.observations &&
    r.phaseDurations &&
    (!r.initialDesign ||
      (r.initialDesign.form && typeof r.initialDesign.form.reason === "string"))
  );
}
function records() {
  const r = readJSON(RECORDS_KEY, []);
  return Array.isArray(r) ? r.filter(valid) : [];
}
function accountTime() {
  const now = Date.now();
  if (state?.profile && !document.hidden)
    state.phaseDurations[state.phase] += (now - lastActive) / 1000;
  lastActive = now;
}
function readForm() {
  if (!state.submittedAt)
    FIELDS.filter((f) => f !== "reflection").forEach(
      (f) => (state.form[f] = $("#" + f).value),
    );
  if (!state.reflectionSubmittedAt)
    state.form.reflection = $("#reflection").value;
}
function save() {
  if (!state?.profile || teacher()) return;
  accountTime();
  readForm();
  state.savedAt = new Date().toISOString();
  try {
    const rows = records().filter((r) => r.id !== state.id);
    rows.push(clone(state));
    localStorage.setItem(RECORDS_KEY, JSON.stringify(rows));
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
function hypothesis(form) {
  return `若胚芽鞘的${form.hypothesisPart === "tip" ? "頂端" : form.hypothesisPart === "below" ? "頂端以下位置" : "【未選擇部位】"}被遮光，而其他部位仍然受光，胚芽鞘將會${OUTCOMES[form.hypothesisOutcome] || "【未選擇反應】"}。`;
}
function seedling(id, progress = 0, context = false) {
  const bent = context || GROUPS[id]?.bend;
  const amount = bent ? progress : 0;
  const x = 130 + 55 * amount,
    y = 66 + 15 * amount;
  const stem = `M130 207 C${130 - 14 * amount} 161 ${130 + 3 * amount} 111 ${x} ${y}`;
  let cover = "";
  if (!context) {
    if (id === "B" || id === "C")
      cover = `<path d="M${x - 13} ${y + 26}L${x - 13} ${y - 8}Q${x} ${y - 23} ${x + 13} ${y - 8}L${x + 13} ${y + 26}Z" fill="${id === "B" ? "#344a50" : "#c7e9f066"}" stroke="${id === "B" ? "#15333b" : "#6bb8c3"}" stroke-width="2"/>`;
    if (id === "D")
      cover =
        '<path d="M117 166L117 124Q130 118 143 124L143 166Z" fill="#344a50" stroke="#15333b" stroke-width="2"/>';
  }
  return `<svg class="seedling" viewBox="0 0 270 260" role="img" aria-label="${context ? "單側光照下胚芽鞘向右彎曲" : `${id} 組：${GROUPS[id].label}，${progress === 1 ? (bent ? "向右方光源彎曲" : "保持直立") : "開始時直立"}`}" xmlns="http://www.w3.org/2000/svg"><path d="M235 46L157 27L157 145L235 100Z" fill="#f9d779" opacity=".2"/><rect x="232" y="45" width="17" height="55" rx="5" fill="#f3b946"/><path d="M236 100V222M219 223H253" stroke="#658087" stroke-width="5"/><text x="225" y="30" text-anchor="middle" fill="#9c731d" font-size="13">光源</text><path d="M221 69H203M208 64L203 69L208 74" stroke="#c28c1a" stroke-width="2" fill="none"/><path d="${stem}" fill="none" stroke="#59a16a" stroke-width="13" stroke-linecap="round"/><path d="${stem}" fill="none" stroke="#a1d38a" stroke-width="4" stroke-linecap="round"/>${cover}<rect x="83" y="205" width="95" height="16" rx="5" fill="#af7851"/><path d="M91 221L103 250H158L170 221" fill="#d6a878"/><text x="130" y="258" text-anchor="middle" fill="#658087" font-size="11">${context ? "生長後的典型反應" : "胚芽鞘初始高度相同"}</text></svg>`;
}
// The opening scene uses window light and keeps the lower stem upright.
function windowSeedling(after = false) {
  const stem = after
    ? "M100 207 L100 140 C100 110 123 89 156 78"
    : "M100 207 L100 66";
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
        `<article class="specimen"><h3>${id} · ${GROUPS[id].label}</h3><div id="plant-${id}">${seedling(id, p)}</div><label for="obs-${id}">我的觀察</label><select id="obs-${id}" ${!hasRun || state.submittedAt ? "disabled" : ""}><option value="">請選擇</option><option value="bend">仍向光彎曲</option><option value="straight">沒有明顯向光彎曲</option></select></article>`,
    )
    .join("");
  Object.keys(GROUPS).forEach((id) => {
    $("#obs-" + id).value = state.observations[id] || "";
    $("#obs-" + id).onchange = () =>
      log("observation_selected", { group: id, value: $("#obs-" + id).value });
  });
}
function renderVariables() {
  $("#variableChoices").innerHTML = [
    ["iv", "獨立變量", "主動改變的因素"],
    ["dv", "因變量", "量度或觀察的結果"],
    ["cv", "控制變量", "保持不變的因素"],
  ]
    .map(
      ([key, label, description]) =>
        `<fieldset class="variable-group"><legend>${label}<span>（${description}）</span></legend><div class="variable-pills">${VARIABLES.map((v, i) => `<label class="variable-pill"><input type="checkbox" data-variable="${key}" value="${i}"><span>${v}</span></label>`).join("")}</div></fieldset>`,
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
    !state.form.hypothesisPart ||
    !state.form.hypothesisOutcome ||
    !state.form.reason.trim()
  )
    missing.push("假說兩項選擇及理由");
  if (!["iv", "dv", "cv"].every((k) => state.variables[k].length))
    missing.push("三類變量");
  if (!state.assumptions.length) missing.push("實驗前提");
  if (!state.form.controlPlan.trim()) missing.push("對照組設計");
  if (!state.setup.saved) missing.push("已儲存的装置設計");
  return missing;
}
function tableHTML(obs) {
  return `<div class="table-wrap"><table class="vl3-table"><thead><tr><th>組別</th><th>處理</th><th>我的觀察</th></tr></thead><tbody>${Object.entries(
    GROUPS,
  )
    .map(
      ([id, g]) =>
        `<tr><td>${id}</td><td>${g.label}</td><td>${esc(OUTCOMES[obs[id]] || "尚未記錄")}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}
function renderEvidence() {
  $("#evidenceTable").innerHTML = tableHTML(state.observations);
  $("#observationTable").innerHTML = Object.entries(GROUPS)
    .map(
      ([id, g]) =>
        `<tr><td>${id}</td><td>${g.label}</td><td>${esc(OUTCOMES[state.observations[id]] || "尚未記錄")}</td></tr>`,
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
    "#phase-1 input,#phase-1 textarea,#phase-2 input,#phase-2 textarea,#phase-2 select,#phase-2 button,#phase-3 select,#phase-3 button,#conclusionForm textarea,#conclusionForm select,#conclusionForm button",
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
  $("#reflection").disabled = complete();
  $("#saveReflection").disabled = !locked || complete();
  $("#downloadPDF").disabled = !complete();
  $("#reflectionStatus").textContent = complete()
    ? "學習反思已提交，可以列印／儲存 PDF 及下載紀錄。"
    : "提交反思後，才可列印／儲存 PDF。";
  if (locked) {
    const original = state.initialDesign.form;
    $("#originalHypothesis").innerHTML =
      `<strong>你的原始假說</strong><p>${esc(state.initialDesign.hypothesisText || hypothesis(original))}</p><p>原始理由：${esc(original.reason)}</p>`;
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
  if (!drawMade) return message("請先繪畫裝置，或改用文字設計。");
  saveSetup("drawing", canvas.toDataURL("image/png"));
};
$("#saveTextSetup").onclick = () => {
  if (!$("#setupDescription").value.trim())
    return message("請先描述你的裝置設計。");
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
    saveSetup("photo", canvas.toDataURL("image/png"));
  } catch {
    message("無法讀取這張圖片，請換一個檔案。");
  }
};
FIELDS.forEach((f) =>
  $("#" + f).addEventListener("input", () => {
    if (
      (state.submittedAt && f !== "reflection") ||
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
  if (!state.form.observation.trim()) return message("請先記錄你的初步觀察。");
  state.unlocked = Math.max(state.unlocked, 2);
  phase(2);
  message("先提出你的預測，再設計公平的比較。");
};
$("#toExperiment").onclick = () => {
  const missing = designMissing();
  if (missing.length) return message("請完成：" + missing.join("、"));
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
    Object.keys(GROUPS).map((id) => [id, $("#obs-" + id).value]),
  );
  if (Object.values(obs).some((v) => !OUTCOMES[v]))
    return message("請先選擇四組的觀察反應。");
  if (!state.firstObservations) state.firstObservations = clone(obs);
  state.observations = obs;
  renderEvidence();
  log("observations_recorded", { observations: obs });
  message("四組觀察已記錄。你可以再次實驗，或進入分析。");
};
$("#toAnalysis").onclick = () => {
  if (!Object.keys(GROUPS).every((id) => OUTCOMES[state.observations[id]]))
    return message("請先記錄全部四組的觀察。");
  state.unlocked = 4;
  phase(4);
  message("請引用你記錄的組別比較，完成結論。");
};
$("#submitInvestigation").onclick = () => {
  readForm();
  if (
    !Object.keys(ANSWERS).every((k) => state.form[k]) ||
    !state.form.evidence.trim()
  )
    return message("請完成四項結論及數據解釋。");
  if (state.submittedAt) return;
  state.submittedAt = new Date().toISOString();
  log("investigation_submitted", {
    form: state.form,
    observations: state.observations,
  });
  applyLock();
  message("探究答案已鎖定。請閱讀學習重點，然後回顧原始假說。");
};
$("#saveReflection").onclick = () => {
  if (!state.submittedAt || state.reflectionSubmittedAt) return;
  if (!$("#reflection").value.trim()) return message("請先寫下你的學習反思。");
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
  const f = r.form,
    original = r.initialDesign?.form;
  const answer = (title, value) =>
    `<div class="report-block"><strong>${esc(title)}</strong><p style="white-space:pre-wrap">${esc(value || "未回答")}</p></div>`;
  return `<h1>VL3 · 胚芽鞘的向光性</h1><p>${esc(r.profile.name)}｜${esc(r.profile.classInfo)}｜${esc(r.profile.email)}</p><p>紀錄 ${esc(r.id)} · ${statusOf(r)}</p><h2>01 了解情境</h2>${answer("初步觀察", f.observation)}<h2>02 設計探究</h2>${answer("第一次實驗前固定保存的原始假說", original ? r.initialDesign.hypothesisText || hypothesis(original) : "尚未開始實驗")}${answer("原始理由", original?.reason)}${answer("目前假說", hypothesis(f))}${answer("目前理由", f.reason)}${["iv", "dv", "cv"].map((g, i) => answer(["獨立變量", "因變量", "控制變量"][i], r.variables[g].map((n) => VARIABLES[n]).join("；"))).join("")}${answer("實驗前提", r.assumptions.map((id) => ASSUMPTIONS.find((a) => a[0] === id)?.[1]).join("；"))}${answer("對照組設計", f.controlPlan)}${answer("裝置文字設計", r.setup.description)}${safeImage(r.setup.image) ? `<img src="${r.setup.image}" alt="學生裝置設計">` : ""}<h2>03 觀察紀錄</h2>${tableHTML(r.observations)}<h2>04 分析與反思</h2>${answer("感光部位", f.qTip === "tip" ? "頂端" : f.qTip === "below" ? "頂端以下位置" : "")}${answer("罩子比較", f.qCap === "light" ? "頂端是否受光會影響向光彎曲。" : f.qCap === "cap" ? "只要頂端套有罩子，就不會向光彎曲。" : "")}${answer("頂端以下位置遮光的反應", OUTCOMES[f.qBelow])}${answer("證據限制", f.qLimit === "indirect" ? "没有直接量度生長素。" : f.qLimit === "proof" ? "彎曲直接證明生長素濃度。" : "")}${answer("我的數據解釋", f.evidence)}${answer("學習反思", f.reflection)}<p>實驗模型：四組相同單側光照；動畫是典型反應示意，並非真實量度。紀錄只存於本機。</p>`;
}
function printRecord(r) {
  $("#printReport").innerHTML = report(r);
  const title = document.title;
  document.title = "VL3_" + r.profile.classInfo + "_" + r.profile.name;
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
async function teacherDashboard() {
  if (!teacher()) return false;
  try {
    const response = await fetch("/api/records", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.status === 401) {
      sharedRecords = [];
      $("#teacherLogin").hidden = false;
      $("#teacherRows").innerHTML = "";
      $("#teacherStatus").textContent =
        "請以教師電郵及教師密碼登入共用資料庫。";
      $("#exportExcel").disabled = true;
      $("#importRecords").disabled = true;
      return false;
    }
    if (!response.ok) throw Error("server");
    const data = await response.json();
    sharedRecords = data.records.filter(valid);
    $("#teacherLogin").hidden = true;
    $("#exportExcel").disabled = false;
    $("#importRecords").disabled = false;
    $("#teacherStatus").textContent =
      `共用資料庫共有 ${sharedRecords.length} 份學生紀錄，包含不同瀏覽器及裝置；匯出前會重新讀取。`;
    $("#teacherRows").innerHTML =
      sharedRecords
        .map(
          (r, i) =>
            `<tr><td>${esc(r.profile.name)}</td><td>${esc(r.profile.classInfo)}</td><td>${statusOf(r)}</td><td><button class="secondary" data-report="${i}">列印 PDF</button></td></tr>`,
        )
        .join("") || '<tr><td colspan="4">暫無已同步紀錄。</td></tr>';
    $$("[data-report]").forEach(
      (b) => (b.onclick = () => printRecord(sharedRecords[+b.dataset.report])),
    );
    return true;
  } catch {
    $("#teacherStatus").textContent =
      "無法連接共用資料庫。請確認網站正在使用 VL3 伺服器，並稍後重試。";
    $("#exportExcel").disabled = true;
    $("#importRecords").disabled = true;
    return false;
  }
}
$("#teacherButton").onclick = () => {
  teacherDashboard();
  $("#teacherDialog").showModal();
};
$("#closeTeacher").onclick = () => $("#teacherDialog").close();
$("#teacherDemo").onclick = () => $("#teacherDialog").close();
$("#refreshTeacher").onclick = teacherDashboard;
$("#teacherLogin").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const response = await fetch("/api/teacher/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        email: TEACHER_EMAIL,
        password: $("#teacherPassword").value,
      }),
    });
    $("#teacherPassword").value = "";
    if (!response.ok) {
      $("#teacherStatus").textContent =
        response.status === 429
          ? "登入嘗試過多，請一分鐘後重試。"
          : "教師密碼不正確，請重試。";
      return;
    }
    await teacherDashboard();
  } catch {
    $("#teacherStatus").textContent = "無法連接伺服器，請稍後重試。";
  }
};
$("#teacherLogout").onclick = async () => {
  await fetch("/api/teacher/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  sharedRecords = [];
  await teacherDashboard();
};
$("#importRecords").onchange = async (e) => {
  if (!teacher()) return;
  let accepted = 0,
    rejected = 0;
  for (const file of e.target.files) {
    if (file.size > 10e6) {
      rejected++;
      continue;
    }
    try {
      const payload = JSON.parse(await file.text());
      if (payload.moduleId !== MODULE_ID || !Array.isArray(payload.records))
        throw Error("format");
      const rows = payload.records.filter(
        (r) => valid(r) && r.profile.email !== TEACHER_EMAIL,
      );
      rejected += payload.records.length - rows.length;
      if (rows.length) {
        const response = await fetch("/api/records/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: rows }),
        });
        if (!response.ok) throw Error("upload");
        accepted += (await response.json()).imported;
      }
    } catch {
      rejected++;
    }
  }
  $("#importStatus").textContent =
    `已匯入 ${accepted} 份新紀錄，${rejected} 份未匯入；重複且沒有更新的紀錄會略過。`;
  await teacherDashboard();
  e.target.value = "";
};
function reset(profile) {
  runGeneration++;
  running = false;
  hasRun = false;
  state = fresh(profile);
  FIELDS.forEach((f) => ($("#" + f).value = ""));
  renderVariables();
  resetCanvas();
  renderBench();
  renderEvidence();
  $("#setupStatus").textContent = "";
  $("#runStatus").textContent = "等待開始";
  $("#studentName").textContent = profile?.name || "同學";
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
$("#newSession").onclick = async () => {
  if (teacher())
    await fetch("/api/teacher/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
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
    "胚芽鞘 × 4",
    '<path d="M60 87V25" stroke="#65a772" stroke-width="9" stroke-linecap="round"/><rect x="36" y="84" width="48" height="10" rx="3" fill="#af7851"/><path d="M40 94L47 110H74L81 94" fill="#d6a878"/>',
  ],
  [
    "單側光源 × 1",
    '<path d="M70 22L32 8V78L70 58Z" fill="#f9d779" opacity=".35"/><rect x="70" y="20" width="15" height="40" rx="5" fill="#f3b946"/><path d="M78 61V104M60 105H97" stroke="#658087" stroke-width="4"/>',
  ],
  [
    "不透光罩 × 1",
    '<path d="M43 90V40Q60 14 77 40V90Z" fill="#344a50" stroke="#15333b" stroke-width="3"/>',
  ],
  [
    "透明罩 × 1",
    '<path d="M43 90V40Q60 14 77 40V90Z" fill="#c7e9f066" stroke="#6bb8c3" stroke-width="3"/><path d="M51 43V77" stroke="white" stroke-width="4"/>',
  ],
  [
    "不透光套筒 × 1",
    '<path d="M43 39V89Q60 100 77 89V39" fill="#344a50" stroke="#15333b" stroke-width="3"/><ellipse cx="60" cy="39" rx="17" ry="7" fill="#edf5ee" stroke="#15333b" stroke-width="3"/>',
  ],
];
$("#equipmentBank").innerHTML = materials
  .map(
    ([label, shapes]) =>
      `<div class="equipment"><svg viewBox="0 0 120 120" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${shapes}</svg><span>${label}</span></div>`,
  )
  .join("");
$("#contextPlant").innerHTML = contextComparison();
$("#mechanismDiagram").innerHTML =
  `<svg viewBox="0 0 340 330" role="img" aria-label="胚芽鞘頂端感光，背光側細胞伸長較多，頂端以下區域向右方光源彎曲"><rect x="15" y="12" width="310" height="306" rx="18" fill="#edf8f2"/><path d="M141 272C108 188 153 110 218 83" stroke="#63aa6e" stroke-width="30" fill="none"/><path d="M132 263C102 184 151 105 214 77" stroke="#d7ed91" stroke-width="5" fill="none"/><circle cx="219" cy="80" r="12" fill="#f3bc52"/><text x="163" y="49" font-size="15" fill="#15333b">頂端：感受光照</text><text x="23" y="150" font-size="13" fill="#15333b">背光側</text><text x="23" y="172" font-size="13" fill="#15333b">生長素較多</text><text x="23" y="194" font-size="13" fill="#15333b">細胞伸長較多</text><path d="M94 167L119 180" stroke="#658087" stroke-width="2"/><text x="196" y="226" font-size="13" fill="#15333b">頂端以下</text><text x="196" y="248" font-size="13" fill="#15333b">不均等伸長</text><path d="M188 231L149 220" stroke="#658087" stroke-width="2"/><text x="256" y="99" font-size="14" fill="#946c1a">☀ 光源</text><text x="87" y="302" font-size="13" fill="#658087">胚芽鞘機制示意 · 並非量度數據</text></svg>`;
document.addEventListener("visibilitychange", () => {
  accountTime();
  lastActive = Date.now();
  if (document.hidden) save();
});
window.addEventListener("pagehide", save);
window.addEventListener("beforeunload", (e) => {
  save();
  if (state?.profile && !complete() && !teacher() && !allowUnload) {
    e.preventDefault();
    e.returnValue = "";
  }
});
setInterval(save, 15000);
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
    ["observations", "觀察｜四組反應・自動（0–2）", "observing"],
    ["observing", "SPS 觀察（0–4）", "observing"],
    ["iv", "分類｜獨立變量（0–1）", "classifying"],
    ["dv", "分類｜因變量（0–1）", "classifying"],
    ["cv", "分類｜控制變量（0–2）", "classifying"],
    ["classifying", "SPS 分類（0–4）", "classifying"],
    ["hypothesis", "設計｜原始假說與理由・教師（0–2）", "designing", 2],
    ["assumptions", "設計｜公平比較前提（0–1）", "designing"],
    ["control", "設計｜對照組・教師（0–1）", "designing", 1],
    ["designing", "SPS 設計（0–4）", "designing"],
    ["run", "實作｜實驗及四組記錄（0–2）", "conducting"],
    ["setup", "實作｜裝置設計・教師（0–2）", "conducting", 2],
    ["conducting", "SPS 實作（0–4）", "conducting"],
    ["conclusions", "推論｜罩子與下部遮光比較（0–2）", "inferring"],
    ["evidence", "推論｜數據解釋・教師（0–2）", "inferring", 2],
    ["inferring", "SPS 推論（0–4）", "inferring"],
    ["reflection", "溝通｜反思表達・教師（0–2）", "communicating", 2],
    ["submission", "溝通｜完成探究與反思（0–2）", "communicating"],
    ["communicating", "SPS 溝通（0–4）", "communicating"],
    ["sps", "SPS 總分（0–24）", "score"],
    ["tip", "知識｜頂端感光（0–2）", "knowledge"],
    ["growth", "知識｜感光與生長部位・教師（0–2）", "knowledge", 2],
    ["auxin", "知識｜生長素與伸長機制・教師（0–2）", "knowledge", 2],
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
      observations:
        Object.keys(GROUPS).filter(
          (id) =>
            r.observations[id] === (GROUPS[id].bend ? "bend" : "straight"),
        ).length / 2,
      iv: sameSet(r.variables.iv, EXPECTED.iv) ? 1 : 0,
      dv: sameSet(r.variables.dv, EXPECTED.dv) ? 1 : 0,
      cv: sameSet(r.variables.cv, EXPECTED.cv) ? 2 : 0,
      assumptions: sameSet(
        r.assumptions,
        ASSUMPTIONS.filter((a) => a[2]).map((a) => a[0]),
      )
        ? 1
        : 0,
      run:
        r.events.some((e) => e.type === "experiment_completed") &&
        Object.keys(GROUPS).every((id) => OUTCOMES[r.observations[id]])
          ? 2
          : 0,
      conclusions:
        (r.form.qCap === ANSWERS.qCap ? 1 : 0) +
        (r.form.qBelow === ANSWERS.qBelow ? 1 : 0),
      submission: complete(r) ? 2 : 0,
      tip: r.form.qTip === ANSWERS.qTip ? 2 : 0,
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
        ["growth", "auxin", "revision"],
      ),
      overall: `IF(AND(COUNT(${ref("sps")},${ref("knowledge")})=2,${ref("status")}="已完成"),ROUND(SUM(${ref("sps")},${ref("knowledge")}),2),"待評／未完成")`,
      marking: `IF(AND(COUNT(${cols
        .filter((c) => c[3])
        .map((c) => ref(c[0]))
        .join(
          ",",
        )})=9,${ref("status")}="已完成"),"評分完成","待教師評分／學生未完成")`,
    };
    rows.push(
      cols.map((c) => {
        if (c[3]) {
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
      "初步觀察",
      2,
      "2：準確描述胚芽鞘與單側光源及彎曲；1：部分描述；0：沒有相關描述。",
    ],
    ["四組反應", 2, "每組與模型典型反應一致得 0.5；不覆蓋學生的原始觀察。"],
    ["變量分類", 4, "獨立及因變量各 1；控制變量完整選對得 2，錯選或漏選得 0。"],
    [
      "原始假說與理由",
      2,
      "2：可測試假說及合理理由；1：部分完整；0：無可測試內容。預測結果錯誤不等於假說不合理。",
    ],
    ["實驗前提", 1, "完整選擇三項公平比較前提且不選不同溫度及供水得 1。"],
    ["對照組", 1, "比較不遮光、透明罩及不透光罩，能區分遮光與罩子影響得 1。"],
    ["實驗操作", 2, "完成四組模型實驗並記錄全部觀察得 2。"],
    [
      "裝置設計",
      2,
      "2：四組處理、單側光源及固定條件清楚；1：部分完整；0：不能形成有效比較。",
    ],
    ["結論比較", 2, "透明罩比較與下部遮光結論各 1。"],
    [
      "數據解釋",
      2,
      "2：引用至少兩組實際觀察形成合理比較；1：部分證據；0：無證據。",
    ],
    [
      "反思表達",
      2,
      "2：連貫表達原始想法、結果及修訂；1：部分連結；0：無相關反思。",
    ],
    ["完成探究與反思", 2, "已提交探究及非空白反思得 2。"],
    ["頂端感光", 2, "結論選頂端得 2。"],
    [
      "感光與生長部位",
      2,
      "2：清楚區分頂端感光及頂端以下區域伸長；1：部分正確；0：未顯示理解。",
    ],
    [
      "生長素機制",
      2,
      "2：背光側生長素較多、促進胚芽鞘細胞伸長，導致向光彎曲；1：部分正確；0：未顯示理解。",
    ],
    [
      "依證據修訂與限制",
      2,
      "2：比較原始假說與組別證據、修訂解釋並指出未直接測量生長素；1：部分完成；0：無相關內容。",
    ],
    [
      "總分",
      32,
      "六項 SPS 各 4，共 24；新知識共 8。九項教師分數填妥及反思完成後才顯示整體分數。",
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
    ["對照组設計", "designing"],
    ["裝置文字設計", "conducting"],
    ["感光部位", "knowledge"],
    ["透明罩比較", "inferring"],
    ["下部遮光反應", "inferring"],
    ["證據限制", "knowledge"],
    ["數據解釋", "inferring"],
    ["學習反思", "communicating"],
    ["總時間（秒）", "identity"],
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
          ? r.initialDesign.hypothesisText || hypothesis(original)
          : "尚未開始",
        original?.reason || "",
        ...["iv", "dv", "cv"].map((g) =>
          r.variables[g].map((n) => VARIABLES[n]).join("；"),
        ),
        r.assumptions
          .map((id) => ASSUMPTIONS.find((a) => a[0] === id)?.[1])
          .join("；"),
        f.controlPlan,
        r.setup.description,
        f.qTip === "tip" ? "頂端" : f.qTip === "below" ? "頂端以下位置" : "",
        f.qCap === "light"
          ? "頂端是否受光影響彎曲"
          : f.qCap === "cap"
            ? "有罩子就不會彎曲"
            : "",
        OUTCOMES[f.qBelow] || "",
        f.qLimit === "indirect"
          ? "未直接量度生長素"
          : f.qLimit === "proof"
            ? "彎曲直接證明濃度"
            : "",
        f.evidence,
        f.reflection,
        Math.round(Object.values(r.phaseDurations).reduce((a, b) => a + b, 0)),
      ];
    const marks = {
      7: sameSet(r.variables.iv, EXPECTED.iv),
      8: sameSet(r.variables.dv, EXPECTED.dv),
      9: sameSet(r.variables.cv, EXPECTED.cv),
      10: sameSet(
        r.assumptions,
        ASSUMPTIONS.filter((a) => a[2]).map((a) => a[0]),
      ),
      13: f.qTip ? f.qTip === ANSWERS.qTip : null,
      14: f.qCap ? f.qCap === ANSWERS.qCap : null,
      15: f.qBelow ? f.qBelow === ANSWERS.qBelow : null,
      16: f.qLimit ? f.qLimit === ANSWERS.qLimit : null,
    };
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
    Object.entries(GROUPS).forEach(([id, g]) => {
      const outcome = g.bend ? "bend" : "straight";
      observations.push([
        r.id,
        r.profile.name,
        id,
        g.label,
        OUTCOMES[r.firstObservations?.[id]] || "",
        excelCell(
          OUTCOMES[r.observations[id]] || "未記錄",
          "observing",
          r.observations[id] ? r.observations[id] === outcome : null,
        ),
        OUTCOMES[outcome],
      ]);
    });
    r.events.forEach((e) =>
      events.push([r.id, e.at, e.phase, e.type, JSON.stringify(e.detail)]),
    );
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
        row: i + 1,
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
  download(
    workbook(
      [
        { name: "學生探究答案", rows: answers, conditional },
        { name: "四組觀察紀錄", rows: observations },
        scoring.sheet,
        scoring.rubric,
        { name: "操作事件紀錄", rows: events },
        { name: "原始與遞交快照", rows: snapshots },
        { name: "裝置設計圖", rows: designs },
      ],
      images,
    ),
    "VL3_向光性_全班學習紀錄.xlsx",
  );
}
$("#exportExcel").onclick = exportExcel;

function persistOutbox() {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  } catch {
    $("#syncStatus").textContent =
      "本機備份空間不足，正在嘗試直接同步；請保留此頁直至同步完成。";
  }
}
function queueSync(record) {
  if (!record?.profile || record.profile.email === TEACHER_EMAIL) return;
  const previous = outbox[record.id];
  outbox[record.id] = {
    record: clone(record),
    writeToken:
      previous?.writeToken || crypto.randomUUID() + crypto.randomUUID(),
    sequence: (previous?.sequence || 0) + 1,
    pending: true,
  };
  persistOutbox();
  $("#syncStatus").textContent = "正在儲存作答到共用資料庫……";
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flushSync, 350);
}
async function flushSync() {
  if (syncing) return syncing;
  syncing = (async () => {
    const ids = Object.keys(outbox).filter((id) => outbox[id].pending);
    for (const id of ids) {
      const entry = clone(outbox[id]);
      try {
        const response = await fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            record: entry.record,
            writeToken: entry.writeToken,
            sequence: entry.sequence,
          }),
        });
        if (!response.ok) throw Error("server_" + response.status);
        if (outbox[id]?.sequence === entry.sequence) outbox[id].pending = false;
        persistOutbox();
      } catch {
        $("#syncStatus").textContent =
          "尚未同步到共用資料庫，已保留待傳紀錄；連線恢復後會重試。";
        return false;
      }
    }
    const pending = Object.values(outbox).some((entry) => entry.pending);
    $("#syncStatus").textContent = pending
      ? "仍有作答等待同步……"
      : "作答已同步到共用資料庫，教師可跨瀏覽器查看。";
    return !pending;
  })();
  try {
    return await syncing;
  } finally {
    syncing = null;
  }
}
window.addEventListener("online", flushSync);
setInterval(() => {
  if (Object.values(outbox).some((entry) => entry.pending)) flushSync();
}, 5000);
// Migrate records created before shared storage was added. No teacher data uploads.
records()
  .filter((r) => r.profile.email !== TEACHER_EMAIL && !outbox[r.id])
  .forEach(queueSync);
if (Object.values(outbox).some((entry) => entry.pending)) flushSync();
