const Database = require("better-sqlite3");
const { ensureDbDir, getDbPath, redactHomePath } = require("./paths");
const { assertSafeBaseUrl } = require("../ai/gateway");

/** @type {import("better-sqlite3").Database | null} */
let db = null;

function getDb() {
  if (db) return db;
  const filePath = getDbPath();
  ensureDbDir(filePath);
  db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/**
 * @param {import("better-sqlite3").Database} database
 */
function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'contact',
      phone TEXT,
      last_message_at INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      body TEXT NOT NULL,
      sender_name TEXT,
      from_me INTEGER NOT NULL DEFAULT 0,
      timestamp INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_time
      ON messages(chat_id, timestamp DESC);

    CREATE TABLE IF NOT EXISTS allowlist (
      chat_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS summary_prefs (
      chat_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'messages',
      interval_minutes INTEGER NOT NULL DEFAULT 60,
      message_threshold INTEGER NOT NULL DEFAULT 20,
      max_tokens INTEGER NOT NULL DEFAULT 512,
      extra_prompt TEXT NOT NULL DEFAULT '',
      last_summary_at INTEGER,
      last_message_ts INTEGER,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      body TEXT NOT NULL,
      mode TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      from_ts INTEGER,
      to_ts INTEGER,
      model TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_summaries_chat_time
      ON summaries(chat_id, created_at DESC);
  `);

  const chatColumns = database
    .prepare(`PRAGMA table_info(chats)`)
    .all()
    .map((row) => row.name);
  if (!chatColumns.includes("phone")) {
    database.exec(`ALTER TABLE chats ADD COLUMN phone TEXT`);
  }

  const summaryColumns = database
    .prepare(`PRAGMA table_info(summaries)`)
    .all()
    .map((row) => row.name);
  if (!summaryColumns.includes("truncated")) {
    database.exec(
      `ALTER TABLE summaries ADD COLUMN truncated INTEGER NOT NULL DEFAULT 0`,
    );
  }

  const summaryPrefColumns = database
    .prepare(`PRAGMA table_info(summary_prefs)`)
    .all()
    .map((row) => row.name);
  if (!summaryPrefColumns.includes("max_tokens")) {
    database.exec(
      `ALTER TABLE summary_prefs ADD COLUMN max_tokens INTEGER NOT NULL DEFAULT 512`,
    );
  }

  // Repair kind/phone from WhatsApp ids; drop junk catalog titles.
  database
    .prepare(
      `UPDATE chats SET kind = 'group' WHERE id LIKE '%@g.us' AND kind != 'group'`,
    )
    .run();
  database
    .prepare(
      `
      UPDATE chats
      SET phone = '+' || REPLACE(REPLACE(id, '@c.us', ''), '+', '')
      WHERE kind = 'contact'
        AND id LIKE '%@c.us'
        AND (phone IS NULL OR phone = '')
        AND REPLACE(REPLACE(id, '@c.us', ''), '+', '') GLOB '[0-9]*'
        AND length(REPLACE(REPLACE(id, '@c.us', ''), '+', '')) BETWEEN 6 AND 15
    `,
    )
    .run();
  database
    .prepare(
      `
      DELETE FROM chats
      WHERE (name LIKE '%unread message%' OR name GLOB '[0-9]* unread*')
        AND id NOT IN (SELECT chat_id FROM allowlist)
    `,
    )
    .run();

  // Repair dirty titles still referenced by the allowlist, then collapse dupes.
  repairChatCatalog(database);
}

/**
 * Clean titles and merge duplicate catalog rows (safe to run on open).
 * @param {import("better-sqlite3").Database} database
 */
function repairChatCatalog(database) {
  const rows = database.prepare(`SELECT id, name FROM chats`).all();
  const updateName = database.prepare(
    `UPDATE chats SET name = ? WHERE id = ? AND name != ?`,
  );
  for (const row of rows) {
    const cleaned = cleanChatName(row.name);
    if (cleaned && cleaned !== row.name) {
      // Third bind is the *new* name so the row updates when it still differs.
      updateName.run(cleaned, row.id, cleaned);
    }
  }
  consolidateDuplicateChats(database);
}

function cleanChatName(name) {
  let s = String(name || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  // Badge may be glued to the title: "29 unread messagesAKS_withSeek"
  s = s.replace(/^\d+\s*unread\s*messages?/i, "");
  s = s.replace(/^\d+\s*unread\b/i, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s || s.length > 120) return "";
  if (/^\d+\s*unread\b/i.test(s) || /^unread\b/i.test(s)) return "";
  return s;
}

function chatIdRank(id) {
  const value = String(id || "");
  if (value.includes("@g.us") || value.includes("@c.us") || value.includes("@lid")) {
    return 3;
  }
  if (value.startsWith("dom_")) return 1;
  return 2;
}

/** @type {number} */
let lastConsolidateAt = 0;

function maybeConsolidateDuplicateChats(database) {
  const now = Date.now();
  if (now - lastConsolidateAt < 60_000) return;
  lastConsolidateAt = now;
  consolidateDuplicateChats(database);
}

/**
 * Collapse duplicate catalog rows (same cleaned name) created by DOM hash churn.
 * @param {import("better-sqlite3").Database} database
 */
function consolidateDuplicateChats(database) {
  const rows = database
    .prepare(
      `
      SELECT id, name, kind, phone, last_message_at, updated_at
      FROM chats
    `,
    )
    .all();

  const updateName = database.prepare(
    `UPDATE chats SET name = ? WHERE id = ? AND name != ?`,
  );
  /** @type {Map<string, typeof rows>} */
  const groups = new Map();

  for (const row of rows) {
    const cleaned = cleanChatName(row.name);
    if (!cleaned) {
      // Drop unread-only junk not on allowlist.
      const allowed = database
        .prepare(`SELECT 1 AS ok FROM allowlist WHERE chat_id = ? LIMIT 1`)
        .get(row.id);
      if (!allowed) {
        database.prepare(`DELETE FROM messages WHERE chat_id = ?`).run(row.id);
        database.prepare(`DELETE FROM chats WHERE id = ?`).run(row.id);
      }
      continue;
    }
    if (cleaned !== row.name) {
      updateName.run(cleaned, row.id, cleaned);
      row.name = cleaned;
    }
    const key = `${row.kind || "contact"}::${cleaned.toLowerCase()}`;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }

  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => {
      const rankDiff = chatIdRank(b.id) - chatIdRank(a.id);
      if (rankDiff !== 0) return rankDiff;
      return String(a.id).localeCompare(String(b.id));
    });
    const keeper = list[0];
    const losers = list.slice(1);

    for (const loser of losers) {
      const loserAllowed = database
        .prepare(
          `SELECT enabled FROM allowlist WHERE chat_id = ? LIMIT 1`,
        )
        .get(loser.id);
      if (loserAllowed?.enabled) {
        database
          .prepare(
            `
            INSERT INTO allowlist (chat_id, enabled, updated_at)
            VALUES (?, 1, ?)
            ON CONFLICT(chat_id) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at
          `,
          )
          .run(keeper.id, Date.now());
      }
      const keeperMessageIds = database
        .prepare(`SELECT id FROM messages WHERE chat_id = ?`)
        .all(keeper.id)
        .map((row) => row.id);
      if (keeperMessageIds.length > 0) {
        const placeholders = keeperMessageIds.map(() => "?").join(",");
        database
          .prepare(
            `DELETE FROM messages WHERE chat_id = ? AND id IN (${placeholders})`,
          )
          .run(loser.id, ...keeperMessageIds);
      }
      database
        .prepare(`UPDATE messages SET chat_id = ? WHERE chat_id = ?`)
        .run(keeper.id, loser.id);

      // Remap summary rows before CASCADE delete would wipe them.
      const loserPrefs = database
        .prepare(`SELECT * FROM summary_prefs WHERE chat_id = ?`)
        .get(loser.id);
      if (loserPrefs) {
        const keeperPrefs = database
          .prepare(`SELECT * FROM summary_prefs WHERE chat_id = ?`)
          .get(keeper.id);
        if (!keeperPrefs) {
          database
            .prepare(`UPDATE summary_prefs SET chat_id = ? WHERE chat_id = ?`)
            .run(keeper.id, loser.id);
        } else {
          const enabled =
            keeperPrefs.enabled === 1 || loserPrefs.enabled === 1 ? 1 : 0;
          const extra =
            String(keeperPrefs.extra_prompt || "").trim() ||
            String(loserPrefs.extra_prompt || "");
          const lastSummaryAt = Math.max(
            Number(keeperPrefs.last_summary_at) || 0,
            Number(loserPrefs.last_summary_at) || 0,
          ) || null;
          const lastMessageTs = Math.max(
            Number(keeperPrefs.last_message_ts) || 0,
            Number(loserPrefs.last_message_ts) || 0,
          ) || null;
          database
            .prepare(
              `
              UPDATE summary_prefs SET
                enabled = ?,
                extra_prompt = ?,
                last_summary_at = ?,
                last_message_ts = ?,
                updated_at = ?
              WHERE chat_id = ?
            `,
            )
            .run(
              enabled,
              extra,
              lastSummaryAt,
              lastMessageTs,
              Date.now(),
              keeper.id,
            );
          database
            .prepare(`DELETE FROM summary_prefs WHERE chat_id = ?`)
            .run(loser.id);
        }
      }
      database
        .prepare(`UPDATE summaries SET chat_id = ? WHERE chat_id = ?`)
        .run(keeper.id, loser.id);

      database.prepare(`DELETE FROM allowlist WHERE chat_id = ?`).run(loser.id);
      database.prepare(`DELETE FROM chats WHERE id = ?`).run(loser.id);
    }

    if (!keeper.phone) {
      const phone =
        losers.map((row) => row.phone).find(Boolean) ||
        phoneFromChatId(keeper.id, keeper.kind);
      if (phone) {
        database
          .prepare(`UPDATE chats SET phone = ? WHERE id = ? AND (phone IS NULL OR phone = '')`)
          .run(phone, keeper.id);
      }
    }
  }
}

function normalizeKind(kind, chatId) {
  const id = String(chatId || "");
  if (id.includes("@g.us")) return "group";
  return kind === "group" ? "group" : "contact";
}

function normalizePhone(phone, kind) {
  if (kind === "group") return null;
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  if (!digits) return null;
  const bare = digits.replace(/^\+/, "");
  if (!/^\d{6,15}$/.test(bare)) return null;
  return `+${bare}`;
}

function phoneFromChatId(chatId, kind) {
  if (kind === "group") return null;
  const id = String(chatId || "");
  if (!id.endsWith("@c.us")) return null;
  return normalizePhone(id.slice(0, -"@c.us".length), kind);
}

/**
 * @param {Array<{ id: string, name: string, kind?: string, phone?: string | null }>} chats
 */
function upsertChats(chats) {
  const database = getDb();
  const now = Date.now();
  const stmt = database.prepare(`
    INSERT INTO chats (id, name, kind, phone, last_message_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = CASE
        WHEN excluded.name IS NULL OR excluded.name = '' THEN chats.name
        WHEN excluded.name LIKE '%unread message%' THEN chats.name
        ELSE excluded.name
      END,
      kind = excluded.kind,
      phone = COALESCE(excluded.phone, chats.phone),
      updated_at = excluded.updated_at
  `);

  /** @type {Map<string, { id: string, name: string, kind: string, phone: string | null }>} */
  const unique = new Map();
  for (const chat of chats) {
    if (!chat?.id) continue;
    const name = cleanChatName(chat.name);
    if (!name) continue;
    const kind = normalizeKind(chat.kind, chat.id);
    const phone =
      normalizePhone(chat.phone, kind) || phoneFromChatId(chat.id, kind);
    const key = `${kind}::${name.toLowerCase()}`;
    const existing = unique.get(key);
    if (!existing || chatIdRank(chat.id) > chatIdRank(existing.id)) {
      unique.set(key, { id: chat.id, name, kind, phone });
    }
  }

  const insertMany = database.transaction((rows) => {
    for (const chat of rows) {
      stmt.run(chat.id, chat.name, chat.kind, chat.phone, now);
    }
  });
  insertMany([...unique.values()]);

  maybeConsolidateDuplicateChats(database);
  pruneUnselectedCatalog();
}

/**
 * @param {string} chatId
 * @param {string} chatName
 * @param {string} [kind]
 * @param {Array<{ id: string, body: string, senderName?: string, fromMe?: boolean, timestamp?: number }>} messages
 * @param {string | null} [phone]
 */
function upsertMessages(chatId, chatName, kind, messages, phone = null) {
  if (!chatId || !Array.isArray(messages) || messages.length === 0) return 0;

  const database = getDb();
  const now = Date.now();
  const resolvedKind = normalizeKind(kind, chatId);
  const resolvedPhone =
    normalizePhone(phone, resolvedKind) ||
    phoneFromChatId(chatId, resolvedKind);
  const cleaned = cleanChatName(chatName);
  const resolvedName = cleaned || String(chatId);
  const latestTs = messages.reduce((max, message) => {
    const ts = Number(message?.timestamp) || 0;
    return ts > max ? ts : max;
  }, 0);

  database
    .prepare(
      `
    INSERT INTO chats (id, name, kind, phone, last_message_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = CASE
        WHEN excluded.name IS NULL OR excluded.name = '' THEN chats.name
        WHEN excluded.name LIKE '%unread message%' THEN chats.name
        ELSE excluded.name
      END,
      kind = excluded.kind,
      phone = COALESCE(excluded.phone, chats.phone),
      last_message_at = MAX(
        COALESCE(chats.last_message_at, 0),
        excluded.last_message_at
      ),
      updated_at = excluded.updated_at
  `,
    )
    .run(
      chatId,
      resolvedName,
      resolvedKind,
      resolvedPhone,
      latestTs || now,
      now,
    );

  const stmt = database.prepare(`
    INSERT INTO messages (id, chat_id, body, sender_name, from_me, timestamp, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      body = excluded.body,
      sender_name = excluded.sender_name,
      from_me = excluded.from_me,
      timestamp = excluded.timestamp
  `);

  const insertMany = database.transaction((rows) => {
    let written = 0;
    for (const message of rows) {
      if (!message?.id || !message?.body) continue;
      const ts = Number(message.timestamp) || now;
      stmt.run(
        message.id,
        chatId,
        message.body,
        message.senderName || null,
        message.fromMe ? 1 : 0,
        ts,
        now,
      );
      written += 1;
    }
    return written;
  });
  return insertMany(messages);
}


function mapChatListRow(row) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    phone: row.phone || null,
    lastMessageAt: row.lastMessageAt,
    allowed: Boolean(row.allowed),
    summaryEnabled: Boolean(row.summaryEnabled),
    summaryMode: row.summaryMode === "time" ? "time" : "messages",
    summaryIntervalMinutes: Number(row.summaryIntervalMinutes) || 60,
    summaryMessageThreshold: Number(row.summaryMessageThreshold) || 20,
    summaryMaxTokens: Number(row.summaryMaxTokens) || 512,
    summaryExtraPrompt: String(row.summaryExtraPrompt || ""),
    lastSummaryAt: row.lastSummaryAt || null,
    lastSummarizedMessageTs: row.lastSummarizedMessageTs || null,
    messageCount: Number(row.messageCount) || 0,
    summaryCount: Number(row.summaryCount) || 0,
  };
}

const CHAT_LIST_SELECT = `
    SELECT
      c.id,
      c.name,
      c.kind,
      c.phone,
      c.last_message_at AS lastMessageAt,
      COALESCE(a.enabled, 0) AS allowed,
      COALESCE(sp.enabled, 0) AS summaryEnabled,
      COALESCE(sp.mode, 'messages') AS summaryMode,
      COALESCE(sp.interval_minutes, 60) AS summaryIntervalMinutes,
      COALESCE(sp.message_threshold, 20) AS summaryMessageThreshold,
      COALESCE(sp.max_tokens, 512) AS summaryMaxTokens,
      COALESCE(sp.extra_prompt, '') AS summaryExtraPrompt,
      sp.last_summary_at AS lastSummaryAt,
      sp.last_message_ts AS lastSummarizedMessageTs,
      (
        SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id
      ) AS messageCount,
      (
        SELECT COUNT(*) FROM summaries s WHERE s.chat_id = c.id
      ) AS summaryCount
    FROM chats c
    LEFT JOIN allowlist a ON a.chat_id = c.id AND a.enabled = 1
    LEFT JOIN summary_prefs sp ON sp.chat_id = c.id
`;

function listChats() {
  return getDb()
    .prepare(
      `
    ${CHAT_LIST_SELECT}
    ORDER BY
      COALESCE(sp.enabled, 0) DESC,
      COALESCE(a.enabled, 0) DESC,
      COALESCE(c.last_message_at, c.updated_at) DESC,
      c.name COLLATE NOCASE ASC
  `,
    )
    .all()
    .map(mapChatListRow);
}

/**
 * @param {string} chatId
 */
function getChatById(chatId) {
  if (!chatId) return null;
  const row = getDb()
    .prepare(`${CHAT_LIST_SELECT} WHERE c.id = ? LIMIT 1`)
    .get(chatId);
  return row ? mapChatListRow(row) : null;
}

/**
 * Resolve an open WhatsApp chat to a catalog row (id or cleaned name).
 * Unlike resolveSyncedChat, does not require allowlist membership.
 * @param {{ id?: string, name?: string, kind?: string, phone?: string | null } | null | undefined} chat
 * @returns {{ id: string, name: string, kind: string, phone: string | null } | null}
 */
function resolveCatalogChat(chat) {
  if (!chat?.id && !chat?.name) return null;
  const kind = normalizeKind(chat.kind, chat.id);
  const cleaned = cleanChatName(chat.name) || cleanChatName(String(chat.id || ""));
  const phone =
    normalizePhone(chat.phone, kind) || phoneFromChatId(chat.id, kind);

  if (chat.id) {
    const byId = getDb()
      .prepare(`SELECT id, name, kind, phone FROM chats WHERE id = ? LIMIT 1`)
      .get(chat.id);
    if (byId) {
      return {
        id: byId.id,
        name: cleaned || cleanChatName(byId.name) || byId.id,
        kind: normalizeKind(byId.kind, byId.id),
        phone: phone || normalizePhone(byId.phone, kind),
      };
    }
  }

  const needle = (cleaned || "").toLowerCase();
  if (!needle) {
    if (!chat.id) return null;
    return {
      id: String(chat.id),
      name: cleaned || String(chat.id),
      kind,
      phone,
    };
  }

  const rows = getDb()
    .prepare(`SELECT id, name, kind, phone FROM chats`)
    .all();
  /** @type {typeof rows[number] | null} */
  let soft = null;
  for (const row of rows) {
    const rowName = cleanChatName(row.name).toLowerCase();
    if (!rowName || rowName !== needle) continue;
    if (normalizeKind(row.kind, row.id) === kind) {
      return {
        id: row.id,
        name: cleaned,
        kind,
        phone: phone || normalizePhone(row.phone, kind),
      };
    }
    soft = soft || row;
  }
  if (soft) {
    return {
      id: soft.id,
      name: cleaned || cleanChatName(soft.name) || soft.id,
      kind: normalizeKind(soft.kind, soft.id),
      phone: phone || normalizePhone(soft.phone, kind),
    };
  }

  if (!chat.id) return null;
  return {
    id: String(chat.id),
    name: cleaned || String(chat.id),
    kind,
    phone,
  };
}

/**
 * Ensure a chat stays on the MCP/message sync allowlist without wiping others.
 * @param {string} chatId
 */
function ensureAllowlisted(chatId) {
  if (!chatId) return;
  getDb()
    .prepare(
      `
      INSERT INTO allowlist (chat_id, enabled, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(chat_id) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at
    `,
    )
    .run(chatId, Date.now());
}

/**
 * Insert/update one chat row without consolidate/prune (safe for Sync toggle).
 * @param {{ id: string, name?: string, kind?: string, phone?: string | null }} chat
 */
function ensureChatRow(chat) {
  if (!chat?.id) return;
  const name = cleanChatName(chat.name);
  if (!name) return;
  const kind = normalizeKind(chat.kind, chat.id);
  const phone =
    normalizePhone(chat.phone, kind) || phoneFromChatId(chat.id, kind);
  const now = Date.now();
  getDb()
    .prepare(
      `
      INSERT INTO chats (id, name, kind, phone, last_message_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = CASE
          WHEN excluded.name IS NULL OR excluded.name = '' THEN chats.name
          WHEN excluded.name LIKE '%unread message%' THEN chats.name
          ELSE excluded.name
        END,
        kind = excluded.kind,
        phone = COALESCE(excluded.phone, chats.phone),
        updated_at = excluded.updated_at
    `,
    )
    .run(chat.id, name, kind, phone, now);
}

/**
 * Toggle sync for a single chat (Access sheet). Does not replace the full list.
 * @param {string} chatId
 * @param {boolean} synced
 * @param {{ name?: string, kind?: string, phone?: string | null }} [meta]
 */
function setChatSynced(chatId, synced, meta) {
  if (!chatId) throw new Error("chatId required");

  if (synced) {
    ensureAllowlisted(chatId);
    if (meta?.name) {
      ensureChatRow({
        id: chatId,
        name: meta.name,
        kind: meta.kind || "contact",
        phone: meta.phone ?? null,
      });
    }
  } else {
    const prefs = getDb()
      .prepare(`SELECT enabled FROM summary_prefs WHERE chat_id = ?`)
      .get(chatId);
    if (prefs?.enabled) {
      setSummaryPrefs(chatId, { enabled: false });
    }
    getDb().prepare(`DELETE FROM allowlist WHERE chat_id = ?`).run(chatId);
    getDb().prepare(`DELETE FROM messages WHERE chat_id = ?`).run(chatId);
    pruneUnselectedCatalog();
  }

  return getChatById(chatId);
}

/**
 * Atomic Access-sheet save: summary prefs + sync membership.
 * @param {string} chatId
 * @param {{
 *   synced: boolean,
 *   summary: {
 *     enabled?: boolean,
 *     mode?: 'time' | 'messages',
 *     intervalMinutes?: number,
 *     messageThreshold?: number,
 *     maxTokens?: number,
 *     extraPrompt?: string,
 *   },
 *   meta?: { name?: string, kind?: string, phone?: string | null },
 * }} opts
 */
function saveChatSidebar(chatId, opts) {
  if (!chatId) throw new Error("chatId required");
  const summarizeOn = Boolean(opts?.summary?.enabled);
  const synced = Boolean(opts?.synced) || summarizeOn;
  setSummaryPrefs(chatId, { ...(opts?.summary || {}), enabled: summarizeOn });
  setChatSynced(chatId, synced, opts?.meta);
  return getChatById(chatId);
}

const DEFAULT_AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_AI_GATEWAY_MODEL = "anthropic/claude-sonnet-4.5";
// Keep these in sync with DEFAULT_BASE_URL in app/src/ai/gateway.js and the
// Vercel preset in app/src/renderer/renderer.js.

const DEFAULT_SYSTEM_PROMPT = `You are Catchup's chat summarizer. Summarize WhatsApp conversations clearly and factually.

Rules:
- Use only the messages provided. Never invent content.
- Prefer short paragraphs and bullet lists for decisions, action items, and open questions.
- Preserve names, times, and concrete commitments when present.
- If the thread is thin or unclear, say so briefly.`;

/**
 * @returns {{
 *   apiKeySet: boolean,
 *   baseUrl: string,
 *   model: string,
 *   zeroDataRetention: boolean,
 *   systemPrompt: string,
 * }}
 */
function getAiSettings() {
  return {
    apiKeySet: Boolean(getMeta("ai_gateway_api_key")),
    baseUrl: getMeta("ai_gateway_base_url") || DEFAULT_AI_GATEWAY_BASE_URL,
    model: getMeta("ai_gateway_model") || DEFAULT_AI_GATEWAY_MODEL,
    zeroDataRetention: getMeta("ai_gateway_zdr") !== "0",
    systemPrompt: getMeta("ai_system_prompt") || DEFAULT_SYSTEM_PROMPT,
  };
}

/**
 * @param {{
 *   apiKey?: string | null,
 *   baseUrl?: string,
 *   model?: string,
 *   zeroDataRetention?: boolean,
 *   systemPrompt?: string,
 * }} patch
 */
function setAiSettings(patch) {
  if (patch.apiKey != null) {
    const key = String(patch.apiKey).trim();
    if (key) setMeta("ai_gateway_api_key", key);
  }
  if (patch.baseUrl != null) {
    const url = String(patch.baseUrl).trim().replace(/\/$/, "");
    const resolved = url || DEFAULT_AI_GATEWAY_BASE_URL;
    assertSafeBaseUrl(resolved);
    setMeta("ai_gateway_base_url", resolved);
  }
  if (patch.model != null) {
    const model = String(patch.model).trim();
    if (model) setMeta("ai_gateway_model", model);
  }
  if (typeof patch.zeroDataRetention === "boolean") {
    setMeta("ai_gateway_zdr", patch.zeroDataRetention ? "1" : "0");
  }
  if (patch.systemPrompt != null) {
    setMeta("ai_system_prompt", String(patch.systemPrompt));
  }
  return getAiSettings();
}

function getAiGatewayApiKey() {
  return getMeta("ai_gateway_api_key") || "";
}

/**
 * Wipe stored summaries + cursors for a chat so the next enable/run starts fresh.
 * @param {string} chatId
 */
function clearSummariesForChat(chatId) {
  if (!chatId) return;
  const database = getDb();
  const now = Date.now();
  database.prepare(`DELETE FROM summaries WHERE chat_id = ?`).run(chatId);
  database
    .prepare(
      `
      UPDATE summary_prefs
      SET last_summary_at = NULL, last_message_ts = NULL, updated_at = ?
      WHERE chat_id = ?
    `,
    )
    .run(now, chatId);
}

/**
 * @param {string} chatId
 * @param {{
 *   enabled?: boolean,
 *   mode?: 'time' | 'messages',
 *   intervalMinutes?: number,
 *   messageThreshold?: number,
 *   maxTokens?: number,
 *   extraPrompt?: string,
 * }} patch
 */
function setSummaryPrefs(chatId, patch) {
  if (!chatId) throw new Error("chatId required");
  const database = getDb();
  const existing = database
    .prepare(`SELECT * FROM summary_prefs WHERE chat_id = ?`)
    .get(chatId);
  const enabled =
    typeof patch.enabled === "boolean"
      ? patch.enabled
      : Boolean(existing?.enabled);
  const mode =
    patch.mode === "time" || patch.mode === "messages"
      ? patch.mode
      : existing?.mode === "time"
        ? "time"
        : "messages";
  const intervalMinutes = Math.max(
    5,
    Number(patch.intervalMinutes ?? existing?.interval_minutes ?? 60) || 60,
  );
  const messageThreshold = Math.max(
    3,
    Number(patch.messageThreshold ?? existing?.message_threshold ?? 20) || 20,
  );
  const maxTokens = Math.min(
    4096,
    Math.max(
      64,
      Number(patch.maxTokens ?? existing?.max_tokens ?? 512) || 512,
    ),
  );
  const extraPrompt =
    patch.extraPrompt != null
      ? String(patch.extraPrompt)
      : String(existing?.extra_prompt || "");
  const now = Date.now();
  const wasEnabled = Boolean(existing?.enabled);

  // When disabling, drop history + cursors so re-enable summarizes from scratch.
  const lastSummaryAt = enabled ? (existing?.last_summary_at ?? null) : null;
  const lastMessageTs = enabled ? (existing?.last_message_ts ?? null) : null;

  database
    .prepare(
      `
      INSERT INTO summary_prefs (
        chat_id, enabled, mode, interval_minutes, message_threshold,
        max_tokens, extra_prompt, last_summary_at, last_message_ts, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET
        enabled = excluded.enabled,
        mode = excluded.mode,
        interval_minutes = excluded.interval_minutes,
        message_threshold = excluded.message_threshold,
        max_tokens = excluded.max_tokens,
        extra_prompt = excluded.extra_prompt,
        last_summary_at = excluded.last_summary_at,
        last_message_ts = excluded.last_message_ts,
        updated_at = excluded.updated_at
    `,
    )
    .run(
      chatId,
      enabled ? 1 : 0,
      mode,
      intervalMinutes,
      messageThreshold,
      maxTokens,
      extraPrompt,
      lastSummaryAt,
      lastMessageTs,
      now,
    );

  if (wasEnabled && !enabled) {
    clearSummariesForChat(chatId);
  }

  if (enabled) {
    ensureAllowlisted(chatId);
  }

  return getChatById(chatId);
}

const SUMMARY_SELECT = `
      SELECT
        id,
        chat_id AS chatId,
        body,
        mode,
        message_count AS messageCount,
        from_ts AS fromTs,
        to_ts AS toTs,
        model,
        truncated,
        created_at AS createdAt
      FROM summaries
`;

/**
 * One page of a chat's summaries, newest first. Pass `beforeCreatedAt` (the
 * last item's `createdAt` from the previous page) to page further back.
 * Fetches one extra row to report `hasMore` without a separate COUNT query.
 * @param {string} chatId
 * @param {{ limit?: number, beforeCreatedAt?: number }} [opts]
 */
function listSummaries(chatId, opts = {}) {
  const limit = Math.min(50, Math.max(1, Number(opts.limit) || 20));
  const beforeCreatedAt =
    opts.beforeCreatedAt != null ? Number(opts.beforeCreatedAt) : null;

  const rows = (
    Number.isFinite(beforeCreatedAt)
      ? getDb()
          .prepare(
            `${SUMMARY_SELECT} WHERE chat_id = ? AND created_at < ?
             ORDER BY created_at DESC LIMIT ?`,
          )
          .all(chatId, beforeCreatedAt, limit + 1)
      : getDb()
          .prepare(
            `${SUMMARY_SELECT} WHERE chat_id = ?
             ORDER BY created_at DESC LIMIT ?`,
          )
          .all(chatId, limit + 1)
  ).map((row) => ({ ...row, truncated: Boolean(row.truncated) }));

  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

/**
 * @param {{
 *   chatId: string,
 *   body: string,
 *   mode: string,
 *   messageCount: number,
 *   fromTs: number | null,
 *   toTs: number | null,
 *   model: string | null,
 *   truncated?: boolean,
 * }} summary
 */
function insertSummary(summary) {
  const id = `sum_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const createdAt = Date.now();
  const database = getDb();
  database
    .prepare(
      `
      INSERT INTO summaries (
        id, chat_id, body, mode, message_count, from_ts, to_ts, model, truncated, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      id,
      summary.chatId,
      summary.body,
      summary.mode,
      summary.messageCount,
      summary.fromTs,
      summary.toTs,
      summary.model,
      summary.truncated ? 1 : 0,
      createdAt,
    );
  database
    .prepare(
      `
      UPDATE summary_prefs
      SET last_summary_at = ?, last_message_ts = ?, updated_at = ?
      WHERE chat_id = ?
    `,
    )
    .run(createdAt, summary.toTs || createdAt, createdAt, summary.chatId);
  return {
    id,
    chatId: summary.chatId,
    body: summary.body,
    mode: summary.mode,
    messageCount: summary.messageCount,
    fromTs: summary.fromTs,
    toTs: summary.toTs,
    model: summary.model,
    truncated: Boolean(summary.truncated),
    createdAt,
  };
}

/**
 * Messages after a watermark for summarization, returned oldest → newest.
 * When the window holds more than `limit` messages, keeps the most RECENT
 * `limit` (queries DESC, then reverses) rather than the oldest — a
 * catch-up summary should never silently drop the newest activity.
 * @param {string} chatId
 * @param {number | null} afterTs
 * @param {number} [limit]
 */
function getMessagesSince(chatId, afterTs, limit = 200) {
  const capped = Math.min(500, Math.max(1, Number(limit) || 200));
  const rows = getDb()
    .prepare(
      `
      SELECT
        m.id,
        m.chat_id AS chatId,
        c.name AS chatName,
        m.body,
        m.sender_name AS senderName,
        m.from_me AS fromMe,
        m.timestamp
      FROM messages m
      INNER JOIN chats c ON c.id = m.chat_id
      WHERE m.chat_id = ?
        AND m.timestamp > ?
      ORDER BY m.timestamp DESC
      LIMIT ?
    `,
    )
    .all(chatId, Number(afterTs) || 0, capped)
    .reverse()
    .map(formatMessage);
  return rows;
}

/**
 * @param {string} chatId
 * @returns {{
 *   chatId: string,
 *   chatName: string,
 *   enabled: boolean,
 *   mode: 'time' | 'messages',
 *   intervalMinutes: number,
 *   messageThreshold: number,
 *   maxTokens: number,
 *   extraPrompt: string,
 *   lastSummaryAt: number,
 *   lastMessageTs: number,
 * } | null}
 */
function getSummaryPrefs(chatId) {
  if (!chatId) return null;
  const row = getDb()
    .prepare(
      `
      SELECT
        sp.chat_id AS chatId,
        c.name AS chatName,
        sp.enabled,
        sp.mode,
        sp.interval_minutes AS intervalMinutes,
        sp.message_threshold AS messageThreshold,
        sp.max_tokens AS maxTokens,
        sp.extra_prompt AS extraPrompt,
        sp.last_summary_at AS lastSummaryAt,
        sp.last_message_ts AS lastMessageTs
      FROM summary_prefs sp
      INNER JOIN chats c ON c.id = sp.chat_id
      WHERE sp.chat_id = ?
      LIMIT 1
    `,
    )
    .get(chatId);
  if (!row) return null;
  return {
    chatId: String(row.chatId),
    chatName: String(row.chatName || row.chatId),
    enabled: Boolean(row.enabled),
    mode: row.mode === "time" ? "time" : "messages",
    intervalMinutes: Number(row.intervalMinutes) || 60,
    messageThreshold: Number(row.messageThreshold) || 20,
    maxTokens: Number(row.maxTokens) || 512,
    extraPrompt: String(row.extraPrompt || ""),
    lastSummaryAt: Number(row.lastSummaryAt) || 0,
    lastMessageTs: Number(row.lastMessageTs) || 0,
  };
}

/**
 * @param {string} chatId
 * @param {number | null} afterTs
 */
function countMessagesSince(chatId, afterTs) {
  const row = getDb()
    .prepare(
      `
      SELECT COUNT(*) AS n FROM messages
      WHERE chat_id = ? AND timestamp > ?
    `,
    )
    .get(chatId, Number(afterTs) || 0);
  return Number(row?.n) || 0;
}

/**
 * @param {string} chatId
 * @returns {number} ms epoch, or 0 if none
 */
function getLatestMessageTimestamp(chatId) {
  if (!chatId) return 0;
  const row = getDb()
    .prepare(
      `
      SELECT MAX(timestamp) AS ts FROM messages
      WHERE chat_id = ?
    `,
    )
    .get(chatId);
  return Number(row?.ts) || 0;
}

/**
 * First page for a chat's Access panel: the latest summary plus the start
 * of its "earlier summaries" history. Further pages come from
 * `getEarlierSummaries`.
 * @param {string} chatId
 * @param {{ limit?: number }} [opts]
 */
function getSummaryBoard(chatId, opts = {}) {
  const { items, hasMore } = listSummaries(chatId, opts);
  return {
    chatId,
    latest: items[0] || null,
    previous: items.slice(1),
    hasMore,
  };
}

/**
 * A page of summaries strictly older than `beforeCreatedAt`, for infinite
 * scroll under "Earlier summary".
 * @param {string} chatId
 * @param {{ beforeCreatedAt: number, limit?: number }} opts
 */
function getEarlierSummaries(chatId, opts) {
  return listSummaries(chatId, {
    limit: opts?.limit,
    beforeCreatedAt: opts?.beforeCreatedAt ?? Date.now(),
  });
}

/**
 * Enabled chats that may be due for a summary run.
 */
function listEnabledSummaryPrefs() {
  return getDb()
    .prepare(
      `
      SELECT
        sp.chat_id AS chatId,
        c.name AS chatName,
        sp.enabled,
        sp.mode,
        sp.interval_minutes AS intervalMinutes,
        sp.message_threshold AS messageThreshold,
        sp.max_tokens AS maxTokens,
        sp.extra_prompt AS extraPrompt,
        sp.last_summary_at AS lastSummaryAt,
        sp.last_message_ts AS lastMessageTs
      FROM summary_prefs sp
      INNER JOIN chats c ON c.id = sp.chat_id
      WHERE sp.enabled = 1
    `,
    )
    .all()
    .map((row) => ({
      chatId: String(row.chatId),
      chatName: String(row.chatName || row.chatId),
      enabled: true,
      mode: row.mode === "time" ? "time" : "messages",
      intervalMinutes: Number(row.intervalMinutes) || 60,
      messageThreshold: Number(row.messageThreshold) || 20,
      maxTokens: Number(row.maxTokens) || 512,
      extraPrompt: String(row.extraPrompt || ""),
      lastSummaryAt: Number(row.lastSummaryAt) || 0,
      lastMessageTs: Number(row.lastMessageTs) || 0,
    }));
}

function isChatSynced(chatId) {
  if (!chatId) return false;
  const row = getDb()
    .prepare(
      `SELECT 1 AS ok FROM allowlist WHERE chat_id = ? AND enabled = 1 LIMIT 1`,
    )
    .get(chatId);
  return Boolean(row?.ok);
}

/**
 * Map an incoming chat to an allowlisted row. DOM hash IDs churn when titles
 * change case / unread prefixes, so fall back to cleaned name (kind soft).
 * @param {{ id?: string, name?: string, kind?: string, phone?: string | null } | null | undefined} chat
 * @returns {{ id: string, name: string, kind: string, phone: string | null } | null}
 */
function resolveSyncedChat(chat) {
  if (!chat?.id) return null;
  const kind = normalizeKind(chat.kind, chat.id);
  const cleaned = cleanChatName(chat.name) || cleanChatName(String(chat.id));
  const phone =
    normalizePhone(chat.phone, kind) || phoneFromChatId(chat.id, kind);

  if (isChatSynced(chat.id)) {
    return {
      id: chat.id,
      name: cleaned || String(chat.id),
      kind,
      phone,
    };
  }

  const rows = getDb()
    .prepare(
      `
      SELECT c.id, c.name, c.kind, c.phone
      FROM chats c
      INNER JOIN allowlist a ON a.chat_id = c.id AND a.enabled = 1
    `,
    )
    .all();

  if (rows.length === 0) return null;

  const needle = (cleaned || "").toLowerCase();
  /** @type {typeof rows[number] | null} */
  let softName = null;

  if (needle) {
    for (const row of rows) {
      const rowName = cleanChatName(row.name).toLowerCase();
      if (!rowName || rowName !== needle) continue;
      if (normalizeKind(row.kind, row.id) === kind) {
        return {
          id: row.id,
          name: cleaned,
          kind,
          phone: phone || normalizePhone(row.phone, kind),
        };
      }
      softName = softName || row;
    }
  }

  if (phone) {
    for (const row of rows) {
      const rowPhone =
        normalizePhone(row.phone, normalizeKind(row.kind, row.id)) ||
        phoneFromChatId(row.id, normalizeKind(row.kind, row.id));
      if (rowPhone && rowPhone === phone) {
        return {
          id: row.id,
          name: cleaned || cleanChatName(row.name) || row.id,
          kind: normalizeKind(row.kind, row.id),
          phone,
        };
      }
    }
  }

  if (softName) {
    return {
      id: softName.id,
      name: cleaned || cleanChatName(softName.name) || softName.id,
      kind: normalizeKind(softName.kind, softName.id),
      phone: phone || normalizePhone(softName.phone, kind),
    };
  }

  return null;
}

/**
 * @param {string[]} chatIds
 */
function setAllowlist(chatIds) {
  const database = getDb();
  const now = Date.now();
  // Summary-enabled chats always stay allowlisted so message sync keeps working.
  const clear = database.prepare("DELETE FROM allowlist");
  const insert = database.prepare(`
    INSERT INTO allowlist (chat_id, enabled, updated_at)
    VALUES (?, 1, ?)
  `);

  const summaryIds = database
    .prepare(`SELECT chat_id AS id FROM summary_prefs WHERE enabled = 1`)
    .all()
    .map((row) => String(row.id));
  const ids = [
    ...new Set([
      ...chatIds.filter((id) => typeof id === "string" && id),
      ...summaryIds,
    ]),
  ];

  const apply = database.transaction((selectedIds) => {
    clear.run();
    for (const id of selectedIds) {
      insert.run(id, now);
    }
    // Drop message bodies for chats no longer selected.
    if (selectedIds.length === 0) {
      database.prepare("DELETE FROM messages").run();
    } else {
      const placeholders = selectedIds.map(() => "?").join(",");
      database
        .prepare(`DELETE FROM messages WHERE chat_id NOT IN (${placeholders})`)
        .run(...selectedIds);
    }
  });
  apply(ids);
  // Merge any catalog dupes created by DOM id churn after the user saves.
  consolidateDuplicateChats(database);
  pruneUnselectedCatalog();

  return listChats();
}

function listAllowedChats() {
  return getDb()
    .prepare(
      `
    SELECT c.id, c.name, c.kind, c.phone, c.last_message_at AS lastMessageAt
    FROM chats c
    INNER JOIN allowlist a ON a.chat_id = c.id AND a.enabled = 1
    ORDER BY c.name COLLATE NOCASE ASC
  `,
    )
    .all();
}

/**
 * Compact allowlist payload for the WhatsApp inject (ids + lowercase names).
 * @returns {{ ids: string[], names: string[] }}
 */
function getAllowlistPolicy() {
  const rows = listAllowedChats();
  const ids = [];
  const names = [];
  for (const row of rows) {
    if (row.id) ids.push(String(row.id));
    const cleaned = cleanChatName(row.name).toLowerCase();
    if (cleaned) names.push(cleaned);
  }
  return { ids, names };
}

const RATE_META_KEY = "wa_rate_limit_v1";

/**
 * Sliding-window rate limit persisted in meta (survives restarts).
 * @param {string} bucket
 * @param {{ max: number, windowMs: number }} rules
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
function checkRateLimit(bucket, rules) {
  const max = Math.max(1, Number(rules.max) || 1);
  const windowMs = Math.max(1000, Number(rules.windowMs) || 60_000);
  const now = Date.now();
  let state = {};
  try {
    state = JSON.parse(getMeta(RATE_META_KEY) || "{}") || {};
  } catch {
    state = {};
  }
  if (!state || typeof state !== "object") state = {};
  const prev = Array.isArray(state[bucket]) ? state[bucket] : [];
  const recent = prev.filter((t) => Number(t) > now - windowMs);
  if (recent.length >= max) {
    const oldest = Math.min(...recent.map(Number));
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + windowMs - now),
    };
  }
  return {
    allowed: true,
    remaining: max - recent.length,
    retryAfterMs: 0,
  };
}

/**
 * @param {string} bucket
 * @param {{ max: number, windowMs: number }} rules
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
function consumeRateLimit(bucket, rules) {
  const gate = checkRateLimit(bucket, rules);
  if (!gate.allowed) return gate;
  const max = Math.max(1, Number(rules.max) || 1);
  const windowMs = Math.max(1000, Number(rules.windowMs) || 60_000);
  const now = Date.now();
  let state = {};
  try {
    state = JSON.parse(getMeta(RATE_META_KEY) || "{}") || {};
  } catch {
    state = {};
  }
  if (!state || typeof state !== "object") state = {};
  const prev = Array.isArray(state[bucket]) ? state[bucket] : [];
  const recent = prev.filter((t) => Number(t) > now - windowMs);
  recent.push(now);
  state[bucket] = recent.slice(-max);
  setMeta(RATE_META_KEY, JSON.stringify(state));
  return {
    allowed: true,
    remaining: Math.max(0, max - recent.length),
    retryAfterMs: 0,
  };
}

/**
 * Drop catalog rows that are not allowlisted and have no stored messages.
 * Keeps the picker usable without mirroring the full WhatsApp chat list forever.
 */
function pruneUnselectedCatalog() {
  const database = getDb();
  database
    .prepare(
      `
      DELETE FROM chats
      WHERE id NOT IN (SELECT chat_id FROM allowlist WHERE enabled = 1)
        AND id NOT IN (SELECT DISTINCT chat_id FROM messages)
        AND updated_at < ?
    `,
    )
    .run(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

/**
 * @param {{ chatId?: string, limit?: number }} [options]
 */
function getRecentMessages(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 200);
  const chatId = options.chatId;
  const sql = `
    SELECT
      m.id,
      m.chat_id AS chatId,
      c.name AS chatName,
      m.body,
      m.sender_name AS senderName,
      m.from_me AS fromMe,
      m.timestamp
    FROM messages m
    INNER JOIN allowlist a ON a.chat_id = m.chat_id AND a.enabled = 1
    INNER JOIN chats c ON c.id = m.chat_id
    ${chatId ? "WHERE m.chat_id = ?" : ""}
    ORDER BY m.timestamp DESC
    LIMIT ?
  `;
  const rows = chatId
    ? getDb().prepare(sql).all(chatId, limit)
    : getDb().prepare(sql).all(limit);
  return rows.map(formatMessage);
}

/**
 * @param {{ query: string, limit?: number }} options
 */
function searchMessages(options) {
  const query = String(options.query || "").trim();
  if (!query) return [];
  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 200);
  const like = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

  return getDb()
    .prepare(
      `
    SELECT
      m.id,
      m.chat_id AS chatId,
      c.name AS chatName,
      m.body,
      m.sender_name AS senderName,
      m.from_me AS fromMe,
      m.timestamp
    FROM messages m
    INNER JOIN allowlist a ON a.chat_id = m.chat_id AND a.enabled = 1
    INNER JOIN chats c ON c.id = m.chat_id
    WHERE m.body LIKE ? ESCAPE '\\'
    ORDER BY m.timestamp DESC
    LIMIT ?
  `,
    )
    .all(like, limit)
    .map(formatMessage);
}

function getStats() {
  const database = getDb();
  const chats = database.prepare("SELECT COUNT(*) AS n FROM chats").get().n;
  const messages = database
    .prepare(
      `
    SELECT COUNT(*) AS n
    FROM messages m
    INNER JOIN allowlist a ON a.chat_id = m.chat_id AND a.enabled = 1
  `,
    )
    .get().n;
  const allowed = database
    .prepare("SELECT COUNT(*) AS n FROM allowlist WHERE enabled = 1")
    .get().n;
  return {
    chats,
    messages,
    allowed,
    syncMode: getMeta("whatsapp_sync_mode") || "unknown",
    syncPath: getMeta("whatsapp_sync_path") || null,
    waVersion: getMeta("whatsapp_web_version") || null,
    dbPath: redactHomePath(getDbPath()),
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function formatMessage(row) {
  return {
    id: row.id,
    chatId: row.chatId,
    chatName: row.chatName,
    body: row.body,
    senderName: row.senderName,
    fromMe: Boolean(row.fromMe),
    timestamp: row.timestamp,
  };
}

function setMeta(key, value) {
  getDb()
    .prepare(
      `
    INSERT INTO meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `,
    )
    .run(key, String(value));
}

function getMeta(key) {
  const row = getDb().prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row?.value ?? null;
}

const DEFAULT_DRAWER_WIDTH = 400;
const DRAWER_WIDTH_MIN = 320;
const DRAWER_WIDTH_MAX = 900;

function clampDrawerWidth(width) {
  const n = Number(width);
  if (!Number.isFinite(n)) return DEFAULT_DRAWER_WIDTH;
  return Math.min(DRAWER_WIDTH_MAX, Math.max(DRAWER_WIDTH_MIN, Math.round(n)));
}

/** Persisted width of the right-hand Access drawer (user-resizable). */
function getDrawerWidth() {
  const raw = getMeta("ui_drawer_width");
  return raw == null ? DEFAULT_DRAWER_WIDTH : clampDrawerWidth(raw);
}

/**
 * @param {number} width
 * @returns {number} the clamped width actually stored
 */
function setDrawerWidth(width) {
  const clamped = clampDrawerWidth(width);
  setMeta("ui_drawer_width", String(clamped));
  return clamped;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDbPath,
  redactHomePath,
  upsertChats,
  upsertMessages,
  listChats,
  getChatById,
  resolveCatalogChat,
  isChatSynced,
  resolveSyncedChat,
  setAllowlist,
  ensureAllowlisted,
  setChatSynced,
  saveChatSidebar,
  listAllowedChats,
  getAllowlistPolicy,
  checkRateLimit,
  consumeRateLimit,
  pruneUnselectedCatalog,
  getRecentMessages,
  searchMessages,
  getStats,
  getAiSettings,
  setAiSettings,
  getAiGatewayApiKey,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_AI_GATEWAY_BASE_URL,
  DEFAULT_AI_GATEWAY_MODEL,
  setSummaryPrefs,
  clearSummariesForChat,
  getSummaryPrefs,
  listSummaries,
  getSummaryBoard,
  getEarlierSummaries,
  insertSummary,
  getMessagesSince,
  countMessagesSince,
  getLatestMessageTimestamp,
  listEnabledSummaryPrefs,
  setMeta,
  getDrawerWidth,
  setDrawerWidth,
  clampDrawerWidth,
  DEFAULT_DRAWER_WIDTH,
  DRAWER_WIDTH_MIN,
  DRAWER_WIDTH_MAX,
  closeDb,
};
