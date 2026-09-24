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
      "M12 3.5l7 2.8v5.2c0 4.3-2.9 7.9-7 9-4.1-1.1-7-4.7-7-9V6.3l7-2.8z",
      "M9 12.2l2.1 2.1 4-4.1",
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

function cssVarPx(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Drag the Access drawer's left edge to resize it; persists on release. */
function bindDrawerResize() {
  const handle = document.getElementById("drawer-resize-handle");
  if (!handle) return;

  let dragging = false;
  let startX = 0;
  let startWidth = 400;
  let dragFrame = null;
  let pendingWidth = null;

  function clampWidth(width) {
    // Leave room for the sidebar + a usable minimum of WhatsApp itself.
    const maxByWindow = window.innerWidth - cssVarPx("--sidebar-width", 84) - 320;
    const max = Math.min(900, Math.max(320, maxByWindow));
    return Math.min(max, Math.max(320, Math.round(width)));
  }

  function applyWidth(width) {
    document.documentElement.style.setProperty("--drawer-width", `${width}px`);
  }

  function flushDrag() {
    dragFrame = null;
    if (pendingWidth == null) return;
    window.catchup.dragDrawerWidth?.(pendingWidth);
    pendingWidth = null;
  }

  function onPointerMove(event) {
    if (!dragging) return;
    // Panel is right-anchored — moving the handle left grows the width.
    const width = clampWidth(startWidth + (startX - event.clientX));
    applyWidth(width);
    pendingWidth = width;
    if (dragFrame == null) dragFrame = requestAnimationFrame(flushDrag);
  }

  function onPointerUp(event) {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("is-dragging");
    try {
      handle.releasePointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    if (dragFrame != null) {
      cancelAnimationFrame(dragFrame);
      dragFrame = null;
    }
    const final = clampWidth(cssVarPx("--drawer-width", startWidth));
    void window.catchup.setDrawerWidth?.(final).then((clamped) => {
      if (typeof clamped === "number") applyWidth(clamped);
    });
  }

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    startX = event.clientX;
    startWidth = cssVarPx("--drawer-width", 400);
    handle.classList.add("is-dragging");
    try {
      handle.setPointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    event.preventDefault();
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
    setTimeLabel(when, message.timestamp);

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

function formatRelativeTime(diffMs) {
  const sec = Math.max(0, Math.round(diffMs / 1000));
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  return `${hr} hour${hr === 1 ? "" : "s"} ago`;
}

/** Relative ("12 mins ago") under 24h old, absolute date/time beyond that. */
function formatTime(ts) {
  const n = Number(ts);
  if (!n) return "";
  const diffMs = Date.now() - n;
  const DAY_MS = 24 * 60 * 60 * 1000;
  if (diffMs >= 0 && diffMs < DAY_MS) {
    return formatRelativeTime(diffMs);
  }
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

const IS_MAC = /Mac/i.test(navigator.platform || navigator.userAgent || "");
const STATUS_CLEAR_MS = 4500;
/** @type {WeakMap<HTMLElement, number>} */
const statusTimers = new WeakMap();

/**
 * ipcRenderer.invoke wraps main-process errors as
 * "Error invoking remote method 'x': Error: …" — show only the useful part.
 * @param {unknown} error
 */
function errorText(error) {
  const raw = String(/** @type {any} */ (error)?.message || error || "");
  return (
    raw.replace(/^Error invoking remote method '[^']*':\s*(?:\w*Error:\s*)?/, "") ||
    "Something went wrong."
  );
}

/**
 * Status line under a control. Success/info fades after a few seconds;
 * errors and pending ("…") messages stay until replaced.
 * @param {HTMLElement | null} el
 * @param {string} text
 * @param {{ tone?: 'info' | 'error' | 'pending', action?: { label: string, run: () => void } }} [opts]
 */
function setStatus(el, text, opts = {}) {
  if (!el) return;
  const tone = opts.tone || "info";
  const timer = statusTimers.get(el);
  if (timer) clearTimeout(timer);
  el.classList.toggle("is-error", tone === "error");
  el.classList.toggle("is-pending", tone === "pending");
  el.replaceChildren(document.createTextNode(text));
  if (opts.action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "text-link toast-action";
    btn.textContent = opts.action.label;
    btn.addEventListener("click", opts.action.run);
    el.append(" ", btn);
  }
  if (tone === "info" && text) {
    statusTimers.set(
      el,
      window.setTimeout(() => {
        el.replaceChildren();
        statusTimers.delete(el);
      }, STATUS_CLEAR_MS),
    );
  }
}

/** Errors that the user fixes in Settings get a one-click way there. */
function setErrorStatus(el, error) {
  const text = errorText(error);
  const needsSettings = /in Settings/i.test(text);
  setStatus(el, text, {
    tone: "error",
    action: needsSettings
      ? { label: "Open Settings", run: () => window.catchup.switchApp("settings") }
      : undefined,
  });
}

/**
 * Briefly swap a button's label (e.g. "Copied") without changing its width.
 * @param {HTMLElement | null} button
 * @param {string} label
 */
function flashButton(button, label) {
  if (!button) return;
  const original = button.dataset.label || button.textContent?.trim() || "";
  button.dataset.label = original;
  button.style.minWidth = `${button.offsetWidth}px`;
  button.textContent = label;
  button.classList.add("is-flashed");
  const prev = Number(button.dataset.flashTimer);
  if (prev) clearTimeout(prev);
  button.dataset.flashTimer = String(
    window.setTimeout(() => {
      button.textContent = original;
      button.classList.remove("is-flashed");
      button.style.minWidth = "";
      delete button.dataset.flashTimer;
    }, 1600),
  );
}

/**
 * Busy state for async buttons: disabled + temporary label.
 * @param {HTMLButtonElement | null} button
 * @param {string | null} busyLabel null restores the original label
 */
function setBusy(button, busyLabel) {
  if (!button) return;
  if (busyLabel) {
    button.dataset.label = button.dataset.label || button.textContent?.trim() || "";
    button.style.minWidth = `${button.offsetWidth}px`;
    button.textContent = busyLabel;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  } else {
    if (button.dataset.label) button.textContent = button.dataset.label;
    button.style.minWidth = "";
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

/** Re-render relative timestamps ("5 mins ago") so they don't go stale. */
function refreshRelativeTimes() {
  document.querySelectorAll("[data-ts]").forEach((el) => {
    const node = /** @type {HTMLElement} */ (el);
    const text = formatTime(node.dataset.ts);
    const suffix = node.dataset.tsSuffix || "";
    node.textContent = `${text}${suffix}`;
  });
}

/**
 * @param {HTMLElement} el
 * @param {number | string} ts
 * @param {string} [suffix]
 */
function setTimeLabel(el, ts, suffix = "") {
  el.dataset.ts = String(ts ?? "");
  if (suffix) el.dataset.tsSuffix = suffix;
  el.textContent = `${formatTime(ts)}${suffix}`;
  const n = Number(ts);
  if (n) el.title = new Date(n).toLocaleString();
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

async function copyText(text, okLabel, button) {
  const status = document.getElementById("copy-status");
  try {
    await window.catchup.copyText(text);
    flashButton(button, "Copied ✓");
    setStatus(status, okLabel);
  } catch {
    setStatus(status, "Couldn’t copy — select the text and copy manually.", {
      tone: "error",
    });
  }
}

function bindCopy(buttonId, getText, labels) {
  const button = document.getElementById(buttonId);
  button?.addEventListener("click", () => {
    void (async () => {
      const text = getText();
      if (!text || !String(text).trim()) {
        setStatus(
          document.getElementById("copy-status"),
          labels.empty || "Nothing to copy yet — open Settings after WhatsApp loads.",
          { tone: "error" },
        );
        return;
      }
      await copyText(text, labels.ok, button);
    })();
  });
}

async function refreshPreview() {
  const messages = await window.catchup.getPreview(40);
  renderPreview(messages);
}

async function refreshPreviewFromButton() {
  const button = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("refresh-preview")
  );
  setBusy(button, "Refreshing…");
  try {
    await refreshLocalStore();
  } finally {
    setBusy(button, null);
  }
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
  // Keep unsaved Gateway edits when Settings is reopened.
  await Promise.all([refreshLocalStore(), aiDirty ? null : refreshAiSettings()]);
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

/** @type {null | 'sync' | 'summary'} */
let pendingConsentOff = null;

function hideConsentConfirm() {
  pendingConsentOff = null;
  const box = document.getElementById("consent-confirm");
  if (box) box.hidden = true;
}

/**
 * Turning a toggle off deletes local data — ask first when there is any.
 * @param {'sync' | 'summary'} changed
 */
function showConsentConfirm(changed, chat) {
  const box = document.getElementById("consent-confirm");
  const title = document.getElementById("consent-confirm-title");
  const text = document.getElementById("consent-confirm-text");
  if (!box) return;
  const messages = Number(chat?.messageCount) || 0;
  const notes = Number(chat?.summaryCount) || 0;
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  if (changed === "sync") {
    if (title) title.textContent = "Stop sharing this chat?";
    const parts = [];
    if (messages) parts.push(plural(messages, "synced message"));
    if (notes) parts.push(plural(notes, "summary", "summaries"));
    if (text) {
      text.textContent = `Agents lose access, and ${parts.join(" and ")} stored on this Mac will be deleted. WhatsApp itself is not affected.`;
    }
  } else {
    if (title) title.textContent = "Turn off catch-up summaries?";
    if (text) {
      text.textContent = `${plural(notes, "saved summary", "saved summaries")} for this chat will be deleted. The chat stays shared with agents.`;
    }
  }
  pendingConsentOff = changed;
  box.hidden = false;
  box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  document.getElementById("consent-confirm-cancel")?.focus({ preventScroll: true });
}

/**
 * Instant apply for Access toggles (core consent job).
 * @param {'sync' | 'summary'} changed
 */
async function onConsentToggle(changed) {
  const input = /** @type {HTMLInputElement | null} */ (
    document.getElementById(changed === "sync" ? "chat-sync-enabled" : "summary-enabled")
  );
  const chat = chatsCache.find((c) => c.id === selectedSummaryChatId);
  const turningOff = input && !input.checked;
  const losesData =
    changed === "sync"
      ? (Number(chat?.messageCount) || 0) + (Number(chat?.summaryCount) || 0) > 0
      : (Number(chat?.summaryCount) || 0) > 0;
  if (turningOff && losesData && chat) {
    // Hold the switch where it was until the user confirms.
    input.checked = true;
    showConsentConfirm(changed, chat);
    return;
  }
  hideConsentConfirm();
  coupleChatToggles(changed);
  await saveSummaryPrefs({ quiet: false, reason: "toggle" });
}

async function confirmConsentOff() {
  const changed = pendingConsentOff;
  hideConsentConfirm();
  if (!changed) return;
  const input = /** @type {HTMLInputElement | null} */ (
    document.getElementById(changed === "sync" ? "chat-sync-enabled" : "summary-enabled")
  );
  if (input) input.checked = false;
  coupleChatToggles(changed);
  await saveSummaryPrefs({ quiet: false, reason: "toggle" });
}

/** Schedule fields autosave shortly after the user stops editing. */
let scheduleSaveTimer = 0;
function queueScheduleSave(delay = 600) {
  if (scheduleSaveTimer) clearTimeout(scheduleSaveTimer);
  scheduleSaveTimer = window.setTimeout(() => {
    scheduleSaveTimer = 0;
    void saveSummaryPrefs({ reason: "schedule" });
  }, delay);
}

function flushScheduleSave() {
  if (!scheduleSaveTimer) return null;
  clearTimeout(scheduleSaveTimer);
  scheduleSaveTimer = 0;
  return saveSummaryPrefs({ reason: "schedule" });
}

/**
 * @param {string} id
 * @param {number} fallback
 */
function readClampedNumber(id, fallback) {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
  if (!input) return fallback;
  let n = Math.round(Number(input.value));
  if (!Number.isFinite(n) || input.value.trim() === "") n = fallback;
  const min = Number(input.min);
  const max = Number(input.max);
  if (input.min !== "" && n < min) n = min;
  if (input.max !== "" && n > max) n = max;
  if (String(n) !== input.value) input.value = String(n);
  return n;
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
  if (changed) {
    // Persist edits for the chat we're leaving before switching.
    await flushScheduleSave();
    hideConsentConfirm();
  }
  selectedSummaryChatId = match.id;
  await loadSummaryDetail(match.id);
  if (changed) {
    setStatus(document.getElementById("summary-status"), "");
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
    syncLookbackUi(null);
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

  // A background refresh mustn't overwrite fields the user is mid-edit on.
  const editing = scheduleSaveTimer !== 0;

  const enabled = /** @type {HTMLInputElement | null} */ (
    document.getElementById("summary-enabled")
  );
  if (enabled) enabled.checked = Boolean(chat.summaryEnabled);

  updateShareStatus(Boolean(chat.allowed));
  syncSummaryOptionsVisibility();

  if (!editing) {
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
  }

  const board = await window.catchup.getSummaryBoard(chatId);
  renderSummaryCards(board);
  syncLookbackUi(board?.lookback);
}

const MD_INLINE_RE =
  /(\*\*\*(.+?)\*\*\*)|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(_(.+?)_)|(`([^`]+?)`)/g;

/**
 * Inline markdown (bold/italic/code) → DOM fragment. Never touches
 * innerHTML — literal text always goes through createTextNode/textContent,
 * so this can't inject markup even if a summary echoes hostile input.
 * @param {string} text
 */
function renderInlineMarkdown(text) {
  const frag = document.createDocumentFragment();
  let last = 0;
  let match;
  MD_INLINE_RE.lastIndex = 0;
  while ((match = MD_INLINE_RE.exec(text))) {
    if (match.index > last) {
      frag.appendChild(document.createTextNode(text.slice(last, match.index)));
    }
    if (match[2] !== undefined) {
      const strong = document.createElement("strong");
      const em = document.createElement("em");
      em.textContent = match[2];
      strong.appendChild(em);
      frag.appendChild(strong);
    } else if (match[4] !== undefined) {
      const el = document.createElement("strong");
      el.textContent = match[4];
      frag.appendChild(el);
    } else if (match[6] !== undefined || match[8] !== undefined) {
      const el = document.createElement("em");
      el.textContent = match[6] !== undefined ? match[6] : match[8];
      frag.appendChild(el);
    } else if (match[10] !== undefined) {
      const el = document.createElement("code");
      el.textContent = match[10];
      frag.appendChild(el);
    }
    last = MD_INLINE_RE.lastIndex;
  }
  if (last < text.length) {
    frag.appendChild(document.createTextNode(text.slice(last)));
  }
  return frag;
}

/**
 * Minimal, dependency-free markdown renderer for AI summary text: ATX
 * headings, a "**Bold line**" used as a de-facto section header, nested
 * bullet/numbered lists, and inline bold/italic/code. Good enough for the
 * fairly regular markdown these summarizer models produce.
 * @param {HTMLElement} container
 * @param {string} markdown
 */
function renderMarkdownBody(container, markdown) {
  container.replaceChildren();
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");

  /** @type {Array<{ el: HTMLElement, indent: number, lastLi: HTMLElement | null }>} */
  const listStack = [];
  /** @type {string[]} */
  let paragraphLines = [];

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    const p = document.createElement("p");
    p.appendChild(renderInlineMarkdown(paragraphLines.join(" ")));
    container.appendChild(p);
    paragraphLines = [];
  }

  function closeListsTo(indent) {
    while (listStack.length && listStack[listStack.length - 1].indent > indent) {
      listStack.pop();
    }
  }

  function listFor(indent, ordered) {
    closeListsTo(indent);
    const top = listStack[listStack.length - 1];
    if (top && top.indent === indent) return top;
    const el = document.createElement(ordered ? "ol" : "ul");
    el.className = "summary-list";
    if (top) {
      (top.lastLi || top.el).appendChild(el);
    } else {
      container.appendChild(el);
    }
    const entry = { el, indent, lastLi: null };
    listStack.push(entry);
    return entry;
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) {
      flushParagraph();
      listStack.length = 0;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      listStack.length = 0;
      const h = document.createElement("div");
      h.className = `summary-heading summary-heading-${heading[1].length}`;
      h.appendChild(renderInlineMarkdown(heading[2]));
      container.appendChild(h);
      continue;
    }

    const boldHeading = line.match(/^\*\*(.+)\*\*:?$/);
    if (boldHeading) {
      flushParagraph();
      listStack.length = 0;
      const h = document.createElement("div");
      h.className = "summary-heading summary-heading-2";
      h.appendChild(renderInlineMarkdown(boldHeading[1]));
      container.appendChild(h);
      continue;
    }

    const bullet = line.match(/^(\s*)([*-]|\d+\.)\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      const indent = Math.floor(bullet[1].length / 2);
      const ordered = bullet[2] !== "*" && bullet[2] !== "-";
      const entry = listFor(indent, ordered);
      const li = document.createElement("li");
      li.appendChild(renderInlineMarkdown(bullet[3]));
      entry.el.appendChild(li);
      entry.lastLi = li;
      continue;
    }

    listStack.length = 0;
    paragraphLines.push(line.trim());
  }
  flushParagraph();

  if (!container.childNodes.length) {
    container.textContent = String(markdown || "");
  }
}

/**
 * @param {HTMLElement} root
 * @param {any} summary
 * @param {{ collapsed?: boolean, before?: Node | null }} [opts]
 */
function appendSummaryCard(root, summary, opts = {}) {
  const collapsed = opts.collapsed !== false;
  const article = document.createElement("article");
  article.className = `summary-card${collapsed ? " is-collapsed" : " is-latest"}`;

  const head = document.createElement("button");
  head.type = "button";
  head.className = "summary-card-head";
  head.setAttribute("aria-expanded", String(!collapsed));
  const title = document.createElement("span");
  title.className = "summary-card-title";
  title.textContent = collapsed ? "Earlier summary" : "Latest summary";
  const metaGroup = document.createElement("span");
  metaGroup.className = "summary-card-meta-group";
  const meta = document.createElement("span");
  meta.className = "summary-card-meta";
  setTimeLabel(meta, summary.createdAt, ` · ${summary.messageCount || 0} msgs`);
  metaGroup.append(meta);
  if (summary.truncated) {
    const flag = document.createElement("span");
    flag.className = "status-pill is-warning";
    flag.title =
      "Some older messages in this time slice were left out to fit the input budget.";
    flag.textContent = "Incomplete";
    metaGroup.append(flag);
  }
  const chevron = document.createElement("span");
  chevron.className = "summary-card-chevron";
  chevron.setAttribute("aria-hidden", "true");
  metaGroup.append(chevron);
  head.append(title, metaGroup);
  head.addEventListener("click", () => {
    const nowCollapsed = article.classList.toggle("is-collapsed");
    head.setAttribute("aria-expanded", String(!nowCollapsed));
  });

  const body = document.createElement("div");
  body.className = "summary-card-body";
  renderMarkdownBody(body, summary.body);

  article.append(head, body);
  if (opts.before) {
    root.insertBefore(article, opts.before);
  } else {
    root.appendChild(article);
  }
}

/** @type {{ chatId: string | null, cursor: number | null, hasMore: boolean, loading: boolean, observer: IntersectionObserver | null }} */
const summaryPaging = {
  chatId: null,
  cursor: null,
  hasMore: false,
  loading: false,
  observer: null,
};

function createSummarySentinel() {
  const sentinel = document.createElement("div");
  sentinel.id = "summary-load-sentinel";
  sentinel.className = "summary-load-sentinel";
  return sentinel;
}

/** Fetches and appends the next page of "Earlier summary" cards. */
async function loadMoreSummaries() {
  if (summaryPaging.loading || !summaryPaging.hasMore || !summaryPaging.chatId) {
    return;
  }
  const root = document.getElementById("summary-cards");
  const sentinel = document.getElementById("summary-load-sentinel");
  if (!root || !sentinel) return;

  summaryPaging.loading = true;
  sentinel.classList.add("is-loading");
  try {
    const page = await window.catchup.getEarlierSummaries(summaryPaging.chatId, {
      beforeCreatedAt: summaryPaging.cursor,
      limit: 20,
    });
    const items = page?.items || [];
    for (const summary of items) {
      appendSummaryCard(root, summary, { collapsed: true, before: sentinel });
    }
    if (items.length) {
      summaryPaging.cursor = items[items.length - 1].createdAt;
    }
    summaryPaging.hasMore = Boolean(page?.hasMore);
    if (!summaryPaging.hasMore) {
      sentinel.remove();
      summaryPaging.observer?.disconnect();
      summaryPaging.observer = null;
    }
  } catch {
    // Leave hasMore as-is — scrolling near the sentinel again retries.
  } finally {
    summaryPaging.loading = false;
    sentinel.classList.remove("is-loading");
  }
}

function renderSummaryCards(board) {
  const root = document.getElementById("summary-cards");
  if (!root) return;
  summaryPaging.observer?.disconnect();
  summaryPaging.observer = null;
  root.replaceChildren();

  if (!board?.latest) {
    const lookback = board?.lookback;
    appendEmpty(
      root,
      lookback?.canForceLookback
        ? `No notes yet. Nothing in the last ${lookback.lookbackHours} hours — ${lookback.olderCount} older message${lookback.olderCount === 1 ? "" : "s"} are stored. Use Summarize older messages below.`
        : "No notes yet. Turn on catch-up summaries above, then Summarize now.",
    );
    summaryPaging.chatId = null;
    summaryPaging.cursor = null;
    summaryPaging.hasMore = false;
    return;
  }

  appendSummaryCard(root, board.latest, { collapsed: false });
  const previous = board.previous || [];
  for (const summary of previous) {
    appendSummaryCard(root, summary, { collapsed: true });
  }

  summaryPaging.chatId = board.chatId || selectedSummaryChatId;
  summaryPaging.hasMore = Boolean(board.hasMore);
  summaryPaging.cursor =
    (previous[previous.length - 1] || board.latest)?.createdAt ?? null;

  if (summaryPaging.hasMore) {
    const sentinel = createSummarySentinel();
    root.appendChild(sentinel);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreSummaries();
        }
      },
      { root: document.getElementById("summary-detail"), rootMargin: "200px" },
    );
    observer.observe(sentinel);
    summaryPaging.observer = observer;
  }
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
  const threshold = readClampedNumber("summary-threshold", 20);
  const interval = readClampedNumber("summary-interval", 60);
  const maxTokens = readClampedNumber("summary-max-tokens", 512);
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

    if (!opts.quiet) {
      if (opts.reason === "schedule") {
        setStatus(status, "Saved.");
      } else if (summarizeOn) {
        setStatus(status, "Shared · catch-up summaries on.");
      } else if (syncOn) {
        setStatus(status, "Shared with agents — keep the chat open while messages sync.");
      } else {
        setStatus(status, "Private — nothing from this chat is stored on this Mac.");
      }
    }
    await loadSummaryDetail(selectedSummaryChatId);
  } catch (error) {
    setErrorStatus(status, error);
  }
}

/**
 * @param {{
 *   lookbackHours?: number,
 *   inWindow?: number,
 *   olderCount?: number,
 *   totalStored?: number,
 *   canForceLookback?: boolean,
 *   latestMessageAt?: number,
 * } | null | undefined} lookback
 */
function syncLookbackUi(lookback) {
  const forceBtn = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("summary-run-older")
  );
  const syncBtn = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("summary-sync")
  );
  const hint = document.getElementById("summary-lookback-hint");
  const canForce = Boolean(lookback?.canForceLookback);
  const needsSync = Boolean(lookback) && !(lookback.totalStored > 0);
  if (forceBtn) forceBtn.hidden = !canForce;
  if (syncBtn) syncBtn.hidden = !needsSync;
  if (!hint) return;
  if (canForce) {
    const hours = lookback.lookbackHours;
    const n = lookback?.olderCount || 0;
    const latest = lookback?.latestMessageAt
      ? formatTime(lookback.latestMessageAt)
      : "";
    hint.hidden = false;
    hint.textContent = latest
      ? `No messages in the last ${hours} hours (latest ${latest}). ${n} older message${n === 1 ? "" : "s"} still on this Mac — Summarize older messages bypasses the ${hours}h window.`
      : `No messages in the last ${hours} hours. ${n} older message${n === 1 ? "" : "s"} still on this Mac — Summarize older messages bypasses the ${hours}h window.`;
    return;
  }
  if (needsSync) {
    hint.hidden = false;
    hint.textContent =
      "Nothing from this chat is stored on this Mac yet. Keep it open in WhatsApp, then Sync messages (or Summarize now will try to sync first).";
    return;
  }
  hint.hidden = true;
  hint.textContent = "";
}

/**
 * @param {number} [timeoutMs]
 * @returns {Promise<number>} stored message count after waiting
 */
async function waitForStoredMessages(timeoutMs = 4500) {
  if (!selectedSummaryChatId) return 0;
  const started = Date.now();
  let total = 0;
  while (Date.now() - started < timeoutMs) {
    const board = await window.catchup.getSummaryBoard(selectedSummaryChatId);
    total = Number(board?.lookback?.totalStored) || 0;
    if (total > 0) return total;
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  return total;
}

/**
 * @param {{ quiet?: boolean }} [opts]
 */
async function syncActiveChatMessages(opts = {}) {
  const status = document.getElementById("summary-status");
  const button = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("summary-sync")
  );
  if (!opts.quiet) {
    setBusy(button, "Syncing…");
    setStatus(status, "Syncing messages from the open chat…", {
      tone: "pending",
    });
  }
  try {
    const result = await window.catchup.forceWhatsAppSync();
    if (!result?.ok) {
      setStatus(status, result?.message || "Couldn’t sync right now.", {
        tone: "error",
      });
      return { ok: false, totalStored: 0 };
    }
    if (!opts.quiet) {
      setStatus(status, result.message || "Syncing…", { tone: "pending" });
    }
    const totalStored = await waitForStoredMessages(4500);
    chatsCache = await window.catchup.listChats();
    if (selectedSummaryChatId) {
      await loadSummaryDetail(selectedSummaryChatId);
    }
    if (totalStored > 0) {
      setStatus(
        status,
        `Synced ${totalStored} message${totalStored === 1 ? "" : "s"} on this Mac.`,
      );
      return { ok: true, totalStored };
    }
    setStatus(
      status,
      "Sync ran, but nothing landed yet — scroll the open chat so messages are visible, then try Sync again.",
      { tone: "error" },
    );
    return { ok: false, totalStored: 0 };
  } catch (error) {
    setErrorStatus(status, error);
    return { ok: false, totalStored: 0 };
  } finally {
    if (!opts.quiet) setBusy(button, null);
  }
}

/**
 * @param {{ forceLookback?: boolean }} [opts]
 */
async function runSummaryNow(opts = {}) {
  if (!selectedSummaryChatId) return;
  const status = document.getElementById("summary-status");
  const button = /** @type {HTMLButtonElement | null} */ (
    document.getElementById(
      opts.forceLookback ? "summary-run-older" : "summary-run",
    )
  );
  setBusy(button, opts.forceLookback ? "Summarizing older…" : "Summarizing…");
  setStatus(
    status,
    opts.forceLookback
      ? "Summarizing older stored messages…"
      : "Generating summary…",
    { tone: "pending" },
  );
  try {
    if (scheduleSaveTimer) clearTimeout(scheduleSaveTimer);
    scheduleSaveTimer = 0;
    await saveSummaryPrefs({ quiet: true });

    /** @param {boolean} forceLookback */
    async function invoke(forceLookback) {
      return window.catchup.runSummaryNow(selectedSummaryChatId, {
        forceLookback,
      });
    }

    let result = await invoke(Boolean(opts.forceLookback));

    // Empty local store: try one force-sync, then summarize again.
    if (
      result?.skipped &&
      result.reason === "no_new_messages" &&
      !(result.lookback?.totalStored > 0) &&
      !opts.forceLookback
    ) {
      setStatus(status, "No local messages yet — syncing this chat first…", {
        tone: "pending",
      });
      const synced = await syncActiveChatMessages({ quiet: true });
      if (synced.ok && synced.totalStored > 0) {
        setStatus(status, "Generating summary…", { tone: "pending" });
        result = await invoke(false);
        // If sync pulled only older-than-12h traffic, offer / run older path.
        if (result?.skipped && result.reason === "outside_lookback") {
          syncLookbackUi(result.lookback);
          setStatus(status, "Summarizing older stored messages…", {
            tone: "pending",
          });
          result = await invoke(true);
        }
      } else if (!synced.ok) {
        // syncActiveChatMessages already set status
        return;
      }
    }

    if (result?.skipped) {
      if (result.reason === "outside_lookback") {
        syncLookbackUi(result.lookback);
        const n = result.lookback?.olderCount || 0;
        const hours = result.lookback?.lookbackHours;
        setStatus(
          status,
          hours != null
            ? `Nothing in the last ${hours} hours — ${n} older message${n === 1 ? "" : "s"} stored. Use Summarize older messages.`
            : `Nothing new in the catch-up window — ${n} older message${n === 1 ? "" : "s"} stored. Use Summarize older messages.`,
          { tone: "error" },
        );
      } else if (result.reason === "no_new_messages") {
        syncLookbackUi(result.lookback);
        if (!(result.lookback?.totalStored > 0)) {
          setStatus(
            status,
            "Still no messages on this Mac — keep the chat open, scroll to load history, then Sync messages.",
            { tone: "error" },
          );
        } else {
          setStatus(status, "No new messages since the last summary.");
        }
      } else {
        setStatus(status, `Skipped (${result.reason}).`);
      }
    } else {
      setStatus(
        status,
        result?.forcedLookback
          ? "Summary ready (included older messages)."
          : "Summary ready.",
      );
    }
    chatsCache = await window.catchup.listChats();
    await loadSummaryDetail(selectedSummaryChatId);
  } catch (error) {
    setErrorStatus(status, error);
  } finally {
    setBusy(button, null);
    syncSummaryOptionsVisibility();
  }
}

const VERCEL_GATEWAY_HOST = "ai-gateway.vercel.sh";
// Keep in sync with DEFAULT_AI_GATEWAY_* in app/src/db/store.js and
// DEFAULT_BASE_URL in app/src/ai/gateway.js (UI presets are the Settings source).
const DEFAULT_AI_BASE_URL = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_AI_MODEL = "anthropic/claude-sonnet-4.5";

/** @typedef {{ id: string, label: string, baseUrl: string | null, model: string, keyHint?: string }} AiProviderPreset */

/** @type {AiProviderPreset[]} */
const AI_PROVIDER_PRESETS = [
  {
    id: "vercel",
    label: "Vercel AI Gateway",
    baseUrl: DEFAULT_AI_BASE_URL,
    model: DEFAULT_AI_MODEL,
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-sonnet-4.5",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.2",
    keyHint: "Local Ollama usually needs no key — paste any placeholder if required.",
  },
  {
    id: "custom",
    label: "Custom…",
    baseUrl: null,
    model: "",
  },
];

/** @param {string} url */
function normalizeBaseUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

/** @param {string} baseUrl */
function assertSafeBaseUrlClient(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("Base URL must be a valid http(s) URL.");
  }
  if (parsed.protocol === "https:") return;
  const host = parsed.hostname;
  if (
    parsed.protocol === "http:" &&
    (host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "::1")
  ) {
    return;
  }
  throw new Error(
    "Base URL must use https (http is only allowed for localhost).",
  );
}

/** @param {string} baseUrl */
function isVercelGateway(baseUrl) {
  try {
    return new URL(baseUrl).hostname === VERCEL_GATEWAY_HOST;
  } catch {
    return String(baseUrl || "").includes(VERCEL_GATEWAY_HOST);
  }
}

/** @param {string} baseUrl */
function matchProviderPreset(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl || DEFAULT_AI_BASE_URL);
  const hit = AI_PROVIDER_PRESETS.find(
    (p) => p.baseUrl && normalizeBaseUrl(p.baseUrl) === normalized,
  );
  return hit?.id || "custom";
}

/** @param {string} [providerId] */
function getProviderPreset(providerId) {
  return (
    AI_PROVIDER_PRESETS.find((p) => p.id === providerId) ||
    AI_PROVIDER_PRESETS.find((p) => p.id === "custom")
  );
}

/** Resolve the base URL currently selected (preset or custom field). */
function currentAiBaseUrl() {
  const provider = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("ai-provider")
  );
  const preset = getProviderPreset(provider?.value);
  if (preset?.baseUrl) return preset.baseUrl;
  const base = /** @type {HTMLInputElement | null} */ (
    document.getElementById("ai-base-url")
  );
  return normalizeBaseUrl(base?.value) || DEFAULT_AI_BASE_URL;
}

/**
 * @param {{ fillModel?: boolean }} [opts]
 * When fillModel is true (user changed provider), replace the model with the preset default.
 */
function applyProviderPreset(opts = {}) {
  const provider = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("ai-provider")
  );
  const baseField = document.getElementById("ai-base-url-field");
  const base = /** @type {HTMLInputElement | null} */ (
    document.getElementById("ai-base-url")
  );
  const model = /** @type {HTMLInputElement | null} */ (
    document.getElementById("ai-model")
  );
  const hint = document.getElementById("ai-provider-hint");
  const preset = getProviderPreset(provider?.value);
  const isCustom = !preset?.baseUrl;

  if (baseField) baseField.hidden = !isCustom;
  if (base && preset?.baseUrl) base.value = preset.baseUrl;
  if (model) {
    model.placeholder = preset?.model || "model-id";
    if (opts.fillModel && preset?.model) model.value = preset.model;
  }
  if (hint) {
    hint.textContent = isCustom
      ? "Paste any OpenAI Chat Completions–compatible base URL (…/v1)."
      : preset?.keyHint ||
        `Uses ${preset?.baseUrl}. Change the model id if your account uses a different one.`;
  }
  syncZdrVisibility();
}

/** Show ZDR only when Base URL is the Vercel gateway (other providers ignore it). */
function syncZdrVisibility() {
  const row = document.getElementById("ai-zdr-row");
  if (!row) return;
  row.hidden = !isVercelGateway(currentAiBaseUrl());
}

async function refreshAiSettings() {
  const settings = await window.catchup.getAiSettings();
  const keyHint = document.getElementById("ai-key-hint");
  if (keyHint) {
    keyHint.textContent = settings.apiKeySet
      ? "✓ API key is saved on this Mac."
      : "No key saved yet — paste a key from your provider.";
    keyHint.classList.toggle("is-good", Boolean(settings.apiKeySet));
  }
  const keyInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("ai-api-key")
  );
  if (keyInput) {
    keyInput.value = "";
    keyInput.placeholder = settings.apiKeySet
      ? "•••••••• saved — paste a new key to replace"
      : "Paste your API key";
  }
  const baseUrl = settings.baseUrl || DEFAULT_AI_BASE_URL;
  const base = /** @type {HTMLInputElement | null} */ (
    document.getElementById("ai-base-url")
  );
  if (base) base.value = baseUrl;
  const provider = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("ai-provider")
  );
  if (provider) provider.value = matchProviderPreset(baseUrl);
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
  applyProviderPreset({ fillModel: false });
  setAiDirty(false);
}

let aiDirty = false;
function setAiDirty(dirty) {
  aiDirty = dirty;
  const hint = document.getElementById("ai-dirty-hint");
  if (hint) {
    hint.hidden = !dirty;
    hint.textContent = `Unsaved changes · ${IS_MAC ? "⌘S" : "Ctrl+S"}`;
  }
}

async function saveAiSettings() {
  const status = document.getElementById("ai-save-status");
  const apiKey =
    /** @type {HTMLInputElement | null} */ (document.getElementById("ai-api-key"))
      ?.value || "";
  const provider = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("ai-provider")
  );
  const preset = getProviderPreset(provider?.value);
  let baseUrl = currentAiBaseUrl();
  if (!preset?.baseUrl) {
    const raw =
      /** @type {HTMLInputElement | null} */ (
        document.getElementById("ai-base-url")
      )?.value || "";
    baseUrl = normalizeBaseUrl(raw);
    if (!baseUrl) {
      setStatus(status, "Enter a custom base URL, or pick a provider preset.", {
        tone: "error",
      });
      return;
    }
  }
  try {
    assertSafeBaseUrlClient(baseUrl);
  } catch (error) {
    setErrorStatus(status, error);
    return;
  }
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

  const button = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("save-ai-settings")
  );
  setBusy(button, "Saving…");
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
    await refreshAiSettings();
    setStatus(status, "Settings saved.");
  } catch (error) {
    setErrorStatus(status, error);
  } finally {
    setBusy(button, null);
  }
}

async function testAiConnection() {
  const status = document.getElementById("ai-test-status");
  const button = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("test-ai-settings")
  );
  const apiKey =
    /** @type {HTMLInputElement | null} */ (document.getElementById("ai-api-key"))
      ?.value || "";
  const provider = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("ai-provider")
  );
  const preset = getProviderPreset(provider?.value);
  let baseUrl = currentAiBaseUrl();
  if (!preset?.baseUrl) {
    baseUrl = normalizeBaseUrl(
      /** @type {HTMLInputElement | null} */ (
        document.getElementById("ai-base-url")
      )?.value || "",
    );
    if (!baseUrl) {
      setStatus(status, "Enter a custom base URL, or pick a provider preset.", {
        tone: "error",
      });
      return;
    }
  }
  try {
    assertSafeBaseUrlClient(baseUrl);
  } catch (error) {
    setErrorStatus(status, error);
    return;
  }
  const model =
    /** @type {HTMLInputElement | null} */ (document.getElementById("ai-model"))
      ?.value || "";
  if (!model.trim()) {
    setStatus(status, "Enter a model id before testing.", { tone: "error" });
    return;
  }
  const zeroDataRetention = /** @type {HTMLInputElement | null} */ (
    document.getElementById("ai-zdr")
  )?.checked;

  setBusy(button, "Testing…");
  setStatus(status, "Sending a tiny ping…", { tone: "pending" });
  try {
    const result = await window.catchup.testAiConnection({
      apiKey: apiKey.trim(),
      baseUrl,
      model: model.trim(),
      zeroDataRetention: Boolean(zeroDataRetention),
    });
    const seconds = (result.latencyMs / 1000).toFixed(1);
    setStatus(
      status,
      `✓ Connected · ${result.model} · ${seconds}s`,
    );
  } catch (error) {
    setErrorStatus(status, error);
  } finally {
    setBusy(button, null);
  }
}

/** Esc closes the confirm / drawer / Settings; ⌘S saves Settings. */
function onGlobalKeyDown(event) {
  const mod = IS_MAC ? event.metaKey : event.ctrlKey;
  if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "s") {
    if (settingsPageOpen) {
      event.preventDefault();
      void saveAiSettings();
    }
    return;
  }
  if (event.key !== "Escape" || event.defaultPrevented) return;
  if (pendingConsentOff) {
    event.preventDefault();
    hideConsentConfirm();
    return;
  }
  if (openDrawer === "summaries") {
    event.preventDefault();
    window.catchup.switchApp("summaries");
  } else if (settingsPageOpen) {
    event.preventDefault();
    window.catchup.switchApp("whatsapp");
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
      void refreshPreviewFromButton();
    });
  document.getElementById("close-summaries")?.addEventListener("click", () => {
    window.catchup.switchApp("summaries");
  });
  bindDrawerResize();
  document.querySelectorAll('input[name="summary-mode"]').forEach((el) =>
    el.addEventListener("change", () => {
      syncModeFields();
      queueScheduleSave(0);
    }),
  );
  for (const id of ["summary-threshold", "summary-interval", "summary-max-tokens"]) {
    const input = document.getElementById(id);
    input?.addEventListener("input", () => queueScheduleSave(900));
    input?.addEventListener("change", () => queueScheduleSave(0));
  }
  const extraPrompt = document.getElementById("summary-extra-prompt");
  extraPrompt?.addEventListener("input", () => queueScheduleSave(1200));
  extraPrompt?.addEventListener("blur", () => void flushScheduleSave());
  document
    .getElementById("consent-confirm-cancel")
    ?.addEventListener("click", () => {
      hideConsentConfirm();
      setStatus(document.getElementById("summary-status"), "Nothing changed.");
    });
  document
    .getElementById("consent-confirm-ok")
    ?.addEventListener("click", () => void confirmConsentOff());
  document.getElementById("summary-enabled")?.addEventListener("change", () => {
    void onConsentToggle("summary");
  });
  document
    .getElementById("chat-sync-enabled")
    ?.addEventListener("change", () => {
      void onConsentToggle("sync");
    });
  document
    .getElementById("summary-run")
    ?.addEventListener("click", () => void runSummaryNow());
  document
    .getElementById("summary-run-older")
    ?.addEventListener("click", () =>
      void runSummaryNow({ forceLookback: true }),
    );
  document
    .getElementById("summary-sync")
    ?.addEventListener("click", () => void syncActiveChatMessages());
  document
    .getElementById("save-ai-settings")
    ?.addEventListener("click", () => void saveAiSettings());
  document
    .getElementById("test-ai-settings")
    ?.addEventListener("click", () => void testAiConnection());
  for (const id of [
    "ai-api-key",
    "ai-provider",
    "ai-base-url",
    "ai-model",
    "ai-zdr",
    "ai-system-prompt",
  ]) {
    const el = document.getElementById(id);
    el?.addEventListener("input", () => setAiDirty(true));
    el?.addEventListener("change", () => setAiDirty(true));
  }
  document.getElementById("ai-provider")?.addEventListener("change", () => {
    applyProviderPreset({ fillModel: true });
    setAiDirty(true);
  });
  document.getElementById("ai-base-url")?.addEventListener("input", () => {
    syncZdrVisibility();
  });
  for (const id of ["ai-api-key", "ai-base-url", "ai-model"]) {
    document.getElementById(id)?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void saveAiSettings();
      }
    });
  }
  document.addEventListener("keydown", onGlobalKeyDown);
  window.setInterval(refreshRelativeTimes, 30_000);
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
    ok: "Prompt copied — includes the MCP command for this Mac.",
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
