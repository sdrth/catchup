const {
  app,
  BrowserWindow,
  BrowserView,
  clipboard,
  ipcMain,
  nativeImage,
  session,
  shell,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { apps } = require("./apps");
const {
  applyBrowserFingerprint,
  getBrowserFingerprint,
  initBrowserFingerprint,
} = require("./browser-fingerprint");
const {
  upsertChats,
  upsertMessages,
  listChats,
  setChatSynced,
  saveChatSidebar,
  resolveSyncedChat,
  getAllowlistPolicy,
  consumeRateLimit,
  checkRateLimit,
  getStats,
  getRecentMessages,
  getDbPath,
  redactHomePath,
  setMeta,
  getAiSettings,
  setAiSettings,
  setSummaryPrefs,
  getSummaryBoard,
  getEarlierSummaries,
  resolveCatalogChat,
  getDrawerWidth,
  setDrawerWidth,
  clampDrawerWidth,
  closeDb,
} = require("./db/store");
const { attachWhatsAppCapture } = require("./whatsapp/capture");
const { runSummaryForChat, tickSummaries } = require("./ai/summarize");

const SIDEBAR_WIDTH = 84;
const APP_NAME = "Catchup";
const APP_ICON_PNG = path.join(__dirname, "..", "build", "icon.png");

// Must run before ready so the macOS menu bar / About name is Catchup, not Electron.
app.setName(APP_NAME);
if (process.platform === "darwin") {
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
  });
}

// Cap Chromium renderer heaps before app ready (behavioral fixes do the rest).
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=1024");
app.commandLine.appendSwitch("disk-cache-size", "33554432");
app.commandLine.appendSwitch("disable-http-cache");
if (process.platform === "darwin") {
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
}
// Keep GPU on — disableHardwareAcceleration caused SharedImageManager spam and
// did not reduce WhatsApp Web heap (the real multi‑GB culprit was Store scans).

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** @type {Map<string, BrowserView>} */
const views = new Map();

/** @type {{ forceSnapshot?: () => void } | null} */
let whatsappCapture = null;

/** @type {string} */
let activeAppId = apps[0]?.id ?? "";

/** @type {null | 'summaries'} */
let rightDrawer = null;

/** @type {number} user-resizable width of the right-hand Access drawer. */
let drawerWidth = getDrawerWidth();

/** @type {{ id: string, name: string, kind: string, phone: string | null } | null} */
let activeWaChat = null;

/** @type {ReturnType<typeof setInterval> | null} */
let summaryTimer = null;
/** @type {boolean} */
let summaryTickBusy = false;

function getWhatsAppView() {
  return views.get("whatsapp") || null;
}

function getContentBounds() {
  const [width, height] = mainWindow.getContentSize();
  const rightGap = rightDrawer ? drawerWidth : 0;
  return {
    x: SIDEBAR_WIDTH,
    y: 0,
    width: Math.max(0, width - SIDEBAR_WIDTH - rightGap),
    height,
  };
}

function emitShellState() {
  if (!mainWindow) return;
  mainWindow.webContents.send("shell:state", {
    activeAppId,
    rightDrawer,
    drawerWidth,
  });
}

function layoutActiveView() {
  if (!mainWindow) return;

  // Settings is a full-page shell view — hide WhatsApp BrowserView.
  if (activeAppId === "settings") {
    if (mainWindow.getBrowserView()) {
      mainWindow.setBrowserView(null);
    }
    return;
  }

  const view = getWhatsAppView();
  if (!view) {
    if (mainWindow.getBrowserView()) {
      mainWindow.setBrowserView(null);
    }
    return;
  }
  if (mainWindow.getBrowserView() !== view) {
    mainWindow.setBrowserView(view);
  }
  view.setBounds(getContentBounds());
}

function publishActiveWaChat(chat) {
  if (!chat?.id && !chat?.name) {
    if (activeWaChat) {
      activeWaChat = null;
      mainWindow?.webContents.send("whatsapp:activeChat", null);
    }
    return;
  }

  try {
    upsertChats([chat]);
  } catch {
    // catalog upsert is best-effort for open-chat follow
  }

  const resolved = resolveCatalogChat(chat);
  if (!resolved?.id) return;
  if (
    activeWaChat?.id === resolved.id &&
    activeWaChat?.name === resolved.name
  ) {
    return;
  }
  activeWaChat = resolved;
  mainWindow?.webContents.send("whatsapp:activeChat", resolved);
}

