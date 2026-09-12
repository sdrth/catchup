const ICONS = {
  whatsapp: {
    type: "svg",
    paths: [
      "M17.47 14.38c-.28-.14-1.64-.81-1.9-.9-.25-.1-.44-.14-.62.14-.18.27-.71.9-.87 1.08-.16.18-.32.2-.6.07-.28-.14-1.17-.43-2.23-1.37-.82-.73-1.38-1.64-1.54-1.92-.16-.27-.02-.42.12-.55.13-.13.28-.32.42-.48.14-.16.18-.27.28-.45.09-.18.05-.34-.02-.48-.07-.14-.62-1.5-.85-2.05-.22-.53-.45-.46-.62-.47h-.53c-.18 0-.48.07-.73.34-.25.27-.96.94-.96 2.3s.98 2.67 1.12 2.85c.14.18 1.93 2.95 4.67 4.14.65.28 1.16.45 1.56.57.65.21 1.25.18 1.72.11.52-.08 1.64-.67 1.87-1.32.23-.65.23-1.2.16-1.32-.07-.11-.25-.18-.53-.32z",
      "M12.04 2C6.5 2 2 6.5 2 12.05c0 1.77.46 3.45 1.28 4.92L2 22l5.17-1.35A9.98 9.98 0 0 0 12.04 22C17.58 22 22 17.5 22 11.95 22 6.4 17.58 2 12.04 2zm0 18.2a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.07.8.82-2.99-.2-.31A8.18 8.18 0 1 1 12.04 20.2z",
    ],
  },
  summaries: {
    type: "svg",
    paths: [
      "M6 7h12",
      "M6 12h12",
      "M6 17h8",
    ],
    stroke: true,
  },
  settings: {
    type: "svg",
    paths: [
      "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
      "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852 1.02 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    ],
    stroke: true,
  },
};

/** @type {Array<any>} */
let chatsCache = [];
/** @type {null | { command: string, commandAbsolute?: string, claudeDesktop: object, dbPath: string, agentPrompt?: string, skillMarkdown?: string }} */
let mcpCache = null;
/** @type {string | null} */
let selectedSummaryChatId = null;
/** @type {{ id: string, name: string, kind?: string, phone?: string | null } | null} */
let activeWaChat = null;
/** @type {null | 'summaries'} */
let openDrawer = null;
let settingsPageOpen = false;

/**
 * @param {keyof typeof ICONS | string} iconKey
 * @returns {HTMLElement}
 */
function createIconContent(iconKey) {
  const def = ICONS[iconKey];
  if (!def) {
    const span = document.createElement("span");
    span.textContent = "?";
    return span;
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  for (const d of def.paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    if (def.stroke) {
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.8");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
    } else {
      path.setAttribute("fill", "currentColor");
    }
    svg.appendChild(path);
  }
  return svg;
}

/**
 * @param {{ id: string, name: string, icon: string }} appDef
 * @param {boolean} isActive
 */
function createTabButton(appDef, isActive) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `app-tab${isActive ? " is-active" : ""}`;
  button.dataset.appId = appDef.id;
  button.setAttribute("role", "tab");
  button.setAttribute("aria-selected", String(isActive));
  button.setAttribute("aria-controls", "workspace");
  button.title = appDef.name;
  button.setAttribute("aria-label", appDef.name);
  button.tabIndex = isActive ? 0 : -1;

  const activeBar = document.createElement("span");
  activeBar.className = "active-bar";
  activeBar.setAttribute("aria-hidden", "true");

  const icon = document.createElement("span");
  icon.className = `app-icon ${appDef.icon}`;
  icon.appendChild(createIconContent(appDef.icon));

  const caption = document.createElement("span");
  caption.className = "app-caption";
  caption.textContent = appDef.name;
  caption.setAttribute("aria-hidden", "true");

  button.append(activeBar, icon, caption);
  button.addEventListener("click", () => window.catchup.switchApp(appDef.id));
  return button;
}

/**
 * @param {string} activeId
 * @param {{ drawer?: null | 'summaries', settingsOpen?: boolean }} [shell]
 */
function setActive(activeId, shell = {}) {
  if (shell.drawer !== undefined) openDrawer = shell.drawer;
  if (typeof shell.settingsOpen === "boolean") {
    settingsPageOpen = shell.settingsOpen;
  } else {
    settingsPageOpen = activeId === "settings";
  }

  const tabs = [...document.querySelectorAll(".app-tab")];
  for (const tab of tabs) {
    const id = tab.dataset.appId;
    const isActive =
      id === activeId ||
      (openDrawer && id === openDrawer) ||
      (settingsPageOpen && id === "settings") ||
      (!openDrawer && !settingsPageOpen && id === "whatsapp" && activeId === "whatsapp");
    tab.classList.toggle("is-active", Boolean(isActive));
    tab.setAttribute("aria-selected", String(Boolean(isActive)));
    tab.tabIndex = isActive ? 0 : -1;
  }

  const workspace = document.getElementById("workspace");
  const summariesPanel = document.getElementById("summaries-panel");
  const settingsPage = document.getElementById("settings-page");

  workspace?.classList.toggle("is-settings", settingsPageOpen);

  if (summariesPanel) summariesPanel.hidden = openDrawer !== "summaries";
  if (settingsPage) settingsPage.hidden = !settingsPageOpen;

  if (openDrawer === "summaries") refreshSummaries();
  if (settingsPageOpen) {
    void refreshSettingsPage();
  }
}

function applyShellState(state) {
  const drawer = state?.rightDrawer === "summaries" ? state.rightDrawer : null;
  const width = Number(state?.drawerWidth) || 400;
  document.documentElement.style.setProperty("--drawer-width", `${width}px`);
  setActive(state?.activeAppId || "whatsapp", {
    drawer,
    settingsOpen: state?.activeAppId === "settings",
  });
}

function formatChatKind(chat) {
  return chat?.kind === "group" ? "Group" : "Contact";
}

function renderNav(apps, activeId = apps[0]?.id) {
  const nav = document.getElementById("app-nav");
  if (!nav) return;
  nav.replaceChildren();
  for (const appDef of apps) {
    nav.appendChild(createTabButton(appDef, appDef.id === activeId));
  }
}

function onNavKeyDown(event) {
  const nav = document.getElementById("app-nav");
  if (!nav || !nav.contains(event.target)) return;
  const tabs = [...nav.querySelectorAll(".app-tab")];
  if (tabs.length === 0) return;

  const currentIndex = tabs.findIndex((tab) => tab === document.activeElement);
  if (currentIndex < 0) return;

  let nextIndex = currentIndex;
  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    nextIndex = (currentIndex + 1) % tabs.length;
  } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = tabs.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  const next = tabs[nextIndex];
  next.focus();
  window.catchup.switchApp(next.dataset.appId);
}

