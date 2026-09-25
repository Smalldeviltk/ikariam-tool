/* eslint-disable */
/**
 * Mechanically ported from the original `legacy/Quản lý Ika Perseus -VN- V2.js`.
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import { reportBug } from "@core/bug-report";
import { modelWineConsumption } from "@core/ikariam/model";
import $ from "./jquery";
import { Utils } from "./utils";
import { ikariam } from "./game-api";

export const ResourceProduction: any = new (function () {
  function addProd(position, value) {
    value = Math.floor(value);
    if (value > 0)
      $("span#rp" + position)
        .css("color", "green")
        .text(Utils.FormatNumToStr(value, true));
    else if (value < 0)
      $("span#rp" + position)
        .css("color", "red")
        .text(Utils.FormatNumToStr(value, true));
    else
      $("span#rp" + position)
        .css("color", "gray")
        .text("+0");
  }
  this.createSpan = function (n) {
    var ids = ["wood", "wine", "marble", "glass", "sulfur"];
    if ($("span#rp" + n).length === 0) {
      $('#cityResources li[id="resources_' + ids[n] + '"]')
        .css({ "line-height": "normal", "padding-top": "0px" })
        .append('<span id="rp' + n + '" class="resourceProduction"></span>');
    }
  };
  this.repositionSpan = function (newTradegood) {
    var oldTradegood = unsafeWindow.ikariam.model.producedTradegood;
    if (newTradegood != oldTradegood) {
      if (oldTradegood > 1) {
        $("span#rp" + oldTradegood).remove();
      }
      this.createSpan(newTradegood);
    }
  };
  /**
   * FIX (not in the original): the original printed
   * `model.wineSpendings` straight out, which is the tavern's GROSS draw
   * before the Wine Press. On a town with a level 40 press the span read -933
   * while the town actually spent 560. `modelWineConsumption` subtracts the
   * press; see its note for the measurement. The raw figure is still the
   * fallback, so a page where the press cannot be read behaves as before.
   */
  function wineDrain() {
    var net = modelWineConsumption();
    return net === null ? unsafeWindow.ikariam.model.wineSpendings : net;
  }
  this.updateProd = function () {
    addProd(0, unsafeWindow.ikariam.model.resourceProduction * 3600);
    if (unsafeWindow.ikariam.model.cityProducesWine) {
      addProd(
        1,
        unsafeWindow.ikariam.model.tradegoodProduction * 3600 - wineDrain(),
      );
    } else {
      addProd(1, -wineDrain());
      addProd(
        unsafeWindow.ikariam.model.producedTradegood,
        unsafeWindow.ikariam.model.tradegoodProduction * 3600,
      );
    }
  };
})();
$(function () {
  ResourceProduction.createSpan(0);
  ResourceProduction.createSpan(1);
  ResourceProduction.createSpan(2);
  ResourceProduction.createSpan(3);
  ResourceProduction.createSpan(4);
  ResourceProduction.updateProd();
  /**
   * FIX (not in the original): the wrapper is now transparent to the game.
   *
   * The original forwarded only `dataSet`, dropped the return value, and ran
   * `repositionSpan` first with nothing to stop a throw there from skipping
   * the game's own update. After a manual shipment the header kept the old
   * resource and idle-ship counts with this script on, and refreshed with it
   * off. The same kind of wrapper around `executeAjaxRequest` was already
   * found to break the current game (see `observeGameResponses` in
   * `main.ts`); this one is made unable to interfere in the same way. Every
   * argument reaches the game, its return value comes back, and the span
   * bookkeeping can fail without taking the game's update with it.
   */
  unsafeWindow.ikariam.model.ResourceProduction_updateGlobalData =
    unsafeWindow.ikariam.model.updateGlobalData;
  unsafeWindow.ikariam.model.updateGlobalData = function (dataSet) {
    try {
      if (dataSet) ResourceProduction.repositionSpan(dataSet.producedTradegood);
    } catch (e) {
      // Our span only; the game's update below must still run. Recorded so
      // the failure is not lost along with the span.
      reportBug("manual", e, { where: "production span: reposition" });
    }
    // Called on the model, as the original did, whatever `this` the game used.
    var result =
      unsafeWindow.ikariam.model.ResourceProduction_updateGlobalData.apply(
        unsafeWindow.ikariam.model,
        arguments,
      );
    try {
      ResourceProduction.updateProd();
    } catch (e) {
      // Our span only.
      reportBug("manual", e, { where: "production span: update" });
    }
    return result;
  };
});

/***********************************************************************************************************************
 * ikariam
 **********************************************************************************************************************/
