const {
  getAiSettings,
  getAiGatewayApiKey,
  getMessagesSince,
  countMessagesSince,
  insertSummary,
  listEnabledSummaryPrefs,
  getSummaryPrefs,
} = require("../db/store");
const { generateViaGateway } = require("./gateway");

/** @type {Set<string>} */
const inFlight = new Set();

/** Never look back further than this, even if the chat hasn't been summarized in days. */
const LOOKBACK_WINDOW_MS = 12 * 60 * 60 * 1000;
/** Rough input budget for the transcript sent to the model (chars/4 heuristic). */
const MAX_INPUT_TOKENS = 12_000;
/** Hard cap on rows pulled from SQLite before token trimming. */
const FETCH_ROW_CAP = 500;

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

/**
 * @param {{ senderName?: string, fromMe?: boolean, body: string, timestamp: number }} m
 */
function transcriptLine(m) {
  const who = m.fromMe ? "You" : m.senderName || "Contact";
  const when = m.timestamp
    ? new Date(m.timestamp).toISOString().replace("T", " ").slice(0, 16)
    : "";
  return `[${when}] ${who}: ${m.body}`;
}

/**
 * @param {Array<{ senderName?: string, fromMe?: boolean, body: string, timestamp: number }>} messages
 */
function formatTranscript(messages) {
  return messages.map(transcriptLine).join("\n");
}

/**
 * Keep the most recent messages that fit inside the token budget. Older
 * messages in the window are dropped — and never re-summarized, since the
 * caller still advances the watermark past them — rather than blocking on
 * a mounting backlog. `truncated` tells the caller some context was cut.
 * @param {Array<{ body: string }>} messages oldest → newest
 * @param {number} maxTokens
 */
function trimToTokenBudget(messages, maxTokens) {
  if (messages.length === 0) return { kept: [], truncated: false };
  let used = 0;
  let start = messages.length - 1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const cost = estimateTokens(transcriptLine(messages[i]));
    // Always keep at least the single newest message, even if it alone
    // exceeds the budget.
    if (i !== messages.length - 1 && used + cost > maxTokens) break;
    used += cost;
    start = i;
  }
  return { kept: messages.slice(start), truncated: start > 0 };
}

/**
 * @param {ReturnType<typeof getSummaryPrefs>} prefs
 * @param {boolean} force
 */
function isDue(prefs, force) {
  if (force) return true;
  if (!prefs?.enabled) return false;
  if (prefs.mode === "time") {
    const intervalMs = Math.max(5, prefs.intervalMinutes) * 60 * 1000;
    return Date.now() - (prefs.lastSummaryAt || 0) >= intervalMs;
  }
  const pending = countMessagesSince(prefs.chatId, prefs.lastMessageTs || 0);
  return pending >= Math.max(3, prefs.messageThreshold);
}

/**
 * @param {string} chatId
 * @param {{ force?: boolean, prefs?: NonNullable<ReturnType<typeof getSummaryPrefs>>, settings?: ReturnType<typeof getAiSettings> }} [opts]
 */
async function runSummaryForChat(chatId, opts = {}) {
  if (!chatId) throw new Error("chatId required");
  if (inFlight.has(chatId)) {
    return { skipped: true, reason: "in_flight" };
  }

  const prefs = opts.prefs || getSummaryPrefs(chatId);
  if (!prefs) {
    return { skipped: true, reason: "disabled" };
  }
  if (!prefs.enabled && !opts.force) {
    return { skipped: true, reason: "disabled" };
  }
  if (!isDue(prefs, Boolean(opts.force))) {
    return {
      skipped: true,
      reason: prefs.mode === "time" ? "time_not_due" : "message_threshold",
    };
  }

  const settings = opts.settings || getAiSettings();
  const apiKey = getAiGatewayApiKey();
  if (!apiKey) {
    throw new Error("Add your AI Gateway API key in Settings.");
  }

  // Bound the catch-up window: go back to the last watermark, but never
  // further than LOOKBACK_WINDOW_MS — whichever gives the shorter window.
  const windowStart = Math.max(
    prefs.lastMessageTs || 0,
    Date.now() - LOOKBACK_WINDOW_MS,
  );
  const totalAvailable = countMessagesSince(chatId, windowStart);
  const fetched = getMessagesSince(chatId, windowStart, FETCH_ROW_CAP);
  if (fetched.length === 0) {
    return { skipped: true, reason: "no_new_messages" };
  }

  const { kept, truncated: trimmedByTokens } = trimToTokenBudget(
    fetched,
    MAX_INPUT_TOKENS,
  );
  // Either cap can drop context: too many rows for one SQLite fetch, or too
  // many tokens for the model's input budget.
  const truncated = trimmedByTokens || totalAvailable > fetched.length;

  inFlight.add(chatId);
  try {
    const chatName = kept[0]?.chatName || prefs.chatName || chatId;
    const systemParts = [settings.systemPrompt];
    const extra = String(prefs.extraPrompt || "").trim();
    if (extra) {
      systemParts.push(`Additional instructions for this chat:\n${extra}`);
    }
    if (truncated) {
      systemParts.push(
        "Note: older messages in this time slice were left out to fit the input budget. Summarize only what's in the transcript below — don't imply it covers the full period.",
      );
    }

    const user = [
      `Chat: ${chatName}`,
      `Messages in this slice: ${kept.length}${
        truncated ? " (truncated — some older messages in the window were dropped)" : ""
      }`,
      "",
      "Transcript:",
      formatTranscript(kept),
      "",
      "Write a running summary of what happened in this slice of the conversation.",
    ].join("\n");

    const result = await generateViaGateway({
      apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
      system: systemParts.join("\n\n"),
      user,
      maxTokens: prefs.maxTokens || 512,
      zeroDataRetention: settings.zeroDataRetention,
    });

    const summary = insertSummary({
      chatId,
      body: result.text,
      mode: prefs.mode,
      messageCount: kept.length,
      fromTs: kept[0]?.timestamp || null,
      // Advance the watermark past everything fetched (not just `kept`) so
      // dropped-for-budget messages aren't re-fetched forever.
      toTs: fetched[fetched.length - 1]?.timestamp || null,
      model: result.model,
      truncated,
    });

    return { skipped: false, summary };
  } finally {
    inFlight.delete(chatId);
  }
}

async function tickSummaries() {
  const settings = getAiSettings();
  if (!getAiGatewayApiKey()) return [];

  const results = [];
  for (const prefs of listEnabledSummaryPrefs()) {
    if (!isDue(prefs, false)) continue;
    try {
      const result = await runSummaryForChat(prefs.chatId, {
        force: false,
        prefs,
        settings,
      });
      if (!result.skipped) results.push(result);
    } catch (error) {
      results.push({
        chatId: prefs.chatId,
        error: String(error?.message || error),
      });
    }
  }
  return results;
}

module.exports = {
  runSummaryForChat,
  tickSummaries,
};
