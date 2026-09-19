/* eslint-disable */
/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $ from "./jquery";

$.extend({
  exclusive: function (arr) {
    return $.grep(arr, function (v, k) {
      return $.inArray(v, arr) === k;
    });
  },

  mergeValues: function (a, b, c) {
    var length = arguments.length;
    if (
      length == 1 ||
      typeof arguments[0] !== "object" ||
      typeof arguments[1] !== "object"
    ) {
      return arguments[0];
    }
    var args = jQuery.makeArray(arguments);
    var i = 1;
    var target = args[0];
    for (; i < length; i++) {
      var copy = args[i];
      for (var name in copy) {
        if (!target.hasOwnProperty(name)) {
          target[name] = copy[name];
          continue;
        }
        if (typeof target[name] == "object" && typeof copy[name] == "object") {
          target[name] = jQuery.mergeValues(target[name], copy[name]);
        } else if (copy.hasOwnProperty(name) && copy[name] !== undefined) {
          target[name] = copy[name];
        }
      }
    }
    return target;
  },
  decodeUrlParam: function (string) {
    var str = string.split("?").pop().split("&");
    var obj = {};
    for (var i = 0; i < str.length; i++) {
      var param = str[i].split("=");
      if (param.length !== 2) {
        continue;
      }
      obj[param[0]] = decodeURIComponent(param[1].replace(/\+/g, " "));
    }
    return obj;
  },
});
