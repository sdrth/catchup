# Catchup

Catchup helps your AI tools read your WhatsApp — only the chats you approve.

WhatsApp stays in Catchup as usual. Approved chats sync to a local SQLite database on your Mac, agents read them over MCP (read-only), and optional catch-up summaries can run through your Vercel AI Gateway key.

**v1.1.0**

| Doc | What it covers |
| --- | --- |
| [PURPOSE](docs/PURPOSE.md) | Product overview, privacy, MCP tools |
| [SYNC](docs/SYNC.md) | How message sync and summaries work |
| [TESTING](docs/TESTING.md) | Manual test flows |
| [BUILD](docs/BUILD.md) | Run from source, package, sign |
| [CHANGELOG](docs/CHANGELOG.md) | Release notes |
| [LICENSE](LICENSE) | MIT — provided as-is, no warranty |
| [SECURITY](SECURITY.md) | Local data, MCP trust, reporting |

## Run

```bash
cd app
pnpm install
pnpm start
```

## In the app

- **WhatsApp** — WhatsApp Web
- **Access** — allow the open chat for agents; optional catch-up summaries
- **Settings** — MCP connect, local preview, AI Gateway

## MCP

```bash
cd app
pnpm mcp
```

Or copy the command / JSON / prompt / skill from **Settings**.

## Package (optional)

```bash
cd app
pnpm package
```

See [docs/BUILD.md](docs/BUILD.md).

## License

Catchup is released under the [MIT License](LICENSE). The software is provided **as is**, without warranty of any kind. Authors and copyright holders have **no liability** for any claim, damages, or other liability arising from use of the software. You use Catchup entirely at your own risk.

## Note

Catchup is unofficial and not affiliated with WhatsApp or Meta. It drives WhatsApp Web locally, with **no Catchup telemetry or backend**. Use at your own risk and respect applicable terms and privacy laws.
