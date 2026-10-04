# Session handover

Written for whoever picks this branch up next — a fresh agent session, or a
human reading it cold. It carries the things that are **expensive to
rediscover**: measured facts about the live game, decisions already made, and
the traps this branch has already fallen into.

It deliberately does **not** repeat the feature status. That lives in
[improvement-plan.md](improvement-plan.md), which is kept current; read it
second. [project-summary.md](../project-summary.md) covers what the TypeScript
port changed and what is still unverified.

Last updated: 04/10/2026, afternoon.

---

## 0. Read this before touching anything

**Automated shipping: fixed on 04/10 (§16, plan §2.O part 4), and the user
tried it on the game the same day: "roughly ok"** (§17). The game had
replaced the trading port's destination list, so `SEL.dockCities`
(`.cities.clearfix > li > a`) matched nothing and every `sendResource` task
waited 15 s and threw. The form is now opened directly with
`?view=transport&destinationCityId=<id>`. The paragraphs below about the
broken port are kept as history.

**Two rounds on 25/09.** The first — two user-reported bugs and part of Auto
Wine — is committed as six commits (pushed since); the write-up is
`improvement-plan.md` §2.C. A third bug, Auto Build losing its queue while a
town is building, is still open and waiting on a log from the user (§6).

The second round is a code-quality review of the whole of `src/` and the
fixes for nearly all of it, committed as `1983f45` (§8). What was left, and why, is
`improvement-plan.md` §2.D — read that before starting another review, so
the same ground is not covered twice.

