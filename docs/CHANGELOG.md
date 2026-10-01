# Changelog

## Unreleased

- **Access: fix allowlist FK failures.** Enabling Access / summaries for a chat that was not yet in the local catalog no longer fails with `FOREIGN KEY constraint failed` — the chat row is ensured before allowlist / summary_prefs writes.
- **Sync: preserve message timestamps.** Re-upserts keep the earlier timestamp so DOM rescrapes cannot clobber real Store times (and scramble summary watermarks).
- **DOM fallback: chronological timestamps.** Synthetic scrape times now increase oldest→newest; wall-clock is parsed from `data-pre-plain-text` when present.
- **Gateway: reject cleartext non-loopback Base URLs.** API keys are no longer sent over plain `http://` to remote hosts. Vercel ZDR options are attached only when the Base URL hostname is actually `ai-gateway.vercel.sh`.
- Add MIT [LICENSE](../LICENSE) (as-is, no warranty / no liability).
- Add [SECURITY.md](../SECURITY.md) (local store, zero telemetry / no Catchup backend, MCP trust model, reporting).
- Bump Electron `37.2.6` → `44.3.0`.
- README: ready-to-copy agent get-started blurb with repo link.
- **Gateway: support any OpenAI-compatible provider.** The Vercel-only `providerOptions.gateway` request field is now sent only when Base URL is actually `ai-gateway.vercel.sh`, so Settings → Gateway works with other OpenAI Chat Completions-compatible endpoints (e.g. Gemini). Error copy no longer assumes Vercel.
- **Summaries: bounded, flagged catch-up window.** Every run (scheduled or manual) now looks back 12 hours or to the last summary — whichever is shorter — and trims the transcript to a ~12k-token input budget, always keeping the most recent messages over older ones. Runs that had to drop content are marked **Incomplete** in the Access panel. Fixed `getMessagesSince` to keep the newest messages when a fetch is capped (it previously kept the oldest, silently dropping recent activity).
- **Access panel: richtext summaries.** Summary bodies render through a small dependency-free markdown renderer (headings, bold/italic/code, nested lists) instead of raw text; larger body font for readability.
- **Access panel: resizable drawer.** Drag the left edge of the Access/summaries drawer to resize it; the WhatsApp view resizes in step and the width is persisted (SQLite `meta`) across restarts.
- **Access panel: infinite scroll + relative timestamps.** "Earlier summary" history now paginates on scroll instead of loading everything up front. Summary/message timestamps show as "12 mins ago" / "3 hours ago" under 24h old, falling back to an absolute date beyond that.

## 1.1.0 — 2026-09-13

Local WhatsApp sync for agents: approve chats, read-only MCP, optional Gateway summaries.

- **WhatsApp** — WhatsApp Web in Catchup
- **Access** — instant allow for the open chat; optional catch-up summaries
- **Settings** — MCP connect, local preview, AI Gateway (ZDR on by default)

Sync and MCP stay on this Mac. Agents only see chats you allow.
