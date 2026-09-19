# ikariam-tool

Two userscripts for Ikariam, written in TypeScript and built with Vite +
`vite-plugin-monkey`.

| Script                           | Role                                                                                  | Entry                         |
| -------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------- |
| **Ikariam Empire Overview -VN-** | Empire-wide board: towns, resources, army, buildings, research                        | `src/empire-overview/main.ts` |
| **Ikariam Send Resources**       | Automates bulk shipments, wine distribution, building upgrades, multi-account summary | `src/send-resources/main.ts`  |

Both run on **every** Ikariam world (`*://*.ikariam.gameforge.*/*`), not just the
four servers the original scripts hard-coded.

**Deployment targets**

| Artefact          | Browser    | Loaded by          |
| ----------------- | ---------- | ------------------ |
| `dist/*.user.js`  | **Edge**   | Tampermonkey       |
| `dist/extension/` | **Chrome** | unpacked extension |

Both browsers are Chromium, so the runtime behaviour is the same; what differs
is how the code gets into the page (see _Packaging_ below). Because they are
separate browsers they also have separate `localStorage`, so the two
installations never share a queue or a town cache.

---

## Getting started

```bash
npm install

npm run dev:send        # dev Send Resources (HMR — edits reload in the browser)
npm run dev:empire      # dev Empire Overview

npm run build:userscript   # Tampermonkey (.user.js) -> dist/
npm run build:extension    # Chrome MV3            -> dist/extension/
npm run build              # both

npm run typecheck       # base config + full-strict config
npm run test            # vitest
npm run format          # prettier
```

`dev` prints a URL; open it and Tampermonkey offers to install a thin userscript
pointing at the dev server. After that, editing anything under `src/` reloads the
game page automatically — no rebuild-and-reinstall cycle.

### The two packagings

`build/build.mjs` is the single entry point; the npm scripts above are thin
wrappers, and `node build/build.mjs userscript|extension|all` does the same
thing directly (`tampermonkey`, `edge` and `chrome` are accepted spellings).

| Target       | Output            | Install                                                 |
| ------------ | ----------------- | ------------------------------------------------------- |
| `userscript` | `dist/*.user.js`  | Drag onto the Tampermonkey dashboard (deployed on Edge) |
| `extension`  | `dist/extension/` | `chrome://extensions` → Developer mode → Load unpacked  |

Two things the script prints because they are easy to get wrong: Tampermonkey
keys a script by `@name` + `@namespace`, so a renamed script installs as a
_second_ one and both then fight over the same DOM; and Chrome does not watch
the unpacked folder, so a rebuild needs a Reload on the extension card.

Version numbers live in `build/versions.json`, read by both the Vite configs
and the extension script. They were previously a `const VERSION` in each of the
three build files, and the extension — which packages both scripts — stamped a
single number onto the pair, so a Send Resources bug report coming from the
extension claimed the Empire Overview version. Each entry now stamps its own.

---

## Layout

```
src/
├── env.d.ts                    ambient declarations shared by both scripts
│
├── core/                       SHARED by both scripts
│   ├── async.ts                sleep, waitFor (replaces the recursive setTimeout idiom)
│   ├── dom.ts                  qs/qsa/waitForElement, addStyle
│   ├── format.ts               number & time formatting, compareValues, minBy
│   ├── logger.ts               log to a textarea + localStorage
│   ├── storage.ts              typed localStorage, three key schemes
│   ├── task-queue.ts           THE UNIFIED QUEUE + runner   ← see below
│       ├── model.ts          typed ikariam.model — preferred over scraping
│   └── ikariam/
│       ├── selectors.ts        EVERY game CSS selector, in one place
│       └── globals.ts          typed access to window.ikariam, transportConfig
│
├── send-resources/
│   ├── main.ts                 userscript entry (waits for DOM, calls start)
│   ├── app.ts                  start(): builds UI, registers handlers, restores state
│   ├── state.ts                state + localStorage keys (unchanged from the original)
│   ├── game-state.ts           ships / action points / wine — model first, DOM fallback
│   ├── town-cache.ts           per-town wine snapshots, projected forward
│   ├── navigation.ts           switch towns, open the port, pick a destination
│   ├── ship-capacity.ts        cargo capacity + Calibrate Cargo
│   ├── features/
│   │   ├── send-resources.ts   shipment handler (also used for wine)
│   │   ├── auto-wine.ts        board -> cache -> manual, then queue a run
│   │   ├── wine-distribution.ts THE ALGORITHM (pure, no DOM)  + unit tests
│   │   ├── auto-build.ts       building upgrade queue
│   │   ├── summary-account.ts  multi-account summary table
│   │   └── barbarian.ts        ships needed for barbarian loot
│   └── ui/
│       ├── actions.ts          event dispatch (replaces inline onclick)
│       ├── dialogs.ts          the three settings popups
│       ├── panel.ts            corner control panel
│       └── styles.ts           CSS
│
├── extension/                  CHROME EXTENSION packaging only
│   ├── content.ts              isolated world — injects the page bundles
│   ├── gm-shim.ts              GM_* + unsafeWindow stand-ins (imported FIRST)
│   ├── view-guard.ts           runtime @exclude that Chrome cannot express
│   └── page-*.ts               page-world entries
│
└── empire-overview/            MECHANICAL PORT of the 10.7k-line original
    ├── main.ts                 the original's trailing "Main Init" block
    ├── jquery.ts               the @require'd jQuery + the isChrome flag
    ├── globals.d.ts            GM_* declarations, jQuery plugin types
    ├── constants.ts (2.5k)     game data tables + translations
    ├── render.ts (3.8k)        the entire Empire Overview board UI
    ├── game-api.ts (1.5k)      parsers for the game's ajax payloads
    ├── database.ts, empire.ts, utils.ts, events.ts, helpers.ts
    └── models/                 City, Building, Military, Movement, Resource, ...
```

