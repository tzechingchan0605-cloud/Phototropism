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
        assert.doesNotMatch(content,/✓|✕|參考答案|Reference answer|SPS|tzechingchan0605|\b35°/i);
        if (book.code!=="C") assert.doesNotMatch(content,/生長素|向光性|\bauxin\b|phototropism/i);
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
      if (book.code==="A") {
        const order=await previewPage.evaluate(()=>{const drawing=document.querySelector(".drawing-frame"),written=document.querySelector('[data-answer-field="setupDescription"]');return Boolean(drawing.compareDocumentPosition(written)&Node.DOCUMENT_POSITION_FOLLOWING);});
        assert(order);
      }
      await previewPage.close();
    }
    live.fields.forEach(field=>assert(collected.fields.has(field),"Missing live text question: "+field));
    live.options.forEach(choice=>assert.deepEqual(collected.choices.get(choice.id),choice.options,"Missing or changed options: "+choice.id));
    [...live.assumptions,...live.variables].forEach(label=>assert(collected.text.includes(label),"Missing shared choice: "+label));
    assert.deepEqual(errors,[]);
    await context.close();
  } finally {await browser.close();await new Promise(resolve=>service.close(resolve));}
  console.log("PASS: current shared source digest, ten PDF/preview checksums, every live text field and option, two writing lines, first-page identity rules, no answer leaks, drawing order, bilingual glossary and all-page overflow.");
})().catch(error=>{console.error(error);process.exitCode=1;});
