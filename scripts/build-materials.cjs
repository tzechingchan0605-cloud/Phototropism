"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const {execFileSync} = require("node:child_process");
const {chromium} = require("playwright");
const {existsSync} = require("node:fs");
const ROOT = path.resolve(__dirname, "..");
const SOURCE_FILES = ["index.html","app.js","inquiry.js","tip-inquiry.js","excel.js","i18n.js","i18n-strings.js","paper-content.js","materials/print.css","scripts/build-materials.cjs","scripts/word-materials.py","rubric.js","paper-ui.js"];
async function fingerprint() {
  const digest=crypto.createHash('sha256'),sources={};
  for(const name of SOURCE_FILES){const content=await fs.readFile(path.join(ROOT,name));sources[name]=crypto.createHash('sha256').update(content).digest('hex');digest.update(name).update(content);}
  const app=await fs.readFile(path.join(ROOT,'app.js'),'utf8');
  const experiment_version=Number(/const EXPERIMENT_VERSION = (\d+)/.exec(app)[1]);
  return {material_revision:3,version:'ws3-vl'+experiment_version+'-'+digest.digest('hex').slice(0,12),experiment_version,sources};
}
async function server() {
  const service = http.createServer(async (request, response) => {
    const url = new URL(request.url,"http://localhost");
    const target = path.resolve(ROOT,"."+(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!target.startsWith(ROOT+path.sep)) {response.writeHead(404);response.end();return;}
    try {
      if (url.pathname === "/cloud-config.js") {response.setHeader("Content-Type","application/javascript");response.end("window.VL3_CLOUD_CONFIG={endpoint:''};");return;}
      const content = await fs.readFile(target);
      response.setHeader("Content-Type",({".html":"text/html",".js":"application/javascript",".css":"text/css",".pdf":"application/pdf",".json":"application/json",".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document"})[path.extname(target)] || "application/octet-stream");
      response.end(content);
    } catch {response.writeHead(404);response.end();}
  });
  await new Promise(resolve => service.listen(0,"127.0.0.1",resolve));
  return {service,url:"http://127.0.0.1:"+service.address().port};
}
const html=(content,language,css)=>`<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>WS3</title><style>${css}</style></head><body lang="${language}">${content}</body></html>`;
async function build(){
  const output=path.join(ROOT,'materials'),stamp=await fingerprint();
  try{const previous=JSON.parse(await fs.readFile(path.join(output,'manifest.json'),'utf8'));if(!process.argv.includes('--force')&&previous.version===stamp.version){for(const book of previous.books){const bytes=await fs.readFile(path.join(ROOT,book.path));if(crypto.createHash('sha256').update(bytes).digest('hex')!==book.sha256)throw Error('checksum');}console.log('Materials already current: '+stamp.version);return previous;}}catch{}
  const {service,url}=await server();const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
  const css=await fs.readFile(path.join(output,'print.css'),'utf8');const books=[],manifest={...stamp,books};
  try{
    const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.abort());
    const source=await context.newPage();source.on('pageerror',e=>console.error(e.message));await source.goto(url);await source.waitForFunction(()=>window.VL3PaperContent);
    const canonical=await source.evaluate(()=>VL3PaperContent.canonical());manifest.source_digest=crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
    await fs.writeFile(path.join(output,'source.json'),JSON.stringify(canonical,null,2)+'\n');
    for(const language of ['zh-Hant','en']){
      if(language==='en')await source.evaluate(()=>VL3Language.requestSwitch());
      for(const [code,title,answers] of [['student','完整學生版',false],['answers','完整連參考答案版',true],['D','教師指引、配對及評分',false]]){
        const pages=await source.evaluate(({code,answers})=>code==='D'?VL3PaperContent.teacherPages():VL3PaperContent.render(answers),{code,answers});
        const filename=`VL3_WS3_${code}_${language}_${stamp.version}`;
        const content=html(pages.join(''),language,css).replaceAll('<span data-paper-version></span>',`<span data-paper-version>VL3 · WS3 · v19</span>`);
        await fs.writeFile(path.join(output,filename+'.html'),content);
        const print=await context.newPage();await print.setContent(content);await print.evaluate(()=>document.fonts.ready);
        const overflow=await print.evaluate(()=>[...document.querySelectorAll('.paper-page')].map(p=>({page:p.dataset.page,bottom:p.querySelector('main').getBoundingClientRect().bottom,limit:p.querySelector('footer').getBoundingClientRect().top})).filter(p=>p.bottom>p.limit-5));
        if(overflow.length)throw Error(filename+' overflow '+JSON.stringify(overflow));
        await print.pdf({path:path.join(output,filename+'.pdf'),printBackground:true,preferCSSPageSize:true});await print.close();
        const english={student:'Complete student worksheet',answers:'Complete worksheet with reference answers',D:'Teacher guide, alignment and marking'};
        const base={language,title:language==='en'?english[code]:title,pages:pages.length};
        const bytes=await fs.readFile(path.join(output,filename+'.pdf'));books.push({...base,code:code+'PDF',path:'materials/'+filename+'.pdf',filename:filename+'.pdf',mime:'application/pdf',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),preview:'materials/'+filename+'.html'});
        if(code!=='D'){
          execFileSync(process.env.PYTHON||'python3',[path.join(ROOT,'scripts/word-materials.py'),path.join(output,filename+'.html'),path.join(output,filename+'.docx')],{stdio:'inherit'});
          const doc=await fs.readFile(path.join(output,filename+'.docx'));books.push({...base,code:code+'Word',path:'materials/'+filename+'.docx',filename:filename+'.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',sha256:crypto.createHash('sha256').update(doc).digest('hex')});
        }
      }
    }
    await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    const keep=new Set(books.flatMap(b=>[b.filename,b.preview&&path.basename(b.preview)]).filter(Boolean));
    for(const name of await fs.readdir(output))if(/\.(pdf|html|docx)$/.test(name)&&!keep.has(name))await fs.unlink(path.join(output,name));
    console.log('Built '+stamp.version+': ten files, five types per language');return manifest;
  }finally{await browser.close();await new Promise(resolve=>service.close(resolve));}
}
if(require.main===module)build().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fingerprint,server,build};