Import aliases: `@core/*`, `@send/*`, `@empire/*`.

> **Naming:** this used to be called "Quan ly Ika Perseus". Perseus is just one
> game world, which made a poor name for a script that runs on all of them — and
> the script already called itself "Empire Overview" internally
> (`empire.scriptName`). Renamed accordingly.
>
> Tampermonkey identifies scripts by `@name` + `@namespace`, so **the rename
> installs as a new script**. Delete the old entries after installing, or both
> copies will run and fight over the same DOM. Stored data is unaffected — the
> localStorage keys are unchanged.

---

## The two scripts run in different contexts

This is the easiest thing to get wrong when editing the build config.

**Send Resources — `@grant none`, page context.**
The old JS ran sandboxed and injected `main()` as a _string_
(`script.appendChild(document.createTextNode("(" + main + ")();"))`) to reach
`ikariam.createPopup`, `transportConfig` and to make inline `onclick="..."`
attributes resolve. A bundler cannot support that — serialising a function loses
its closure. `@grant none` achieves the same result without the hack.

Consequence: do **not** `@require` jQuery here. The page already ships its own;
a second copy in page context would clobber it.

**Empire Overview — sandboxed, original `@require` + `@grant` kept.**
Required because it uses `GM_addStyle` (21 sites), `GM_openInTab`,
`GM_xmlhttpRequest`, reaches `unsafeWindow.ikariam.templateView`, and needs
jQuery UI (`.tabs()`, `.draggable()`, `.button()`) which the page's jQuery lacks.

`src/empire-overview/jquery.ts` deliberately references the bare `jQuery`
identifier rather than `window.jQuery`: the sandbox proxy can hand back the game
page's jQuery, which has no jQuery UI.

---

## The unified task queue (`core/task-queue.ts`)

Implements the fix proposed in `So_sanh_2_script_Ikariam.md`.

The old script ran two independent loops against the same DOM:
`checkAndProcess` (1s, shipping) and `autoCheckFinishedAccount` (10s, building).
They collided — with the upgrade popup open a shipment would click the wrong
thing, fail, and still decrement the queue, silently losing the order. The old
patch was an `isAutoSendResourceRunning` flag, but it only guarded one direction:
shipping blocked auto build, auto build never blocked shipping.

Replaced with: **one queue, one runner, exactly one task touching the DOM.**

```ts
const runner = new TaskRunner(queue, { intervalMs: 1000, isUiReady, onDrain })
  .register("sendResource", handleSendResource)
  .register("upgradeBuilding", handleUpgradeBuilding);
```

Handlers return one of four outcomes, which is what actually fixes the lost-order
bug:

| Outcome    | Meaning                                          | Effect on the queue         |
| ---------- | ------------------------------------------------ | --------------------------- |
| `done`     | finished                                         | removed                     |
| `progress` | partially shipped                                | remainder written back      |
| `retry`    | preconditions unmet (no ships, already building) | **kept**, retried next tick |
| `failed`   | unrecoverable                                    | removed + logged            |

The queue persists to localStorage so it survives the periodic reloads the script
does to keep the session alive. The `busy` flag deliberately does **not** persist
— a reload must reset it, or one mid-task crash would wedge the queue forever.

Removal and replacement are keyed by task id rather than position, because the
user can delete queue entries from the settings dialog while a task is running.

Legacy queues are migrated automatically on first run (`migrateLegacyQueues`).

---

## Auto Wine: new algorithm

Based on `sample/wine-distribution.js` and `sample/wine-distribution-2.js`.

**Before:** a flat split — each town received `winePerHour × multiple`, i.e.
"enough for N hours", **ignoring existing stock**. A town holding 30k wine got
exactly as much as one about to run dry.

**Now:** water filling — equalise how long each town can hold out.

```
t     = (Σ stock + supply) / Σ consume
add_i = t × consume_i − stock_i
```

Stock and consumption are read straight from the Empire Overview board
(`td.resource.wine span.current` and `span.consumption`).

**What the sample drafts got wrong:** if a town _already_ holds out longer than
`t`, its `add_i` is negative — but wine can only be shipped out, never pulled
back. `wine-distribution-2.js` clamps with `Math.max(0, …)`, so the total demanded
exceeds the supply: with its own example (7 towns, supply 31,000) it asks for
**37,271**. This implementation drops over-supplied towns from the set and
recomputes `t` until none remain, giving `used = 31,000` exactly. Covered by
`wine-distribution.test.ts`.

The Auto Wine popup has a **Preview plan** button to check the split before
queueing anything.

> **Dependency:** the `#ResTab` board is rendered by the **Empire Overview**
> script, not by the game. Without it, Auto Wine falls back to the manually
> entered Wine/h values.

---

## Bugs in the original, fixed during the port

Moving to TypeScript and ESM strict mode surfaced a number of genuine defects:

