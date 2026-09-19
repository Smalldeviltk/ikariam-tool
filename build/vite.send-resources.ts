import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";
import { alias, excludeBoard, includeServers, rootDir, versions } from "./shared";

/**
 * Send Resources V2.
 *
 * One runtime difference from the original JS: that version ran sandboxed and
 * injected `main()` as a STRING into page context to reach
 * `ikariam.createPopup`, `transportConfig` and to let inline `onclick="..."`
 * attributes see its functions. Here `@grant none` makes Tampermonkey run the
 * script in page context directly, so all of that is available without the
 * stringify hack — which a bundler cannot support anyway, since serialising a
 * function loses its closure.
 *
 * Consequence: do NOT `@require` jQuery. The game page already ships its own;
 * loading a second copy into page context would clobber it. The script reuses
 * the page's instance via `src/core/ikariam/globals.ts`.
 */
const VERSION = versions.sendResources;

export default defineConfig({
  root: rootDir,
  // Stamped into the bundle so bug reports say which build produced them.
  define: {
    __SCRIPT_VERSION__: JSON.stringify(VERSION),
    __PACKAGING__: JSON.stringify("userscript"),
  },
  resolve: { alias },
  plugins: [
    monkey({
      entry: "src/send-resources/main.ts",
      userscript: {
        name: "Ikariam Send Resources",
        namespace: "Smalldevil",
        version: VERSION,
        description:
          "Automates the routine tasks in Ikariam: bulk resource shipments, wine distribution and building upgrades.",
        author: "Smalldevil",
        license: "GPL version 3 or any later version",
        include: includeServers,
        exclude: [
          ...excludeBoard,
          // Island and world-map views have no town context, so nothing here
          // can run. Generalised from the original's `-en`-only patterns.
          "*://*.ikariam.gameforge.*/?view=island*",
          "*://*.ikariam.gameforge.*/?view=worldmap_iso*",
        ],
        grant: "none",
      },
      build: {
        fileName: "Ikariam Send Resources.user.js",
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
