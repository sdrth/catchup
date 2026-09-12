const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/**
 * Shared DB location for Electron main + standalone MCP process.
 * Override with CATCHUP_DB_PATH when needed.
 * @returns {string}
 */
function getDbPath() {
  if (process.env.CATCHUP_DB_PATH) {
    return process.env.CATCHUP_DB_PATH;
  }

  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(
      home,
      "Library",
      "Application Support",
      "catchup",
      "catchup.sqlite",
    );
  }
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(base, "catchup", "catchup.sqlite");
  }
  return path.join(home, ".config", "catchup", "catchup.sqlite");
}

/**
 * Replace the current user's home directory with `~` for display / logs.
 * Does not change the real path used to open the database.
 * @param {string} filePath
 * @returns {string}
 */
function redactHomePath(filePath) {
  const raw = String(filePath || "");
  if (!raw) return raw;
  const home = os.homedir();
  if (home && (raw === home || raw.startsWith(home + path.sep))) {
    return `~${raw.slice(home.length)}`;
  }
  // Extra guard for absolute homes on macOS/Linux.
  return raw.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
}

/**
 * @param {string} filePath
 */
function ensureDbDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

module.exports = { getDbPath, ensureDbDir, redactHomePath };
