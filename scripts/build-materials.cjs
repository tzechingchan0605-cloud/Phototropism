"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const {execFileSync} = require("node:child_process");
const {chromium} = require("playwright");
const {existsSync} = require("node:fs");
const ROOT = path.resolve(__dirname, "..");
const SOURCE_FILES = ["index.html","app.js","inquiry.js","tip-inquiry.js","excel.js","i18n.js","i18n-strings.js","paper-content.js","materials/print.css","scripts/build-materials.cjs"];
const labels = {
  "zh-Hant": {A:"情境與原始探究設計",B:"實驗資料、分析與結論",C:"學習重點及反思",D:"教師指引、參考答案及評分準則",FULL:"完整教師列印套裝"},
  en: {A:"Context and original inquiry design",B:"Experimental data, analysis and conclusions",C:"Learning points and reflection",D:"Teacher guide, answers and assessment criteria",FULL:"Complete teacher print pack"},
};
async function fingerprint() {
  const digest = crypto.createHash("sha256");
  const sources = {};
  for (const name of SOURCE_FILES) {
    const content = await fs.readFile(path.join(ROOT,name));
    sources[name] = crypto.createHash("sha256").update(content).digest("hex");
    digest.update(name).update(content);
  }
  const app=await fs.readFile(path.join(ROOT,"app.js"),"utf8");
  const experiment_version=Number(/const EXPERIMENT_VERSION = (\d+)/.exec(app)[1]);
  return {version:"v"+experiment_version+"-"+digest.digest("hex").slice(0,12),experiment_version,sources};
}
async function server() {
  const service = http.createServer(async (request, response) => {
    const url = new URL(request.url,"http://localhost");
    const target = path.resolve(ROOT,"."+(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!target.startsWith(ROOT+path.sep)) {response.writeHead(404);response.end();return;}
    try {
      if (url.pathname === "/cloud-config.js") {response.setHeader("Content-Type","application/javascript");response.end("window.VL3_CLOUD_CONFIG={endpoint:''};");return;}
      const content = await fs.readFile(target);
      response.setHeader("Content-Type",({".html":"text/html",".js":"application/javascript",".css":"text/css",".pdf":"application/pdf",".json":"application/json"})[path.extname(target)] || "application/octet-stream");
      response.end(content);
    } catch {response.writeHead(404);response.end();}
  });
  await new Promise(resolve => service.listen(0,"127.0.0.1",resolve));
  return {service,url:"http://127.0.0.1:"+service.address().port};
}
const html = (content, language, css, title) => `<!doctype html><html lang="${language === "en" ? "en" : "zh-Hant-HK"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head><body lang="${language}">${content}</body></html>`;
async function build() {
  const output = path.join(ROOT,"materials");
  await fs.mkdir(output,{recursive:true});
  const stamp = await fingerprint();
  try {
    const existing=JSON.parse(await fs.readFile(path.join(output,"manifest.json"),"utf8"));
    if (!process.argv.includes("--force") && existing.version === stamp.version && existing.books.length === 10) {
      const source=JSON.parse(await fs.readFile(path.join(output,"source.json"),"utf8"));
      if (crypto.createHash("sha256").update(JSON.stringify(source)).digest("hex") !== existing.source_digest) throw Error("Outdated source snapshot");
      for (const book of existing.books) {
        for (const [file,expected] of [[book.pdf,book.sha256],[book.preview,book.preview_sha256]]) {
          const actual=crypto.createHash("sha256").update(await fs.readFile(path.join(ROOT,file))).digest("hex");
          if (actual !== expected) throw Error("Outdated asset");
        }
      }
      process.stdout.write("Materials already current: "+stamp.version+"\n");
      return existing;
    }
  } catch { /* Rebuild absent, outdated or incomplete materials. */ }
  const css = await fs.readFile(path.join(output,"print.css"),"utf8");
  const {service,url} = await server();
  const executablePath=process.env.CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  const browser = await chromium.launch({headless:true,executablePath});
  const manifest = {...stamp,distribution:["A: original design fixed before B","B: complete and fix inquiry answers before C","C: learning and reflection","D/FULL: teachers only"],vl1_reference:{repository:"tzechingchan0605-cloud/Digestive-System",commit:"6ce583b",paper_version:"v3"},proposal_alignment:["4.1: identical scenarios, static data plots and problem prompts","4.3.2: same concepts/questions before formal teaching; keep SPSAI/CKT separate"],books:[]};
  try {
    for (const language of ["zh-Hant","en"]) {
      const context = await browser.newContext();
      await context.route("**/*",route => new URL(route.request().url()).origin === url ? route.continue() : route.abort());
      const sourcePage = await context.newPage();
      await sourcePage.goto(url);
      const canonical = await sourcePage.evaluate(() => VL3PaperContent.canonical());
      const sourceJSON=JSON.stringify(canonical);
      const sourceDigest=crypto.createHash("sha256").update(sourceJSON).digest("hex");
      if (manifest.source_digest && manifest.source_digest!==sourceDigest) throw Error("Canonical content differs between language builds");
      manifest.source_digest=sourceDigest;
      manifest.option_order=await sourcePage.evaluate(()=>({
        selects:[...document.querySelectorAll("main select")].filter(node=>!["tipView","extensionView"].includes(node.id)).map(node=>({id:node.id,options:[...node.options].filter(option=>option.value).map(option=>({id:option.value,text:VL3Language.sourceText(option).trim()}))})),
        variables:VARIABLE_DISPLAY_ORDER.map(id=>({id,text:VARIABLES[id]})),
        assumptions:ASSUMPTIONS.map(([id,text])=>({id,text})),
        radios:Object.entries(EXT_POSITION_OPTIONS).map(([id,text])=>({id,text})),
      }));
      await fs.writeFile(path.join(output,"source.json"),sourceJSON+"\n");
      let content = await sourcePage.evaluate(() => VL3PaperContent.render());
      if (language === "en") {
        await sourcePage.evaluate(() => VL3Language.requestSwitch());
        content = await sourcePage.evaluate(books => VL3PaperContent.translate(books), content);
      }
      const printPage = await context.newPage();
      await printPage.setContent(html(content.D.join(""),language,css,labels[language].D));
      // Paginate the shared rubric without cutting a table row across pages.
      const rubricPages = await printPage.evaluate(({rubric,version}) => {
        const pages = [],limit = 945;
        let section,table,index=4;
        function next() {
          section=document.createElement("section");section.className="paper-page";section.dataset.page="D"+index++;
          section.innerHTML=`<header><b>VL3 · ${rubric[0][0]}</b><span>${section.dataset.page}</span></header><main><table class="rubric"><thead><tr></tr></thead><tbody></tbody></table></main><footer><span>${version}</span><span>${section.dataset.page}</span></footer>`;
          rubric[0].forEach(value=>{const th=document.createElement("th");th.textContent=value;section.querySelector("thead tr").append(th);});
          document.body.append(section);table=section.querySelector("tbody");pages.push(section);
        }
        next();
        for (const row of rubric.slice(1)) {
          const tr=document.createElement("tr");row.forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.append(td);});table.append(tr);
          if (section.querySelector("main").getBoundingClientRect().bottom-section.getBoundingClientRect().top>limit) {tr.remove();next();table.append(tr);}
        }
        return pages.map(page=>page.outerHTML);
      },{rubric:content.rubric,version:stamp.version});
      content.D.push(...rubricPages);
      content.FULL=[...content.A,...content.B,...content.C,...content.D];
      for (const code of ["A","B","C","D","FULL"]) {
        const filename=`VL3_paper_${code}_${language}_${stamp.version}.pdf`;
        const preview=filename.replace(/\.pdf$/,".html");
        await printPage.setContent(html(content[code].join(""),language,css,labels[language][code]));
        await printPage.evaluate(version=>document.querySelectorAll("[data-paper-version]").forEach(node=>node.textContent=version),stamp.version);
        await printPage.evaluate(()=>document.fonts.ready);
        const audit = await printPage.evaluate(() => [...document.querySelectorAll(".paper-page")].map(section=>{
          const bounds=section.getBoundingClientRect(),main=section.querySelector("main").getBoundingClientRect(),footer=section.querySelector("footer").getBoundingClientRect();
          const overflow=[...section.querySelectorAll("main *")].filter(node=>{const r=node.getBoundingClientRect();return r.width>0 && (r.right>bounds.right-30 || r.left<bounds.left+25 || r.bottom>footer.top-8);}).map(node=>({tag:node.tagName,text:node.textContent.slice(0,90),box:[node.getBoundingClientRect().right,node.getBoundingClientRect().bottom]}));
          return {page:section.dataset.page,overflow,mainHeight:main.height,lines:[...section.querySelectorAll(".answer-lines")].map(node=>node.children.length),writing_regions:[...section.querySelectorAll(".answer-lines")].map(node=>({field:node.dataset.answerField,lines:[...node.children].map(line=>{const r=line.getBoundingClientRect();return [(r.left-bounds.left)*.75,(r.bottom-bounds.top)*.75,(r.right-bounds.left)*.75];})})),identity:section.querySelectorAll(".identity-fields").length};
        }));
        const bad=audit.filter(page=>page.overflow.length || page.lines.some(count=>count!==2));
        if (bad.length) throw Error(language+" "+code+" layout overflow: "+JSON.stringify(bad));
        if (language === "en") {
          const remaining=await printPage.evaluate(()=>document.body.innerText.replace(/（(?:胚芽鞘|向光性|生長素|瓊脂|延長|不透光)）/g,""));
          if (/[\u3400-\u9fff]/.test(remaining)) throw Error("Untranslated English material: "+remaining.match(/.{0,30}[\u3400-\u9fff]+.{0,30}/g)?.join("\n"));
        }
        const bytes=await printPage.pdf({format:"A4",printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});
        await fs.writeFile(path.join(output,filename),bytes);
        const previewHTML=await printPage.content();
        await fs.writeFile(path.join(output,preview),previewHTML);
        const info=execFileSync("pdfinfo",[path.join(output,filename)],{encoding:"utf8"});
        const pages=Number(/^Pages:\s+(\d+)/m.exec(info)[1]);
        if (pages!==content[code].length) throw Error("Unexpected pagination "+filename+" "+pages);
        const text=execFileSync("pdftotext",[path.join(output,filename),"-"],{encoding:"utf8"});
        if (!text.includes("VL3")) throw Error("Missing selectable PDF text");
        manifest.books.push({code,language,title:labels[language][code],pages,page_codes:audit.map(page=>page.page),filename,pdf:"materials/"+filename,preview:"materials/"+preview,sha256:crypto.createHash("sha256").update(bytes).digest("hex"),preview_sha256:crypto.createHash("sha256").update(previewHTML).digest("hex"),bytes:bytes.length,audit});
        process.stdout.write(`Built ${language} ${code}: ${pages} pages\n`);
      }
      await context.close();
    }
    for (const language of ["zh-Hant","en"]) {
      let start=1;
      for (const book of manifest.books.filter(book=>book.language===language)) {
        book.pack_range=book.code === "FULL" ? [1,book.pages] : [start,start+book.pages-1];
        if (book.code !== "FULL") start+=book.pages;
      }
    }
    await fs.writeFile(path.join(output,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
    await fs.writeFile(path.join(output,"catalog.js"),"window.VL3_PAPER_CATALOG="+JSON.stringify({version:manifest.version,books:manifest.books.map(({audit,sha256,bytes,...book})=>book)})+";\n");
    const table=["| 冊別 | 繁中頁數 | 英文頁數 | 套裝頁碼（繁中／英文） |", "| --- | ---: | ---: | --- |"];
    const ranges={"zh-Hant":1,en:1};
    for (const code of ["A","B","C","D"]) {
      const zh=manifest.books.find(book=>book.code===code && book.language==="zh-Hant"),en=manifest.books.find(book=>book.code===code && book.language==="en");
      table.push(`| ${code} · ${labels["zh-Hant"][code]} | ${zh.pages} | ${en.pages} | ${ranges["zh-Hant"]}–${ranges["zh-Hant"]+zh.pages-1}／${ranges.en}–${ranges.en+en.pages-1} |`);
      ranges["zh-Hant"]+=zh.pages;ranges.en+=en.pages;
    }
    table.push(`| 完整教師套裝 | ${ranges["zh-Hant"]-1} | ${ranges.en-1} | 全部 |`);
    const summary="版本：`"+stamp.version+"`\n\n"+table.join("\n")+"\n\n檔名：`VL3_paper_{A|B|C|D|FULL}_{zh-Hant|en}_"+stamp.version+".pdf`。\n";
    await fs.writeFile(path.join(output,"README.md"),"# VL3 紙本對照組材料\n\n"+summary+"\n"+manifest.books.map(book=>`- [${book.language} ${book.code} · ${book.pages} 頁](${book.filename}) · [預覽](${path.basename(book.preview)})`).join("\n")+"\n");
    const readmePath=path.join(ROOT,"README.md");
    const readme=await fs.readFile(readmePath,"utf8");
    if (readme.includes("<!-- paper-materials:start -->")) await fs.writeFile(readmePath,readme.replace(/<!-- paper-materials:start -->[\s\S]*?<!-- paper-materials:end -->/,"<!-- paper-materials:start -->\n"+summary+"<!-- paper-materials:end -->"));
    // Remove only obsolete generated materials; leave source CSS and manifest intact.
    const keep=new Set(manifest.books.flatMap(book=>[book.filename,path.basename(book.preview)]));
    for (const name of await fs.readdir(output)) if (/^VL3_paper_.+\.(pdf|html)$/.test(name) && !keep.has(name)) await fs.unlink(path.join(output,name));
    return manifest;
  } finally {await browser.close();await new Promise(resolve=>service.close(resolve));}
}
module.exports={fingerprint,build,server,SOURCE_FILES};
if (require.main===module) build().catch(error=>{process.stderr.write(error.stack+"\n");process.exitCode=1;});
