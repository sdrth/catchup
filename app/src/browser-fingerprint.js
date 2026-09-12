const { app, net } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

/** Last-resort seed if Chrome is not installed and the version API is unreachable. */
const FALLBACK_CHROME_FULL = "153.0.8010.36";

/** @type {null | ReturnType<typeof buildFingerprintFromVersion>} */
let cachedFingerprint = null;

/**
 * @param {string} fullVersion e.g. "153.0.8010.36"
 * @returns {{ major: string, uaVersion: string, fullVersion: string }}
 */
function parseChromeVersion(fullVersion) {
  const cleaned = String(fullVersion).trim().replace(/^Google Chrome\s+/i, "");
  const parts = cleaned.split(".");
  const major = parts[0] || "153";
  return {
    major,
    uaVersion: `${major}.0.0.0`,
    fullVersion: cleaned,
  };
}

/**
 * GREASE brand shaped like current desktop Chrome Client Hints.
 * @returns {{ name: string, major: string, full: string }}
 */
function greaseBrand() {
  return { name: "Not_A Brand", major: "8", full: "8.0.0.0" };
}

/**
 * @returns {string}
 */
function platformUaToken() {
  // Desktop Chrome still uses this frozen macOS token (incl. Apple Silicon).
  if (process.platform === "darwin") {
    return "Macintosh; Intel Mac OS X 10_15_7";
  }
  if (process.platform === "win32") {
    return "Windows NT 10.0; Win64; x64";
  }
  return "X11; Linux x86_64";
}

/**
 * @returns {string}
 */
function platformClientHint() {
  if (process.platform === "darwin") return `"macOS"`;
  if (process.platform === "win32") return `"Windows"`;
  return `"Linux"`;
}

/**
 * @returns {string}
 */
function platformVersionHint() {
  if (typeof process.getSystemVersion === "function") {
    return `"${process.getSystemVersion()}"`;
  }
  return `"${os.release()}"`;
}

/**
 * @returns {string}
 */
