"use strict";
window.PaperMaterials = (() => {
  let permitted = false;
  let generation = 0, catalog, previewURL;
  const panel = document.querySelector("#paperMaterials");
  const language = document.querySelector("#paperLanguage");
  const preview = document.querySelector("#paperPreview");
  const status = document.querySelector("#paperStatus");
  const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(value=>value.toString(16).padStart(2,"0")).join("");
  function authorised() {
    return permitted && teacher();
  }
  function clearPreview() {
    preview.hidden = true;
    preview.removeAttribute("src");
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = undefined;
  }
  function fail() {
    catalog = undefined;
    document.querySelector("#paperDownloads").replaceChildren();
    clearPreview();
    status.textContent = VL3Language.t("工作紙版本不一致或檔案損壞，請重建材料後再試。");
    return false;
  }
  async function setAccess(value) {
    const requestGeneration = ++generation;
    permitted = Boolean(value);
    panel.hidden = !authorised();
    clearPreview();
    if (panel.hidden) {
      catalog = undefined;
      return false;
    } else {
      status.textContent = "";
      language.value = VL3Language.current === "en" ? "en" : "zh-Hant";
      try {
        const response = await fetch("materials/manifest.json",{cache:"no-store"});
        if (!response.ok) throw Error("Materials unavailable");
        const latest = await response.json();
        const digest = await sha(new TextEncoder().encode(JSON.stringify(VL3PaperContent.canonical())));
        if (requestGeneration !== generation || !authorised()) return false;
        if (latest.material_revision !== VL3PaperContent.revision || latest.experiment_version !== EXPERIMENT_VERSION || latest.source_digest !== digest || latest.books.length !== 10) return fail();
        catalog = latest;
        render();
        return true;
      } catch {
        if (requestGeneration !== generation || !authorised()) return false;
        return fail();
      }
    }
  }
  async function verifiedPDF(code) {
    if (!authorised() || !catalog) return;
    const book = catalog.books.find(book=>book.code===code && book.language===language.value);
    if (!book) return;
    const response = await fetch(book.pdf,{cache:"no-store"});
    if (!response.ok) throw Error("Missing PDF");
    const bytes = await response.arrayBuffer();
    if (new TextDecoder().decode(bytes.slice(0,5)) !== "%PDF-" || await sha(bytes) !== book.sha256) throw Error("PDF integrity mismatch");
    if (!authorised()) return;
    return {book,blob:new Blob([bytes],{type:"application/pdf"})};
  }
  async function downloadBook(code) {
    if (!authorised()) return false;
    try {
      const result = await verifiedPDF(code);
      if (!result) return false;
      download(result.blob,result.book.filename);
      status.textContent = "";
      return true;
    } catch {return fail();}
  }
  async function previewBook(code) {
    if (!authorised()) return false;
    try {
      const result = await verifiedPDF(code);
      if (!result) return false;
      clearPreview();
      previewURL = URL.createObjectURL(result.blob);
      preview.src = previewURL;
      preview.hidden = false;
      return true;
    } catch {return fail();}
  }
  function render() {
    if (!authorised()) return;
    if (!catalog) return;
    const entries = catalog.books.filter(book => book.language === language.value);
    document.querySelector("#paperDownloads").innerHTML = entries.map(book =>
      `<article><strong data-student-text>${esc(book.code)} · ${esc(book.title)} · ${book.pages} ${language.value === "en" ? "pages" : "頁"}<small>${language.value === "en" ? "Pack pages" : "套裝頁碼"} ${book.pack_range.join("–")}</small></strong><div><button type="button" class="secondary" data-paper-preview="${esc(book.code)}">預覽</button><a class="paper-pdf-link" href="${esc(book.pdf)}" download="${esc(book.filename)}" data-paper-download="${esc(book.code)}">下載 PDF</a></div></article>`
    ).join("");
    document.querySelector("#paperVersion").textContent = (language.value === "en" ? "Paper curriculum: WS" : "紙本教學版本：WS")+catalog.material_revision+" · VL "+EXPERIMENT_VERSION+" · "+catalog.version;
    clearPreview();
    panel.querySelectorAll("[data-paper-preview]").forEach(button => {
      button.onclick = () => {
        previewBook(button.dataset.paperPreview);
      };
    });
    panel.querySelectorAll("[data-paper-download]").forEach(link => {
      link.onclick = event => {event.preventDefault();downloadBook(link.dataset.paperDownload);};
    });
    VL3Language.translateTree(panel);
  }
  language.onchange = render;
  document.querySelector("#paperReload").onclick = () => setAccess(teacher());
  setAccess(teacher());
  return {setAccess,download:downloadBook,preview:previewBook};
})();
