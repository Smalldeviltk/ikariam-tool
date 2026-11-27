# Project summary — ikariam-tool

> Written after the TypeScript refactor (20/09/2026); brought up to date on
> 28/11/2026 against `3a7d2ae` (the 26–27/11 rounds, §2.AQ and §2.AR,
> committed that day with this file in the commit after it; not pushed). For build and development detail
> see [README.md](README.md). The round-by-round record of everything done
> since the port — what was asked, what was measured on the live game, what
> was changed and what is still unverified — is
> [docs/improvement-plan.md](docs/improvement-plan.md) (Vietnamese) and
> [docs/session-handover.md](docs/session-handover.md) (English); those two
> are kept current with every round, this file is the overview.

## What this is

Tooling for the browser game **Ikariam**, used by the `-VN-` alliance.

Before: two standalone userscripts, 12.6k lines of JavaScript, no build system.
After: one TypeScript repository that builds **three** artefacts from the same
source: two Tampermonkey userscripts for **Edge**, and one **Chrome** extension.

Both browsers are Chromium so behaviour matches; only the injection route
differs. Being separate browsers, the two installations do not share
`localStorage`.

| Feature set     | Role                                                                                                               | Original size |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | ------------- |
| Empire Overview | Board of towns, resources, army, buildings, research; quick upgrades from the board                                | 10,767 lines  |
| Send Resources  | Bulk shipments, wine distribution, building upgrades, pirate captures, multi-account summary, cross-computer queue | 1,886 lines   |

The original `.js` files were at the repository root until `888dc29`
(20/09/2026) and can be read from any earlier commit. A `legacy/` folder is
listed in `.gitignore` for a local copy; it has never been tracked and is not
on this checkout.

Versions (`build/versions.json`): Send Resources **21.0.0**, Empire Overview
**2.1.0**, extension **2.1.0**. 92 commits, 79 of them since the port.

## Structure

```
src/core/               shared: dom, async, storage, format, logger, messages,
                        task-queue (queue + runner + cross-tab lock),
                        bug-report, data-transfer, notifications,
                        ikariam/{selectors, globals, model, http},
                        ui/window (the draggable game-styled window)
src/send-resources/     app, state, navigation, game-state, town-cache,
                        ship-capacity, queue-note, diagnostics, messages, types,
                        features/{send-resources, auto-wine, wine-distribution,
                                  auto-build, build-queue-validation,
                                  sync-towns, pirate, wine-warning,
                                  transport-buttons, summary-account, barbarian,
                                  building-help-crawler}
                        ui/{panel, dialogs, queue-view, actions,
                            data-transfer-ui, styles}
src/empire-overview/    mechanical port of the 10.7k-line original -> 36 files,
                        plus ajax-trace, diagnostics and jquery-compat
src/extension/          Chrome extension packaging (content script, GM shims,
                        view guard, page-world entries)
build/                  two vite configs, build.mjs / build-extension.mjs,
                        versions.json, shared.ts (aliases, server patterns)
tools/                  collect-dom-report.js  — live-page selector audit
                        wine-transport.js      — wine split across accounts
                        input-wine-transport/, output-wine-transport/ (ignored)
docs/                   improvement-plan.md, session-handover.md,
                        prompts/review-source-workflow.md (the review
                        prompt for this project),
                        wiki/ (62 captured building-help pages, the
                        levels past 50 under wiki/s303/)
dist/                   built output (ignored)
sample/                 reference material and captures (ignored)
```

Sizes: 29,619 lines of TypeScript outside tests (core 4,133 · send-resources
12,471 · empire-overview 12,867 · extension 148) and 21,151 lines of tests, in
40 test files (one of them, `tools/collect-dom-report.test.ts`, outside `src/`). Import aliases: `@core/*`, `@send/*`, `@empire/*`.

## Main changes made by the port

**1. Unified task queue.** The old code ran two independent `setInterval` loops
against the same DOM (shipping every 1s, building every 10s). They collided, and
a failed shipment still consumed its queue entry. Now: one queue, one runner,
exactly one task touching the DOM at a time. Handlers return
`done` / `progress` / `retry` / `defer` / `failed`.

The `retry` vs `defer` split matters: `retry` holds position for blockers that
stop everything (no ships at all), `defer` rotates to the back for blockers
specific to one task (this town is already building). Without it, one town
mid-construction would stall every other town's upgrade for hours — the original
explicitly moved on in that case. Since 29/09 a `retry` blocks only its own task
_type_, so upgrades keep running while a shipment waits for ships; since 02/10
each Start Timer lets the runner run only its own type.

