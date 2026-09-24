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
import $ from "./jquery";
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
import { onResponse as onIkariamResponse } from "@core/ikariam/http";
import { installEmpireDiagnostics } from "./diagnostics";
import { Constant } from "./constants";
import { Utils } from "./utils";
import { addScript } from "./add-script";
import { database } from "./database";
import { debug } from "./debug";
import { empire } from "./empire";
import { events } from "./events";
import { ikariam } from "./game-api";
import { render } from "./render";
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
      return $(".breakdown_table")
        .text()
        .replace(/\s\s/g, " ")
        .replace(/\s\s/g, " ")
        .replace(/\s\s/g, " ")
        .replace(/\s\s/g, " ")
        .replace(/\s\s/g, " ")
        .replace(/\s\s/g, " ")
        .replace(/\s\s/g, " ")
        .replace(/\s\s/g, " ")
        .replace(/\s\s/g, " ")
        .replace(/\s\s/g, " ")
        .replace(/\s\s/g, " ")
        .replace(/\s\s/g, " ");
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
  events("ajaxResponse").pub(entries);
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
  var pageJQuery = unsafeWindow.jQuery || unsafeWindow.$;
  if (typeof pageJQuery !== "function") return;
  pageJQuery(unsafeWindow.document).ajaxSuccess(function (event, xhr) {
    var entries;
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
$(function () {
  var bgViewId = $("body").attr("id");
  if (!(
    bgViewId === "city" ||
    bgViewId === "island" ||
    bgViewId === "worldmap_iso" ||
    !$("backupLockTimer").length
  )) {
    return false;
  }

  (function init(model, data, local, ajax) {
    var mod, dat, loc, aj;
    mod = !!unsafeWindow.ikariam && !!unsafeWindow.ikariam.model;
    dat =
      !!unsafeWindow.ikariam && !!unsafeWindow.ikariam.model.relatedCityData;
    loc = !!unsafeWindow.LocalizationStrings;
    aj =
      !!unsafeWindow.ikariam.controller &&
      !!unsafeWindow.ikariam.controller.executeAjaxRequest &&
      !!unsafeWindow.ajaxHandlerCallFromForm;
    if (dat && !data) {
      events(Constant.Events.CITYDATA_AVAILABLE).pub();
    }
    if (mod && dat && !model && !data) {
      events(Constant.Events.MODEL_AVAILABLE).pub();
    }
    if (loc && !local) {
      events(Constant.Events.LOCAL_STRINGS_AVAILABLE).pub();
    }
    if (aj && !ajax) {
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
    if (!(mod && loc && dat && aj)) {
      // BUG IN THE ORIGINAL (line 10741): the parameters are
      // `(model, data, local, ajax)` but it passed `(mod, loc, dat, aj)` —
      // `local` and `data` the wrong way round. Each retry therefore
      // misjudged what it had already announced, and re-published
      // CITYDATA_AVAILABLE, which re-runs `FetchAllTowns`. Harmless while
      // that function only added towns; destructive once it also removed
      // them. Pass them in the order the signature declares.
      events.scheduleAction(init.bind(null, mod, dat, loc, aj), 1000);
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
    }
  })();
});

/**************************************************************************
 *  for IkaLogs
 ***************************************************************************/
