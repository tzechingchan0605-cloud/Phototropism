"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),crypto=require('node:crypto');
const {chromium}=require('playwright');const {fingerprint,server}=require('../scripts/build-materials.cjs');
(async()=>{
 const m=JSON.parse(await fs.readFile('materials/manifest.json')),f=await fingerprint();assert.equal(m.version,f.version);assert.deepEqual(m.sources,f.sources);assert.equal(m.material_revision,3);assert.equal(m.books.length,10);
 for(const lang of ['zh-Hant','en']){const b=m.books.filter(b=>b.language===lang);assert.deepEqual(new Set(b.map(b=>b.code)),new Set(['studentPDF','studentWord','answersPDF','answersWord','DPDF']));for(const book of b){const bytes=await fs.readFile(book.path);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),book.sha256);if(book.code!=='DPDF')assert.equal(book.pages,4);}}
 const {service,url}=await server(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true});
 try{const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());const page=await context.newPage();await page.goto(url);const canonical=await page.evaluate(()=>VL3PaperContent.canonical());assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),m.source_digest);await page.evaluate(()=>VL3Language.requestSwitch());assert.deepEqual(await page.evaluate(()=>VL3PaperContent.canonical()),canonical);
 for(const book of m.books.filter(b=>b.code.endsWith('PDF'))){await page.goto(url+'/'+book.preview);
 if(book.code!=='DPDF'){
  const diagrams=await page.evaluate(()=>{
   const initial=document.querySelector('.initial-setups'),variables=document.querySelector('.variables'),mechanism=document.querySelector('.concept-box .mechanism-svg');
   const lamps=[...mechanism.querySelectorAll('rect')].filter(n=>n.getAttribute('fill')==='#f3b946');
   const ruler=[...document.querySelectorAll('main>svg>g')].map(g=>{
    const pointer=[...g.querySelectorAll('path')].find(p=>p.getAttribute('stroke')==='#bd7725');
    if(!pointer)return null;const nums=pointer.getAttribute('d').match(/-?[0-9.]+/g).map(Number);
    return Math.abs(Math.atan2(nums[2]-nums[0],nums[1]-nums[3])*180/Math.PI);
   }).filter(n=>n!==null);
   return {bullets:document.querySelectorAll('.topic-points>li').length,notes:document.querySelector('.topic-points').textContent,initialCount:initial.querySelectorAll('figure').length,beforeVariables:Boolean(initial.compareDocumentPosition(variables)&Node.DOCUMENT_POSITION_FOLLOWING),initialStems:[...initial.querySelectorAll('[data-stem]')].map(n=>n.getAttribute('d')),cutsInInitial:initial.querySelectorAll('[data-cut-surface]').length,roundTips:document.querySelectorAll('[data-rounded-tip]').length,beamOpacity:Number(mechanism.querySelector('[data-paper-light-beams]').getAttribute('opacity')),lampHeights:lamps.map(n=>Number(n.getAttribute('height'))),separators:[...document.querySelectorAll('.main-setups figure')].map(n=>parseFloat(getComputedStyle(n).borderRightWidth)),mainHeight:document.querySelector('.main-setups .plant-pair').getBoundingClientRect().height,angles:ruler};
  });
  assert.equal(diagrams.bullets,3);assert.match(diagrams.notes,book.language==='en'?/growth in response to light direction/:/光照方向的定向生長/);assert.match(diagrams.notes,book.language==='en'?/Agar.*chemical substances/:/瓊脂容許化學物質通過/);assert.equal(diagrams.initialCount,3);assert(diagrams.beforeVariables);assert.equal(new Set(diagrams.initialStems).size,1);assert.equal(diagrams.cutsInInitial,0);assert.equal(diagrams.roundTips,2);
  assert(diagrams.beamOpacity>0&&diagrams.beamOpacity<.5);assert(diagrams.lampHeights[1]>diagrams.lampHeights[0]*2);assert(diagrams.separators[0]>0&&diagrams.separators[1]>0&&diagrams.separators[2]===0);assert(diagrams.mainHeight>=140);
  diagrams.angles.forEach((angle,i)=>assert(Math.abs(angle-[0,0,35,35][i])<.01));assert.equal(diagrams.angles.length,4);
 }
 const audit=await page.evaluate(()=>[...document.querySelectorAll('.paper-page')].map(p=>({overflow:p.querySelector('main').getBoundingClientRect().bottom>p.querySelector('footer').getBoundingClientRect().top-5,identity:p.querySelectorAll('.identity-fields').length})));assert(audit.every(p=>!p.overflow),book.filename);assert.equal(audit.reduce((n,p)=>n+p.identity,0),book.code==='DPDF'?0:1);const sizes=await page.evaluate(()=>[...document.querySelectorAll('main p,main td,.circle-options')].map(n=>parseFloat(getComputedStyle(n).fontSize)));assert(sizes.every(n=>n>=14.66));}
 await context.close();}finally{await browser.close();await new Promise(r=>service.close(r));}console.log('PASS: WS3 five types per language, four-page student/answers, shared live choices, language-independent fingerprint, checksums, readable fonts and no overflow');
})().catch(e=>{console.error(e);process.exitCode=1;});
