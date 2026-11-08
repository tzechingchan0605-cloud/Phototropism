"use strict";
window.PaperMaterials=(()=>{
  let permitted=false,generation=0,catalog,previewURL;
  const panel=document.querySelector('#paperMaterials'),preview=document.querySelector('#paperPreview'),status=document.querySelector('#paperStatus');
  const codes=['studentPDF','studentWord','answersPDF','answersWord','DPDF'];
  const language=()=>VL3Language.current==='en'?'en':'zh-Hant';
  const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  const authorised=()=>permitted&&teacher();
  function clear(){preview.hidden=true;preview.removeAttribute('src');if(previewURL)URL.revokeObjectURL(previewURL);previewURL=undefined;}
  function fail(){catalog=undefined;document.querySelector('#paperDownloads').replaceChildren();clear();status.textContent=VL3Language.current==='en'?'Worksheet files are missing, outdated or damaged. Reload the materials.':'工作紙缺失、過期或損壞，請重新載入教材。';return false;}
  function render(){
    if(!authorised()||!catalog)return;clear();
    const en=language()==='en';
    document.querySelector('#paperDownloads').innerHTML=codes.map(code=>{
      const b=catalog.books.find(b=>b.code===code&&b.language===language());
      return `<article><strong data-student-text>${esc(b.title)} · ${code.endsWith('Word')?'Word':'PDF'}</strong><div>${code.endsWith('PDF')?`<button type="button" class="secondary" data-paper-preview="${code}">${en?'Preview':'預覽'}</button>`:''}<button type="button" data-paper-download="${code}">${en?'Download':'下載'}</button></div></article>`;
    }).join('');
    document.querySelector('#paperVersion').textContent=catalog.version;
    panel.querySelectorAll('[data-paper-preview]').forEach(b=>b.onclick=()=>previewBook(b.dataset.paperPreview));
    panel.querySelectorAll('[data-paper-download]').forEach(b=>b.onclick=()=>downloadBook(b.dataset.paperDownload));
  }
  async function setAccess(value){
    const token=++generation;permitted=Boolean(value);panel.hidden=!authorised();clear();catalog=undefined;
    if(panel.hidden)return false;status.textContent='';
    try{
      const response=await fetch('materials/manifest.json',{cache:'no-store'});if(!response.ok)throw Error();const latest=await response.json();
      const digest=await sha(new TextEncoder().encode(JSON.stringify(VL3PaperContent.canonical())));
      if(token!==generation||!authorised())return false;
      if(latest.material_revision!==3||latest.experiment_version!==EXPERIMENT_VERSION||latest.source_digest!==digest||latest.books.length!==10)throw Error();
      for(const lang of ['zh-Hant','en'])for(const code of codes){const matches=latest.books.filter(b=>b.language===lang&&b.code===code);if(matches.length!==1||!/^materials\/VL3_WS3_/.test(matches[0].path)||!matches[0].filename.includes(latest.version))throw Error();}
      catalog=latest;render();return true;
    }catch{if(token!==generation||!authorised())return false;return fail();}
  }
  async function verified(code){
    if(!authorised()||!catalog)return;
    const token=generation,lang=language(),book=catalog.books.find(b=>b.code===code&&b.language===lang);if(!book)return;
    const response=await fetch(book.path,{cache:'no-store'});if(!response.ok||response.headers.get('content-type')?.split(';')[0]!==book.mime)throw Error();
    const bytes=await response.arrayBuffer(),magic=new Uint8Array(bytes);
    if(await sha(bytes)!==book.sha256||(code.endsWith('PDF')?new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-':magic[0]!==80||magic[1]!==75))throw Error();
    if(token!==generation||lang!==language()||!authorised())return;
    return {book,blob:new Blob([bytes],{type:book.mime})};
  }
  async function downloadBook(code){const token=generation;try{const r=await verified(code);if(!r)return false;download(r.blob,r.book.filename);return true;}catch{return token===generation?fail():false;}}
  async function previewBook(code){if(!code.endsWith('PDF'))return false;const token=generation;try{const r=await verified(code);if(!r)return false;clear();previewURL=URL.createObjectURL(r.blob);preview.src=previewURL;preview.hidden=false;return true;}catch{return token===generation?fail():false;}}
  document.addEventListener('vl3languagechange',()=>{++generation;clear();if(authorised()){if(catalog)render();else setAccess(true);}});
  document.querySelector('#paperReload').onclick=()=>setAccess(teacher());setAccess(teacher());
  return {setAccess,download:downloadBook,preview:previewBook};
})();
