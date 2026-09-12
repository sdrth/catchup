# Purpose

Catchup lets AI tools read WhatsApp chats you explicitly allow — nothing else.

## Navigation

| Area | Role |
| --- | --- |
| **WhatsApp** | WhatsApp Web inside Catchup |
| **Access** | Approve the open chat for agents; optional catch-up summaries |
| **Settings** | MCP connect, local store preview, AI Gateway for summaries |

## Flow

1. Log into WhatsApp in Catchup.
2. Open a chat → **Access** → **Allow agents to read this chat** (applies immediately).
3. Optionally enable catch-up summaries and **Save schedule**.
4. **Settings** → copy MCP command / JSON. Add a Gateway key only if you use summaries.

## Privacy

- Message sync and MCP stay on this Mac.
- Agents are read-only and only see allowlisted chats.
- Turning Access off clears that chat’s local messages and summaries.
- Summaries (if enabled) send transcript slices through your Gateway key. ZDR is on by default.

## MCP tools

From **Settings**, or `cd app && pnpm mcp`:

- `catchup_status`
- `list_allowed_chats`
- `get_recent_messages`
- `search_messages`

Agent skill / prompt: `skills/catchup/` (packaged copy under `app/skills/catchup/`).