function renderStats(stats) {
  const el = document.getElementById("settings-stats");
  if (!el) return;
  el.replaceChildren();
  const mem = stats.memory;
  const memLabel =
    mem?.waPrivateMb != null
      ? `mem · WA ${mem.waPrivateMb}MB${
          mem.mainPrivateMb != null ? ` / main ${mem.mainPrivateMb}MB` : ""
        }`
      : null;
  const items = [
    `${stats.allowed} shared`,
    `${stats.messages} messages`,
    memLabel,
  ].filter(Boolean);
  for (const label of items) {
    const chip = document.createElement("span");
    chip.className = "stat-chip";
    chip.textContent = label;
    el.appendChild(chip);
  }
}

function renderPreview(messages) {
  const root = document.getElementById("sync-preview");
  if (!root) return;
  root.replaceChildren();

  if (!messages || messages.length === 0) {
    appendEmpty(
      root,
      "Nothing on this Mac yet. Open Access, allow a chat, then wait for sync.",
    );
    return;
  }

  for (const message of messages) {
    const row = document.createElement("article");
    row.className = "preview-row";

    const top = document.createElement("div");
    top.className = "preview-top";

    const chat = document.createElement("span");
    chat.className = "preview-chat";
    chat.textContent = message.chatName || "Chat";

    const when = document.createElement("time");
    when.className = "preview-time";
    when.textContent = formatTime(message.timestamp);

    top.append(chat, when);

    const meta = document.createElement("div");
    meta.className = "preview-meta";
    meta.textContent = message.fromMe
      ? "You"
      : message.senderName || message.chatName || "Contact";

    const body = document.createElement("p");
    body.className = "preview-body";
    body.textContent = message.body;

    row.append(top, meta, body);
    root.appendChild(row);
  }
}

