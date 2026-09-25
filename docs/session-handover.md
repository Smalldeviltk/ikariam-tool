# Session handover

Written for whoever picks this branch up next — a fresh agent session, or a
human reading it cold. It carries the things that are **expensive to
rediscover**: measured facts about the live game, decisions already made, and
the traps this branch has already fallen into.

It deliberately does **not** repeat the feature status. That lives in
[improvement-plan.md](improvement-plan.md), which is kept current; read it
second. [project-summary.md](../project-summary.md) covers what the TypeScript
port changed and what is still unverified.

Last updated: 25/09/2026.

---

## 0. Read this before touching anything

**Automated shipping is broken and the cause is known.** The game replaced the
trading port's destination list; `SEL.dockCities` (`.cities.clearfix > li > a`)
matches nothing, so every `sendResource` task waits 15 s and throws. Auto Wine
and the Transport timer are affected; a shipment sent by hand in the game goes
through. See §2 for the markup and `improvement-plan.md` §2.A for the fix.

**Two rounds on 25/09.** The first — two user-reported bugs and part of Auto
Wine — is committed locally as six commits and not pushed; the write-up is
`improvement-plan.md` §2.C. A third bug, Auto Build losing its queue while a
town is building, is still open and waiting on a log from the user (§6).

The second round is a code-quality review of the whole of `src/` and the
fixes for nearly all of it, committed as `1983f45` (§8). What was left, and why, is
`improvement-plan.md` §2.D — read that before starting another review, so
the same ground is not covered twice.

**Do not press either Start Timer until that is fixed.** The runner now gives
up on a task after five consecutive throws, so instead of looping forever the
queue quietly empties — roughly 80 s per task. Queued shipments are recoverable
(press Auto Wine's Start again); the Auto Build config is not touched.

The capture that unblocks it: one paste of the crawler with `#js_transportPanel`
open, a second after clicking `a.action_transport` so the shipment form is on
screen. `portForm.present` is `false` in all five existing captures, so
`#textfield_*`, `#submit` and `#slider_freighters_max` have never been checked
against the live game either.

---

## 1. Where the tree stands

|             |                                                                  |
| ----------- | ---------------------------------------------------------------- |
| Branch      | `refactor`, tracking `origin/refactor`                            |
| Pushed      | Up to `3228058`. Eight local commits since (`03d07fa`..HEAD), not pushed |
| Uncommitted | Nothing from either 25/09 round — see §8                          |
| Tests       | 34 files, 449 tests, all passing                                  |
| Typecheck   | Clean (`tsc --noEmit` and the strict config)                      |
| Build       | `npm run build` produces both the userscripts and the extension   |

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
  safe either.

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

**Code carried over from the original scripts was written for an older game.**
The `executeAjaxRequest` and `updateGlobalData` wrappers, and `loadUrl`'s town
switch, were all line-for-line ports that had quietly stopped matching the
live game. "It is the same as the original" is not evidence that it works.

**Selectors copied from the old scripts are assumptions, not facts.** Three of
them have now been caught: `#BuildTab` (zero matches without Empire Overview),
the stale `#js_buildingUpgradeButton`, and now the whole trading port. The
crawler's probe output is the only thing that settles one. `portForm` has never
been captured at all — treat every selector in that group as unverified.

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
- **Auto Wine's Start only fills the queue.** It does not start the runner and
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
  menu entry is what broke the header (§2).
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

---

## 6. What is blocked, and on what

**Blocked on a capture, and ahead of everything else: the trading port (§0).**
Two crawler pastes are needed — one with `#js_transportPanel` open, one with the
shipment form on screen. Until then no shipment can run, so nothing downstream
can be tested by hand either.

**Blocked on the user: Auto Build losing its queue while a town is building.**
An entry is only dropped once its slot carries `constructionSite`, so the two
suspects are a check made against a stale view (the kind of half-switched page
the board bug produced), or an entry filed under the wrong town when **+** is
pressed while the breadcrumb is wrong (`addBuildingToQueue` names the town from
the breadcrumb). Needed: the panel log around the loss, and whether the entry
turns up under another town. The board fix may have cured it — retest first.

**Blocked on the user: the names of `createPopup`'s last two parameters**
(`arg4`, `arg5` in `core/ikariam/globals.ts`), the one review finding left
open against the naming rule. Every source, including the original, passes
`"???", "class"`. Needed: `copy(ikariam.createPopup.toString())` from the
console with both scripts off.

Two questions in §6 of the plan are unanswered and are blocking real work:

1. **Does Phase 2 include the Empire Overview board, or only the panel?** Items
   2.6, 2.7 and 2.8 are all board-side. The board is 10,767 lines of mechanical
   port using jQuery UI tabs; touching it is a different risk class from
   rebuilding the panel.
2. **Take all 18 items in §4.2, or a subset?** The user was asked to mark the
   ones they want. Until then E–R are not started.

Unblocked and ready to pick up: **1.4** (`switchCity`, the last Phase 1 item —
`gotoTown` still clicks and polls the breadcrumb; more urgent since 25/09,
because its fallback clicks the dropdown `<a>`, which §2 now records as not
switching town, so Send Resources without Empire Overview probably cannot
change town at all — `switchTownWithGameForm` in `game-api.ts` is a working
model), **D** (full-warehouse stripe,
pure CSS), **H** (cross-tab sync lock — nothing currently stops two tabs driving
one account and sending twice), and the second half of **2.4** (idle ships and
action points in the status line).

---

## 7. Loose ends worth knowing

- **1.4 has no recorded reasoning.** It was deferred, but no note explaining why
  was ever written into the code or the plan. Either do it, or write down why
  not.
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
- **Tests that mock `@core/logger` must keep its real exports** (`vi.mock(...,
  async (importOriginal) => ({ ...(await importOriginal()), logInfo: ... }))`).
  The data export imports the logger's storage key, and a bare mock broke nine
  app tests with a confusing "no export defined" error.
- **`git apply` of a reverted patch brings CRLF back into the working tree** and
  prettier (which defaults to LF) then fails those files. This happens on every
  revert-to-prove-the-test round trip. Run `prettier --write` on just the files
  you touched — `npm run format` would sweep five files that were already dirty
  on this branch before any of this work.

---

## 8. The last round of work

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

`dist/` was last built by the user on 25/09 at 03:17, before the launcher
move, the `updateGlobalData` wrapper change and this whole review. Per §7,
grep `dist/` before believing a fix reached the bundle.