**2. Auto Wine algorithm replaced.** Previously a flat `winePerHour × N hours`
split that ignored existing stock. Now water filling — every town ends up able to
hold out for the same time — based on two earlier drafts kept outside the
repository, with a fix for a case where those drafts allocate more than the
available supply (`wine-distribution.ts`, pure, no DOM).

**3. Data read from `ikariam.model`, not scraped.** Learned from the IkaEasy
extension, which never touches rendered HTML. Ship counts, action points,
resources and wine consumption all come from the game's own state object, with
the old DOM path kept as a fallback. (The three global-menu counters are the
measured exception: the model is view-scoped and reports `0` for them.)

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

**7. Runtime bug tracking.** Failures are recorded as they happen —
deduplicated, persisted, and annotated with the queue state, the current town
and a selector health check. Since 03/10 the panel's Bug Report button saves a
JSON file (the clipboard cut two reports at 50,000 characters) carrying the
last 200 log lines and `gameData`: the shipment form if on screen, the board's
quick-upgrade answers, the town switches that did not land, the tool's last
requests, Pirate's failed captures. Both scripts are instrumented.

**8. jQuery compatibility for the extension build.** The game's own jQuery went
from 3.6.3 to **4.0.0** between two captures. jQuery 4 removed `$.now`, which
this codebase calls dozens of times including in the `City` constructor. A shim
restores the removed helpers, and only those actually missing.

**9. Data transfer between browsers.** The two artefacts live in different
browser profiles and therefore share no `localStorage`. Export/import of a JSON
file moves settings and measurements across; in-flight queue state is excluded
by default, because two browsers running one queue would drive a single game
account twice over. Every stored key is classified (`config` / `measurements`
/ `runtime` / `diagnostics`), and a test fails when a new key is left out.

**10. The board actually starts.** Splitting the 10,767-line original into
modules left three of its parts imported by nobody, so the bundler dropped
them entirely and `empire.Init()` threw. A startup smoke test now evaluates the
entry point against a synthetic page and asserts that the menu button, the
board and the Resource tab all appear.

## What was built after the port (21/09 → 28/11/2026)

Each item has a numbered section in the plan (§2.A–§2.AR) and the handover
(§1–§42) with the measurements behind it.

- **An AJAX data layer** (`core/ikariam/http.ts`). The game answers
  `?view=townHall&cityId=…&ajax=1` with the same JSON the page uses, in
  328–974 ms against 2,367 ms per town for walking there. Scan loads every town
  that way without moving the player's view; the board records fetched towns
  through the same subscriber as clicked ones. Town switches go through the
  game's own `#changeCityForm`, which — measured — answers with a page reload.
- **A control window instead of twelve pinned buttons** (`core/ui/window.ts`,
  `ui/panel.ts`): draggable, game-styled, grouped by feature (Wine / Transport
  / Build / Pirate / Queue / Account / Data / Notifications), remembers its
  position and which groups are folded, opened from an entry in the game's left
  menu. The queue is visible and editable (remove, reorder one row at a time).