function formatTime(ts) {
  const n = Number(ts);
  if (!n) return "";
  return new Date(n).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function appendEmpty(root, message) {
  if (!root) return;
  const empty = document.createElement("p");
  empty.className = "chat-empty";
  empty.textContent = message;
  root.appendChild(empty);
}

function renderMcp(mcp) {
  mcpCache = mcp;
  const commandInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("mcp-command")
  );
  if (commandInput) commandInput.value = mcp.command || "";

  const snippet = document.getElementById("mcp-snippet");
  if (snippet) {
    snippet.textContent = JSON.stringify(mcp.claudeDesktop, null, 2);
  }

  const hint = document.getElementById("db-path-hint");
  if (hint) {
    hint.textContent = `Local database: ${mcp.dbPath}`;
  }
}

async function copyText(text, okLabel) {
  const status = document.getElementById("copy-status");
  try {
    await window.catchup.copyText(text);
    if (status) status.textContent = okLabel;
  } catch {
    if (status) {
      status.textContent = "Couldn’t copy — select the text and copy manually.";
    }
  }
}

function bindCopy(buttonId, getText, labels) {
  document.getElementById(buttonId)?.addEventListener("click", () => {
    void (async () => {
      const text = getText();
      if (!text || !String(text).trim()) {
        const status = document.getElementById("copy-status");
        if (status) {
          status.textContent =
            labels.empty ||
            "Nothing to copy yet — open Settings after WhatsApp loads.";
        }
        return;
      }
      await copyText(text, labels.ok);
    })();
  });
}

async function refreshPreview() {
  const messages = await window.catchup.getPreview(40);
  renderPreview(messages);
}

function renderAgentsProof(stats) {
  const countEl = document.getElementById("agents-proof-count");
  const labelEl = document.getElementById("agents-proof-label");
  const hintEl = document.getElementById("agents-proof-hint");
  const n = Number(stats?.allowed) || 0;
  if (countEl) countEl.textContent = String(n);
  if (labelEl) {
    labelEl.textContent =
      n === 1 ? "chat shared with agents" : "chats shared with agents";
  }
  if (hintEl) {
    hintEl.textContent =
      n === 0
        ? "Approve chats under Access while WhatsApp is open."
        : `${Number(stats?.messages) || 0} messages ready for MCP on this Mac.`;
  }
}

async function refreshLocalStore() {
  const [chats, stats, mcp] = await Promise.all([
    window.catchup.listChats(),
    window.catchup.getStats(),
    window.catchup.getMcpConfig(),
  ]);

  chatsCache = chats;
  renderAgentsProof(stats);
  renderStats(stats);
  renderMcp(mcp);
  await refreshPreview();
}

async function refreshSettingsPage() {
  await Promise.all([refreshLocalStore(), refreshAiSettings()]);
}

function matchChatInCache(hint) {
  if (!hint) return null;
  if (hint.id) {
    const byId = chatsCache.find((c) => c.id === hint.id);
    if (byId) return byId;
  }
  const needle = String(hint.name || "")
    .trim()
    .toLowerCase();
  if (!needle) return null;
  return (
    chatsCache.find(
      (c) =>
        String(c.name || "")
          .trim()
          .toLowerCase() === needle,
    ) || null
  );
}

function showSummaryEmpty(message) {
  const empty = document.getElementById("summary-detail-empty");
  const body = document.getElementById("summary-detail-body");
  if (empty) {
    empty.hidden = false;
    const title = empty.querySelector(".empty-guide-title");
    const bodyText = empty.querySelector(".empty-guide-body");
    if (title) {
      title.textContent = message ? "No chat selected" : "Open a WhatsApp chat";
    }
    if (bodyText) {
      bodyText.textContent =
        message ||
        "Pick any conversation on the left. Here you’ll decide whether your AI tools may read it — default is private.";
    }
  }
  if (body) body.hidden = true;
}