| Where                              | Problem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Fix                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Utils.cacheFunction`              | Read `$.now` (the **function**) instead of `$.now()`. Comparing a function to a number is always false, so **no cache ever expired** — army totals, research data, corruption and training totals went stale permanently. Affects 5 call sites.                                                                                                                                                                                                                                              | Call the function                                                                                  |
| old `auto-wine`                    | The "hours to send" loop read `cargoSpace`, a variable **declared nowhere in the file**, and nothing between the inline `onclick` and that line catches. `checkAndProcessAutoWine` therefore threw before reaching its `gotoTown(fromTown, ...)` call: Auto Wine never shipped anything at all. With NO receiver configured the loop body never runs, so no throw — and `totalShips` stays 0, `availableShips >= 0` always holds, and `while (canIncrease)` spins forever, freezing the tab. | Replaced by the new algorithm; the empty-receiver case now explains itself instead of hanging      |
| `Utils.FormatFullTimeToDateString` | Called `Date.prototype.toLocaleFormat`, a Firefox-only API removed from every engine — it threw on non-Chrome browsers.                                                                                                                                                                                                                                                                                                                                                                      | Use the portable branch for all                                                                    |
| `City.getWonder`                   | `i = 7` with `i` undeclared, creating an implicit global. ESM is always strict, so this would throw.                                                                                                                                                                                                                                                                                                                                                                                         | `return 7`                                                                                         |
| `Building.getCompletionDate`       | Empty `get` accessor body, always returned undefined.                                                                                                                                                                                                                                                                                                                                                                                                                                        | Made explicit                                                                                      |
| `render.ts` tooltip                | `if ($(this).css(...));` — a stray semicolon made the `if` body empty.                                                                                                                                                                                                                                                                                                                                                                                                                       | Dropped the `if`                                                                                   |
| `render.ts` growth                 | `Math.floor(<boolean comparison>)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Use the comparison directly                                                                        |
| `render.ts` percentages            | `2 === 0` passed as the `precision` argument, i.e. a constant `false`.                                                                                                                                                                                                                                                                                                                                                                                                                       | Pass `0`                                                                                           |
| `render.ts` island check           | `/regex/.test(window.document.location)` tested a `Location` object, not a string.                                                                                                                                                                                                                                                                                                                                                                                                           | `.href`                                                                                            |
| `game-api.ts` troop form           | `input.value !== 0` compared a string to a number — never equal, so the guard always passed, including for empty fields.                                                                                                                                                                                                                                                                                                                                                                     | Compare against `""`                                                                               |
| `main.ts` ajax hook                | `JSON.parse(match[1] \|\| [])` — `[]` stringifies to `""`, which makes `JSON.parse` throw.                                                                                                                                                                                                                                                                                                                                                                                                   | `"[]"`                                                                                             |
| `empire.HardReset`                 | Assigned `database = {}`; under ESM that is an import binding.                                                                                                                                                                                                                                                                                                                                                                                                                               | Clear the object's keys — which is also more correct, since the original only rebound its own view |
| `styles`                           | `styleAutoBuild` and `styleExtra` were declared but **never appended to `<head>`**, so the auto-build popup rendered unstyled.                                                                                                                                                                                                                                                                                                                                                               | Merged into one sheet                                                                              |
| `dialogs`                          | `querySelector("[id='" + townName + "']")` used the town name as an element id — any space broke the selector.                                                                                                                                                                                                                                                                                                                                                                               | Match on a `data-` attribute                                                                       |
| `logger`                           | Unbounded localStorage growth.                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Capped at 100k characters                                                                          |
| `game-api.parsePremium`            | `coords.match(/(\d+)/)` had **no `g` flag**. A single-group match returns `[wholeMatch, group1]`, and with one group both entries are the _same_ number — `"[12:34]"` gave `["12","12"]`, so every city's **Y coordinate silently became a copy of its X**.                                                                                                                                                                                                                                  | Added `g`, parse to numbers, guard the null                                                        |
| `game-api.parseMuseum`             | `.match(...)` returns null when the museum panel has not rendered; the code went straight to `.length`.                                                                                                                                                                                                                                                                                                                                                                                      | Guarded                                                                                            |
| `empire.CheckForUpdates`           | `/@version/.exec(rt)[1]` indexed a possibly-null result. The surrounding `try/catch` does **not** help — it wraps the `GM_xmlhttpRequest` call, not the async `onload`.                                                                                                                                                                                                                                                                                                                      | Guarded, with a toast on failure                                                                   |
| `render.ts` sortable               | `container: "tbody"` is not a jQuery UI option (the real one is `containment`), so it was always ignored.                                                                                                                                                                                                                                                                                                                                                                                    | Left as-is, flagged inline                                                                         |
| `render.ts` tabs                   | `selected: -1` was removed in jQuery UI 1.9 (superseded by `active`), so it has been inert since the 1.9.2 upgrade.                                                                                                                                                                                                                                                                                                                                                                          | Left as-is, flagged inline — switching to `active: false` would change which tab opens             |

### The bug that took four rounds to find

`FetchAllTowns` ended with a block the original called "remove deleted
cities": any own town **absent** from `ikariam.model.relatedCityData` was
deleted from the database. But that object describes the view you are
currently on, not the empire. So every town except the one on screen looked
like a ghost, was deleted, and was recreated empty by the loop above it —
taking everything the board had recorded with it.

The symptom was a scan reporting `9/9 towns visited` while the Buildings tab
stayed blank, with nothing thrown and nothing logged. Three rounds of
plausible explanations — navigation, the ajax hook, the recording guard —
were all wrong, because every one of them is invisible from outside the
page. `src/empire-overview/ajax-trace.ts` was written to settle it: a bounded
trace, in localStorage so it survives Ikariam's full page loads, recording
what arrived and what the recorder did with it.

It ruled the candidates out in one round. Every town showed
`positionCount: 25`, `viewIsCity: true`, and a matching city id — the data
arrived and was accepted. What gave the answer was `knownTime`: assigned once
in the `City` constructor and preserved through save/load, it had jumped
forward by 45 minutes between two exports. Only a fresh `new City()` can do
that, and `addCity` is only reached when the entry is missing. The town had
been deleted.

Absence now means nothing. A town is removed only when the game states its
relationship is no longer `ownCity`.

