import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";
import { alias, excludeBoard, includeServers, rootDir, versions } from "./shared";

/**
 * Keep the original's two `@require` URLs, in this order — jQuery UI patches
 * jQuery, so it must load second.
 *
 * `externalGlobals` + `cdn.*` is deliberately NOT used: it derives the version
 * from node_modules, which would drift away from the 2.2.4 / 1.9.2 pair this
 * script is known to work with, and it gives no control over load order.
 */
const REQUIRES = [
  "https://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js",
  "https://ajax.googleapis.com/ajax/libs/jqueryui/1.9.2/jquery-ui.min.js",
];

/**
 * Ikariam Empire Overview -VN-.
 *
 * Previously named "Quan ly Ika Perseus -VN- V2". Perseus is only the name of
 * one game world, which made a poor name for a script that runs on all of them;
 * the script already identifies itself as "Empire Overview" internally
 * (`empire.scriptName`), which is what it was adapted from.
 *
 * NOTE: Tampermonkey identifies an installed script by `@name` + `@namespace`,
 * so this rename installs as a NEW script. Remove the old "Quan ly Ika Perseus"
 * entry after installing this one, otherwise both run at once and fight over
 * the same DOM. Stored data is unaffected — the localStorage keys are unchanged.
 *
 * Keeps the original runtime model: sandboxed under Tampermonkey. Why this one
 * cannot switch to page context the way Send Resources did:
 *  - `GM_addStyle` in 21 places, plus `GM_openInTab` / `GM_xmlhttpRequest`
 *  - reaches page globals through `unsafeWindow.ikariam.templateView`
 *  - needs jQuery UI (`.tabs()`, `.draggable()`, `.button()`), which the page's
 *    own jQuery does not provide
 */
const VERSION = versions.empireOverview;

export default defineConfig({
  root: rootDir,
  define: {
    __SCRIPT_VERSION__: JSON.stringify(VERSION),
    __PACKAGING__: JSON.stringify("userscript"),
  },
  resolve: { alias },
  plugins: [
    monkey({
      entry: "src/empire-overview/main.ts",
      userscript: {
        name: "Ikariam Empire Overview -VN-",
        namespace: "Smalldevil",
        version: VERSION,
        description:
          "Empire-wide overview of towns, resources, army, buildings and research. Adapted from Empire Overview for the -VN- alliance.",
        author: "Smalldevil",
        license: "GPL version 3 or any later version",
        include: includeServers,
        exclude: excludeBoard,
        require: REQUIRES,
        grant: [
          "unsafeWindow",
          "GM_getValue",
          "GM_setValue",
          "GM_deleteValue",
          "GM_addStyle",
          "GM_registerMenuCommand",
          "GM_xmlhttpRequest",
          "GM_openInTab",
        ],
      },
      build: {
        fileName: "Ikariam Empire Overview -VN-.user.js",
      },
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    minify: false,
    target: "es2020",
  },
});
