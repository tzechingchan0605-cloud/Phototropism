"use strict";
// Read shared VL content plus the versioned paper teaching sequence; never read
// a learner's answers or call reset(), phase(), log(), save() or cloud APIs.
window.VL3PaperContent = (() => {
  const record = {experimentVersion: EXPERIMENT_VERSION};
  // Paper treatments keep their design labels when the control is added last.
  // Keys are the existing internal model IDs; learner/VL records are untouched.
  const PAPER_MAIN_IDS = ['B','D','A'];
  const PAPER_LABELS = {B:'A',D:'B',A:'C',C:'D'};
  const paperName = id => PAPER_LABELS[id];
  const paperLetters = Object.fromEntries(Object.keys(PAPER_LABELS).map(id=>[sampleName(id,record),paperName(id)]));
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
  const REVISION = 3;
  const tr = (zh,en) => text(zh,en);
  const p = (zh,en,css='') => `<p class="${css}">${tr(zh,en)}</p>`;
  const statement = (number,zh,en) => `<p class="table-question" data-paper-number="${number}">${tr(zh,en)}</p>`;
  const h = (zh,en) => `<h2>${tr(zh,en)}</h2>`;
  const line = (id,count=2,answer='') => `<div class="answer-lines" data-answer-field="${id}">${Array.from({length:count},()=>`<div></div>`).join('')}${answer?`<p class="answer-fill">${answer}</p>`:''}</div>`;
  const blue = value => `<b class="reference-answer">${value}</b>`;
  function label(id) {
    const node=canonicalClone(document.getElementById(id).closest('label'));
    node.querySelectorAll('select,input,textarea').forEach(n=>n.remove());
    return node.innerHTML.trim();
  }
  function choice(id,answers,number) {
    const correct={...MAIN_ANSWERS,...TIP_ANSWERS,...EXT_ANSWERS}[id];
    const options=[...document.getElementById(id).options].filter(o=>o.value).map(o=>({value:o.value,text:VL3Language.sourceText(o).trim()}));
    if(['qCap','extEF'].includes(id))return `<div class="question" data-question="${id}" data-paper-number="${number}">${label(id)}<br>${options.map(o=>`<span class="tick-option"><span class="paper-check">${answers&&o.value===correct?'☑':'□'}</span> <span class="paper-option">${answers&&o.value===correct?blue(esc(o.text)):esc(o.text)}</span></span>`).join('<br>')}</div>`;
    return `<div class="question" data-question="${id}" data-paper-number="${number}">${label(id)}<br><span class="circle-options">（${options.map(o=>`<span class="paper-option">${answers&&o.value===correct?blue(esc(o.text)):esc(o.text)}</span>`).join(' ／ ')}）</span></div>`;
  }
  function plant(id,progress) {
    const root=element(seedling(id,progress));root.querySelectorAll('text').forEach(n=>n.remove());
    // A/B and the lower-shaded model retain their tips; internal C is the cut D.
    if(id!=='C'){
      const stem=root.querySelector('[data-stem]'),xy=stem.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).slice(-2);
      // Match the stem's round cap exactly, without widening the shoot tip.
      const radius=Number(stem.getAttribute('stroke-width'))/2;
      stem.insertAdjacentHTML('afterend',`<circle data-paper-intact-tip="true" cx="${xy[0]}" cy="${xy[1]}" r="${radius}" fill="${stem.getAttribute('stroke')}"/>`);
    }
    root.querySelector('svg').setAttribute('viewBox','10 20 180 235');
    return root.innerHTML;
  }
  function plantPair(id) {
    return `<svg class="setup-pair" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 386 235" role="img"><svg x="0" y="0" width="180" height="235" viewBox="10 20 180 235">${element(plant(id,0)).firstElementChild.innerHTML}</svg><path d="M181 130H201M194 123L201 130L194 137" fill="none" stroke="#26383b" stroke-width="3" stroke-linecap="round"/><svg x="206" y="0" width="180" height="235" viewBox="10 20 180 235">${element(plant(id,1)).firstElementChild.innerHTML}</svg></svg>`;
  }
  function plants(ids,initial=false) {
    const type=initial?'initial-setups':ids.length===3?'main-setups':'tip-setups';
    const height=initial?5.7:ids.length===3?4:2.8;
    return `<div class="plant-grid ${type}" data-diagram-height="${height}" data-diagram-height-en="${initial?3:height}">${ids.map((id,i)=>`<figure data-paper-setup="${paperName(id)}" data-model-id="${id}"><figcaption>${initial?tr('設計方案 '+String.fromCharCode(65+i),'Design '+String.fromCharCode(65+i)):tr('裝置 '+paperName(id),'Setup '+paperName(id))} · <span>${esc(GROUPS[id].label)}</span></figcaption><div class="plant-pair">${initial?plant(id,0):plantPair(id)}</div></figure>`).join('')}</div>`;
  }
  function windowDiagram() {
    const root=element(windowSeedling(true));
    // Explicit geometry preserves the intact rounded tip in Office SVG renderers.
    root.querySelector('[data-stem="after"]').insertAdjacentHTML('afterend','<circle data-rounded-tip="true" cx="156" cy="78" r="6.5" fill="#59a16a"/>');
    return root.innerHTML;
  }
  function mechanismDiagram() {
    const root=element(mechanismSVG()),svg=root.firstElementChild;
    svg.querySelectorAll('text').forEach(n=>n.remove());
    svg.querySelectorAll('path[d="M239 178L189 191"],path[d="M695 132L645 169"],circle[cx="40"][cy="363"]').forEach(n=>n.remove());
    const panels=svg.querySelectorAll('rect[rx="18"]');
    panels[1].insertAdjacentHTML('afterend','<g data-paper-light-beams="true" fill="#f7d95b" opacity=".32"><path d="M43 92L125 61V191L43 147Z"/><path d="M450 78L550 45V325L450 246Z"/></g>');
    const zoomLamp=svg.querySelector('rect[x="438"]');
    zoomLamp.setAttribute('y','78');zoomLamp.setAttribute('height','168');zoomLamp.setAttribute('width','12');
    return root.innerHTML;
  }
  function observations(ids,tip,answers) {
    return statement(tip?8:4,tip?'在下表記錄各裝置是否延長。':'在下表記錄各裝置的彎曲方向。',tip?'Record whether each setup elongates in the table.':'Record each setup’s bending direction in the table.')+`<table class="observations"><tr><th>${tr('裝置','Setup')}</th><th>${tr(tip?'延長表現':'彎曲方向',tip?'Elongation':'Bending direction')}</th></tr>${ids.map(id=>`<tr><td>${paperName(id)}</td><td>（${Object.entries(tip?TIP_GROWTH:DIRECTIONS).map(([v,t])=>answers&&v===(tip?tipModel(id,record).growth:mainModel(id,record).direction)?blue(`<span>${esc(t)}</span>`):`<span>${esc(t)}</span>`).join(' ／ ')}）</td></tr>`).join('')}</table>`;
  }
  function agarDiagram() {
    const one=(id,x)=>{
      const model=EXT_MODEL[id],sign=model.direction==='left'?-1:1;
      const heading=`<text x="85" y="15" text-anchor="middle" font-size="16">${id}</text><text x="85" y="32" text-anchor="middle" font-size="15" data-en="${id==='E'?'Blank agar':'Treated agar'}">${id==='E'?'空白瓊脂':'處理瓊脂'}</text><text data-paper-position-label="${id}" x="85" y="49" text-anchor="middle" font-size="15" data-en="Position: ${id==='G'?'Left':id==='H'?'Right':'Centre'}">放置位置：${id==='G'?'左側':id==='H'?'右側':'中央'}</text>`;
      const angle=model.angle*Math.PI/180, tx=85+sign*Math.sin(angle)*60,ty=135-Math.cos(angle)*60;
      const top=model.growth==='none'?135:85;
      let s=`<g transform="translate(${x} 0)">${heading}<path d="M85 178V${top}" stroke="#6aa579" stroke-width="12" fill="none"/>`;
      if(model.angle)s=`<g transform="translate(${x} 0)">${heading}<path d="M85 178V150Q85 135 ${tx} ${ty}" stroke="#6aa579" stroke-width="12" fill="none"/>`;
      const offset=id==='G'?-6:id==='H'?6:0;
      // Like the VL, place the agar in the cut tip's own rotating frame.
      s+=`<g data-paper-agar-block="${id}" transform="translate(${model.angle?tx:85} ${model.angle?ty:top}) rotate(${sign*model.angle})"><rect x="${offset-7}" y="-8" width="14" height="8" fill="${id==='E'?'#ddd':'#e7bc72'}" stroke="#555"/></g>`;
      // Model-based tangent pointer; vertical is 0°, every small tick is 5°.
      s+='<path d="M85 135V78" stroke="#888" stroke-dasharray="3 3"/>';
      for(let a=-90;a<=90;a+=5){const rad=a*Math.PI/180,r=a%30===0?52:57;s+=`<path d="M${85+Math.sin(rad)*r} ${135-Math.cos(rad)*r}L${85+Math.sin(rad)*62} ${135-Math.cos(rad)*62}" stroke="#555"/>`;if(a%30===0&&Math.abs(a)<90)s+=`<text x="${85+Math.sin(rad)*70}" y="${139-Math.cos(rad)*70}" text-anchor="middle" font-size="15">${Math.abs(a)}</text>`;}
      s+=`<path d="M85 135L${85+sign*Math.sin(angle)*62} ${135-Math.cos(angle)*62}" stroke="#bd7725" stroke-width="2"/><path d="M58 185H112" stroke="#777" stroke-width="3"/></g>`;return s;
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 187" role="img">${EXT_IDS.map((id,i)=>one(id,i*170)).join('')}</svg>`;
  }
  function page(n,content,answers=false,identity=false){return `<section class="paper-page" data-page="${n}"><header>${tr('生物科｜植物的向光生長','Biology | Phototropic growth in plants')}${answers?blue(tr('參考答案','Reference answers')):''}</header><main>${identity?`<h1>${tr('工作紙三：植物的向光生長','Worksheet 3: Phototropic growth in plants')}</h1><p class="identity-fields">${tr('姓名：________________　班別：________　學號：________','Name: ________________　Class: ________　No.: ________')}</p>`:''}${content}</main><footer><span data-paper-version></span><span>${tr('工作紙三','Worksheet 3')} | ${n}</span></footer></section>`;}
  function verticalFlow(){
    const steps=[['左方光源','Light from the left','FFF0C7'],['右側是背光側','The right side is shaded','E4EFF7'],['較多生長素沿背光側向下傳遞','More auxin passes down the shaded side','EEE8F7'],['右側細胞延長較多','Cells on the right elongate more','E5F2E3'],['枝條向左彎曲','The shoot bends left','DEF0ED']];
    return `<div class="vertical-flow">${steps.map(([z,e,fill],i)=>`${i?'<p class="flow-arrow">↓</p>':''}<div class="flow-step" data-fill="${fill}" style="background:#${fill}">${tr(z,e)}</div>`).join('')}</div>`;
  }
  function knowledge(){
    return `<div class="concept-box">${h('課題需知','Topic notes')}<div class="knowledge-grid"><div>${diagram(windowDiagram())}</div><ul class="topic-points"><li>${tr('向光性是對光照方向的定向生長。枝條通常呈正向光性，朝向光源生長。左圖顯示胚芽鞘朝光彎曲；它屬幼苗地上部的一部分，包裹並保護幼葉。','Phototropism is growth in response to light direction. Shoots usually grow towards light (positive phototropism). The left diagram shows a bending coleoptile: part of the seedling’s shoot that protects young leaves.')}</li><li>${tr('頂端感受單側光照，並含有生長素（一種化學物質，屬於植物激素）。單側光照下，較多生長素沿背光側向下傳遞，刺激延長區的細胞延長，促進生長。','The tip senses light from one side and contains auxin, a chemical substance that is a plant hormone. More auxin passes down the shaded side, stimulating cells in the elongation region to elongate and promote growth.')}</li><li>${tr('瓊脂容許化學物質通過。','Agar allows chemical substances to pass through it.')}</li></ul></div>${mechanismDiagram()}<div class="mechanism-labels"><span>${tr("胚芽鞘：右側背光，生長素較多", "Coleoptile: more auxin on the shaded right")}</span><span>${tr("細胞放大：右側細胞延長較多", "Cell detail: more elongation on the right")}</span></div>${verticalFlow()}</div>`;
  }
  function variables(answers){
    return `<table class="variables"><tr><th>${tr('變量類別','Variable type')}</th><th>${tr('可選因素','Factors to choose from')}</th></tr>${['iv','dv','cv'].map(key=>{const group=canonicalClone(document.querySelector(`#variableChoices [data-variable="${key}"]`).closest('fieldset'));return `<tr><td>${group.querySelector('legend').innerHTML}</td><td>${VARIABLE_DISPLAY_ORDER.map(id=>{const t=(answers&&EXPECTED[key].includes(id)?'☑':'□')+' '+esc(VARIABLES[id]);return answers&&EXPECTED[key].includes(id)?blue(t):t;}).join('　')}</td></tr>`;}).join('')}</table>`;
  }
  function worksheet(answers){
    const assumption=canonicalClone(document.querySelector('.assumptions-card'));
    const hints=[...assumption.querySelectorAll('.design-hint')].map(n=>n.outerHTML).join('');
    const control=document.querySelector('.control-card');
    const controlAnswer=tr('另設完整且不遮光的胚芽鞘作比較基準，與兩種遮光處理比較；保持光源、時間、種類、初始高度、生長階段、溫度及供水相同。','Add an intact, uncovered coleoptile as the comparison baseline for the two shading treatments; keep all other conditions the same.');
    const correct=id=>answers?blue(id):'';
    const pages=[];
    pages.push(page(1,knowledge(),answers,true));
    const assumptions=`<div class="assumptions-block">${canonicalClone(document.querySelector('.assumptions-card h3')).outerHTML}${hints}${ASSUMPTIONS.map(([id,t,ok])=>p((answers&&ok?'☑ ':'□ ')+t,(answers&&ok?'☑ ':'□ ')+VL3Language.t(t),'assumption-option'+(answers&&ok?' reference-answer':''))).join('')}</div>`;
    const controlBlock=`<div class="control-paper">${h('探究的對照組','Control group')}<p class="control-question">${canonicalClone(control.querySelector('h3')).innerHTML}</p>${canonicalClone(control.querySelector('.design-hint')).outerHTML}${line('controlPlan',2,correct(controlAnswer))}</div>`;
    pages.push(page(2,h('部分 1｜研究情境與公平比較','Part 1 | Context and fair comparisons')+`<div class="context-designs">${p('探究目的：比較遮光部位對胚芽鞘生長方向的影響。','Aim: investigate how shading position affects coleoptile growth direction.')}${plants(['B','D'],true)}</div>`+p('辨識實驗變量：在每列剔選適當因素；每類可選多於一項。','Identify the variables: tick the appropriate factors in each row. You may choose more than one.','numbered-variable')+variables(answers)+assumptions+controlBlock,answers));
    pages.push(page(3,h('部分 2｜實驗結果與分析','Part 2 | Results and analysis')+h('2.1 主探究：遮光對生長的影響','2.1 Main investigation: effect of shading on growth')+p('光源統一在左方；遮光套覆蓋頂端以下的整段，頂端外露，不限制延長或彎曲。','Light is on the left. The sleeve covers below the exposed tip without restricting growth.')+plants(PAPER_MAIN_IDS)+observations(PAPER_MAIN_IDS,false,answers)+['qShade','qBelow','qTip'].map((id,i)=>choice(id,answers,i+5)).join('')+h('延伸探究：頂端切除對生長的影響','Extension investigation: effect of tip removal on growth')+plants(TIP_IDS)+observations(TIP_IDS,true,answers)+choice('qCap',answers,9),answers));
    const position=`<div class="question" data-question="extPosition" data-paper-number="12">${EXT_POSITION_QUESTION}<br>${Object.entries(EXT_POSITION_OPTIONS).map(([id,t])=>`<span class="tick-option"><span class="paper-check">${answers&&id==='position'?'☑':'□'}</span> <span class="paper-option">${answers&&id==='position'?blue(t):t}</span></span>`).join('<br>')}</div>`;
    const cloze=extensionClozeSentence(id=>{const select=element(extensionClozeSelect(id)).querySelector('select');return '（'+[...select.options].filter(o=>o.value).map(o=>answers&&o.value===EXT_CLOZE_ANSWERS[id]?blue(`<span>${o.textContent}</span>`):`<span>${o.textContent}</span>`).join(' ／ ')+'）';});
    pages.push(page(4,h('2.3 瓊脂','2.3 Agar')+p('全部胚芽鞘均已切頂、初始大小相近，在黑暗中培養。空白瓊脂未接觸頂端；處理瓊脂曾接觸頂端。','All cut-tip coleoptiles start at similar sizes and stay in darkness. Blank agar has not touched a tip; treated agar has.')+agarDiagram()+statement(10,'記錄各裝置的角度及彎曲方向。','Record each setup’s angle and bending direction.')+`<table class="readings"><tr><th>${tr('裝置','Setup')}</th><th>${tr('角度（°）','Angle (°)')}</th><th>${tr('彎曲方向','Bending direction')}</th></tr>${EXT_IDS.map(id=>`<tr><td>${id}</td><td>${answers?blue(EXT_MODEL[id].angle+'°'):'________'}</td><td>（${Object.entries(DIRECTIONS).map(([v,t])=>answers&&v===EXT_MODEL[id].direction?blue(t):t).join(' ／ ')}）</td></tr>`).join('')}</table>`+choice('extEF',answers,11)+position+`<div class="question" data-question="ext-cloze" data-paper-number="13">3. ${cloze}</div>`+h('部分 3｜整合解釋','Part 3 | Integrated explanation')+p('綜合實驗結果與課題需知，解釋圖中胚芽鞘為何會向右彎曲。','Use the experimental results and topic notes to explain why the coleoptile in the diagram bends to the right.')+`<div class="reflection-response"><div class="reflection-figure">${diagram(windowDiagram())}</div>`+line('reflection',4,correct(tr(REFLECTION_REFERENCE.replace('由教師評閱，不自動判錯。',''),'Light is on the right and sensed at the tip. More auxin is on the shaded left side and passes down. Left-side cells elongate more, causing bending towards the light on the right (positive phototropism).')))+`</div>`,answers));
    return pages;
  }
  function canonical(){
    return {material_revision:REVISION,paper_layout_revision:8,paper_setup_mapping:paperLetters,experiment_version:EXPERIMENT_VERSION,notes:knowledge(),nativeMechanism:mechanismSVG(),context:windowSeedling(true),reflection:REFLECTION_PROMPT,rubric:VL3_RUBRIC19,variables:VARIABLES,order:VARIABLE_DISPLAY_ORDER,expected:EXPECTED,assumptions:ASSUMPTIONS,main:MAIN_IDS.map(id=>({id:sampleName(id,record),label:GROUPS[id].label,result:mainModel(id,record)})),tip:TIP_IDS.map(id=>({id:sampleName(id,record),label:GROUPS[id].label,result:tipModel(id,record)})),agar:EXT_MODEL,questions:['qShade','qBelow','qTip','qCap','extEF'].map(id=>({id,label:label(id),options:[...document.getElementById(id).options].filter(o=>o.value).map(o=>({id:o.value,text:VL3Language.sourceText(o)}))})),position:EXT_POSITION_OPTIONS,cloze:extensionClozeSentence(id=>id),control:canonicalClone(document.querySelector('.control-card')).textContent.replace(/\s+/g,' ').trim(),assumptionTitle:canonicalClone(document.querySelector(".assumptions-card h3")).textContent,definition:canonicalClone(document.querySelector('#assumptionDefinition')).textContent.trim()};
  }
  function render(answers=false){
    const root=element(worksheet(answers).join(''));VL3Language.translateTree(root);
    // Translate the shared questions first, then relabel only paper setup letters.
    ['qShade','qBelow','qCap'].forEach(id=>{
      const walk=document.createTreeWalker(root.querySelector(`[data-question="${id}"]`),NodeFilter.SHOW_TEXT);
      while(walk.nextNode())walk.currentNode.data=walk.currentNode.data.replace(/\b[ABCD]\b/g,letter=>paperLetters[letter]);
    });
    root.querySelectorAll('.paper-option').forEach(option=>{
      const walk=document.createTreeWalker(option,NodeFilter.SHOW_TEXT);let last;
      while(walk.nextNode())if(walk.currentNode.data.trim())last=walk.currentNode;
      if(last)last.data=last.data.replace(/[。.](\s*)$/u,'$1');
    });
    root.querySelector('.numbered-variable').dataset.paperNumber='1';
    root.querySelector('[data-page="2"] h3').dataset.paperNumber='2';
    [...root.querySelectorAll('[data-page="2"] h2')].at(-1).dataset.paperNumber='3';
    root.querySelector('.reflection-response').previousElementSibling.dataset.paperNumber='14';
    // Renumber after translation so original VL dictionary keys stay intact.
    root.querySelectorAll('[data-paper-number]').forEach(q=>{
      const walk=document.createTreeWalker(q,NodeFilter.SHOW_TEXT);let first;
      while(walk.nextNode()){if(walk.currentNode.data.trim()){first=walk.currentNode;break;}}
      if(first)first.data=first.data.replace(/^\s*\d+\.\s*/,'');
      const content=document.createElement('span');content.className='question-content';content.append(...q.childNodes);
      const number=document.createElement('span');number.className='question-number';number.textContent=q.dataset.paperNumber+'.';
      q.replaceChildren(number,content);q.classList.add('numbered-question');
    });
    root.querySelectorAll("svg text").forEach(n=>{n.removeAttribute("textLength");n.removeAttribute("lengthAdjust");});
    // Mark corresponding scientific concepts, without marking correct choices.
    const terms=VL3Language.current==='en'?['positive phototropism','phototropism','auxin','plant hormone','shaded','elongate','passes down']:['正向光性','向光性','生長素','植物激素','背光側','細胞延長','向下傳遞'];
    const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(walk.nextNode())nodes.push(walk.currentNode);
    for(const node of nodes){if(node.parentElement.closest('.reference-answer,.variables,.observations,.readings,.circle-options,svg'))continue;const re=new RegExp('('+terms.join('|')+')','gi');if(!re.test(node.data))continue;const fragment=document.createDocumentFragment();node.data.split(re).forEach(t=>{const n=document.createElement(terms.some(k=>k.toLowerCase()===t.toLowerCase())?'strong':'span');n.textContent=t;fragment.append(n);});node.replaceWith(fragment);}
    return [...root.children].map(n=>n.outerHTML);
  }
  function teacherPages(){
    const units=[
      ["D · 教師指引、配對及評分","D · Teacher guide, alignment and marking",
        p("本工作紙控制組無課前講授、不操作VL。課題需知從開始即可閱讀；保留首次答案後才派完整參考答案，以另一顏色修正，保留原答。D只供教師。","The worksheet group receives no prelesson teaching and does not operate the VL. Topic notes are available from the start. Preserve first responses before distributing the complete answer copy. Correct in another colour without erasing originals. D is for teachers.")+
        h("建議15–20分鐘，須試教確認","Suggested 15–20 minutes; pilot confirmation required")+
        p("15分鐘：概念3、變量與公平比較4、遮光及切頂3、瓊脂3、整合2。20分鐘：概念4、公平比較5、遮光及切頂4、瓊脂4、整合3。首次作答後的核對修正另按共同研究程序安排；若計入同一節，試教調整分配，不刪核心探究。","15 minutes: concepts 3, variables/fair comparisons 4, shading/tip removal 3, agar 3, integration 2. For 20 minutes: 4, 5, 4, 4, 3 respectively. Arrange answer checking after preserving first responses under the shared study procedure; if included in the same period, pilot the allocation without removing core inquiries.")+
        p("教師只澄清程序、字詞及讀圖方法；首次作答前不透露答案。記錄額外支援及實際用時；不宣稱所有學生必定完成。保存有研究ID的首次答案與修正版，依既定私隱程序處理。","Clarify procedures, vocabulary and how to read figures without revealing answers before first responses. Record additional support and actual time; completion by every learner is not guaranteed. Preserve first and corrected responses with study IDs under the established privacy procedure.")],
      ["逐題VL來源、概念與配分","VL sources, concepts and points",
        p("工作紙統一以A為頂端遮光、B為頂端以下遮光、C為完整不遮光、D為切頂。部分1只展示方案A／B，部分2以相同字母顯示兩種處理，最後加入對照C。與VL的配對：WS A→VL B、WS B→VL C、WS C→VL A、WS D→VL D。第5題比較C與A、第6題C與B、第9題C與D。題號1–14及配分不變。","Paper labels are A tip shaded, B below-tip shaded, C intact uncovered and D cut tip. Part 1 shows Designs A/B; Part 2 keeps these labels and adds control C last. Alignment: WS A to VL B, WS B to VL C, WS C to VL A, WS D to VL D. Q5 compares C/A, Q6 C/B and Q9 C/D. Q1–14 and points are unchanged.")+
        p("第1題變量：#variableChoices；IV1、DV1、CV2，共4。完整選對該類才給該類分；不漏選或多選。第2題前提：#assumptions及#assumptionDefinition，1分，三項正確且不選干擾項。第3題對照：#controlPlan，1分，另設完整不遮光胚芽鞘為基準並保持其餘條件相同。","Q1 variables: #variableChoices, IV 1, DV 1, CV 2 (4 total). Award each category only for the complete correct set. Q2 assumptions: #assumptions and #assumptionDefinition, 1 for all three correct items without the distractor. Q3 control: #controlPlan, 1 for adding an intact, uncovered coleoptile as baseline with other conditions constant.")+
        p("第4題遮光：#bench與#observationTable，A不明顯、B左、C左，共1，按三項比例給分。第5–7題#qShade、#qBelow、#qTip各1，共3。第8題切頂：#tipBench與#tipObservationTable，C有、D沒有，共1，按兩項比例；第9題#qCap為方格單選，1分。","Q4 shading: #bench / #observationTable, paper A no clear bending, B left, C left: 1 proportionally across three records. Q5–7 #qShade, #qBelow and #qTip: 1 each. Q8 tip removal: #tipBench / #tipObservationTable, paper C yes, D no: 1 proportionally; Q9 #qCap: tick one, 1 point.")+
        p("第10題瓊脂：#extensionBench與#extensionTable。E0°直、F0°直、G35°右、H35°左。角度每組0.5共2；方向每組0.25共1。E/F只接受0°；G/H容差±2°。第11、12題#extEF、#extPosition均為方格單選，各1；第13題句內#extXAmount、#extCellElongation、#extBendDirection各1/3，共1。","Q10 agar: #extensionBench / #extensionTable. E 0° straight, F 0° straight, G 35° right, H 35° left. Angles 0.5 each (2 total); directions 0.25 each (1 total). E/F require 0°; G/H allow ±2°. Q11–12 #extEF and #extPosition: tick one, 1 each; Q13 #extXAmount, #extCellElongation and #extBendDirection: 1/3 each (1 total).")+
        p("第14題整合：#reflection，與VL同圖，只將學習重點改為課題需知，5分。WS形成性共23分，與VL29分不能直接換算；比較成效使用另行既定共同測驗。","Q14 integration: #reflection, same diagram as VL; only learning points becomes topic notes, 5 points. Worksheet formative total: 23; it cannot be converted directly to the VL activity total of 29. Use the separately established common assessment for outcomes.")],
      ["參考答案及可接受表述","Reference answers and acceptable wording",
        p("變量：IV遮光處理；DV胚芽鞘彎曲反應；CV光源方向及強度、種類／初始高度／階段、照射時間、溫度及供水。前提：初始狀況相近、不限制生長、無明顯溫差；不選種類相同毋須控制大小。對照：另設完整不遮光胚芽鞘，其餘條件相同。","Variables: IV shading; DV coleoptile bending; CV light direction/intensity, species/initial height/stage, duration, temperature and water. Assumptions: similar initial condition, unrestricted growth and no marked temperature difference; reject species alone removes size control. Control: add an intact, uncovered coleoptile under the same other conditions.")+
        p("遮光分析依序：沒有明顯向光彎曲；仍可向光彎曲；頂端。切頂分析：頂端的存在亦影響生長／延長。瓊脂分析：頂端可能產生可轉移的生長促進作用；放置位置影響彎曲方向；多、多、右。完整題目、選項、圖及原位答案見完整連答案版。","Shading answers in order: no clear bending towards light; can still bend towards light; tip. Tip removal: presence of the tip also affects growth/elongation. Agar: the tip may produce a transferable growth-promoting effect; placement affects bending direction; more, more, right. See the complete answer worksheet for every question, option, figure and answer in its original position.")+
        p("第9、11、12題均為方格單選：只剔正確一項才得分，多剔為已評錯答；缺答先按未提供／待評處理。","Q9, Q11 and Q12 are single-choice tick questions. Award credit only for selecting the one correct option. Multiple ticks are assessed incorrect; missing responses remain unavailable/pending.")+
        h("整合解釋：每個因果點1分","Integrated explanation: one point per causal link")+
        VL3_RUBRIC19.points.map(([z,e],i)=>p((i+1)+". "+z,(i+1)+". "+e)).join('')+p(...VL3_RUBRIC19.marking)],
      ["評分、版本及研究界限","Scoring, versions and research limits",
        p("VL版本19／rubric vl19-causal-5：SPS24＋綜合解釋5＝29。推論只按主探究3、切頂1及瓊脂3項比較比例計4；溝通只評角度方向紀錄表達0–4；舊數據解釋、反思表達、四個知識欄不適用，避免同一因果概念重複計分。觀察、分類、設計及實作各4，沿用原作答證據。","VL19 / rubric vl19-causal-5: SPS 24 plus integrated explanation 5 = 29. Inference uses the three main, one tip and three agar comparison items proportionally (4). Communication assesses clarity of angle/direction records (0–4). Old evidence, reflection-expression and four knowledge fields are not applicable, preventing duplicate causal-content marks. Observation, classification, design and practical work retain their original evidence, 4 each.")+
        p("溝通4：完整清楚；3：大致清楚；2：部分清楚；1：少量相關表達；0：已評無相關表達。設計原始預測按可測試性及理由，不因與結果不符扣分。時間、點擊、重試、完成率不直接評能力。紙本沒有初步觀察、事前原始預測、裝置設計或虛擬操作機會，記不適用，不能給零分補位。","Communication: 4 complete and clear; 3 mostly clear; 2 partly clear; 1 little relevant expression; 0 assessed without relevant expression. Assess original predictions for testability and reasoning, not agreement with results. Time, clicks, retries and completion rate do not directly score ability. Paper omits initial observations, prior original predictions, apparatus design and virtual operation: mark not applicable, never substitute zero.")+
        p("Excel空白為待評、0為已評零分、不適用不阻擋。適用人工欄檢查整數上下限，公式亦拒絕貼上負數、超限、小數、文字。反思提交及適用評分完整才顯示總分。舊版保持原題、模型、圖表、滿分32與rubric；混合匯出逐列按版本。研究ID、原文、快照、圖片、事件及佇列保留；人工分數只留在另存Excel。舊Excel須重新匯出。","Excel blank means pending, 0 assessed zero, and not applicable does not block totals. Applicable manual columns enforce integer ranges; formulas also reject pasted negatives, excessive values, fractions and text. Totals require submitted reflection and valid applicable scores. Older rows retain their questions, models, graphs, total 32 and rubric; mixed exports use per-row versions. Preserve IDs, original text, snapshots, images, events and queues. Manual marks remain in saved Excel copies. Re-export old Excel files.")],
      ["科學限制與教學目標","Scientific limits and teaching objectives",
        p("胚芽鞘是禾本科幼苗地上部的一部分，包裹並保護幼葉。枝條通常呈正向光性；頂端組織的感光受體感受光照，生長素本身不探測光源。左光機制圖顯示右側背光、右側細胞延長較多而向左彎；窗邊圖的光源在右，方向相反。", "A coleoptile is part of a grass seedling’s shoot and protects young leaves. Shoots usually show positive phototropism. Photoreceptors in tip tissue sense light; auxin itself does not detect the light source. In the left-lit mechanism figure, the shaded right side elongates more and the shoot bends left. The window figure is lit from the right, reversing these sides.")+
        p("三組遮光比較支持頂端參與感光；切頂亦造成傷口並移除其他組織，不能單靠它確定感光機制。切頂D不延長是本模型設定，不是所有切頂植物必定停止生長。E/F比較只支持可轉移的生長促進作用，不單獨鑑定生長素或單側光下分布。黑暗左置瓊脂令左側延長較多而向右彎，右置相反；中央處理瓊脂直立延長，中央空白沒有明顯延長。","Shading supports tip involvement in sensing light. Cutting also wounds and removes other tissues, so cannot alone establish the sensing mechanism. No elongation in D is a model setting, not a universal rule for cut plants. E/F supports a transferable growth-promoting effect without identifying auxin or its distribution under unilateral light. In darkness, left-placed treated agar promotes left-side elongation and bending right, with the reverse for right placement. Central treated agar produces straight elongation; central blank agar gives no clear elongation.")+
        p("目標：辨識變量及控制條件，讀取定性觀察與角度，運用三段比較推論感光與生長作用，因果解釋向光彎曲。靜態讀圖不等於動態操作；模型不是實測值。不恢復已刪除棒形圖、指定比較或額外追問。衍生答案依學生自身有效讀數核對，量度誤差不連鎖扣分；本WS未增加衍生題。","Objectives: identify variables and controls, read qualitative outcomes and angles, infer sensing and growth effects from the three comparisons, and explain bending causally. Static reading is not dynamic operation; model values are not measurements. Do not restore deleted graphs, prescribed comparisons or extra follow-ups. Check derived answers against the student's own valid readings without cascading penalties; this WS adds no derived question.")+
        p("rubric為活動回饋初稿，未聲稱跨VL等值、官方課綱認證或效度證據。正式共同測驗及研究缺失資料規則依既定方案；缺答先標未提供／待評，未問標不適用，已評錯答才給0。兩語閱讀負荷、實體列印、評分一致性及15–20分鐘負荷需試教確認。","This is a draft activity-feedback rubric, without claims of cross-VL equivalence, official syllabus endorsement or validity evidence. Follow the established common assessment and missing-data protocol: missing responses remain unavailable/pending, unasked items are not applicable, assessed incorrect responses score 0. Pilot bilingual reading load, physical printing, marking consistency and the 15–20-minute allocation.")]
    ];
    const root=element(units.map(([z,e,body],i)=>page('D'+(i+1),h(z,e)+body)).join(''));VL3Language.translateTree(root);return [...root.children].map(n=>n.outerHTML);
  }
  return {revision:REVISION,canonical,render,teacherPages};
})();