That was only half of it. With the towns no longer being deleted, the trace
showed the data arriving and being accepted — and the store still empty. The
database subscribes to the events that should trigger a save in
`database.startMonitoringChanges`, and **nothing ever calls it**: its only
apparent call site, `this.startMonitoringChanges()` in `render.Init`, sits
inside a function bound to `render`, so it reaches render's own method of the
same name. The one remaining route to storage was the `beforeunload` handler,
which wrapped `Save()` in a `setTimeout` — and `Save()` deferred its three
writes through another one. A timeout scheduled while the page is unloading
does not run. So the board recorded everything in memory and wrote down
almost none of it.

`Save()` is synchronous now, with a debounced `SaveSoon()` for the event path
(one ajax response can publish four of those events, and each save serialises
tens of kilobytes), and `Init` actually subscribes.

**Confirmed on the live game.** A scan now leaves all nine towns in the store
with 20-24 buildings each, real island ids, and wine figures that match the
Resource tab cell for cell — and they survive the reload.

A second defect fed it: `main.ts`'s retry passed `init.bind(null, mod, loc,
dat, aj)` against the signature `init(model, data, local, ajax)` — `local`
and `data` swapped. Each retry misjudged what it had already announced and
re-published `CITYDATA_AVAILABLE`, which re-runs `FetchAllTowns`. Harmless
while that function only added towns; destructive once it also removed them.

---

### Bugs introduced by this refactor, caught by later review

Not everything above came from the originals. These were mine, and each has a
regression test named after it:

| Where                               | Problem                                                                                                                                                                                                                                                                                                                                                                                                          | Fix                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `auto-wine.getSourceSupply`         | The guard read `townNameOf(x) === getTownNameFromList(x).trim()` — but `townNameOf` **is** that expression, so it compared a value against itself and always passed. Auto Wine then planned every run against whichever town happened to be on screen.                                                                                                                                                           | Compare against `getCurrentTownName()`                                                                     |
| `auto-build.handleUpgradeBuilding`  | Returned `retry` when a town was already building, pinning it at the head of the queue and stalling every other town's upgrade — possibly for hours. The original explicitly moved on.                                                                                                                                                                                                                           | Added the `defer` outcome                                                                                  |
| `town-cache.recordCurrentTown`      | Read the town **name** from the DOM breadcrumb while reading its **figures** from `ikariam.model`. Those update in separate steps of a view swap, so a read landing in between files one town's wine under another.                                                                                                                                                                                              | Take both from the model                                                                                   |
| `send-resources.handleSendResource` | Read ship counts _before_ navigating, then computed cargo capacity from them several seconds later.                                                                                                                                                                                                                                                                                                              | Re-read at the port form, as the original did                                                              |
| `core/dom.setInputValue`            | Called `.blur()` _and_ dispatched a `blur` event, running the game's handler twice per edit.                                                                                                                                                                                                                                                                                                                     | `.blur()` only                                                                                             |
| `empire-overview/main.ts`           | Splitting the original single file left `jquery-ext.ts`, `helpers.ts` and `resource-production.ts` imported by nobody, so Vite never bundled them — about 83 kB of the original's code. `render.LoadCSS` did not exist and `empire.Init()` threw: no board, no menu, nothing logged.                                                                                                                             | Import all three from `main.ts`                                                                            |
| `models/city.ts`                    | `this.maxSci = 0` in the `City` constructor writes to a getter-only prototype accessor. Sloppy mode dropped it silently; the bundle is strict-mode ESM, where it throws — aborting `FetchAllTowns`, so the board had no towns in it.                                                                                                                                                                             | Remove the dead assignment                                                                                 |
| `constants.ts` `LanguageData`       | Only `en` was ever translated. Lifting the `-en`-only `@include` (and the settings panel's language dropdown) made `LanguageData[lang]` `undefined`, which every one of ~40 call sites dereferences.                                                                                                                                                                                                             | Proxy that falls back to `en`                                                                              |
| `empire.ts` `accountName`           | Indexed straight into `querySelector(".avatarName > a.noViewParameters")`. A missing avatar block threw while the module graph was still evaluating — before the diagnostics were installed, so nothing was recorded.                                                                                                                                                                                            | Fall back to the element text, then `""`                                                                   |
| `models/building.ts`                | `startUpgradeTimer`'s status poll called its IIFE bare, so strict mode bound the 3-second callback to `undefined`: `Cannot read properties of undefined (reading 'isUpgradable')`, once per building per town, forever. The returned canceller was also dropped, so the intervals stacked.                                                                                                                       | `.call(this, ...)`, and store the canceller                                                                |
| `auto-wine.readWineBoard`           | Recorded a row for every town on the board, including ones Empire Overview has never loaded — those render `"0.00"` with empty production/consumption spans. A zero-stock entry then shadowed the town cache, which may hold a real earlier reading.                                                                                                                                                             | Skip rows with an empty consumption cell                                                                   |
| `game-state.getFreeShips`           | Read `ikariam.model` before the rendered header, as the rest of that module does. But the model is view-scoped: from a city view it reports `freeTransporters: 0` while the header correctly shows 227 idle — and `0` is finite, so it won through the `??` and the DOM fallback never ran. Auto Wine refused to start with "Not enough ships!". `getActionPoints` had the same shape, and gates every shipment. | Header first for the three global-menu counters; model as the fallback                                     |
| `send-resources.handleSendResource` | Looked for the port through `#position1`, which exists only on the town view — but the previous shipment leaves the page on the port's town list, and `gotoTown` returns early when that town is already selected, so nothing navigated back. The queue ran exactly one shipment and then deferred every tick, until a town was opened by hand.                                                                  | Return to the town view first when the building slots are not there                                        |
| `send-resources.handleSendResource` | Waited on `.cities.clearfix` AFTER the submit, and a timeout there throws. The runner deliberately keeps a thrown task queued — so the cargo, already gone, would be shipped again.                                                                                                                                                                                                                              | Nothing after the submit may throw; the wait is a courtesy, not a condition                                |
| `auto-build.scanBuildings`          | `gotoTown` throws on timeout and the button invoked the scan as `void scanBuildings()`, so one unreachable town aborted the walk into an unhandled promise — no towns visited past it, nothing logged, and a button that looked inert. It also left each town the instant the breadcrumb flipped, outrunning the data it was there to collect.                                                                   | Per-town try/catch, a settle delay, a summary, and a guard against running while the task runner navigates |
| `game-api` ajaxResponse subscriber  | Indexed straight into `response[len][1]`. A live response arrived with nothing there, and because jQuery.Callbacks does not isolate subscribers the throw took down the whole response: every remaining entry, `parseViewData`, and the `cityChanged` event. The town that response described was never recorded — so a scan could report "9/9 towns visited" while three towns stayed blank.                    | Skip malformed entries, wrap each one in try/catch, and report rather than abort                           |

