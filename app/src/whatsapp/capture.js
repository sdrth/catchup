const fs = require("node:fs");
const path = require("node:path");

const INJECT_PATH = path.join(__dirname, "inject.js");
/** @type {{ source: string, mtimeMs: number } | null} */
let injectCache = null;

function getInjectSource() {
  const mtimeMs = fs.statSync(INJECT_PATH).mtimeMs;
  if (!injectCache || injectCache.mtimeMs !== mtimeMs) {
    injectCache = {
      source: fs.readFileSync(INJECT_PATH, "utf8"),
      mtimeMs,
    };
  }
  return injectCache.source;
}

/**
 * @param {unknown} value
 */
function toJsonLiteral(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * @param {Electron.WebContents} webContents
 */
function attachWhatsAppCapture(webContents) {
  /** @type {{ ids: string[], names: string[] }} */
  let policy = { ids: [], names: [] };

  const inject = () => {
    try {
      webContents.executeJavaScript(getInjectSource(), true).catch((error) => {
        console.error("[catchup] inject failed", error);
      });
      // Re-apply policy after inject (script reset clears page state).
      setTimeout(() => {
        if (webContents.isDestroyed()) return;
        webContents
          .executeJavaScript(
            `typeof window.__catchupSetPolicy === "function" && window.__catchupSetPolicy(${toJsonLiteral(policy)}); true;`,
            true,
          )
          .catch(() => {});
      }, 800);
    } catch (error) {
      console.error("[catchup] inject read failed", error);
    }
  };

  webContents.on("did-finish-load", inject);

  return {
    /**
     * @param {{ ids?: string[], names?: string[] }} next
     */
    setPolicy(next) {
      policy = {
        ids: Array.isArray(next?.ids) ? next.ids.map(String) : [],
        names: Array.isArray(next?.names)
          ? next.names.map((n) => String(n).toLowerCase())
          : [],
      };
      if (webContents.isDestroyed()) return;
      webContents
        .executeJavaScript(
          `typeof window.__catchupSetPolicy === "function" && window.__catchupSetPolicy(${toJsonLiteral(policy)}); true;`,
          true,
        )
        .catch(() => {});
    },

    /**
     * @param {{ deep?: boolean }} [opts]
     */
    forceSnapshot(opts = {}) {
      if (webContents.isDestroyed()) return;
      const deep = Boolean(opts.deep);
      webContents
        .executeJavaScript(
          `
            if (typeof window.__catchupForceSnapshot === "function") {
              window.__catchupForceSnapshot(${deep ? "true" : "false"});
              true;
            } else {
              window.__catchupInjected = false;
              false;
            }
          `,
          true,
        )
        .then((ok) => {
          if (!ok) inject();
        })
        .catch(() => inject());
    },
  };
}

module.exports = { attachWhatsAppCapture };
