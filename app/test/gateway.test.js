/**
 * Gateway URL helpers — no network.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  assertSafeBaseUrl,
  isLoopbackBaseUrl,
  DEFAULT_BASE_URL,
  sameOrigin,
} = require("../src/ai/gateway.js");

describe("assertSafeBaseUrl", () => {
  it("accepts default Vercel URL", () => {
    assert.doesNotThrow(() => assertSafeBaseUrl(DEFAULT_BASE_URL));
  });

  it("rejects invalid URLs", () => {
    assert.throws(() => assertSafeBaseUrl("not-a-url"), /valid/i);
  });

  it("detects loopback hosts", () => {
    assert.equal(isLoopbackBaseUrl("http://[::1]:11434/v1"), true);
    assert.equal(isLoopbackBaseUrl("https://example.com"), false);
  });

  it("compares origins", () => {
    assert.equal(
      sameOrigin("https://api.openai.com/v1", "https://api.openai.com/v1/"),
      true,
    );
    assert.equal(
      sameOrigin("https://api.openai.com/v1", "https://ai-gateway.vercel.sh/v1"),
      false,
    );
  });
});
