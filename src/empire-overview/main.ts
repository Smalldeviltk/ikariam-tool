/**
 * Ikariam Empire Overview -VN- V2 — entry point.
 *
 * Corresponds to the "Main Init" block at the end of the original JS (lines
 * 10642-10766), which used to be lumped in with the `Constant` block. The
 * startup order is unchanged:
 *   1. With debug on, expose the internal objects as `unsafeWindow.empire`
 *   2. `empire.Init()` — which drives `ikariam.Init()`, `render.Init()` and
 *      `database.Init()`
 *   3. Once the DOM is ready, install the hook that reads the game's ajax data
 *
 * jQuery and jQuery UI are loaded by the `@require` lines in the userscript
 * header; see build/vite.empire-overview.ts.
 */
import $, { pageJQuery } from "./jquery";
// Side-effect modules. The original was one file, so these ran simply by being
// in it; after the split nothing imports them for a value, and leaving them out
// of the graph drops them from the bundle entirely. Each one patches an object
// that the boot sequence then calls:
//   jquery-ext          -> $.exclusive / $.mergeValues / $.decodeUrlParam
//   helpers             -> render.LoadCSS
//   resource-production -> the per-resource production spans in the top bar
// Order matches the original file: the $ extensions come first, because
// `database.Init()` calls `$.mergeValues` while loading settings.
import "./jquery-ext";
import { reportBug } from "@core/bug-report";
import {
  onResponse as onIkariamResponse,
  onSyncChange,
} from "@core/ikariam/http";
import { installEmpireDiagnostics } from "./diagnostics";
import { Constant } from "./constants";
import { Utils } from "./utils";
import { database } from "./database";
import { debug } from "./debug";
import { empire } from "./empire";
import { events } from "./events";
import { FETCHED_RESPONSE, ikariam } from "./game-api";
import { render, SYNCING_CLASS } from "./render";
import "./helpers";
import "./resource-production";

/***********************************************************************************************************************
 * Main Init
 **********************************************************************************************************************/
if (debug) {
  delete unsafeWindow.console;
  unsafeWindow.empire = {
    s: empire,
    db: database,
    ikariam: ikariam,
    render: render,
    events: events,
    utils: Utils,
    Constant: Constant,
    $: $,
    get tip() {
      // The original chained `.replace(/\s\s/g, " ")` twelve times to squash
      // runs of whitespace; one pass over any run does the same.
      return $(".breakdown_table")
        .text()
        .replace(/\s{2,}/g, " ");
    },
  };
}

/**
 * Feed responses fetched by `core/ikariam/http` into the same subscriber the
 * live ajax hook feeds.
 *
 * Without this, a town loaded over http would update nothing: the board
 * records from `events("ajaxResponse")`, and that is published from the page
 * jQuery's `ajaxSuccess` event (see `observeGameResponses`), which a plain
 * fetch does not go through. Registering here means a fetched town and a clicked one arrive by
 * the same path and are indistinguishable downstream.
 */
onIkariamResponse((entries) => {
  // Marked as fetched: none of it is on the page, so the board must not read
  // its view from the DOM (`parseViewData`).
  events("ajaxResponse").pub(entries, FETCHED_RESPONSE);
});

/**
 * Added (not in the original): spin the Town headers' sync
 * mark while Send Resources refreshes every town. The class goes on the
 * board, not on the marks, so the tables can be redrawn meanwhile.
 */
onSyncChange((running) => {
  $("#empireBoard").toggleClass(SYNCING_CLASS, running);
});

/**
 * Hear every response the game's own requests bring back, without taking part
 * in handling them.
 *
 * The original replaced `ikariam.controller.executeAjaxRequest` and, whenever
 * the game passed no callback, substituted its own: build a fresh
 * `ajax.Responder` from the response and install it as
 * `controller.ajaxResponder`. That matched the game it was written for. The
 * live game now keeps ONE responder and feeds every later response to its
 * `parseResponse` (from its own source, with no callback:
 * `null === r.ajaxResponder ? r.ajaxResponder = ikariam.getClass(ajax.Responder, e)
 * : r.ajaxResponder.parseResponse(e)`). Replacing it meant the game's responder
 * never saw a response again. Seen live: after a manual shipment the header
 * kept the old resource and idle-ship counts, and refreshed normally with this
 * script off. The board's shortcut buttons go through the same path, and
 * leaving the dropdown on the new town with the old town's buildings on screen
 * is the same kind of half-applied response — expected to be fixed by this
 * too, not yet confirmed.
 *
 * So the game's request path is left alone, and the response is read from
 * jQuery's global `ajaxSuccess` event instead. That event fires after the
 * game's own success handler, on the PAGE's jQuery — the one `$.ajax` in the
 * game's code runs on — not the sandbox copy this script imports as `$`.
 */
