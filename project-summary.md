# Project summary — ikariam-tool

> Written after the TypeScript refactor. For build and development detail see
> [README.md](README.md).

## What this is

Tooling for the browser game **Ikariam**, used by the `-VN-` alliance.

Before: two standalone userscripts, 12.6k lines of JavaScript, no build system.
After: one TypeScript repository that builds **three** artefacts from the same
source: two Tampermonkey userscripts for **Edge**, and one **Chrome** extension.

Both browsers are Chromium so behaviour matches; only the injection route
differs. Being separate browsers, the two installations do not share
`localStorage`.

| Feature set     | Role                                                                        | Original size |
| --------------- | --------------------------------------------------------------------------- | ------------- |
| Empire Overview | Board of towns, resources, army, buildings, research                        | 10,767 lines  |
| Send Resources  | Bulk shipments, wine distribution, building upgrades, multi-account summary | 1,886 lines   |

## Structure

```
src/core/               shared: dom, async, storage, format, logger, task-queue,
                        bug-report, data-transfer, ikariam/{selectors, globals, model}
src/send-resources/     restructured: app, state, navigation, game-state,
                        town-cache, ship-capacity, diagnostics, features/*, ui/*
src/empire-overview/    mechanical port of the 10.7k-line original -> 22 modules
src/extension/          Chrome extension packaging (content script, GM shims)
build/                  two vite configs + the extension build script
tools/                  collect-dom-report.js — live-page selector audit
legacy/                 the two original .js files, for reference only
dist/                   built output
```

## Main changes

**1. Unified task queue.** The old code ran two independent `setInterval` loops
against the same DOM (shipping every 1s, building every 10s). They collided, and
a failed shipment still consumed its queue entry. Now: one queue, one runner,
exactly one task touching the DOM at a time. Handlers return
`done` / `progress` / `retry` / `defer` / `failed`.

The `retry` vs `defer` split matters: `retry` holds position for blockers that
stop everything (no ships at all), `defer` rotates to the back for blockers
specific to one task (this town is already building). Without it, one town
mid-construction would stall every other town's upgrade for hours — the original
explicitly moved on in that case.

**2. Auto Wine algorithm replaced.** Previously a flat `winePerHour × N hours`
split that ignored existing stock. Now water filling — every town ends up able to
hold out for the same time — based on the drafts in `sample/`, with a fix for a
case where those drafts allocate more than the available supply.

**3. Data read from `ikariam.model`, not scraped.** Learned from the IkaEasy
extension, which never touches rendered HTML. Ship counts, action points,
resources and wine consumption all come from the game's own state object, with
the old DOM path kept as a fallback.

**4. Town cache — the wine figures no longer need a second script.** Auto Wine's
only source of per-town stock used to be a table that the game does not render;
it belongs to Empire Overview, so Auto Wine silently required that script to be
installed _and_ its board open. Now each town's figures are snapshotted from the
model whenever that town is on screen and projected forward by its known drain.

**5. Renamed, and no longer server-locked.** "Perseus" was one game world, which
made a poor name for a script that runs on all of them. Both scripts hard-coded
four servers; a live capture came from **s70-en**, i.e. a world where the
originals would not have loaded at all.

**6. Three build targets.** The same source ships as two Tampermonkey
userscripts (Edge) and as an MV3 Chrome extension. The extension needs an extra
hop: a content script shares the page's DOM but not its JavaScript globals, so
`content.js` injects the real bundles as web-accessible `<script>` tags to reach
`window.ikariam`.

The renderer's Chromium check was also hardened. It gates the keycode tables,
and Edge reports `navigator.vendor === "Google Inc."` — so the original answer
was right, but the detection now reads `userAgentData.brands` first because
`vendor` is deprecated.

**7. Runtime bug tracking.** Failures are recorded as they happen —
deduplicated, persisted, and annotated with the queue state, the current town
and a selector health check. A panel button copies the report out. Until now a
failure left no trace at all: unattended automation plus a console that has
scrolled away meant "it stopped working" was unanswerable.

Both scripts are instrumented. Empire Overview needed it most — 10.7k lines of
mechanically ported code, the loosest type checking, and the heaviest dependence
on the game's markup — and had none.

**9. jQuery compatibility for the extension build.** The game's own jQuery went
from 3.6.3 to **4.0.0** between two captures. jQuery 4 removed `$.now`, which
this codebase calls 45 times including in the `City` constructor — the extension
build would have thrown before rendering anything. A shim restores the removed
helpers, and only those actually missing.

