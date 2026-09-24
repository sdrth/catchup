# Changelog

## Unreleased

- **Agent prompt: include a runnable MCP connect block.** Copied prompt now embeds the absolute `node …/server.mjs` command and Cursor/Claude Desktop JSON (placeholders filled in `main.js`), so local agents can discover and start Catchup MCP instead of only being told to re-open Settings.
- **UI: WhatsApp look, restrained glass.** Restyled on WhatsApp Web's dark palette (`#111b21` / `#202c33` surfaces, `#00a884` green, `#e9edef` / `#8696a0` text): flat panels, WhatsApp-style switches, pill buttons, inputs and chat-list preview rows; summaries render as message bubbles. Removed the decorative glass gradients, sheens, glows, drop shadows and pulsing dot. Glass (translucent + blur) remains only on the Access and Settings headers, where content scrolls underneath. Sidebar uses monochrome rail icons with a filled active pill; Access gets a shield icon.
- **UX: confirm before deleting.** Turning off Access or catch-up summaries for a chat that has stored messages/notes now shows an inline confirm stating exactly what will be deleted (Cancel / Esc keeps it on).
- **UX: schedule autosaves.** Access schedule fields (mode, count, minutes, max tokens, extra instructions) save as you edit and are clamped to their valid ranges; the **Save schedule** button is gone. Pending edits are flushed when you switch chats.
- **UX: clearer feedback.** Status lines fade after a few seconds; errors stay, render in red, drop the `Error invoking remote method …` prefix, and offer **Open Settings** when the fix lives there. Busy labels on **Summarize now** / **Save settings** / **Refresh**; copy buttons flash **Copied ✓**.
- **UX: keyboard.** Esc closes the Access drawer or Settings; ⌘S (Ctrl+S) and Enter in Gateway fields save settings. Settings shows an "Unsaved changes" hint and keeps unsaved edits when you navigate away and back.
- **UX: small polish.** Relative timestamps refresh every 30s (absolute time on hover), summary cards have a chevron + `aria-expanded`, the API key field says whether a key is already saved, and visible focus rings on buttons/links.
- **pnpm 12 install:** move build policy to `app/pnpm-workspace.yaml` (`allowBuilds`: Electron on, `better-sqlite3` off — uses shipped prebuilds). Stops `ERR_PNPM_IGNORED_BUILDS` / `node-gyp: command not found` on install.
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