function pushCapturePolicy() {
  const policy = getAllowlistPolicy();
  whatsappCapture?.setPolicy?.(policy);
}

function requestWhatsAppSnapshot() {
  const snapGate = consumeRateLimit("force_snapshot", {
    max: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!snapGate.allowed) {
    console.warn("[catchup] sync cooldown — try again later (rate limit)");
    return;
  }

  const deepGate = checkRateLimit("deep_load", {
    max: 6,
    windowMs: 60 * 60 * 1000,
  });
  const allowDeep = deepGate.allowed;
  if (allowDeep) {
    consumeRateLimit("deep_load", { max: 6, windowMs: 60 * 60 * 1000 });
  }

  pushCapturePolicy();
  if (whatsappCapture?.forceSnapshot) {
    whatsappCapture.forceSnapshot({ deep: allowDeep });
    return;
  }
  const view = getWhatsAppView();
  if (!view || view.webContents.isDestroyed()) return;
  view.webContents
    .executeJavaScript(
      `typeof window.__catchupForceSnapshot === "function" && window.__catchupForceSnapshot(${allowDeep ? "true" : "false"}); true;`,
      true,
    )
    .catch(() => {});
}

/**
 * Strip phone numbers / WA user ids from terminal logs.
 * @param {unknown} value
 * @returns {string}
 */
function redactForLog(value) {
  const text = String(value ?? "");
  return text
    .replace(/\+?\d[\d\s()-]{6,}\d/g, "[phone]")
    .replace(/\b\d{6,15}@(?:c\.us|lid)\b/gi, "[id]")
    .replace(/\bdom_\d+\b/g, "[chat]")
    .replace(/\/Users\/[^/\s]+/g, "/Users/[user]")
    .replace(/\/home\/[^/\s]+/g, "/home/[user]");
}

/** @type {number} */
let lastSkipLogAt = 0;

/**
 * @param {{ id?: string, name?: string, kind?: string, phone?: string | null } | null | undefined} chat
 * @param {unknown} messages
 */
function ingestSyncedMessages(chat, messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  const resolved = resolveSyncedChat(chat);
  if (!resolved) {
    // Common while browsing chats that are not allowlisted — stay quiet.
    // Log at most once per 10 minutes only if inject sent bodies (policy drift).
    const now = Date.now();
    if (now - lastSkipLogAt > 600_000) {
      lastSkipLogAt = now;
      console.warn(
        "[catchup] dropped message batch — open chat is not on the sync list",
      );
    }
    return false;
  }
  upsertMessages(
    resolved.id,
    resolved.name,
    resolved.kind,
    messages,
    resolved.phone,
  );
  return true;
}

/**
 * @param {import("./apps").CatchupApp} appDef
 */
function createAppView(appDef) {
  if (appDef.kind !== "webview" || !appDef.url) return null;

  const partition = `persist:catchup-${appDef.id}`;
  const ses = session.fromPartition(partition);
  const { userAgent } = applyBrowserFingerprint(ses);

  // Drop HTTP disk/memory cache for this partition (keeps login IndexedDB).
  ses.clearCache().catch(() => {});
  try {
    ses.clearStorageData({
      storages: ["shadercache", "cachestorage"],
    }).catch(() => {});
  } catch {
    // older Electron
  }

  const view = new BrowserView({
    webPreferences: {
      session: ses,
      preload:
        appDef.id === "whatsapp"
          ? path.join(__dirname, "whatsapp", "preload.js")
          : undefined,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: true,
      v8CacheOptions: "none",
      offscreen: false,
    },
  });

  // Trim compositor work when the WhatsApp view is not focused.
  view.webContents.setBackgroundThrottling(true);

  view.setAutoResize({
    width: false,
    height: false,
    horizontal: false,
    vertical: false,
  });

  view.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        shell.openExternal(url);
      }
    } catch {
      // ignore invalid URLs
    }
    return { action: "deny" };
  });

  view.webContents.session.setPermissionRequestHandler(
    (_wc, permission, callback) => {
      const allowed = new Set([
        "notifications",
        "media",
        "mediaKeySystem",
        "pointerLock",
        "clipboard-read",
        "clipboard-sanitized-write",
      ]);
      callback(allowed.has(permission));
    },
  );

  if (appDef.id === "whatsapp") {
    whatsappCapture = attachWhatsAppCapture(view.webContents);
    view.webContents.on("did-finish-load", () => {
      pushCapturePolicy();
    });
  }

  view.webContents.loadURL(appDef.url, {
    userAgent,
  });

  views.set(appDef.id, view);
  return view;
}

