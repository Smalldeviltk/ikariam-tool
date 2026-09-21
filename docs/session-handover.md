# Session handover

Written for whoever picks this branch up next — a fresh agent session, or a
human reading it cold. It carries the things that are **expensive to
rediscover**: measured facts about the live game, decisions already made, and
the traps this branch has already fallen into.

It deliberately does **not** repeat the feature status. That lives in
[improvement-plan.md](improvement-plan.md), which is kept current; read it
second. [project-summary.md](../project-summary.md) covers what the TypeScript
port changed and what is still unverified.

Last updated: 22/09/2026.

---

## 0. Read this before touching anything

**Shipping is broken and the cause is known.** The game replaced the trading
port's destination list; `SEL.dockCities` (`.cities.clearfix > li > a`) matches
nothing, so every `sendResource` task waits 15 s and throws. Auto Wine, manual
sends and the Transport timer are all affected. See §2 for the markup and
`improvement-plan.md` §2.A for the fix.

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
| Pushed      | **No.** The work below is committed locally but not pushed        |
| Uncommitted | Auto Build / Auto Wine / task-runner fixes — see §8              |
| Tests       | 33 files, 416 tests, all passing                                  |
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

---

## 6. What is blocked, and on what

**Blocked on a capture, and ahead of everything else: the trading port (§0).**
Two crawler pastes are needed — one with `#js_transportPanel` open, one with the
shipment form on screen. Until then no shipment can run, so nothing downstream
can be tested by hand either.

Two questions in §6 of the plan are unanswered and are blocking real work:

1. **Does Phase 2 include the Empire Overview board, or only the panel?** Items
   2.6, 2.7 and 2.8 are all board-side. The board is 10,767 lines of mechanical
   port using jQuery UI tabs; touching it is a different risk class from
   rebuilding the panel.
2. **Take all 18 items in §4.2, or a subset?** The user was asked to mark the
   ones they want. Until then E–R are not started.

Unblocked and ready to pick up: **1.4** (`switchCity`, the last Phase 1 item —
`gotoTown` still clicks and polls the breadcrumb), **D** (full-warehouse stripe,
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
  trigger it. **So a green run only counts if the file total reads 33.** Check
  the count, not the colour.
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

- **`git apply` of a reverted patch brings CRLF back into the working tree** and
  prettier (which defaults to LF) then fails those files. This happens on every
  revert-to-prove-the-test round trip. Run `prettier --write` on just the files
  you touched — `npm run format` would sweep five files that were already dirty
  on this branch before any of this work.

---

## 8. Uncommitted work in the tree

Nothing here is committed. `git status` is the authority; this is what it means.

| File | What changed |
| ---- | ------------ |
| `core/task-queue.ts` | `maxConsecutiveErrors`, the `errorStreaks` map, give-up path in the `catch` |
| `core/task-queue.test.ts` | +2 tests |
| `send-resources/app.ts` | `startWineRun()`; the two wine actions no longer call `runner.start()` |
| `send-resources/features/auto-wine.ts` | ship gate removed |
| `send-resources/features/auto-wine.test.ts` | +2 tests |
| `send-resources/features/auto-build.ts` | `TOWN_SETTLE_MS`, re-check before the click, confirm before dequeuing, `slotNumberOf`/`slotElement`/`isTownBuilding` |
| `send-resources/features/auto-build.test.ts` | +2 tests, and one existing fixture now marks the slot on click |

`.gitignore` is also modified, and was already so at the start of that session —
not part of this work.

Each fix was proved the §3 way: revert the source file, watch the new test go
red, restore. Four of the six new tests went red; the other two are guards
against a plausible wrong fix, and say so in their names.

`dist/` has NOT been rebuilt since any of this. Per §7, a green test is not
evidence a feature reached the bundle — grep `dist/` before believing it.
