# Sync & summaries

Catchup reads WhatsApp Web in-page data (not the native WhatsApp.app database). Summaries are separate, via any OpenAI-compatible gateway (Vercel by default).

## Message sync

1. Prefer Store (`WAWebCollections`) for allowlisted chats (`Chat.getActive` / `Chat.get`); catalog titles via DOM.
2. Message bodies are stored only when **Access** is on (summaries imply Access).
3. The inject never walks the global `Msg` collection or full Chat catalog arrays.
4. Reading what WhatsApp Web already has loaded (force sync, opening Summaries) is never throttled. Only work that makes WhatsApp fetch more — deep history (`loadEarlierMsgs`, ~6/hour) — and catalog upserts are rate-limited in SQLite `meta`. A throttled deep sync falls back to a shallow read.
5. If Store attach fails, DOM fallback still requires Access for bodies.

Database: `~/Library/Application Support/catchup/catchup.sqlite` (path shown redacted in Settings).

## Access

Follows the WhatsApp chat currently open:

- **Allow agents to read this chat** — allowlists and snapshots immediately.
- **Catch-up summaries** — schedule, tokens, extra prompt; field changes save automatically.
- Access off → clears that chat’s local messages and summary cards.

## Summaries (Settings → Gateway)

Pick a provider preset (Vercel AI Gateway, OpenAI, Anthropic, OpenRouter, Gemini, Groq, Ollama) or **Custom…** for any other OpenAI Chat Completions–compatible base URL. Vercel-specific request fields (Zero Data Retention) are only sent when the Base URL host is `ai-gateway.vercel.sh`.

| Field | Notes |
| --- | --- |
| API key | Key for the chosen provider (Ollama usually needs none) |
| Provider | Preset fills the base URL; Custom shows a URL field |
| Model | e.g. `anthropic/claude-sonnet-4.5` (Vercel/OpenRouter), `gpt-4.1-mini` (OpenAI), `claude-sonnet-4-5` (Anthropic), `gemini-2.0-flash`, `llama3.2` (Ollama) |
| Test connection | Sends a one-token ping with the form values (uses the saved key if the field is blank); Ollama/localhost may omit a key |
| Zero Data Retention | On by default ([ZDR](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr)); Vercel gateway only |
| System prompt | Global; per-chat extras append |

**Summarize now** forces a run; a background tick handles due jobs. Disabling summaries or Access deletes that chat’s stored cards.

Every run (scheduled or manual) only looks back 12 hours or to the last summary, whichever is the shorter window, and trims the transcript to a ~12k-token input budget — always keeping the most recent messages. If either cap drops content, the summary is marked **Incomplete** in the Access panel.

If **Summarize now** finds nothing in that 12-hour window but older messages are still stored, Access shows **Summarize older messages** — a one-shot that bypasses the 12-hour cap (still respects the last-summary watermark and the token/row budgets). Scheduled ticks never force lookback.

If the chat is allowlisted but **no messages are stored yet**, Access shows **Sync messages** (and Summarize now will attempt one force-sync first). Keep the chat open and scroll so WhatsApp loads history. Sync itself has no cooldown; only the earlier-history fetch is limited (~6/hour).

## Settings — MCP

- **Connect an AI** — MCP command, Claude Desktop JSON, prompt, skill
- **On this Mac** — shared count and message preview

## Identity

Groups (`@g.us` / markers) vs contacts (name + phone when available). Junk unread titles are stripped; duplicate catalog rows merge.

## Ops tips

- Keep the chat open while syncing (especially in DOM mode).
- Fully quit (Cmd+Q) after code changes so inject reloads.
- WhatsApp Web changes often — Store hooks may need updates.
