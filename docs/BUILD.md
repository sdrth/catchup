# Build

Catchup is meant to be **cloned and run from source**. It does not ship maintainer-signed Mac binaries or auto-updates.

## Develop

```bash
cd app
pnpm install
pnpm start
```

`pnpm install` renames the local Electron helper to **Catchup.app** so the Dock label is Catchup during development.

Build scripts: `app/pnpm-workspace.yaml` allows Electron’s install script and skips `better-sqlite3`’s `node-gyp` rebuild (v13 ships platform prebuilds). There is no `pnpm build` script — use `pnpm start` or `pnpm package`.

| Path | Role |
| --- | --- |
| `app/src/main.js` | Window, BrowserView, IPC, summary scheduler |
| `app/src/renderer/` | Access sheet + Settings |
| `app/src/whatsapp/` | Capture inject |
| `app/src/ai/` | Gateway client + summary runner |
| `app/src/db/` | SQLite store |
| `app/src/mcp/` | Read-only MCP server |
| `skills/catchup/` | Agent skill + prompt (canonical) |

## Package

```bash
cd app
pnpm package
```

Uses `app/build/icon.icns`. Output under `app/out/` (unsigned by default).

### Developer ID

```bash
security find-identity -v -p codesigning
cd app
CATCHUP_CSC_NAME="Developer ID Application: Your Name (TEAMID)" pnpm package
```

### Ad-hoc (local only)

```bash
codesign --force --deep --sign - "out/Catchup-darwin-arm64/Catchup.app"
```
