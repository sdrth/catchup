/**
 * Catchup WhatsApp capture.
 *
 * Store: WAWebCollections for Chat.getActive() / Chat.get(id) only.
 * Never Chat.getModelsArray() or chat.msgs.getModelsArray() — both hydrate
 * multi‑GB heaps. Message bodies prefer DOM scrape; Store msgs only via a
 * tail peek on _models. Deep history (loadEarlier) is force-sync only.
 */
(function catchupWhatsAppInject() {
  if (window.__catchupInjected) return;
  window.__catchupInjected = true;

  const SOURCE = "catchup-whatsapp";
  const STATE = {
    store: null,
    path: null,
    /** @type {Set<string>} */
    deepLoaded: new Set(),
    /** @type {{ ids: Set<string>, names: Set<string> }} */
    allow: { ids: new Set(), names: new Set() },
    lastSnapshotAt: 0,
  };

  function setPolicy(policy) {
    const ids = Array.isArray(policy?.ids) ? policy.ids : [];
    const names = Array.isArray(policy?.names) ? policy.names : [];
    STATE.allow.ids = new Set(ids.map(String));
    STATE.allow.names = new Set(
      names.map((n) => String(n || "").toLowerCase()).filter(Boolean),
    );
  }

  function hasAllowlist() {
    return STATE.allow.ids.size > 0 || STATE.allow.names.size > 0;
  }

  function isAllowedMeta(meta) {
    if (!hasAllowlist()) return false;
    const id = meta?.id ? String(meta.id) : "";
    if (id && STATE.allow.ids.has(id)) return true;
    const name = String(meta?.name || "").toLowerCase();
    if (name && STATE.allow.names.has(name)) return true;
    return false;
  }

  function isAllowedChat(chat) {
    return isAllowedMeta(chatMeta(chat));
  }


  function post(type, payload) {
    window.postMessage(
      { source: SOURCE, type, payload },
      window.location.origin,
    );
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function textOf(el) {
    return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function hashId(input) {
    let h = 0;
    const s = String(input);
    for (let i = 0; i < s.length; i += 1) {
      h = (h << 5) - h + s.charCodeAt(i);
      h |= 0;
    }
    return `dom_${Math.abs(h)}`;
  }

  function cleanChatTitle(value) {
    let s = String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!s) return "";
    s = s.replace(/^\d+\s*unread\s*messages?/i, "");
    s = s.replace(/^\d+\s*unread\b/i, "");
    s = s.replace(/\s+/g, " ").trim();
    if (!s || s.length > 120) return "";
    if (/^click (here|to)\b/i.test(s)) return "";
    if (/^\d+\s*unread\b/i.test(s)) return "";
    if (/^unread\b/i.test(s)) return "";
    return s;
  }

  function firstGoodName(...candidates) {
    for (const candidate of candidates) {
      const s = cleanChatTitle(candidate);
      if (s) return s;
    }
    return "";
  }

  function tryRequire(moduleId) {
    try {
      if (typeof window.require !== "function") return null;
      return window.require(moduleId);
    } catch {
      return null;
    }
  }

  function chatIdOf(chat) {
    return (
      chat?.id?._serialized ||
      (typeof chat?.id === "string" ? chat.id : null) ||
      null
    );
  }

  /** Id/server-only kind — does not touch groupMetadata / contact (avoids Store hydrate). */
  function chatKindLight(chat) {
    const id = String(chatIdOf(chat) || "");
    const server = String(chat?.id?.server || "");
    if (id.includes("@g.us") || server === "g.us") return "group";
    if (id.includes("@newsletter") || chat?.isBroadcast || chat?.isNewsletter) {
      return "contact";
    }
    if (chat?.isGroup === true || chat?.isGroup === 1) return "group";
    return "contact";
  }

  function chatKind(chat) {
    try {
      const getters = STATE.store?.chatGetters;
      if (getters?.getIsNewsletter?.(chat)) return "contact";
    } catch {
      // ignore
    }
    if (chat?.groupMetadata) return "group";
    return chatKindLight(chat);
  }

  function formatPhone(raw) {
    if (raw && typeof raw === "object") {
      raw = raw._serialized || raw.user || raw.phoneNumber || "";
    }
    const digits = String(raw || "").replace(/[^\d+]/g, "");
    if (!digits) return "";
    const bare = digits.replace(/^\+/, "");
    if (!/^\d{6,15}$/.test(bare)) return "";
    return `+${bare}`;
  }

  function chatPhone(chat) {
    if (chatKind(chat) === "group") return "";
    const id = String(chatIdOf(chat) || "");
    if (id.endsWith("@c.us")) {
      const fromId = formatPhone(id.slice(0, -"@c.us".length));
      if (fromId) return fromId;
    }

    const contact = chat?.contact || {};
    const getters = STATE.store?.contactGetters;
    const getterPhone = getters?.getUserid?.(contact);
    const candidates = [
      contact.phoneNumber,
      getterPhone,
      contact.userid,
      contact.userId,
      contact.pn,
      typeof contact.pn === "object" ? contact.pn?.user : null,
      contact?.id?.user,
      chat?.id?.user,
    ];
    for (const candidate of candidates) {
      const phone = formatPhone(candidate);
      if (phone) return phone;
    }
    return "";
  }

  function chatName(chat) {
    const contact = chat?.contact;
    const getters = STATE.store?.contactGetters;
    const fromGetters = getters
      ? firstGoodName(
          getters.getName?.(contact),
          getters.getPushname?.(contact),
          getters.getVerifiedName?.(contact),
          getters.getShortName?.(contact),
        )
      : "";
    const phone = chatPhone(chat);
    const named = firstGoodName(
      fromGetters,
      chat?.formattedTitle,
      chat?.name,
      contact?.name,
      contact?.pushname,
      contact?.verifiedName,
      contact?.formattedName,
      contact?.displayName,
    );
    if (named) return named;
    if (phone) return phone;
    return firstGoodName(chat?.id?.user, chatIdOf(chat)) || "Unknown";
  }

  function chatMeta(chat) {
    return {
      id: chatIdOf(chat),
      name: chatName(chat),
      kind: chatKind(chat),
      phone: chatPhone(chat) || null,
    };
  }

  /**
   * Catalog picker only — no contact getters / phone / groupMetadata.
   * Touching those hydrates WhatsApp’s Contact graph into the renderer heap.
   */
  function chatMetaLight(chat) {
    const id = chatIdOf(chat);
    const name =
      firstGoodName(chat?.formattedTitle, chat?.name, chat?.id?.user, id) ||
      "Unknown";
    return {
      id,
      name,
      kind: chatKindLight(chat),
      phone: null,
    };
  }

  /**
   * Message fields from WA Web Msg model / serialize():
   * id._serialized, id.remote, body, caption, type, t (unix sec), fromMe,
   * notifyName, senderObj, isNotification
   */
  function messageBody(msg) {
    if (!msg) return "";
    if (msg.isNotification) return "";
    if (typeof msg.body === "string" && msg.body.trim()) return msg.body.trim();
    if (typeof msg.caption === "string" && msg.caption.trim()) {
      return msg.caption.trim();
    }
    const type = String(msg.type || "");
    if (type && type !== "chat" && type !== "protocol") {
      return `[${type}]`;
    }
    return "";
  }

  function normalizeStoreMessage(msg, fallbackChatId, fallbackChatName) {
    if (!msg || msg.isNotification) return null;

    let id =
      msg?.id?._serialized ||
      (typeof msg?.id === "string" ? msg.id : null) ||
      null;
    if (!id && msg?.id?.fromMe != null && msg?.id?.remote && msg?.id?.id) {
      id = `${msg.id.fromMe}_${msg.id.remote}_${msg.id.id}`;
    }

    const body = messageBody(msg);
    if (!id || !body) return null;

    const tsSec = Number(msg.t) || Number(msg.timestamp) || 0;
    const timestamp = tsSec > 1e12 ? tsSec : tsSec * 1000 || Date.now();
    const fromMe = Boolean(msg.fromMe ?? msg.id?.fromMe);
    const remote =
      (typeof msg.id?.remote === "object"
        ? msg.id.remote._serialized
        : msg.id?.remote) ||
      msg.chat?.id?._serialized ||
      fallbackChatId ||
      null;

    const senderName =
      msg.notifyName ||
      msg.senderObj?.pushname ||
      msg.senderObj?.name ||
      (fromMe ? "You" : fallbackChatName);

    return {
      id,
      body,
      senderName,
      fromMe,
      timestamp,
      chatId: remote,
    };
  }

  /**
   * Last N models without getModelsArray() (that API copies the whole collection).
   * @param {object | null | undefined} collection
   * @param {number} limit
   */
  function peekCollectionTail(collection, limit = 24) {
    if (!collection || limit <= 0) return [];
    let models = null;
    try {
      models = collection._models || collection.models || null;
    } catch {
      models = null;
    }
    if (!Array.isArray(models) || models.length === 0) return [];
    return models.length > limit ? models.slice(models.length - limit) : models;
  }

  /**
   * Modern WhatsApp Web (Comet / named modules).
   * @returns {object | null}
   */
  function buildStoreFromNamedRequire() {
    const collections = tryRequire("WAWebCollections");
    if (!collections?.Chat) return null;

    const chat = collections.Chat;
    const canGet =
      typeof chat.get === "function" || typeof chat.getActive === "function";
    if (!canGet) return null;

    return {
      Chat: chat,
      Msg: null,
      Contact: null,
      // Lazy: only required on force deep sync — keeps module graph smaller.
      loadEarlier: null,
      contactGetters: tryRequire("WAWebContactGetters"),
      chatGetters: tryRequire("WAWebChatGetters"),
      path: "WAWebCollections",
    };
  }

  /** Legacy webpack scan removed — requiring every module balloons RAM to multi‑GB. */
  function buildStoreFromWebpackHeuristic() {
    return null;
  }

  function buildStore() {
    return buildStoreFromNamedRequire() || buildStoreFromWebpackHeuristic();
  }

  function listStoreChats(_store) {
    // Never call Chat.getModelsArray() for catalog — materializing every chat
    // model repeatedly is a multi‑GB heap trap. DOM titles are enough to pick chats.
    return scrapeChatList().slice(0, 80);
  }

  /** Tail peek only — never chat.msgs.getModelsArray(). */
  function messagesFromChatSync(chat, limit = 12) {
    if (!chat) return [];
    const id = chatIdOf(chat);
    const name = chatName(chat);
    const out = [];
    for (const msg of peekCollectionTail(chat.msgs, limit)) {
      if (msg?.isNotification) continue;
      const normalized = normalizeStoreMessage(msg, id, name);
      if (normalized) out.push(normalized);
    }
    return out;
  }

  /**
   * Prefer DOM bodies (avoids Store msgs hydrate). Store peek as fallback.
   * loadEarlier only on force deep sync, once, and re-peek tail afterward.
   */
  async function messagesFromChat(store, chat, limit = 24, { deep = false } = {}) {
    if (!chat) return [];
    const id = chatIdOf(chat);
    const name = chatName(chat);

    const fromDom = scrapeActiveChatMessages(limit, name);
    if (fromDom.length > 0) {
      return fromDom.map((m) => ({ ...m, chatId: id }));
    }

    let models = peekCollectionTail(chat.msgs, limit).filter(
      (m) => !m?.isNotification,
    );

    const chatKey = id || "";
    if (deep && chatKey && !STATE.deepLoaded.has(chatKey)) {
      if (!store.loadEarlier) {
        store.loadEarlier = tryRequire("WAWebChatLoadMessages");
      }
      const loader = store.loadEarlier;
      if (loader && typeof loader.loadEarlierMsgs === "function") {
        try {
          await loader.loadEarlierMsgs({ chat });
        } catch {
          // ignore
        }
        models = peekCollectionTail(chat.msgs, limit).filter(
          (m) => !m?.isNotification,
        );
      }
      STATE.deepLoaded.add(chatKey);
      if (STATE.deepLoaded.size > 20) {
        const first = STATE.deepLoaded.values().next().value;
        STATE.deepLoaded.delete(first);
      }
    }

    const out = [];
    for (const msg of models) {
      const normalized = normalizeStoreMessage(msg, id, name);
      if (normalized) out.push(normalized);
    }
    return out;
  }

  function activeStoreChat(store) {
    try {
      if (typeof store.Chat.getActive === "function") {
        return store.Chat.getActive();
      }
    } catch {
      // ignore
    }
    // Never fall back to Chat.getModelsArray() — that walks/hydrates the full catalog.
    return null;
  }

  function chatById(store, id) {
    if (!store?.Chat || !id) return null;
    try {
      if (typeof store.Chat.get === "function") {
        return store.Chat.get(id) || null;
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * @param {object} store
   * @param {{ deep?: boolean, includeWarm?: boolean, catalogOnly?: boolean, messagesOnly?: boolean }} [opts]
   */
  async function snapshotFromStore(store, opts = {}) {
    const deep = Boolean(opts.deep);
    const includeWarm = Boolean(opts.includeWarm);
    const catalogOnly = Boolean(opts.catalogOnly);
    const messagesOnly = Boolean(opts.messagesOnly);

    // Catalog via DOM only (see listStoreChats) — never Store full array.
    const chats = catalogOnly || !messagesOnly ? listStoreChats(store) : [];
    const activeChat = activeStoreChat(store);
    let active = null;

    if (!catalogOnly) {
      // Always report which chat is open (Summaries follows this).
      // Message bodies: allowlisted chats only.
      if (activeChat && isAllowedChat(activeChat)) {
        active = {
          chat: chatMeta(activeChat),
          messages: await messagesFromChat(store, activeChat, 24, {
            deep: deep && isAllowedChat(activeChat),
          }),
        };
      } else if (activeChat) {
        active = { chat: chatMetaLight(activeChat), messages: [] };
      }
    }

    // Warm: only Chat.get(allowlist id) — never iterate the full Chat collection.
    const warm = [];
    if (includeWarm && hasAllowlist() && !catalogOnly) {
      const activeId = chatIdOf(activeChat);
      let warmed = 0;
      for (const id of STATE.allow.ids) {
        if (!id || id === activeId) continue;
        const chat = chatById(store, id);
        if (!chat || !isAllowedChat(chat)) continue;
        const messages = messagesFromChatSync(chat, 8);
        if (messages.length === 0) continue;
        warm.push({ chat: chatMetaLight(chat), messages });
        warmed += 1;
        if (warmed >= 2) break;
      }
    }

    return {
      chats,
      active,
      warm,
      mode: "store",
      path: store.path || STATE.path,
      debug: {
        chatCount: chats.length,
        allowCount: STATE.allow.ids.size,
        activeChat: active?.chat?.name || null,
        activeMessages: active?.messages?.length || 0,
        waVersion: window.Debug?.VERSION || null,
      },
    };
  }

  // No global Store.Msg listeners — they pin WhatsApp’s entire Msg collection
  // in the renderer heap (multi‑GB). Allowlisted messages come from snapshots.

  // --- DOM fallback -------------------------------------------------------

  function detectKindFromDom(row, title) {
    const hay = [
      title,
      row?.getAttribute?.("aria-label") || "",
      row?.dataset?.id || "",
    ]
      .join(" ")
      .toLowerCase();
    if (hay.includes("@g.us")) return "group";
    if (/\b(group|community)\b/.test(hay)) return "group";
    if (
      row?.querySelector?.(
        '[data-testid="default-group"], [data-icon="default-group"], [data-testid="group"], span[data-icon="default-group"]',
      )
    ) {
      return "group";
    }
    return "contact";
  }

  function phoneFromDomTitle(title) {
    const match = String(title || "").match(/(\+?\d[\d\s-]{5,18}\d)/);
    return match ? formatPhone(match[1]) : "";
  }

  function scrapeChatList() {
    const pane =
      document.querySelector("#pane-side") ||
      document.querySelector('[data-testid="chat-list"]') ||
      document.querySelector('[aria-label="Chat list"]');
    if (!pane) return [];

    const rows = [
      ...pane.querySelectorAll('[data-testid="cell-frame-container"]'),
      ...pane.querySelectorAll('[role="listitem"]'),
      ...pane.querySelectorAll('[role="row"]'),
    ];

    const seenNames = new Set();
    const chats = [];
    for (const row of rows) {
      const titleEl =
        row.querySelector('[data-testid="cell-frame-title"] span[title]') ||
        row.querySelector('[data-testid="cell-frame-title"]') ||
        row.querySelector('span[dir="auto"][title]') ||
        row.querySelector("span[title]");
      const name = firstGoodName(
        titleEl?.getAttribute("title"),
        textOf(titleEl),
      );
      if (!name) continue;
      const nameKey = name.toLowerCase();
      if (seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);
      const kind = detectKindFromDom(row, name);
      const phone = kind === "contact" ? phoneFromDomTitle(name) : "";
      chats.push({
        id: hashId(`chat:${kind}:${nameKey}`),
        name,
        kind,
        phone: phone || null,
      });
      if (chats.length >= 80) break;
    }
    return chats;
  }

  /**
   * Visible messages in the open conversation pane (cheap vs Store msgs).
   * @param {number} limit
   * @param {string} [fallbackChatName]
   */
  function scrapeActiveChatMessages(limit = 40, fallbackChatName = "") {
    const header =
      document.querySelector("#main header span[title]") ||
      document.querySelector(
        '#main header [data-testid="conversation-info-header-chat-title"]',
      ) ||
      document.querySelector(
        "#main header [data-testid='conversation-info-header'] span[title]",
      ) ||
      document.querySelector("#main header span[dir='auto']");
    const chatNameText =
      firstGoodName(header?.getAttribute("title"), textOf(header)) ||
      fallbackChatName;
    if (!chatNameText) return [];

    const main =
      document.querySelector('[data-testid="conversation-panel-messages"]') ||
      document.querySelector("#main div[role='application']") ||
      document.querySelector("#main");
    if (!main) return [];

    // Prefer msg-container only — fewer duplicate nodes than sweeping data-id.
    let nodes = [...main.querySelectorAll('[data-testid="msg-container"]')];
    if (nodes.length === 0) {
      nodes = [...main.querySelectorAll(".message-in, .message-out")];
    }
    const chatIdHint = hashId(`chat:active:${chatNameText.toLowerCase()}`);
    const seen = new Set();
    const messages = [];
    const slice = nodes.length > limit ? nodes.slice(nodes.length - limit) : nodes;
    for (const node of slice) {
      const copyable =
        node.querySelector('[data-testid="msg-text"]') ||
        node.querySelector(".copyable-text") ||
        node.querySelector("span.selectable-text.copyable-text") ||
        node.querySelector("span.selectable-text");
      let body = textOf(
        copyable?.querySelector?.("span.selectable-text") || copyable,
      );
      if (!body) {
        if (node.querySelector('[data-testid="audio-play"]')) {
          body = "[voice message]";
        } else if (node.querySelector("img, video")) {
          body = "[media]";
        } else {
          continue;
        }
      }

      const dataId =
        node.getAttribute("data-id") ||
        node.closest?.("[data-id]")?.getAttribute("data-id") ||
        "";
      const pre =
        copyable?.getAttribute?.("data-pre-plain-text") ||
        node
          .querySelector?.("[data-pre-plain-text]")
          ?.getAttribute("data-pre-plain-text") ||
        "";
      const id = dataId || hashId(`${chatIdHint}|${pre}|${body}`);
      if (seen.has(id)) continue;
      seen.add(id);

      const looksOutgoing =
        node.classList.contains("message-out") ||
        dataId.startsWith("true_") ||
        Boolean(node.querySelector('[data-icon="msg-check"]')) ||
        Boolean(node.querySelector('[data-icon="msg-dblcheck"]')) ||
        Boolean(node.querySelector('[data-testid="msg-dblcheck"]'));

      messages.push({
        id,
        body,
        senderName: looksOutgoing ? "You" : chatNameText,
        fromMe: looksOutgoing,
        timestamp: Date.now() - (messages.length + 1) * 1000,
      });
    }
    return messages;
  }

  function scrapeActiveChat() {
    const header =
      document.querySelector("#main header span[title]") ||
      document.querySelector(
        '#main header [data-testid="conversation-info-header-chat-title"]',
      ) ||
      document.querySelector(
        "#main header [data-testid='conversation-info-header'] span[title]",
      ) ||
      document.querySelector("#main header span[dir='auto']");

    const chatNameText = firstGoodName(
      header?.getAttribute("title"),
      textOf(header),
    );
    if (!chatNameText) return null;

    const headerRow =
      document.querySelector("#main header") || header?.closest("header");
    const kind = detectKindFromDom(headerRow, chatNameText);
    const phone = kind === "contact" ? phoneFromDomTitle(chatNameText) : "";
    const chatId = hashId(`chat:${kind}:${chatNameText.toLowerCase()}`);
    const messages = scrapeActiveChatMessages(40, chatNameText);
    if (!document.querySelector("#main")) return null;

    return {
      chat: {
        id: chatId,
        name: chatNameText,
        kind,
        phone: phone || null,
      },
      messages,
    };
  }

  function snapshotFromDom() {
    const scraped = scrapeActiveChat();
    let active = scraped;
    if (scraped?.chat && !isAllowedMeta(scraped.chat)) {
      active = { chat: scraped.chat, messages: [] };
    }
    if (!hasAllowlist() && scraped) {
      active = { chat: scraped.chat, messages: [] };
    }
    return {
      chats: scrapeChatList().slice(0, 80),
      active,
      warm: [],
      mode: "dom",
      path: "dom",
      debug: {
        activeChat: active?.chat?.name || null,
        activeMessages: active?.messages?.length || 0,
        allowCount: STATE.allow.ids.size,
        waVersion: window.Debug?.VERSION || null,
        hasRequire: typeof window.require === "function",
      },
    };
  }

  async function ensureStore(timeoutMs = 60000) {
    if (STATE.store) return STATE.store;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (typeof window.require === "function") {
        const store = buildStore();
        if (store?.Chat) {
          // Drop Msg collection ref — we never subscribe; holding it keeps the
          // giant message index alive for GC.
          store.Msg = null;
          STATE.store = store;
          STATE.path = store.path;
          post("status", {
            mode: "store",
            path: store.path,
            ready: true,
            waVersion: window.Debug?.VERSION || null,
          });
          return store;
        }
      }
      await sleep(800);
    }
    post("status", {
      mode: "dom",
      path: "dom",
      ready: true,
      waVersion: window.Debug?.VERSION || null,
      hasRequire: typeof window.require === "function",
    });
    return null;
  }

  let snapshotInFlight = false;
  /** @type {string | null} */
  let lastPostedActiveId = null;

  function publishActiveChatHint(store) {
    try {
      let meta = null;
      if (store) {
        const activeChat = activeStoreChat(store);
        meta = activeChat ? chatMetaLight(activeChat) : null;
      } else {
        meta = scrapeActiveChat()?.chat || null;
      }
      const id = meta?.id ? String(meta.id) : null;
      if (id === lastPostedActiveId) return;
      lastPostedActiveId = id;
      post("activeChat", { chat: meta });
    } catch {
      // ignore
    }
  }

  async function publishSnapshot(opts = {}) {
    if (snapshotInFlight) return;
    const minGap = opts.force
      ? 0
      : opts.messagesOnly
        ? 20000
        : STATE.store
          ? 60000
          : 20000;
    const now = Date.now();
    if (!opts.force && now - STATE.lastSnapshotAt < minGap) return;
    snapshotInFlight = true;
    if (!opts.messagesOnly) STATE.lastSnapshotAt = now;
    try {
      const snapshot = STATE.store
        ? await snapshotFromStore(STATE.store, opts)
        : snapshotFromDom();
      if (snapshot?.active?.chat?.id) {
        lastPostedActiveId = String(snapshot.active.chat.id);
      }
      post("snapshot", snapshot);
    } catch (error) {
      post("error", { message: String(error?.message || error) });
    } finally {
      snapshotInFlight = false;
    }
  }

  window.__catchupSetPolicy = setPolicy;

  window.__catchupForceSnapshot = (deep = true) => {
    // Deep only on active allowlisted chat; skip warm by default (hydrates msgs).
    publishSnapshot({
      deep: Boolean(deep) && hasAllowlist(),
      includeWarm: false,
      force: true,
    });
  };

  async function boot() {
    await publishSnapshot({ deep: false, includeWarm: false, force: true });
    const store = await ensureStore();
    await publishSnapshot({ deep: false, includeWarm: false, force: true });
    publishActiveChatHint(store);

    // Follow open chat for Summaries — Chat.getActive() only (no catalog scan).
    setInterval(() => {
      publishActiveChatHint(STATE.store);
    }, 5000);

    // Catalog via DOM scrape only.
    setInterval(() => {
      publishSnapshot({ deep: false, includeWarm: false, catalogOnly: true });
    }, 120000);

    // Allowlisted active messages — DOM-first, slow cadence.
    setInterval(() => {
      if (!hasAllowlist()) return;
      publishSnapshot({
        deep: false,
        includeWarm: false,
        messagesOnly: true,
        force: true,
      });
    }, 90000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      boot();
    });
  } else {
    boot();
  }
})();
