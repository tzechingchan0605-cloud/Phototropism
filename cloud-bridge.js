"use strict";
// Validated postMessage transport to an Apps Script google.script.run page.
window.createAppsScriptBridge = function (endpoint) {
  const channel = crypto.randomUUID(),
    endpointOrigin = new URL(endpoint).origin;
  const pending = new Map();
  let source, sourceOrigin, readyPromise, frame, listener;
  const trustedOrigin = (origin) => {
    if (origin === endpointOrigin) return true;
    try {
      const url = new URL(origin);
      return (
        url.protocol === "https:" &&
        (url.hostname === "script.googleusercontent.com" ||
          /^[a-z0-9-]+-script\.googleusercontent\.com$/.test(url.hostname))
      );
    } catch {
      return false;
    }
  };
  // Google's content page may be a nested iframe. Validate its window ancestry.
  function belongsToFrame(candidate) {
    try {
      for (let depth = 0; candidate && depth < 16; depth++) {
        if (candidate === frame?.contentWindow) return true;
        const parent = candidate.parent;
        if (parent === candidate) return false;
        candidate = parent;
      }
    } catch {
      return false;
    }
    return false;
  }
  function reset(error) {
    if (listener) window.removeEventListener("message", listener);
    frame?.remove();
    frame = null;
    source = null;
    sourceOrigin = null;
    readyPromise = null;
    for (const job of pending.values()) {
      clearTimeout(job.timeout);
      job.reject(error);
    }
    pending.clear();
  }
  function connect() {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const error = Error(
          "未能開啟雲端連線頁，請確認 Apps Script 已部署並允許所有人存取",
        );
        reset(error);
        reject(error);
      }, 20000);
      listener = (event) => {
        const data = event.data;
        if (!data || data.channel !== channel || !trustedOrigin(event.origin))
          return;
        if (
          data.type === "vl3-ready" &&
          !source &&
          belongsToFrame(event.source)
        ) {
          source = event.source;
          sourceOrigin = event.origin;
          clearTimeout(timeout);
          source.postMessage({ type: "vl3-connected", channel }, sourceOrigin);
          resolve();
          return;
        }
        if (
          event.source !== source ||
          event.origin !== sourceOrigin ||
          data.type !== "vl3-response"
        )
          return;
        const job = pending.get(data.id);
        if (!job) return;
        pending.delete(data.id);
        clearTimeout(job.timeout);
        if (data.error) job.reject(Error(String(data.error)));
        else job.resolve(data.result);
      };
      window.addEventListener("message", listener);
      const url = new URL(endpoint);
      url.searchParams.set("view", "bridge");
      url.searchParams.set("channel", channel);
      url.searchParams.set("parentOrigin", location.origin);
      frame = document.createElement("iframe");
      frame.hidden = true;
      frame.title = "VL3 雲端紀錄連線";
      frame.src = url.href;
      document.body.append(frame);
    });
    return readyPromise;
  }
  async function send(payload) {
    await connect();
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        const error = Error("雲端尚未確認回應，紀錄保留待重試");
        reject(error);
        reset(error);
      }, 25000);
      pending.set(id, { resolve, reject, timeout });
      source.postMessage(
        { type: "vl3-request", channel, id, payload },
        sourceOrigin,
      );
    });
  }
  return { send };
};