**8. Data transfer between browsers.** The two artefacts live in different
browser profiles and therefore share no `localStorage`. Export/import of a JSON
file moves settings and measurements across; in-flight queue state is excluded
by default, because two browsers running one queue would drive a single game
account twice over.

**9. The board actually starts.** Splitting the 10,767-line original into
modules left three of its parts — the jQuery extensions, `render.LoadCSS`, and
the resource-production spans — imported by nobody, so the bundler dropped them
entirely. Empire Overview threw during `Init()` and rendered nothing. A startup
smoke test now evaluates the entry point against a synthetic page and asserts
that the menu button, the board and the Resource tab all appear.

## Verification

The board has since been run against the live game; the shipment path has not.
Four independent checks:

- **Live DOM captures** (`tools/collect-dom-report.js`; its output lands in
  the untracked `tools/output/`) confirmed the town dropdown markup, the building slot ids, the
  shipyard upgrade text, and — the riskiest open question — that the Trading
  Port's destination list really does omit the town you are standing in, so
  shipments go where they are addressed. They also turned up six wrong
  assumptions, including a navigation path that could never have worked with only
  Send Resources installed, and a jQuery version bump that would have broken the
  extension build outright.
- **Three independent sources agree on the cargo formula.** IkaEasy's `const.js`
  states `500 + 20 × level`; the captured shipyard text implies the same; and the
  game's own `transportConfig` reports `maxCapacityPerTransport: 620` and
  `freighterCapacity: 53000` — exactly what this project computes.
- **274 unit tests**, most of them anchored to markup or strings copied verbatim
  from those captures — including a startup smoke test that boots Empire
  Overview end to end against a synthetic Ikariam page.
- **The Empire Overview board has now been run against the live game, and
  works.** A scan leaves all nine towns recorded with 20-24 buildings each,
  real island ids, and wine figures matching the Resource tab cell for cell —
  and they survive the reload. Six further defects surfaced only there, all
  listed below; two of them failed in complete silence and needed
  purpose-built instrumentation (`src/empire-overview/ajax-trace.ts`) to
  find.

## Bugs found and fixed

45 genuine defects, split between the original scripts and the port itself.

From the originals, the most consequential:

- `Utils.cacheFunction` compared against `$.now` (the function) instead of
  `$.now()`, so **no cache ever expired** — army totals, research data and
  corruption figures went stale permanently across 5 call sites.
- Auto Wine read an **undeclared variable** (`cargoSpace`) and nothing between
  the inline `onclick` and that line catches, so `checkAndProcessAutoWine`
  aborted before it ever reached its `gotoTown` call — the feature shipped
  nothing at all. With no receiver configured it took the other branch and spun
  in an infinite `while` loop instead, freezing the tab.
- A coordinate regex was missing its `g` flag, so **every city's Y coordinate was
  silently a copy of its X**.
- `toLocaleFormat` — a Firefox-only API removed from every engine — threw on
  non-Chrome browsers.
- Two CSS blocks were declared but never attached, so the auto-build popup
  rendered unstyled.

Introduced during this refactor and caught by later review:

- Auto Wine's source-town guard compared a value **against itself**, so it always
  passed and planned runs against whichever town happened to be on screen.
- Auto Build returned `retry` for a town already building, blocking the whole
  queue instead of moving on.
- The town cache read the town **name** from the DOM while reading its
  **figures** from the model — two sources that disagree mid-view-swap.
- The Bug Report button was added to a panel section that is `display:none` by
  default, so it could never have been clicked.
- `setInputValue` fired `blur` twice per edit, running the game's handler twice.
- The bug reporter tried to infer its packaging from `chrome.runtime`, which a
  page-world script cannot see — it would have labelled every extension report
  as a userscript.
- The `isNumeric` shim written for jQuery 4 used `!isNaN(Number(v))`, which
  disagrees with jQuery on `""` (`Number("")` is `0`). A unit test caught it
  before it could quietly change a `for...in` guard in the renderer.
- The first fix for that put the announcement in the extension entry, above
  `import "./main"`. ES imports are hoisted, so it ran _after_ the feature code
  had already stamped itself: same mislabelling, different cause. It is a
  build-time constant now, with a test that the entries do not drift back.
