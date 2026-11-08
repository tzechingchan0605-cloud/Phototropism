"use strict";
const {chromium}=require("playwright"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),crypto=require("node:crypto");
const base=process.env.LAB_URL,hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
(async()=>{
  const manifest=JSON.parse(await fs.readFile("materials/manifest.json","utf8"));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||"/usr/bin/chromium",headless:true});
  try {
    const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:1000}}),page=await context.newPage(),errors=[];
    await context.route("**/*",route=>{const url=new URL(route.request().url());return ["127.0.0.1","localhost"].includes(url.hostname)||["blob:","data:","chrome-extension:"].includes(url.protocol)?route.continue():route.abort();});
    await page.addInitScript(()=>{window.setInterval=()=>0;});
    page.on("pageerror",error=>errors.push(error.message));page.on("dialog",dialog=>dialog.accept());
    await page.goto(base);
    assert(await page.locator("#paperMaterials").isHidden());
    assert.equal(await page.evaluate(()=>PaperMaterials.download("studentPDF")),false);
    await page.fill("#profileName","Paper teacher test");await page.fill("#profileClass","X1");await page.fill("#profileEmail","tzechingchan0605@gmail.com");await page.click("#profileForm button");
    await page.waitForSelector('[data-paper-download="studentPDF"]');
    assert.match(await page.locator("#paperMaterials").innerText(),/完整|Complete/);
    assert.match(await page.locator("#paperVersion").innerText(),/ws3/);
    assert(await page.locator("#teacherLogin").isVisible(),"Blank materials must not require cloud unlock");
    await page.fill("#teacherPassword",(await fs.readFile(process.env.VL3_TEST_PASSWORD_FILE,"utf8")).trim());await page.click("#teacherLogin button");
    await page.waitForFunction(()=>document.querySelector("#teacherLogin").hidden);
    await page.waitForSelector('[data-paper-download="studentPDF"]');
    const excel=async target=>{const waiting=page.waitForEvent("download");await page.click("#exportExcel");const download=await waiting;await download.saveAs(target);return fs.readFile(target);};
    const excelBefore=await excel("/tmp/vl3-paper-excel-before.xlsx");
    await page.evaluate(()=>{
      document.querySelector("#reason").value="保留教師示範原文";
      document.querySelector("#hypothesisPart").value="頂端";
      const ctx=document.querySelector("#setupCanvas").getContext("2d");ctx.fillStyle="#333";ctx.fillRect(10,10,40,30);
    });
    const snapshot=()=>page.evaluate(()=>({state:structuredClone(state),storage:{...localStorage},session:{...sessionStorage},canvas:document.querySelector("#setupCanvas").toDataURL(),controls:[...document.querySelectorAll("main input,main select,main textarea")].map(node=>[node.id,node.value,node.checked,node.disabled]),demo:state.profile,records:records()}));
    const before=await snapshot(),remoteBefore=await page.evaluate(()=>cloudSync.list());
    let collectionCalls=0;const onRequest=request=>{if (/\/(rpc|collector)/.test(request.url()))collectionCalls++;};page.on("request",onRequest);
    for (const language of ["zh-Hant","en"]) {
      if ((await page.evaluate(()=>VL3Language.current)) !== (language==="en"?"en":"zh")) await page.evaluate(()=>VL3Language.requestSwitch());
      for (const code of ["studentPDF","studentWord","answersPDF","answersWord","DPDF"]) {
        await page.waitForTimeout(1100);
        const waiting=page.waitForEvent("download");await page.click(`[data-paper-download="${code}"]`);const download=await waiting;
        const book=manifest.books.find(book=>book.code===code&&book.language===language);
        assert.equal(download.suggestedFilename(),book.filename);
        const target=`/tmp/vl3-paper-${language}-${code}.pdf`;await download.saveAs(target);
        const bytes=await fs.readFile(target);assert.equal(bytes.subarray(0,code.endsWith("PDF")?5:2).toString(),code.endsWith("PDF")?"%PDF-":"PK");assert.equal(hash(bytes),book.sha256);
        if(code.endsWith("PDF")){assert.equal(await page.evaluate(code=>PaperMaterials.preview(code),code),true);assert(await page.locator("#paperPreview").isVisible());}
      }
    }
    await page.click('[data-paper-preview="studentPDF"]');await page.waitForFunction(()=>document.querySelector("#paperPreview").src.startsWith("blob:"));
    assert(await page.locator("#paperPreview").isVisible());
    assert.equal(collectionCalls,0,"Materials touched the student collector");page.off("request",onRequest);
    assert.deepEqual(await snapshot(),before,"Materials changed answers, drawings, timers, events or records");
    assert.deepEqual(await page.evaluate(()=>cloudSync.list()),remoteBefore);
    assert.deepEqual(await excel("/tmp/vl3-paper-excel-after.xlsx"),excelBefore);
    // Independent material language selection and canonical content survive app translation.
    if ((await page.evaluate(()=>VL3Language.current))!=="en") await page.locator('#teacherDialog [data-language-switch]').click();
    assert.equal(await page.evaluate(()=>VL3Language.current),"en");
    assert.equal(await page.evaluate(()=>PaperMaterials.setAccess(true)),true);
    assert.equal(await page.locator("[data-paper-download]").count(),5);
    // A delayed old-language response cannot refill the preview after switching.
    const delayed=manifest.books.find(b=>b.code==='studentPDF'&&b.language==='en');let release;
    await page.route('**/'+delayed.path,async route=>{await new Promise(resolve=>{release=resolve;});await route.continue();});
    const pending=page.waitForRequest(request=>request.url().endsWith(delayed.path));
    await page.evaluate(()=>{window.pendingMaterialPreview=PaperMaterials.preview('studentPDF');});await pending;
    await page.evaluate(()=>VL3Language.requestSwitch());assert(await page.locator('#paperPreview').isHidden());release();
    assert.equal(await page.evaluate(()=>window.pendingMaterialPreview),false);assert(await page.locator('#paperPreview').isHidden());await page.unroute('**/'+delayed.path);
    await page.evaluate(()=>VL3Language.requestSwitch());
    for(const failure of ['missing','mime','damaged']){
      const word=manifest.books.find(b=>b.code==='studentWord'&&b.language==='en');
      await page.route('**/'+word.path,route=>failure==='missing'?route.fulfill({status:404,body:'missing'}):route.fulfill({contentType:failure==='mime'?'text/plain':word.mime,body:'PKbroken'}));
      assert.equal(await page.evaluate(()=>PaperMaterials.download('studentWord')),false);await page.unroute('**/'+word.path);assert.equal(await page.evaluate(()=>PaperMaterials.setAccess(true)),true);
    }
    await page.route('**/materials/manifest.json',route=>route.fulfill({json:{...manifest,books:manifest.books.filter(b=>!(b.language==='en'&&b.code==='DPDF'))}}));
    assert.equal(await page.evaluate(()=>PaperMaterials.setAccess(true)),false);await page.unroute('**/materials/manifest.json');assert.equal(await page.evaluate(()=>PaperMaterials.setAccess(true)),true);
    // Reject an old curriculum even if a copied digest matches, then stale source and corrupt PDF.
    await page.route("**/materials/manifest.json",route=>route.fulfill({json:{...manifest,material_revision:1}}));
    assert.equal(await page.evaluate(()=>PaperMaterials.setAccess(true)),false);
    await page.unroute("**/materials/manifest.json");assert.equal(await page.evaluate(()=>PaperMaterials.setAccess(true)),true);
    // Reject outdated source and damaged PDF, then recover with the original records intact.
    await page.route("**/materials/manifest.json",route=>route.fulfill({json:{...manifest,source_digest:"0".repeat(64)}}));
    assert.equal(await page.evaluate(()=>PaperMaterials.setAccess(true)),false);
    assert.equal(await page.evaluate(()=>PaperMaterials.download("studentPDF")),false);
    await page.unroute("**/materials/manifest.json");assert.equal(await page.evaluate(()=>PaperMaterials.setAccess(true)),true);
    const englishA=manifest.books.find(book=>book.code==="studentPDF"&&book.language==="en");
    await page.route("**/"+englishA.path,route=>route.fulfill({contentType:"application/pdf",body:"broken PDF"}));
    assert.equal(await page.evaluate(()=>PaperMaterials.download("studentPDF")),false);
    await page.unroute("**/"+englishA.path);assert.equal(await page.evaluate(()=>PaperMaterials.setAccess(true)),true);
    await page.setViewportSize({width:390,height:844});
    assert(await page.locator("#paperMaterials").isVisible());
    const fits=await page.locator("#paperMaterials").evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;});assert(fits);
    await page.locator("#paperMaterials").screenshot({path:"/tmp/vl3-paper-mobile.png"});
    await page.click("#teacherLogout");assert(await page.locator("#paperMaterials").isHidden());assert.equal(await page.evaluate(()=>PaperMaterials.preview("D")),false);
    assert.deepEqual(errors,[]);
    await context.close();
  } finally {await browser.close();}
  console.log("PASS: ten real bilingual downloads/checksums, PDF preview, teacher-only controls without cloud unlock, interface language and stale-request cancellation, stale/corrupt rejection, phone layout; full inquiry/local/cloud records, drawings, timers/events and actual Excel bytes unchanged.");
})().catch(error=>{console.error(error);process.exitCode=1;});
