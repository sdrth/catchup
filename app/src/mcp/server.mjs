#!/usr/bin/env node
/**
 * Read-only Catchup MCP server for local agent apps.
 * Exposes only allowlisted WhatsApp chats from the Catchup SQLite DB.
 */
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const require = createRequire(import.meta.url);
const {
  listAllowedChats,
  getRecentMessages,
  searchMessages,
  getStats,
} = require("../db/store.js");

const server = new McpServer({
  name: "catchup",
  version: "1.0.0",
});

function asText(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

server.tool(
  "catchup_status",
  "Show Catchup local sync status (counts + redacted database path). Does not include message bodies.",
  {},
  async () => asText(getStats()),
);

server.tool(
  "list_allowed_chats",
  "List WhatsApp contacts/groups the user has allowlisted for agent access.",
  {},
  async () => asText({ chats: listAllowedChats() }),
);

server.tool(
  "get_recent_messages",
  "Get recent messages from allowlisted chats only. Optional chatId limits to one chat.",
  {
    chatId: z
      .string()
      .optional()
      .describe("Catchup chat id from list_allowed_chats"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Max messages to return (default 30)"),
  },
  async ({ chatId, limit }) =>
    asText({ messages: getRecentMessages({ chatId, limit }) }),
);

server.tool(
  "search_messages",
  "Search message text across allowlisted chats only.",
  {
    query: z.string().min(1).describe("Case-insensitive text to find"),
    limit: z.number().int().min(1).max(200).optional(),
  },
  async ({ query, limit }) =>
    asText({ messages: searchMessages({ query, limit }) }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
