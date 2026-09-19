/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $ from "./jquery";
import { Constant } from "./constants";
import { Utils } from "./utils";
import { database } from "./database";
import { debug, log, timing } from "./debug";
import { ikariam } from "./game-api";
import { render } from "./render";

/**
 * The logged-in account, used to namespace this script's localStorage keys.
 *
 * The original indexed straight into `querySelector(...)`, which throws when
 * the avatar block is absent. That throw happens while the module graph is
 * still evaluating — before the diagnostics are installed — so the script died
 * with no board, no menu button and nothing recorded anywhere.
 *
 * The anchor's `title` and its text are the same name, differing only in
 * leading whitespace, so the text is a safe second source. Falling back to `""`
 * would silently move every stored key, so it is deliberately the last resort.
 */
function readAccountName(): string {
  const anchor = document.querySelector<HTMLAnchorElement>(
    ".avatarName > a.noViewParameters",
  );
  if (anchor) return anchor.title || anchor.textContent?.trim() || "";
  return document.querySelector(".avatarName")?.textContent?.trim() ?? "";
}

export const accountName = readAccountName();

export const EMPIRE_STORAGE_PREFIX = ["", accountName, ""].join("***");
export const empire: any = {
  version: 1.1831,
  scriptId: 764,
  scriptName: "Empire Overview",
  logger: null,
  loaded: false,
  setVar: function (varname, varvalue) {
    localStorage.setItem(EMPIRE_STORAGE_PREFIX + varname, varvalue);
    //GM_setValue(EMPIRE_STORAGE_PREFIX + varname, varvalue);
  },
  deleteVar: function (varname) {
    localStorage.removeItem(EMPIRE_STORAGE_PREFIX + varname);
    //GM_deleteValue(EMPIRE_STORAGE_PREFIX + varname);
  },
  getVar: function (varname, vardefault) {
    var ret = localStorage.getItem(EMPIRE_STORAGE_PREFIX + varname);

    //var ret = GM_getValue(EMPIRE_STORAGE_PREFIX + varname);
    if (null === ret && "undefined" != typeof vardefault) {
      return vardefault;
    }
    return ret;
  },
  log: function (val) {
    if (debug) console.log("empire: ", $.makeArray(arguments));
    if (log) {
      if (this.logger) {
        this.logger.val(val + "\n" + this.logger.val());
        return true;
      } else {
        render.$tabs.append(
          $(document.createElement("div")).attr("id", "empire_Log"),
        );
        $("#empire_Log").html(
          '<div><textarea id="empire_Logbox" rows="20" cols="120"></textarea></div>',
        );
        $(
          '<li><a href="#empire_Log"><img class="ui-icon ui-icon-info"/></a></li>',
        ).appendTo("#empire_Tabs .ui-tabs-nav");
        render.$tabs.tabs("refresh");
        this.logger = $("#empire_Logbox");
        return this.log(val);
      }
    }
  },
  error: function (func, e) {
    this.log("****** Error raised in " + func + " ******");
    this.log(e.name + " : " + e.message);
    this.log(e.stack);
    this.log("****** End ******");
    if (debug) {
      console.error("****** Error raised in " + func + " ******");
      console.error(e.name + " : " + e.message);
      console.error(e.stack);
      console.error("****** End ******");
    }
  },
  time: function (func, name) {
    if (timing) console.time(name);
    var ret = func();
    if (timing) console.timeEnd(name);
    return ret;
  },
  Init: function () {
    ikariam.Init();
    render.Init();
    database.Init(ikariam.Host());
    //this.CheckForUpdates(false);
    // GM_registerMenuCommand(this.scriptName + 'Manual Update', function () {
    //     empire.CheckForUpdates(true);
    // });
  },

  CheckForUpdates: function (forced) {
    var lang = database.settings.languageChange.value;
    if (
      forced ||
      (database.getGlobalData.LastUpdateCheck + 86400000 <= $.now() &&
        database.settings.autoUpdates.value)
    ) {
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url:
            "https://greasyfork.org/scripts/" +
            empire.scriptId +
            "-empire-overview/code/Empire_Overview.meta.js", // + $.now(),
          headers: { "Cache-Control": "no-cache" },
          onload: function (resp) {
            var remote_version, rt;
            rt = resp.responseText;
            database.getGlobalData.LastUpdateCheck = $.now();
            // `.exec` returns null when the fetched metadata has no
            // @version line. The original indexed straight into it and
            // threw — and the surrounding try/catch does NOT help, since it
            // only wraps the GM_xmlhttpRequest call, not this async callback.
            var versionMatch = /@version\s*(.*?)\s*$/m.exec(rt);
            if (!versionMatch) {
              if (forced) render.toast("Could not read the remote version.");
              return;
            }
            remote_version = parseFloat(versionMatch[1]);
            if (empire.version != -1) {
              if (remote_version > empire.version) {
                if (
                  confirm(
                    Constant.LanguageData[lang].alert_update +
                      empire.scriptName +
                      '". \n' +
                      Constant.LanguageData[lang].alert_update1,
                  )
                ) {
                  // if(confirm(Utils.format(Constant.LanguageData[lang].alert_update,[empire.scriptName]))) {
                  GM_openInTab(
                    "https://greasyfork.org/scripts/" +
                      empire.scriptId +
                      "-empire-overview",
                  );
                }
              } else if (forced)
                render.toast(
                  Constant.LanguageData[lang].alert_noUpdate +
                    empire.scriptName +
                    '".',
                );
              // render.toast(Utils.format(Constant.LanguageData[lang].alert_noUpdate,[empire.scriptName]));
            }
            database.getGlobalData.latestVersion = remote_version;
          },
        });
      } catch (err) {
        if (forced)
          render.toast(Constant.LanguageData[lang].alert_error + "\n" + err);
      }
    }
  },

  HardReset: function () {
    var lang = database.settings.languageChange.value;
    // The original assigned `database = {}`, which worked because `database`
    // was a shared closure variable. After the module split it is an import
    // binding and cannot be reassigned. Clearing the keys instead is in fact
    // more correct than the original: rebinding only changed this module's
    // view, so any closure that had already captured the old reference kept
    // seeing stale data.
    for (const key of Object.keys(database)) delete (database as any)[key];
    empire.deleteVar("settings");
    empire.deleteVar("Options");
    empire.deleteVar("options");
    empire.deleteVar("cities");
    empire.deleteVar("LocalStrings");
    empire.deleteVar("globalData");
    render.toast(Constant.LanguageData[lang].alert_toast);
    setTimeout(function () {
      document.location = (
        document.getElementById("js_cityLink")!.children[0] as HTMLAnchorElement
      ).href;
    }, 3500);
  },

  CheckAll: function () {
    database.settings.hideOnWorldView.value = true;
    database.settings.hideOnIslandView.value = true;
    database.settings.compressedBuildingList.value = true;
    database.settings.dailyBonus.value = true;
    database.settings.wineWarning.value = true;
    database.settings.onTop.value = true;
    database.settings.windowTennis.value = true;
    database.settings.GoldShort.value = true;
    database.settings.newsTicker.value = true;
    database.settings.event.value = true;
    database.settings.birdSwarm.value = true;
    database.settings.walkers.value = true;
    database.settings.noPiracy.value = true;
    database.settings.logInPopup.value = true;
    database.settings.controlCenter.value = true;
    database.settings.withoutFable.value = true;
    database.settings.ambrosiaPay.value = true;
    database.settings.wineWarningTime.value = 96;
    document.location = (
      document.getElementById("js_cityLink")!.children[0] as HTMLAnchorElement
    ).href;
  },

  Check: function () {
    database.settings.hideOnWorldView.value = true;
    database.settings.hideOnIslandView.value = true;
    database.settings.compressedBuildingList.value = true;
    database.settings.dailyBonus.value = true;
    database.settings.wineWarning.value = true;
    database.settings.onTop.value = true;
    database.settings.windowTennis.value = true;
    database.settings.GoldShort.value = false;
    database.settings.newsTicker.value = false;
    database.settings.event.value = false;
    database.settings.birdSwarm.value = true;
    database.settings.walkers.value = true;
    database.settings.noPiracy.value = false;
    database.settings.logInPopup.value = true;
    database.settings.controlCenter.value = true;
    database.settings.withoutFable.value = false;
    database.settings.ambrosiaPay.value = true;
    database.settings.wineWarningTime.value = 96;
    document.location = (
      document.getElementById("js_cityLink")!.children[0] as HTMLAnchorElement
    ).href;
  },
};
/***********************************************************************************************************************
 * database
 **********************************************************************************************************************/