### The startup smoke test

The first four rows above were all found the same way, and none of them could
have been found by a unit test: each one breaks the _boot sequence_, and every
other test here calls a single function directly.

`src/empire-overview/startup.test.ts` evaluates `main.ts` against a synthetic
Ikariam page — a real jQuery, jQuery UI stubbed to four no-ops, the
Tampermonkey grants, and enough of `ikariam.model` for one town — and then
asserts the things a user would look at: the side-panel button exists, the
board was drawn, `#ResTab` has rows, and the bug reporter recorded nothing.

Two details in it are load-bearing rather than cosmetic:

- **`document.readyState` is pinned to `"loading"` during evaluation.** In the
  browser the bundle is one synchronous script, so every `$(fn)` handler is
  registered before any of them runs — which is what lets
  `resource-production.ts` assume `database.Init()` already happened. Vitest's
  module runner awaits each import, so without the pin the ready timer fires
  part-way through the graph and the order silently differs from production.
- **jQuery is re-required per test.** It caches its DOM-ready deferred in a
  closure, so a module-cached copy arrives already resolved.

The file also pins the URL via `@vitest-environment-options`:
`ikariam.Language()` slices the language out of the host, so a default
`localhost` URL would exercise a language that does not exist instead of the
boot path.

### Unimplemented feature (not a regression)

`render.ts` had `case "incoming": return getIncomeMovementTip(...)` for the
**army** tooltip, but that function is defined nowhere in the 10,767 lines — so
hovering an incoming-army cell threw a ReferenceError. (It is _not_ the same as
`getIncomingTip()`, the resource tooltip, which does exist.)

It now returns `""`, matching how the author handled the other unimplemented
tooltip in the same switch (`case "unit"`) and the commented-out `case "plunder"`.
Writing a real implementation would mean inventing both the markup and the data
source.

---

---

---

## What the IkaEasy extension taught us

`sample/IkaEasy-V3-Chrome-Web-Store/` is a mature Ikariam extension. Reading it
changed three things here.

### 1. Read `ikariam.model`, do not scrape

IkaEasy never touches rendered HTML for data. Its page-world bridge
(`inner/ikaeasy.js`) reads the game's own state object, which already holds
everything these scripts were scraping out of the DOM:

| Was scraped from                      | Now read from                 |
| ------------------------------------- | ----------------------------- |
| `#js_GlobalMenu_freeTransporters`     | `model.freeTransporters`      |
| `#js_GlobalMenu_maxActionPoints`      | `model.maxActionPoints`       |
| `#js_GlobalMenu_wine`                 | `model.currentResources.wine` |
| the Empire Overview board's wine cell | `model.wineSpendings`         |

`src/core/ikariam/model.ts` wraps it, and `game-state.ts` prefers the model with
the old DOM path as fallback (the model does not always carry freighters).

Beyond robustness this fixes a precision bug: the menu bar renders `"12.3k"`
above ~10,000, so the scraped figure could be off by up to 50 — which matters
when Auto Wine computes a reserve down to the unit.

### 2. Setting `.value` is not enough

Every IkaEasy field write is followed by `.focus().blur()`. Ikariam recalculates
the ship count, the mission summary and its own clamping from the field's
events, so a bare `input.value = x` — which is what both original scripts did —
leaves the form showing, and possibly submitting, a stale number.
`setInputValue` in `core/dom.ts` now dispatches `input`, `change` and `blur`.

### 3. Independent confirmation of the cargo maths

`js/const.js` states it outright:

```js
export const CargoSpaceDefault = 500;
export const CargoLevel = 6;
export const CargoSpace = CargoSpaceDefault + 20 * CargoLevel; // 620
```

That matches both the live shipyard capture and this project's constants
exactly, so `BASE_MERCHANT_CAPACITY = 500` and `MERCHANT_CAPACITY_PER_LEVEL = 20`
are confirmed from two independent sources.

### New feature: the town cache

`src/send-resources/town-cache.ts` records each town's wine stock and
consumption from `ikariam.model` whenever that town is on screen, and projects
the figure forward using the known drain when it is read back later.

This removes Auto Wine's hidden dependency on a second userscript. Previously
the only source of per-town figures was `#ResTab` — a table the game does not
render, drawn by Empire Overview — so Auto Wine silently required that script to
be installed _and_ its board to be open. The resolution order is now: board
(live, all towns) -> cache (no dependencies) -> hand-entered Wine/h.

### Deliberately not adopted

