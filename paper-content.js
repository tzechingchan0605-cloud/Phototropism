"use strict";
// Read shared VL content plus the versioned paper teaching sequence; never read
// a learner's answers or call reset(), phase(), log(), save() or cloud APIs.
window.VL3PaperContent = (() => {
  const record = {experimentVersion: EXPERIMENT_VERSION};
  const element = (html) => {
    const root = document.createElement("div");
    root.innerHTML = html;
    return root;
  };
  const text = (zh, en) => `<span data-en="${esc(en)}">${esc(zh)}</span>`;
  function lines(field) {
    return `<div class="answer-lines" data-answer-field="${esc(field)}"><i></i><i></i></div>`;
  }
  function canonicalClone(source) {
    if (!source) throw Error("Missing shared VL content");
    const root = source.cloneNode(true);
    const original = document.createTreeWalker(source,NodeFilter.SHOW_TEXT);
    const copied = document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while (original.nextNode() && copied.nextNode()) copied.currentNode.data = VL3Language.sourceText(original.currentNode);
    [root,...root.querySelectorAll("*")].forEach(node=>{
      ["aria-label","title","textLength","lengthAdjust","disabled","selected","checked"].forEach(attribute=>node.removeAttribute(attribute));
    });
    return root;
  }
  function printClone(source) {
    const root = canonicalClone(source);
    root.querySelectorAll("button,[role=status],input[type=hidden],input[type=range],output,.drawing-tools,.ruler-hint").forEach(node => node.remove());
    root.querySelectorAll("select").forEach(select => {
      if (["tipView", "extensionView"].includes(select.id)) {
        select.closest("label").remove();
        return;
      }
      const choice = document.createElement("span");
      choice.className = "circle-options";
      choice.dataset.answerField = select.id;
      choice.textContent = "（" + [...select.options].filter(option => option.value !== "").map(option => option.textContent.trim()).join(" ／ ") + "）";
      // Translate options separately, preserving grammatical data-en fragments.
      choice.replaceChildren(document.createTextNode("（"));
      [...select.options].filter(option => option.value !== "").forEach((option, index) => {
        if (index) choice.append(document.createTextNode(" ／ "));
        const item = document.createElement("span");
        item.textContent = option.textContent.trim();
        choice.append(item);
      });
      choice.append(document.createTextNode("）"));
      select.replaceWith(choice);
    });
    root.querySelectorAll("textarea,input[type=number],input[type=text]").forEach(input => {
      const blank = element(lines(input.id)).firstElementChild;
      input.replaceWith(blank);
    });
    root.querySelectorAll('input[type="checkbox"],input[type="radio"]').forEach(input => {
      const box = document.createElement("span");
      box.className = "paper-check";
      box.dataset.choiceType = input.type;
      box.textContent = input.type === "checkbox" ? "□" : "○";
      input.replaceWith(box);
    });
    root.querySelectorAll("canvas").forEach(canvas => {
      const frame = document.createElement("div");
      frame.className = "drawing-frame";
      frame.dataset.answerField = canvas.id;
      canvas.replaceWith(frame);
    });
    root.removeAttribute("hidden");
    root.querySelectorAll("[hidden]").forEach(node => node.removeAttribute("hidden"));
    root.querySelectorAll("[id]").forEach(node => {
      node.dataset.vlSource = node.id;
      node.removeAttribute("id");
    });
    root.removeAttribute("id");
    return root;
  }
  const source = selector => printClone(document.querySelector(selector)).outerHTML;
  function card(selector, omit = []) {
    const clone = canonicalClone(document.querySelector(selector));
    omit.forEach(selector => clone.querySelectorAll(selector).forEach(node => node.remove()));
    return printClone(clone).outerHTML;
  }
  function diagram(html) {
    const root = element(html);
    root.querySelectorAll("[aria-label]").forEach(svg => svg.removeAttribute("aria-label"));
    return root.innerHTML;
  }
  function pairedPlants(ids, type) {
    const plant = (id, progress) => type === "agar"
      ? extensionPlant(id, progress, (EXT_MODEL[id].direction === "left" ? -1 : 1) * EXT_MODEL[id].angle * progress, progress === 1)
      : seedling(id, progress);
    const label = id => type === "agar" ? id + " · " + EXT_LABELS[id] : sampleName(id, record) + " · " + GROUPS[id].label;
    const stage = (id,progress) => {
      const root=element(diagram(plant(id,progress))),svg=root.querySelector("svg");
      const caption=type === "agar" ? svg.querySelector(":scope > text") : [...svg.querySelectorAll(":scope > text")].at(-1);
      const words=caption.textContent;caption.remove();
      // Crop only unused side padding; both stages use identical bounds/scale.
      if (type === "agar") {
        svg.setAttribute("viewBox","15 -8 275 290");
        const {x,y}=extensionGeometry(id,progress);
        // Space numeric labels further apart without changing ticks or angles.
        svg.querySelectorAll("[data-protractor] text").forEach((node,i)=>{
          const radians=(i*10-90)*Math.PI/180;
          node.setAttribute("x",x+Math.sin(radians)*88);
          node.setAttribute("y",y-Math.cos(radians)*88+4);
        });
      }
      return `<div class="stage-figure">${root.innerHTML}<span class="stage-caption">${esc(words)}</span></div>`;
    };
    return `<div class="plant-grid ${type === "agar" ? "four-plants" : ""}">${ids.map(id => `<figure><figcaption>${esc(label(id))}</figcaption><div class="plant-pair">${stage(id,0)}${stage(id,1)}</div></figure>`).join("")}</div>`;
  }
  function identity() {
    return `<div class="identity-fields"><span>${text("姓名", "Name")}：<i></i></span><span>${text("班別", "Class")}：<i></i></span><span>${text("學號", "Student number")}：<i></i></span></div>`;
  }
  function page(code, title, content, identified = false) {
    return `<section class="paper-page" data-page="${code}"><header><b>VL3 · ${text(title,({"A · 自學概念":"A · Self-study concepts","A · 已解說示例與方法":"A · Worked examples and methods","B · 有提示練習：公平比較":"B · Guided practice: fair comparisons","B · 有提示練習：遮光與切頂":"B · Guided practice: shading and tip removal","B · 有提示練習：黑暗瓊脂比較":"B · Guided practice: dark agar comparisons","B · 獨立應用":"B · Independent application","B · 有提示練習：瓊脂位置":"B · Guided practice: agar placement","C · 核對答案":"C · Check answers","C · 核對推理與修正":"C · Check reasoning and correct","D · 教師指引及時間安排":"D · Teacher guide and timing","D · 完整答案及判讀界限":"D · Complete answers and evidence limits","D · 逐題目標配對":"D · Question-to-goal mapping","D · 完整分析答案":"D · Complete analysis answers"})[title] || title)}</b><span>${code}</span></header>${identified ? identity() : ""}<main>${content}</main><footer><span data-paper-version></span><span>${code}</span></footer></section>`;
  }
  const REVISION = 2;
  const title = () => text("植物的感光與生長", "Light sensing and growth in plants");
  const p = (zh,en,css="") => `<p${css ? ` class="${css}"` : ""}>${text(zh,en)}</p>`;
  const h = (zh,en) => `<h3>${text(zh,en)}</h3>`;
  const prompt = (id,zh,en) => `<div class="paper-question" data-paper-question="${id}">${p(zh,en)}${lines(id)}</div>`;
  const choices = (id,items) => `<span class="circle-options" data-answer-field="${id}">（${items.map(([zh,en])=>text(zh,en)).join(" ／ ")}）</span>`;
  const row = (values) => `<tr>${values.map(value=>`<td>${value}</td>`).join("")}</tr>`;
  const drawingHint = () => printClone([...document.querySelectorAll(".setup-card .design-hint")].find(node=>canonicalClone(node).textContent.includes("不用精緻"))).outerHTML;
  function structure() {
    return `<div class="structure"><svg viewBox="0 0 430 160" role="img"><path d="M91 137V43Q91 17 105 17Q119 17 119 43V137" fill="#dceacf" stroke="#333" stroke-width="2"/><path d="M104 137V59Q113 68 112 137" fill="#bbb" stroke="#555"/><path d="M119 28H183M118 84H183M112 120H183" stroke="#333"/><text x="188" y="32" font-size="16" data-en="Tip: senses light">頂端：參與感光</text><text x="188" y="88" font-size="16" data-en="Coleoptile: protective sheath">胚芽鞘：保護幼葉的鞘</text><text x="188" y="124" font-size="16" data-en="Young leaf inside">內部幼葉</text></svg>${p("燕麥胚芽鞘是包圍及保護幼葉的鞘狀構造；本活動觀察胚芽鞘的延長與彎曲。", "An oat coleoptile is a sheath that surrounds and protects the young leaf. This activity examines elongation and bending of the sheath.")}</div>`;
  }
  function initialSetups() {
    return `<div class="plant-grid initial-setups">${MAIN_IDS.map(id=>`<figure><figcaption>${sampleName(id,record)}</figcaption>${diagram(seedling(id,0))}<div class="setup-label">${text("處理標示：", "Treatment label:")}${lines("paper-label-"+sampleName(id,record))}</div></figure>`).join("")}</div>`;
  }
  function angleExample() {
    return `<div class="method-example"><svg viewBox="0 0 300 230" role="img"><path d="M150 190V135" stroke="#555" stroke-dasharray="4 3"/>${protractorSVG(150,120,20)}<path d="M150 120L174 54" stroke="#222" stroke-width="5"/><text x="16" y="216" font-size="14" data-en="Method example only: 20°, right">僅示範讀數方法：20°，向右</text></svg><div>${h("已解說示例：角度與方向分開", "Worked example: angle and direction are separate")}${p("以鉛直線為 0°，讀取頂端方向偏離鉛直的大小。圖示為向右 20°；若相同大小向左傾斜，角度仍是 20°，方向改為向左。", "Use the vertical line as 0°. Read how far the tip direction differs from vertical. This example is 20° to the right. The same tilt to the left is still 20°, but its direction is left.")}${p("橙色指針與頂端方向對齊；虛線是鉛直參考。這幅只教讀數，不是 E–H 的實驗資料。", "The solid pointer follows the tip direction; the dashed line is the vertical reference. This diagram teaches reading, and is not experimental data for E–H.","muted")}</div></div>`;
  }
  function table(ids,type) {
    const agar=type==="agar",tip=type==="tip";
    const option=(id)=>printClone(element(selectHTML((agar?"ext-direction-":tip?"tip-growth-":"obs-")+id,tip?TIP_GROWTH:DIRECTIONS)).firstElementChild).innerHTML;
    return `<table class="observation-table"><thead><tr><th>${text("裝置", "Setup")}</th><th>${text("處理", "Treatment")}</th>${agar?`<th>${text("角度（°）", "Angle (°)")}</th>`:""}<th>${text(tip?"延長表現":"彎曲方向",tip?"Elongation":"Bending direction")}</th></tr></thead><tbody>${ids.map(id=>row([agar?id:sampleName(id,record),esc(agar?EXT_LABELS[id]:GROUPS[id].label),...(agar?[`<span data-numeric-field="ext-angle-${id}">_____ °</span>`]:[]),option(id)])).join("")}</tbody></table>`;
  }
  function questionMap() {
    const shared=(id)=>questionText(id,record);
    return [
      ["P1", "初步外形及方向觀察", "Initial shape and direction observation", "保留／靜態化", "Retain / static", "觀察窗邊胚芽鞘前後圖，描述外形及方向的改變。", "Describe changes in shape and direction in the window-side images.", "觀察及記錄", "Observation and recording", "保留同一情境；以圖像代替動畫。", "Same context; images replace animation."],
      ["E1", "主探究原始假說與理由", "Original main-inquiry hypothesis and reason", "改為示例", "Worked example", "評估指定預測：遮住頂端以下位置仍可能向光彎曲。", "Evaluate a given prediction: blocking light below the tip may still allow bending towards light.", "可測試預測及理由", "Testable prediction and reasoning", "先解說機制，再示範如何提出有根據的預測；不評原始假說。", "Teach the mechanism first; model an evidence-based prediction without scoring an original hypothesis."],
      ["P2", "三組自主裝置繪圖／文字設計", "Autonomous setup drawing / written design", "改寫／靜態化", "Rewrite / static", "在所提供三組圖補全遮光標示。", "Label the shading treatments in three provided diagrams.", "辨認裝置與處理", "Identify apparatus and treatments", "提供相同三組圖，讓自學學生處理科學標示；不假稱是虛擬操作。", "Provide the same setups for scientific labelling; do not equate this with virtual operation."],
      ["P3", "主探究三類變量與實驗前提", "Main-inquiry variables and assumptions", "保留", "Retain", "選主探究變量與所有適用前提。", "Select main-inquiry variables and all applicable assumptions.", "分類與控制變量", "Classify and control variables", "沿用變量選項及初始大小、溫度、遮光物不限制生長等前提。", "Keep variable choices and assumptions about initial size, temperature and unrestricted growth."],
      ["P4", "自主對照組設計", "Autonomous control design", "等值改寫", "Equivalent rewrite", "解釋不遮光 A 的作用，以及 A–B／A–C 如何公平比較。", "Explain the role of uncovered A and fair comparisons A–B / A–C.", "公平比較與對照", "Fair comparison and controls", "指定對照，仍要求比較基準及控制條件的推理。", "Supply the control while retaining reasoning about baseline and controlled conditions."],
      ["P5", "主探究 A／B／C 方向記錄", "Main A / B / C direction records", "靜態化", "Static", "圈選三組培養後的彎曲方向。", "Circle the bending direction after incubation for each setup.", "觀察及記錄", "Observation and recording", "共用前後模型圖及原方向選項。", "Shared before/after models and original direction options."],
      ["P6", shared("qShade"), "Compare A and B: what changes when the tip is shaded?", "保留", "Retain", shared("qShade"), "Compare A and B: what changes when the tip is shaded?", "比較及推論", "Comparison and inference", "保留原題及選項；運用已教概念解讀資料。", "Keep the question and options; apply taught concepts to data."],
      ["P7", shared("qBelow"), "Compare A and C: does it bend without direct light below the tip?", "保留", "Retain", shared("qBelow"), "Compare A and C: does it bend without direct light below the tip?", "比較及推論", "Comparison and inference", "使用學生標示 C；不重編舊 D 紀錄。", "Use displayed C without renumbering legacy D records."],
      ["P8", shared("qTip"), "Which part may sense light from one side?", "保留", "Retain", shared("qTip"), "Which part may sense light from one side?", "證據支持感光推論", "Infer light sensing from evidence", "保留 A/B、A/C 證據鏈。", "Keep the A/B and A/C evidence chain."],
      ["E2", "延伸一原始預測與理由", "Original extension-one prediction and reason", "改為應用示範", "Application example", "用頂端可產生生長促進作用評估切頂的預測及界限。", "Use the tip's growth-promoting role to evaluate a cut-tip prediction and its limits.", "有根據的預測", "Reasoned prediction", "先教作用與傷口界限，不再評事前猜測。", "Teach the role and wound caveat rather than scoring an advance guess."],
      ["P9", "A/D 延長記錄及實驗結論", "A/D elongation records and conclusion", "保留／靜態化", "Retain / static", "圈選 A、D 是否延長，再完成頂端作用結論。", "Record whether A and D elongate, then conclude about the tip's role.", "定性觀察及推論", "Qualitative observation and inference", "共用 A 與切頂 D 圖及原有／沒有選項。", "Shared intact A / cut-tip D images and yes/no options."],
      ["E3", "延伸二原始預測與理由", "Original extension-two prediction and reason", "改為教學解說", "Explanation", "解說瓊脂承載作用、放置位置與兩側延長的關係。", "Explain how agar carries an effect and how placement relates to differential elongation.", "模型理解及預測", "Model understanding and prediction", "先教方法，再讓學生獨立解讀黑暗 E–H。", "Teach the method before independent interpretation of dark E–H."],
      ["P10", "E–H 虛擬指針量角及方向", "E–H adjustable-pointer measurement and direction", "靜態化", "Static", "讀靜態量角器並另記方向。", "Read static protractors and record direction separately.", "量度及記錄", "Measurement and recording", "保持 0/0/35/35 模型；讀圖分數不等同虛擬操作。", "Retain the 0/0/35/35 model; image reading is not virtual-operation scoring."],
      ["P11", shared("extEF"), "What does comparing E and F support?", "保留", "Retain", shared("extEF"), "What does comparing E and F support?", "傳遞作用的證據", "Evidence for a transferable effect", "兩組中央，只有瓊脂是否接觸頂端不同。", "Both are central; only prior tip contact differs."],
      ["P12", shared("extPosition"), "What does comparing F, G and H support?", "保留", "Retain", shared("extPosition"), "What does comparing F, G and H support?", "作用位置及彎曲", "Placement and bending", "同種處理瓊脂，不同放置位置；黑暗無當時光照。", "Same treated agar, different positions; no light during dark incubation."],
      ["P13", "延伸二第3題左右延長句內填空", "Extension-two cloze on differential elongation", "保留", "Retain", "左側物質 X 較多／少、細胞延長較多／少、向左／右彎曲。", "Select more/less X on the left, more/less elongation, and left/right bending.", "兩側延長推理", "Reason about differential elongation", "保留原選項，學生圈選而不是下拉。", "Keep options as circling choices rather than dropdowns."],
      ["P14", "三段探究的公平比較目標", "Fair-comparison aims across three investigations", "等值應用", "Equivalent application", "分別辨認 A–D、E–F、F–G–H 的獨立變量。", "Identify the independent variable separately for A–D, E–F and F–G–H.", "遷移變量分類", "Transfer variable classification", "避免把遮光、切頂及瓊脂位置視作同一變量。", "Distinguish shading, tip removal, agar conditioning and placement."],
      ["P15", REFLECTION_PROMPT, "Use the learning points to explain the right-bending coleoptile in the diagram.", "保留／獨立應用", "Retain / independent application", REFLECTION_PROMPT, "Use the learning points to explain the right-bending coleoptile in the diagram.", "整合概念與解釋", "Integrate concepts in an explanation", "仍連結右方光、左背光、生長素、差異延長；不改為修訂假說。", "Link right-side light, shaded left, auxin and differential elongation, not hypothesis revision."],
      ["C1", "最後才揭示學習重點", "Learning points revealed at the end", "移至 A；C 核對修正", "Move to A; C checks/corrects", "開始可讀概念；完成 B 後核對並另記修正。", "Read concepts from the start; after B, check answers and record corrections separately.", "概念理解及修正", "Conceptual understanding and correction", "符合無課前講授的自學比較組條件。", "Fits the self-study condition without a prelesson lecture."],
    ];
  }
  function answers() {
    const refs = Object.entries({...MAIN_ANSWERS,...TIP_ANSWERS,...EXT_ANSWERS}).filter(([key])=>!Object.hasOwn(EXT_CLOZE_ANSWERS,key));
    const mainRows = MAIN_IDS.map(id=>row([sampleName(id,record),esc(GROUPS[id].label),esc(DIRECTIONS[mainModel(id,record).direction])])).join("");
    const tipRows = TIP_IDS.map(id=>row([sampleName(id,record),esc(GROUPS[id].label),esc(TIP_GROWTH[tipModel(id,record).growth])])).join("");
    const agarRows=EXT_IDS.map(id=>row([id,esc(EXT_LABELS[id]),esc(extensionAngleReference(id)),esc(DIRECTIONS[EXT_MODEL[id].direction])])).join("");
    return {mainRows,tipRows,agarRows,refs:refs.map(([key,value])=>`<p><b>${esc(questionText(key,record))}</b> ${esc(answerOption(key,value,record))}</p>`).join(""),cloze:extensionClozeSentence(key=>esc(answerOption(key,EXT_CLOZE_ANSWERS[key],record)))};
  }
  function sources() {
    const a=answers();
    const conditions=[...document.querySelector("#phase-3 > .vl3-card").children].filter(node=>node.matches("h3,p")).map(node=>printClone(node).outerHTML).join("");
    const A=[
      page("A1", "A · 自學概念", `<h1>${title()}</h1>${p("閱讀 A，再完成 B。完成 B 後才取閱 C 核對；不用操作虛擬實驗。", "Read A, then complete B. Read C only after finishing B. You do not need to operate a virtual lab.","notice")}${structure()}${h("先學核心概念", "Learn the core concepts first")}${diagram(learningPointsHTML())}${diagram(mechanismSVG())}`,true),
      page("A2", "A · 已解說示例與方法", `${h("已解說示例：有根據的預測", "Worked example: a reasoned prediction")}${p("指定預測：「頂端以下位置被遮光，胚芽鞘仍可能向光彎曲。」此預測合理，因為完整頂端仍能感受單側光照，生長促進作用可向下傳遞；下部不必直接受光才會產生不均勻延長。以 A 與 C 比較測試這項預測。", "Given prediction: ‘The coleoptile may still bend towards light when light is blocked below the tip.’ This is reasonable: the intact tip can sense light from one side and a growth-promoting effect can pass down. The lower region need not receive light directly to elongate unequally. Compare A and C to test it.")}${h("示範辨認變量", "Example: identify variables")}${p("A–C 比較只改變遮光處理；記錄彎曲反應。光源方向及光強度、種類、初始大小、生長狀況、時間、溫度及供水要保持相同。獨立變量是刻意改變的因素，因變量是觀察或量度的反應，控制變量則保持相同。", "A–C changes only the shading treatment and records bending. Keep light direction and intensity, species, initial size and condition, time, temperature and water the same. The independent variable is deliberately changed; the dependent variable is the response observed or measured; controlled variables are kept the same.")}${h("切頂與瓊脂：把概念用於新比較", "Tip removal and agar: apply the concepts to new comparisons")}${p("頂端除了感光，也可產生促進下方延長的作用。因此「切頂不會影響延長」不是充分考慮頂端作用的預測；仍要看 A/D 資料。切頂亦造成傷口及移除組織，這項比較不能單獨證明唯一機制。", "The tip senses light and can produce an effect that promotes elongation below it. A prediction that tip removal cannot affect elongation overlooks this role; check the A/D data. Cutting also creates a wound and removes tissue, so this comparison alone cannot prove a unique mechanism.")}${p("瓊脂可讓一些物質進入及通過。空白瓊脂未接觸頂端；處理瓊脂曾接觸頂端，可承載從頂端取得的生長促進作用。在黑暗中比較瓊脂是否處理及放置位置，不能把彎曲說成當時光照直接造成。", "Agar lets some substances enter and pass through. Blank agar has not touched the tip; treated agar has touched the tip and can carry a growth-promoting effect obtained from it. Comparisons of treatment and placement occur in darkness; bending cannot be attributed to light acting during incubation.")}${angleExample()}${p("本活動的 24 小時及角度是教學模型，並非真實常數。延長及彎曲並不直接量度生長素濃度，也不能單獨辨定物質的化學身分；生長素的身分及光照下的分布結合其他研究理解。", "The 24-hour period and angles are teaching-model settings, not real constants. Elongation and bending do not directly measure auxin concentration or identify a chemical substance. Auxin identity and its distribution under light are understood together with other research.","notice")}`),
    ];
    const B=[
      page("B1", "B · 有提示練習：公平比較", `${h("1. 補全三組圖的處理標示", "1. Complete the treatment labels")}${p("從「不遮光、頂端遮光、頂端以下遮光」選取標示；三組頂端均完整，光源在左方。", "Choose labels: uncovered, tip shaded, shaded below the tip. All tips are intact and the light is on the left.")}${initialSetups()}${drawingHint()}${h("2. 主探究的變量及實驗前提", "2. Variables and assumptions in the main comparison")}${source("#variableChoices")}${source(".assumptions-card")}${prompt("paper-control", "3. 不遮光 A 作甚麼比較基準？A–B 及 A–C 各只改變甚麼？至少寫兩項需相同的條件。", "3. What baseline does uncovered A provide? What alone changes in A–B and A–C? Give at least two conditions that must be the same.")}${source(".control-card .design-hint")}`),
      page("B2", "B · 有提示練習：遮光與切頂", `${h("4. 觀察與分析遮光比較", "4. Observe and analyse shading comparisons")}${conditions}${pairedPlants(MAIN_IDS,"main")}${table(MAIN_IDS,"main")}${p("提示：先比較處理及前後形狀，再用 A 作基準。", "Hint: compare treatments and before/after shapes, using A as the baseline.","muted")}${card("#conclusionForm",["#evidenceTable","h3"])}${h("5. 完整 A 與切頂 D 的延長比較", "5. Compare elongation of intact A and cut-tip D")}${p("相同左側光照及培養條件；比較頂端是否存在。從前後圖圈選有／沒有延長，然後完成結論。切頂亦涉及傷口，勿推論唯一機制。", "Use the same left-side light and incubation conditions; compare whether the tip is present. Use the before/after images to circle yes/no elongation, then complete the conclusion. Cutting also creates a wound; do not infer a unique mechanism.")}${pairedPlants(TIP_IDS,"tip")}${table(TIP_IDS,"tip")}${card("#tipAnalysis",["h3"])}`),
      page("B3", "B · 有提示練習：黑暗瓊脂比較", `${h("6. 記錄黑暗中 E／F 的角度與方向", "6. Record E/F angles and directions in darkness")}${p("E–H 全部在黑暗中培養 24 小時（教學模型），種類、初始大小、時間、溫度及供水相同。用 A2 方法讀培養後量角器，角度是偏離鉛直的大小；另記方向。各組瓊脂種類及位置在培養期間不變。", "All E–H are incubated in darkness for 24 hours (a teaching model), with the same species, initial size, time, temperature and water. Use the A2 method to read final protractors: angle is the magnitude from vertical; record direction separately. Agar type and position remain fixed during incubation.")}${source("#extensionSection .materials-note")}${pairedPlants(["E","F"],"agar")}${table(["E","F"],"agar")}`),
      page("B4", "B · 有提示練習：瓊脂位置", `${h("6.（續）記錄 G／H，並分析 E–H", "6. (continued) Record G/H and analyse E–H")}${p("G／H 同樣在黑暗中培養；使用同種處理瓊脂，但放置位置不同。先量角並記方向，再回答下列三題。", "G/H are also incubated in darkness. They use the same treated agar at different positions. Read the angle and record direction, then answer the three questions below.","muted")}${pairedPlants(["G","H"],"agar")}${table(["G","H"],"agar")}${card("#extensionAnalysis",["h3"])}`),
      page("B5", "B · 獨立應用", `${h("7. 辨認不同比較的獨立變量", "7. Identify independent variables in different comparisons")}${p("從每列括號圈選一項；不要把不同實驗的變量混在一起。", "Circle one option in each row; distinguish variables across the investigations.")}${p("A–D：", "A–D:")}${choices("paper-tip-iv",[["頂端是否存在","whether the tip is present"],["光源方向","light direction"]])}${p("E–F：", "E–F:")}${choices("paper-agar-contact-iv",[["瓊脂是否曾接觸頂端","whether agar previously touched the tip"],["瓊脂放置位置","agar position"]])}${p("F–G–H：", "F–G–H:")}${choices("paper-agar-position-iv",[["瓊脂是否曾接觸頂端","whether agar previously touched the tip"],["處理瓊脂放置位置","treated agar position"]])}${h("8. 觀察窗邊情境，再作概念應用", "8. Observe the window-side context, then apply the concepts")}${diagram(contextComparison())}${prompt("paper-observation","觀察前後圖，描述胚芽鞘外形及生長方向的改變。", "Describe the change in coleoptile shape and growth direction in the before/after images.")}${p(REFLECTION_PROMPT,"Use the learning points to explain why the coleoptile in the diagram bends to the right.")}${p("解釋須連結光源方向、背光側、生長素及兩側細胞的差異延長。", "Connect light direction, the shaded side, auxin and differential elongation of cells on the two sides.","muted")}${lines("reflection")}${p("保留這份首次作答；完成 B 後才取閱 C 核對，修正另寫，不擦掉原答。", "Keep these first answers. Read C only after completing B; write corrections separately without erasing the originals.","notice")}`),
    ];
    const varRows=["iv","dv","cv"].map((key,i)=>row([esc(["獨立變量","因變量","控制變量"][i]),EXPECTED[key].map(id=>esc(VARIABLES[id])).join("；")])).join("");
    const control=p("A 沒有遮光，提供同樣環境下未經遮光處理的比較基準。A–B 只改變頂端遮光；A–C 只改變下部遮光。其他條件如初始大小及溫度相同，避免其他因素影響結果。", "A is uncovered and provides a baseline without shading in the same environment. A–B changes tip shading; A–C changes shading below the tip. Keep conditions such as initial size and temperature the same to avoid other influences.");
    const ivs=p("A–D：頂端是否存在。E–F：瓊脂是否曾接觸頂端，位置均在中央。F–G–H：處理瓊脂放置位置，瓊脂種類相同。主探究則是遮光處理。", "A–D: whether the tip is present. E–F: whether agar previously touched the tip, with both in the centre. F–G–H: treated agar position, with the same agar type. The main comparison changes shading treatment.");
    const limits=p("切頂會造成傷口及移除組織，不能據此獨自確定唯一機制。黑暗中的瓊脂結果支持可轉移的生長促進作用及不均勻延長；不是當時光照直接引致彎曲，也不是直接量得生長素濃度或辨定物質身分。", "Cutting creates a wound and removes tissue, so it cannot establish a unique mechanism alone. Dark agar results support a transferable growth-promoting effect and unequal elongation. Bending is not caused by light during incubation; the results neither measure auxin concentration directly nor identify the substance.");
    const C=[
      page("C1", "C · 核對答案", `${p("完成 B 後才閱讀。A 可繼續參考；以下供核對，不覆寫首次作答。", "Read only after completing B. Keep A available; check these answers without overwriting your first responses.","notice")}${h("B1：標示、變量及公平比較", "B1: labels, variables and fair comparisons")}${p("標示：A 不遮光；B 頂端遮光；C 頂端以下遮光。", "Labels: A uncovered; B tip shaded; C shaded below the tip.")}<table>${varRows}</table>${p("適用前提：初始生長狀況相近；遮光物不限制延長與彎曲；遮光不造成明顯溫差。相同種類並不代表不用控制初始大小。", "Valid assumptions: similar initial growth condition; shading does not restrict elongation or bending; shading creates no clear temperature difference. The same species does not remove the need to control initial size.")}${control}${h("B2／B3／B4：核對觀察", "B2 / B3 / B4: check observations")}<table><thead><tr><th>${text("裝置","Setup")}</th><th>${text("處理","Treatment")}</th><th>${text("方向","Direction")}</th></tr></thead><tbody>${a.mainRows}</tbody></table><table><thead><tr><th>${text("裝置","Setup")}</th><th>${text("處理","Treatment")}</th><th>${text("延長","Elongation")}</th></tr></thead><tbody>${a.tipRows}</tbody></table><table class="agar-answers"><thead><tr><th>${text("裝置","Setup")}</th><th>${text("處理","Treatment")}</th><th>${text("角度","Angle")}</th><th>${text("方向","Direction")}</th></tr></thead><tbody>${a.agarRows}</tbody></table>${p("方法核對：E/F 為 0°；G/H 接受 33–37°，角度大小相同，但方向相反。觀察及讀數是模型資料，不是生長素濃度。", "Method check: E/F are 0°. G/H accept 33–37°, with equal angle magnitudes but opposite directions. Observations and readings are model data, not auxin concentrations.","muted")}`,true),
      page("C2", "C · 核對推理與修正", `${h("B2／B3／B4：核對分析", "B2 / B3 / B4: check analysis")}${a.refs}<p>3. ${a.cloze}</p>${h("B5：獨立應用", "B5: independent application")}${ivs}${p("窗邊情境：初始較直，培養後向右方光源彎曲。", "Window-side context: initially straighter, then bent towards the light on the right.")}${p(REFLECTION_REFERENCE,"The light is on the right, so the left is the shaded side. The tip senses light from one side; auxin is more abundant on the shaded left and its growth-promoting effect passes down. Cells on the left elongate more than those on the right, making the coleoptile bend towards the right-side light.")}${limits}${h("核對修正", "Check and correct")}${prompt("paper-correction-1","指出一項你修正的答案，並寫出圖像或比較的依據。（若原答正確，寫出一項支持依據。）", "Identify one answer you corrected and the image or comparison supporting the correction. If correct initially, give one supporting piece of evidence.")}${prompt("paper-correction-2","用一句話說明你對生長素、差異延長與彎曲關係的理解。", "In one sentence, explain how auxin, differential elongation and bending are related.")}`),
    ];
    const timing=`<table class="timing"><thead><tr><th>${text("階段","Stage")}</th><th>15 min</th><th>20 min</th><th>${text("派發及支援","Distribution and support")}</th></tr></thead><tbody>${[
      [text("A：概念與圖像","A: concepts and images"),"3","4",text("開始即派 A；不先講授。","Give A at the start; no prelesson lecture.")],
      [text("A：已解說示例","A: worked examples"),"2","2",text("學生自行閱讀。","Students read independently.")],
      [text("B1–B4：有提示練習","B1–B4: guided practice"),"5","7",text("派 B；只用紙上共同提示。","Give B; use the shared printed hints.")],
      [text("B5：獨立應用","B5: independent application"),"2","3",text("A 可查閱；不提供個別答案。","A remains available; no individual answers.")],
      [text("C：核對修正","C: check and correct"),"3","4",text("B 完成並保留首次答案後才派 C。","Give C only after B is finished and first answers retained.")],
    ].map(row).join("")}</tbody></table>`;
    const rubric=[
      [text("紙本形成性評分（獨立於 VL）","Paper formative assessment (separate from VL)"),text("分數","Points"),text("紙本證據與準則","Paper evidence and criteria")],
      [text("觀察及記錄","Observation and recording"),"0–2",text("B2/B3/B4/B5：方向、A/D 有無延長及窗邊外形記錄。2＝正確且完整；1＝部分正確；0＝無有效記錄。","B2/B3/B4/B5: direction, presence/absence of A/D elongation and window-side shape. 2: accurate and complete; 1: partly accurate; 0: no valid record.")],
      [text("變量分類","Variable classification"),"0–2",text("B1/B5：主遮光 IV/DV/CV 及切頂、瓊脂處理、位置三種 IV。2＝各比較均辨認正確；1＝部分正確；0＝未辨認。","B1/B5: main shading IV/DV/CVs and independent variables for cutting, agar treatment and placement. 2: correct across comparisons; 1: partly correct; 0: not identified.")],
      [text("公平比較與前提","Fair comparison and assumptions"),"0–2",text("B1：三組標示、A 基準、控制初始大小和溫度、遮光物不限制生長。2＝合理且完整；1＝部分；0＝未顯示公平比較理解。","B1: labels, A as baseline, initial size and temperature controls, unrestricted growth under shading. 2: sound and complete; 1: partial; 0: no fair-comparison understanding.")],
      [text("證據支持推論","Evidence-based inference"),"0–2",text("B2/B3：A/B、A/C、A/D、E/F、F/G/H 的結論。2＝能分辨各比較支持的作用；1＝部分；0＝不符資料。","B2/B3: conclusions from A/B, A/C, A/D, E/F and F/G/H. 2: distinguishes the effects each comparison supports; 1: partial; 0: inconsistent with data.")],
      [text("靜態量角讀數","Static protractor reading"),"0–2",text("B3/B4：E/F 各須 0°，G/H 各接受 33–37°，每組 0.5。只評讀圖，不當作拖曳或虛擬操作能力。","B3/B4: E/F require 0°; G/H accept 33–37°, 0.5 per setup. Assess image reading only, not dragging or virtual-operation skill.")],
      [text("科學表達及修正","Scientific communication and correction"),"0–2",text("B1/C2：公平比較理由及另記修正的證據。2＝清楚連結理由與證據；1＝部分；0＝無有效連結。保留 B 原答，C 修正另評。","B1/C2: fair-comparison reasoning and evidence for separately recorded corrections. 2: clear reason–evidence link; 1: partial; 0: no valid link. Keep B first answers; assess C corrections separately.")],
      [text("概念應用","Concept application"),"0–2",text("B4/B5：左側瓊脂→物質 X 多→左側延長多→右彎；右光情境→左背光→生長素多→左細胞延長多→右彎。2＝兩條因果鏈正確；1＝部分；0＝反向或未解釋。","B4/B5: left agar → more X → greater left elongation → right bend; right light → shaded left → more auxin → greater left elongation → right bend. 2: both causal chains correct; 1: partial; 0: reversed or unexplained.")],
      [text("合計及用途","Total and use"),"14",text("只供紙本活動形成性回饋；不是 VL 的32分、原始預測或完成分數，亦不是研究成效測驗。研究成效另用兩組共同的 SPSAI/CKT 等核准測驗。","For paper formative feedback only. Not the VL 32-point score, original-prediction or completion score, and not an outcome test. Evaluate research outcomes with the approved common SPSAI/CKT assessments.")],
    ];
    const mappings=questionMap();
    const D=[
      page("D1", "D · 教師指引及時間安排", `${h("研究條件及派發程序", "Research conditions and distribution")}${p("實驗組：IBL＋VL。比較組：沒有課前講授、不操作 VL，只靠 A/B 工作紙自學。紙本以「解說→示例→有提示練習→獨立應用→核對修正」教授共同內容及合理 SPS 練習；不複製 VL 的最後才揭示概念流程。", "Experimental group: IBL + VL. Comparison group: no prelesson lecture and no VL operation; students self-study using A/B worksheets. Paper follows explanation → worked examples → guided practice → independent application → checking/correction, with shared content and reasonable science-process practice rather than the VL's delayed concept reveal.")}${timing}${p("兩組共同總時限由研究者統一選 15–20 分鐘，計入閱讀、作答及回饋；上述為兩個可用時間表，非已實測時長。記錄實際用時及偏差，不把紙本操作或完成直接當作 VL 能力。", "Choose one common 15–20-minute total for both groups, including reading, answering and feedback. These are two planning schedules, not measured durations. Record actual time and deviations; paper actions or completion are not VL abilities.")}${h("教師澄清與回饋", "Teacher clarification and feedback")}${p("A/B 期間只可澄清程序、字詞及圖表讀法，依相同預定提示回答；不額外講授、不透露個別題答案或生長方向。若需額外概念講解，記錄為研究程序偏差。B 完成後保留原答再派 C，才容許依 C 提供內容回饋；修正另記。D 與完整套裝只供教師，不發予學生。", "During A/B, clarify only procedures, vocabulary and diagram-reading conventions using the same planned hints. Do not add a lecture or give individual answers or growth directions. Record extra conceptual teaching as a protocol deviation. Retain completed B, then give C and allow content feedback based on C; record corrections separately. D and the full pack are for teachers only.")}${h("共同目標、獨立評分及研究成效", "Shared goals, separate scoring and outcomes")}${p("共享情境、三項實驗、圖像資料、核心概念及觀察／變量／公平比較／量度／推論／表達目標；教學順序可不同。紙本不評原始猜測、點擊、示範、動畫完成或虛擬拖曳。D 的14分只供活動回饋，不與 VL 32分直接比較。正式共同 SPSAI/CKT 前後測維持獨立，不改題，不加入實驗組專用意見或訪談題。", "Share the context, three investigations, model images, core concepts and goals in observing, variables, fair comparisons, measurement, inference and communication; teaching sequence differs. Paper does not score advance guesses, clicks, demonstrations, animation completion or virtual dragging. D's 14 points are formative and must not be compared directly with VL's 32. Keep common SPSAI/CKT pre/post-tests separate and unchanged; do not add experimental-only opinion or interview items.")}${p("VL1 僅供 PDF 介面及排版參考。使用目前學生 C 下部遮光／D 切頂名稱，舊 C/D 紀錄及相容邏輯不改。材料產生、預覽及下載不建學生紀錄、不寫答案、雲端、事件或教師 Excel。", "VL1 informs PDF interface and layout only. Use displayed C for below-tip shading and D for cutting; keep legacy C/D records and compatibility unchanged. Generation, preview and download do not create learner records or write answers, cloud data, events or teacher Excel.","muted")}`),
      page("D2", "D · 完整答案及判讀界限", `${h("學生核對答案", "Student checking answers")}${p("C1/C2 已列出 B 全部封閉題答案及開放題要點；完整套裝包含兩頁 C。下列補充教師判斷：接受意義相同的正確文字，不要求逐字抄寫。", "C1/C2 provide all closed-question answers and key points for open responses in B; the complete pack includes both C pages. For teacher judgement, accept scientifically equivalent wording rather than exact copying.")}${h("觀察、標示、變量與對照", "Observation, labels, variables and controls")}${p("P1：由直轉為向右彎曲，向右方光源。P2：A 不遮光、B 頂端遮光、C 頂端以下遮光。P3：遮光處理為 IV，彎曲反應為 DV；光方向／強度、種類／初始大小／生長狀況、時間、溫度／供水為 CV。前提前三項適用，『相同種類不用控制大小』不適用。", "P1: straighter initially, then bends towards the light on the right. P2: A uncovered, B tip shaded, C shaded below the tip. P3: shading is IV; bending is DV; light direction/intensity, species/initial size/condition, time, temperature/water are CVs. The first three assumptions apply; same species does not remove size control.")}${control}${h("三項實驗的資料與結論", "Data and conclusions from all three investigations")}${h("主探究：彎曲方向", "Main comparison: bending direction")}<table>${a.mainRows}</table>${h("延伸一：有無延長", "Extension one: presence or absence of elongation")}<table>${a.tipRows}</table>${h("延伸二：角度與方向", "Extension two: angle and direction")}<table class="agar-answers">${a.agarRows}</table>`),
      page("D3", "D · 完整分析答案", `${a.refs}<p>3. ${a.cloze}</p>${ivs}${h("反思及修正", "Reflection and correction")}${p(REFLECTION_REFERENCE,"Right-side light makes the left the shaded side. The tip senses light; more auxin on the left promotes greater left-cell elongation, so the coleoptile bends towards the light on the right.")}${p("C2 修正：須保留首次作答，指明修正及一項資料依據；若原答正確，可說明支持依據。因果鏈要有背光側延長較多，不能寫成受光側較多。", "C2 correction: retain first answers, identify a correction and one data-based reason. If initially correct, provide supporting evidence. The causal chain must show greater elongation on the shaded side, not the lit side.")}${limits}`),
    ];
    // Ten rows per page keep the complete bilingual mapping compact and readable.
    for(let start=0;start<mappings.length;start+=10) D.push(page("D"+(D.length+1), "D · 逐題目標配對", `<h2>${text("VL 原題與紙本新版配對", "VL-to-paper question mapping")}</h2><table class="mapping"><thead><tr>${[text("原題／編號","Original / ID"),text("處理方式","Treatment"),text("新版題目","New question"),text("共同目標","Shared goal"),text("理由","Reason")].map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>${mappings.slice(start,start+10).map(([id,zh,en,method,methodEn,newZh,newEn,goal,goalEn,reason,reasonEn])=>row([id+" · "+text(zh,en),text(method,methodEn),text(newZh,newEn),text(goal,goalEn),text(reason,reasonEn)])).join("")}</tbody></table>`));
    return {material_revision:REVISION,instruction_mode:"explanation-example-guided-independent-check",duration_minutes:[15,20],A,B,C,D,rubric,mapping:mappings};
  }
  function translate(books) {
    // Place content in a detached tree: translation never touches lab controls.
    for (const key of ["A", "B", "C", "D"]) books[key] = books[key].map(html => {
      const root = element(html);
      VL3Language.translateTree(root);
      return root.innerHTML;
    });
    books.rubric = books.rubric.map(row => row.map(value => { const root=element(String(value)); VL3Language.translateTree(root); return root.textContent; }));
    return books;
  }
  return {revision:REVISION, render: () => translate(sources()), translate, canonical: sources};
})();
