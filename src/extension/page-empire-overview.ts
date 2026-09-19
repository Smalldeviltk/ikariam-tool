/**
 * Page-world entry for Empire Overview, used by the Chrome extension build.
 *
 * Import order matters and is load-bearing: the shims must be installed before
 * the feature code evaluates, and ES modules run their imports in source order.
 *
 * Note what this file deliberately does NOT do: announce its packaging. Import
 * declarations are hoisted, so any statement here would run AFTER
 * `@empire/main` had already evaluated and stamped itself. The packaging is a
 * build-time constant (`__PACKAGING__`) instead.
 *
 * jQuery is NOT bundled. Empire Overview needs jQuery UI, and a live page was
 * observed already carrying jQuery 3.6.3 with jQuery UI 1.13.3, so
 * `src/empire-overview/jquery.ts` picks the page's copy up from the bare
 * `jQuery` global. The userscript build instead `@require`s 2.2.4 / 1.9.2, which
 * is what the original shipped with.
 */
import "./gm-shim";
import "@empire/main";