- **`ajax.Responder.parseResponse` hooking.** IkaEasy wraps the game's ajax
  responder to observe every server reply. Powerful, but it is a monkey-patch on
  an internal the game can rename at any time, and nothing here needs a live
  event stream.
- **Its own IndexedDB layer.** Overkill for two features whose state fits in a
  few localStorage keys.

---

## Packaging: userscript and Chrome extension

The same source builds both.

```bash
npm run build:send        # dist/Ikariam Send Resources.user.js
npm run build:empire      # dist/Ikariam Empire Overview -VN-.user.js
npm run build:extension   # dist/extension/
npm run build             # all three
```

**Userscript** — drag the `.user.js` into Tampermonkey.

**Extension** — `chrome://extensions` -> Developer mode -> _Load unpacked_ ->
pick `dist/extension/`.

### Why the extension needs an extra hop

An MV3 content script shares the page's DOM but **not** its JavaScript globals.
`window.ikariam`, `window.transportConfig` and the page's jQuery are all
invisible from it — precisely what both features are built on.

So `content.js` does nothing but inject the real bundles as web-accessible
`<script>` tags, which the browser then runs in the page's own world. This is
the same approach IkaEasy uses. `src/extension/gm-shim.ts` supplies
browser-native stand-ins for `GM_addStyle`, `GM_openInTab`, `GM_xmlhttpRequest`,
`GM_registerMenuCommand` and `unsafeWindow`, and is imported _before_ the
feature entry — ES modules evaluate imports in source order, which is what
guarantees the globals exist in time.

|                         | Userscript                  | Extension                          |
| ----------------------- | --------------------------- | ---------------------------------- |
| Send Resources context  | `@grant none`, page world   | injected, page world               |
| Empire Overview context | sandbox + `unsafeWindow`    | injected, page world + shims       |
| jQuery                  | `@require` 2.2.4 / UI 1.9.2 | the page's own (3.6.3 / UI 1.13.3) |
| `GM_*`                  | native                      | shimmed                            |

### The jQuery the page provides is a moving target

Empire Overview was written against jQuery 2. The userscript `@require`s 2.2.4,
so it is fixed. The extension cannot `@require` anything and uses the copy the
game loads — and that copy **changes without warning**: one capture found
jQuery 3.6.3 with UI 1.13.3, another weeks later found **4.0.0 with UI 1.14.2**.

jQuery 4 removed a batch of long-deprecated statics, and this codebase calls one
of them **45 times**: `$.now()`. It runs in the `City` constructor, so on jQuery 4
the extension build would have thrown before the board ever rendered.

`src/empire-overview/jquery-compat.ts` restores the removed helpers, and only
those that are actually missing, so an older jQuery is untouched. If the renderer
ever fails _only_ in the extension, a newly removed jQuery API is the first thing
to suspect — add it there.

One subtlety worth keeping: the `isNumeric` shim uses jQuery's own formula
(`!isNaN(v - parseFloat(v))`) rather than the obvious `!isNaN(Number(v))`. They
disagree on `""`, because `Number("")` is `0` — and `render.ts` uses that guard to
keep non-index keys out of a `for...in`.

### Edge and the Chromium flag

The userscript build targets Edge, and Empire Overview branches on what the
original called `isChrome` — including which **keycode table** the renderer uses,
which is the one that would actually misbehave if the flag were wrong.

Edge is Chromium and deliberately reports `navigator.vendor === "Google Inc."`
for compatibility, so the original's `/Google/.test(vendor)` already returns
`true` there, and `true` is the correct answer at every call site. The flag is
now named `isChromium` (with `isChrome` kept as an alias for the ported code)
and detected from `userAgentData.brands` first, falling back to `vendor` and then
the user-agent string — `navigator.vendor` is deprecated and may be emptied.

`tools/collect-dom-report.js` captures the raw `vendor`, `userAgent` and `brands`
so this can be confirmed on the actual machine rather than assumed.

---

---

## Moving data between browsers

The userscripts run on Edge and the extension on Chrome. `localStorage` is scoped
per origin **per browser profile**, so the two installations share nothing: there
is no cross-vendor sync API, and nothing a page-context script could reach even if
there were. A JSON file is the only channel that does not need a server.

**Export Data** / **Import Data** on the panel. Export downloads a timestamped
file (and copies it to the clipboard); import takes that file back.

### What travels, and what does not

`src/core/data-transfer.ts` classifies every key this project writes:

| Group          | Contents                                                                               | Exported by default |
| -------------- | -------------------------------------------------------------------------------------- | ------------------- |
| `config`       | wine senders/receivers, build queue, cargo calibration, Empire Overview board settings | **yes**             |
| `measurements` | town cache, multi-account summary                                                      | **yes**             |
| `runtime`      | the task queue, "is automation running" flags                                          | **no**              |
| `diagnostics`  | log, bug reports, crawler captures                                                     | no                  |

Keys belonging to the game itself are never touched.

> ⚠ **Runtime state is excluded deliberately.** Copying a half-finished queue into
> a second browser gives two installations the same orders against **one** game
> account. The unified task queue guarantees that exactly one action touches the
> game at a time — and that guarantee cannot span browsers, because there is no
> lock to take. Two runners would double-send resources and fight over the same
> DOM: precisely the class of bug this project exists to have removed.
>
> It can still be exported explicitly (`exportData({ groups: ["runtime"] })`) if
> you are migrating rather than duplicating, i.e. the source browser will not run
> again.

### Account handling

Most keys are stored as `<accountName><suffix>`, and Empire Overview uses
`***<accountName>***<key>`. Both browsers normally play the same account so the
prefixes already line up; if they do not, the import offers to rewrite them onto
the account you are logged in as. Without that, imported keys would sit in
storage that nothing ever reads.