*Superseded 04/10 by the port fix — kept as history:* **Do not press either
Start Timer until that is fixed.** The runner now gives
up on a task after five consecutive throws, so instead of looping forever the
queue quietly empties — roughly 80 s per task. Queued shipments are recoverable
(Save in Auto Wine Settings queues the run again; since 02/10 Auto Wine's
Start also switches Transport's timer on, so do not use it for this); the
Auto Build config is not touched.

*(Captured 03/10 through Bug Report — §2, "Added 03–04/10".)* The capture
that unblocks it: one paste of the crawler with `#js_transportPanel`
open, a second after clicking `a.action_transport` so the shipment form is on
screen. `portForm.present` is `false` in all five existing captures, so
`#textfield_*`, `#submit` and `#slider_freighters_max` have never been checked
against the live game either.

**26–28/09: an Auto Build round on a second account** (`SClone1`, three
towns) — see §9. Six bugs, all fixed and committed (`453482b`, `24061f0`).
Auto Build now builds on that account. **It needs the Empire Overview board
on the page**: without it, town switches go through `#changeCityForm`, which
reloaded the whole page from the runner and put it in a reload loop (§2, §6).
The user tests with both scripts on. *Superseded 02/10 (§13): every switch
reloads — it is the game's own answer — and the loop was the coordinates;
the form is now the first route and Auto Build no longer needs the board.*

**28–29/09: three more rounds, committed as `1f7c0e7` (docs in `4841fb9`),
pushed** — see §10, and `improvement-plan.md` §2.F–2.H for the full
write-ups:

- **Auto Build runs in laps again, as the original did** (§2.F). One task per
  town, for its first saved upgrade; a busy or short town ends its turn; the
  next lap comes with the keep-alive reload (2 minutes). It was hopping town
  every second and never reaching the last town of the lap.
- **Four unblocked plan items** (§2.G): H (cross-tab lock), D (striped full
  store), the second half of 2.4 (idle ships and action points in the
  footer), and `backToCity` logging who called it.
- **Two dialog changes the user asked for** (§2.H): Auto Build's "Run queue"
  is Save again; Transport Settings takes one amount per resource.
- Plus `needingShip` now uses the calibrated merchant capacity (500 default)
  instead of 520.

None of it has been seen on the live game. `dist/` was rebuilt by the user on
29/09 at 01:33 and contains all of it (§1).

**29/09 evening: four changes the user asked for, committed as `a62e8dd`
(docs in `066eb44`), pushed** — the write-up is `improvement-plan.md` §2.I: the Transport
Settings amounts in two columns, "Warning wine" no longer raised for a town
whose wine is not going down, every `window.alert` of both scripts turned into
a toast that fades by itself (`confirm()` kept), and the board's town tabs
capped at five towns with the rest scrolling.

**Then one bug the user reported, in the same commit** — `improvement-plan.md`
§2.J: with no idle ships, a shipment's `retry` held the head of the queue and
every upgrade behind it waited too. The runner now blocks only the type that
returned `retry` (§5). `dist/` built by the user on 29/09 at 22:30 contains
all five (§1).

**30/09–01/10: plan items U and V — the building tables now come from the
game, committed as `6ed66c6` and `c38dca4` (docs in `b9f1d7a`), not pushed**
— see §11. The wiki was out of date: 3,795 of 3,900 cost cells in
`Constant.BuildingData` differed from the game. The tables were regenerated
from the game's own Help > building details pages, captured with a temporary
**Crawl Building** button (raw files in `docs/wiki/`): costs, time (now a
table of seconds, not the `{a, b, c, d}` formula), the effect tables, and a
logical `maxLevel`. Reduction buildings are capped at 50%. Levels past 50
have no figures yet. `dist/` built by the user on 01/10 at 02:23 contains all
of it; none of it has been tried on the game.

**02/10: two changes the user asked for, committed with §13 as `4f9436c`
(docs in `3209964`), not pushed** — see §12, and
`improvement-plan.md` §2.K: ↑/↓ buttons that move one row at a time in the
queue view, Transport Settings and Auto Build Settings; and Auto Wine's
**Start** doing the whole routine (scan, wait for it, Load, Save, queue,
switch Transport's timer on), with **Save** in Auto Wine Settings now
queueing the run too. Not in `dist/`, not tried on the game.

**02/10, later: five more, in the same commits (`4f9436c`, docs
`3209964`), not pushed** — see §13, and
`improvement-plan.md` §2.L:

- **A shipment waits rather than send a few units.** When the source holds
  less than the task still needs *and* less than one ship's cargo — a
  merchant ship, or a freighter when no merchant is idle — the task defers.
- **Transport Settings takes 0 as "none"**, like an empty field.
- **Each Start Timer runs only its own task type** (`allowsType` on the
  runner). Build's timer no longer ships queued shipments.
- **The display strings left over from §2.D are gathered**, and the building
  list no longer reads the words "Under construction".
- **1.4: a town switch reloads the page, by the game's own design**
  (measured; §2). `gotoTown` now switches through the form first and will not
  send the same switch twice after a reload that did not land.

Not in `dist/`, not tried on the game.

**03/10: three things the user asked for, committed as `7ed3a85` (docs in
`b45f792`), not pushed** — see §14, and
`improvement-plan.md` §2.M:

- **Send Resources has a left-menu entry again, like Empire Overview's —
  WITHOUT the `expandable` class.** The 25/09 entry broke the header
  refresh. Three console experiments on the live page settled why (§2,
  "Added 03/10"): any extra `expandable` entry breaks it, before or after
  Empire Overview's `slot99`; an IkaEasy-shaped entry (`slot<index>`, no
  `expandable`) does not. The corner button is now only the fallback for a
  page without `.menu_slots`. **Never give the entry `expandable`.**
- **The Send Resources window remembers whether it was left open**, and
  opens on the very first load — as the Empire Overview board does.
- **Upgrade times on the board take two more reductions**: the server's
  construction-time buff, typed per account in Send Resources' account
  table (shown as text; ✎ opens a field, ✓ saves), and the town's Chronos'
  Forge (×0.8 per level). Rounded to whole seconds.

In `dist/` (built 03/10 22:54), not tried on the game.

**03/10, later: Bug Report reworked, and what its first file settled —
committed 04/10 as `32fe3ba`** — see §15, and `improvement-plan.md` §2.N:

- **Bug Report always saves a JSON file** (`ikariam-bug-report-<account>-<UTC
  time>.json`) instead of copying to the clipboard — two pasted reports were
  cut at 50,000 characters and lost their end. It carries `gameData`: the
  game's `createPopup` source, and the shipment form if it is on screen.
  Once saved, the recorded bugs are cleared.
- **§2.D's last finding is closed**: `createPopup`'s parameters are named
  from the game's source (`popupType`, `className`), and the dialogs pass
  `null, null` instead of `"???", "class"`.
- **Empire Overview no longer reports `[name, null]`** as a malformed ajax
  entry — it is the game's normal shape after a town switch.
- **Open: an Auto Build town switch to M-Eretria that did not land**, with
  the runner throwing every second instead of dropping the task after five
  (§6). Needs the log, which a bug report does not carry yet.

In `dist/` (built 03/10 22:54, grepped), not tried on the game.

**03–04/10: two more Bug Report files, and two rounds of fixes —
committed 04/10 as `32fe3ba`** — see §16, and `improvement-plan.md` §2.O and §2.P:

- **Why the runner never dropped the failing task: `console.error` is not a
  function on the game's page.** The runner's catch called it, threw, and
  never reached the streak count. Every console call of Send Resources and
  core now goes through `writeToConsole` (`core/logger.ts`).
- **The trading port is fixed in code** (§2.A): the second file caught the
  shipment form, every old form selector still holds, and the destination
  is set by opening `?view=transport&destinationCityId=<id>`.
- **Bug Report carries the last 200 log lines**, and the "did not land"
  message no longer carries the seconds (they defeated deduplication).
- **Seven small items**: resource labels, the redundant Close button,
  `needingShip` rounds up, a month is 30 days in both formatters, the
  queue's ▶ follows the task the runner is on, "Warning wine" once per town,
  Space belongs to Empire Overview alone.
- **Still open: why the switch to M-Eretria did not land** (§6) — needs a
  report with the log, now that it carries one.
- **The installed userscripts are older than `dist/`** (§2): rebuild, then
  reinstall both.

In `dist/` since the 04/10 09:09 build.

**04/10: the user tried it all on the game, then asked for two more
things — §17**, and `improvement-plan.md` §2.Q and §2.R:

- **On the game, with the 09:09 build: "roughly ok"** ("cả 2 tạm ok") for
  both the list of things to try (the port, the runner, the menu entry,
  build times, §16's small items, and every older "try on the game" list
  back to the 26–28/09 round, and U/V) and the M-Eretria switch, which did
  not come back. A general verdict — no file, no log, no per-item report —
  so nothing in it counts as measured (§17).
- **The panel's queue and Transport Settings' shipment table show at most
  ten rows and scroll the rest**, measured per row (`capVisibleRows` in
  `core/dom.ts`).
- **Auto Build Settings has its Close button back** — §16 had removed it;
  the user asked for it again.

§17 is in `dist/` (04/10 09:44, grepped), not tried on the game. **§16 and
§17 were committed later that morning as `32fe3ba` (docs `ec3fdc4`).**

**04/10, midday: S and T, four small items, committed as `b2e9084`; the
user's `barbarian.ts` change as `3f8a51b`** — see §18, and
`improvement-plan.md` §2.S:

- **Auto Wine ships whole ships.** A town's share of one merchant ship or
  more is rounded down to whole ships; a share under one ship goes as it is.
- **Auto Wine counts the wine drunk on the way.** Each real shipment
  records its route's loading and sailing time from the form; Auto Wine then
  splits by what each town will hold when the ships arrive.
- Status line names an upgrade; a town whose only sea slot is a building
  site defers instead of throwing; the two lists' header rows stay in place;
  opening the panel redraws the queue.
- `barbarian.ts`: the Barbarian Village shows ships + 1, as the fleet does —
  the user's own change from 03/10, committed separately at their request.

**04/10, afternoon: the user answered plan questions 2 and 3, and six items
were built, NOT committed** — see §19, and `improvement-plan.md` §2.T:

- **2.6:** a ↻ mark in the Town header of the board's three town tables
  spins while Send Resources refreshes every town.
- **R:** the board's `CheckForUpdates` is gone — it read the ORIGINAL Empire
  Overview's version on greasyfork (script 764) and offered to install that
  over this fork. An update channel of our own waits on the user (a public
  URL).
- **K:** each building on the city view carries its level (`12`, `12→13`).
- **J:** desktop notifications — building finished, movement arrived, wine
  running low, task dropped — each with its own checkbox, all off by
  default. New files `src/core/notifications.ts` and its test (the user
  agreed to create them).
- **E:** a ▲ button in the Build tab's upgradable cells starts the upgrade
  with the game's own upgrade link. Every run keeps the game's two responses
  for Bug Report — the user asked for that, to check it on the game.
- **2.8:** the stock figure in the Resource tab has a summary tooltip.
  Everything else IkaEasy's resource tooltip shows, the board already had.

**04/10, afternoon: building levels past 50, from the user's crawl of
s303, NOT committed** — see §19 and plan §2.U. s303's help pages show times
halved by the server and costs after the account's 14% research; they are
stored converted back (time × 2, cost ÷ 0.86), 704 new levels.

§18 and §19 are in `dist/` (built 04/10 13:11 from the working tree,
grepped). **None of §17–§19 has been tried on the game, and the userscripts
installed in the browser are older than that build.**

**Next:** the user tries §17–§19 on the game — for E, one upgrade that
starts and one the game refuses, then Bug Report, and the file goes to
`tools/output/`. Plan items P and L wait on captures; R's update channel
on the user (plan §6 question 5); V on the user's details. If something
fails on the game, press Bug Report at once and put the file in
`tools/output/` — it holds the log.

**If a page is stuck reloading**, the way out from the console (it keeps
working between loads) is
`localStorage.isAutoBuildStart = "false"; localStorage.isAutoReload = "false";`
— pressing Stop Timer can land mid-reload and not stick.

---

## 1. Where the tree stands

|             |                                                                  |
| ----------- | ---------------------------------------------------------------- |
| Branch      | `refactor`, tracking `origin/refactor`                            |
| Pushed      | `origin/refactor` is at `066eb44` (the plan's §2.I–2.J docs), pushed by the user; §10's `1f7c0e7` and `4841fb9` are before it, so pushed too (checked with `git log origin/refactor..HEAD` on 02/10). **Eleven local commits since, not pushed** (`git rev-list --count origin/refactor..HEAD` = 11 on 04/10): §11 is `6ed66c6` + `c38dca4`, its docs `b9f1d7a`; §12 and §13 are one code commit, `4f9436c` (25 files in `src/`), and one docs commit, `3209964`; §14 is `7ed3a85` (15 files), its docs `b45f792`; §15–§17 are `32fe3ba`, their docs `ec3fdc4`; §18 is `b2e9084` and `3f8a51b` (the user's `barbarian.ts` change) |
| Committed 02/10 | At the user's request, in two commits as before: code and tests, then the two documents. The commit message went through a file (`git commit -F`): PowerShell 5.1 splits a here-string passed to a native command at its double quotes, and the first attempt failed with "pathspec did not match" — nothing was committed by it |
| Committed 03/10 | §14, at the user's request, the same way: `7ed3a85` (code and tests), `b45f792` (the two documents), messages through `git commit -F`. `barbarian.ts` was left out (below) |
| Committed 04/10 | At the user's request, each time asked for in that turn: §15–§17 as `32fe3ba` (code and tests) and `ec3fdc4` (the two documents); then §18 as `b2e9084`, and — the user asked for `barbarian.ts` to go in too — its change on its own as `3f8a51b`. Messages through `git commit -F`. The documents were not updated for §18 until the §19 round |
| Uncommitted | §19 (04/10 afternoon): 30 modified files in `src/` — core: `data-transfer`, `ikariam/http` (+ test), `messages`, `task-queue` (+ test); Empire Overview: `constants` (+ test), `empire`, `helpers`, `main`, `models/building` (+ test), `models/movement`, `render`, `startup.test`; Send Resources: `app` (+ test), `diagnostics`, `features/auto-build` (+ test), `features/sync-towns` (+ test), `features/wine-warning` (+ test), `messages`, `ui/panel` (+ test), `ui/styles` — and two new files, `src/core/notifications.ts` and `notifications.test.ts`. Plus this document's and the plan's updates since `ec3fdc4`. **Untracked and the user's, left out of every commit:** `docs/wiki/s303/` (their crawl, the source of §19's levels past 50), `.gitignore`, `docs/So_sanh_2_script_Ikariam.md` |
| Tests       | 35 files, 643 tests, all passing (500 before §12, 515 after it, 537 after §13, 560 after §14, 567 after §15, 569 after §16's first round, 578 after §16, 583 after §17, 605 after §18 and §19's 2.6 and R, 608 after K, 627 after J, 640 after E, 641 after 2.8, 643 after the s303 levels). §11 added no test (see §11). Prettier: `core/ikariam/http.test.ts`, `send-resources/features/transport-buttons.test.ts` and `send-resources/town-cache.test.ts` are off its format at `HEAD` already — not reflowed; §19's tests appended to `http.test.ts` were formatted on their own and checked |
| Typecheck   | Clean (`tsc --noEmit` and the strict config)                      |
| Build       | `npm run build` produces both the userscripts and the extension. `dist/` was built by the user on 01/10 at 02:23 and contains §11 (grepped: `Crawl Building` and `building-help-` in Send Resources; the new Academy figure `568954467` present and the old `582271779` gone, `winePressSavingPercent` and the time `12873600` in Empire Overview; `Math.min(50, …)` in Send Resources' `modelWineConsumption`). Earlier markers were checked in earlier builds: §2.I–2.J (`ika-send-amounts`, `ika-toast`, `blockedTypes`, `drains`, `fitTownRows`) and §10 (`ika-task-runner`, `Back to the town view`, `transporterSendAmount_`, `build.save`, `capped`). **`dist/` was rebuilt by the user on 03/10 at 22:54 from the working tree and holds §12 to §15** (grepped in Send Resources: `wine.autoRun`, `ika-move`, `ika_pendingTownSwitch`, `to spare, less than one`, `ikaWindowOpen_`, `js-ika-build-time-buff`, `translateX(-146px)`, `ikariam-bug-report`, `then cleared them`, `createPopupSource`, and no `"???"` left; in Empire Overview: `listAccount` and `entry.length === 2 && typeof entry[0] === "string" && entry[1] === null`). It was built before §15 was committed, so it matches the working tree, not a commit. **The userscripts installed in the browser were older than that 22:54 `dist/`** (§2). **Rebuilt 04/10 at 09:09 with §16** (grepped: `?view=transport&destinationCityId=`, `shipment form to close`, `was sent `, `Move up`; Empire Overview writes the month as `month = 2592e3` — the minifier's form of 2592000) — the build the user tried on the game (§17). **Rebuilt again at 09:44 with §17** (grepped: `ika-queue-scroll`, `resourceTableScroll`, and the `dialog.close` button after `build.save`). **Rebuilt 04/10 at 13:11 from the working tree, with §18 and §19** (grepped: `ika-building-level` in Send Resources; `empire_quickUpgrade`, `stockTip_stock`, `empire_syncIndicator` and Academy level 51's time `15379200` in Empire Overview; `ikaNotifications` and `ikaQuickUpgradeTrace` in both). That is the current `dist/`; it matches the working tree, not a commit. **The installed userscripts are older** — reinstall both before trying anything |

What landed: the AJAX transport layer, the shared window widget, the rewritten
panel, four features (sync-towns, transport-buttons, queue-view, wine-warning),
the Transport/Build runner-conflict fix, and the wine gross/net fix. `git log`
is the authority.

**The user asks for commits and pushes explicitly, one turn at a time.** Do not
commit or push on your own initiative, and do not treat a past approval as
covering the next one.

---

## 2. Measured facts about the live game

These were measured on the real account (server `s303-en`), not inferred. They
cost several rounds each. Do not re-derive them, and do not contradict them
from memory.

- **Walking the towns costs ~2367 ms per town.** From six consecutive switches
  in a captured `ajaxTrace`: 2468 / 1953 / 2366 / 1670 / 2210 / 3537 ms. Nine
  towns ≈ 21 s.
- **One `fetchTown` AJAX call costs 328–974 ms.** Same account, same session.
- **The AJAX endpoint answers with `Content-Type: text/html` and a JSON body.**
  Never gate parsing on the header; parse the body and fail on the parse.
- **The response payload carries `actionRequest`.** The game rotates the token,
  so it is re-read from every response.
- **Fetching another town does NOT move `selectedCity`** — at least not the
  client's copy. `syncAllTowns` still records and restores the selection,
  because the measurement only proves the client side is untouched.
- **`ikariam.model` is view-scoped.** It reports `0` for the three global-menu
  counters, and those fields are not even present in `Object.keys(model)`. Read
  those three from the page header, not from the model.
- **Ship capacity on this account: 620 per merchant ship, 53,000 per
  freighter.** The game's base figures are 500 and 50,000, so anything
  hard-coded to 500 is wrong as soon as cargo research is upgraded. Use
  `ship-capacity.ts`.
- **A town whose tavern is mid-upgrade reports zero wine consumption.** Dividing
  by it yields `Infinity`; the code returns `null` and says nothing instead.
- **`model.wineSpendings` is the tavern's GROSS draw, before the Wine Press.**
  Measured: it read 933 on a town that actually spent 560, the game's tooltip
  saying the press saves 373.20/hour — exactly 40%, from a level 40 press. The
  press takes one percent per level. A comment in `town-cache.ts` asserted the
  opposite for a while; do not trust that this figure is net. Confirmed a second
  time from a full dump: W-Athens has a level 35 tavern, `wineSpendings` read
  584 = `wineUse[35]`, and with its level 40 press the board holds 350.4.
- **The Wine Press is called `vineyard` internally.** The city view carries
  `div#position19.building.vineyard.level40`, tooltip "Wine Press (40)". It is
  only readable on the city view, so `modelWineConsumption` returns `null`
  elsewhere rather than silently reporting the gross figure.
- **The trading port's destination list is now `#js_transportPanel`.** A live
  page reads `div.transportPanel_city[data-city-id="297035"]` holding
  `a.transportPanel_actionIcon.action_transport` with
  `href="?view=transport&destinationCityId=297035"`. The old
  `ul.cities.clearfix` is gone. Nothing in `sample/` knows about this, IkaEasy
  V4 included, so there is no reference implementation to copy.
- **The town dropdown's `selectvalue` IS the city id.** `<li selectvalue="297034"
  class="ownCity"><a title="W-Athens">` — index 0 maps to 297034. That is the
  bridge from the dropdown index the tasks store to the `data-city-id` the new
  panel wants, and it makes `adjustDestinationIndex` obsolete.
- **`.constructionSite` is a reliable "this town is busy" signal**, but only
  the class is. Two captures of the same account settle it: a busy town matched
  it twice with the slot reading `position8 building constructionSite animated`;
  a free town matched nothing. The class survives opening a building, so it is
  still readable from a building view.
- **The upgrade button's `title` is NOT a signal.** It reads
  `"In building queue!"` in both states. Only the VISIBLE label differs —
  "Upgrade" when free, "In building queue!" when busy — and that is a
  translated string. Do not gate on either; use `.constructionSite`.
- **The breadcrumb and the building slots arrive in separate ajax boxes.**
  `gotoTown` resolves on the breadcrumb alone, so slots read on that instant can
  still be the previous town's. The original waited a flat 1000 ms here;
  `SCAN_SETTLE_MS` and `TOWN_SETTLE_MS` both wait 1200 ms for this.
- **`ikariam.model` carries `queueETA`, `queueVersion` and `nextETA`.** Present
  in `modelState.keys` of a live dump. Their VALUES have never been captured, so
  nothing uses them — but they are almost certainly a sturdier construction
  signal than scraping a class, and worth one capture if this comes up again.

Added 25/09. The game's own functions below were read from its live source,
pasted by the user from the console with both scripts off.

- **`model.currentResources` is keyed by trade-good ordinal, not by name.**
  `output5.json` lists its keys as `"1"`–`"4"`, `"resource"`, `"citizens"`,
  `"population"` — no `"wine"`. IkaEasy maps wine = 1, marble = 2, glass = 3,
  sulfur = 4, wood = `"resource"`. `maxResources` is keyed the same way. Only
  the keys have been captured, never the values.
- **The game keeps ONE ajax responder.** `executeAjaxRequest` with no callback
  does `null === r.ajaxResponder ? r.ajaxResponder = ikariam.getClass(ajax.Responder, e)
  : r.ajaxResponder.parseResponse(e)`. Anything that replaces that responder
  cuts the game off from every later response. Its `$.ajax` call does not set
  `global: false`, so jQuery's `ajaxSuccess` fires for it — on the PAGE's
  jQuery, not the sandbox copy.
- **`ajaxHandlerCallFromForm` posts every NAMED form element** (inputs,
  selects, buttons), with a `null` callback. `<a>` elements are not sent.
- **Changing town the game's way:** set `#js_cityIdOnChange` to the city id,
  then `ajaxHandlerCallFromForm(document.getElementById("changeCityForm"))`.
  This is what the dropdown does and what IkaEasy V4 does (`common.js`,
  `changeCity`). Confirmed live: the board's buttons now land in the right
  town this way.
- **`click()` on a dropdown `<a>` does NOT change town.** Measured: every board
  button waited out a 15 s timeout when it was tried.
- **`action=header&function=changeCurrentCity` over ajax, with a `view`,
  does not redraw the city view** when you are already on a city view. The
  dropdown and the popup move to the new town; the buildings on screen stay
  the old town's.
- **`model.updateGlobalData` updates the left city menu before the header.**
  Order in its source: the key loop (which calls `updateCurrentCityLeftMenu`
  → `cityMenu.update` for `cityLeftMenu`), then `updateCurrentCityMenu(a)`,
  which is what redraws the header counters.
- **A foreign `<li>` in `.menu_slots` stops the header from refreshing.**
  Measured by elimination: removing Send Resources' menu entry, and nothing
  else, made the header update after a manual shipment. Giving it a `slot98`
  class like the game's own entries was not enough. Empire Overview's
  `slot99` entry has not been caught doing the same, but nothing proves it is
  safe either. **Narrowed 03/10: it is the `expandable` class** — see
  "Added 03/10" below.

Added 26–27/09, from the `SClone1` account (towns W-Clone1 297124, M-Clone1
297155, S-Clone1 297348):

- **The town dropdown can carry coordinates.** With the game's "show
  coordinates" option on, each entry reads
  `<li selectvalue="297348" class="ownCity coords"><a title="[42:97]  S-Clone1">`
  — two spaces after the bracket. The breadcrumb still reads `S-Clone1`, and
  so does the name Auto Build stores. Any name taken from the dropdown's
  `title` never matches either. The model's `relatedCityData["city_<id>"].name`
  has no coordinates (they are in `coords`); reading names from there is what
  made Auto Build find the towns on this account.
- **`#js_transportPanel` sits hidden in every page, and its `.close` is the
  first `.close` in the document.** Measured from the console: the first
  `.close` is `div.transportPanel_header > .close`, and clicking it SHOWS the
  panel. Its entries are `div.transportPanel_city[data-city-id]`, the name in
  `.transportPanel_cityName` (with coordinates, `&nbsp;` after the bracket),
  and `a.action_transport` with
  `onclick="ajaxHandlerCall(this.href);return false;"`.
- **`#changeCityForm` sent from the task runner reloaded the whole page
  without landing.** The log pattern, repeated every 1–2 s: `Auto Build:
  queued N` (a page load), `Going to town M-Clone1`, then another load, still
  not in M. The page URL afterwards read
  `?view=city&cityId=…&currentCityId=…&oldBackgroundView=city&containerWidth=…&cityWorldviewScale=…`,
  which looks like the form's fields as a full navigation — inferred, not
  confirmed. Sending the same form by hand from the console "did nothing"
  according to the user, which settles nothing. WHY it reloads is unknown.
  The board's own use of the form (`switchTownWithGameForm`, to open another
  town's view) was only ever confirmed to *land in the right town*.
  **Measured 27/09: it reloads the whole page there too** — the user pressed
  a board button for another town, the page reloaded into that town, and the
  dialog never opened, because the wait that was to open it died with the old
  page. **Settled 02/10 — see "Added 02/10" below:** the reload is the
  game's answer, the page does land, and the loop was the coordinates.
- **A full page load straight to a view's URL does not open its dialog.**
  Tried by hand from S-Clone1:
  `location.assign("?view=townHall&cityId=297155&position=0")` loaded M-Clone1
  with no Town Hall dialog. So a URL is not a way to carry a view across a
  reload; the board now carries it in `sessionStorage` (§5).
- **Clicking a town name on the Empire Overview board is the original's route
  to change town**, and it did not work on this account until names stopped
  carrying coordinates. It is the first route again since 27/09; whether it
  keeps the page from reloading has NOT been seen live yet. *Since 02/10 it
  is the second route, after the form; it sends the same `changeCurrentCity`
  over ajax (`loadUrl`), so it almost certainly reloads too — not measured.*
- **A line `Auto Build: queued N upgrades` in the log is a page load** (or a
  Start button). It is logged from `start()`, so two of them seconds apart
  mean the page reloaded in between. **Since 28/09 it reads `Auto Build:
  queued N towns`**, and a load in the middle of a lap no longer logs it —
  the lap carries on instead (§10). Reloads now name their cause:
  `Back to the town view: <reason>`.

Added 30/09–01/10, from the game's Help > building details pages on
`s800-en` (raw captures in `docs/wiki/`):

- **The ikariam.fandom.com wiki is out of date.** Its cost tables (which
  `Constant.BuildingData` was built from) differ from the game in 3,795 of
  3,900 cells, many by more than 100%: the curves themselves changed, not a
  percentage. Its time formulas no longer hold either. WebFetch of the wiki
  returns HTTP 402.
- **The game's help dialog has every building's figures.** `#buildingDetail`,
  opened by `?view=buildingDetail&buildingId=N&helpId=1`; `table.building_nav`
  lists the buildings (`div.button_building.<class>`, the selected one also
  `.selected`, `buildingId` in its `onclick`); `h3.header` is the name;
  `.content` holds the description (`p`, "Requirement(s): …") and
  `table.table01` with one row per level. The 33 classes are exactly the 33
  `BuildingData` keys and the ids match. It lists **50 levels** (Palace and
  Governor's Residence 30) although the game no longer caps levels.
- **Cost columns are headed by icons, not words.** Keyed by file name (the
  host varies between `gf1`/`gf2`/`gf3.geo.gfsrv.net`): wood
  `c3527b2f694fb882563c04df6d8972.png`, wine
  `94ddfda045a8f5ced3397d791fd064.png`, marble
  `fc258b990c1a2a36c5aeb9872fc08a.png`, crystal
  `417b4059940b2ae2680c070a197d8c.png`, sulfur
  `5578a7dfa3e98124439cca4a387a61.png`, time
  `465f0358d2cb09c07cd0f5a53e38eb.png` (the user's list:
  `docs/wiki/mapping.txt`).
- **Full figures hide in two places.** A cost cell shows "1.33M" with the
  exact figure in a hidden `.tooltip`; an effect cell (warehouse capacity …)
  shows "13.15M" with the exact figure in its `title`. Time is display text
  only: exact to the second up to about level 8, then two units ("1M 22D").
- **The game's `1M` is 30 days and `1Y` is 365 days.** Measured, not assumed:
  the Academy's time fits one exact formula (from levels 2–8, shown to the
  second), and its ten month levels agree only with 30 days (2,520,000 s — what
  `core/format.ts` uses — fits 2 of 10); Chronos' Forge fits all 50 levels with
  365-day years, 5 miss with 360.
- **Reduction buildings save 1% per level "up to a maximum of 50%"** (their
  help text; the user confirmed and gave the scope, §11). The five production
  buildings add 2% per level "up to a maximum of 140%". Palace: "a total of 21
  towns".

Added 02/10, from probes the user ran in the console (§13):

- **Changing town from a city view reloads the page, by the game's design.**
  Sending `#changeCityForm` through `ajaxHandlerCallFromForm` makes one ajax
  request, `action=header&function=changeCurrentCity&…&cityId=<target>`; no
  `form.submit()`, no `submit` event. The server answers
  `["custom", ["reload", {"link": "?view=city&cityId=<target>&currentCityId=<target>", "isDevHost": 0}]]`
  (then `updateBacklink`, `popupData`, `removeIngameCounterData`,
  `ingameCounterData`, all `null`), and the page unloads ~0.3 s after the
  request. Same with both scripts off and on. After the reload the page is in
  the **target** town. Picking a town in the game's dropdown by hand reloads
  too.
- **`#changeCityForm`** is `method="post"`, `onsubmit="ajaxHandlerCallFromForm(this);return false;"`,
  with hidden fields `action=header`, `function=changeCurrentCity`,
  `actionRequest` (`#js_ChangeCityActionRequest`), `oldView`, `cityId`
  (`#js_cityIdOnChange`), `islandX`, `islandY`. With Empire Overview on,
  `window.ajaxHandlerCallFromForm` is the board's wrapper
  (`cAjaxHandlerCallFromForm`, publishes `formSubmit` then calls the game's).
- **The game's header has one counter per resource:** `#js_GlobalMenu_wood`,
  `_wine`, `_marble`, `_crystal` (the DOM's `glass`), `_sulfur` — the ids the
  board's own CSS has always targeted. The model's `currentResources` uses
  `"resource"` for wood and `1`–`4` for the rest, as the board reads it
  (`Constant.ResourceIDs`).

Added 03/10 (§14):

- **Chronos' Forge leaves 0.8 of the construction time per level.** Its help
  page's "Construction time reduction" column
  (`docs/wiki/building-help-chronosForge-35.json`) reads −20%, −36%,
  −48.8%, −59.04%, … −89.263% at level 10: exactly `1 − 0.8^level`. Not 1%
  per level, and no 50% cap, unlike the reduction buildings. The page does
  not say what it applies to. A search-result snippet of the fandom wiki's
  Patch 14.0.0 page says every building **in its own town, except itself**;
  the page itself could not be read (HTTP 402). The user confirmed that
  scope.
- **A foreign `expandable` entry in `.menu_slots` is what breaks the
  header; one without `expandable` does not.** Three one-liners the user ran
  on a city view, both scripts on (so Empire Overview's `slot99` entry was
  present), one per load, each followed by a manual shipment:
  A — `<li class="expandable slot98">` appended at the end, after `slot99`:
  header **broken**. B — `<li class="slot<li count> ikaeasy_slot">`,
  IkaEasy V4's shape (`js/utils.js`, `addToLeftMenu`), appended at the end:
  header **fine**. C — `<li class="expandable slot98">` placed BEFORE
  `slot99`: header **broken**. So neither the position nor the slot number
  matters; `expandable` does. Why Empire Overview's own `expandable slot99`
  is harmless is not known — it may be that it goes in at module
  evaluation, before the game builds its menu — and was not needed.
- **The game itself has a menu entry with no `slotNN`**: the first
  `.menu_slots > .expandable` in `tools/output/output5.json` is
  `<li class="expandable transportLauncher">` "Transport". The menu does
  not need slot numbers.
- **`slot99` comes from the original** (`legacy/Quản lý Ika Perseus -VN-
  V2.js:145`), with no comment; most likely just a number past the game's.
- **Both userscripts run at Tampermonkey's default `document-idle`**: no
  `@run-at` in either header (checked in `dist/`). Empire Overview inserts
  its menu entry at module evaluation (`debug.ts`), Send Resources inside
  `start()`.

Added 03/10, later, from the first saved bug report
(`tools/output/ikariam-bug-report-Smalldevil-2026-10-03-14-10-08.json`) and
two pasted ones (§15):

- **The game's `createPopup` is `r(e, t, o, a, n)`.** `e` the popup's id,
  `t` its title, `o` HTML or `[message, links, firstButton, secondButton]`,
  `a` the popup type — compared with `ikariam.PopupController.TYPE_BUBBLE`
  (a feedback bubble tip) and `TYPE_HEAVY` (a modal background); anything
  else is a plain popup — and `n` a class added to the root after
  `popupMessage` (`null` adds none). The numeric values of `TYPE_*` were not
  captured; IkaEasy passes `1`. Neither script wraps the function, so it can
  be read with both scripts on.
- **`[name, null]` is a normal response entry**, not a malformed one: the
  report held `["ingameCounterData", null]` (index 5 of 7) from a town
  switch, matching the 02/10 measurement of `updateBacklink`, `popupData`,
  `removeIngameCounterData` and `ingameCounterData` arriving `null`.
- **A pasted report is cut at 50,000 characters.** Both pastes of 03/10 lost
  their end — the part `gameData` sits in. That is why Bug Report saves a
  file now.
- **An Auto Build switch to M-Eretria (city id 297042) did not land, more
  than once**, and the runner threw every second instead of dropping the
  task after five. The facts and what is not known are in §6; the town did
  land later (the 14:10 report's URL is `?view=city&cityId=297042&…`, and
  `#changeCityForm` read "M-Eretria").

Added 03–04/10, from two more saved reports
(`tools/output/ikariam-bug-report-Smalldevil-2026-10-03-16-04-51.json` and
`…-16-06-58.json`; §16):

- **On the game's page `console.error` is not a function.** The 16:06 file
  holds `TypeError: console.error is not a function` x84 at
  `TaskRunner.tick` of Send Resources, one per second, in step with the
  switch errors. `console.log` works (the game's own `createPopup` calls
  it). Send Resources runs `@grant none` and so uses the page's console. Any
  bare `console.error`/`console.warn` there can throw.
- **The shipment form, as `?view=transport&destinationCityId=<id>` draws
  it** (the 16:04 file, opened for M-Corinth): `<form
  onsubmit="checkTransporterForm();return false;" id="transportForm"
  method="POST">`, hidden `action=transportOperations`,
  `function=loadTransportersWithFreight`, **`destinationCityId=297035`**,
  `islandId`, `oldView`, `position`, `avatar2Name`, `city2Name`, `type`,
  `activeTab`, `transportDisplayPrice`, `usedFreightersShips`
  (`#use_freighter_ships`), `capacity` (`#textfield_capacity`),
  `max_capacity`, `jetPropulsion` (`#textfield_jet`). Cargo fields
  `#textfield_wood` (`cargo_resource`), `#textfield_wine`
  (`cargo_tradegood1`), `_marble` (`…2`), `_glass` (`…3`), `_sulfur`
  (`…4`), each with `a.setMin`/`a.setMax` (`#slider_<name>_min/max`). Ships:
  `#textfield_premium`, `#selectedTransportersInput`
  (`normalTransportersMax`), `#selectedFreightersInput`,
  `#slider_freighters_max`, `#transporterCount`, `#freightersCount`. Submit:
  `input#submit.button.action_bubble`, value "Transport goods". A trade
  route form follows (`#tradeRouteTime`, `#js_tradeRouteButton`). **Every
  selector the old code used for the form still matches**; only the
  destination list was gone.
- **The userscripts installed in the browser were older than the 03/10
  22:54 `dist/`**: the 16:04 file still listed the panel's own buttons
  (`OWN_CONTROLS` absent) and Empire Overview still reported
  `Malformed … [name, null]` (x255), both fixed in that `dist/`. Check
  which build is installed before reading a report as evidence of a fix.
- **Another M-Eretria switch that did not land**, timed: 23:05:34 the form
  was sent; at 23:05:36 the page was in **W-Athens**, and the task threw
  every second for 30 s; at 23:06:04 it was sent again and **no reload came
  within 15 s** (`gotoTown(M-Eretria): timed out after 15000ms`). The last
  URL had **no `cityId`** (`?view=city&oldBackgroundView=city&…`). Empire
  Overview's wrapper around `ajaxHandlerCallFromForm` was ruled out: its
  only `formSubmit` subscriber returns at once, as there is no
  `ikariam["changeCityFormSubmitted"]`. The cause is still unknown.
- Two `Script error.` (uncaught, one per script) are cross-origin errors
  with no detail; nothing to act on.

Added 04/10, from the user's crawl of s303's help pages (`docs/wiki/s303/`,
28 buildings; §19), compared cell by cell with the s800 crawl in
`docs/wiki/` on the levels both list:

- **s303's help pages show upgrade times halved.** Twice s303's time equals
  s800's in **696 of 696** cells, within the rounding of the displayed text
  (one display step on each side). The server has a −50% build-time buff;
  the user knew and said so.
- **s303's help pages show costs after the account's research.** s303's
  cost is `Math.round(s800 cost × 0.86)` in **1,640 of 1,640** cells — 14% =
  Pulley 2% + Geometry 4% + Spirit Level 8%. The game rounds with
  `Math.round` (floor matched 829 cells, ceil 849). Dividing back,
  `Math.round(shown / 0.86)`, gives the original in 86% of cells and is off
  by at most 1 elsewhere. So a help page's costs are **not** base figures on
  an account with those researches; s800's were.
- **Effects and descriptions are identical** on both servers (warehouse
  capacity, scientists, tavern and museum bonuses, loading speed; every
  description text), so `maxLevel` did not move.
- Each s303 file is a 50-level window around the account's current level,
  ending between 51 (Dockyard) and 96 (Architect, Carpenter, Optician).
  Levels are contiguous; no cost cell is empty.
- The help page writes high-level times coarsely ("9Y 5M", "2M 29D"); a year
  is 365 days and a month 30 (both measured 01/10, §11).

**Read from code, NOT measured** — §19's E relies on these, and the first
Bug Report after trying it is the check:

- The game's upgrade button (`#js_buildingUpgradeButton`) carries
  `function=upgradeBuilding` in its link: the board's own click handler
  (`render.AttachClickHandlers`) reads exactly that parameter. IkaEasy's
  older `common.js` built `?action=UpgradeExistingBuilding&…` by hand; its
  newer `helper/buildingUpgrade.js` reads the button's link instead, as E
  now does.
- `["provideFeedback", [{ type, text, … }]]` with `type` 10 for success: the
  board (shipments, the game's upgrade button) and IkaEasy's transport code
  both read `type` this way. The `text` field is assumed.

---

## 3. How this branch works, the hard way

Three rules earned by losing rounds to them.

**Instrument, don't reason, when the failure is invisible from outside the
page.** Four rounds went into a bug where the Empire Overview board recorded
everything and wrote almost none of it down. It had four independent causes and
none was visible from the console. The fix came from building `ajax-trace.ts`
and the crawler probes. When you cannot see it, build a way to see it.

**Prove a regression test fails against the old code before trusting it.** Done
for the FetchAllTowns deletion, the shipment handler, the `onResponse` wiring,
and the runner-conflict fix. A test written after the fix, that has never seen
the bug, proves nothing. Revert the fix, watch the test go red, restore.

**Verify claims about this codebase against the codebase.** A README claim in
this project was wrong ("swallowed by an outer try/catch") because it was
written from recall rather than from the file. Grep first.

**A test that passes against the old code proves nothing, even when it tests
the right thing.** The first version of the "town is already building" test put
`.constructionSite` in the DOM from the start and asserted `defer` — which the
old code also returned, because the bug was never the check, it was WHEN the
check ran. Rewriting it so the class appears 800 ms after the breadcrumb (which
is what the game does) is what made it go red. Run the revert before believing
a green test.

**When the page misbehaves silently, eliminate on the live page before reading
code.** The 25/09 header bug had no console error. Reading code produced two
plausible culprits in Empire Overview, both fixed, neither the cause. What
found it was cheap: turn one script off, then remove one injected element at a
time from the running page with a console one-liner. Ask for that first.
The same bug's second half (03/10) went the same way: a source probe for the
game's menu code was written, but three one-line insertions — each varying
one property of the entry — answered it in one round, before the probe was
needed. Elimination tells you WHICH difference matters; a source dump only
tells you where to start looking.

**Code carried over from the original scripts was written for an older game.**
The `executeAjaxRequest` and `updateGlobalData` wrappers, and `loadUrl`'s town
switch, were all line-for-line ports that had quietly stopped matching the
live game. "It is the same as the original" is not evidence that it works.

**Selectors copied from the old scripts are assumptions, not facts.** Three of
them have now been caught: `#BuildTab` (zero matches without Empire Overview),
the stale `#js_buildingUpgradeButton`, and now the whole trading port. The
crawler's probe output is the only thing that settles one. `portForm` has never
been captured at all — treat every selector in that group as unverified.
Add `.close` to the list: "the first one in the page" was the transport
panel's.

**"Confirmed on the live game" means only what was measured.** The form
route to change town was recorded as working because the board landed in the
right town; it was then made the first route for Send Resources, and it
reloaded the page in a loop. Write down what a measurement showed, not what
it suggests.

**Test on a second account.** Every bug in the 26–27/09 round came from an
account with a different game option on (coordinates) or a different layout
of buildings. The main account never showed any of them.

**The console level filter can hide `console.log`.** Twice the user pasted a
probe and got only `undefined`. Probes should RETURN their result, and put
`await` in front when they wait (`await (async () => …)()`), so the value is
printed whatever the filter says.

---

## 4. Environment traps

**Shell quoting has cost more time than any single bug.** The settled pattern:
write the patch as a `.mjs` file into the scratchpad using a _quoted_ heredoc,
then run it with `node`. Specifically avoid:

- `node -e` in bash with apostrophes or backticks in the payload — bash
  evaluates the backticks as command substitution.
- Backticks inside a JS template literal you are generating, **including inside
  CSS comments**. This has broken `transport-buttons.ts` once already.
- A heredoc whose body itself contains the terminator word, or contains heredoc
  syntax. Use the Write tool for that content instead of fighting the shell.
  **This bit again on 25/09**: a quoted heredoc full of template literals
  failed with "unexpected EOF", and the half-parsed command left an empty file
  named `({'` in the repo root (since removed). Writing the `.mjs` with the Write tool and
  only running it from bash has not failed once since.
- `child_process.execSync` inside such a script runs **cmd.exe** on this
  machine, not bash — a `grep` with `\|` in it fails there. Do the grep from
  the Bash tool instead.
- JSON as a carrier for multi-line patches mangles `\n` inside template
  literals. Put the before/after strings in a `.mjs` file, not a `.json` one.
- `String.replace` with a string pattern replaces only the **first** match.
- CRLF in the working tree defeating multi-line string matching.

**THE TWO SCRIPTS SHARE NO MODULE STATE.** Send Resources and Empire Overview
are separate bundles — two userscripts, two extension entry points — so a file
imported by both, such as `core/ikariam/http.ts`, ships as two independent
copies with two independent module scopes. Anything one script registers in a
module-level array is invisible to the other. This shipped as a real bug: the
board subscribed to `onResponse` in its copy, the scan called `fetchTown` in
the other, and nine fetched towns updated nothing. The only things the two
genuinely share are `document`, `window` and `localStorage`, so a cross-script
channel has to go through one of those — responses now travel as an
`ika:ajaxResponse` DOM event.

A test that imports both sides from one module registry will pass while the
shipped code cannot work. `vi.resetModules()` between the two imports is what
reproduces production; `http.test.ts` and `startup.test.ts` both do it now.

**vitest specifics:**

- `vi.resetModules()` does **not** remove listeners already attached to
  `document`, which happy-dom shares across a test file. `app.test.ts` works
  around this by mocking `./ui/actions` and capturing the handler map instead of
  installing the real click dispatcher.
- A file-level `vi.useFakeTimers()` silently stalls anything waiting on a real
  delay — it hung the `fetchTown` throttle for 20 s. `auto-build.test.ts` opts
  back out with `vi.useRealTimers()` in the fast-path `describe`.
- happy-dom has no layout engine; every `getBoundingClientRect` returns zeros.
  `alignRowToField` bails out on degenerate rectangles, and its test supplies
  rectangles by hand.
- `getTownList()` sorts by `localeCompare` when the town prefixes are not
  numeric, so `[0]` is not the town you wrote first in the fixture. Select by
  name.
- The queue runner is observable in tests as one extra live interval:
  `vi.getTimerCount()` is 3 when it is stopped and 4 when it runs.
- **The keep-alive reloads on even minutes of the clock**, and `start()`
  calls it at once (`updateCurrentAccount` → `renderSummary` →
  `keepAliveTick`). A test that counts reloads therefore passed on odd
  minutes and failed on even ones. `vi.setSystemTime` did not pin the clock
  there; `vi.useFakeTimers({ now: new Date("…T10:01:00Z") })` does. See
  "Auto Build after the queue runs dry" in `app.test.ts`.
- `git stash` / `stash pop` brings CRLF back, like `git apply` (§7). Run
  prettier on the touched files afterwards, and check the diff for reflowed
  lines that are not yours — `app.test.ts` had one.
- In bash, `sed` with `\n` in the replacement inserts a real newline and
  breaks the file. Use the Edit tool for anything but a one-token swap.
- **The revert-to-prove-red round trip without `git stash`** (settled
  28/09, used for every test in §10): copy the fixed file into the
  scratchpad, write the old version with PowerShell (LF, no BOM — so no
  CRLF comes back and prettier stays clean), run the test, then `Copy-Item`
  the fixed file back:

  ```powershell
  [IO.File]::WriteAllText("$PWD\<file>", ((git show HEAD:<file>) -join "`n") + "`n")
  ```
 For a fix mixed with other
  uncommitted work, patch just the fix out with `.Replace()` on the file's
  text instead of taking HEAD. `Out-File -Encoding utf8NoBOM` does not exist
  in Windows PowerShell 5.1.
- **The Bash tool's auto-mode classifier sometimes returns no verdict** and
  the call fails. PowerShell and the dedicated file tools kept working; use
  them rather than retrying Bash.
- **Commit messages: write them to a file and use `git commit -F <file>`.**
  In Windows PowerShell 5.1, `git commit -F - @'…'@` (or `-m` with a
  here-string) splits the text at its double quotes into separate
  arguments; git took the pieces as pathspecs and refused ("did not match
  any file(s) known to git"), committing nothing (02/10). A message file in
  the scratchpad, written with the Write tool, worked first time.
- **A red check for several fixes in one go** (used for every part of §13):
  a small PowerShell function that copies the file to the scratchpad,
  `.Replace()`s the fix out of its text, writes it back with
  `[IO.File]::WriteAllText` (LF, no BOM), runs the one test file, and copies
  the original back — then a full run at the end to confirm the restore.
  Print "PATCH DID NOT APPLY" when the replace changed nothing, so a missed
  match is never mistaken for a green test.

**Markdown is not in the repo's prettier scope** (`npm run format` covers only
`src/` and `build/`). Do not run prettier over `docs/` — it reflows every table
into an unrelated diff.

---

## 5. Decisions already made — do not relitigate

- **The panel is not merged into the Empire Overview board.** Merging would make
  Send Resources depend on Empire Overview again, which is exactly what the town
  cache was built to remove. A shared window widget in `src/core/ui/` serves
  both instead.
- **No EJS templater.** TypeScript and template literals already cover it.
- **No `chrome.storage` in place of `localStorage`.** It would break
  export/import and make the two builds diverge.
- **Anti-Captcha integration is not recommended and was not taken.** The captcha
  exists to stop automation; wiring in a paid solver is a different kind of
  project and risks the account. Recorded in §4.3 of the plan.
- **Transport quick-amounts are multiples of the measured cargo capacity**, not
  IkaEasy's fixed 500 / 1k / 5k / 50k. The user asked for this explicitly.
- **Transport and Build share one task runner**, and its running state is
  derived from the two feature flags rather than poked by whichever button was
  pressed last. Two switches over one interval is what made them fight.
  Since 29/09 a `retry` blocks only its own task type (see "Added 29/09
  evening"). Since 02/10 each flag also decides *what* runs: the runner
  passes over a type whose switch is off (§13).
- **Auto Wine's Start only fills the queue.** *Superseded 02/10 (§12): Start
  now runs the whole routine and switches Transport's timer on — through
  `toggleQueueRunner`, so `syncRunnerToFlags` still owns the runner. It still
  does not check for idle ships.* It does not start the runner and
  does not check for idle ships. Queueing and shipping are separate steps:
  `handleSendResource` returns `retry` while the fleet is out, so a plan made
  with every ship at sea simply waits. Refusing to queue threw the plan away and
  made the user remember to come back.
- **An upgrade is not counted as done until the slot becomes a building site.**
  Clicking the button proves nothing — the game refuses the click while the town
  is busy and says so only in the UI. The config entry stays put until
  `#position{N}` carries `constructionSite`.
- **The trading port's old markup is replaced outright, with no fallback.** A
  fallback branch nobody can exercise is dead code, not safety.
- **A handler that throws is retried, but not forever.** `maxConsecutiveErrors`
  defaults to 5, then the task is dropped like an explicit `failed`. The counter
  lives in memory so a reload clears it, and any normal return resets it.

Added 25/09:

- **Send Resources adds nothing to the game's own menus.** Its panel opens
  from a fixed button at the bottom left (`buildLauncher` in `panel.ts`). A
  menu entry is what broke the header (§2). *Superseded 03/10: an entry
  without `expandable` is safe and is back; the button is the fallback
  (§14).*
- **Empire Overview observes the game's responses; it does not replace the
  game's functions.** Responses come from the page jQuery's `ajaxSuccess`
  (`observeGameResponses` in `main.ts`). The one wrapper left around a game
  function, `model.updateGlobalData`, forwards every argument and the return
  value, and its own work cannot stop the game's.
- **Board links that open a view of another town switch town first**, through
  `#changeCityForm`, wait for the breadcrumb and for the game to go idle
  (`jQuery.active`, `#loadingPreview`) for 1200 ms, then open the view. A
  switch that never lands falls back to a full page load. A link that only
  changes town keeps its original single request.
- **Auto Wine's source keeps one hour of its own consumption**
  (`getSourceReserve`), 500 when that is unknown. The source produces wine, so
  it does not take part in the levelling. The user chose this.
- **Wine a receiver's storage cannot take stays at the source.** It is not
  handed to the other receivers; it waits for the next run. A receiver whose
  capacity is unknown is not capped. The user chose both.
- **Rounding shipments to whole ships, and wine drunk while in transit, are
  noted and deliberately not done** (`improvement-plan.md` §4.2, S and T).
- **User-facing strings live in `src/send-resources/messages.ts` and
  `src/core/messages.ts`**; Empire Overview uses its `Constant.LanguageData`
  table (`en` is its only language). New UI text goes there, not inline. Log
  lines are not user-facing and stay where they are.
- **The Empire Overview port keeps its style.** `var`, `any` and
  `/* eslint-disable */` stay in ported code; only placeholder names and dead
  code were cleaned. New code in those files uses `const`/`let`. The user
  chose this.
- **The long functions are not split** (`registerUiActions`,
  `handleSendResource`, `handleUpgradeBuilding`, `scanBuildings`). The user
  chose this; `handleSendResource` gets rewritten with the port fix anyway.
- **The backup-lock guard at the top of Empire Overview's ready handler was
  removed, not repaired.** It never matched anything (`$("backupLockTimer")`,
  no `#` or `.`), and guessing the selector could stop the script on pages
  where it has always run. Behaviour is unchanged.

Added 26–27/09, each chosen by the user:

- **Town names come from the model, not the dropdown.** `getTownNameFromList`
  reads the `<li>`'s `selectvalue` and returns `modelCityName(id)`; the
  `title` is only the fallback for a page without the model. Empire
  Overview's `switchTownWithGameForm` does the same for the name it waits
  for. The alternative, stripping `[x:y]` from the title, was offered and
  not taken.
- **`gotoTown` tries three routes in this order:** the board's town name
  (`clickBoardTownName`, the original's), then `#changeCityForm`
  (`submitChangeCityForm`), then the dropdown `<a>`. The form went first for
  one day and caused the reload loop in §2. *Superseded 02/10 (§13): form
  first, then the board, then the dropdown — the loop was the coordinates.*
- **The original's `isAutoReload` guard is back.** A drained run sets it and
  reloads; the next load clears it and neither re-queues Auto Build nor
  reloads on drain (`loadedAfterRun` in `app.ts`). The next run waits for the
  keep-alive (even minutes). The port had kept writing the flag and never
  read it.
- **Build's timer switches itself off once the saved build list is empty**
  (`hasConfiguredUpgrades`). With work still saved it stays on, as in the
  original, and retries on the keep-alive.
- **`closeGamePopup` clicks only a `.close` that is displayed** (no ancestor
  `display: none`). Taking the first `.close`, as the original did, opened
  the transport panel.

Added 27/09, each chosen by the user:

- **A board view for another town is carried across the reload in
  `sessionStorage`.** `loadUrl` saves `{cityId, mainView, params, savedAt}`
  under `ika_pendingBoardView` before `switchTownWithGameForm`;
  `ikariam.openPendingView()`, called from `main.ts` once the board's `init`
  has everything, takes it (read and remove) and opens it as a same-town
  link — the route the user confirmed opens dialogs. It opens only in the
  town it was for and within `PENDING_VIEW_MAX_AGE_MS` (30 s); anything else
  is dropped, so a stale one never opens by surprise. When the switch lands
  without a reload, the old callback opens the view and removes the record,
  so it never opens twice. A switch that times out keeps the record for the
  page its full-load fallback brings. `sessionStorage`, not `localStorage`,
  so only this tab acts on it — and it stays out of the data export's key
  table. The alternative, a full page load to the view's URL, was ruled out
  by the measurement in §2.
- **The upgrade button of another slot is waited past, not given up on.**
  `handleUpgradeBuilding` polls (`waitFor`, `UPGRADE_BUTTON_TIMEOUT_MS` =
  15 s) for a `#js_buildingUpgradeButton` whose `href` carries this slot's
  `position=`. Another slot's button is still never clicked; if only that one
  was seen by the timeout, it logs `Upgrade button still pointed at position
  X, expected Y - not clicked` and ends the town's turn (it deferred until
  28/09).

Added 28–29/09, each chosen by the user:

- **Auto Build runs in laps, like the original.** `enqueueAutoBuild` queues
  one `upgradeBuilding` task per town that has anything saved, for the
  town's first saved upgrade only. Every way a visit can fail — busy town,
  no upgrade button, a build started meanwhile, a click that never became a
  building site — ends that town's turn with `done` (`endTownTurn`), never
  `defer`; the saved list is only touched when the upgrade is confirmed. The
  lap drains the queue, the existing drain/reload guard runs, and the next
  lap comes with the keep-alive reload on even minutes. Offered alternatives
  not taken: keep one task per upgrade and only lengthen an interval; a 60 s
  cycle (it would have doubled the reloads, Transport's included).
- **A lap follows the board's order**, which the player can drag: row on
  `#BuildTab`, then dropdown index, then last. Not alphabetical as the
  original was.
- **A reload in the middle of a lap carries on with it.** `start()` queues a
  fresh lap only when no `upgradeBuilding` task is left in the stored queue.
- **The cross-tab lock is Web Locks, per account, and gates the drain too.**
  `TabLock` in `core/task-queue.ts` (next to the runner — no new file),
  named `ika-task-runner:<account>`. `startRunner` asks for it, `stopRunner`
  and the drain give it back. `TaskRunner`'s new `canRun` is checked before
  anything else in `tick`: a waiting tab sees the shared queue empty out and
  would otherwise run `onDrain` and reload. Without the API the lock grants
  at once (no protection, old behaviour).
- **A full store is striped at `current >= capacity`** (IkaEasy's threshold),
  as a new `capped` class next to the board's own `full` (red from 96%).
  Gold is left alone: its bar reuses `full` for something else.
- **`backToCity(reason)` takes a required reason** and logs it when it
  actually clicks, so every call site has to say who it is.
- **Auto Build Settings' button is Save, and Save only closes the dialog** —
  as the original's `saveAutoBuild` did. Every `+`/`-` is saved already. The
  panel's Start is the only thing that queues and starts a build run.
- **Transport Settings takes one amount per resource.** Add queues one
  `sendResource` row per filled field. Digits only (`^\d+$`); any bad field
  queues nothing and names the field.
- **`needingShip` divides by `getPerShipCapacity()`** — calibrated, 500
  until calibrated. Rounding is still `Math.round`, which can come out a
  ship short; the user was told and has not asked for `Math.ceil`.

Added 29/09 evening, each chosen by the user unless marked (write-ups in
`improvement-plan.md` §2.I–2.J):

- **A `retry` blocks its own task type, not the whole queue.**
  `TaskRunner.nextTask()` runs the first task whose type is not in
  `blockedTypes` (in memory, like `busy`); a `retry` adds the type, any other
  result removes it. When every queued type is blocked the set is cleared and
  the head runs, so a shipment waiting for ships is retried every tick once
  nothing else can run. Shipments keep their place and order. Offered and not
  taken: the shipment handler returning `defer` (reorders shipments, and a
  queue of only shipments would pause 60 s a lap), and two separate queues.
- **Messages are toasts that fade by themselves, in both scripts; `confirm()`
  stays.** Send Resources uses `showToast` in `core/ui/window.ts` (no new
  file); Empire Overview uses its own `render.toastAlert`, since the two
  bundles share no module and Send Resources must not depend on the board.
  Offered and not taken: a box with an OK button, the game's `createPopup`.
- **"Warning wine" stays silent for a town whose wine is not going down**
  (`getEmptyTime` is `Infinity`): no toast, a blank cell, no colour. That
  covers both `net = 0` and `net > 0`; the original's fall-back to the time
  until the store is full is gone.
- **The board's town tabs show five towns and scroll the rest**
  (`VISIBLE_TOWN_ROWS`), header and totals sticky. The cap is measured from
  the rows, not fixed. All three town tabs, not only Resource — chosen here,
  not by the user; they were told.
- **The Transport Settings amount classes carry an `ika-send-amounts`
  prefix** instead of the user's sample names (`.resource-row` and so on), so
  they cannot collide with the game's CSS — chosen here; the user was told.

Added 30/09–01/10, each chosen by the user (§11):

- **Building figures are tables from the game, not formulas.** A formula was
  tried and fitted the Academy exactly (§11); the user stopped it and chose
  the game's own tables. Time is a table of seconds too.
- **Levels past the help page's 50 (30) are left empty** until the user finds
  a source. Costs and time read `0` there (`|| 0`), capacity and
  `basicBonus` too (added so they are not `NaN`).
- **`maxLevel` is a logical level, 0 when none.** The level at which the help
  page (text or table) says the effect stops growing; `isMaxLevel` is
  `maxLevel > 0 && level >= maxLevel`. It greys the building out as before and
  does not stop an upgrade (the cell stays clickable).
- **Costs in the table are the game's base figures; discounts are added up
  and taken off once.** Pulley 2% + Geometry 4% + Spirit Level 8% + the
  reduction building's 1% per level up to 50% — 64% at most. Rounding stays
  `Math.round`, which the user has not specified.
- **The 50% cap is one constant for both scripts**,
  `REDUCTION_BUILDING_MAX_PERCENT` in `core/ikariam/model.ts`.
- **The crawl button is temporary** and reads the page only; the player picks
  each building by hand (they chose that over the script clicking through).

Added 02/10, each chosen by the user (§12):

- **↑/↓ move one row, everywhere.** The queue view's ↓ used to send a task
  to the back (`moveToBack`, which the runner still uses for `defer`). In
  Transport Settings one row is the next *shipment*: upgrades in between keep
  their place (`moveOneStep(…, "sendResource")`).
- **Two entries of one building keep their levels in list order.** Renumbered
  after a swap they come out as before, so ↑/↓ between them does nothing.
- **There is no Manual/Auto switch.** Auto Wine's Start is the automatic
  route: scan and wait for it, Load + Save (`saveMeasuredReceivers`), queue,
  switch Transport's timer on. The step-by-step route is the settings dialog,
  whose **Save** now queues the run as well; Start Timer stays with the
  player. Several ticked sources → the source popup, on both routes.
- **A scan that refuses to run stops Start.** It refuses while either timer
  runs; Start does not switch a timer off to make room.

Added 02/10, later, each chosen by the user unless marked (§13):

- **A shipment does not sail with less than one ship's cargo, unless that is
  all the task needs.** "One ship" is the kind that would sail: one merchant
  ship (500, or the calibrated figure) while any is idle, else one freighter
  (50,000, or calibrated). Short → `defer`. Checked before navigating, with
  the ships idle then, and again at the form with the ships that will sail.
  The stock check covers all five resources, not only Auto Wine's wine.
- **0 in Transport Settings means none**, like an empty field.
- **Each Start Timer runs only its own task type.** The other type stays
  queued in its place; a queue holding only such tasks counts as drained.
  Build's **Start** (one lap, no timer) may run upgrades until the drain
  (`oneOffRunTypes`). The user chose "pass over, keep in place".
- **The building list reads a level, not words:** a number in the title's
  brackets is the level, anything else is 0; `constructionSite` adds one. The
  user chose the class over moving the English string.
- **A town switch is allowed to reload the page.** Routes: the form, then the
  board's name, then the dropdown — the user chose form first. A switch is
  noted in `sessionStorage` (`ika_pendingTownSwitch`) before it is sent; the
  same switch is not sent again within 30 s if the reload did not land — the
  task throws instead, and the runner drops it after five. Chosen here, as
  the guard against the loop; the user was told.

Added 03/10, each chosen by the user unless marked (§14):

- **The Send Resources window remembers open/closed, and opens on the first
  load.** `createWindow`'s `rememberOpen` + `openByDefault`; the state is
  `ikaWindowOpen_<id>` in the account store, next to the position, and like
  the position stays out of the data export. ×, Esc, Space and the corner
  button all stay, and every one of them is remembered.
- **Not `isSendResourceHidden`** (chosen here): the original's key would
  have been the natural one, but Send Resources' CSS uses it to hide
  `#empireBoard` (`ui/styles.ts`), so writing it on close would hide the
  Empire Overview board on the next load.
- **Send Resources' menu entry is IkaEasy-shaped**: `<li class="slot<li
  count> ika-send-menu">`, appended at the end of `.menu_slots`, NO
  `expandable` (§2, "Added 03/10"). The game's hover slide-out only applies
  to `expandable` entries, so IkaEasy's CSS does it (`menuEntryStyles` in
  `ui/panel.ts`: `width: 199px; translateX(-146px)`, `translateX(0)` on
  hover, RTL too). Shaped after the experiment that worked, chosen by the
  user. A regression test fails if `expandable` comes back.
- **The corner button stays as the fallback**, shown only on a page without
  `.menu_slots`.
- **The buff is shown as text, edited only behind ✎, saved only by ✓**
  (asked for in two steps). ✎ swaps the text for a field and the button
  for ✓; ✓ saves, removes the field and redraws. Leaving the field saves
  nothing. A refused figure keeps the field open. The table's 10 s redraw
  is skipped while a field is open; ✓ removes the field first so its own
  redraw is not skipped. ✎ and ✓ are dispatcher actions
  (`account.editBuildTimeBuff`, `account.saveBuildTimeBuff`).
- **The server's construction-time buff is typed in Send Resources' account
  table**, one field per account, in percent (36 = 36%), not in the board's
  Settings tab — so the board reads Send Resources' `listAccount` through
  `localStorage` (`accountBuildTimeBuff` in `core/storage.ts`; the key is
  `ACCOUNT_LIST_KEY`, which `KEY.listAccount` now uses). No Send Resources,
  no row or a bad figure → 0.
- **Upgrade time = `round(seconds × (1 − buff) × 0.8^forgeLevel × (1 +
  government))` × 1000**, rounded to the nearest second after all three.
  The government factor (Aristocracy −20%) is kept — asked and chosen. The
  Forge counts in its own town only and never for its own upgrade.
- **The buff field is text, not `type="number"`** (chosen here): a number
  field turns "abc" into "", which reads as "no buff" and would silently
  wipe the stored figure.
- **The `s201`/`s202` divide-by-3 in the tooltip is untouched** — the user
  did not mention it.

Added 03/10, later, each chosen by the user unless marked (§15):

- **Bug Report always saves a JSON file, never the clipboard**, even with
  no bug recorded, through the existing `downloadJson`. File name
  `ikariam-bug-report-<account>-<UTC time>.json` (`timestampedFilename` with
  a prefix). `ikaBugReport()` in the console returns the same full report.
- **The report carries `gameData`** — the data the plan waits on, read from
  the page at the press: `createPopupSource` and `shipmentForm` (the §2.A
  console command's fields). Each piece is read in its own `try`.
- **Saved, then cleared.** The user was asked "clear first, then save" (the
  file would never hold a bug) against "save, then clear", and chose the
  second.
- **`visibleControls` leaves out this script's own controls** (its window,
  launcher and settings dialogs — `OWN_CONTROLS` in `diagnostics.ts`).
- **`createPopup(…, null, null)`**: a plain popup, no extra class — the
  original's `"???"` matched no type and `"class"` styled nothing.
- **Empire Overview skips `[string, null]` without a bug record**; any other
  bad shape is still recorded.
- **Offered and not taken (yet):** dropping the seconds from the "did not
  land" message so repeats aggregate; attaching the last ~200 log lines to
  Bug Report; a Clear Bugs button (made moot by save-then-clear). *The
  first two were taken on 03–04/10 (§16).*

Added 03–04/10, each chosen by the user unless marked (§16):

- **No bare `console.error`/`console.warn` in core or Send Resources.**
  `writeToConsole(level, …args)` in `core/logger.ts` calls the level if it
  is a function, else `console.log`, else nothing, and never throws;
  `logInfo` uses it too. Empire Overview (sandboxed) and the extension's
  content script keep theirs — chosen here.
- **Varying figures go to the log, not into an error message**: the "did
  not land" message is fixed text, the seconds are logged just before.
- **Bug Report carries the newest 200 log lines**, newest first, read from
  storage so they span page loads.
- **The shipment form is opened with `ajaxHandlerCall("?view=transport&destinationCityId=<id>")`**
  and filled only once its hidden `destinationCityId` holds that id (15 s).
  The city id is the dropdown entry's `selectvalue`. Calling it directly
  rather than clicking the transport panel's `a.action_transport` was
  chosen here (the same call, without depending on the panel listing the
  town); the user approved the route. `townHasPort` checks the sea slots
  without clicking; the old list code is deleted with no fallback.
- **The queue's ▶ and the status line follow `TaskRunner.currentTaskId`**
  (the running task, or the one the next tick would pick); none while the
  runner is stopped — chosen here.
- **"Warning wine" once per town until it clears** (the user's choice of
  three): `wineWarnedCityIds`, in memory, so a page load warns once again.
- **Space belongs to Empire Overview alone** (the user's choice). The Send
  Resources window opens from its menu entry and closes with × or Escape.
- **Small ones, approved as a list:** resource labels and `DURATION` in the
  dialogs, no Close button in Auto Build Settings, `needingShip` rounds up,
  a month is 30 days in both formatters. The Crawl Building button stays:
  the user still has buildings to crawl. *The Close button came back the
  same day (§17).*

Added 04/10, each chosen by the user unless marked (§17):

- **The panel's queue and Transport Settings' shipment table show at most
  ten rows (`VISIBLE_ROWS`) and scroll the rest.** Measured, not a fixed
  height (chosen here): `capVisibleRows` sets the box's `max-height` to the
  bottom of row ten, because a row's height differs between this script's
  window and the game's popup. A box that is not laid out keeps its cap;
  the queue sets it on the next redraw with the panel open. The header row
  scrolls with the rows — the user did not ask for it to stay. It lives in
  `core/dom.ts`, not reused from Empire Overview's `fitTownRows`: Send
  Resources must not depend on the board.
- **Auto Build Settings has Save and Close again**, both closing the dialog
  — this reverses §16's removal.

Added 04/10, midday, each chosen by the user unless marked (§18):

- **Auto Wine rounds a share of one ship or more down to whole ships**; a
  share under one ship still goes as it is. The capacity is the calibrated
  merchant ship (`getPerShipCapacity`).
- **Travel time is recorded per route from real shipments** (the form's
  `#loadingTime` + `#journeyTime`, keyed by city ids) and used when
  planning; a route never shipped counts zero. Not estimated from map
  distance.
- **A town whose only sea slot is a building site defers** when no form
  comes — the slot cannot tell a port being upgraded from a shipyard
  (chosen here).
- **The `barbarian.ts` change is the user's** and was committed on its own
  (`3f8a51b`).

Added 04/10, afternoon, each chosen by the user unless marked (§19):

- **Plan question 2: Phase 2 includes the board.** 2.6 first, 2.8 later,
  **2.7 only on a concrete bug** (flicker, a lost scroll position).
- **Plan question 3:** R (at least the misdirected update check) and K
  first; then O, J, E; P and L once there are captures; **F, G, I, M, N, Q
  not now**. O was then dropped too — "not needed yet" — once the user
  heard the game has its own notepad and O automates nothing.
- **2.6 is a mark, not an overlay**: ↻ in the Town header of the three
  tables, dimmed, spinning while `syncAllTowns` runs. The class goes on
  `#empireBoard`, so a table redrawn mid-sync keeps it (chosen here).
- **R: the old update check is removed, not repointed.** The `autoUpdates`
  key stays in the settings schema so stored settings still load (chosen
  here). An update channel of our own (`@updateURL`) needs the build at a
  public URL — that publishes something, so it is the user's call, and
  still open.
- **K reads the level from the building's `title`**, as the settings dialog
  does — not from the `levelNN` class cited when the item was explained
  (`building vineyard level40`) — chosen here, to share one parser with the
  dialog. The label lives in
  `features/auto-build.ts`, not a new file. The observer watches
  `document.body`, because nothing measured says the buildings sit inside
  `#container`.
- **J:** the page's `Notification` API in both builds — only while the
  game's tab is open; all four kinds, one checkbox each, **off by
  default**; announced when it happens, no "soon"; a new file
  `src/core/notifications.ts` (+ test), which the user agreed to. Events
  older than 2 minutes are not announced; a notice key is shown once across
  both scripts and every tab (chosen here).
- **E: a direct request, not a runner task**, with the game's own upgrade
  link (option (a) of three; (b) would have queued it for Auto Build). Only
  on cells the board shows as upgradable; the button stays disabled until
  the game answers. **The user asked for it to be tested thoroughly and
  checked against a Bug Report**, so every run keeps both responses
  (`ikaQuickUpgradeTrace`, the last five) and Bug Report carries them.
- **2.8: only the missing piece** — a tooltip on the stock figure — inside
  the board's own tooltip system (option (b) of three).
- **U: `Constant.BuildingData` stores original figures.** The user: s303's
  times are after its −50% buff, so ×2, "and the calculation stays as the
  current formula". Costs: the user chose ÷ 0.86 (asked separately, once
  the 14% was found), so the board does not take the research off twice.
  Levels 1–50 keep the s800 figures; only levels past them are added.

---

## 6. What is blocked, and on what

~~**Blocked on a capture, and ahead of everything else: the trading port
(§0).**~~ **Resolved in code 04/10 (§16):** the 03/10 23:04 Bug Report caught
the shipment form. What now comes first is **trying it on the game** with a
small shipment — Auto Wine and every shipment test depend on it. **Tried
04/10: "roughly ok"** (§17).

**Resolved 26/09: Auto Build "losing its queue".** On `SClone1` it was every
task failing with `Town "S-Clone1" not found` (the coordinates, §2) and being
dropped from the run queue, while the saved build list kept the entries. The
run queue is a one-off copy of that list (`enqueueAutoBuild`), so a dropped
task only comes back on the next load or Start. That design is unchanged.

**Waiting on the user's retest (29/09 build):**

- ~~**Does the board route stop the reload loop?**~~ Answered 02/10 by
  measurement (§2, "Added 02/10"): every switch reloads, the loop was the
  coordinates. The form is first again (§13). Still to see live: a lap that
  switches town through reloads without looping.
- **Does every town get its turn?** Reported 28/09 on `SClone1` (board
  order W, M, S): "only hops between two towns; the first town on the board
  is never upgraded". Found in the code, not in a log: one task per saved
  upgrade, a busy town's entries deferring round and round, and every
  keep-alive reload re-queueing from the alphabetically first town — W is
  last alphabetically. The lap rewrite (§10) removes both. **If W is still
  skipped**, the cause is something else: ask for the log around its turn
  (`Going to town W-Clone1`, or its absence). The line
  `… is already building - next town` for a town that is free points back
  at the older suspect below.
- **A free town reported as building.** §2's "breadcrumb and building slots
  arrive in separate ajax boxes": `TOWN_SETTLE_MS` (1200 ms) may be too
  short after a switch, so M is checked while S's `.constructionSite` is
  still on screen. Not measured. The probe that settles it, run from a BUSY
  town:
  `await (async () => { /* switch, then every 100 ms for 4 s record
  #js_cityBread text, !!.constructionSite, jQuery.active */ })()` — the
  version in this session's transcript used the form to switch, which is the
  first route again since 02/10. Note that the switch reloads the page, so
  the probe must record across the load (`sessionStorage`, as the 02/10
  probes did). If the slot outlives the
  breadcrumb by more than 1200 ms, wait for the game to go idle like
  `switchTownWithGameForm` does.

*Retested 04/10 by the user: "roughly ok" (§17) — the paragraph below is
kept for its specific risks.* **Also waiting on the retest:** everything in §12 to §15 (all in the
03/10 22:54 `dist/`),
everything in §10 (each round's "try on the
game" list is in the plan, §2.F–2.H), everything in the plan's §2.I–2.J
(same, at the end of each part), the board dialog for another town (§9
bug 5) and the stale upgrade button (§9 bug 6). One risk in bug 5's fix is known and
unmeasured: `openPendingView` runs the moment the board's `init` is done. If
the game is still loading then, the dialog could open and be closed by what
arrives after — the failure seen on 25/09. If the user reports a dialog that
flashes and vanishes, wait for the game to go idle first, as
`switchTownWithGameForm` does (`gameIsLoading`).

**Not started, offered and declined for now:**

- ~~B — the stale upgrade button.~~ Done 27/09, §9 bug 6.
- ~~C — who reloads.~~ Done 28/09, §10: `backToCity(reason)`.
- ~~**Why the form reloads the page** (§2).~~ Measured 02/10: the server
  answers with a `reload`; the page lands (§2, "Added 02/10").

~~**Blocked on a console probe: a left-menu entry for Send Resources.**~~
**Resolved 03/10** without the probe: three console experiments showed the
`expandable` class is the cause, and the entry is built without it (§2,
§14). The `cityMenu` probe in the plan was never run and is not needed.

~~**Blocked on the user: the names of `createPopup`'s last two
parameters.**~~ **Resolved 03/10** from the source in the first saved bug
report: `popupType` and `className` (§2, §15).

**Blocked on a log: the Auto Build town switch to M-Eretria (§15).** Two
pasted bug reports (03/10, 901 then 928 occurrences, both cut at 50,000
characters) were nearly all one error from `gotoTown`, task "Academy 12" in
M-Eretria (city id 297042): `The switch to "M-Eretria" sent Ns ago did not
land (now in "W-Athens")` — an earlier group said `"M-Syracuse"`. What is
known:

- The guard in `gotoTown` worked as written: a switch noted in
  `sessionStorage` (`ika_pendingTownSwitch`) and not landed is not sent
  again within 30 s; the task throws instead.
- **The same task id threw every second, 7–12 times or more in a row**,
  although `TaskRunner` drops a task after 5 consecutive throws
  (`maxConsecutiveErrors`). The streak lives in memory, so this means either
  the page reloaded about every second, or two runners were counting.
  Nothing in the report tells which.
- The first report's URL was `?view=city&oldBackgroundView=island&…` with
  **no `cityId`** — not the `?view=city&cityId=<target>` reload a switch
  produces (§2, "Added 02/10"); it looks like a return from the island view.
  Whether the player was clicking around is not known.
- Later the town did land: the 14:10 report's URL is
  `?view=city&cityId=297042&…` and `#changeCityForm` read "M-Eretria".
- **The message carries the seconds**, so each second made a new fingerprint
  and the 50-record buffer filled with them — older bugs were evicted and
  the reports grew past what a paste keeps.

Needed: the log around it (`Going to town …`, `Back to the town view: …`,
`This tab now runs…`, reload lines). A bug report does not carry the log
yet; both fixes (log in the report, no seconds in the message) were offered
and are waiting on the user.

**Update 03–04/10 (§16):** the runner's half is found and fixed — its own
`console.error(e)` threw on the game's page, so the streak was never
counted; it now drops the task after five throws. The message no longer
carries the seconds, and Bug Report now carries the last 200 log lines.
A second timeline is in §2 ("Added 03–04/10"): one switch landed in
W-Athens, the next produced no reload at all within 15 s. **Why the switch
does not land is still unknown**; the next report from the current build
should hold the log that tells.

**Update 04/10 (§17):** it did not come back in the user's test on the
game ("roughly ok"). The cause was never found; if it returns, the Bug
Report file now carries the log.

**Item U (29/09, the user's idea) — mostly done 01/10, §11.** It began as
"a formula instead of the tables"; the user then switched to the game's own
figures in the tables. **Still open: levels past the 50 (30) the help page
lists** — the user will find a source; do not invent one. Plan §4.2 "Ghi chú
về U". **Update 04/10 (§19):** the user crawled s303; 704 levels past 50
added, converted back to original figures. Still without figures: Chronos'
Forge, Palace, Governor's Residence, Pirate Fortress and Temple past their
listed levels, and every building past the end of its s303 window (plan
§2.U part 4). A crawl from another server needs its own factors checked on
the overlapping levels — do not assume ×2 and ÷0.86.

**Item V (01/10, the user's idea): research effects as the game computes
them.** Four points: building cost reduction (**done**, §11), scientists' gold
cost, maximum population, satisfaction. **The user will write the details of
the last three; do not start until they do.** Today's code for each, with
file and formula, is in the plan, §4.2 "Ghi chú về V". The research data
itself is only which topics are explored (`parseResearchAdvisor`), never an
effect value; the effects are all hard-coded.

~~Two questions in §6 of the plan are unanswered and are blocking real work:~~
**Both answered 04/10** (§5, "Added 04/10, afternoon"; §19). Kept for the
record:

1. **Does Phase 2 include the Empire Overview board, or only the panel?** Items
   2.6, 2.7 and 2.8 are all board-side. The board is 10,767 lines of mechanical
   port using jQuery UI tabs; touching it is a different risk class from
   rebuilding the panel.
2. **Take all the items in §4.2 (now A–V), or a subset?** The user was asked
   to mark the ones they want. Until then E–R are not started.

**Blocked on captures (04/10):** P — a confirmation before abandoning a
colony — needs the abandon screen (button and form); L — filling in the
ships for a Barbarian Village attack — needs that attack form. Neither has
ever been captured.

**Blocked on the user (04/10):** R's update channel — whether to publish
the build at a public URL for `@updateURL` (plan §6 question 5). V's three
remaining points — the user will write the details.

**Waiting on the user's test (04/10):** everything in §17–§19, none of it
seen on the game. E first, as the user asked: one upgrade that starts, one
the game refuses, then Bug Report — the file carries the game's two
responses per run (`gameData.quickUpgrades`), the evidence for the parsing
E was written against without a capture.

Unblocked and ready to pick up: **nothing in the plan.** 2.7 waits for a
concrete bug; F, G, I, M, N, O, Q are "not now" by the user's choice.

---

## 7. Loose ends worth knowing

- ~~**1.4 has no recorded reasoning.**~~ Done 02/10 (§13); the reasoning is in
  the comment above `gotoTown` and in the plan's §2.L, part 5.
- **A feature can pass its tests and still not exist.** `wine-warning.ts` was
  written, tested green, and reported as done while nothing imported it — the
  bundler dropped it entirely. It is wired in now. The check that settles it is
  grepping the built output in `dist/`, not the test result.
- **vitest sometimes collects fewer files than exist, and still reports PASS.**
  Seen twice: once as 28/30 with 5 worker errors, once as a plain green
  "31 passed (31), 384 passed" when the real totals are 33 and 407. Neither was
  reproducible — chaining after `typecheck` was tried three times and did not
  trigger it. **So a green run only counts if the file total reads 34** (33
  until `game-api.test.ts` was added on 25/09). Check the count, not the colour.
- **Disproved, do not chase again:** the wrong per-town wine figures were
  **not** caused by `$.extend(true, {}, dataSetForView, entry[1])` in
  `game-api.ts` leaking the current town's numbers into every fetched town. A
  full `ikaDump()` showed each town holding its own correct figure. The real
  causes were the gross/net confusion and the dead cross-bundle bridge, both
  recorded above.
- **A dump is worth more than a hypothesis.** The `ikaDump()` that settled both
  wine bugs also disproved the theory this session had been building towards.
  `empireStore[].knownTime` spread over hours is the signature of "walked by
  hand"; timestamps within seconds of each other is the signature of "scanned".

- **`sample/` and `*.pem` are gitignored by the user** — a Chrome extension
  signing key lives there.
- **`tools/output/` is gitignored** because captures carry the account name,
  every town name and coordinate, and a live `actionRequest` token. The
  crawler's `ikaTestAjaxFetch` strips the token from the URL it stores.
- **The crawler is read-only** except for `ikaTestTownSwitch()` and
  `ikaTestAjaxFetch()`, which are hand-invoked only and never run on their own.

- **Two half-fixed things, both in `app.ts`, neither scheduled.**
  `syncRunnerToFlags` decides whether the runner runs, not what it may run — so
  Build's Start Timer works through queued shipments while Transport's button
  still reads "Start Timer". That is the third bullet of the comment above
  `syncRunnerToFlags`, listed there as fixed; only the "who starts it" half was.
  And `onDrain` calls `setAutoStart(false)` but leaves `isAutoBuildStart` true
  with its label unchanged, so after the queue empties the Build button reads
  "Stop Timer" over a stopped runner and takes two presses to restart.
  **Update 26/09:** the second half is fixed when the saved build list is
  empty (the timer turns off, §5). With work still saved the flag stays on
  on purpose, and the label then reads "Stop Timer" over a runner waiting for
  the keep-alive — which is now true, not a lie. The first half (Build's
  timer runs queued shipments) was checked on 26/09 and was NOT the cause of
  the transport panel opening. **Fixed 02/10 (§13):** `allowsType`.

- **Not yet confirmed on the live game after a rebuild (25/09):** the header
  refreshing after a manual shipment with the launcher moved out of the menu,
  and the board's dialogs staying open now that the switch waits for the game
  to go idle. Both are covered by tests; neither has been seen working live.
  The review round adds a few behaviour changes to that list — the breadcrumb
  read as text, hotkeys by physical key, and more; `improvement-plan.md` §2.D
  has the table of what to try.
- **`town-cache.test.ts`, `panel.test.ts` and `app.test.ts` were already off
  prettier's format before 25/09.** Running `prettier --write` on them reflows
  unrelated lines; format only what you added, or put the stray reflow back.
- **The line numbers the port's comments cite are right.** They count lines of
  `legacy/Quản lý Ika Perseus -VN- V2.js` (10,767 lines; line 10741 is the
  `init` retry, line 6650 is `var ikariam = {`). `sample/Quản lý Ika Perseus
  -VN-.user.js` is a slightly different copy, 10,769 lines — a review agent
  compared against that one and reported every number as stale. It was not.
- **Every localStorage key the scripts write is checked against the export
  table** by a test in `core/data-transfer.test.ts`. Adding a key without
  classifying it in `core/data-transfer.ts` now fails the suite rather than
  silently dropping out of exports.
- **Done 04/10 from the lists below (§16):** the Close button in Auto
  Build Settings is gone (*back again in §17, at the user's request*); `needingShip` rounds up; the queue's ▶ and the
  status line follow the task the runner is on; "Warning wine" toasts once
  per town until it clears; a month is 30 days in both formatters; the
  Transport Settings table shows labels and the Auto Wine dialog takes `"—"`
  and the hours from `DURATION`; Space no longer toggles both boards. What
  remains of those lists is marked inline as still open.
- **Small things left from 03–04/10** (§16): the status line still reads
  "idle" when the runner's task is an upgrade (`describeCurrentTransfer`
  describes shipments only). With the runner stopped there is no ▶ at all —
  chosen, but it reads differently from before. `townHasPort` accepts a
  `constructionSite` in slot 1 or 2, as the original did, though those
  slots can hold a shipyard too; a town whose only sea building is a
  shipyard under construction would open the form and time out. After the
  submit the handler waits for `#transportForm` to go away; whether the
  game removes it was not measured (the wait is bounded and never throws).
  The form capture keeps 20,000 characters of HTML, which cut the 03/10
  form short — the visible controls cover the rest.
- **Small things left from 04/10** (§17): the queue's ten-row cap is set
  on a redraw with the panel open, so a panel opened onto a long queue
  shows it uncapped for up to one status tick. The header rows of both
  tables scroll away with the rows. `core/dom.ts` has no test file of its
  own; `capVisibleRows` is tested through its two callers.
- **Small things left from 28–29/09, not scheduled:** the panel's status
  line still reads "idle" while the queue head is an Auto Build task
  (`describeCurrentTransfer` only describes `sendResource`); Auto Build
  Settings still has a Close button that now does exactly what Save does —
  the user was asked whether to drop it, no answer yet; `needingShip` rounds
  with `Math.round` (§5).
- **Small things left from 29/09 evening, not scheduled** (plan §2.I–2.J):
  the queue view's ▶ and the panel's status line still point at the head of
  the queue, which since the `retry` fix may be a shipment waiting while an
  upgrade behind it runs — showing the task the runner picked needs the
  runner to expose it. With a shipment still waiting, the queue never drains,
  so the next Auto Build lap has to come from the keep-alive reload and
  `start()`, not `onDrain` — not checked live (since 02/10 this holds only
  with both timers on: with Build's alone, a queue of shipments counts as
  drained, §13). "Warning wine" still toasts
  every 5 s for a town that really is running dry. The toast for
  `skippingOtherAccount` shows just before a `confirm()` and may be hidden by
  it.
- **Small things left from 30/09–01/10, not scheduled** (§11):
  `core/format.ts`'s `TIME_FACTORS` makes a month 2,520,000 s (29.17 days)
  where the game's is 30 days — every "M" the scripts print is off by about
  3%; not fixed, out of scope. Discounts round with `Math.round`; one point of
  the old wiki (64 × 0.98 = 62.72 shown as 62) hints the game floors — not
  checked. A building past level 50 shows cost 0 and so reads as upgradable.
  The Crawl Building button is still in the panel. No test in the repo covers
  the time table, `isMaxLevel` or the 50% cap (checked with throwaway runs,
  §11).
- **Small things left from 02/10, not scheduled** (§13): display strings
  outside §2.D's list — Transport Settings' table still shows the resource
  id (`glass`), and the Auto Wine dialog writes `"—"` and `"h"` inline. A
  scan that falls back to walking (model unreadable) stops at the first
  switch now that a switch reloads.
- **Small things left from 03/10, not scheduled** (§14): Space toggles
  BOTH boards at once — both scripts bind it, as before. Whether the game
  rounds construction times or floors them is not measured; `Math.round`
  was the user's "round to the second". The buff field exists only for an
  account with a row in the table (the current one gets it at startup).
  The board knows a town's Forge level only once it has that town's
  buildings. The menu entry has only been proven harmless as a console
  one-liner, not as built code; its icon
  (`cdn/all/both/minimized/transport.png`) and its slide-out CSS (which
  relies on `#container #leftMenu .slot_menu`, like IkaEasy's; `#leftMenu`
  itself has never been captured) have not been seen live.
- **Small things left from 03/10, later** (§15): the first Bug Report press
  after this build saves the old records and clears them, so only the
  second press shows fresh ones. Pressing it clears the bugs whether or not
  the player keeps the file. The shipment form capture keys on
  `#textfield_wine`; if the game renamed that field, `present` stays false
  with the form on screen — `visibleControls` would still list the new
  fields, so read those before concluding the form is absent. The Bug
  Report toast reports on both captures every time, even on pages where
  the form cannot exist.
- **Two tabs of one account take turns holding the runner lock.** The
  keep-alive reloads the holder, the waiting tab is granted the lock, and
  the reloaded page waits. Only one drives at any moment, which is the
  point; it just looks odd in the logs (`This tab now runs the task queue…`
  alternating between tabs).
- **Tests that mock `@core/logger` must keep its real exports** (`vi.mock(...,
  async (importOriginal) => ({ ...(await importOriginal()), logInfo: ... }))`).
  The data export imports the logger's storage key, and a bare mock broke nine
  app tests with a confusing "no export defined" error.
- **`git apply` of a reverted patch brings CRLF back into the working tree** and
  prettier (which defaults to LF) then fails those files. This happens on every
  revert-to-prove-the-test round trip. Run `prettier --write` on just the files
  you touched — `npm run format` would sweep five files that were already dirty
  on this branch before any of this work.
- **(04/10, §19) Not verified, written down so nobody assumes it:**
  - **`Notification` inside Tampermonkey's sandbox.** Empire Overview runs
    `@grant unsafeWindow`; whether the page's `Notification` reaches it is
    unknown. Ticking a board checkbox and getting "This browser cannot
    show notifications" would mean it does not.
  - **The arrival hook has no test** (`updateTransportComplete` in
    `models/movement.ts`): no test file covers movements, and creating one
    was not asked for.
  - **K's labels: where they sit, and whether they follow an upgrade without
    a reload.** The CSS (centred, cream badge) is a guess; the observer
    watches `document.body` because no capture shows the buildings' parent.
  - **E's response shapes** (the link format, `provideFeedback`'s `text`) —
    read from code (§2, "Added 04/10"). After a quick upgrade the game's
    header keeps the old resources until the next page change: the response
    is not applied by the game.
  - **The two scripts have no update channel at all** since R; the user has
    not decided on a public URL.

---

## 8. The 25/09 code-quality review round

The 25/09 code-quality review: 80 files changed and two new ones, committed as
`1983f45` (code) with this document and the plan in the commit after it. The
first 25/09 round is the six commits before those, listed in §1.

What was reviewed and why each finding was or was not fixed is
`improvement-plan.md` §2.D. By area:

| Area | What changed |
| ---- | ------------ |
| New files | `src/core/messages.ts` and `src/send-resources/messages.ts` — every user-facing string of those two areas, created with the user's approval |
| `core/` shared helpers | `parseGameNumber`, `errorMessage`, `formatInteger` and the `MS_PER_*` constants in `format.ts`; `escapeHtml` in `dom.ts`; `readAccountName` in `ikariam/globals.ts`; `empireKeyPrefix`/`EMPIRE_KEY_PATTERN` in `storage.ts`; new `SEL` entries for the change-city form and the loading indicator |
| `core/` fixes | `waitFor` keeps the predicate's last throw for its timeout message; `createWindow`'s `destroy()` removes its keydown listener; `TaskQueue` requires its key; the bug report reads the page window; `getCurrentTownName` reads text, not HTML |
| Dead code removed | `qsStrict`, `stringToNumber`, `readNumber`, `readText`, `promisify`, `formatFullTimeToDateString`, `ResponseEntry`, `parseCoords`, `empireStore`, `TaskQueue.shift/pop`, `capturePirate` and its selectors, the menu selectors, `PANEL_ID`, `registerAction`, `clearTownStats`, `wineWarningSummary`, a re-export each in `auto-wine.ts` and `diagnostics.ts`, and about 20 lines of commented-out code in Empire Overview — with their tests where they had any |
| Send Resources | strings moved to `messages.ts`; helpers above used instead of local copies; game data escaped in every dialog; hotkeys on `event.code`; CSS deduplicated; `any` casts in its tests replaced (`Object.assign(window, …)`, `vi.mocked`, `vi.stubGlobal`) |
| Empire Overview | placeholder names renamed; the 21 port headers name `legacy/Quản lý Ika Perseus -VN- V2.js`; toasts moved to `LanguageData`; `pageJQuery()` in `jquery.ts`; the town switch uses `waitFor`; the backup-lock guard removed (§5); unused imports gone |
| Tests | every logger mock keeps the real exports; `core/data-transfer.test.ts` checks every storage key is classified; `game-api.test.ts` advances timers asynchronously; 449 tests in 34 files, down from 452 because the removed functions' tests went with them |

`.gitignore` is modified and `docs/So_sanh_2_script_Ikariam.md` is untracked;
both were so before either 25/09 round — not part of this work, and left out
of every commit.

Per §7, grep `dist/` before believing a fix reached the bundle. (The note
that stood here said `dist/` predated this review; it has been rebuilt since
— see §1.)

---

## 9. The 26–28/09 round: Auto Build on a second account

Each fix had its test written first and seen red against the code before it
(§3). Bugs 1–4 are committed as `453482b` (8 files); bugs 5–6 as `24061f0`
(6 files). The plan has the same table in Vietnamese, §2.E.

Bugs 1–4:

| Reported by the user | Cause | Fix | Where |
| -------------------- | ----- | --- | ----- |
| Every Auto Build task fails `Town "S-Clone1" not found`; the run queue empties, the build list stays | The dropdown's `title` carries coordinates on this account (§2) | Names from the model by city id (`modelCityName`); the board's form switch waits for the same name | `core/ikariam/model.ts`, `send-resources/navigation.ts`, `empire-overview/game-api.ts` |
| Page reloads without end once everything is built; button stuck on "Stop Timer" | Drain reloaded, the next load re-queued nothing, drained at once and reloaded; `isAutoReload` was written but never read | Restore the original's guard; turn Build's timer off when the list is empty | `send-resources/app.ts`, `features/auto-build.ts` |
| Start Timer (Build) keeps opening the Transport panel | `closeGamePopup` clicked the first `.close`, the hidden transport panel's (§2) | Click only a displayed `.close` | `send-resources/navigation.ts` |
| Page reloads every 1–2 s, even after Stop Timer | `gotoTown` sent `#changeCityForm` first, which reloaded without landing; the flag had not actually been cleared | Board town name first, form second, dropdown last | `send-resources/navigation.ts` |

Along the way `gotoTown` gained the form route itself (it had none), and
`switchTown` was split into `clickBoardTownName` and `clickDropdownTown`.
Tests: `navigation.test.ts` (coordinates, the form, the board-first order,
`closeGamePopup`), `game-api.test.ts` (the board's switch with coordinates),
`app.test.ts` ("Auto Build after the queue runs dry", two loads in a row).

**Seen working live:** the coordinates fix (the next log upgraded towns and
emptied the build list), and the drain guard ("queue build tạm ok").
**Not seen live yet:** the transport-panel fix and the board-first switch —
the user's next reports were about other symptoms, not these.

Bugs 5–6, 27/09, committed as `24061f0`:

| Reported by the user | Cause | Fix | Where |
| -------------------- | ----- | --- | ----- |
| A board button opens the right dialog in the current town; for another town it only lands in that town | The form switch reloads the page (§2), and the wait that opens the view dies with the old page | Save the view in `sessionStorage` before switching; `openPendingView()` opens it on the new page (§5) | `empire-overview/game-api.ts`, `empire-overview/main.ts` |
| `Upgrade button points at position 4, expected 23 - ignoring`, then "not enough resources?" with enough resources | The first `#js_buildingUpgradeButton` seen was the previous building's, still on screen | Wait for the button of this slot (§5) | `send-resources/features/auto-build.ts` |

Tests: `game-api.test.ts` "a view asked for across a switch that reloads the
page" (opens after the reload, not twice, not for another town, not when
stale — red because the function did not exist, a weak red; the first one
still pins the behaviour the old code could not have), `startup.test.ts`
(boot opens a pending view — red until `main.ts` called it),
`auto-build.test.ts` (slot 5's button replaces slot 1's 700 ms after the
slot is clicked). The first version of that last test was GREEN against the
old code: its swap was timed from the start of the test, and had already
happened by the time the handler looked. Timing it from the slot click is
what made it red — §3's "run the revert before believing a green test", again.

Neither is seen live yet.

---

## 10. The 28–29/09 rounds: Auto Build laps, four plan items, two dialogs

Committed as `1f7c0e7` (docs in `4841fb9`), pushed; none seen on the live
game; `dist/` has all of it (§1). The
decisions behind each are in §5 ("Added 28–29/09"); the full write-ups, in
Vietnamese, are `improvement-plan.md` §2.F, §2.G and §2.H. Every new or
changed test was seen red against the code before it (the round trip is in
§4). 463 → 481 tests.

| Round | What | Files |
| ----- | ---- | ----- |
| §2.F Auto Build laps | One task per town, first saved upgrade, board order; `endTownTurn` instead of `defer`; a reload mid-lap carries on | `features/auto-build.ts` (+ test), `app.ts` (+ test) |
| §2.F `needingShip` | `getPerShipCapacity()` instead of 520 — **no test** (the file has none; creating one was not asked for) | `features/barbarian.ts` |
| §2.G H — cross-tab lock | `TabLock` (Web Locks), `TaskRunner` option `canRun`, `startRunner`/`stopRunner` | `core/task-queue.ts` (+ test), `app.ts` |
| §2.G D — full store | `capped` class at `current >= capacity`, striped CSS | `empire-overview/render.ts`, `helpers.ts`, `startup.test.ts` |
| §2.G 2.4 — footer counters | `… — Idle ships M + F freighters · AP N` from the header | `ui/panel.ts` (+ test), `messages.ts` |
| §2.G C — who reloads | `backToCity(reason)` at six call sites | `navigation.ts` (+ test), `app.ts`, `features/auto-build.ts`, `features/send-resources.ts`, `features/summary-account.ts` |
| §2.H Save | Auto Build Settings' "Run queue" → Save (closes the dialog); `build.enqueue` removed | `ui/dialogs.ts`, `app.ts` (+ test), `messages.ts` |
| §2.H amounts | Transport Settings: five integer fields, one queued row per filled field | `ui/dialogs.ts`, `app.ts` (+ test), `messages.ts` |

Two tests needed more than the obvious to go red or green:

- **The D test had to feed the board a response.** Setting
  `ikariam.model.currentResources` before boot does nothing: the board's
  stock comes from `updateGlobalData` responses (`events("ajaxResponse")` →
  `updateCityData`), so the test publishes one with `headerData` carrying
  the stock, as the malformed-entry test in the same file does. A town with
  no warehouse gets the town hall's 2500 as its cap.
- **The cross-tab test uses a fake `LockManager`** (`fakeLockManager` in
  `task-queue.test.ts`) that grants one holder per name and queues the rest,
  because happy-dom's `navigator.locks` is `null` — which is also why every
  other test sees the lock granted at once and was unaffected.

What to try on the game is listed at the end of each plan section. The one
that matters most: a log from `SClone1` showing each lap reaching all three
towns (§6).

---

## 11. The 30/09–01/10 round: building data from the game (plan U, V)

Committed as `6ed66c6` (the crawl button) and `c38dca4` (the data and the
cap), docs in `b9f1d7a`; not pushed; none tried on the game; `dist/` has all
of it (§1). The plan's write-up, in Vietnamese: §4.2, "Ghi chú về U" and
"Ghi chú về V". Measured facts are in §2 ("Added 30/09–01/10"), decisions in
§5.

How it went, because the route matters for whoever continues:

1. The user wanted formulas instead of the tables (U). The wiki pages the
   user saved turned out to be out of date against the game.
2. From one in-game table (Academy), exact formulas were fitted: wood
   `floor(5·L·e^(0.292757·L)) + 28` (50/50 levels), crystal
   `floor(5·L·e^(0.32156·L)) + 100` (46/46), time
   `floor(105·L·e^(k·L)) − 98`, k ≈ 0.15617. **The user stopped this and chose
   the game's tables.** The formulas are recorded in case levels past 50 ever
   need extrapolating.
3. The game's Help > building details dialog has every building. A temporary
   **Crawl Building** button (`send-resources/features/building-help-crawler.ts`,
   Data group) saves the building on screen to JSON; the user walked all 33 by
   hand and saved them to `docs/wiki/`.
4. `Constant.BuildingData` was regenerated by a script in the session's
   scratchpad (not in the repo) from those files' `contentHtml`. Only that
   block of `constants.ts` changed; the one comment in it (`//time is not
   correct`, above `marineChartArchive`) went with the old time formula.

| What | Where | Note |
| ---- | ----- | ---- |
| Costs for levels 1–50 (1–30), base figures | `constants.ts` `BuildingData.*.wood/wine/marble/glass/sulfur` | crystal is `glass`; index = current level (`[L − 1]` is the cost of level L) |
| Time as seconds per level | `BuildingData.*.time`; `getUpgradeCost` reads `time[level] \|\| 0` | was `{a, b, c, d}` and a formula |
| Effect tables | `academy.maxScientists`, `warehouse/dump.capacity`, `tavern.wineUse/basicBonus/wineBonus`, `museum.basicBonus`, `port.loadingSpeed` | each at the index the code already reads; `tavern.wineUse2` (s202) and `townHall.actionPointsMax` untouched — no game column |
| Logical `maxLevel` | reduction buildings 50, production buildings 70, palace 20, blackMarket 25, shrineOfOlympus 21, others 0 | blackMarket and shrine come from their tables (tax floor, "Blessed Cities"), not from text — the user was told |
| `isMaxLevel` | `models/building.ts` | `maxLevel > 0 && level >= maxLevel` |
| `\|\| 0` for levels past the table | `models/city.ts`: warehouse/depot capacity, museum and tavern `basicBonus` | would be `NaN` otherwise |
| 50% cap on reduction buildings | `REDUCTION_BUILDING_MAX_PERCENT` (`core/ikariam/model.ts`); `getUpgradeCost`; `modelWineConsumption`; `winePressSavingPercent` in `city.ts` (three callers) | was `level/100` with no cap, `Math.min(100, …)` in core |

**The reduction buildings' scope, from the user:** Carpenter (wood) —
building, units, ships; Architect (marble) — building; Optician (crystal) —
building, units, ships, Workshop improvements, Academy experiments; Firework
Test Area (sulfur) — building, units, ships; Wine Press (wine) — building,
units, tavern. The code computes only building costs and tavern wine; it has
no resource costs for units, ships, improvements or experiments
(`Constant.UnitData` carries `baseTime` and `baseCost` only). Adding any of
those later means applying the same cap.

**Checked, and how.** Typecheck clean; 34 files, 500 tests. The crawler was
run against `sample/wiki/town-hall.html` and its 50 rows matched the page;
the Academy file matched the fitted formula at every level. The discount was
run on a real `Building` with the new Academy data: 1.00 / 0.86 (three
researches) / 0.76 (Carpenter 10) / 0.36 (Carpenter 50) / 0.36 (Carpenter 60).
These were throwaway vitest runs from the scratchpad with their own config;
**no test was added to the repo**, and none was proven red (§3). The user did
not ask for tests.

**Two traps from this round:**

- **Vite cannot run a test file on another drive than its root** (root on
  `D:`, file on `C:` gave `Cannot find module '/@id/D:/C:/…'`). For a
  throwaway check from the scratchpad, make the scratchpad the root and import
  the repo by absolute path; `vitest/config` does not resolve from there, so
  export a plain object with `globals: true`.
- **An effect cell's short figure is not the figure.** The first crawl
  captured "11.81M" for a warehouse; the exact one was in the cell's `title`.
  The button reads it (in `6ed66c6`).

**What to try on the game:** the Build tab's tooltips and "+" marks against
the game's own upgrade costs in a town with a reduction building; a building
at or past its logical `maxLevel` (greyed, still clickable); storage totals
and tavern satisfaction unchanged for levels ≤ 50.

---

## 12. The 02/10 round: one-row ↑/↓, and Auto Wine's Start does it all

Committed as `4f9436c` together with §13 (docs in `3209964`); not pushed;
not in `dist/`; not tried on the game. The plan's write-up, in
Vietnamese, is §2.K; the decisions are in §5 ("Added 02/10"). 500 → 515
tests, typecheck and prettier clean.

| What | Where |
| ---- | ----- |
| `TaskQueue.moveOneStep(id, direction, withinType?)` | `core/task-queue.ts` |
| `moveButtons()` — the ↑/↓ pair, first ↑ and last ↓ `disabled`; `MOVE_BUTTON` tooltips; `.ika-move:disabled` | `ui/actions.ts`, `messages.ts`, `ui/styles.ts` |
| Queue view ↑/↓ (`queue.moveUp/moveDown`) | `ui/queue-view.ts`, `app.ts` |
| Transport Settings ↑/↓ (`send.moveUp/moveDown`), a sixth, empty column | `ui/dialogs.ts`, `app.ts`, `messages.ts` |
| Auto Build Settings ↑/↓ (`build.moveUp/moveDown`), `moveBuildingInQueue` | `ui/dialogs.ts`, `features/auto-build.ts`, `app.ts` |
| `scanBuildings` resolves `true` when it finished, `false` when it refused | `features/auto-build.ts` |
| `saveMeasuredReceivers` — what Load then Save would store, without the dialog | `features/auto-wine.ts` |
| Start → `wine.autoRun` (`runAutoWine`); popup → `wine.autoRunFrom`; Save → queues (`wine.queueFrom` from its popup). `wine.chooseSource` and `wine.start` are gone; `startWineRun` is `queueWineRun` | `app.ts`, `ui/panel.ts`, `ui/dialogs.ts` (`openWineSourceDialog(onChosen)`) |

**How the Start test proves the order.** `app.test.ts` mocks
`scanBuildings` (hoisted, so the same mock survives `vi.resetModules()`), and
the mock *draws the board* when called. The saved receivers can only carry
the board's figures if Load ran after the scan. Moving
`saveMeasuredReceivers()` above the scan turns that test red; so does
dropping `withinType` from Transport Settings' ↑/↓ for its test — both seen
with the round trip in §4. The rest is new code, with no old version to see
red against.

**Known, not measured:**

- The scan's fresh figures reach Auto Wine only through the Empire Overview
  board: Send Resources does not record fetched responses in its town cache.
  Without the board, Start plans on the old cache.
- The board's events are synchronous, but whether its DOM is redrawn before
  Load reads it has not been seen live.
- A scan that falls back to walking ends in `backToCity`, which can reload
  the page; the rest of Start then never runs.
- Shipping is still broken (§0, plan §2.A), and Start now switches the
  Transport timer on by itself.

**What to try on the game:** ↑/↓ in all three places, one row per press;
Start with one source → "Sync finished" toast, wine shipments queued,
Transport's button reads "Stop Timer"; Save in Auto Wine Settings → wine
shipments queued, timer still off.

---

## 13. The later 02/10 round: stock, zero amounts, runner per timer, strings, 1.4

Committed as `4f9436c` together with §12 (docs in `3209964`); not pushed;
not in `dist/`; not tried on the game. The plan's write-up, in
Vietnamese, is §2.L (five parts); the measured facts are in §2 ("Added
02/10"), the decisions in §5 ("Added 02/10, later"). 515 → 537 tests,
typecheck and prettier clean.

| Part | What | Where |
| ---- | ---- | ----- |
| 1 | `readCurrentStock(resource)` (model, then `SEL.globalMenu.resource`, else 0). In `handleSendResource`, `available = stock − reserve`; short of the task and of one ship → `defer`. A `tooLittle(merchantsIdle)` closure runs before navigating and again at the form, before anything is entered | `game-state.ts`, `core/ikariam/selectors.ts`, `features/send-resources.ts` |
| 2 | `readSendForm`: an empty field or one of digits worth 0 is skipped; anything else not all digits is invalid | `ui/dialogs.ts`, `messages.ts` |
| 3 | `TaskRunnerOptions.allowsType`; `allowedTasks()` feeds `nextTask` and the defer-cooldown count. `app.ts`: `allowsTaskType`, `oneOffRunTypes` (Build's Start), `syncRunnerToFlags` also wants the runner for a one-off run, `onDrain` clears it | `core/task-queue.ts`, `app.ts` |
| 4 | `RESOURCE_LABEL`, `DURATION`, `resourceLabel()`; `RESOURCE_OPTIONS` built from the labels; `describeTask` shows labels; `listBuildingsInCurrentTown` parses `Name (N)` and takes a non-number as 0 | `messages.ts`, `types.ts`, `features/wine-warning.ts`, `ui/queue-view.ts`, `features/auto-build.ts` |
| 5 | `gotoTown`: form → board → dropdown; `ika_pendingTownSwitch` in `sessionStorage`, `SWITCH_LANDING_WINDOW_MS` = 30 s, cleared on arrival | `navigation.ts` |

**Every part was seen red.** For each, the fix was broken on purpose — a
string replaced in the source from PowerShell, the file copied to the
scratchpad first and copied back after — and the matching tests failed:
part 1's three stock tests against `HEAD`'s handler and its two freighter
tests with the threshold forced to one merchant ship; part 2's two against
the old parsing; part 3's three, one per removed piece (`allowsType`, the
one-off lap, the cooldown count); part 4's building-name test (the old code
gives `"Museum Đang xây NaN"`); part 5's form-first and loop-guard tests.
Test "ships an order smaller than one ship when the stock covers it" is
green on the old code on purpose: it pins that the new rule does not
over-block.

**How 1.4 was settled, for whoever doubts it.** Two console probes, written
to `sessionStorage` so they survive the reload: the first hooked
`HTMLFormElement.prototype.submit`, the `submit` event, `beforeunload` and
`jQuery(document).ajaxSend`; the second logged `ajaxComplete` with the
response's entry names. Both runs (scripts off and on) showed one ajax
request and an unload ~0.3 s later; the response was the `reload` in §2.

**Known, not measured:**

- Each town switch now costs a page load; an Auto Build lap over many towns
  reloads as many times. The board's name route is assumed to reload too.
- Whether the runner picks the task up again after a switch's reload has not
  been seen live. The log should read `Going to town X`, a reload, then the
  task carrying on in X.
- With only freighters idle, a small town waits for ~50,000 in stock or a
  merchant ship to come home.
- Shipping as a whole is still broken (§0, plan §2.A).

**What to try on the game:** a queued amount above a town's stock, under one
ship → the log names the shortfall, nothing ships; Transport Settings with
0s → no error; Build's Start Timer alone with a shipment queued → it stays;
the queue shows "Wine"/"Crystal"; an Auto Build lap that switches town
through the form, one reload per town, without looping.

---

## 14. The 03/10 round: the menu entry, the window's open state, build times

Committed as `7ed3a85` (docs in `b45f792`); not pushed; in `dist/` since the
03/10 22:54 build; not tried on the game as built code (part 1's cause was
measured with console one-liners). The plan's
write-up, in Vietnamese, is §2.M (three parts); the measured facts are in §2
("Added 03/10"), the decisions in §5 ("Added 03/10"). 537 → 560 tests,
typecheck (both configs) and prettier clean.

| Part | What | Where |
| ---- | ---- | ----- |
| 1 | Left-menu entry like Empire Overview's, **without `expandable`**: `<li class="slot<li count> ika-send-menu">` appended to `.menu_slots`, icon `MENU_ENTRY_ICON`, click toggles the window; IkaEasy's slide-out CSS (`menuEntryStyles`); the fixed corner button only when there is no `.menu_slots`; `SEL.menuSlots` added back | `send-resources/ui/panel.ts`, `core/ikariam/selectors.ts` |
| 2 | `createWindow({ rememberOpen, openByDefault })`; the panel passes both. Stored as `ikaWindowOpen_<id>` in the account store | `core/ui/window.ts`, `send-resources/ui/panel.ts` |
| 3 | "Build time -%" column in the account table: the figure as text (`BUILD_TIME_BUFF_VALUE_CLASS`) + ✎; ✎ → a text field (`BUILD_TIME_BUFF_CLASS`) + ✓; ✓ → `setBuildTimeBuff`, field removed, redraw (`editBuildTimeBuff`, `saveBuildTimeBuff`, actions `account.editBuildTimeBuff`/`account.saveBuildTimeBuff`); no 10 s redraw while a field is open. `accountBuildTimeBuff` + `ACCOUNT_LIST_KEY` in core; `getUpgradeCost`'s time with the buff, `CHRONOS_FORGE_TIME_FACTOR_PER_LEVEL` and `Math.round` to the second | `send-resources/features/summary-account.ts`, `app.ts`, `messages.ts`, `types.ts`, `state.ts`; `core/storage.ts`; `empire-overview/models/building.ts` |

**How part 1 went.** The old Send Resources entry is in
`git show 85f8246:src/send-resources/ui/panel.ts` (`buildLauncher`);
`d41fe28` removed it. Read against Empire Overview's, it differed four
ways at once: no `slotNN` (then `slot98`, still broken), its own image
class, appended at the END of the `ul` after `slot99`, and inserted later
(in `start()`, not at module evaluation). The game's `cityMenu.update` is
not in the repo, so a read-only probe for it was written (plan §2.M part 1)
— and never needed. Two things found while looking settled the direction:
`tools/output/output5.json` shows the game's own "Transport" entry with no
`slotNN`, and IkaEasy V4 adds several entries to the same menu with
`slot<index> ikaeasy_slot` and no `expandable` (`js/utils.js`,
`addToLeftMenu`; template `tpl/utils-leftSlot.ejs`; CSS in
`css/ikaeasy.css`). Three one-liners (§2) then showed `expandable` is the
cause. The entry was built in the shape of the one that worked.

**Tests, and which were seen red.**

- `panel.test.ts`: the 25/09 REGRESSION test ("adds nothing to the game's
  menu") and "always a fixed button" are replaced by four: the entry has no
  `expandable`, is `slot2` after the fixture's two game entries, which stay
  untouched and first; no fixed button with the menu; a fixed button
  without it; the entry toggles the window. Putting `expandable` back on
  the entry turns the REGRESSION test **red**. Also 1 new and 4 changed
  for part 2 (they assumed the window always starts closed; the toggle
  test now clicks the menu entry).
- `window.test.ts` (4): part 2, new code.
- `building.test.ts` (7, `describe("Building.getUpgradeCost time")`):
  the file now builds the avatar bar BEFORE importing `./building`,
  because `empire.ts` reads the account name at module evaluation, and
  stubs `database._globalData` (government + research). Against `HEAD`'s
  `building.ts` the buff, Forge and combined tests went red; with
  `Math.round` removed, four went red. The plain-table, bad-buff and
  Forge-on-itself tests are green on the old code on purpose: they pin that
  the change does not over-apply.
- `storage.test.ts` (3): new code.
- `app.test.ts` (6, "the account table's build time buff"): text until ✎;
  ✓ saves and shows text again; nothing saved without ✓ (even on a
  `change` event); refused figures keep the field open; empty → 0; the
  10 s redraw leaves an open field alone. `app.test.ts` mocks the action
  dispatcher, so the tests press a button by calling the action it carries
  (`actions[button.dataset.ikaAction](button)`). Listeners from earlier
  tests' `start()` stay on the shared document (§4), so the toast is
  asserted with `toHaveBeenCalledWith`, never a count. New behaviour, no
  old version to see red against — but "✓ then text again" was red on its
  first run for a real reason: `renderSummary` saw the still-open field and
  skipped the redraw. ✓ now removes the field first.

**Two traps from this round:**

- An `<input type="number">` sanitises "abc" to `""` in happy-dom as in a
  browser, so a "refuses letters" test read the stored buff as 0. The
  field is text (§5).
- A redraw guard keyed on "a field is open" also blocks the redraw that is
  meant to close it. Close first, then redraw.

**What to try on the game:** a manual shipment with the new menu entry on
the page → the header updates (the one check that matters most here); the
entry's icon and its slide-out on hover; ✎ → a buff → ✓ in the account
table, then the board's Build-tab time tooltip against the game's own
upgrade time in a town with a Chronos' Forge and one without; upgrading the
Forge itself (no reduction); reload with the Send Resources window open,
then closed.

---

## 15. The later 03/10 round: Bug Report saves a file, `createPopup`, `[name, null]`

**Not committed**; in `dist/` (03/10 22:54, grepped — §1); not tried on
the game in its final form (the 14:10 report came from an in-between
build that already saved a file and carried `gameData`). The plan's
write-up, in Vietnamese, is §2.N (four parts); the facts are in §2 ("Added
03/10, later"), the decisions in §5 ("Added 03/10, later"), the open
M-Eretria problem in §6. 560 → 567 tests, typecheck (both configs) and
prettier clean.

| What | Where |
| ---- | ----- |
| `bug.report` always saves `ikariam-bug-report-<account>-<UTC time>.json` through `downloadJson`, then `clearBugs()`; the toast names the file, the count, and whether each capture was there (`BUG_REPORT.saved`) | `send-resources/app.ts` (`BUG_REPORT_FILE_PREFIX`), `ui/data-transfer-ui.ts` (`timestampedFilename(account, prefix)`), `messages.ts` |
| `captureGameData` (`shipmentForm`, `createPopupSource`, each in its own `try`), `exportFullBugReport` → `{ text, shipmentFormCaptured, createPopupCaptured }`; `OWN_CONTROLS` keeps the script's own window, launcher and dialogs out of `visibleControls`; `ikaBugReport()` returns the full text | `send-resources/diagnostics.ts` |
| `IkariamPageApi.createPopup(id, title, content, popupType?, className?)`, documented from the game's source; `openPopup` passes `null, null` | `core/ikariam/globals.ts`, `send-resources/ui/dialogs.ts` |
| `[string, null]` response entries skipped without `reportBug` | `empire-overview/game-api.ts` |

**How it went.** The user asked for the Bug Report button to collect the
data the plan waits on instead of typing console commands. Two pasted
reports then arrived cut at 50,000 characters — the end, where `gameData`
sits, lost — and full of one repeating error (§6), so the button moved to
saving a file, then to clearing the recorded bugs after saving. The first
saved file held exactly one bug (the `[name, null]` false positive) and the
`createPopup` source, which closed §2.D. The shipment form was not in it:
the button was pressed on the city view.

**Tests, and which were seen red.**

- `app.test.ts`, "Bug Report" (6): file name and toast; saves with no bug,
  `createPopupSource` present, form reported missing; form captured with
  exactly the game's three controls (a hidden control and the panel's
  buttons left out); `createPopup` unreadable; `ikaBugReport()`; cleared
  after saving and empty the next time. `downloadJson` is captured by a
  partial mock of `./ui/data-transfer-ui` (hoisted, like `showToast`).
  happy-dom gives ordinary elements a non-null `offsetParent`, so the
  hidden control states `offsetParent: null` itself. Red against `HEAD`'s
  `app.ts` (4), without `clearBugs()` (1), without `OWN_CONTROLS` (1).
- `app.test.ts`, "Start asks which source…": `createPopup`'s fourth and
  fifth arguments are `null, null`; red with `"???", "class"`.
- `startup.test.ts` (1): `popupData` and `ingameCounterData` as `null` make
  no "Malformed" record and the good entry still runs; red with the new
  branch disabled. The older REGRESSION test (`["updateBackgroundData"]` is
  still recorded) stays green.

**One trap from this round:** a message that embeds a changing number
(`sent ${secondsAgo}s ago`) defeats the bug reporter's deduplication, which
keys on the message. One fault became dozens of records, pushed everything
else out of the 50-record buffer, and made the report too long to paste.
Put variable figures in the context object, not in the message — the
"did not land" message still does this (offered, not taken yet).

**What to try on the game:** press Bug Report on the Trading Port's
shipment form ("Transport goods", not sent) and put the file in
`tools/output/` — that is §2.A's missing capture; open a settings dialog
(it should look as before); switch town and check the next report has no
"Malformed ajaxResponse entry".

---

## 16. The 03–04/10 rounds: the runner's console, the trading port, seven small items

**Committed 04/10 as `32fe3ba` (docs `ec3fdc4`)**; in `dist/` since the 04/10 09:09 build; tried on the game
by the user the same day — "roughly ok" (§17). The plan's
write-ups, in Vietnamese, are §2.O (four parts) and §2.P (seven items); the
facts are in §2 ("Added 03–04/10"), the decisions in §5 ("Added 03–04/10"),
the still-open M-Eretria switch in §6. 567 → 578 tests, typecheck (both
configs) clean, prettier clean on every file touched.

| What | Where |
| ---- | ----- |
| `writeToConsole`; the runner, `logInfo`, and the `console.warn`s of `bug-report`, `storage`, `ship-capacity`, `ui/actions` use it | `core/logger.ts`, `core/task-queue.ts`, the four files |
| "did not land" without the seconds; the seconds logged before the throw | `send-resources/navigation.ts` |
| `log` in the saved report: `recentLogLines(200)` | `core/logger.ts`, `send-resources/diagnostics.ts` |
| `openShipmentForm`, `townHasPort`; `handleSendResource` uses them and waits for the form to close after the submit; `SEL.shipmentForm`, `SEL.shipmentDestination`; `dockCities`, `cityPositionLink`, `openPort`, `clickDestinationTown`, `adjustDestinationIndex` deleted | `send-resources/navigation.ts`, `features/send-resources.ts`, `core/ikariam/selectors.ts` |
| Labels and `DURATION.hoursToTenths` in the dialogs; Close button removed | `send-resources/ui/dialogs.ts`, `messages.ts` |
| `needingShip` with `Math.ceil` | `send-resources/features/barbarian.ts` |
| Month = 2,592,000 s | `core/format.ts`, `empire-overview/utils.ts` |
| `TaskRunner.currentTaskId`; `setCurrentTaskSource`, `currentTask` in the queue view; `describeCurrentTransfer(task)` | `core/task-queue.ts`, `send-resources/ui/queue-view.ts`, `app.ts`, `features/send-resources.ts` |
| `wineWarnedCityIds` | `empire-overview/render.ts` |
| Space removed from `registerHotkeys`; the launcher calls `togglePanel` | `send-resources/app.ts`, `ui/panel.ts` |

**How it went.** Two Bug Report files (03/10 23:04 and 23:06) arrived. The
second held `console.error is not a function` at `TaskRunner.tick` — the
reason a failing task never reached the five-throw limit; the first held
the shipment form, which unblocked §2.A. The user chose all four follow-ups
(safe console, no seconds in the message, log in the report, the port),
then the list of small items, with two questions settled first: "Warning
wine" once per town until it clears, and Space for Empire Overview only.

**Tests, and which were seen red** (each fix broken on purpose, the matching
test run, the file restored — §4's round trip):

- `task-queue.test.ts`: the runner still drops a task with
  `console.error` undefined — red with `console.error(e)` back. Four tests
  for `currentTaskId` (stopped, running, past a `retry`, past a type
  `allowsType` refuses).
- `navigation.test.ts`: the same message at 2 s and 17 s — red with the
  seconds back. `townHasPort` (3) and `openShipmentForm` (4) replace 9 old
  tests of the deleted functions.
- `send-resources.test.ts`: the fake game now opens the form through
  `ajaxHandlerCall`, with the hidden `destinationCityId`; one new test (no
  port → `defer`). Against `HEAD`'s `send-resources.ts`, `navigation.ts`
  and `selectors.ts`, 8 of 13 red — every test that reaches the form.
- `app.test.ts`: the report's `log` (200 newest of 250 — new, no old
  version); "Crystal" in the Transport Settings table — red with the raw id;
  Space leaves the window alone — red with a Space case added back.
- `format.test.ts`: 30 days is "1M", 29 days 5 hours is "29D 5h" — red with
  2,520,000. Compared after `trim()`: the formatter pads trailing zero units,
  as the original did.
- `queue-view.test.ts`: ▶ follows the source, none for `null` — red with
  `queue.head()` back.
- `startup.test.ts`: one toast across refreshes, a second after the town
  went above the threshold and back — red with the guard disabled. The
  `renderWine` helper now clears toasts before the response and counts all
  of them: the old helper cleared them between two draws, so it depended on
  the toast repeating.
- No test for the Close button or `needingShip` (`barbarian.ts` has no test
  file; creating one was not asked for).

**Two traps from this round:**

- **A console call can be the bug.** On the game's page `console.error` is
  undefined, and a call to it inside a `catch` silently disabled everything
  after it. Never call `console.*` directly from code that runs in the
  page; use `writeToConsole`.
- **Read the installed build, not the `dist/` build.** A report from the
  browser reflected an older install than the latest `dist/`; two "still
  broken" findings were already fixed in `dist/`.

**What to try on the game** (after building and reinstalling both
userscripts): a small shipment through Transport Settings and Transport's
Start Timer — it should reach the right town and log `Sent N …`; Auto Build
with a failing switch should give up after five throws instead of every
second for ever; a Bug Report file should carry `log`; the Barbarian
Village ship count; "1M" in long upgrade times; the ▶ while a shipment
waits for ships; "Warning wine" once; Space toggling the Empire board only.

---

## 17. 04/10: the user's test on the game, ten-row lists, Close is back

The plan's write-ups, in Vietnamese, are §2.Q (the test) and §2.R (the
changes); the decisions are in §5 ("Added 04/10").

**The test.** The user was sent the "try on the game" list, grouped: the
port (§16), the runner dropping a failing task, the menu entry and the
build times (§14), §16's small items, every older list — the 26–28/09
round's bugs 3–6, the 28–29/09 rounds, the 29/09 evening round, both 02/10
rounds — and the building figures (U/V). Built at 04/10 09:09, which holds
everything up to §16. The verdict, for that list and for the M-Eretria
switch: **"cả 2 tạm ok" — both roughly ok.** No Bug Report file, no log
and no per-item results came with it, so nothing here counts as measured:
the specific risks written down item by item (the board's scrolling tabs,
`townHasPort` and a shipyard under construction, …) keep their open
status. The M-Eretria switch did not come back; its cause was never found.

**The changes** — committed 04/10 as `32fe3ba` (docs `ec3fdc4`); in
`dist/` (04/10 09:44, grepped); not tried on the game. 578 → 583 tests, typecheck (both configs) and prettier
clean.

| What | Where |
| ---- | ----- |
| `capVisibleRows(box, rowSelector, count)`: `max-height` to the bottom of row `count`, `overflow-y: auto`; no cap at or under `count` rows; a box with no layout keeps its cap; `scrollTop` kept | `core/dom.ts` |
| Queue: the table inside `div.ika-queue-scroll`, capped after every redraw (`tr[data-ika-queue-id]`, `VISIBLE_ROWS` = 10, exported) | `send-resources/ui/queue-view.ts` |
| Transport Settings: the table inside `div#resourceTableScroll`, capped in `renderResourceTable` (`#resourceTableBody > tr`) | `send-resources/ui/dialogs.ts` |
| Auto Build Settings: Close (`dialog.close`) back after Save | `send-resources/ui/dialogs.ts` |

**Tests, and which were seen red.** happy-dom has no layout, so the tests
give every row 20 px by stubbing `getBoundingClientRect` (and restore it).
`queue-view.test.ts` (3): twelve tasks → `220px` (header plus ten),
`overflow-y: auto`; ten → no cap; no layout → no meaningless height.
`app.test.ts` (2): Transport Settings with twelve shipments → `220px` (the
test imports `renderResourceTable` from the app's own module copy after
`startWith`); the Auto Build dialog's HTML has both `build.save` and
`dialog.close`. Red with the queue's cap call removed, with the table's
removed, and with the Close button removed — one test each.

**What to try on the game:** a queue of more than ten tasks — ten rows, then
a scroll bar; open the panel after the queue grew — capped within a few
seconds; Transport Settings with more than ten shipments — scrolls; Auto
Build Settings — Save and Close.

---

## 18. 04/10 midday: whole ships, wine drunk on the way, four small items

**Committed as `b2e9084`**, and the user's `barbarian.ts` change as
`3f8a51b`; in `dist/` (04/10 13:11); not tried on the game. The plan's
write-up, in Vietnamese, is §2.S; the decisions are in §5 ("Added 04/10,
midday").

| What | Where |
| ---- | ----- |
| S: `distributeWine(towns, supply, { shipCapacity })` rounds a share of one ship or more down to whole ships; `planWineRun` passes `getPerShipCapacity()` | `send-resources/features/wine-distribution.ts`, `features/auto-wine.ts` |
| T: `recordRouteTime` reads `#loadingTime` + `#journeyTime` before the submit; `parseDurationSeconds`; `KEY.routeTimes = "ikaRouteTimes"` per account (`recordRouteSeconds`, `routeSeconds`), exported as `measurements` | `features/send-resources.ts`, `core/format.ts`, `state.ts`, `core/data-transfer.ts` |
| T: `WineTown.transitHours`, `stockOnArrival`; `buildWineTowns(receivers, board, fromTown)` | `features/wine-distribution.ts`, `features/auto-wine.ts` |
| Status line names an upgrade (`describeCurrentTransfer`) | `features/send-resources.ts` |
| Only sea slot a building site and no form → `defer` (`townHasBuiltPort`, `seaSlotHas`) | `navigation.ts`, `features/send-resources.ts` |
| Header rows of the queue and Transport Settings' table `position: sticky` | `ui/styles.ts` |
| `togglePanel` redraws the queue when it opens | `ui/panel.ts` |
| Barbarian Village annotated with ships + 1 (`annotate(…, true)`) — the user's change | `features/barbarian.ts` |

**Tests:** the existing Auto Wine test now expects 31,500 — S's rounding.
The documents were not updated in this commit; §19's round did it.

**What to try on the game:** a receiving town that needs more than one
ship — whole ships go; after a few manual shipments between two towns,
Auto Wine gives the distant one more; a town upgrading its port — its
shipment waits instead of failing.

---

## 19. 04/10 afternoon: the user's answers, six plan items, levels past 50

**Not committed**; in `dist/` (04/10 13:11, grepped); **not tried on the
game.** The plan's write-ups, in Vietnamese, are §2.T (seven parts) and §2.U
(four); the decisions are in §5 ("Added 04/10, afternoon"); the facts in §2
("Added 04/10"); the loose ends in §7. 583 → 643 tests across §18 and §19
(605 once 2.6 and R were in), 35 files; typecheck and prettier clean on every file touched.

**How it went.** The user answered plan question 2 ("ok, do as proposed")
and question 3 ("do as proposed"), then said "continue" between items. Each
item was proposed with its options before it was built: K needed nothing;
O was explained and dropped; J and E each got a question with options, and
the user took the recommendation; for E the user added, mid-build, that it
must be tested thoroughly and checked against a Bug Report from the game;
2.8 turned out to be mostly present already, and the user took the small
option. Then the user supplied `docs/wiki/s303/` for item U, with the rule
"Constant stores the original time; s303's is after a −50% buff, so ×2";
the 14% on costs was found here and settled by a question.

| Item | What | Where |
| ---- | ---- | ----- |
| 2.6 | `announceSync`, `onSyncChange` (`ika:syncStarted` / `ika:syncFinished` on `document`); `syncAllTowns` wraps the refresh in them; `syncIndicatorHtml`, `SYNCING_CLASS`, the spin keyframes | `core/ikariam/http.ts`, `send-resources/features/sync-towns.ts`, `empire-overview/render.ts`, `main.ts`, `helpers.ts` |
| R | `CheckForUpdates`, `scriptId`, `scriptName`, the Update button, the `autoUpdates` checkbox and the "Global" group removed, with a "REMOVED (not in the original)" comment; the schema key kept | `empire-overview/empire.ts`, `render.ts`, `constants.ts` |
| K | `readBuildingSlot` (shared with the settings dialog), `showBuildingLevels`, `startBuildingLevelObserver`, `BUILDING_LEVEL_CLASS`; started in `app.start()` | `send-resources/features/auto-build.ts`, `ui/styles.ts`, `app.ts` |
| J | `notify`, `setNotificationEnabled`, `forgetNotification`, `ikaNotifications` / `ikaNotified`; `TaskRunner`'s `onTaskDropped`; `notifyLowWine`; the hooks in `completeUpgrade` and `updateTransportComplete`; the checkboxes in the board's Settings and the panel's "Notifications" group | `core/notifications.ts` (new), `core/task-queue.ts`, `core/messages.ts`, `core/data-transfer.ts`, `send-resources/features/wine-warning.ts`, `app.ts`, `ui/panel.ts`, `empire-overview/models/building.ts`, `models/movement.ts`, `render.ts` |
| E | `upgradeBuildingNow`, `findUpgradeLink`, `responseFeedback`, `quickUpgradeTraces` (`ikaQuickUpgradeTrace`); the ▲ button (`QUICK_UPGRADE_CLASS`), `cityBuildingOfCell`, `quickUpgrade`; `gameData.quickUpgrades` and its toast line in Bug Report | `core/ikariam/http.ts`, `empire-overview/render.ts`, `helpers.ts`, `send-resources/diagnostics.ts`, `messages.ts` |
| 2.8 | `getStockTip` in `dynamicTip`; `data-tooltip="dynamic"` on `span.current`; `stockTip_*` strings | `empire-overview/render.ts`, `constants.ts` |
| U | 704 levels appended to 28 buildings' tables (costs ÷ 0.86, time × 2, effects as shown); a comment on `BuildingData` naming both sources and the conversion | `empire-overview/constants.ts` |

**Tests, and which were seen red** (each fix broken on purpose, the matching
test run, the file restored):

- 2.6 — `http.test.ts` (the announcement crosses two module copies),
  `sync-towns.test.ts`, `startup.test.ts` (three marks; the class on and
  off). R — `startup.test.ts`: no Update button, no `autoUpdates` checkbox.
- K — `auto-build.test.ts` (3). Red: writing the label unconditionally
  makes the observer loop for ever — the test hangs rather than fails.
- J — `notifications.test.ts` (10), `task-queue.test.ts` (2),
  `wine-warning.test.ts` (2), `panel.test.ts` (3), `building.test.ts` (2).
  Red: the stale-event check, the de-duplication, the give-up callback, the
  untick on refusal, the wine reset — one each.
- E — `http.test.ts` (9), `startup.test.ts` (2), `app.test.ts` (2). Red: the
  upgradable condition, the button lock, the trace, a `#` link. **Two
  checks did not go red and both exposed dead code, now removed**: a
  `disabled` guard in the handler (a disabled button fires no click) and
  deleting `actionRequest`/`ajax` from the link (`ikariamRequest`
  overwrites them).
- 2.8 — `startup.test.ts` (1). Red: the hook, the gold exclusion, the
  attribute.
- U — `constants.test.ts` (2): Academy level 51 from s303, converted; level
  50 from s800, untouched. Beyond the tests, a one-off script checked all
  125 existing tables unchanged and all 704 new levels against the pages.

**Traps from this round:**

- **`app.test.ts` counts the app's timers exactly** (`vi.getTimerCount()`
  against `IDLE`/`RUNNING`). K's first observer coalesced with a
  `setTimeout(0)` and turned 12 of those tests red. A `MutationObserver`
  already batches its records per microtask; no timer was needed.
- **The panel's click dispatcher calls `preventDefault`**, and a cancelled
  click on a checkbox puts the tick back. J's panel checkboxes listen to
  `change` on the window content instead.
- **`auto-build.test.ts` installs fake timers file-wide**; a test that waits
  on a real observer has to switch back (`vi.useRealTimers()` in its own
  `beforeEach`), as the fast-path tests already did.
- **Shell quoting ate code twice**: backticks inside a `node -e "…"` in
  bash were taken as command substitution (an empty template literal
  landed in `wine-warning.ts` and in a test), and a CSS rule inserted into
  `helpers.ts`'s single-quoted style string went in with real line breaks,
  breaking the whole file. Write longer patches with the Write tool to a
  scratch file and splice them in with a short script; check
  `git diff --stat` after any edit to `helpers.ts`'s one-line style string.
- **A help page's costs are not base figures** on an account with Pulley,
  Geometry or Spirit Level (§2, "Added 04/10"). Check any new crawl against
  overlapping levels before loading it.

**What to try on the game** (after reinstalling both userscripts from the
13:11 `dist/`):

- 2.6: refresh every town from Send Resources — the ↻ marks spin, then stop.
- R: the board's Settings has no Update button.
- K: labels on the city view; start an upgrade — `12` becomes `12→13`
  without a reload.
- J: tick each kind (the browser asks once); wait for a building to finish
  and for a task to be dropped; a board checkbox reporting "cannot show
  notifications" means the sandbox has no `Notification` (§7).
- **E, as the user asked: one upgrade that starts, one the game refuses**
  (for example a town that has just started another building, before the
  board recolours its cell), **then Bug Report**, and the file into
  `tools/output/`. Read `gameData.quickUpgrades` against §2's "Read from
  code, NOT measured" before trusting the toasts.
- 2.8: hover a stock figure in the Resource tab.
- U: a building past level 50 shows costs and a time on the board; for one
  of them, compare with the game's own upgrade view on s303 (the game's
  figure will be lower by the server buff and the research — the board
  applies both).
