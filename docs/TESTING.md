# Testing

```bash
cd app
pnpm install
pnpm test
pnpm start
```

`pnpm test` covers SQLite Access/FK saves, message timestamp preservation, allowlist identity matching, and Gateway Base URL safety (no WhatsApp login required).

Fully quit (Cmd+Q) after code changes so inject and UI reload.

## Access + MCP

1. WhatsApp — QR login; wait for the chat list.
2. Open a chat → **Access** → allow agents (instant).
3. **Settings** → copy MCP; confirm **On this Mac** shows messages.
4. `cd app && pnpm mcp` → `list_allowed_chats` / `get_recent_messages`.

## Summaries

1. **Settings** — pick a provider preset (or Custom), Gateway key, ZDR on for Vercel, **Test connection**, save.
2. **Access** — enable catch-up summaries (schedule autosaves); **Summarize now**. If the 12h window is empty, use **Summarize older messages** or **Sync messages**.
3. Disable Access or summaries → a confirm lists what will be deleted; confirm → that chat’s local notes/messages clear. **Cancel** / Esc leaves it on.

## Checks

- Bodies sync only for Access-on chats.
- Prefer `store` sync mode; DOM needs the chat open.
- MCP stays local; summary text leaves only via Gateway.
