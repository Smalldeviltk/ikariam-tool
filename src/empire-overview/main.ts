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

      unsafeWindow.ikariam.controller.executeAjaxRequest = (function (
        execAjaxRequest,
      ) {
        return function cExecuteAjaxRequest() {
          var args = $.makeArray(arguments);
          args.push(undefined);
          if (!args[1]) {
            args[1] = function customAjaxCallback(responseText) {
              var responder = unsafeWindow.ikariam.getClass(
                unsafeWindow.ajax.Responder,
                responseText,
              );
              unsafeWindow.ikariam.controller.ajaxResponder = responder;
              events("ajaxResponse").pub(responder.responseArray);
              unsafeWindow.response = responder;
            };
          }
          var ret = execAjaxRequest.apply(this, args);
        };
      })(unsafeWindow.ikariam.controller.executeAjaxRequest);
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