function updateShareStatus(shared) {
  const pill = document.getElementById("chat-share-status");
  if (!pill) return;
  pill.textContent = shared ? "Shared" : "Private";
  pill.classList.toggle("is-shared", Boolean(shared));
  pill.classList.toggle("is-private", !shared);
}

function syncSummaryOptionsVisibility() {
  const sum = /** @type {HTMLInputElement | null} */ (
    document.getElementById("summary-enabled")
  );
  const options = document.getElementById("summary-options");
  const actions = document.getElementById("summary-actions");
  const runBtn = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("summary-run")
  );
  const on = Boolean(sum?.checked);
  if (options) options.hidden = !on;
  if (actions) actions.hidden = !on;
  if (runBtn) runBtn.disabled = !on;
  syncModeFields();
}

function coupleChatToggles(changed) {
  const sync = /** @type {HTMLInputElement | null} */ (
    document.getElementById("chat-sync-enabled")
  );
  const sum = /** @type {HTMLInputElement | null} */ (
    document.getElementById("summary-enabled")
  );
  if (!sync || !sum) return;
  if (changed === "summary" && sum.checked) sync.checked = true;
  if (changed === "sync" && !sync.checked) sum.checked = false;
  updateShareStatus(sync.checked);
  syncSummaryOptionsVisibility();
}

/** Instant apply for Access toggles (core consent job). */
async function onConsentToggle(changed) {
  coupleChatToggles(changed);
  await saveSummaryPrefs({ quiet: false, reason: "toggle" });
}

async function followActiveWaChat() {
  if (openDrawer !== "summaries") return;

  if (!activeWaChat?.id && !activeWaChat?.name) {
    selectedSummaryChatId = null;
    showSummaryEmpty();
    return;
  }

  chatsCache = await window.catchup.listChats();
  let match = matchChatInCache(activeWaChat);
  if (!match && activeWaChat?.id) {
    // Fresh upsert may not be in cache shape yet — synthesize a row.
    match = {
      id: activeWaChat.id,
      name: activeWaChat.name || activeWaChat.id,
      kind: activeWaChat.kind || "contact",
      phone: activeWaChat.phone || null,
      allowed: false,
      summaryEnabled: false,
      summaryMode: "messages",
      summaryIntervalMinutes: 60,
      summaryMessageThreshold: 20,
      summaryMaxTokens: 512,
      summaryExtraPrompt: "",
      messageCount: 0,
      summaryCount: 0,
    };
    chatsCache = [match, ...chatsCache.filter((c) => c.id !== match.id)];
  }

  if (!match) {
    selectedSummaryChatId = null;
    showSummaryEmpty();
    return;
  }

  const changed = selectedSummaryChatId !== match.id;
  selectedSummaryChatId = match.id;
  await loadSummaryDetail(match.id);
  if (changed) {
    const status = document.getElementById("summary-status");
    if (status) status.textContent = "";
  }
}

function syncModeFields() {
  const mode =
    /** @type {HTMLInputElement | null} */ (
      document.querySelector('input[name="summary-mode"]:checked')
    )?.value || "messages";
  const msgFields = document.getElementById("summary-messages-fields");
  const timeFields = document.getElementById("summary-time-fields");
  if (msgFields) msgFields.hidden = mode !== "messages";
  if (timeFields) timeFields.hidden = mode !== "time";
}

/** Summarize implies Sync; Sync off turns Summarize off. */
function readChatToggleState() {
  const sync = /** @type {HTMLInputElement | null} */ (
    document.getElementById("chat-sync-enabled")
  );
  const sum = /** @type {HTMLInputElement | null} */ (
    document.getElementById("summary-enabled")
  );
  let summarizeOn = Boolean(sum?.checked);
  let syncOn = Boolean(sync?.checked) || summarizeOn;
  if (summarizeOn && sync && !sync.checked) sync.checked = true;
  if (!syncOn && sum?.checked) {
    sum.checked = false;
    summarizeOn = false;
  }
  return { syncOn, summarizeOn };
}

/**
 * @param {string} chatId
 */
