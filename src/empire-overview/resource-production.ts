/* eslint-disable */
/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
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
  this.updateProd = function () {
    addProd(0, unsafeWindow.ikariam.model.resourceProduction * 3600);
    if (unsafeWindow.ikariam.model.cityProducesWine) {
      addProd(
        1,
        unsafeWindow.ikariam.model.tradegoodProduction * 3600 -
          unsafeWindow.ikariam.model.wineSpendings,
      );
    } else {
      addProd(1, -unsafeWindow.ikariam.model.wineSpendings);
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
  unsafeWindow.ikariam.model.ResourceProduction_updateGlobalData =
    unsafeWindow.ikariam.model.updateGlobalData;
  unsafeWindow.ikariam.model.updateGlobalData = function (dataSet) {
    ResourceProduction.repositionSpan(dataSet.producedTradegood);
    unsafeWindow.ikariam.model.ResourceProduction_updateGlobalData(dataSet);
    ResourceProduction.updateProd();
  };
});

/***********************************************************************************************************************
 * ikariam
 **********************************************************************************************************************/