The bundle carries a format tag and a version, so a file from somewhere else — or
from a future build — is rejected with an explanation rather than half-applied.

## Runtime bug tracking

These scripts run unattended, inside someone else's page, against markup that
changes without notice. When something breaks the user sees "nothing happened" —
the console has scrolled away and the failure was probably three page loads ago.

`src/core/bug-report.ts` records failures as they occur, deduplicated and
persisted, so one button produces something diagnosable.

### What gets recorded

| Kind                               | Source                                                             |
| ---------------------------------- | ------------------------------------------------------------------ |
| `task-error`                       | a task handler threw                                               |
| `task-failed`                      | a task ended `failed` and was dropped — silent data loss otherwise |
| `selector-miss`                    | a selector that had to match did not                               |
| `uncaught` / `unhandled-rejection` | `window.onerror` and `unhandledrejection`                          |
| `manual`                           | reported explicitly by feature code                                |

`uncaught` fires for the whole page, so much of it belongs to Ikariam rather than
to us. It is kept anyway — a game error during one of our actions is often the
actual explanation — and the `kind` keeps it separable.

**Both scripts report.** Empire Overview has its own provider
(`src/empire-overview/diagnostics.ts`) adding board health, the jQuery/jQuery UI
versions actually in play, and whether the game model and localisation strings
are readable. That matters more there than anywhere else: it is the largest,
least-reviewed, most page-dependent code in the project, and until now a throw
inside the renderer left a blank board and no trace of why.

Records from both land in one storage key, so a single export covers everything.
Each record is stamped with the build that produced it — which is a **build-time
constant**, not something an entry announces. ES module imports are hoisted, so a
statement placed above `import "./main"` still runs _after_ it; an earlier
version did exactly that and every bug report from the extension build came out
labelled as a userscript. `src/extension/entry-order.test.ts` guards against the
regression.

Each record carries the message, a truncated stack, first/last timestamps, an
occurrence count, and up to three context snapshots from
`src/send-resources/diagnostics.ts`: the current town (from both the DOM and the
model, so a mismatch is visible), whether the model is readable, the queue head,
and a health check of the selectors whose absence explains a whole class of
"it did nothing".

### Getting a report out

- **Bug Report** button on the panel — copies the JSON to the clipboard.
- Console: `ikaBugs()` for a summary, `ikaBugReport()` to copy, `ikaClearBugs()`.

### Design constraints

The reporter is watching code that is already misbehaving, so it is written not
to make things worse:

- **Never throws.** Every entry point is wrapped; a failed write is dropped
  rather than propagated.
- **Never recurses.** A re-entrancy guard stops an error raised _inside_ the
  reporter from re-entering it, and a context provider that itself reports a bug
  is refused. There is a regression test for exactly that.
- **No dependency on app state.** Errors happen before `initState`, so it talks
  to `localStorage` directly rather than through `Store`.
- **Bounded.** 50 distinct records, repeats increment a counter, stacks truncated
  — localStorage is shared with the queue and the log.

Deduplication keys on kind + message + the _first stack frame_. That keeps the
same fault from the same place aggregating, while genuinely different call sites
stay apart.

Which build a report came from cannot be detected at runtime — an extension's
page-world script has no access to `chrome.runtime` and looks identical to a
userscript — so each entry declares it via `setBuildInfo`.

## Verifying against a live page

`tools/collect-dom-report.js` is a read-only snippet to paste into the DevTools
console on a game page. It probes every selector the scripts use, dumps the
surrounding markup and copies a JSON report to the clipboard. Captures land in
`tools/output/`, which is deliberately **untracked**: a capture carries the
account name, every town and its coordinates, and an `actionRequest` session
token lifted straight out of the page markup.

Run it on each screen — different selectors only exist on different ones:
town view; town view with the Empire Overview board open on the Resource tab;
the Trading Port shipment form; the Shipyard.

### What the first capture already changed

| Finding                                                                    | Consequence                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The account plays on **s70-en**, world _Nereus_                            | The original's four hard-coded `@include` servers meant it **would not load at all** here. Confirms the switch to `*://*.ikariam.gameforge.*/*`.                                                                                                                             |
| Town names are `W-Athens`, `M-Corinth`, `C-Thebes` — a **letter** prefix   | The original sorted on `Number(prefix)`, which is `NaN` for every one of them, and `NaN` compares false both ways — so its comparator returned 0 for every pair and the sort silently did nothing. Now: numeric prefixes sort numerically, anything else alphabetically.     |
| Anchor markup is `<a title="W-Athens"> W-Athens</a>` — a **leading space** | `getTownNameFromList` trimmed it, `getTownList` did not, so the same town had two spellings depending on which function you asked. Names are now read from `title` and trimmed in one place.                                                                                 |
| `#BuildTab .city_name > span.clickable` matched **zero** elements          | That selector belongs to the Empire Overview board, not the game — and `gotoTown` was its only way to change town. Installed on its own, Send Resources could never navigate and every task would die on the 15s timeout. It now falls back to the game's own town dropdown. |
| `jQuery 3.6.3` and `jQuery UI 1.13.3` are already on the page              | The board still `@require`s 2.2.4 / 1.9.2 into the sandbox, as the original did. Also confirms `selected: -1` in `.tabs()` has been dead for years.                                                                                                                          |
| `js_CityPositionNLink` ids are all valid CSS identifiers                   | `#${id}` would not actually have thrown; the switch to `getElementById` is belt-and-braces.                                                                                                                                                                                  |
| No whitespace text nodes between the town `<li>`s                          | Indexing towns by `childNodes` position is safe. Regression-tested, since a single stray newline would shift every index.                                                                                                                                                    |