async function loadSummaryDetail(chatId) {
  const empty = document.getElementById("summary-detail-empty");
  const body = document.getElementById("summary-detail-body");
  const chat = chatsCache.find((c) => c.id === chatId);
  if (!chat) {
    if (empty) empty.hidden = false;
    if (body) body.hidden = true;
    return;
  }
  if (empty) empty.hidden = true;
  if (body) body.hidden = false;

  const title = document.getElementById("summary-chat-title");
  const meta = document.getElementById("summary-chat-meta");
  if (title) title.textContent = chat.name;
  if (meta) {
    const count = Number(chat.messageCount) || 0;
    meta.textContent =
      count > 0
        ? `${formatChatKind(chat)} · ${count} messages on this Mac`
        : `${formatChatKind(chat)} · keep the chat open to sync`;
  }

  const syncEnabled = /** @type {HTMLInputElement | null} */ (
    document.getElementById("chat-sync-enabled")
  );
  if (syncEnabled) syncEnabled.checked = Boolean(chat.allowed);

  const enabled = /** @type {HTMLInputElement | null} */ (
    document.getElementById("summary-enabled")
  );
  if (enabled) enabled.checked = Boolean(chat.summaryEnabled);

  updateShareStatus(Boolean(chat.allowed));
  syncSummaryOptionsVisibility();

  document.querySelectorAll('input[name="summary-mode"]').forEach((input) => {
    const el = /** @type {HTMLInputElement} */ (input);
    el.checked = el.value === (chat.summaryMode || "messages");
  });
  syncModeFields();

  const threshold = /** @type {HTMLInputElement | null} */ (
    document.getElementById("summary-threshold")
  );
  if (threshold) threshold.value = String(chat.summaryMessageThreshold || 20);
  const interval = /** @type {HTMLInputElement | null} */ (
    document.getElementById("summary-interval")
  );
  if (interval) interval.value = String(chat.summaryIntervalMinutes || 60);
  const maxTokens = /** @type {HTMLInputElement | null} */ (
    document.getElementById("summary-max-tokens")
  );
  if (maxTokens) maxTokens.value = String(chat.summaryMaxTokens || 512);
  const extra = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById("summary-extra-prompt")
  );
  if (extra) extra.value = chat.summaryExtraPrompt || "";

  const board = await window.catchup.getSummaryBoard(chatId);
  renderSummaryCards(board);
}

function renderSummaryCards(board) {
  const root = document.getElementById("summary-cards");
  if (!root) return;
  root.replaceChildren();

  if (!board?.latest) {
    appendEmpty(
      root,
      "No notes yet. Turn on catch-up summaries, save the schedule, then Summarize now.",
    );
    return;
  }

  const cards = [board.latest, ...(board.previous || [])];
  cards.forEach((summary, index) => {
    const article = document.createElement("article");
    article.className = `summary-card${index === 0 ? " is-latest" : " is-collapsed"}`;

    const head = document.createElement("button");
    head.type = "button";
    head.className = "summary-card-head";
    const title = document.createElement("span");
    title.className = "summary-card-title";
    title.textContent = index === 0 ? "Latest summary" : "Earlier summary";
    const meta = document.createElement("span");
    meta.className = "summary-card-meta";
    meta.textContent = `${formatTime(summary.createdAt)} · ${
      summary.messageCount || 0
    } msgs`;
    head.append(title, meta);
    head.addEventListener("click", () => {
      article.classList.toggle("is-collapsed");
    });

    const body = document.createElement("div");
    body.className = "summary-card-body";
    body.textContent = summary.body;

    article.append(head, body);
    root.appendChild(article);
  });
}

async function refreshSummaries() {
  chatsCache = await window.catchup.listChats();
  activeWaChat =
    (await window.catchup.getActiveWaChat?.()) || activeWaChat || null;
  await followActiveWaChat();
}

/**
 * @param {{ quiet?: boolean, reason?: 'toggle' | 'schedule' | 'run' }} [opts]
 */
