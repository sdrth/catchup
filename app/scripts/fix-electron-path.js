#!/usr/bin/env node
/**
 * Postinstall: keep Electron spawn path clean, and rename the macOS .app so
 * the Dock / Cmd-Tab label is Catchup (not Electron) when running `pnpm start`.
 */
const fs = require("node:fs");
const path = require("node:path");

const APP_NAME = "Catchup";

function patchInfoPlist(plistPath) {
  if (!fs.existsSync(plistPath)) return false;
  let xml = fs.readFileSync(plistPath, "utf8");
  const before = xml;
  xml = xml.replace(
    /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
    `$1${APP_NAME}$2`,
  );
  xml = xml.replace(
    /(<key>CFBundleName<\/key>\s*<string>)[^<]*(<\/string>)/,
    `$1${APP_NAME}$2`,
  );
  if (xml !== before) {
    fs.writeFileSync(plistPath, xml);
    return true;
  }
  return false;
}

try {
  const electronRoot = path.dirname(require.resolve("electron/package.json"));
  const distDir = path.join(electronRoot, "dist");
  const pathFile = path.join(electronRoot, "path.txt");

  if (fs.existsSync(pathFile)) {
    const raw = fs.readFileSync(pathFile, "utf8");
    const trimmed = raw.trim();
    if (raw !== trimmed) {
      fs.writeFileSync(pathFile, trimmed);
      console.log("[catchup] fixed electron path.txt trailing whitespace");
    }
  }

  if (process.platform !== "darwin" || !fs.existsSync(distDir)) {
    process.exit(0);
  }

  const electronApp = path.join(distDir, "Electron.app");
  const catchupApp = path.join(distDir, `${APP_NAME}.app`);

  if (fs.existsSync(electronApp) && !fs.existsSync(catchupApp)) {
    fs.renameSync(electronApp, catchupApp);
    console.log(`[catchup] renamed Electron.app → ${APP_NAME}.app`);
  }

  const appBundle = fs.existsSync(catchupApp)
    ? catchupApp
    : fs.existsSync(electronApp)
      ? electronApp
      : null;

  if (appBundle) {
    if (patchInfoPlist(path.join(appBundle, "Contents", "Info.plist"))) {
      console.log(`[catchup] set ${APP_NAME} CFBundleName in Info.plist`);
    }

    // Point the electron package at the renamed bundle (executable stays Electron).
    if (path.basename(appBundle) === `${APP_NAME}.app` && fs.existsSync(pathFile)) {
      const expected = `${APP_NAME}.app/Contents/MacOS/Electron`;
      const current = fs.readFileSync(pathFile, "utf8").trim();
      if (current !== expected) {
        fs.writeFileSync(pathFile, expected);
        console.log(`[catchup] path.txt → ${expected}`);
      }
    }
  }
} catch {
  // electron not installed yet
}
