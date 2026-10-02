const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tmp = path.join(
  os.tmpdir(),
  `catchup-test-${process.pid}-${Date.now()}.sqlite`,
);
process.env.CATCHUP_DB_PATH = tmp;

const {
  assertSafeBaseUrl,
  isLoopbackBaseUrl,
} = require("../src/ai/gateway.js");
const store = require("../src/db/store.js");
const { redactHomePath } = require("../src/db/paths.js");

describe("gateway URL safety", () => {
  it("rejects cleartext remote http", () => {
    assert.throws(() => assertSafeBaseUrl("http://evil.example/v1"), /https/i);
  });

  it("allows https and loopback http", () => {
    assert.doesNotThrow(() =>
      assertSafeBaseUrl("https://ai-gateway.vercel.sh/v1"),
    );
    assert.doesNotThrow(() => assertSafeBaseUrl("http://127.0.0.1:11434/v1"));
    assert.equal(isLoopbackBaseUrl("http://localhost:8080/v1"), true);
  });
});

describe("paths", () => {
  it("redacts home directory", () => {
    const home = os.homedir();
    const redacted = redactHomePath(path.join(home, "Library", "catchup"));
    assert.ok(redacted.startsWith("~"));
    assert.ok(!redacted.includes(home));
  });
});

describe("store allowlist + sync identity", () => {
  after(() => {
    store.closeDb();
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        fs.unlinkSync(tmp + suffix);
      } catch {
        // ignore
      }
    }
  });

  it("saves Access for a chat that was never catalogued (FK)", () => {
    const row = store.saveChatSidebar("fresh@c.us", {
      synced: true,
      summary: { enabled: false },
      meta: { name: "Fresh Contact", kind: "contact", phone: "+15551234567" },
    });
    assert.equal(row.allowed, true);
    assert.equal(row.name, "Fresh Contact");
  });

  it("preserves earlier message timestamps on re-upsert", () => {
    store.upsertChats([{ id: "a@c.us", name: "Alice", kind: "contact" }]);
    store.setChatSynced("a@c.us", true);
    store.upsertMessages("a@c.us", "Alice", "contact", [
      {
        id: "m1",
        body: "hello",
        fromMe: false,
        timestamp: 1_000_000,
        senderName: "Alice",
      },
    ]);
    store.upsertMessages("a@c.us", "Alice", "contact", [
      {
        id: "m1",
        body: "hello edited",
        fromMe: false,
        timestamp: Date.now(),
        senderName: "Alice",
      },
    ]);
    const msgs = store.getRecentMessages({ chatId: "a@c.us", limit: 5 });
    assert.equal(msgs[0].timestamp, 1_000_000);
    assert.equal(msgs[0].body, "hello edited");
  });

  it("does not soft-match allowlisted chats across kinds by name", () => {
    store.upsertChats([
      { id: "team@g.us", name: "Jordan", kind: "group" },
      { id: "jordan@c.us", name: "Jordan", kind: "contact", phone: "+15550001111" },
    ]);
    store.setChatSynced("team@g.us", true, { name: "Jordan", kind: "group" });
    // Contact "Jordan" is NOT allowlisted — resolve must not fall through to the group.
    const resolved = store.resolveSyncedChat({
      id: "dom_jordan_contact",
      name: "Jordan",
      kind: "contact",
      phone: null,
    });
    assert.equal(resolved, null);

    store.setChatSynced("jordan@c.us", true, {
      name: "Jordan",
      kind: "contact",
      phone: "+15550001111",
    });
    const byName = store.resolveSyncedChat({
      id: "dom_jordan_contact",
      name: "Jordan",
      kind: "contact",
      phone: null,
    });
    assert.equal(byName?.id, "jordan@c.us");
  });

  it("rejects storing a remote http gateway base URL", () => {
    assert.throws(
      () => store.setAiSettings({ baseUrl: "http://evil.example/v1" }),
      /https/i,
    );
  });

  it("round-trips API key in plain Node (no Electron safeStorage)", () => {
    store.setAiSettings({ apiKey: "sk-test-plain" });
    assert.equal(store.getAiSettings().apiKeySet, true);
    assert.equal(store.getAiGatewayApiKey(), "sk-test-plain");
  });

  it("clears saved key when Base URL origin changes without a new key", () => {
    store.setAiSettings({
      apiKey: "sk-vercel",
      baseUrl: "https://ai-gateway.vercel.sh/v1",
    });
    assert.equal(store.getAiGatewayApiKey(), "sk-vercel");
    store.setAiSettings({
      baseUrl: "https://api.openai.com/v1",
    });
    assert.equal(store.getAiGatewayApiKey(), "");
    assert.equal(store.getAiSettings().apiKeySet, false);
  });

  it("keeps key when Base URL stays on the same origin", () => {
    store.setAiSettings({
      apiKey: "sk-keep",
      baseUrl: "https://api.openai.com/v1",
    });
    store.setAiSettings({
      baseUrl: "https://api.openai.com/v1/",
      model: "gpt-4.1-mini",
    });
    assert.equal(store.getAiGatewayApiKey(), "sk-keep");
  });

  it("include kind in allowlist policy entries", () => {
    store.upsertChats([
      { id: "g1@g.us", name: "Crew", kind: "group" },
      { id: "c1@c.us", name: "Crew", kind: "contact", phone: "+15550002222" },
    ]);
    store.setChatSynced("g1@g.us", true, { name: "Crew", kind: "group" });
    const policy = store.getAllowlistPolicy();
    assert.ok(policy.entries.some((e) => e.name === "crew" && e.kind === "group"));
    assert.ok(!policy.entries.some((e) => e.name === "crew" && e.kind === "contact"));
  });
});