/**
 * @param {string} appId
 */
function switchApp(appId) {
  if (!mainWindow) return;
  const appDef = apps.find((item) => item.id === appId);
  if (!appDef) return;

  if (appDef.kind === "drawer") {
    const drawerId = /** @type {'summaries'} */ (appDef.id);
    if (rightDrawer === drawerId) {
      rightDrawer = null;
      activeAppId = "whatsapp";
    } else {
      rightDrawer = drawerId;
      activeAppId = drawerId;
      if (drawerId === "summaries") {
        requestWhatsAppSnapshot();
      }
    }
    layoutActiveView();
    emitShellState();
    return;
  }

  if (appDef.kind === "page") {
    rightDrawer = null;
    activeAppId = appDef.id;
    layoutActiveView();
    emitShellState();
    return;
  }

  // WhatsApp (or other webview)
  rightDrawer = null;
  activeAppId = appId;
  layoutActiveView();
  emitShellState();
}

function createWindow() {
  const { userAgent } = getBrowserFingerprint();
  app.userAgentFallback = userAgent;

  // Opaque window: transparent + vibrancy maps a full GPU surface and often
  // inflates Activity Monitor "Memory" into multi‑GB on macOS.
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: "#0c1317",
    title: APP_NAME,
    icon: fs.existsSync(APP_ICON_PNG) ? APP_ICON_PNG : undefined,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition:
      process.platform === "darwin" ? { x: 18, y: 20 } : undefined,
    transparent: false,
    roundedCorners: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  for (const appDef of apps) {
    createAppView(appDef);
  }

  mainWindow.webContents.once("did-finish-load", () => {
    switchApp(activeAppId || "whatsapp");
    emitShellState();
  });

  mainWindow.on("resize", () => {
    layoutActiveView();
  });

  mainWindow.once("closed", () => {
    for (const view of views.values()) {
      try {
        if (!view.webContents.isDestroyed()) {
          view.webContents.close();
        }
      } catch {
        // ignore
      }
    }
    views.clear();
    whatsappCapture = null;
    rightDrawer = null;
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await initBrowserFingerprint();

  // dock.setIcon() expects a bitmap (PNG); .icns is for packaged .app bundles only.
  if (process.platform === "darwin" && app.dock && fs.existsSync(APP_ICON_PNG)) {
    try {
      const dockIcon = nativeImage.createFromPath(APP_ICON_PNG);
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon);
      }
    } catch (error) {
      console.warn("[catchup] dock icon failed", error);
    }
  }

  createWindow();

  if (!summaryTimer) {
    summaryTimer = setInterval(() => {
      if (summaryTickBusy) return;
      summaryTickBusy = true;
      tickSummaries()
        .then((results) => {
          if (!results.length || !mainWindow) return;
          mainWindow.webContents.send("summaries:updated", {
            results,
            chatIds: results
              .map((r) => r.summary?.chatId || r.chatId)
              .filter(Boolean),
          });
        })
        .catch((error) => {
          console.warn(
            "[catchup] summary tick",
            redactForLog(error?.message || error),
          );
        })
        .finally(() => {
          summaryTickBusy = false;
        });
    }, 45_000);
  }

  // Register once — nesting inside whenReady is fine, but guard against duplicates
  // if the ready handler is ever re-entered in tests/hot reload.
  if (!app.listenerCount("activate")) {
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        layoutActiveView();
      }
    });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (summaryTimer) {
    clearInterval(summaryTimer);
    summaryTimer = null;
  }
  closeDb();
});

ipcMain.handle("apps:get", () => apps);