function buildAcceptLanguage() {
  const preferred =
    typeof app.getPreferredSystemLanguages === "function"
      ? app.getPreferredSystemLanguages()
      : [];

  const locale = app.getLocale?.() || "en-US";
  const list = (preferred.length > 0 ? preferred : [locale]).slice(0, 4);

  const expanded = [...list];
  const primary = expanded[0] ?? "en-US";
  const base = primary.split("-")[0];
  if (base && !expanded.some((l) => l.toLowerCase() === base.toLowerCase())) {
    expanded.push(base);
  }

  return expanded
    .map((lang, index) => {
      if (index === 0) return lang;
      const q = Math.max(0.1, 1 - index * 0.1);
      return `${lang};q=${q.toFixed(1)}`;
    })
    .join(",");
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {number} [timeoutMs]
 * @returns {Promise<string | null>}
 */
async function tryExecVersion(command, args, timeoutMs = 2500) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      timeout: timeoutMs,
      windowsHide: true,
      encoding: "utf8",
    });
    const match = String(stdout).match(/(\d+\.\d+\.\d+\.\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {string} filePath
 * @returns {string | null}
 */
function readVersionFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8").trim();
    const match = text.match(/(\d+\.\d+\.\d+\.\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Read CFBundleShortVersionString from Chrome's Info.plist (macOS).
 * @param {string} plistPath
 * @returns {Promise<string | null>}
 */
async function readMacChromePlistVersion(plistPath) {
  if (!fs.existsSync(plistPath)) return null;
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/plutil",
      ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", plistPath],
      { timeout: 2500, encoding: "utf8" },
    );
    const match = String(stdout).trim().match(/(\d+\.\d+\.\d+\.\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Prefer the Google Chrome install on this machine (what a real user session would send).
 * @returns {Promise<string | null>}
 */
async function detectInstalledChromeVersion() {
  if (process.platform === "darwin") {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/Info.plist",
      path.join(
        os.homedir(),
        "Applications/Google Chrome.app/Contents/Info.plist",
      ),
    ];
    for (const plist of candidates) {
      const version = await readMacChromePlistVersion(plist);
      if (version) return version;
    }
    return tryExecVersion(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ["--version"],
    );
  }

  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA;
    const programFiles = process.env.PROGRAMFILES;
    const programFilesX86 = process.env["PROGRAMFILES(X86)"];

    const versionFiles = [
      local && path.join(local, "Google/Chrome/User Data/Last Version"),
    ].filter(Boolean);

    for (const file of versionFiles) {
      const version = readVersionFile(/** @type {string} */ (file));
      if (version) return version;
    }

    const exes = [
      programFiles && path.join(programFiles, "Google/Chrome/Application/chrome.exe"),
      programFilesX86 &&
        path.join(programFilesX86, "Google/Chrome/Application/chrome.exe"),
      local && path.join(local, "Google/Chrome/Application/chrome.exe"),
    ].filter(Boolean);

    for (const exe of exes) {
      const version = await tryExecVersion(/** @type {string} */ (exe), [
        "--version",
      ]);
      if (version) return version;
    }
    return null;
  }

  // Linux
  for (const bin of [
    "google-chrome-stable",
    "google-chrome",
    "chrome",
    "chromium-browser",
    "chromium",
  ]) {
    const version = await tryExecVersion(bin, ["--version"]);
    if (version) return version;
  }
  return null;
}

/**
 * @returns {"mac" | "win" | "linux"}
 */
function versionHistoryPlatform() {
  if (process.platform === "darwin") return "mac";
  if (process.platform === "win32") return "win";
  return "linux";
}

/**
 * Latest Chrome Stable from Google's public version history API.
 * @returns {Promise<string | null>}
 */
function fetchStableChromeVersion() {
  const url = `https://versionhistory.googleapis.com/v1/chrome/platforms/${versionHistoryPlatform()}/channels/stable/versions?pageSize=1`;

  return new Promise((resolve) => {
    const request = net.request(url);
    const timer = setTimeout(() => {
      request.abort();
      resolve(null);
    }, 4000);

    let body = "";
    request.on("response", (response) => {
      response.on("data", (chunk) => {
        body += chunk.toString();
      });
      response.on("end", () => {
        clearTimeout(timer);
        try {
          const json = JSON.parse(body);
          const version = json?.versions?.[0]?.version;
          const match = String(version ?? "").match(/(\d+\.\d+\.\d+\.\d+)/);
          resolve(match?.[1] ?? null);
        } catch {
          resolve(null);
        }
      });
    });
    request.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    request.end();
  });
}

/**
 * Resolve the Chrome version this device would most likely advertise.
 * @returns {Promise<{ fullVersion: string, source: "installed" | "stable-api" | "fallback" }>}
 */
async function resolveChromeVersion() {
  const installed = await detectInstalledChromeVersion();
  if (installed) {
    return { fullVersion: installed, source: "installed" };
  }

  const stable = await fetchStableChromeVersion();
  if (stable) {
    return { fullVersion: stable, source: "stable-api" };
  }

  return { fullVersion: FALLBACK_CHROME_FULL, source: "fallback" };
}

/**
 * @param {string} fullVersion
 * @param {"installed" | "stable-api" | "fallback"} source
 */
function buildFingerprintFromVersion(fullVersion, source) {
  const chrome = parseChromeVersion(fullVersion);
  const notABrand = greaseBrand();
  const acceptLanguage = buildAcceptLanguage();
  const userAgent = `Mozilla/5.0 (${platformUaToken()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome.uaVersion} Safari/537.36`;

  const secChUa = `"Google Chrome";v="${chrome.major}", "${notABrand.name}";v="${notABrand.major}", "Chromium";v="${chrome.major}"`;
  const secChUaFullVersionList = `"Google Chrome";v="${chrome.fullVersion}", "${notABrand.name}";v="${notABrand.full}", "Chromium";v="${chrome.fullVersion}"`;

  return {
    source,
    chrome,
    userAgent,
    acceptLanguage,
    clientHints: {
      "sec-ch-ua": secChUa,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": platformClientHint(),
      "sec-ch-ua-platform-version": platformVersionHint(),
      "sec-ch-ua-model": '""',
      "sec-ch-ua-full-version-list": secChUaFullVersionList,
    },
  };
}

/**
 * Detect device Chrome + OS profile once per process.
 */
async function initBrowserFingerprint() {
  const { fullVersion, source } = await resolveChromeVersion();
  cachedFingerprint = buildFingerprintFromVersion(fullVersion, source);
  return cachedFingerprint;
}

function getBrowserFingerprint() {
  if (!cachedFingerprint) {
    cachedFingerprint = buildFingerprintFromVersion(
      FALLBACK_CHROME_FULL,
      "fallback",
    );
  }
  return cachedFingerprint;
}

/**
 * @param {Electron.Session} ses
 */
function applyBrowserFingerprint(ses) {
  const { userAgent, acceptLanguage, clientHints } = getBrowserFingerprint();
  ses.setUserAgent(userAgent, acceptLanguage);

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    headers["User-Agent"] = userAgent;
    headers["Accept-Language"] = acceptLanguage;
    for (const [name, value] of Object.entries(clientHints)) {
      headers[name] = value;
    }
    callback({ requestHeaders: headers });
  });

  return { userAgent, acceptLanguage };
}

module.exports = {
  initBrowserFingerprint,
  getBrowserFingerprint,
  applyBrowserFingerprint,
};
