const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("catchup", {
  getApps: () => ipcRenderer.invoke("apps:get"),
  switchApp: (appId) => ipcRenderer.send("app:switch", appId),
  onShellState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("shell:state", handler);
    return () => ipcRenderer.removeListener("shell:state", handler);
  },
  listChats: () => ipcRenderer.invoke("db:listChats"),
  getActiveWaChat: () => ipcRenderer.invoke("whatsapp:getActiveChat"),
  onActiveWaChat: (callback) => {
    const handler = (_event, chat) => callback(chat);
    ipcRenderer.on("whatsapp:activeChat", handler);
    return () => ipcRenderer.removeListener("whatsapp:activeChat", handler);
  },
  setChatSynced: (chatId, synced, meta) =>
    ipcRenderer.invoke("db:setChatSynced", chatId, synced, meta),
  saveChatSidebar: (chatId, opts) =>
    ipcRenderer.invoke("chat:save", chatId, opts),
  getStats: () => ipcRenderer.invoke("db:stats"),
  getPreview: (limit) => ipcRenderer.invoke("db:preview", limit),
  getMcpConfig: () => ipcRenderer.invoke("mcp:configSnippet"),
  getAiSettings: () => ipcRenderer.invoke("ai:getSettings"),
  setAiSettings: (patch) => ipcRenderer.invoke("ai:setSettings", patch),
  setSummaryPrefs: (chatId, patch) =>
    ipcRenderer.invoke("summary:setPrefs", chatId, patch),
  getSummaryBoard: (chatId) => ipcRenderer.invoke("summary:board", chatId),
  runSummaryNow: (chatId) => ipcRenderer.invoke("summary:runNow", chatId),
  /** Clipboard must go through main — sandboxed preload clipboard is unreliable on macOS. */
  copyText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  onDbStats: (callback) => {
    const handler = (_event, stats) => callback(stats);
    ipcRenderer.on("db:stats", handler);
    return () => ipcRenderer.removeListener("db:stats", handler);
  },
  onSummariesUpdated: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("summaries:updated", handler);
    return () => ipcRenderer.removeListener("summaries:updated", handler);
  },
});