function observeGameResponses() {
  const gameJQuery = pageJQuery();
  if (!gameJQuery) return;
  gameJQuery(unsafeWindow.document).ajaxSuccess(function (event, xhr) {
    let entries: unknown;
    try {
      entries = JSON.parse(xhr && xhr.responseText);
    } catch (e) {
      // Not a game response array (a login page, or a plain HTML fragment).
      return;
    }
    if (Array.isArray(entries)) events("ajaxResponse").pub(entries);
  });
}

// Installed before Init so a throw during startup is still recorded.
installEmpireDiagnostics(__PACKAGING__, __SCRIPT_VERSION__);

empire.Init();
// BUG IN THE ORIGINAL, removed rather than fixed: the ready handler opened
// with a guard meant to stop the script on views other than city, island and
// world map when a backup-lock timer was on the page. It looked the timer up
// as `$("backupLockTimer")` — no `#` or `.`, so it matched nothing, the guard
// was always true and it never stopped anything. Whether the game's element
// is an id or a class has not been checked, and guessing would start stopping
// the script on pages where it has always run, so the guard is gone and the
// behaviour is exactly what it has always been.
$(function () {
  (function init(
    modelAnnounced,
    cityDataAnnounced,
    stringsAnnounced,
    ajaxHooked,
  ) {
    var hasModel = !!unsafeWindow.ikariam && !!unsafeWindow.ikariam.model;
    var hasCityData =
      !!unsafeWindow.ikariam && !!unsafeWindow.ikariam.model.relatedCityData;
    var hasStrings = !!unsafeWindow.LocalizationStrings;
    var canHookAjax =
      !!unsafeWindow.ikariam.controller &&
      !!unsafeWindow.ikariam.controller.executeAjaxRequest &&
      !!unsafeWindow.ajaxHandlerCallFromForm;
    if (hasCityData && !cityDataAnnounced) {
      events(Constant.Events.CITYDATA_AVAILABLE).pub();
    }
    if (hasModel && hasCityData && !modelAnnounced && !cityDataAnnounced) {
      events(Constant.Events.MODEL_AVAILABLE).pub();
    }
    if (hasStrings && !stringsAnnounced) {
      events(Constant.Events.LOCAL_STRINGS_AVAILABLE).pub();
    }
    if (canHookAjax && !ajaxHooked) {
      unsafeWindow.ajaxHandlerCallFromForm = (function (
        ajaxHandlerCallFromForm,
      ) {
        return function cAjaxHandlerCallFromForm(form) {
          events("formSubmit").pub(form);
          return ajaxHandlerCallFromForm.apply(this, arguments);
        };
      })(unsafeWindow.ajaxHandlerCallFromForm);

      observeGameResponses();
    }
    if (!(hasModel && hasStrings && hasCityData && canHookAjax)) {
      // BUG IN THE ORIGINAL (line 10741): the retry passed what had been
      // seen so far with the city-data and strings flags the wrong way
      // round. Each retry therefore misjudged what it had already announced,
      // and re-published CITYDATA_AVAILABLE, which re-runs `FetchAllTowns`.
      // Harmless while that function only added towns; destructive once it
      // also removed them. Pass them in the order the signature declares.
      events.scheduleAction(
        init.bind(null, hasModel, hasCityData, hasStrings, canHookAjax),
        1000,
      );
    } else {
      // Hand the page's own inline response array to the same subscriber the
      // live ajax hook feeds, so the town you land on is recorded without
      // having to navigate anywhere first.
      //
      // The pattern is tightened from the original `(.*)`: the capture must
      // now be a bracketed array. The loose version could take in whatever
      // else sat before the last `);` on that line, and a capture that still
      // parsed as JSON handed the subscriber entries it then indexed into —
      // which is the throw seen live on s303-en.
      $("script").each(function (index, script) {
        var match =
          /ikariam\.getClass\(ajax\.Responder,\s*(\[[\s\S]*\])\s*\)/.exec(
            script.innerHTML,
          );
        if (!match) return;

        var parsed;
        try {
          // The original fell back to `[]` the ARRAY, which stringifies to
          // "" and makes JSON.parse throw. "[]" the string is what was meant.
          parsed = JSON.parse(match[1] || "[]");
        } catch (e) {
          reportBug("manual", e, {
            where: "initial ajax bootstrap",
            captured: String(match[1]).slice(0, 200),
          });
          return false;
        }

        if (Array.isArray(parsed)) events("ajaxResponse").pub(parsed);
        return false;
      });

      // A board button for another town switches town first, and on the
      // live game that reloads the page; the view it was for opens here.
      ikariam.openPendingView();
    }
  })();
});
