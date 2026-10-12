"use strict";
// Build-time only. Read the live VL DOM, models, options and rubric; never read
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
      ? extensionPlant(id, progress, 0, progress === 1)
      : seedling(id, progress);
    const label = id => type === "agar" ? id + " · " + EXT_LABELS[id] : sampleName(id, record) + " · " + GROUPS[id].label;
    const stage = (id,progress) => {
      const root=element(diagram(plant(id,progress))),svg=root.querySelector("svg");
      const caption=type === "agar" ? svg.querySelector(":scope > text") : [...svg.querySelectorAll(":scope > text")].at(-1);
      const words=caption.textContent;caption.remove();
      // Crop only unused side padding; both stages use identical bounds/scale.
      if (type === "agar") svg.setAttribute("viewBox","25 0 250 280");
      return `<div class="stage-figure">${root.innerHTML}<span class="stage-caption">${esc(words)}</span></div>`;
    };
    return `<div class="plant-grid ${type === "agar" ? "four-plants" : ""}">${ids.map(id => `<figure><figcaption>${esc(label(id))}</figcaption><div class="plant-pair">${stage(id,0)}${stage(id,1)}</div></figure>`).join("")}</div>`;
  }
  function observationTable(ids, type) {
    const agar = type === "agar", tip = type === "tip";
    const select = (id, kind) => printClone(element(selectHTML(id, tip ? TIP_GROWTH : DIRECTIONS)).firstElementChild).innerHTML;
    const heading = agar ? "角度（°）" : tip ? "延長表現" : "彎曲方向";
    const angle = id => `<span class="angle-blank" data-numeric-field="${id}">_____ °</span>`;
    return `<table class="observation-table"><thead><tr><th>${esc("裝置")}</th><th>${esc("處理")}</th>${agar ? `<th>${esc(heading)}</th>` : ""}<th>${text("首次記錄", "First record")} · ${esc(agar ? "彎曲方向" : heading)}</th><th>${text("修訂（如需要）", "Revision (if needed)")}</th></tr></thead><tbody>${ids.map(id => `<tr><td>${agar ? id : sampleName(id, record)}</td><td>${esc(agar ? EXT_LABELS[id] : GROUPS[id].label)}</td>${agar ? `<td>${angle("ext-angle-"+id)}</td>` : ""}<td>${select((agar ? "ext-direction-" : tip ? "tip-growth-" : "obs-") + id)}</td><td>${agar ? angle("revised-ext-angle-"+id) : ""}${select("revised-" + (agar ? "ext-direction-" : tip ? "tip-growth-" : "obs-") + id)}</td></tr>`).join("")}</tbody></table>`;
  }
  function identity() {
    return `<div class="identity-fields"><span>${text("姓名", "Name")}：<i></i></span><span>${text("班別", "Class")}：<i></i></span><span>${text("學號", "Student number")}：<i></i></span></div>`;
  }
  function page(code, title, content, identified = false) {
    return `<section class="paper-page" data-page="${code}"><header><b>VL3 · ${esc(title)}</b><span>${code}</span></header>${identified ? identity() : ""}<main>${content}</main><footer><span data-paper-version></span><span>${code}</span></footer></section>`;
  }
  function sources() {
    const mainConditions = document.querySelector("#phase-3 > .vl3-card");
    const conditions = [...mainConditions.children].filter(node => node.matches("h3,p")).map(node => printClone(node).outerHTML).join("");
    const revision = `<div class="revision">${text("修訂（如需要）", "Revision (if needed)")}${lines("hypothesis-revision")}</div>`;
    const setup = canonicalClone(document.querySelector(".setup-card"));
    setup.querySelector("#equipmentBank").innerHTML = `<p class="materials-list">${materials.map(([label]) => esc(label)).join("；")}</p>`;
    setup.querySelectorAll("button,.drawing-tools,[role=status]").forEach(node => node.remove());
    const setupHTML = printClone(setup).outerHTML;
    const A = [
      page("A1", "01 · 了解情境", source(".hero h1") + source("#phase-1 .vl3-grid") + source(".research-question"), true),
      page("A2", "02 · 設計主探究", source(".hypothesis-card") + source(".variables-card") + revision),
      page("A3", "02 · 設計主探究", source(".assumptions-card") + source(".control-card") + setupHTML),
    ];
    const tipIntroduction = card("#tipSection > article:first-child", ["#tipStatus"]);
    const agarIntroduction = card("#extensionSection > article:first-of-type", ["#extensionStatus"]);
    const extConditions = [...document.querySelector("#extensionResults").children].filter(node => node.matches("h3,p")).map(node => printClone(node).outerHTML).join("");
    const tipHeading = source("#tipResults h3");
    const B = [
      page("B1", "03 · 進行主探究與記錄", conditions + pairedPlants(MAIN_IDS, "main") + source("#phase-3 > article:nth-of-type(2) h3") + observationTable(MAIN_IDS, "main") + source("#phase-3 > article:nth-of-type(2) > p")),
      page("B2", "04 · 主探究分析及延伸探究", card("#conclusionForm", ["#evidenceTable"]) + tipIntroduction + tipHeading + pairedPlants(TIP_IDS, "tip") + observationTable(TIP_IDS, "tip") + source("#tipAnalysis")),
      page("B3", "04 · 延伸探究二", source("#agarTransition") + agarIntroduction + extConditions),
      page("B4", "04 · 延伸探究二", pairedPlants(EXT_IDS, "agar") + observationTable(EXT_IDS, "agar") + source("#extensionAnalysis")),
    ];
    const C = [
      page("C1", "學習重點", source("#learningCard"), true),
      page("C2", "學習反思", card("#reflectionCard", ["#reflectionStatus"])),
    ];
    const guides = `<h2>${text("教師指引與派發次序", "Teacher guide and distribution order")}</h2>
      <ol><li>${text("先派 A；保存學生的原始假說、理由及設計後才派 B。", "Give A first. Preserve the original hypothesis, reason and design before giving B.")}</li>
      <li>${text("B 依序完成主探究、頂端比較及瓊脂探究；先保存每段預測及理由，才展示該段結果。可遮蓋未到階段的結果圖。", "Complete B in order: main inquiry, tip comparison, then agar inquiry. Preserve each prediction and reason before showing its results. Cover results not yet reached.")}</li>
      <li>${text("固定三項探究的答案後才派 C。D 及完整教師套裝不派給學生。", "Fix the answers to all three inquiries before giving C. Keep D and the complete teacher pack for teachers only.")}</li>
      <li>${text("原始答案不擦掉；修訂另記。紙本時間、點擊或完成率不直接換算能力。", "Keep original answers and record revisions separately. Do not convert time, clicks or completion into ability scores.")}</li>
      <li>${text("靜態圖沿用 VL 教學模型，並非真實實驗數據。學生自行判讀方向及量度角度；不用額外計算原本沒有量度的數值。", "Static diagrams use the VL teaching model, not real experimental data. Students interpret directions and measure angles themselves. Do not add calculations for quantities not measured in the VL.")}</li></ol>`;
    const research = `<h3>${text("研究程序對照", "Research procedure alignment")}</h3><p>${text("依 proposal 4.1／4.3.2，兩組使用相同情境、概念及問題，在正式授課前完成活動。四週活動工作紙與 Week 0／四週後的10題 SPSAI、4題 CKT 前後測分開，不加入實驗組專用意見題或訪談。", "Under proposal 4.1 / 4.3.2, both groups use identical scenarios, concepts and questions before formal teaching. Keep four-week activity worksheets separate from the 10-item SPSAI and 4-item CKT pre/post-tests. Do not add experimental-group opinion questions or interviews.")}</p><p>${text("紙本讀取靜態資料及使用量角器，VL 則使用動畫與可調指針；兩者操作方式並非完全等同。研究者須核對跨組時間、資料可用性、原始答案副本、評分一致性及能力證據的可比性。", "Paper learners read static data and use a protractor; VL learners use animation and an adjustable pointer. These operations are not identical. The researcher must check equal time and data access, original-answer copies, scoring consistency and comparability of skill evidence.")}</p>`;
    const variables = ["iv", "dv", "cv"].map((key, index) => `<tr><th>${["獨立變量", "因變量", "控制變量"][index]}</th><td>${EXPECTED[key].map(id => esc(VARIABLES[id])).join("；")}</td></tr>`).join("");
    const answers = {...MAIN_ANSWERS,...TIP_ANSWERS,...EXT_ANSWERS};
    const references = Object.entries(answers).filter(([key]) => !Object.hasOwn(EXT_CLOZE_ANSWERS,key)).map(([key, value]) => `<tr><th>${esc(questionText(key, record))}</th><td>${esc(answerOption(key, value, record))}</td></tr>`).join("");
    const clozeReference = extensionClozeSentence(key => esc(answerOption(key,EXT_CLOZE_ANSWERS[key],record)));
    const modelRows = [...MAIN_IDS.map(id => `<tr><td>${sampleName(id,record)} · ${esc(GROUPS[id].label)}</td><td>${esc(DIRECTIONS[mainModel(id,record).direction])}</td></tr>`), ...TIP_IDS.map(id => `<tr><td>${sampleName(id,record)} · ${esc(GROUPS[id].label)} · ${esc("延長表現")}</td><td>${TIP_GROWTH[tipModel(id,record).growth]}</td></tr>`), ...EXT_IDS.map(id => `<tr><td>${id} · ${esc(EXT_LABELS[id])}</td><td>${esc(extensionAngleReference(id))}；${esc(DIRECTIONS[EXT_MODEL[id].direction])}</td></tr>`)].join("");
    const bounds = `<h3>${text("教師核對：證據界限", "Teacher check: evidence limits")}</h3><p>${text("切頂及瓊脂模型不能單獨鑑定物質 X，亦沒有直接量度單側光照下的生長素分布。這些界限只放在教師指引，不恢復已刪除的學生題目。", "The tip and agar models do not identify substance X on their own, nor directly measure auxin distribution under light from one side. These limits belong to the teacher guide; removed student questions are not restored.")}</p>`;
    const D = [
      page("D1", "教師指引", guides + research + bounds),
      page("D2", "參考答案", `<table>${variables}</table><h3>${esc("實驗前提")}</h3><ul>${ASSUMPTIONS.filter(([, , correct]) => correct).map(([,label]) => `<li>${esc(label)}</li>`).join("")}</ul><table>${modelRows}</table>`),
      page("D3", "參考答案", `<table>${references}</table><p>3. ${clozeReference}</p><h3>${esc("學習反思")}</h3><p>${esc(REFLECTION_REFERENCE)}</p>`),
    ];
    const rubric = scoringWorkbook([]).rubric.rows.map(row => row.map(cell => cell.value));
    return {A, B, C, D, rubric};
  }
  function translate(books) {
    // Place content in a detached tree: translation never touches lab controls.
    for (const key of ["A", "B", "C", "D"]) books[key] = books[key].map(html => {
      const root = element(html);
      VL3Language.translateTree(root);
      return root.innerHTML;
    });
    books.rubric = books.rubric.map(row => row.map(value => typeof value === "string" ? VL3Language.t(value) : value));
    return books;
  }
  return {render: () => translate(sources()), translate, canonical: sources};
})();
