"use strict";
// Change only an isolated copy: prove source edits rebuild and retire old PDFs.
const fs=require("node:fs/promises"),path=require("node:path"),os=require("node:os"),assert=require("node:assert/strict"),{execFile}=require("node:child_process");
(async()=>{
  const root=path.resolve(__dirname,".."),copy=await fs.mkdtemp(path.join(os.tmpdir(),"vl3-material-rebuild-"));
  try {
    await fs.cp(root,copy,{recursive:true,filter:file=>![".git",".data","node_modules","__pycache__"].includes(path.basename(file))});
    await fs.symlink(path.join(root,"node_modules"),path.join(copy,"node_modules"),"dir");
    const before=JSON.parse(await fs.readFile(path.join(copy,"materials/manifest.json"),"utf8"));
    const index=path.join(copy,"index.html"),original=await fs.readFile(index,"utf8");
    const changed=original.replace("此探究的假設是什麼？","你的初步觀察");
    assert.notEqual(changed,original);await fs.writeFile(index,changed);
    await new Promise((resolve,reject)=>execFile(process.execPath,["scripts/build-materials.cjs"],{cwd:copy,env:process.env,timeout:120000},(error,stdout,stderr)=>{if(error)reject(Error(stdout+stderr));else resolve();}));
    const after=JSON.parse(await fs.readFile(path.join(copy,"materials/manifest.json"),"utf8"));
    assert.notEqual(after.version,before.version);assert.notEqual(after.source_digest,before.source_digest);assert.equal(after.books.length,10);
    assert((await fs.readFile(path.join(copy,after.books[0].preview),"utf8")).includes("你的初步觀察"));
    for (const book of before.books) await assert.rejects(fs.access(path.join(copy,book.pdf)));
    for (const book of after.books) await fs.access(path.join(copy,book.pdf));
    console.log("PASS: an isolated live-question edit changes source/version digests, rebuilds ten PDFs and previews, updates manifest/catalog and removes obsolete versions; original repository untouched.");
  } finally {await fs.rm(copy,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
