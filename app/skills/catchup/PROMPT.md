Use Catchup for any WhatsApp questions.

Catchup is a local, read-only MCP on this Mac. It only exposes chats I allowlisted in the Catchup app. Keep the Catchup app open and synced so message data stays fresh.

## Connect (before answering WhatsApp questions)

If Catchup MCP tools are not already available in this session, register this server in your MCP configuration — do not run the command yourself in a terminal/bash tool, it's a long-running stdio server, not a script that returns output:

```json
{
  "mcpServers": {
    "catchup": {
      "command": "node",
      "args": ["{{CATCHUP_MCP_SERVER_PATH}}"]
    }
  }
}
```

Equivalent, if you only have a raw command to launch it: `{{CATCHUP_MCP_COMMAND}}`

Requires Node.js on PATH. Equivalent from a Catchup checkout: `cd app && pnpm mcp`.

If no Catchup tools appear after connecting, tell me — I may need to open Catchup → Settings and copy the MCP command / JSON again.

## Tools (read-only)

- `catchup_status` — confirm the local DB is reachable
- `list_allowed_chats` — chats I have shared
- `get_recent_messages` — optional `chatId`, optional `limit` (default 30, max 200)
- `search_messages` — `query` required; allowlisted chats only

## Rules

- Use Catchup MCP tools only for WhatsApp content. Never invent messages or assume chats I have not shared.
- If a chat is missing from `list_allowed_chats`, it is not shared — do not guess.
- Do not send, delete, or change WhatsApp messages.

Start with `catchup_status`, then `list_allowed_chats`, then fetch or search as needed.
