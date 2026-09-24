/**
 * OpenAI Chat Completions-compatible client. Defaults to Vercel AI Gateway,
 * but Settings → Base URL accepts any compatible endpoint (e.g. Gemini's
 * https://generativelanguage.googleapis.com/v1beta/openai).
 * @see https://vercel.com/docs/ai-gateway
 * @see https://vercel.com/docs/ai-gateway/security-and-compliance/zdr
 * @see https://ai.google.dev/gemini-api/docs/openai
 */

const DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh/v1";
const VERCEL_GATEWAY_HOST = "ai-gateway.vercel.sh";

/** @param {string} baseUrl */
function isLoopbackBaseUrl(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "::1"
    );
  } catch {
    return false;
  }
}

/**
 * Reject cleartext http except loopback so API keys never leave over plain HTTP.
 * @param {string} baseUrl
 */
function assertSafeBaseUrl(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("Base URL must be a valid http(s) URL.");
  }
  if (parsed.protocol === "https:") return;
  if (parsed.protocol === "http:" && isLoopbackBaseUrl(baseUrl)) return;
  throw new Error(
    "Base URL must use https (http is only allowed for localhost).",
  );
}

/**
 * @param {{
 *   apiKey: string,
 *   baseUrl?: string,
 *   model: string,
 *   system: string,
 *   user: string,
 *   maxTokens?: number,
 *   zeroDataRetention?: boolean,
 * }} opts
 * @returns {Promise<{ text: string, model: string }>}
 */
async function generateViaGateway(opts) {
  const baseUrl = String(opts.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  assertSafeBaseUrl(baseUrl);
  const apiKey = String(opts.apiKey || "").trim();
  const loopback = isLoopbackBaseUrl(baseUrl);
  if (!apiKey && !loopback) {
    throw new Error("Add your gateway API key in Settings.");
  }

  const model = String(opts.model || "").trim();
  if (!model) throw new Error("Choose a model in Settings.");

  const zeroDataRetention = opts.zeroDataRetention !== false;
  const maxTokens = Math.min(
    4096,
    Math.max(16, Number(opts.maxTokens) || 512),
  );
  const url = `${baseUrl}/chat/completions`;

  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: String(opts.system || "") },
      { role: "user", content: String(opts.user || "") },
    ],
  };
  // Vercel-specific request shape — other OpenAI-compatible providers (e.g.
  // Gemini) don't know this field, so only send it to the actual gateway.
  let isVercel = false;
  try {
    isVercel = new URL(baseUrl).hostname === VERCEL_GATEWAY_HOST;
  } catch {
    isVercel = false;
  }
  if (isVercel) {
    body.providerOptions = { gateway: { zeroDataRetention } };
  }

  /** @type {Record<string, string>} */
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  /** @type {{ error?: { message?: string } | string, message?: string, choices?: Array<{ message?: { content?: string } }>, model?: string } | null} */
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    if (!response.ok) {
      throw new Error(
        `Summary API error ${response.status}: ${raw.slice(0, 240)}`,
      );
    }
    throw new Error("Summary API returned invalid JSON.");
  }

  if (!response.ok) {
    const message =
      (typeof data?.error === "object" ? data.error?.message : data?.error) ||
      data?.message ||
      raw ||
      `Summary API error ${response.status}`;
    throw new Error(String(message));
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text || !String(text).trim()) {
    throw new Error("Summary API returned an empty summary.");
  }

  return {
    text: String(text).trim(),
    model: String(data?.model || model),
  };
}

/**
 * Tiny live call so Settings can verify key + base URL + model.
 * @param {{
 *   apiKey?: string,
 *   baseUrl?: string,
 *   model: string,
 *   zeroDataRetention?: boolean,
 * }} opts
 * @returns {Promise<{ ok: true, model: string, latencyMs: number, sample: string }>}
 */
async function testGatewayConnection(opts) {
  const started = Date.now();
  const result = await generateViaGateway({
    apiKey: opts.apiKey || "",
    baseUrl: opts.baseUrl,
    model: opts.model,
    zeroDataRetention: opts.zeroDataRetention,
    system: "You are a connection test. Reply with exactly the single word: ok",
    user: "ping",
    maxTokens: 16,
  });
  return {
    ok: true,
    model: result.model,
    latencyMs: Date.now() - started,
    sample: result.text.slice(0, 80),
  };
}

module.exports = {
  generateViaGateway,
  testGatewayConnection,
  DEFAULT_BASE_URL,
  isLoopbackBaseUrl,
  assertSafeBaseUrl,
};