- **Shipping through the game's new trading port.** Gameforge replaced the
  destination list with `#js_transportPanel`; every automated shipment had been
  failing silently. The form is now opened by
  `?view=transport&destinationCityId=<id>`. Shipments respect the source's
  stock, action points and one ship's cargo; the form gets quick-amount buttons
  in multiples of the _calibrated_ capacity (620 / 53,000 on the test account,
  not the game's base 500 / 50,000).
- **Auto Wine, several rounds**: net of the Wine Press (the model's figure is
  gross — measured 40% too high on 26/09; a fetched answer's `headerData`
  read net on 25/11, and which one holds is still open), whole ships, wine drunk during transit, the
  driest town first, a source town picked by itself when none is ticked, towns
  that make their own wine left out, a plan preview, a one-press Start
  (scan → load → save → queue → timer on).
- **Auto Build in laps**, as the original: one visit per town per lap, the next
  lap with the keep-alive reload; works on a second account whose dropdown
  shows coordinates; the runner is locked to one tab per account
  (`navigator.locks`); a task that keeps throwing is dropped after five tries
  (the first version never dropped anything — `console.error` is not a function
  on the game's page).
- **Building data from the game itself.** The wiki's cost tables disagreed with
  the game in 3,795 of 3,900 cells. `Constant.BuildingData` was regenerated
  from the game's Help > building details pages (captured with a Crawl button;
  raw pages in `docs/wiki/`), including 704 levels past 50 and the server's
  construction-time buff and Chronos' Forge in the board's upgrade times.
- **Quick upgrades from the board** (a ▲ in the Build tab), building levels on
  the city view, a sync spinner, stock tooltips, full-store stripes, a wine
  warning per town, and **desktop notifications** (building finished, fleet
  arrived, wine low, task dropped, Pirate stopped).
- **The queue copied into the game's notepad** (`queue-note.ts`), so a second
  computer logged into the same account carries on with it: a 200-character
  compact format, three-way merge against a shared base, and each order
  claimed in the notepad just before it is acted on.
- **Town-switch diagnostics and a token fix.** Switches that do not land are
  the one recurring fault whose cause is still unknown; the tool now keeps a
  short trace of them (the game's feedback, hashed `actionRequest` tags, the
  last ten requests). Along the way: an action of ours moves the session
  token on the server, so the token the server answers with now goes into the
  page's model, and a switch refused as "invalid action" is sent again once.
- **A Crawl dialog** that saves measurements to files — Building, Wine,
  Pirate; **By id** (an element's HTML and CSS, or what a piece of JS
  returns); **Page** (the game screen open now, every form with all its
  fields); **Research** (each town's Town Hall, Academy and Temple, the
  Palace, the Research Advisor and each research track, Finances, kept raw).
  A crawl that cannot be done saves its error instead; session tokens are
  taken out of every file. And **`tools/wine-transport.js`**: reads every account's Crawl Wine
  file, levels wine so that every town of every account runs dry at the same
  moment (the lowest account sets the target; surplus stays at each source),
  and writes one JSON plan per account, which Auto Wine Settings **imports**
  into the queue.
- **Pirate**: capture runs from a Pirate Fortress on a timer (the fortress's
  own request, re-sent when the mission is over plus 10 s), the capture points
  shown in the panel, a captcha detected from the game's form — on which Pirate
  stops, notifies, opens the fortress for the word to be typed (switching town
  first when needed), and holds the task queue and the keep-alive reload until
  Pirate or the queue is started again; the panel shows the hold.
- **Auto Build Settings per town** (21/11): a town dropdown, other towns read
  over ajax; the planned level beside each building; removing a level removes
  the later ones; levels already built leave the saved list
  (`build-queue-validation.ts`); the notepad is not written while the runner
  has a building open, in any tab.
- **22–23/11**: the building list on one row, Transport Settings' table beside
  its form, Clear All in both dialogs, the tool's popup sized to its content;
  a review of all of `src` by this project's own prompt
  (`docs/prompts/review-source-workflow.md`) and its fixes; nothing started on
  a page the tool has just clicked away from (switches were lost there).
- **24/11**: the extension bundle without comments (−36% / −10%); the
  userscripts are not minified, so stack traces stay readable.
- **26–27/11**: a review of the whole tool by four read-only agents, every
  finding fixed but one (below); then a review of that change by the
  project's prompt, and its findings fixed. An open board now stops saving
  after an Import that wrote its keys; Auto Wine's Save and Import wait while
  a task is under way in any tab, and Import cuts each shipment to the room
  left in the town's storage; the two scripts book the gap between their
  requests on the page.

## Verification

Four kinds of evidence, in order of strength.

- **Measured on the live game and recorded.** The handover's §2 lists every
  fact measured on the real account (`s303-en`): request timings, the
  `text/html` JSON answers, the view-scoped model, the gross wine figure, the
  new port markup, the `selectvalue` city ids, the `.constructionSite` busy
  signal, the reload on a town switch, the menu entry's `expandable` class
  breaking the header, and more. Nothing there is re-derived from memory.
- **Run on the game, per the user's reports and the bug-report files.** The
  Empire Overview board: a scan leaves all nine towns recorded with real
  buildings and wine figures that survive the reload. Shipments through the
  new port, the runner, the menu entry, build times and the 04/10 fixes: the
  user's verdict on 04/10 was "roughly ok" — a general verdict, not a per-item
  report. Auto Build: a lap on a second account (26–28/09), ten laps on a
  second computer (29/10, refused by the game until the notepad claim moved
  before the building is opened), one successful upgrade on 30/10. Auto Wine's
  Start on 02/11: nine towns scanned in 8.3 s, four shipments sailed. The
  notepad sync: one run, one computer. Pirate (11/11 bug report): captures
  sent as GET are accepted, and the tool's own capture answer carries the
  captcha form. Crawl Page and Research (25/11, one account, six towns): the
  board's max population, scientists' gold and satisfaction formulas match
  the game's figures part by part.
- **1,192 unit tests in 41 files** (28/11/2026), most anchored to markup or
  strings copied from live captures, including the startup smoke test that
  boots Empire Overview end to end. Each round's new rules were checked by
  breaking them on purpose and watching the matching tests fail (the counts
  are in each plan section).
- **Three independent sources agree on the cargo formula**: IkaEasy's
  `500 + 20 × level`, the captured shipyard text, and the game's own
  `transportConfig` (`maxCapacityPerTransport: 620`, `freighterCapacity:
53000`).

**Never seen on the game:**

- **The Chrome extension.** Its manifest was invalid from the toolchain commit
  until 04/10 (`exclude_matches` with a wildcard inside the host, which Chrome
  refuses — now `exclude_globs`); it has not been loaded since (it was
  rebuilt on 25/11, without comments). Every test on the game so far was the
  userscripts.
- **Everything from 04/10's §2.R onward as a round**: the ten-row lists, the
  collapsible panel, the always-open window, Auto Wine's self-picked source,
  the From town's stock in Transport Settings, the town switch trace, the
  Crawl Wine fix, `wine-transport.js` on anything but crawl files, Import,
  Pirate as a whole, Auto Build Settings per town, the 22–23/11 layouts and
  fixes, and the 26–27/11 rounds (the board's stop after an Import, the
  booked request gap, Auto Wine's waits and its storage cut, the fetched
  town kept apart from the one on screen). (Single pieces were seen through bug reports and crawl files — see
  above.)

## Bugs found and fixed

**During the port and its review (to 05/10/2026):** the README's tables list
40 defects, split between the original scripts and the port itself. The most
consequential from the originals:

- `Utils.cacheFunction` compared against `$.now` (the function) instead of
  `$.now()`, so **no cache ever expired** — army totals, research data and
  corruption figures went stale permanently across 5 call sites.
- Auto Wine read an **undeclared variable** (`cargoSpace`) and nothing between
  the inline `onclick` and that line catches, so the feature shipped nothing at
  all; with no receiver configured it spun in an infinite `while` loop instead.
- A coordinate regex was missing its `g` flag, so **every city's Y coordinate was
  silently a copy of its X**.
- `database.startMonitoringChanges` — which subscribes the save — was never
  called, and the one remaining save path ran inside `beforeunload` timeouts
  that never fire. Everything the board learned stayed in memory.
- `FetchAllTowns` deleted every town absent from `relatedCityData`, which
  describes the current view, so each pass wiped all but the town on screen.

Introduced by the refactor and caught later: a source-town guard that compared
a value against itself; `retry` where `defer` was meant; three modules missing
from the bundle; a strict-mode throw on a getter-only property; `LanguageData`
undefined on every non-`en` world; a status-poll IIFE bound to `undefined`;
`readWineBoard` recording unloaded rows as zero stock; a shipment handler that
assumed the wrong starting view and could send the same cargo twice; the
model's `0` beating the DOM fallback for the global counters.

**After the port (from the bug reports and reviews, 21/09 → 27/11):**

- The runner never dropped a failing task: its catch called `console.error`,
  which is not a function on the game's page, and threw before counting.
- A foreign `<li>` with the `expandable` class in the game's left menu stopped
  the header from refreshing after a shipment (measured by elimination).
- jQuery 2.2.4's `Callbacks.fire` has no try/finally: one subscriber that threw
  (▲ on a Palace) left the board silently dropping every later response until
  a reload. Subscribers are isolated now.
- A reload loop between two towns while a shipment's source was out of action
  points; a scan that made a fetched town the board's "current" town; the
  session token in Bug Report files; an import that trusted every key in the
  file (an XSS route through a foreign export).
- The notepad's save handed the session out a new token while the Upgrade
  button still carried the old one, so Auto Build clicked Upgrade ten laps in
  a row and the game refused each; the claim now comes before the building
  is opened, and the token goes into the page's model.
- A Pirate captcha hold that Start Auto Wine did not lift, shown only in the
  log under a button reading "Stop Timer" (11/11); any start of the queue
  lifts it now, and the panel shows it.
- A notepad claim that did not cancel the sync armed a moment before, which
  then wrote the claimed entry back (21/11).
- Town switches sent within a second of "Back to the town view" were lost
  with the reload that click causes (4 of 4 in the 23/11 report); nothing
  starts on such a page now.
- The 22–23/11 review: Pirate waited for its own tab's runner only; an
  upgrade task dropped after five throws while its town switch was still
  pending (not sent again within 30 s); crawl files carrying the session
  token; an Import deleting build entries on other computers; Empire
  Overview reading counts only up to the thousands separator (1,234 → 1).
- The 26–27/11 reviews:
  - A town the tool fetched, read off the city view, landed on the town on
    screen: its island id, coordinates, priests and scientists, then saved.
  - A late answer put an old session token back; the change-city form's own
    token field was never updated; the two scripts' requests had no gap
    between them.
  - An open board wrote its older copy back over an Import.
  - ▲ came back enabled while its upgrade was in flight.
  - Tooltips showed the previous hover's figures, and the research total's
    threw (`maxSci` of null) — the error in the bug reports of 11/11 and
    before.
  - An upgrade longer than 24.8 days would have finished at once (the
    `setTimeout` overflow is not measured in a browser).
  - Armies on the way to a town were never counted.
  - Auto Wine re-planned under a shipment in flight.
- **My own, reverted the same day:** a 10 s wait after a shipment's click back
  to the town view sent one shipment eight times. **Another, fixed the same
  day:** the first fix for the s202 wine table searched it on every server,
  so on s303 a net figure of 179 had the Wine Press taken off twice. The
  review by the project's prompt caught it.

Still open: the town switch that does not land (M-Eretria four times on
30/10; once on 02/11 the game answered a switch without a reload). It cannot
be reproduced at will; the trace is in place and the next bug report after an
occurrence is what the fix waits on. Also open: whether `wineSpendings` is
gross or net (above); if the model is net now, Auto Wine under-counts by the
Wine Press's percentage. And the board's Finances figures are matched to the
towns by the order of its stored towns, not by name; the table's layout is
needed (a new Crawl Research, or a Crawl Page of the Finances screen).

## Status (28/11/2026)

- `npm run typecheck` — green on both the base and the full-strict config
- `npm run test` — **1,192 tests passing in 41 files**
- `npm run build` — two userscripts + the extension; the user's last build is
  `dist/` of 25/11 17:01–17:16, which has none of the 26–27/11 changes
  (`ikaBoardDataImportedAt`: 0 in all four bundles); both userscripts build
  from the current tree (checked in a scratch directory, not in `dist/`)
- No `@ts-nocheck`, `@ts-ignore` or `@ts-expect-error` anywhere
- `src/core/**` and `src/send-resources/**` pass **full strict mode**;
  `src/empire-overview/**` is held to the base config (see README, "Type
  strictness")
- Prettier-clean, except five files that were off its format before the rule
  was applied and are left alone: `core/ikariam/http.test.ts`,
  `features/transport-buttons.test.ts`, `town-cache.test.ts`, and the two
  Vite configs in `build/`
- `refactor` is the working branch; `origin/refactor` = `b3c960f` (checked
  28/11); `3a7d2ae` and the documents commit after it are not pushed

## Remaining work

1. **Try the post-04/10 rounds on the game**, with `dist/` rebuilt (the
   25/11 build lacks the 26–27/11 rounds) and installed in place of whatever
   is in the browser. Each plan section ends
   with a "what to try" list; §2.AN's six steps are the newest. Press Bug
   Report after any failure and put the file in `sample/`.
2. **Load the Chrome extension once**, with the two userscripts switched off,
   or each script runs twice.
3. **Find the cause of the town switch that does not land.** The trace
   (`ikaTownSwitchTrace`, the last five, in every Bug Report) is what the next
   report needs to carry.
4. **Settle `wineSpendings`**: in one town with a Wine Press, at the same
   moment, Crawl by id `ikariam.model.wineSpendings` and Crawl Research.
5. **Plan items waiting on the user**: R (an update channel — a public URL
   for the builds), the rest of U (levels past the crawled windows), and what
   V still lacks (priests, a government malus, another account). P and L
   were settled on 25/11: L stays the player's, P is dropped.
6. **Match the Finances rows to towns by name**, once a capture shows the
   table's layout (above). The review of `src` begun on 22–23/11 was
   finished on 26–27/11.
7. Optionally extend full strict mode over `src/empire-overview/**`; the README
   explains why this was not done wholesale.
