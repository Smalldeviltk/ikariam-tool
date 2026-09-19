/**
 * Chrome extension build.
 *
 * The same TypeScript source as the userscripts, packaged as an MV3 extension.
 *
 * WHY THIS IS A SCRIPT AND NOT A vite.config
 * Every output must be a self-contained IIFE: content scripts are classic
 * scripts, and the page-world files are injected as plain `<script src=...>`
 * tags. Rollup refuses `format: "iife"` with more than one input, so each entry
 * is built in its own pass and the manifest is written at the end.
 *
 * WHAT DIFFERS FROM THE USERSCRIPT BUILDS
 *  1. No `@grant` sandbox. An MV3 content script shares the page's DOM but NOT
 *     its JavaScript globals, so `window.ikariam`, `window.transportConfig` and
 *     the page's jQuery are all invisible from it — and those are exactly what
 *     both features are built on. `content.js` therefore only injects the real
 *     bundles as web-accessible `<script>` tags, which the browser runs in the
 *     page's own world. Same trick the IkaEasy extension uses.
 *  2. No `@require`. jQuery is not bundled; Empire Overview reuses the copy the
 *     game already ships (3.6.3 with jQuery UI 1.13.3 observed live).
 *  3. `GM_*` and `unsafeWindow` do not exist, so `src/extension/gm-shim.ts`
 *     installs browser-native equivalents first.
 *
 * Output: dist/extension/{manifest.json, content.js, page/*.js}
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, "..");
const outDir = resolve(rootDir, "dist/extension");

/** Shared with the two Vite configs; see `build/shared.ts`. */
const versions = JSON.parse(
  readFileSync(resolve(here, "versions.json"), "utf8"),
);

/** Kept in step with `build/shared.ts`; both must resolve the same aliases. */
const alias = {
  "@core": resolve(rootDir, "src/core"),
  "@send": resolve(rootDir, "src/send-resources"),
  "@empire": resolve(rootDir, "src/empire-overview"),
};

/** Matches every world on every Gameforge TLD, as the userscripts do. */
const MATCHES = ["*://*.ikariam.gameforge.com/*", "*://*.ikariam.gameforge.de/*"];

/**
 * Each entry stamps the version of the script it actually contains. The
 * extension packages both, so a single number would make one of the two lie
 * about itself in its bug reports.
 */
const ENTRIES = [
  {
    name: "content",
    input: "src/extension/content.ts",
    version: versions.extension,
  },
  {
    name: "page/empire-overview",
    input: "src/extension/page-empire-overview.ts",
    version: versions.empireOverview,
  },
  {
    name: "page/send-resources",
    input: "src/extension/page-send-resources.ts",
    version: versions.sendResources,
  },
];

async function buildEntry({ name, input, version }, first) {
  await build({
    root: rootDir,
    configFile: false,
    logLevel: "warn",
    resolve: { alias },
    // Stamped in so a bug report says which build produced it.
    define: {
      __SCRIPT_VERSION__: JSON.stringify(version),
      __PACKAGING__: JSON.stringify("extension"),
    },
    build: {
      outDir,
      // Only the first pass may clear the directory, or each build would wipe
      // the previous one's output.
      emptyOutDir: first,
      minify: false,
      target: "es2020",
      rollupOptions: {
        input: resolve(rootDir, input),
        output: {
          format: "iife",
          entryFileNames: `${name}.js`,
        },
      },
    },
  });
  console.log(`  built ${name}.js`);
}

function writeManifest() {
  const manifest = {
    manifest_version: 3,
    name: "Ikariam Tools -VN-",
    version: versions.extension,
    description:
      "Empire overview plus automated shipments, wine distribution and building upgrades for Ikariam.",
    host_permissions: MATCHES,
    content_scripts: [
      {
        matches: MATCHES,
        exclude_matches: [
          "*://board.*.ikariam.gameforge.com/*",
          "*://*.ikariam.gameforge.com/board*",
        ],
        js: ["content.js"],
        // The game renders late; this matches Tampermonkey's default timing.
        run_at: "document_idle",
      },
    ],
    // The injected <script> tags fetch these, so they must be reachable.
    web_accessible_resources: [{ resources: ["page/*.js"], matches: MATCHES }],
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  console.log("  wrote manifest.json");
}

/**
 * Build the whole extension. Exported so `build/build.mjs` can drive it
 * alongside the userscript builds; still runnable on its own.
 */
export async function buildExtension() {
  console.log("Building Chrome extension into dist/extension/");
  for (const [index, entry] of ENTRIES.entries()) {
    await buildEntry(entry, index === 0);
  }
  writeManifest();
  return { outDir, version: versions.extension };
}

// Run directly (`node build/build-extension.mjs`) but not when imported.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildExtension();
  console.log(
    "Done. Load dist/extension/ via chrome://extensions -> Load unpacked.",
  );
}
