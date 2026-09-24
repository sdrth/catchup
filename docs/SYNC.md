# Sync & summaries

Catchup reads WhatsApp Web in-page data (not the native WhatsApp.app database). Summaries are separate, via Vercel AI Gateway.

## Message sync

1. Prefer Store (`WAWebCollections`) for allowlisted chats (`Chat.getActive` / `Chat.get`); catalog titles via DOM.
2. Message bodies are stored only when **Access** is on (summaries imply Access).
3. The inject never walks the global `Msg` collection or full Chat catalog arrays.
4. Force sync, deep history, and catalog upserts are rate-limited in SQLite `meta`.
5. If Store attach fails, DOM fallback still requires Access for bodies.

Database: `~/Library/Application Support/catchup/catchup.sqlite` (path shown redacted in Settings).

## Access

Follows the WhatsApp chat currently open:

- **Allow agents to read this chat** — allowlists and snapshots immediately.
- **Catch-up summaries** — schedule, tokens, extra prompt; field changes save automatically.
- Access off → clears that chat’s local messages and summary cards.

## Summaries (Settings → Gateway)

Any OpenAI Chat Completions-compatible endpoint works, not only Vercel — e.g. Gemini’s `https://generativelanguage.googleapis.com/v1beta/openai`. Vercel-specific request fields (Zero Data Retention) are only sent when the Base URL is actually `ai-gateway.vercel.sh`.

| Field | Notes |
| --- | --- |
| API key | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) key, or another provider’s API key |
| Base URL | `https://ai-gateway.vercel.sh/v1` by default; swap for another OpenAI-compatible endpoint |
| Model | e.g. `anthropic/claude-sonnet-4.5` (Vercel) or a bare model id like `gemini-3.8-flash` |
| Zero Data Retention | On by default ([ZDR](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr)); Vercel gateway only |
| System prompt | Global; per-chat extras append |

**Summarize now** forces a run; a background tick handles due jobs. Disabling summaries or Access deletes that chat’s stored cards.

Every run (scheduled or manual) only looks back 12 hours or to the last summary, whichever is the shorter window, and trims the transcript to a ~12k-token input budget — always keeping the most recent messages. If either cap drops content, the summary is marked **Incomplete** in the Access panel.

## Settings — MCP

- **Connect an AI** — MCP command, Claude Desktop JSON, prompt, skill
- **On this Mac** — shared count and message preview

## Identity

Groups (`@g.us` / markers) vs contacts (name + phone when available). Junk unread titles are stripped; duplicate catalog rows merge.

## Ops tips

- Keep the chat open while syncing (especially in DOM mode).
- Fully quit (Cmd+Q) after code changes so inject reloads.
- WhatsApp Web changes often — Store hooks may need updates.
