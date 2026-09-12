# Testing

```bash
cd app
pnpm install
pnpm start
```

Fully quit (Cmd+Q) after code changes so inject and UI reload.

## Access + MCP

1. WhatsApp — QR login; wait for the chat list.
2. Open a chat → **Access** → allow agents (instant).
3. **Settings** → copy MCP; confirm **On this Mac** shows messages.
4. `cd app && pnpm mcp` → `list_allowed_chats` / `get_recent_messages`.

## Summaries

1. **Settings** — Gateway key, ZDR on, save.
2. **Access** — enable catch-up summaries, **Save schedule**, **Summarize now**.
3. Disable Access or summaries → that chat’s local notes/messages clear.

## Checks

- Bodies sync only for Access-on chats.
- Prefer `store` sync mode; DOM needs the chat open.
- MCP stays local; summary text leaves only via Gateway.
