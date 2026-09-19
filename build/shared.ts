import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import versions from "./versions.json";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Version numbers for every artefact, in one place.
 *
 * They used to be a `const VERSION` in each of the three build files, and the
 * extension — which packages BOTH scripts — carried a single number for the
 * pair. A Send Resources bug report from the extension therefore claimed the
 * Empire Overview version. `build/versions.json` is also read by the `.mjs`
 * build scripts, which cannot import TypeScript.
 */
export { versions };

/** Repository root (`build/` sits directly beneath it). */
export const rootDir = resolve(here, "..");

export const alias = {
  "@core": resolve(rootDir, "src/core"),
  "@send": resolve(rootDir, "src/send-resources"),
  "@empire": resolve(rootDir, "src/empire-overview"),
};

/**
 * Every Ikariam server.
 *
 * The original scripts hard-coded four servers (s59/s60/s61/s800 on `-en`), so
 * moving to any other world meant editing and reinstalling the userscript. The
 * pattern below covers every world on every language and every Gameforge TLD:
 * hosts look like `s59-en.ikariam.gameforge.com`, `s202-de.ikariam.gameforge.com`
 * and so on.
 *
 * `@include` is used rather than `@match` on purpose: `@match` does not allow a
 * wildcard in the top-level domain, which would drop the non-`.com` portals.
 */
export const includeServers = ["*://*.ikariam.gameforge.*/*"];

/**
 * The forum shares the domain but is a completely different application —
 * running either script there does nothing useful and only risks breaking it.
 */
export const excludeBoard = [
  "*://board.*.ikariam.gameforge.*/*",
  "*://*.ikariam.gameforge.*/board*",
];