- **Three modules were missing from the bundle.** `jquery-ext.ts`,
  `helpers.ts` and `resource-production.ts` only ever ran because the original
  was one file; after the split nothing imported them, so Vite left ~83 kB of
  the original's code out of the build. `render.LoadCSS` did not exist and
  `empire.Init()` threw — no board, no menu button, nothing recorded. This is
  what the user hit when installing the script in Tampermonkey.
- `City`'s constructor assigned to `maxSci`, a getter-only prototype accessor.
  The original ran in sloppy mode and dropped the write silently; the bundle is
  strict-mode ESM, where it throws — aborting town collection.
- Lifting the original's four-server `@include` restriction exposed that only
  `en` was ever translated, so `LanguageData[lang]` was `undefined` on every
  other world — dereferenced at ~40 call sites. It now falls back to English.
- Reading the account name indexed straight into a `querySelector` result, at
  module scope. A missing avatar block threw before the diagnostics were
  installed, so the failure left no trace at all.
- `Building.startUpgradeTimer` called its status-poll IIFE bare, so strict mode
  bound the 3-second callback to `undefined` — `Cannot read properties of
undefined (reading 'isUpgradable')`, once per building per town, forever. It
  also dropped the interval's canceller, so the timers stacked up. Found by
  running the fixed build against the live game.
- `readWineBoard` recorded a row for every town on the board, including the
  ones Empire Overview has not loaded yet — those render a placeholder `0.00`
  with blank consumption. The bogus zero-stock entry then shadowed the town
  cache. It now skips them.
- `FetchAllTowns` deleted every town **absent** from `relatedCityData`, which
  describes the current view rather than the empire — so each pass wiped all
  but the town on screen and recreated it empty. A scan could walk nine towns
  and leave the Buildings tab blank, silently. Found by tracing what arrived
  versus what was kept; `knownTime` jumping forward proved the towns were
  being recreated. Absence is no longer treated as proof of loss.
- The shipment handler assumed it started on the town view, but the previous
  shipment leaves the page on the port's town list and `gotoTown` does not
  navigate back when the town is already selected. The queue sent one
  shipment and then deferred forever. It also waited on a port-view selector
  _after_ submitting, where a timeout throws — and a thrown task stays
  queued, so the same cargo would go twice.
- The global-menu counters were read from `ikariam.model` first, following
  this project's own model-over-DOM rule. The model is view-scoped and
  reports `0` for them from a city view; `0` is finite, so it beat the DOM
  fallback and Auto Wine refused to start with "Not enough ships!" while 227
  merchants sat idle in the header. Those three now read the header first.
- `database.startMonitoringChanges` — which subscribes the save — was **never
  called**; its only apparent call site is bound to `render` and reaches
  render's method of the same name. The one remaining route to storage,
  `beforeunload`, wrapped `Save()` in a timeout, and `Save()` deferred through
  another — neither runs once the page is unloading. Everything the board
  learned stayed in memory. `Save()` is synchronous now, with a debounced
  `SaveSoon()` for the event path.
- `main.ts`'s init retry passed its arguments in the wrong order (`local` and
  `data` swapped), so it re-published `CITYDATA_AVAILABLE` and re-ran the
  deletion above again and again.
- The bug reporter logged and re-snapshotted the page on **every** repeat of
  the same fault. The 3-second timer above filled a live console and made the
  reporter itself expensive; it now logs at 1, 10, 100 ... and re-snapshots at
  most once a minute per fingerprint.

Full table in the README.

## Status

- `npm run typecheck` — green on both the base and the full-strict config
- `npm run test` — 274 tests passing
- `npm run build` — two userscripts + the extension
- No `@ts-nocheck` or `@ts-ignore` anywhere
- `src/core/**` and `src/send-resources/**` pass **full strict mode**

## Remaining work

1. **Run against the live game.** Still the biggest gap. Build, type checks, unit
   tests and bundle initialisation order have been verified; runtime behaviour
   has not.
2. **Send Resources has still not been run against the live game.** Empire
   Overview now has been; the shipment path has not.
3. **Confirm the town-dropdown fallback.** Clicking a dropdown `<a>` is assumed
   to switch town; that needs one manual check in the console.
4. Optionally extend full strict mode over `src/empire-overview/**`. The README
   explains why this was not done wholesale: of the 786 errors it produces, only
   the 149 `strictNullChecks` ones carry real signal, and those were audited by
   hand — which is how three of the bugs above were found.
5. Delete `legacy/` once the port is confirmed working in the game.
