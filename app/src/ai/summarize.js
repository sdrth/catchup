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

/**
 * @param {Array<{ senderName?: string, fromMe?: boolean, body: string, timestamp: number }>} messages
 */
function formatTranscript(messages) {
  return messages
    .map((m) => {
      const who = m.fromMe ? "You" : m.senderName || "Contact";
      const when = m.timestamp
        ? new Date(m.timestamp).toISOString().replace("T", " ").slice(0, 16)
        : "";
      return `[${when}] ${who}: ${m.body}`;
    })
    .join("\n");
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
    throw new Error("Add your Vercel AI Gateway API key in Settings.");
  }

  const messages = getMessagesSince(chatId, prefs.lastMessageTs || 0, 200);
  if (messages.length === 0) {
    return { skipped: true, reason: "no_new_messages" };
  }

  inFlight.add(chatId);
  try {
    const chatName = messages[0]?.chatName || prefs.chatName || chatId;
    const systemParts = [settings.systemPrompt];
    const extra = String(prefs.extraPrompt || "").trim();
    if (extra) {
      systemParts.push(`Additional instructions for this chat:\n${extra}`);
    }

    const user = [
      `Chat: ${chatName}`,
      `Messages since last summary: ${messages.length}`,
      "",
      "Transcript:",
      formatTranscript(messages),
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
      messageCount: messages.length,
      fromTs: messages[0]?.timestamp || null,
      toTs: messages[messages.length - 1]?.timestamp || null,
      model: result.model,
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
