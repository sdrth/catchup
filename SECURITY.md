# Security

Catchup is a local Mac app. Treat it as **use at your own risk** (see [LICENSE](LICENSE)).

## No telemetry / no Catchup backend

Catchup does **not** phone home. There is **no Catchup cloud service**, account, or analytics pipeline. Message sync and MCP stay on your Mac. The only network destinations involved in normal use are WhatsApp Web (inside the app) and, if you opt in, your own Vercel AI Gateway key for summaries.

## What stays on your machine

- Approved chat messages and metadata live in a local SQLite database (under Application Support / equivalent).
- The optional Vercel AI Gateway API key is stored in that database as plaintext metadata — not in the OS keychain.
- The MCP server is **stdio-only**. Any local process that can run the configured MCP command can read allowlisted chats. There is no network auth layer.

## Trust boundaries

- Agents are read-only and only see chats you allow in **Access**.
- Turning Access off clears that chat’s local messages and summaries.
- Catch-up summaries (if enabled) send transcript slices to your Gateway; Zero Data Retention (ZDR) defaults on.
- Catchup is unofficial and not affiliated with WhatsApp or Meta. Driving WhatsApp Web this way may violate third-party terms and can risk account action.

## Reporting issues

If you find a security issue in Catchup itself, open a private report via GitHub Security Advisories on this repository (or contact the maintainer if advisories are unavailable). Please do not file public issues that include exploit details until a fix is available.