async function saveSummaryPrefs(opts = {}) {
  if (!selectedSummaryChatId) return;
  const status = document.getElementById("summary-status");
  const { syncOn, summarizeOn } = readChatToggleState();
  const mode =
    /** @type {HTMLInputElement | null} */ (
      document.querySelector('input[name="summary-mode"]:checked')
    )?.value || "messages";
  const threshold = Number(
    /** @type {HTMLInputElement | null} */ (
      document.getElementById("summary-threshold")
    )?.value || 20,
  );
  const interval = Number(
    /** @type {HTMLInputElement | null} */ (
      document.getElementById("summary-interval")
    )?.value || 60,
  );
  const maxTokens = Number(
    /** @type {HTMLInputElement | null} */ (
      document.getElementById("summary-max-tokens")
    )?.value || 512,
  );
  const extra =
    /** @type {HTMLTextAreaElement | null} */ (
      document.getElementById("summary-extra-prompt")
    )?.value || "";

  const chat =
    chatsCache.find((c) => c.id === selectedSummaryChatId) || activeWaChat;

  try {
    const row = await window.catchup.saveChatSidebar(selectedSummaryChatId, {
      synced: syncOn,
      summary: {
        enabled: summarizeOn,
        mode,
        messageThreshold: threshold,
        intervalMinutes: interval,
        maxTokens,
        extraPrompt: extra,
      },
      meta: {
        name: chat?.name || selectedSummaryChatId,
        kind: chat?.kind || "contact",
        phone: chat?.phone ?? null,
      },
    });

    if (row) {
      const idx = chatsCache.findIndex((c) => c.id === row.id);
      if (idx >= 0) chatsCache[idx] = { ...chatsCache[idx], ...row };
      else chatsCache.unshift(row);
    }

    if (status && !opts.quiet) {
      if (opts.reason === "schedule") {
        status.textContent = summarizeOn
          ? "Schedule saved."
          : "Saved.";
      } else if (summarizeOn) {
        status.textContent = "Shared · catch-up summaries on.";
      } else if (syncOn) {
        status.textContent =
          "Shared with agents — keep the chat open while messages sync.";
      } else {
        status.textContent =
          "Private again — local messages and notes for this chat were cleared.";
      }
    }
    await loadSummaryDetail(selectedSummaryChatId);
  } catch (error) {
    if (status) status.textContent = String(error?.message || error);
  }
}

async function runSummaryNow() {
  if (!selectedSummaryChatId) return;
  const status = document.getElementById("summary-status");
  const button = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("summary-run")
  );
  if (button) button.disabled = true;
  if (status) status.textContent = "Generating summary…";
  try {
    await saveSummaryPrefs();
    const result = await window.catchup.runSummaryNow(selectedSummaryChatId);
    if (result?.skipped) {
      if (status) {
        status.textContent =
          result.reason === "no_new_messages"
            ? "No new messages since the last summary."
            : `Skipped (${result.reason}).`;
      }
    } else if (status) {
      status.textContent = "Summary ready.";
    }
    await loadSummaryDetail(selectedSummaryChatId);
    chatsCache = await window.catchup.listChats();
  } catch (error) {
    if (status) status.textContent = String(error?.message || error);
  } finally {
    if (button) button.disabled = false;
  }
}

async function refreshAiSettings() {
  const settings = await window.catchup.getAiSettings();
  const keyHint = document.getElementById("ai-key-hint");
  if (keyHint) {
    keyHint.textContent = settings.apiKeySet
      ? "API key is saved on this Mac."
      : "No key saved yet — create one in the Vercel AI Gateway dashboard.";
  }
  const keyInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("ai-api-key")
  );
  if (keyInput) keyInput.value = "";
  const base = /** @type {HTMLInputElement | null} */ (
    document.getElementById("ai-base-url")
  );
  if (base) base.value = settings.baseUrl || "https://ai-gateway.vercel.sh/v1";
  const model = /** @type {HTMLInputElement | null} */ (
    document.getElementById("ai-model")
  );
  if (model) model.value = settings.model || "";
  const zdr = /** @type {HTMLInputElement | null} */ (
    document.getElementById("ai-zdr")
  );
  if (zdr) zdr.checked = settings.zeroDataRetention !== false;
  const prompt = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById("ai-system-prompt")
  );
  if (prompt) prompt.value = settings.systemPrompt || "";
}