### What the port-form capture settled

A capture from the Trading Port (world _Pangaia 3_, s303-en) answered the two
riskiest open questions.

**The destination list does omit the current town.** Standing in `W-Athens`
(dropdown index 0) with nine towns, the port listed **eight**, in dropdown order
and without `W-Athens`. So `adjustDestinationIndex` is right, and shipments go
where they are addressed.

**`transportConfig` confirms the cargo maths a third time:**

```json
"maxCapacityPerTransport": 620,
"freighterCapacity": 53000
```

Those are exactly the numbers this project derives from the shipyard text, and
exactly what IkaEasy's `500 + 20 × level` produces. The freighter base of 50,000
was the one constant with no second source; it now has one.

The capture also showed `.cities.clearfix > li > a` is present on the **port**
view but gone on the **transport** view, which is worth remembering when reading
`handleSendResource`: it waits on that selector after submitting, on the
assumption the game returns to the port list.

### What the Resource-tab capture settled

A capture taken with the board open (s303-en, nine towns) confirmed the wine
cells exactly as `selectors.ts` describes them: two adjacent `td.resource.wine`
per row, `span.current` holding the stock (`28,542`) in the first and
`span.prodconssubsum.consumption.Red` holding the negative hourly consumption
(`-559`) in the second. `#ResTab > table > tbody > tr` matched nine rows with
ids like `resource_297034`, and `td.city_name > .clickable` gave the names.

It also showed something the fixtures did not: **eight of the nine rows were
empty**. Empire Overview only fills a town in once it has seen that town's
city view, and until then renders the stock as a placeholder `"0.00"` with the
production and consumption spans blank. `readWineBoard` was recording those as
real zero-stock readings, which is worse than having no board at all — see the
table above.

The same capture confirmed `.menu_slots > .expandable` (11 matches),
`li.empire_Menu` (1) and `#empireBoard` (1), i.e. the board's entry point and
the board itself both exist on a live page.

### Still unverified

Nothing below has been seen on a real page yet — these are the highest-risk
remaining assumptions:

- **Shipyard `.upgrade_desc`** — whether the level really appears as `(N)`, which
  is how Calibrate Cargo derives capacity.
- **Clicking a town dropdown `<a>` actually switches town.** The new fallback
  assumes it does. Note the capture shows these anchors carry neither `href`
  nor `onclick` — the handler is delegated — so this is worth checking rather
  than assuming.

## Type strictness

Two configurations, because the two halves of the codebase have different
standards:

| Config                 | Covers                                                | Level                                                                |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| `tsconfig.json`        | everything, incl. the ported `src/empire-overview/**` | `strict` minus `noImplicitAny`, `strictNullChecks`, `noImplicitThis` |
| `tsconfig.strict.json` | `src/core/**`, `src/send-resources/**`                | **full `strict`** + `noUnusedLocals` / `noUnusedParameters`          |

`npm run typecheck` runs both. Both are currently **green**, and there is no
`@ts-nocheck` or `@ts-ignore` anywhere in the repo.

The three relaxed flags exist only for the mechanically ported code:

- `noImplicitAny` — the original annotated no parameters at all (~495 errors)
- `strictNullChecks` — `querySelector` results are used unchecked throughout (~149)
- `noImplicitThis` — `X.prototype = { m: function () { this.y } }` everywhere (~190)

### Why the ported code is not simply forced to full strict

Turning all three flags on for `src/empire-overview/**` produces 786 errors, but
they are not 786 latent bugs:

| Flag               | Errors                          | What "fixing" them would mean                                                  |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------ |
| `noImplicitAny`    | ~314 params, ~88 index accesses | stamping `: any` on every parameter — **zero** added safety, a very large diff |
| `noImplicitThis`   | ~190                            | adding `this: any` to every prototype method — likewise cosmetic               |
| `strictNullChecks` | 149                             | genuinely worth reading, mostly not worth annotating                           |

Only `strictNullChecks` carries real signal, so those 149 sites were audited by
hand rather than silenced:

- **84** are `regex.match(...)[n]` / `.exec(...)[n]`. Each was checked for a
  guard; exactly **one** was unguarded, and it is fixed above.
- **25** are jQuery calls, which never return null.
- **40** are TS failing to narrow through a pattern it cannot follow. Auditing
  these is what turned up the coords and museum bugs listed above.

Mass-annotating the other 637 would leave the code no safer while burying the
inline notes that explain the port. To push further anyway, add files from
`src/empire-overview/` to `tsconfig.strict.json`'s `include` one at a time —
noting that TS checks the whole import graph, so a file drags its dependencies
in with it.

---

## Notes for future edits

- **A game selector changed:** edit `src/core/ikariam/selectors.ts`. Do not
  scatter selector strings through feature code.
- **Server coverage:** `includeServers` in `build/shared.ts` already matches every
  world. `@include` is used rather than `@match` because `@match` cannot wildcard
  the top-level domain, which would drop the non-`.com` portals.
- **localStorage keys:** keep the original keys (`state.ts` documents each one).
  Unifying the key schemes requires a migration first.
- **Buttons in string-built HTML:** use `data-ika-action="name"` and register it
  in `registerActions`. Do **not** use `onclick="fn()"` — after bundling the
  function lives in module scope and `window.fn` does not exist.
- **The original sources** live in `legacy/` for reference; nothing builds
  from them. Delete that directory once the port is confirmed in-game.
- **Initialisation order:** the models assign `X.prototype = {…}` at top level and
  import each other cyclically. The current bundle orders them correctly (every
  prototype is assigned before the first `new`), but verify this again if you add
  a module that participates in the cycle.
