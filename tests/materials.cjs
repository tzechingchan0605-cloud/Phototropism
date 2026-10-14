"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),crypto=require("node:crypto");
const {chromium}=require("playwright");
const {existsSync}=require("node:fs");
const {fingerprint,server}=require("../scripts/build-materials.cjs");
const root=path.resolve(__dirname,"..");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
(async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(root,"materials/manifest.json"),"utf8"));
  const current=await fingerprint();
  assert.equal(manifest.version,current.version,"Rebuild materials after updating shared sources");
  assert.deepEqual(manifest.sources,current.sources);
  const canonical=JSON.parse(await fs.readFile(path.join(root,"materials/source.json"),"utf8"));
  assert.equal(hash(JSON.stringify(canonical)),manifest.source_digest);
  assert.equal(manifest.books.length,10);
  assert.equal(manifest.material_revision,2);
  assert.equal(manifest.instruction_mode,"explanation-example-guided-independent-check");
  assert.deepEqual(manifest.duration_minutes,[15,20]);
  assert.equal(canonical.material_revision,2);
  assert.equal(canonical.mapping.length,19);
  assert(!JSON.stringify(canonical).includes("先保存原始設計才派 B"));
  for (const book of manifest.books) {
    assert.equal(hash(await fs.readFile(path.join(root,book.pdf))),book.sha256);
    assert.equal(hash(await fs.readFile(path.join(root,book.preview))),book.preview_sha256);
    assert(book.filename.includes(manifest.version));
  }
  const {service,url}=await server();
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),headless:true});
  try {
    const context=await browser.newContext(),page=await context.newPage();
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await context.route("**/*",route=>new URL(route.request().url()).origin===url ? route.continue():route.abort());
    await page.goto(url);
    assert.deepEqual(await page.evaluate(()=>VL3PaperContent.canonical()),canonical);
    assert.equal(await page.evaluate(()=>PaperMaterials.download("A")),false);
    assert.equal(await page.evaluate(()=>PaperMaterials.preview("D")),false);
    assert(await page.locator("#paperMaterials").isHidden());
    const live=await page.evaluate(()=>({
      fields:[...document.querySelectorAll("main textarea")].map(node=>node.id),
      options:[...document.querySelectorAll("main select")].filter(node=>!['tipView','extensionView'].includes(node.id) && !/^(ruler|graph)/.test(node.id)).map(node=>({id:node.id,options:[...node.options].filter(option=>option.value).map(option=>option.textContent.trim())})),
      assumptions:ASSUMPTIONS.map(([,label])=>label),
      variables:VARIABLES,
    }));
    await page.evaluate(()=>VL3Language.requestSwitch());
    assert.deepEqual(await page.evaluate(()=>VL3PaperContent.canonical()),canonical,"Language display changed canonical paper content");
    const collected={fields:new Set(),choices:new Map(),text:""};
    for (const book of manifest.books) {
      const previewPage=await context.newPage();
      await previewPage.goto(url+"/"+book.preview);
      const actual=await previewPage.evaluate(()=>[...document.querySelectorAll(".paper-page")].map(section=>{
        const boundary=section.getBoundingClientRect(),footer=section.querySelector("footer").getBoundingClientRect();
        const overflow=[...section.querySelectorAll("main *")].filter(node=>{const r=node.getBoundingClientRect();return r.width>0&&(r.right>boundary.right-30 || r.left<boundary.left+25 || r.bottom>footer.top-8);}).map(node=>node.tagName);
        return {code:section.dataset.page,overflow,identity:section.querySelectorAll(".identity-fields").length,lines:[...section.querySelectorAll(".answer-lines")].map(node=>node.children.length)};
      }));
      assert.deepEqual(actual.map(page=>page.code),book.page_codes);
      const clipped=await previewPage.evaluate(()=>[...document.querySelectorAll('svg text')].filter(node=>{
        const r=node.getBoundingClientRect(),s=node.ownerSVGElement.getBoundingClientRect();
        return r.width && (r.left<s.left-2 || r.right>s.right+2 || r.top<s.top-2 || r.bottom>s.bottom+2);
      }).map(node=>node.textContent));
      assert.deepEqual(clipped,[],book.filename+" clipped SVG labels");
      for (const pageAudit of actual) {
        assert.deepEqual(pageAudit.overflow,[],book.filename+" "+pageAudit.code);
        assert(pageAudit.lines.every(count=>count===2));
        assert.equal(pageAudit.identity,["A1","C1"].includes(pageAudit.code)?1:0);
      }
      if (["A","B","C"].includes(book.code)) {
        const scales=await previewPage.evaluate(()=>[...document.querySelectorAll(".plant-pair")].map(pair=>[...pair.querySelectorAll("svg")].map(svg=>({box:[svg.getBoundingClientRect().width,svg.getBoundingClientRect().height],viewBox:svg.getAttribute("viewBox")}))));
        scales.forEach(pair=>assert.deepEqual(pair[0],pair[1],"Before/after plant scale must match"));
        if (book.code==="B") {
          const noGrowth=await previewPage.locator('[data-ext-stem="E"]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute("d")));
          assert.equal(noGrowth.length,2);assert.equal(noGrowth[0],noGrowth[1],"Blank agar E must not elongate");
        }
        assert.equal(await previewPage.locator("input,textarea,select,button,canvas").count(),0);
        const content=await previewPage.locator("body").innerText();
        assert.doesNotMatch(content,/✓|✕|SPS|tzechingchan0605/i);
        if (book.code==="B") assert.doesNotMatch(content,/參考答案|Reference answers|\b35°/i);
        if (book.code==="A") {
          assert.match(content,book.language==="en" ? /auxin/i : /生長素/);
          assert.match(content,book.language==="en" ? /phototropism/i : /向光性/);
          assert.match(content,book.language==="en" ? /protects the young leaf/ : /保護幼葉/);
          assert.match(content,book.language==="en" ? /Worked example/ : /已解說示例/);
          assert.doesNotMatch(content,/E[^\n]*0°|G[^\n]*35°|H[^\n]*35°/);
          assert.equal(await previewPage.locator('[data-cell-side="lit"]').count(),5);
          assert.equal(await previewPage.locator('[data-cell-side="shaded"]').count(),5);
        }
        if (book.code==="C") assert.match(content,/33–37|33-37/);
        if (book.language==="zh-Hant") {
          const blocks=await previewPage.evaluate(()=>({fields:[...document.querySelectorAll("[data-answer-field]")].map(node=>node.dataset.answerField),choices:[...document.querySelectorAll(".circle-options")].map(node=>({id:node.dataset.answerField,options:[...node.children].map(node=>node.textContent.trim())})),text:document.body.innerText}));
          blocks.fields.forEach(field=>collected.fields.add(field));
          blocks.choices.forEach(choice=>collected.choices.set(choice.id,choice.options));collected.text+=blocks.text;
        }
      }
      if (book.language==="en") {
        const text=await previewPage.locator("body").innerText();
        const stripped=text.replace(/（(?:胚芽鞘|向光性|生長素|瓊脂|延長|不透光)）/g,"");
        assert.doesNotMatch(stripped,/[\u3400-\u9fff]/,book.filename);
      }
      if (book.code==="B") {
        const labels=await previewPage.locator('.initial-setups figcaption').allTextContents();
        assert.deepEqual(labels,["A","B","C"]);
        assert.equal(await previewPage.locator(".initial-setups .answer-lines").count(),3);
        const models=await previewPage.locator('.four-plants figure').evaluateAll(nodes=>nodes.map(node=>({label:node.querySelector('figcaption').textContent,stem:node.querySelector('[data-ext-stem]').dataset.extStem,agar:node.querySelector('[data-agar-block]').dataset.agarBlock})));
        assert.deepEqual(models.map(node=>node.stem),["E","F","G","H"]);
        const finalNeedles=await previewPage.locator('.four-plants figure .stage-figure:last-child [data-protractor-pointer]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('d')));
        assert.notEqual(finalNeedles[2],finalNeedles[3],"G/H pointers must have opposite orientations");
      }
      await previewPage.close();
    }
    ["reflection","paper-control","paper-observation","paper-correction-1","paper-correction-2"].forEach(field=>assert(collected.fields.has(field),"Missing paper response: "+field));
    const retained=["qShade","qBelow","qTip","qCap","extEF","extXAmount","extCellElongation","extBendDirection",...['A','B','D'].map(id=>"obs-"+id),...['A','C'].map(id=>"tip-growth-"+id),...['E','F','G','H'].map(id=>"ext-direction-"+id)];
    live.options.filter(choice=>retained.includes(choice.id)).forEach(choice=>assert.deepEqual(collected.choices.get(choice.id),choice.options,"Changed shared options: "+choice.id));
    assert(!collected.fields.has("reason"),"Advance guesses must become examples, not original-hypothesis scoring");
    assert(!collected.fields.has("setupDescription"),"Autonomous design must become provided-diagram labelling");
    [...live.assumptions,...live.variables].forEach(label=>assert(collected.text.includes(label),"Missing shared choice: "+label));
    assert.deepEqual(errors,[]);
    await context.close();
  } finally {await browser.close();await new Promise(resolve=>service.close(resolve));}
  console.log("PASS: current shared source digest, ten PDF/preview checksums, self-study concepts before practice, all three investigations, retained live options and equivalent-question mapping, two writing lines, first-page identity rules, no premature answer-key leaks, distinct comparison variables, bilingual glossary and all-page overflow.");
})().catch(error=>{console.error(error);process.exitCode=1;});
