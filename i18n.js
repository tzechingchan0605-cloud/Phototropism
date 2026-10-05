"use strict";
// Language is presentation state only: no storage, record mutation or experiment reset.
window.VL3Language = (() => {
  let language = "zh",
    observer;
  const originals = new WeakMap(),
    attributes = new WeakMap();
  const normalise = (value) => String(value).trim().replace(/\s+/g, " ");
  const dictionary = window.VL3_ENGLISH;
  const keys = Object.keys(dictionary)
    .filter((key) => key.length > 1)
    .sort((a, b) => b.length - a.length);
  const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const phrases = new RegExp(keys.map(escaped).join("|"), "g");
  const glossary = window.VL3_APPROVED_GLOSSARY;
  const pageTitle = document.title;
  const measurement = document.createElement("canvas").getContext("2d");
  const placeholders = {
    profileName: "輸入姓名",
    profileClass: "輸入班別及學號",
    profileEmail: "輸入電郵地址",
    teacherPassword: "輸入教師密碼",
    controlPlan: "描述你的對照設計……",
    setupDescription: "描述四組裝置及固定條件……",
    evidence: "引用比較，解釋你的推論……",
    extReason: "寫下你的理由……",
    extFair: "說明需要保持相同的條件……",
    extEvidence: "引用比較，解釋你的推論……",
    extControl: "描述你的額外對照……",
    reflection: "回顧原始預測，用證據解釋你的修訂……",
  };
  const terms =
    /\b(coleoptiles?|phototropism|auxins?|agar|elongation|elongations|elongate|elongates|elongated|elongating|opaque)\b/gi;
  function addSupport(text) {
    return text.replace(terms, (word, matched, offset, source) => {
      const key = /^elongat/i.test(word)
        ? "elongation"
        : word.toLowerCase().replace(/s$/, "");
      const support = glossary[key] ? "（" + glossary[key] + "）" : "";
      return support && !source.slice(offset + word.length).startsWith(support)
        ? word + support
        : word;
    });
  }
  function english(value) {
    const source = normalise(value);
    if (Object.hasOwn(dictionary, source)) return dictionary[source];
    let match;
    if ((match = /^等待同步：(\d+) 份紀錄；本機備份已保留。$/.exec(source)))
      return `Waiting to sync: ${match[1]} record(s). Local backups are kept.`;
    if (
      (match =
        /^已完整讀取 (\d+) 份雲端紀錄；按 ID／版本合併本機備份後共 (\d+) 份。匯出前會重新讀取全部雲端分頁。$/.exec(
          source,
        ))
    )
      return `All ${match[1]} cloud records have been read. After merging local backups by ID and version, there are ${match[2]} records. All cloud pages will be read again before export.`;
    if (
      (match =
        /^已處理 (\d+) 份紀錄；(\d+) 份未匯入。相同 ID 不新增重複紀錄。$/.exec(
          source,
        ))
    )
      return `${match[1]} records processed; ${match[2]} not imported. The same ID does not create a duplicate record.`;
    if (
      (match = /^延伸裝置 ([E-H])，黑暗培養示意，請自行觀察及量度$/.exec(
        source,
      ))
    )
      return `Extension setup ${match[1]}: growth in darkness. Make your own observations and measurements.`;
    if ((match = /^([A-D]) 組：([^，]+)，(.+)$/.exec(source)))
      return `Setup ${match[1]}: ${english(match[2])}, ${english(match[3])}`;
    if (
      (match =
        /^若(?:胚芽鞘|幼芽)(.+)被遮光，(而其他部位仍然受光|即使下部仍然受光)，(?:胚芽鞘|幼芽)將會(.+)。$/.exec(
          source,
        ))
    ) {
      const part = [
        "頂端",
        "頂端以下位置",
        "【未選擇部位】",
        "【未填寫部位】",
      ].includes(match[1])
        ? english(match[1]).toLowerCase()
        : match[1];
      return `If the coleoptile's ${part} is covered to block light, ${match[2].startsWith("而") ? "while the other parts still receive light" : "even if the lower part still receives light"}, it will ${english(match[3])}.`;
    }
    if (
      (match =
        /^若胚芽鞘的(.+)被遮光，而其他部位仍然受光，胚芽鞘將會(.+)。$/.exec(
          source,
        ))
    )
      return `If the coleoptile's ${english(match[1]).toLowerCase()} is covered to block light while the other parts still receive light, it will ${english(match[2])}.`;
    if ((match = /^([E-H]) 最終角度$/.exec(source)))
      return `${match[1]} final angle`;
    if (/^參考(答案|說明)：/.test(source)) {
      const colon = source.indexOf("：");
      return (
        english(source.slice(0, colon)) +
        ": " +
        english(source.slice(colon + 1))
      );
    }
    // Composition is limited to known system phrases. Protected student text never reaches this function.
    return source
      .replace(phrases, (key) => dictionary[key])
      .replace(
        /[；：。]/g,
        (mark) => ({ "；": "; ", "：": ": ", "。": "." })[mark],
      );
  }
  function t(value) {
    return language === "en" ? addSupport(english(value)) : String(value);
  }
  function sourceText(node) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) {
      const previous = originals.get(node);
      return previous && node.data === previous.rendered
        ? previous.source
        : node.data;
    }
    return [...node.childNodes].map(sourceText).join("");
  }
  function translateText(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest("script,style,textarea,[data-student-text]"))
      return;
    const previous = originals.get(node);
    const source =
      previous && node.data === previous.rendered ? previous.source : node.data;
    const translated =
      language === "en" && /[\u3400-\u9fff]/.test(source)
        ? source.match(/^\s*/)[0] + t(source) + source.match(/\s*$/)[0]
        : source;
    originals.set(node, { source, rendered: translated });
    if (node.data !== translated) node.data = translated;
  }
  function translateAttributes(element) {
    const placeholder =
      placeholders[element.id] ||
      (/^ext-angle-/.test(element.id)
        ? "輸入角度"
        : /^graph-angle-/.test(element.id)
          ? "輸入棒高"
          : "");
    if (placeholder && !element.hasAttribute("placeholder"))
      element.setAttribute("placeholder", placeholder);
    const saved = attributes.get(element) || {};
    for (const name of ["placeholder", "aria-label", "alt", "title"]) {
      const value = element.getAttribute(name);
      if (value === null) continue;
      const previous = saved[name];
      const source =
        previous && value === previous.rendered ? previous.source : value;
      const translated =
        language === "en" && /[\u3400-\u9fff]/.test(source)
          ? t(source)
          : source;
      saved[name] = { source, rendered: translated };
      if (value !== translated) element.setAttribute(name, translated);
    }
    attributes.set(element, saved);
  }
  function fitSVG(root) {
    const svgTexts = root.matches?.("svg text")
      ? [root]
      : [...(root.querySelectorAll?.("svg text") || [])];
    for (const text of svgTexts) {
      if (language === "zh") {
        text.removeAttribute("textLength");
        text.removeAttribute("lengthAdjust");
        continue;
      }
      const svg = text.closest("svg");
      const x = Number(text.getAttribute("x"));
      const width = svg.viewBox.baseVal.width;
      const anchor = text.getAttribute("text-anchor");
      // Keep labels within their panel, leaving room beside the plant and lead lines.
      let limit =
        anchor === "middle" ? Math.min(x, width - x) * 2 - 24 : width - x - 12;
      if (svg.classList.contains("mechanism-svg")) {
        const end = x < 410 ? 395 : 810;
        limit = anchor === "middle" ? 360 : end - x - 10;
        if (x === 444) limit = 122;
        if (x === 450) limit = 156;
      }
      if (
        svg.classList.contains("bar-chart") &&
        Number(text.getAttribute("y")) === 281
      )
        limit = 114;
      const style = getComputedStyle(text);
      measurement.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      if (
        measurement.measureText(text.textContent).width > limit &&
        limit > 0
      ) {
        text.setAttribute("textLength", String(limit));
        text.setAttribute("lengthAdjust", "spacingAndGlyphs");
      }
    }
  }
  function translateTree(root = document.body) {
    if (root.nodeType === Node.TEXT_NODE) {
      translateText(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    translateAttributes(root);
    for (const element of root.querySelectorAll(
      "input,textarea,[placeholder],[aria-label],[alt],[title]",
    ))
      translateAttributes(element);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) translateText(walker.currentNode);
    fitSVG(root);
  }
  function refresh() {
    document.documentElement.lang = language === "en" ? "en" : "zh-Hant-HK";
    document.title = t(pageTitle);
    translateTree(document.documentElement);
  }
  function requestSwitch() {
    language = language === "zh" ? "en" : "zh";
    refresh();
    return true;
  }
  function initialise() {
    document
      .querySelectorAll("[data-language-switch]")
      .forEach((button) => button.addEventListener("click", requestSwitch));
    refresh();
    observer = new MutationObserver((changes) => {
      const roots = new Set();
      for (const change of changes) {
        if (change.type === "childList")
          change.addedNodes.forEach((node) => roots.add(node));
        else roots.add(change.target);
      }
      // Ignore our own writes: equality checks make the observer converge without resetting DOM.
      for (const root of roots) if (root.isConnected) translateTree(root);
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "aria-label", "alt", "title"],
    });
  }
  document.addEventListener("DOMContentLoaded", initialise);
  return {
    t,
    sourceText,
    translateTree,
    refresh,
    requestSwitch,
    get current() {
      return language;
    },
  };
})();
