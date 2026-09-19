/**
 * One entry point for both packagings.
 *
 *   node build/build.mjs userscript   Tampermonkey (.user.js), deployed on Edge
 *   node build/build.mjs extension    Chrome MV3, loaded unpacked
 *   node build/build.mjs all          both (the default)
 *
 * Why one script rather than three npm scripts chained with `&&`: the two
 * packagings build the SAME source with different assumptions — sandbox vs page
 * world, `@require`d jQuery vs the page's own, `GM_*` vs shims — and which one
 * you produced decides where it can be installed. Chaining hid that behind a
 * wall of Vite output; this prints what was built, for which browser, and what
 * to do with it.
 *
 * See `build/build-extension.mjs` for why the extension cannot be a Vite
 * config, and `build/versions.json` for the version numbers both share.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { buildExtension } from "./build-extension.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, "..");
const versions = JSON.parse(
  readFileSync(resolve(here, "versions.json"), "utf8"),
);

/** Spellings a person might reasonably type for each target. */
const ALIASES = {
  userscript: "userscript",
  userscripts: "userscript",
  tampermonkey: "userscript",
  edge: "userscript",
  monkey: "userscript",
  extension: "extension",
  chrome: "extension",
  mv3: "extension",
  all: "all",
  both: "all",
};

const USERSCRIPTS = [
  {
    label: "Send Resources",
    config: "build/vite.send-resources.ts",
    output: "dist/Ikariam Send Resources.user.js",
    version: versions.sendResources,
  },
  {
    label: "Empire Overview",
    config: "build/vite.empire-overview.ts",
    output: "dist/Ikariam Empire Overview -VN-.user.js",
    version: versions.empireOverview,
  },
];

async function buildUserscripts() {
  console.log("Building userscripts into dist/");
  for (const script of USERSCRIPTS) {
    await build({
      root: rootDir,
      configFile: resolve(rootDir, script.config),
      logLevel: "warn",
    });
    console.log(`  built ${script.output}  (v${script.version})`);
  }
}

function reportUserscripts() {
  console.log("");
  console.log("Tampermonkey (Edge)");
  for (const script of USERSCRIPTS) console.log(`  ${script.output}`);
  console.log(
    "  Install: open the .user.js file in Edge, or drag it onto the",
  );
  console.log("  Tampermonkey dashboard. Remove any older copy first —");
  console.log("  Tampermonkey keys scripts by @name + @namespace, so a rename");
  console.log("  installs as a second script and both would run at once.");
}

function reportExtension() {
  console.log("");
  console.log("Chrome extension");
  console.log("  dist/extension/");
  console.log(
    "  Install: chrome://extensions -> Developer mode -> Load unpacked.",
  );
  console.log(
    "  After rebuilding, press Reload on the card — Chrome does not watch",
  );
  console.log("  the folder.");
}

const requested = process.argv[2] ?? "all";
const target = ALIASES[requested.toLowerCase().replace(/^--/, "")];

if (!target) {
  console.error(`Unknown target: ${requested}`);
  console.error("Use one of: userscript | extension | all");
  process.exit(1);
}

if (target === "userscript" || target === "all") await buildUserscripts();
if (target === "extension" || target === "all") await buildExtension();

if (target === "userscript" || target === "all") reportUserscripts();
if (target === "extension" || target === "all") reportExtension();
console.log("");
