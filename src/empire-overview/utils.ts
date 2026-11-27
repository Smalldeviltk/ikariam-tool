/**
 * Mechanically ported from the original `legacy/Quản lý Ika Perseus -VN- V2.js`.
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $ from "./jquery";
import { Constant } from "./constants";
import { database } from "./database";

/**
 * Added (not in the original): the board's strings in the language its
 * settings name. English while the settings are not loaded yet — the table
 * falls back for a language it does not have.
 */
export function languageText(): Record<string, string> {
  return Constant.LanguageData[database.settings?.languageChange?.value];
}

/** The key the game's thousands separator is stored under. */
const THOUSANDS_SEPARATOR_KEY = "thousandSeperator";

/**
 * The game's thousands separator, from its localisation strings; `","` while
 * they are not loaded. `getLocalisedString` answers with the key itself when
 * it has no value, so that answer means "not known" too.
 */
function thousandsSeparator(): string {
  try {
    const value = database.getGlobalData.getLocalisedString(
      THOUSANDS_SEPARATOR_KEY,
    );
    return value && value !== THOUSANDS_SEPARATOR_KEY ? value : ",";
  } catch {
    return ",";
  }
}

/**
 * Added (not in the original): a count as the game writes it — `"12"`,
 * `"1,234"` with the game's own thousands separator, or the menu bar's
 * `"1.2k"`, where the mark that is not the thousands separator is the
 * decimal point (`"1,2k"` where the separator is a dot). Text before the
 * first digit is skipped. `NaN` when there is no number, as `parseInt` gives, so a
 * caller's `|| 0` reads the same as before.
 *
 * Several counts went through a bare `parseInt`, which stops at the
 * separator: 1,234 units in training, available, on the move, scientists or
 * idle ships all read as 1.
 */
export function readGameCount(text: unknown): number {
  const raw = String(text ?? "");
  const start = raw.search(/\d/);
  if (start < 0) return NaN;
  const fromDigit = raw.slice(start).trim();
  const separator = thousandsSeparator();
  const abbreviated = fromDigit.match(/^([\d.,]+)\s*k/i);
  if (abbreviated) {
    const decimalMark = separator === "." ? "," : ".";
    const thousands = Number.parseFloat(
      abbreviated[1].split(separator).join("").replace(decimalMark, "."),
    );
    return Number.isFinite(thousands) ? Math.round(thousands * 1000) : NaN;
  }
  return parseInt(fromDigit.split(separator).join(""), 10);
}

