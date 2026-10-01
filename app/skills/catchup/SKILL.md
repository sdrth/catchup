---
name: catchup
description: >-
  Reads WhatsApp messages through the local Catchup MCP server (allowlisted
  chats only). Use when the user asks about WhatsApp messages, recent chats,
  Catchup sync status, or wants an agent to use Catchup MCP safely.
---

# Catchup

Catchup helps AI tools read WhatsApp — only the chats the user approved. Data stays on the user’s Mac. Access is read-only.

## Setup (once)

Catchup must be running and synced. Start the MCP server (stdio) with the absolute command from Catchup → **Settings** → Copy MCP command, typically:

```bash
node "<path-to-catchup>/app/src/mcp/server.mjs"
```

Or from a Catchup checkout:

```bash
cd app && pnpm mcp
```

Wire that into your client’s MCP config (Cursor / Claude Desktop JSON is also copied from Settings). Without that server, Catchup tools will not appear.

## When to use

- User asks what someone said on WhatsApp
- User asks for recent messages, unread context, or to search chats
- User mentions Catchup, allowlisted chats, or local WhatsApp sync

## Rules

1. Use **only** Catchup MCP tools for WhatsApp content. Never invent messages.
2. If MCP is unavailable, say so and ask the user to open Catchup and copy the MCP command.
3. Respect the allowlist: if a chat is missing from `list_allowed_chats`, it is not shared — do not guess.
4. Prefer quoting returned message text with chat name and time when helpful.
5. Do not claim you can send, delete, or modify WhatsApp messages.

## Tool workflow

1. `catchup_status` — confirm DB is reachable and counts look sane.
2. `list_allowed_chats` — see which contacts/groups are visible.
3. `get_recent_messages` — optional `chatId`, optional `limit` (default 30, max 200).
4. `search_messages` — `query` required; searches allowlisted chats only.

## Example

User: “What did they say last about dinner?”

1. Call `list_allowed_chats`
2. Find the relevant chat id (or ask which chat if ambiguous)
3. Call `get_recent_messages` or `search_messages` with `query: "dinner"`
4. Answer from returned rows only
