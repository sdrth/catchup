#!/usr/bin/env node
/**
 * Local packaging helper. Signing is opt-in via CATCHUP_CSC_NAME.
 */
const path = require("node:path");
const { packager } = require("@electron/packager");

async function main() {
  const identity = process.env.CATCHUP_CSC_NAME?.trim();
  const dir = path.join(__dirname, "..");

  /** @type {Parameters<typeof packager>[0]} */
  const opts = {
    dir,
    name: "Catchup",
    appBundleId: "dev.catchup.app",
    appCopyright: "Catchup",
    appCategoryType: "public.app-category.productivity",
    out: path.join(dir, "out"),
    overwrite: true,
    prune: true,
    asar: true,
    icon: path.join(dir, "build", "icon"),
    darwinDarkModeSupport: true,
    extendInfo: {
      CFBundleName: "Catchup",
      CFBundleDisplayName: "Catchup",
    },
    ignore: [
      /^\/out($|\/)/,
      /^\/\.git($|\/)/,
      /^\/\.cursor($|\/)/,
      /\.DS_Store$/,
      /\.sqlite$/,
      /\.sqlite-journal$/,
      /\.sqlite-wal$/,
      /\.sqlite-shm$/,
    ],
  };

  if (identity) {
    opts.osxSign = { identity };
    console.log(`Signing with identity: ${identity}`);
  } else {
    console.log(
      "Packaging unsigned (set CATCHUP_CSC_NAME to sign with your cert).",
    );
  }

  const paths = await packager(opts);
  for (const p of paths) {
    console.log(`Built: ${p}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