async function saveAiSettings() {
  const status = document.getElementById("ai-save-status");
  const apiKey =
    /** @type {HTMLInputElement | null} */ (document.getElementById("ai-api-key"))
      ?.value || "";
  const baseUrl =
    /** @type {HTMLInputElement | null} */ (
      document.getElementById("ai-base-url")
    )?.value || "";
  const model =
    /** @type {HTMLInputElement | null} */ (document.getElementById("ai-model"))
      ?.value || "";
  const zeroDataRetention = /** @type {HTMLInputElement | null} */ (
    document.getElementById("ai-zdr")
  )?.checked;
  const systemPrompt =
    /** @type {HTMLTextAreaElement | null} */ (
      document.getElementById("ai-system-prompt")
    )?.value || "";

  try {
    /** @type {Record<string, unknown>} */
    const patch = {
      baseUrl,
      model,
      zeroDataRetention: Boolean(zeroDataRetention),
      systemPrompt,
    };
    if (apiKey.trim()) patch.apiKey = apiKey.trim();
    await window.catchup.setAiSettings(patch);
    if (status) status.textContent = "Settings saved.";
    await refreshAiSettings();
  } catch (error) {
    if (status) status.textContent = String(error?.message || error);
  }
}

async function init() {
  const apps = await window.catchup.getApps();
  renderNav(apps);

  document.getElementById("app-nav")?.addEventListener("keydown", onNavKeyDown);
  document
    .getElementById("refresh-preview")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void refreshPreview();
    });
  document.getElementById("close-summaries")?.addEventListener("click", () => {
    window.catchup.switchApp("summaries");
  });
  document
    .querySelectorAll('input[name="summary-mode"]')
    .forEach((el) => el.addEventListener("change", syncModeFields));
  document.getElementById("summary-enabled")?.addEventListener("change", () => {
    void onConsentToggle("summary");
  });
  document
    .getElementById("chat-sync-enabled")
    ?.addEventListener("change", () => {
      void onConsentToggle("sync");
    });
  document.getElementById("summary-save")?.addEventListener("click", () => {
    void saveSummaryPrefs({ reason: "schedule" });
  });
  document
    .getElementById("summary-run")
    ?.addEventListener("click", () => void runSummaryNow());
  document
    .getElementById("save-ai-settings")
    ?.addEventListener("click", () => void saveAiSettings());
  document.getElementById("ai-gateway-docs")?.addEventListener("click", (e) => {
    e.preventDefault();
    void window.catchup.openExternal("https://vercel.com/docs/ai-gateway");
  });

  bindCopy(
    "copy-mcp-command",
    () =>
      mcpCache?.commandAbsolute ||
      mcpCache?.command ||
      /** @type {HTMLInputElement | null} */ (
        document.getElementById("mcp-command")
      )?.value ||
      "",
    { ok: "MCP command copied — paste it into your agent config." },
  );
  bindCopy(
    "copy-mcp-json",
    () => JSON.stringify(mcpCache?.claudeDesktop || {}, null, 2),
    { ok: "MCP JSON copied." },
  );
  bindCopy("copy-agent-prompt", () => mcpCache?.agentPrompt || "", {
    ok: "Agent prompt copied — paste into Claude, Codex, or Cursor.",
    empty: "Agent prompt not found.",
  });
  bindCopy("copy-agent-skill", () => mcpCache?.skillMarkdown || "", {
    ok: "Skill copied — save as skills/catchup/SKILL.md for your agent.",
    empty: "Skill file not found.",
  });

  window.catchup.onShellState?.((state) => applyShellState(state));
  window.catchup.onActiveWaChat?.((chat) => {
    activeWaChat = chat || null;
    void followActiveWaChat();
  });
  window.catchup.onSummariesUpdated?.((payload) => {
    if (openDrawer !== "summaries") return;
    const chatIds = payload?.chatIds || [];
    if (
      selectedSummaryChatId &&
      (chatIds.length === 0 || chatIds.includes(selectedSummaryChatId))
    ) {
      void loadSummaryDetail(selectedSummaryChatId);
    }
  });
  window.catchup.onDbStats((stats) => {
    renderAgentsProof(stats);
    renderStats(stats);
    if (!settingsPageOpen) return;
    window.catchup.listChats().then((chats) => {
      chatsCache = chats;
      void refreshPreview();
    });
  });

  await refreshLocalStore();
  await refreshAiSettings();
}

init();