ipcMain.on("app:switch", (_event, appId) => {
  if (typeof appId === "string") {
    switchApp(appId);
  }
});

// Live feedback while dragging the drawer's resize handle — resizes the
// WhatsApp BrowserView in step, but doesn't hit the database on every move.
ipcMain.on("shell:dragDrawerWidth", (_event, width) => {
  drawerWidth = clampDrawerWidth(width);
  layoutActiveView();
});

// Drag end — persist the final width so it's restored on next launch.
ipcMain.handle("shell:setDrawerWidth", (_event, width) => {
  drawerWidth = setDrawerWidth(width);
  layoutActiveView();
  emitShellState();
  return drawerWidth;
});

ipcMain.on("whatsapp:snapshot", (_event, envelope) => {
  if (!envelope || envelope.source !== "catchup-whatsapp") return;

  if (envelope.type === "error") {
    console.warn(
      "[catchup] whatsapp inject:",
      redactForLog(envelope.payload?.message),
    );
    return;
  }

  if (envelope.type === "status") {
    if (envelope.payload?.mode) {
      setMeta("whatsapp_sync_mode", envelope.payload.mode);
    }
    if (envelope.payload?.path) {
      setMeta("whatsapp_sync_path", String(envelope.payload.path));
    }
    if (envelope.payload?.waVersion) {
      setMeta("whatsapp_web_version", String(envelope.payload.waVersion));
    }
    return;
  }

  try {
    if (envelope.type === "activeChat") {
      publishActiveWaChat(envelope.payload?.chat || null);
      return;
    }

    if (envelope.type === "messages") {
      const payload = envelope.payload || {};
      if (ingestSyncedMessages(payload.chat, payload.messages)) {
        mainWindow?.webContents.send("db:stats", getStats());
      }
      return;
    }

    if (envelope.type !== "snapshot") return;

    const payload = envelope.payload || {};
    if (payload.mode) {
      setMeta("whatsapp_sync_mode", payload.mode);
    }
    if (payload.path) {
      setMeta("whatsapp_sync_path", String(payload.path));
    }
    if (payload.debug?.waVersion) {
      setMeta("whatsapp_web_version", String(payload.debug.waVersion));
    }

    // Always discover chat catalog so the user can pick what to sync.
    // Message bodies are never stored unless the chat is on the allowlist.
    if (Array.isArray(payload.chats) && payload.chats.length > 0) {
      const catalogGate = consumeRateLimit("catalog_upsert", {
        max: 40,
        windowMs: 60 * 60 * 1000,
      });
      if (catalogGate.allowed) {
        upsertChats(payload.chats);
      }
    }

    if (payload.active?.chat) {
      publishActiveWaChat(payload.active.chat);
    }

    ingestSyncedMessages(payload.active?.chat, payload.active?.messages);

    if (Array.isArray(payload.warm)) {
      for (const entry of payload.warm) {
        ingestSyncedMessages(entry?.chat, entry?.messages);
      }
    }

    mainWindow?.webContents.send("db:stats", getStats());
  } catch (error) {
    console.error("[catchup] db upsert failed", error);
  }
});

function afterAllowlistChange({ pullSnapshot = false } = {}) {
  if (pullSnapshot) {
    requestWhatsAppSnapshot();
  } else {
    pushCapturePolicy();
  }
  mainWindow?.webContents.send("db:stats", getStats());
}