export const Utils: any = {
  wrapInClosure: function (obj) {
    return (function (x) {
      return function () {
        return x;
      };
    })(obj);
  },
  existsIn: function (input, test) {
    var ret;
    try {
      ret = input.indexOf(test) !== -1;
    } catch (e) {
      return false;
    }
    return ret;
  },
  estimateTravelTime: function (city1, city2) {
    var time;
    if (!city1 || !city2) return 0;
    if (city1[0] == city2[0] && city1[1] == city2[1]) {
      time = (1200 / 60) * 0.5;
    } else {
      time =
        (1200 / 60) *
        Math.sqrt(
          Math.pow(city2[0] - city1[0], 2) + Math.pow(city2[1] - city1[1], 2),
        );
    }
    return Math.floor(time * 60 * 1000);
  },
  addStyleSheet: function (style) {
    var getHead = document.getElementsByTagName("head")[0];
    var cssNode = window.document.createElement("style");
    var elementStyle = getHead.appendChild(cssNode);
    elementStyle.innerHTML = style;
    return elementStyle;
  },
  escapeRegExp: function (str) {
    return str.replace(/[\[\]\/\{\}\(\)\-\?\$\*\+\.\\\^\|]/g, "\\$&");
  },
  format: function (inputString, replacements) {
    var str = "" + inputString;
    var keys = Object.keys(replacements);
    var i = keys.length;
    while (i--) {
      str = str.replace(
        new RegExp(this.escapeRegExp("{" + keys[i] + "}"), "g"),
        replacements[keys[i]],
      );
    }
    return str;
  },
  cacheFunction: function (toExecute, expiry) {
    expiry = expiry || 1000;
    // BUG IN THE ORIGINAL: this read `$.now` (the function) instead of
    // `$.now()` (the timestamp). Comparing a function to a number is always
    // false, so the time-based branch never fired and every cache built by
    // `cacheFunction` lived forever — army totals, research data, corruption
    // and training totals all went stale and never refreshed.
    var cachedTime = $.now();
    var cachedResult;
    cachedResult = undefined;
    return function () {
      if (cachedTime < $.now() - expiry || cachedResult === undefined) {
        cachedResult = toExecute();
        cachedTime = $.now();
      }
      return cachedResult;
    };
  },
  getClone: function ($node) {
    if (
      $node.hasClass("ui-sortable-helper") ||
      $node.parent().find(".ui-sortable-helper").length
    ) {
      return $node;
    }
    return $($node.get(0).cloneNode(true));
  },
  setClone: function ($node, $clone) {
    if (
      $node.hasClass("ui-sortable-helper") ||
      $node.parent().find(".ui-sortable-helper").length
    ) {
      return $node;
    }
    $node.get(0).parentNode.replaceChild($clone.get(0), $node.get(0));
    return $node;
  },
  replaceNode: function (node, html) {
    var t = node.cloneNode(false);
    t.innerHTML = html;
    node.parentNode.replaceChild(t, node);
    return t;
  },
  FormatTimeLengthToStr: function (timeString, precision, spacer) {
    var lang = database.settings.languageChange.value;
    timeString = timeString || 0;
    precision = precision || 2;
    spacer = spacer || " ";
    if (!isFinite(timeString)) {
      return " \u221E ";
    }
    if (timeString < 0) timeString *= -1;
    var factors: any = [];
    var locStr: any = [];
    factors.year = 31536000;
    // FIX (not in the original): 30 days, as the game counts a month
    // (measured 01/10); the original's 2520000 s is about 29.17 days.
    factors.month = 2592000;
    factors.day = 86400;
    factors.hour = 3600;
    factors.minute = 60;
    factors.second = 1;
    locStr.year = Constant.LanguageData[lang].year;
    locStr.month = Constant.LanguageData[lang].month;
    locStr.day = Constant.LanguageData[lang].day;
    locStr.hour = Constant.LanguageData[lang].hour;
    locStr.minute = Constant.LanguageData[lang].minute;
    locStr.second = Constant.LanguageData[lang].second;
    timeString = Math.ceil(timeString / 1000);
    var retString = "";
    for (var fact in factors) {
      var timeInSecs = Math.floor(timeString / factors[fact]);
      if (isNaN(timeInSecs)) {
        return retString;
      }
      if (precision > 0 && (timeInSecs > 0 || retString != "")) {
        timeString = timeString - timeInSecs * factors[fact];
        if (retString != "") {
          retString += spacer;
        }
        retString += timeInSecs == 0 ? "" : timeInSecs + locStr[fact];
        precision = timeInSecs == 0 ? precision : precision - 1;
      }
    }
    return retString;
  },
  FormatFullTimeToDateString: function (timeString, precise) {
    var lang = database.settings.languageChange.value;
    precise = precise || true;
    timeString = timeString || 0;
    var sInDay = 86400000;
    var day = "";
    var compDate = new Date(timeString);
    // Fixed: the days were counted in UTC, so in UTC+7 a time between
    // midnight and 07:00 tomorrow read as today, and one this morning as
    // tomorrow. Counted from local midnight; rounded for a day with a
    // daylight-saving change.
    const localMidnight = function (time) {
      const date = new Date(time);
      return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      ).getTime();
    };
    if (precise) {
      switch (
        Math.round(
          (localMidnight(compDate.getTime()) - localMidnight($.now())) / sInDay,
        )
      ) {
        case 0:
          day = Constant.LanguageData[lang].today;
          break;
        case 1:
          day = Constant.LanguageData[lang].tomorrow;
          break;
        case -1:
          day = Constant.LanguageData[lang].yesterday;
          break;
        default:
          // The original called `Date.prototype.toLocaleFormat("%a %d %b")`
          // on non-Chrome browsers. That was a Firefox-only extension and has
          // been removed from every engine, so this threw on Firefox. Both
          // branches were meant to produce the same thing, so keep the portable
          // one for everyone.
          day = compDate.toString().split(" ").splice(0, 3).join(" ");
      }
    }
    if (day !== "") {
      day += ", ";
    }
    return day + compDate.toLocaleTimeString();
  },
  FormatTimeToDateString: function (timeString) {
    timeString = timeString || 0;
    var compDate = new Date(timeString);
    return compDate.toLocaleTimeString();
  },
  FormatRemainingTime: function (time, brackets) {
    brackets = brackets || false;
    var arrInTime = Utils.FormatTimeLengthToStr(time, 3, " ");
    return arrInTime === ""
      ? ""
      : (brackets ? "(" : "") + arrInTime + (brackets ? ")" : "");
  },
  FormatNumToStr: function (inputNum, outputSign, precision) {
    var lang = database.settings.languageChange.value;
    precision = precision ? "10e" + (precision - 1) : 1;
    var ret, val, sign, i, j;
    var tho = Constant.LanguageData[lang].thousandSeperator;
    var dec = Constant.LanguageData[lang].decimalPoint;
    if (!isFinite(inputNum)) {
      return "\u221E";
    }
    sign = inputNum > 0 ? 1 : inputNum === 0 ? 0 : -1;
    if (sign) {
      val = (Math.floor(Math.abs(inputNum * precision)) / precision + "").split(
        ".",
      );
      ret = val[1] !== undefined ? [dec, val[1]] : [];
      val = val[0].split("");
      i = val.length;
      j = 1;
      while (i--) {
        ret.unshift(val.pop());
        if (i && j % 3 === 0) {
          ret.unshift(tho);
        }
        j++;
      }
      if (outputSign) {
        ret.unshift(sign == 1 ? "+" : "-");
      }
      return ret.join("");
    } else return inputNum;
  },
};

/***********************************************************************************************************************
 * CLASSES
 **********************************************************************************************************************/
