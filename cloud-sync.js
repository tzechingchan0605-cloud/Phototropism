"use strict";
// Full durable backups + per-investigation write permissions; acknowledgements
// never delete student records. No direct cross-origin fetch / no-cors fallback.
window.createCloudSync = function ({
  endpoint,
  storage,
  records,
  status,
  validate,
}) {
  const enabled = Boolean(endpoint),
    key = "phototropismLab.appsScriptSync.v1";
  const pending = new Map();
  let running = null,
    timer,
    bridge,
    credential = "",
    confirmed = false;
  function metadata() {
    const raw = storage.getItem(key);
    let all;
    try {
      all = raw ? JSON.parse(raw) : {};
    } catch {
      throw Error("雲端同步備份損壞，原值已保留；請勿清除瀏覽器資料");
    }
    if (!all || Array.isArray(all) || typeof all !== "object")
      throw Error("雲端同步備份格式損壞，原值已保留");
    return all;
  }
  function student(r) {
    return (
      r?.moduleId === "VL_BIO_PHOTOTROPISM" &&
      r.id &&
      r.profile?.email &&
      r.profile.email.toLowerCase() !== "tzechingchan0605@gmail.com" &&
      !r.demo &&
      r.profile.mode !== "teacher-demo"
    );
  }
  function entry(id) {
    const all = metadata();
    if (!all[id]) {
      all[id] = {
        token: crypto.randomUUID() + crypto.randomUUID(),
        acknowledgements: {},
      };
      storage.setItem(key, JSON.stringify(all));
    }
    if (
      !/^[a-f0-9-]{64,128}$/i.test(all[id].token || "") ||
      !all[id].acknowledgements ||
      typeof all[id].acknowledgements !== "object"
    )
      throw Error("同步寫入權限不完整，請保留本機備份");
    return all[id];
  }
  async function request(body) {
    if (!enabled) throw Error("未設定 VL3 雲端收集網址");
    if (!bridge) bridge = createAppsScriptBridge(endpoint);
    const result = await bridge.send(body);
    if (!result?.ok) throw Error(result?.error || "雲端未確認儲存");
    return result;
  }
  function enqueue(record) {
    if (!student(record)) return;
    try {
      if (
        typeof record.savedAt !== "string" ||
        !Number.isFinite(Date.parse(record.savedAt))
      )
        throw Error("舊紀錄未包含有效保存時間，原紀錄保留，請先下載備份");
      const info = entry(record.id),
        all = metadata();
      const known = all[record.id].record;
      if (known && Date.parse(known.savedAt) > Date.parse(record.savedAt))
        record = known;
      all[record.id].record = structuredClone(record);
      storage.setItem(key, JSON.stringify(all));
      if (!enabled) {
        status(
          "unconfigured",
          "未設定雲端；本機備份已保存，教師尚不能跨裝置讀取。",
        );
        return;
      }
      if (info.acknowledgements[endpoint] === record.savedAt) return;
      pending.set(record.id, structuredClone(record));
      status("pending", `等待同步：${pending.size} 份紀錄；本機備份已保留。`);
      clearTimeout(timer);
      timer = setTimeout(() => flush().catch(() => {}), 900);
    } catch (e) {
      pending.set(record.id, structuredClone(record));
      status("error", e.message + "；未確認儲存。");
    }
  }
  async function drain() {
    let saved = 0;
    while (pending.size) {
      const [id, record] = pending.entries().next().value,
        info = entry(id);
      const result = await request({
        action: "save",
        token: info.token,
        record,
      });
      if (
        result.id !== id ||
        !Number.isFinite(Date.parse(result.savedAt)) ||
        Date.parse(result.savedAt) < Date.parse(record.savedAt)
      )
        throw Error("收集端儲存確認不符合本次探究／版本，未標示成功");
      const all = metadata();
      all[id].acknowledgements[endpoint] = record.savedAt;
      storage.setItem(key, JSON.stringify(all));
      if (pending.get(id)?.savedAt === record.savedAt) pending.delete(id);
      saved++;
    }
    if (saved) {
      confirmed = true;
      status("synced", "已確認儲存：學生紀錄已同步至 VL3 全班雲端紀錄。");
    }
  }
  function flush() {
    clearTimeout(timer);
    if (!enabled || (!running && !pending.size)) return Promise.resolve();
    if (!running)
      running = drain()
        .catch((e) => {
          status(
            "error",
            "同步失敗：" + e.message + "。本機紀錄仍在，可重試。",
          );
          throw e;
        })
        .finally(() => {
          running = null;
        });
    return running;
  }
  function recover() {
    try {
      const local = records(),
        backups = Object.values(metadata())
          .map((info) => info.record)
          .filter(Boolean);
      const merged = new Map();
      for (const r of [...backups, ...local].filter(student)) {
        const before = merged.get(r.id);
        if (!before || Date.parse(r.savedAt) > Date.parse(before.savedAt))
          merged.set(r.id, r);
      }
      for (const r of merged.values()) enqueue(r);
      if (!enabled)
        status(
          "unconfigured",
          "未設定雲端；紀錄保留在本瀏覽器，尚未跨裝置收集。",
        );
      else if (!pending.size && !confirmed)
        status("configured", "已設定雲端，但尚未確認本次連線／保存。");
    } catch (e) {
      status("error", e.message + "；原資料已保留。");
    }
  }
  async function list(password) {
    if (password !== undefined) credential = password;
    if (!enabled) throw Error("未設定 VL3 雲端網址，不能匯出全班紀錄");
    if (!credential) throw Error("請先輸入獨立教師密碼");
    const rows = [],
      seen = new Set();
    let cursor = 0;
    do {
      if (seen.has(cursor)) throw Error("雲端分頁重複，未提供部分全班紀錄");
      seen.add(cursor);
      const page = await request({
        action: "list",
        teacherEmail: "tzechingchan0605@gmail.com",
        password: credential,
        cursor,
      });
      if (
        !Array.isArray(page.records) ||
        !(
          page.nextCursor === null ||
          (Number.isInteger(page.nextCursor) && page.nextCursor > cursor)
        )
      )
        throw Error("雲端分頁不完整");
      if (page.records.some((r) => !student(r) || !validate(r)))
        throw Error("雲端含無效紀錄，請先檢查收集表；未提供部分全班紀錄");
      rows.push(...page.records);
      cursor = page.nextCursor;
    } while (cursor !== null);
    return rows;
  }
  function leave() {
    flush().catch(() => {});
  } // Best effort only; durable backup remains.
  return {
    enabled,
    enqueue,
    flush,
    recover,
    list,
    leave,
    clearCredential() {
      credential = "";
    },
    getPendingCount() {
      return pending.size;
    },
  };
};