ipcMain.handle("db:listChats", () => listChats());
ipcMain.handle("whatsapp:getActiveChat", () => activeWaChat);
ipcMain.handle("chat:save", (_event, chatId, opts) => {
  if (typeof chatId !== "string" || !opts || typeof opts !== "object") {
    return null;
  }
  const row = saveChatSidebar(chatId, opts);
  afterAllowlistChange({ pullSnapshot: Boolean(opts.synced || opts.summary?.enabled) });
  return row;
});
ipcMain.handle("db:setChatSynced", (_event, chatId, synced, meta) => {
  if (typeof chatId !== "string") return null;
  const row = setChatSynced(chatId, Boolean(synced), meta);
  afterAllowlistChange({ pullSnapshot: Boolean(synced) });
  return row;
});
ipcMain.handle("ai:getSettings", () => getAiSettings());
ipcMain.handle("ai:setSettings", (_event, patch) => {
  if (!patch || typeof patch !== "object") return getAiSettings();
  return setAiSettings(patch);
});
ipcMain.handle("summary:setPrefs", (_event, chatId, patch) => {
  if (typeof chatId !== "string" || !patch || typeof patch !== "object") {
    return null;
  }
  const row = setSummaryPrefs(chatId, patch);
  afterAllowlistChange({ pullSnapshot: false });
  return row;
});
ipcMain.handle("summary:board", (_event, chatId) => {
  if (typeof chatId !== "string") {
    return { chatId: "", latest: null, previous: [], hasMore: false };
  }
  return getSummaryBoard(chatId);
});
ipcMain.handle("summary:earlier", (_event, chatId, opts) => {
  if (typeof chatId !== "string") return { items: [], hasMore: false };
  return getEarlierSummaries(chatId, opts || {});
});
ipcMain.handle("summary:runNow", async (_event, chatId) => {
  if (typeof chatId !== "string") throw new Error("chatId required");
  // Caller refreshes UI from the invoke result — do not also emit.
  return runSummaryForChat(chatId, { force: true });
});
async function collectMemoryStats() {
  /** @type {Record<string, number>} */
  const out = {};
  try {
    const mainMem = await process.getProcessMemoryInfo();
    out.mainPrivateMb = Math.round((mainMem.private || 0) / 1024);
    out.mainResidentMb = Math.round((mainMem.residentSet || 0) / 1024);
  } catch {
    // ignore
  }
  try {
    const wa = getWhatsAppView();
    if (wa && !wa.webContents.isDestroyed()) {
      const waMem = await wa.webContents.getProcessMemoryInfo();
      out.waPrivateMb = Math.round((waMem.private || 0) / 1024);
      out.waResidentMb = Math.round((waMem.residentSet || 0) / 1024);
    }
  } catch {
    // ignore
  }
  try {
    if (mainWindow && !mainWindow.webContents.isDestroyed()) {
      const uiMem = await mainWindow.webContents.getProcessMemoryInfo();
      out.uiPrivateMb = Math.round((uiMem.private || 0) / 1024);
    }
  } catch {
    // ignore
  }
  return out;
}

ipcMain.handle("db:stats", async () => {
  const stats = getStats();
  const memory = await collectMemoryStats();
  return { ...stats, memory };
});
ipcMain.handle("db:preview", (_event, limit) =>
  getRecentMessages({ limit: Number(limit) || 40 }),
);
ipcMain.handle("shell:openExternal", async (_event, url) => {
  const value = String(url || "");
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false };
    }
    await shell.openExternal(parsed.toString());
    return { ok: true };
  } catch {
    return { ok: false };
  }
});
ipcMain.handle("clipboard:writeText", (_event, text) => {
  const value = String(text ?? "");
  clipboard.writeText(value);
  return { ok: true, length: value.length };
});

ipcMain.handle("mcp:configSnippet", () => {
  const serverPath = path.join(__dirname, "mcp", "server.mjs");
  const skillDir = path.join(__dirname, "..", "skills", "catchup");
  const command = `node "${serverPath}"`;

  function readText(filePath) {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch {
      return "";
    }
  }

  const skillMarkdown = readText(path.join(skillDir, "SKILL.md"));
  const agentPromptTemplate = readText(path.join(skillDir, "PROMPT.md")).trim();
  const agentPrompt = agentPromptTemplate
    .replaceAll("{{CATCHUP_MCP_COMMAND}}", command)
    .replaceAll("{{CATCHUP_MCP_SERVER_PATH}}", serverPath);

  // Absolute paths are required for a working MCP launch; UI shows redacted copies.
  return {
    dbPath: redactHomePath(getDbPath()),
    serverPath: redactHomePath(serverPath),
    skillPath: redactHomePath(path.join(skillDir, "SKILL.md")),
    command: `node "${redactHomePath(serverPath)}"`,
    commandAbsolute: command,
    skillMarkdown,
    agentPrompt,
    claudeDesktop: {
      mcpServers: {
        catchup: {
          command: "node",
          args: [serverPath],
        },
      },
    },
  };
});
