/**
 * Mechanically ported from the original `legacy/Quản lý Ika Perseus -VN- V2.js`.
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import { reportBug } from "@core/bug-report";
import { waitFor } from "@core/async";
import { qs } from "@core/dom";
import { getCurrentTownName } from "@core/ikariam/globals";
import { modelCityName } from "@core/ikariam/model";
import { SEL } from "@core/ikariam/selectors";
import { describeEntry, trace } from "./ajax-trace";
import $, { pageJQuery } from "./jquery";
import { Constant } from "./constants";
import { MilitaryUnits } from "./models/military";
import { Movement } from "./models/movement";
import { languageText, Utils } from "./utils";
import { database } from "./database";
import { empire } from "./empire";
import { events } from "./events";
import { render } from "./render";

/** How long `switchTownWithGameForm` waits for the new town to settle. */
const TOWN_SWITCH_TIMEOUT_MS = 15_000;

/** How often it looks. */
const TOWN_SWITCH_POLL_MS = 100;

/**
 * How long the game must stay idle, with the new town's name in the
 * breadcrumb, before the switch counts as finished.
 */
const TOWN_SWITCH_SETTLE_MS = 1200;

/**
 * Where a view asked for across a town switch waits for the new page.
 *
 * `sessionStorage`, so it belongs to this tab and dies with it: the switch
 * reloads the page on the live game, and only this tab should open the view.
 */
const PENDING_VIEW_KEY = "ika_pendingBoardView";

/** How old a pending view may be and still be opened after a reload. */
const PENDING_VIEW_MAX_AGE_MS = 30_000;

/** A view to open once the town switch that precedes it is over. */
interface PendingView {
  cityId: number | string;
  mainView: string;
  params: Record<string, unknown>;
  savedAt: number;
}

function savePendingView(view: PendingView): void {
  try {
    sessionStorage.setItem(PENDING_VIEW_KEY, JSON.stringify(view));
  } catch {
    // Without storage the view is only lost across a reload, as before.
  }
}

/** Read the pending view and remove it, so it is opened at most once. */
function takePendingView(): PendingView | null {
  try {
    const raw = sessionStorage.getItem(PENDING_VIEW_KEY);
    sessionStorage.removeItem(PENDING_VIEW_KEY);
    return raw ? (JSON.parse(raw) as PendingView) : null;
  } catch {
    return null;
  }
}

/**
 * Whether the game has a request in flight.
 *
 * Read from the game's own markers: its `executeAjaxRequest` goes through the
 * PAGE's `$.ajax`, which counts open requests in `jQuery.active`, and it
 * shows `#loadingPreview` from `beforeSend` until the response is handled.
 */
function gameIsLoading(): boolean {
  // `active` is real jQuery API (open request count) that its typings omit.
  const gameJQuery = pageJQuery() as { active?: number } | undefined;
  if ((gameJQuery?.active ?? 0) > 0) return true;
  const loading = qs(SEL.loadingIndicator);
  return !!loading && loading.style.display === "block";
}

/** "Updated: ", which the parsers put before the name of what they read. */
function updatedPrefix(): string {
  return languageText().toast_updated;
}

/**
 * Added (not in the original): published with a response that one of these
 * scripts fetched itself (`core/ikariam/http.ts`), rather than one the game
 * loaded and drew. Nothing of such a response is on the page, so the view
 * parsers that read the DOM must not run for it.
 */
export const FETCHED_RESPONSE = "fetched";

export const ikariam: any = {
  _View: null,
  _Host: null,
  _ActionRequest: null,
  _Units: null,
  _BuildingsList: null,
  _AltBuildingsList: null,
  _Nationality: null,
  _GameVersion: null,
  _TemplateView: null,
  _currentCity: null,
  url: function () {
    return "http://" + this.Host() + "/index.php";
  },
  get mainView() {
    return unsafeWindow.ikariam.backgroundView.id;
  },
  get boxViewParams() {
    if (
      unsafeWindow.ikariam.mainbox_x ||
      unsafeWindow.ikariam.mainbox_y ||
      unsafeWindow.ikariam.mainbox_z
    ) {
      return {
        mainbox_x: unsafeWindow.ikariam.mainbox_x,
        mainbox_y: unsafeWindow.ikariam.mainbox_y,
        mainbox_z: unsafeWindow.ikariam.mainbox_z,
      };
    }
    return {};
  },
  /**
   * FIX (not in the original): a link that opens a view of ANOTHER town,
   * followed from the city view, now switches town the game's own way first.
   *
   * The original sent `action=header&function=changeCurrentCity` over ajax
   * and opened the target view in the same request. On the live game that
   * moves the dropdown and opens the right popup, but the city view behind it
   * is not redrawn: the board's "to Saw Mill", "to luxury good" and building
   * level buttons left the old town's buildings on screen under the new
   * town's name, and the next click in the town went wrong until a reload.
   * `backgroundView` was only sent when the view TYPE changed, which a
   * city-to-city jump never does.
   *
   * The switch is what the dropdown itself submits (see
   * `switchTownWithGameForm`), which redraws everything. Once the breadcrumb
   * names the target, the view is loaded as a same-town link. A town missing
   * from the dropdown, or a switch that does not land, falls back to a full
   * page load, which also redraws everything.
   *
   * A link that only changes town, with no `view` — the town names, which
   * Send Resources also clicks to switch town — keeps the original path: it
   * has always redrawn the new town correctly, and two requests would only
   * make it slower.
   *
   * On the live game the switch reloads the whole page (26/09): the board
   * landed in the right town and the view never opened, because the wait
   * below died with the old page. So the view is saved first, and
   * `openPendingView` opens it once the new page is up. A full page load
   * straight to the view's URL was tried by hand and does not open it either.
   * When the switch lands without a reload, the wait opens it and removes it.
   */
  loadUrl: function (ajax, mainView, params, townAlreadySwitched?: boolean) {
    mainView = mainView || ikariam.mainView;
    if (
      !townAlreadySwitched &&
      ajax &&
      ikariam.viewIsCity &&
      mainView === "city" &&
      params.view !== undefined &&
      params.cityId !== undefined &&
      String(ikariam.CurrentCityId) !== String(params.cityId)
    ) {
      savePendingView({
        cityId: params.cityId,
        mainView: mainView,
        params: params,
        savedAt: Date.now(),
      });
      const switching = ikariam.switchTownWithGameForm(
        params.cityId,
        function (switched: boolean) {
          // Opened here, so the next page must not open it again. A switch
          // that never landed keeps it for the page its fallback loads.
          if (switched) takePendingView();
          ikariam.loadUrl(switched, mainView, params, switched);
        },
      );
      if (switching) return;
      takePendingView();
    }
    var paramList: any = { cityId: ikariam.CurrentCityId };
    if (!townAlreadySwitched && ikariam.CurrentCityId !== params.cityId) {
      paramList.action = "header";
      paramList.function = "changeCurrentCity";
      paramList.actionRequest = unsafeWindow.ikariam.model.actionRequest;
      paramList.currentCityId = ikariam.CurrentCityId;
      paramList.oldView = ikariam.mainView;
    }
    if (mainView !== undefined && mainView !== ikariam.mainView) {
      paramList.oldBackgroundView = ikariam.mainView;
      paramList.backgroundView = mainView;
      ajax = false;
    }
    $.extend(paramList, params);
    if (ajax) {
      gotoAjaxURL(
        "?" +
          $.map(paramList, function (value: any, key: string) {
            return key + "=" + value;
          }).join("&"),
      );
    } else {
      gotoURL(
        ikariam.url() +
          "?" +
          $.map(paramList, function (value: any, key: string) {
            return key + "=" + value;
          }).join("&"),
      );
    }
    function gotoURL(url) {
      window.location.assign(url);
    }
    function gotoAjaxURL(url) {
      document.location =
        "javascript:ajaxHandlerCall(" + JSON.stringify(url) + "); void(0);";
    }
  },
  /**
   * Switch town the way the game's dropdown does, then call `done(true)` once the
   * breadcrumb names the target and the view has had time to settle, or
   * `done(false)` if it never gets there.
   *
   * Returns false, without sending anything, when the page lacks the form or
   * the dropdown has no entry for `cityId`; the caller then keeps its
   * original path.
   *
   * The dropdown does not switch town from a click on its `<a>`: the first
   * version of this clicked it, nothing happened, and every board button
   * waited out the full timeout. What the dropdown actually does is put the
   * city id into `#js_cityIdOnChange` and submit `#changeCityForm`, which
   * is exactly how IkaEasy V4 changes town
   * (`sample/IkaEasy-V4-by-RandGor-Chrome-Web-Store/js/page/common.js`,
   * `changeCity`, and its `submitForm` page command). The dropdown entry is
   * still read, but only for the name the breadcrumb will show.
   *
   * "Finished" means the breadcrumb names the target AND the game has had no
   * request in flight for `TOWN_SWITCH_SETTLE_MS`. The first version waited a
   * flat 1200 ms after the breadcrumb flipped and then opened the view; the
   * switch was still loading, and what arrived after closed the dialog that
   * had just opened. If the breadcrumb is right but the game never goes quiet
   * before the timeout, the view is opened anyway rather than reloading a
   * page that has already switched.
   */
  switchTownWithGameForm: function (
    cityId: number | string,
    done: (switched: boolean) => void,
  ): boolean {
    if (!/^\d+$/.test(String(cityId))) return false;
    const anchor = qs(
      SEL.townListContainer + ' > li[selectvalue="' + cityId + '"] > a',
    );
    // The model names the town as the breadcrumb will. The dropdown's title
    // may not: with the game's "show coordinates" option on it reads
    // "[42:96]  M-Corinth", which the breadcrumb never matches, so every
    // switch timed out into a full page load. The title is the fallback.
    const target = (
      modelCityName(cityId) ||
      anchor?.getAttribute("title") ||
      anchor?.textContent ||
      ""
    ).trim();
    if (!anchor || !target) return false;

    const form = qs<HTMLFormElement>(SEL.changeCityForm);
    const cityInput = qs<HTMLInputElement>(SEL.changeCityInput);
    const submitForm = unsafeWindow.ajaxHandlerCallFromForm;
    if (!form || !cityInput || typeof submitForm !== "function") return false;

    cityInput.value = String(cityId);
    submitForm(form);

    const arrived = () => getCurrentTownName() === target;
    let quietSince: number | null = null;
    const settled = () => {
      if (!arrived() || gameIsLoading()) {
        quietSince = null;
        return false;
      }
      const now = Date.now();
      if (quietSince === null) quietSince = now;
      return now - quietSince >= TOWN_SWITCH_SETTLE_MS;
    };

    waitFor(settled, {
      intervalMs: TOWN_SWITCH_POLL_MS,
      timeoutMs: TOWN_SWITCH_TIMEOUT_MS,
      label: `switch to ${target}`,
    }).then(
      () => done(true),
      // Timed out: open the view anyway if the town did switch, otherwise
      // let the caller fall back to a full page load.
      () => done(arrived()),
    );
    return true;
  },
  /**
   * Open the view `loadUrl` saved before a town switch that reloaded the page.
   *
   * Called once the board is up on the new page. The view is opened only if
   * this page is the town it was meant for and it was saved in the last
   * `PENDING_VIEW_MAX_AGE_MS`; anything else is dropped, so a stale one can
   * never open by surprise later. It is opened as a same-town link, which
   * opens views correctly on the live game.
   */
  openPendingView: function (): void {
    const pending = takePendingView();
    if (!pending) return;
    if (Date.now() - pending.savedAt > PENDING_VIEW_MAX_AGE_MS) return;
    if (String(ikariam.CurrentCityId) !== String(pending.cityId)) return;
    ikariam.loadUrl(true, pending.mainView, pending.params, true);
  },
  Host: function () {
    if (this._Host == null) {
      this._Host = "";
      this._Host = document.location.host;
    }
    return this._Host;
  },
  Server: function (host) {
    if (this._Server == null) {
      if (host == undefined) {
        host = this.Host();
      }
      this._Server = "";
      var parts = host.split(".");
      this._Server = parts[0].split("-")[0];
    }
    return this._Server;
  },
  Language: function (host) {
    if (this._Language == null) {
      if (host == undefined) {
        host = this.Host();
      }
      this._Language = "";
      var parts = host.split(".");
      this._Language = parts[0].split("-")[1];
    }
    if (
      this._Language == "us" ||
      this._Language == "au" ||
      this._Language == "hk" ||
      this._Language == "tw" ||
      this._Language == "il" ||
      this._Language == "lt" ||
      this._Language == "hu" ||
      this._Language == "bg" ||
      this._Language == "rs" ||
      this._Language == "si" ||
      this._Language == "sk" ||
      this._Language == "dk" ||
      this._Language == "fi" ||
      this._Language == "ee" ||
      this._Language == "se" ||
      this._Language == "no"
    ) {
      this._Language = "en";
    }
    if (
      this._Language == "ve" ||
      this._Language == "mx" ||
      this._Language == "ar" ||
      this._Language == "co" ||
      this._Language == "cl" ||
      this._Language == "pe"
    ) {
      this._Language = "es";
    }
    if (this._Language == "br") {
      this._Language = "pt";
    }
    if (this._Language == "ae") {
      this._Language = "ar";
    }
    if (this._Language == "gr") {
      this._Language = "el";
    }
    return this._Language;
  },
  Nationality: function (host) {
    if (this._Nationality == null) {
      if (host == undefined) {
        host = this.Host();
      }
      this._Nationality = "";
      var parts = host.split(".");
      this._Nationality = parts[0].split("-")[1];
    }
    return this._Nationality;
  },
  getNextWineTick: function (precision) {
    precision = precision || 1;
    if (precision == 1) {
      return 60 - new Date().getMinutes();
    } else {
      var secs = 3600 - new Date().getMinutes() * 60 - new Date().getSeconds();
      var ret =
        Math.floor(secs / 60) +
        database.getGlobalData.getLocalisedString("minute") +
        " ";
      ret +=
        secs -
        Math.floor(secs / 60) * 60 +
        database.getGlobalData.getLocalisedString("second");
      return ret;
    }
  },
  GameVersion: function () {
    if (this._GameVersion == null) {
      this._GameVersion = $(".version").text().split("v")[1];
    }
    return this._GameVersion;
  },
  get CurrentCityId() {
    return unsafeWindow.ikariam.backgroundView &&
      unsafeWindow.ikariam.backgroundView.id === "city"
      ? ikariam._currentCity ||
          unsafeWindow.ikariam.model.relatedCityData[
            unsafeWindow.ikariam.model.relatedCityData.selectedCity
          ].id
      : unsafeWindow.ikariam.model.relatedCityData[
          unsafeWindow.ikariam.model.relatedCityData.selectedCity
        ].id;
  },
  get viewIsCity() {
    return (
      unsafeWindow.ikariam.backgroundView &&
      unsafeWindow.ikariam.backgroundView.id === "city"
    );
  },
  get viewIsIsland() {
    return (
      unsafeWindow.ikariam.backgroundView &&
      unsafeWindow.ikariam.backgroundView.id === "island"
    );
  },
  get viewIsWorld() {
    return (
      unsafeWindow.ikariam.backgroundView &&
      unsafeWindow.ikariam.backgroundView.id === "worldmap_iso"
    );
  },
  get getCurrentCity() {
    return database.cities[ikariam.CurrentCityId];
  },
  get getCapital() {
    for (var c in database.cities) {
      if (database.cities[c].isCapital) {
        return database.cities[c];
      }
    }
    return false;
  },
  get CurrentTemplateView() {
    try {
      this._CurrentTemplateView = unsafeWindow.ikariam.templateView.id;
    } catch (e) {
      this._CurrentTemplateView = null;
    }
    return this._CurrentTemplateView;
  },
  getLocalizationStrings: function () {
    var localStrings = unsafeWindow.LocalizationStrings;
    if (!localStrings) {
      $("script").each(function (index, script) {
        var match = /LocalizationStrings = JSON.parse\('(.*)'\);/.exec(
          script.innerHTML,
        );
        if (match) {
          localStrings = JSON.parse(match[1]);
          return false;
        }
      });
    }
    var local = $.extend({}, localStrings);
    $.extend(local, local.timeunits.short);
    delete local.warnings;
    delete local.timeunits;
    $.each(local, function (name: string, value: any) {
      database.getGlobalData.addLocalisedString(name.toLowerCase(), value);
    });
    local = null;
  },
  setupEventHandlers: function () {
    events("ajaxResponse").sub(
      function (response, origin?: string) {
        var view, html, data, template;
        // Seen live on s303-en: an entry arrived with nothing at [1], and
        // `response[len][1].id` threw out of this subscriber. jQuery.Callbacks
        // does not isolate subscribers, so the throw took down the whole
        // response — parseViewData, the cityChanged event, and the
        // updateCityData/updateBuildingData publishes for every entry still to
        // come. The town that response described was simply never recorded,
        // which is why a scan could report "9/9 towns visited" while three
        // towns stayed blank on the board.
        if (!Array.isArray(response)) return;
        trace("ajaxResponse", {
          viewIsCity: this.viewIsCity,
          currentCityId: this.CurrentCityId,
          entries: response.map(describeEntry),
        });
        var len = response.length;
        var oldCity = this._currentCity;
        const cityBeforeResponse = this._currentCity;
        while (len) {
          len--;
          var entry = response[len];
          // `[name, null]` is the game's own way of sending nothing for that
          // name, not a malformed entry: a town switch's response carries
          // `updateBacklink`, `popupData`, `removeIngameCounterData` and
          // `ingameCounterData` like this (measured 02/10). Skipped without a
          // bug record — reporting it put noise in every report.
          if (
            Array.isArray(entry) &&
            entry.length === 2 &&
            typeof entry[0] === "string" &&
            entry[1] === null
          ) {
            continue;
          }
          if (!Array.isArray(entry) || entry.length < 2 || entry[1] == null) {
            // Recorded rather than ignored: the shape is worth knowing, and
            // the reporter aggregates repeats rather than flooding.
            reportBug("manual", new Error("Malformed ajaxResponse entry"), {
              entry: JSON.stringify(entry ?? null).slice(0, 200),
              index: len,
              responseLength: response.length,
            });
            continue;
          }
          // Belt and braces: the guard above covers the shape seen live,
          // but this is the game's own data and we do not control it. An
          // entry that still throws is reported and skipped, rather than
          // aborting every entry after it.
          try {
            switch (entry[0]) {
              case "updateGlobalData":
                // `updateGlobalData` does not always carry backgroundData —
                // a live trace showed it arriving with neither that nor a
                // city id, alongside a separate `updateBackgroundData` entry
                // that had both. Indexing into it threw ten times in one
                // session. Nothing to read here means nothing to do.
                if (!entry[1].backgroundData) break;
                this._currentCity = parseInt(entry[1].backgroundData.id);
                var cityData = $.extend(
                  {},
                  entry[1].backgroundData,
                  entry[1].headerData,
                );
                events("updateCityData").pub(
                  this.CurrentCityId,
                  $.extend({}, cityData),
                );
                events("updateBuildingData").pub(
                  this.CurrentCityId,
                  cityData.position,
                );
                break;
              case "changeView":
                view = entry[1][0];
                html = entry[1][1];
                break;
              case "updateTemplateData":
                template = entry[1];
                if (unsafeWindow.ikariam.templateView) {
                  if (
                    unsafeWindow.ikariam.templateView.id == "researchAdvisor"
                  ) {
                    view = unsafeWindow.ikariam.templateView.id;
                  }
                }
                break;
              case "updateBackgroundData":
                oldCity = this.CurrentCityId;
                this._currentCity = parseInt(entry[1].id);
                events("updateCityData").pub(
                  this._currentCity,
                  $.extend(true, {}, unsafeWindow.dataSetForView, entry[1]),
                );
                events("updateBuildingData").pub(
                  this._currentCity,
                  entry[1].position,
                );
                break;
            }
          } catch (e) {
            reportBug("manual", e, {
              where: "ajaxResponse entry",
              entryType: String(entry[0]),
            });
          }
        }
        // Outside the per-entry try above, so it needs its own: a parser that
        // throws here would otherwise skip the `cityChanged` below.
        try {
          this.parseViewData(view, html, template, origin === FETCHED_RESPONSE);
        } catch (e) {
          reportBug("manual", e, { where: "parseViewData", view: view });
        }
        // Added (not in the original): a fetched town is recorded as the
        // current town above, so its data lands on it — and then the player's
        // town is put back. Left as it was, a scan ended with the board taking
        // the last town scanned for the one on screen, and after a quick
        // upgrade the town upgraded: the wrong row highlighted, that town's
        // name and transport buttons doing nothing, and `loadUrl` deciding
        // backwards whether a link needs a town switch.
        if (origin === FETCHED_RESPONSE) {
          this._currentCity = cityBeforeResponse;
          return;
        }
        if (oldCity !== this.CurrentCityId) {
          events("cityChanged").pub(this.CurrentCityId);
        }
      }.bind(ikariam),
    );
    events("formSubmit").sub(
      function (form) {
        var formID = form.getAttribute("id");
        if (!ikariam[formID + "Submitted"]) return false;
        var formSubmission = (function formSubmit() {
          var data = ikariam[formID + "Submitted"]();
          return function formSubmitID(response) {
            var len = response.length;
            var feedback = 0;
            while (len) {
              len--;
              var item = response[len];
              if (Array.isArray(item) && item[0] == "provideFeedback") {
                feedback = item[1] && item[1][0] ? item[1][0].type : 0;
              }
            }
            if (feedback == 10) ikariam[formID + "Submitted"](data);
            events("ajaxResponse").unsub(formSubmission);
          };
        })();
        events("ajaxResponse").sub(formSubmission);
      }.bind(ikariam),
    );
    events(Constant.Events.CITYDATA_AVAILABLE).sub(
      ikariam.FetchAllTowns.bind(ikariam),
    );
  },
  Init: function () {
    this.setupEventHandlers();
  },
  parseViewData: function (view, html, tData, fetched?: boolean) {
    if (this.getCurrentCity) {
      // Added (not in the original): of a fetched response only the Town
      // Hall is parsed — a scan's request, read from the template data alone.
      // Every other parser reads the view from the page, where a fetched
      // view never is: the Palace and Museum parsers threw on it, and the
      // Palace's first set the form of government to "" for every cost
      // computed after it.
      if (fetched) {
        if (view === Constant.Buildings.TOWN_HALL) {
          this.parseTownHall(tData, true);
        }
        return;
      }
      switch (view) {
        case "finances":
          this.parseFinances(
            $("#finances").find("table.table01 tr").slice(2).children("td"),
          );
          break;
        case Constant.Buildings.TOWN_HALL:
          this.parseTownHall(tData);
          break;
        case "militaryAdvisor":
          this.parseMilitaryAdvisor(html, tData);
          break;
        case "cityMilitary":
          this.parseCityMilitary();
          break;
        case "researchAdvisor":
          this.parseResearchAdvisor(tData);
          break;
        case Constant.Buildings.PALACE:
          this.parsePalace();
          break;
        case Constant.Buildings.ACADEMY:
          this.parseAcademy(tData);
          break;
        case "culturalPossessions_assign":
          this.parseCulturalPossessions(html);
          break;
        case Constant.Buildings.MUSEUM:
          this.parseMuseum();
          break;
        case Constant.Buildings.TAVERN:
          this.parseTavern();
          break;
        case "transport":
        case "plunder":
          this.transportFormSubmitted();
          break;
        case Constant.Buildings.TEMPLE:
          this.parseTemple(tData);
          break;
        case Constant.Buildings.BARRACKS:
        case Constant.Buildings.SHIPYARD:
          this.parseBarracks(view, html, tData);
          break;
        case "deployment":
        case "plunder":
          this.parseMilitaryTransport();
          break;
        case "premium":
          this.parsePremium(view, html, tData);
          break;
      }
    }
  },
  parsePalace: function () {
    var governmentType = $("#formOfRuleContent")
      .find("td.government_desc h3")
      .text();
    // FIX (not in the original): no text means the Palace is not on the page.
    // Storing "" broke every cost computed after it, since no form of
    // government is called "" (`Constant.GovernmentData[""]` is undefined).
    if (!governmentType) return;
    var changed = database.getGlobalData.getGovernmentType != governmentType;
    database.getGlobalData.governmentType = governmentType;
    if (changed)
      events(Constant.Events.GLOBAL_UPDATED).pub({ type: "government" });
    database.getGlobalData.addLocalisedString(
      "Current form",
      $("#palace").find("div.contentBox01h h3.header").get(0).textContent,
    );
    render.toast(updatedPrefix() + $("#palace").children(":first").text());
  },
  parseCulturalPossessions: function (html) {
    var allCulturalGoods = html.match(/iniValue\s:\s(\d*)/g);
    var changes = [];
    $.each(html.match(/goodscity_(\d*)/g), function (i) {
      var cityID = this.split("_")[1];
      var culturalGoods = parseInt(allCulturalGoods[i].split(" ").pop());
      var changed = database.cities[cityID]._culturalGoods != culturalGoods;
      if (changed) {
        database.cities[cityID]._culturalGoods = culturalGoods;
        changes.push(cityID);
      }
    });
    if (changes.length)
      $.each(changes, function (idx, cityID) {
        events(Constant.Events.CITY_UPDATED).pub(cityID, {
          culturalGoods: true,
        });
      });
    render.toast(
      updatedPrefix() + $("#culturalPossessions_assign > .header").text(),
    );
  },
  parseMuseum: function () {
    var changed;
    var regText = $("#val_culturalGoodsDeposit")
      .parent()
      .text()
      .match(/(\d+)/g);
    // `.match` returns null when the museum panel has not rendered; the
    // original went straight to `.length` and threw a TypeError.
    if (regText && regText.length == 2) {
      changed = ikariam.getCurrentCity.updateCulturalGoods(
        parseInt(regText[0]),
      );
    }
    if (changed)
      events(Constant.Events.CITY_UPDATED).pub(ikariam.CurrentCityId, {
        culturalGoods: true,
      });
    render.toast(
      updatedPrefix() + $("#tab_museum > div > h3").get(0).textContent,
    );
  },
  parseTavern: function () {},
  resTransportObject: function () {
    return {
      id: null,
      wood: 0,
      wine: 0,
      marble: 0,
      glass: 0,
      sulfur: 0,
      gold: 0,
      targetCityId: 0,
      arrivalTime: 0,
      originCityId: 0,
      loadedTime: 0,
      mission: "",
    };
  },
  troopTransportObject: function () {
    return {
      id: null,
      troops: {},
      targetCityId: 0,
      arrivalTime: 0,
      originCityId: 0,
      returnTime: 0,
      mission: "",
    };
  },
  parseBarracks: function (view, html, tData) {
    var type =
      view == Constant.Buildings.BARRACKS
        ? "army"
        : view == Constant.Buildings.SHIPYARD
          ? "fleet"
          : false;
    var city = ikariam.getCurrentCity;
    var currentUnits = {};
    var i = 14;
    while (i--) {
      if (tData["js_barracksUnitUnitsAvailable" + (i - 1)]) {
        currentUnits[
          tData["js_barracksUnitClass" + (i - 1)]["class"].split(" ").pop()
        ] = parseInt(tData["js_barracksUnitUnitsAvailable" + (i - 1)].text);
      }
    }
    var changes = city.military.updateUnits(currentUnits);
    var elem = $("#unitConstructionList");
    if (elem.length) {
      var tasks = [];
      tasks.push({
        units: parseUnits(elem.find("> .army_wrapper .army")),
        completionTime: parseTime($("#unitBuildCountDown").text()),
        type: type,
      });
      elem.find("div.constructionBlock").each(function () {
        tasks.push({
          units: parseUnits($(this).find("> .army_wrapper .army")),
          completionTime: parseTime($(this).find("h4 > span").text()),
          type: type,
        });
      });
      changes = changes.concat(city.military.setTraining(tasks));
    }
    elem = null;
    if (changes.length) {
      events(Constant.Events.MILITARY_UPDATED).pub(
        city.getId,
        $.exclusive(changes),
      );
    }
    function parseUnits(element) {
      var units = {};
      element.each(function () {
        units[Constant.unitIds[this.classList.toString().match(/(\d+)/g)]] =
          parseInt(this.nextElementSibling.textContent.match(/(\d+)/g));
      });
      return units;
    }
    function parseTime(timeText) {
      var completionTime = new Date();
      var server = ikariam.Nationality();
      completionTime.setSeconds(
        completionTime.getSeconds() +
          (timeText.match(/(\d+)s/)
            ? parseInt(timeText.match(/(\d+)s/)[1])
            : 0),
      );
      completionTime.setMinutes(
        completionTime.getMinutes() +
          (timeText.match(/(\d+)m/)
            ? parseInt(timeText.match(/(\d+)m/)[1])
            : 0),
      );
      completionTime.setHours(
        completionTime.getHours() +
          (timeText.match(/(\d+)h/)
            ? parseInt(timeText.match(/(\d+)h/)[1])
            : 0),
      );
      completionTime.setDate(
        completionTime.getDate() +
          (timeText.match(/(\d+)D/)
            ? parseInt(timeText.match(/(\d+)D/)[1])
            : 0),
      );
      switch (server) {
        case "de":
          completionTime.setDate(
            completionTime.getDate() +
              (timeText.match(/(\d+)T/)
                ? parseInt(timeText.match(/(\d+)T/)[1])
                : 0),
          );
          break;
        case "gr":
          completionTime.setDate(
            completionTime.getDate() +
              (timeText.match(/(\d+)M/)
                ? parseInt(timeText.match(/(\d+)M/)[1])
                : 0),
          );
          break;
        case "fr":
          completionTime.setDate(
            completionTime.getDate() +
              (timeText.match(/(\d+)J/)
                ? parseInt(timeText.match(/(\d+)J/)[1])
                : 0),
          );
          break;
        case "ro":
          completionTime.setDate(
            completionTime.getDate() +
              (timeText.match(/(\d+)Z/)
                ? parseInt(timeText.match(/(\d+)Z/)[1])
                : 0),
          );
          break;
        case "it":
        case "tr":
          completionTime.setDate(
            completionTime.getDate() +
              (timeText.match(/(\d+)G/)
                ? parseInt(timeText.match(/(\d+)G/)[1])
                : 0),
          );
          break;
        case "ir":
        case "ae":
          completionTime.setSeconds(
            completionTime.getSeconds() +
              (timeText.match(/(\d+)ث/)
                ? parseInt(timeText.match(/(\d+)ث/)[1])
                : 0),
          );
          completionTime.setMinutes(
            completionTime.getMinutes() +
              (timeText.match(/(\d+)د/)
                ? parseInt(timeText.match(/(\d+)د/)[1])
                : 0),
          );
          completionTime.setHours(
            completionTime.getHours() +
              (timeText.match(/(\d+)س/)
                ? parseInt(timeText.match(/(\d+)س/)[1])
                : 0),
          );
          completionTime.setDate(
            completionTime.getDate() +
              (timeText.match(/(\d+)ر/)
                ? parseInt(timeText.match(/(\d+)ر/)[1])
                : 0),
          );
          break;
      }
      return completionTime.getTime();
    }
    render.toast(updatedPrefix() + $("#js_mainBoxHeaderTitle").text());
  },
  /**
   * First call without data will parse the transportform, second call will add the forms data to the database
   */
  transportFormSubmitted: function (data) {
    try {
      if (!data) {
        var journeyTime = $("#journeyTime").text();
        var loadingTime = $("#loadingTime").text();
        var wood = parseInt(String($("#textfield_wood").val()));
        var wine = parseInt(String($("#textfield_wine").val()));
        var marble = parseInt(String($("#textfield_marble").val()));
        var glass = parseInt(String($("#textfield_glass").val()));
        var sulfur = parseInt(String($("#textfield_sulfur").val()));
        var gold = "";
        var targetID = $("input[name=destinationCityId]").val();
        var ships = $("#transporterCount").val();
        var arrTime = new Date();
        var loadedTime = new Date();
        var server = ikariam.Nationality();

        arrTime.setSeconds(
          arrTime.getSeconds() +
            (journeyTime.match(/(\d+)s/)
              ? parseInt(journeyTime.match(/(\d+)s/)[1])
              : 0),
        );
        arrTime.setMinutes(
          arrTime.getMinutes() +
            (journeyTime.match(/(\d+)m/)
              ? parseInt(journeyTime.match(/(\d+)m/)[1])
              : 0),
        );
        arrTime.setHours(
          arrTime.getHours() +
            (journeyTime.match(/(\d+)h/)
              ? parseInt(journeyTime.match(/(\d+)h/)[1])
              : 0),
        );
        arrTime.setDate(
          arrTime.getDate() +
            (journeyTime.match(/(\d+)D/)
              ? parseInt(journeyTime.match(/(\d+)D/)[1])
              : 0),
        );
        if (server == "de")
          arrTime.setDate(
            arrTime.getDate() +
              (journeyTime.match(/(\d+)T/)
                ? parseInt(journeyTime.match(/(\d+)T/)[1])
                : 0),
          );

        loadedTime.setSeconds(
          loadedTime.getSeconds() +
            (loadingTime.match(/(\d+)s/)
              ? parseInt(loadingTime.match(/(\d+)s/)[1])
              : 0),
        );
        loadedTime.setMinutes(
          loadedTime.getMinutes() +
            (loadingTime.match(/(\d+)m/)
              ? parseInt(loadingTime.match(/(\d+)m/)[1])
              : 0),
        );
        loadedTime.setHours(
          loadedTime.getHours() +
            (loadingTime.match(/(\d+)h/)
              ? parseInt(loadingTime.match(/(\d+)h/)[1])
              : 0),
        );
        loadedTime.setDate(
          loadedTime.getDate() +
            (loadingTime.match(/(\d+)D/)
              ? parseInt(loadingTime.match(/(\d+)D/)[1])
              : 0),
        );
        if (server == "de")
          loadedTime.setDate(
            loadedTime.getDate() +
              (loadingTime.match(/(\d+)T/)
                ? parseInt(loadingTime.match(/(\d+)T/)[1])
                : 0),
          );

        return new Movement(
          "XXX-" + arrTime.getTime(),
          this.CurrentCityId,
          targetID,
          arrTime.getTime() + loadedTime.getTime() - $.now(),
          "transport",
          loadedTime.getTime(),
          {
            gold: gold || 0,
            wood: wood || 0,
            wine: wine || 0,
            marble: marble || 0,
            glass: glass || 0,
            sulfur: sulfur || 0,
          },
          undefined,
          ships,
        );
      } else {
        database.getGlobalData.addFleetMovement(data);
        events(Constant.Events.MOVEMENTS_UPDATED).pub([data.getTargetCityId]);
      }
    } catch (e) {
      empire.error("transportFormSubmitted", e);
    } finally {
    }
  },
  parseMilitaryTransport: function (submit) {
    submit = submit || false;
    var that = this;
    if (submit) {
      var journeyTime = $("#journeyTime").text();
      var returnTime = $("#returnTime").text();
      var targetID = $("input:[name=destinationCityId]").val();
      var troops = {};
      var mission = "";
      $("ul.assignUnits li input.textfield").each(function () {
        const input = this as HTMLInputElement;
        // The original compared the string `value` against the number 0,
        // which is never equal — so the guard always passed, including for
        // empty inputs. Comparing against "" is what was meant.
        if (input.value !== "") {
          troops[this.getAttribute("name").split("_").pop()] = parseInt(
            input.value,
          );
        }
        if (mission === "") {
          mission = "deploy" + this.getAttribute("name").match(/_(.*)_/)[1];
        } else {
          mission = "plunder" + this.getAttribute("name").match(/_(.*)_/)[1];
        }
      });
      var arrTime = new Date();
      var transport = this.troopTransportObject();
      var server = ikariam.Nationality();
      transport.id = "XXX-" + arrTime.getTime();
      transport.targetCityId = targetID;
      transport.originCityId = this.CurrentCityId;
      transport.mission = mission;
      transport.troops = troops;
      arrTime.setSeconds(
        arrTime.getSeconds() +
          (journeyTime.match(/(\d+)s/)
            ? parseInt(journeyTime.match(/(\d+)s/)[1])
            : 0),
      );
      arrTime.setMinutes(
        arrTime.getMinutes() +
          (journeyTime.match(/(\d+)m/)
            ? parseInt(journeyTime.match(/(\d+)m/)[1])
            : 0),
      );
      arrTime.setHours(
        arrTime.getHours() +
          (journeyTime.match(/(\d+)h/)
            ? parseInt(journeyTime.match(/(\d+)h/)[1])
            : 0),
      );
      arrTime.setDate(
        arrTime.getDate() +
          (journeyTime.match(/(\d+)D/)
            ? parseInt(journeyTime.match(/(\d+)D/)[1])
            : 0),
      );
      if (server == "de")
        arrTime.setDate(
          arrTime.getDate() +
            (journeyTime.match(/(\d+)T/)
              ? parseInt(journeyTime.match(/(\d+)T/)[1])
              : 0),
        );
      transport.arrivalTime = arrTime.getTime();
      arrTime = new Date();
      arrTime.setSeconds(
        arrTime.getSeconds() +
          (returnTime.match(/(\d+)s/)
            ? parseInt(returnTime.match(/(\d+)s/)[1])
            : 0),
      );
      arrTime.setMinutes(
        arrTime.getMinutes() +
          (returnTime.match(/(\d+)m/)
            ? parseInt(returnTime.match(/(\d+)m/)[1])
            : 0),
      );
      arrTime.setHours(
        arrTime.getHours() +
          (returnTime.match(/(\d+)h/)
            ? parseInt(returnTime.match(/(\d+)h/)[1])
            : 0),
      );
      arrTime.setDate(
        arrTime.getDate() +
          (returnTime.match(/(\d+)D/)
            ? parseInt(returnTime.match(/(\d+)D/)[1])
            : 0),
      );
      if (server == "de")
        arrTime.setDate(
          arrTime.getDate() +
            (returnTime.match(/(\d+)T/)
              ? parseInt(returnTime.match(/(\d+)T/)[1])
              : 0),
        );
      transport.returnTime = arrTime.getTime();
      database.getGlobalData.addFleetMovement(transport);
      render.toast(updatedPrefix() + languageText().toast_movementAdded);
      return false;
    } else {
      return true;
    }
  },
  parseFinances: function ($elem) {
    var updateTime = $.now();
    var changed;
    for (var i = 1; i < database.getCityCount + 1; i++) {
      var city = database.cities[Object.keys(database.cities)[i - 1]];
      if (city !== false) {
        changed = city.updateIncome(
          parseInt(
            $elem[i * 4 - 3].textContent
              .split(
                database.getGlobalData.getLocalisedString("thousandSeperator"),
              )
              .join(""),
          ),
        );
        changed =
          city.updateExpenses(
            parseInt(
              $elem[i * 4 - 2].textContent
                .split(
                  database.getGlobalData.getLocalisedString(
                    "thousandSeperator",
                  ),
                )
                .join(""),
            ),
          ) || changed;
      }
      if (changed)
        events(Constant.Events.CITY_UPDATED).pub(city.getId, {
          finances: true,
        });
    }
    var $breakdown = $("#finances").find("tbody tr.bottomLine td:last-child");
    database.getGlobalData.finance.armyCost = parseInt(
      $breakdown[0].textContent
        .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
        .join(""),
    );
    database.getGlobalData.finance.fleetCost = parseInt(
      $breakdown[1].textContent
        .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
        .join(""),
    );
    database.getGlobalData.finance.armySupply = parseInt(
      $breakdown[2].textContent
        .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
        .join(""),
    );
    database.getGlobalData.finance.fleetSupply = parseInt(
      $breakdown[3].textContent
        .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
        .join(""),
    );
    events("globalData").pub({ finances: true });
    database.getGlobalData.addLocalisedString(
      "finances",
      $("#finances").find("h3#js_mainBoxHeaderTitle").text(),
    );
    render.toast(updatedPrefix() + $("#finances").children(":first").text());
  },
  parseResearchAdvisor: function (data) {
    var changes = [];
    var research = JSON.parse(
      data.new_js_params || data.load_js.params,
    ).currResearchType;
    $.each(research, function (name: string, Data: any) {
      var id = parseInt(Data.aHref.match(/researchId=([0-9]+)/i)[1]);
      var level = name.match(/\((\d+)\)/);
      var explored = level
        ? parseInt(level[1]) - 1
        : Data.liClass === "explored"
          ? 1
          : 0;
      var changed = database.getGlobalData.updateResearchTopic(id, explored);
      if (changed) changes.push({ type: "research_topic", subType: id });
      database.getGlobalData.addLocalisedString(
        "research_" + id,
        name.split("(").shift(),
      );
    });
    if (changes.length) events(Constant.Events.GLOBAL_UPDATED).pub(changes);
    database.getGlobalData.addLocalisedString(
      "researchpoints",
      $("li.points").text().split(":")[0],
    );
    render.toast(
      updatedPrefix() + $("#tab_researchAdvisor").children(":first").text(),
    );
  },
  parseAcademy: function (data) {
    var city = ikariam.getCurrentCity;
    var changed = city.updateResearchers(
      parseInt(data.js_AcademySlider.slider.ini_value),
    );
    if (changed)
      events(Constant.Events.CITY_UPDATED).pub(ikariam.CurrentCityId, {
        research: changed,
      });
    render.toast(
      updatedPrefix() + $("#academy h3#js_mainBoxHeaderTitle").text(),
    );
  },
  parseTownHall: function (data, quiet?: boolean) {
    var changes: any = {};
    var city = ikariam.getCurrentCity;
    var cultBon =
      parseInt(
        data.js_TownHallSatisfactionOverviewCultureBoniTreatyBonusValue.text,
      ) || 0;
    var priests =
      parseInt(
        data.js_TownHallPopulationGraphPriestCount.text
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      ) || 0;
    var researchers =
      parseInt(data.js_TownHallPopulationGraphScientistCount.text) || 0;
    changes.culturalGoods = city.updateCulturalGoods(cultBon / 50);
    changes.priests = city.updatePriests(priests);
    changes.research = city.updateResearchers(researchers);
    events(Constant.Events.CITY_UPDATED).pub(ikariam.CurrentCityId, changes);
    // Added (not in the original): `quiet` for a fetched Town Hall. The town
    // name is read from the page, where a fetched view is not, so a scan
    // raised one "Updated:" toast with no name per town.
    if (!quiet)
      render.toast(updatedPrefix() + $("#js_TownHallCityName").text());
  },
  parseTemple: function (data) {
    var priests = parseInt(data.js_TempleSlider.slider.ini_value) || 0;
    var changed = ikariam.getCurrentCity.updatePriests(priests);
    events(Constant.Events.CITY_UPDATED).pub(ikariam.CurrentCityId, {
      priests: changed,
    });
  },
  parseMilitaryAdvisor: function (html, data) {
    try {
      var ownMovementIds = [];
      var move;
      for (var key in data) {
        var match = key.match(/^js_MilitaryMovementsEventRow(\d+)$/);
        if (match && Utils.existsIn(data[key]["class"], "own")) {
          ownMovementIds.push(match[1]);
        }
      }
      var changes: any = 0;
      if (ownMovementIds.length) {
        changes = database.getGlobalData.clearFleetMovements();
        $.each(ownMovementIds, function (idx: number, value: any) {
          var transport = new Movement(value);
          var targetAvatar = "";
          transport._id = parseInt(value);
          transport._arrivalTime =
            data["js_MilitaryMovementsEventRow" + value + "ArrivalTime"]
              .countdown.enddate * 1000;
          transport._loadingTime = 0;
          transport._originCityId = parseInt(
            data[
              "js_MilitaryMovementsEventRow" + value + "OriginLink"
            ].href.match(/cityId=(\d+)/)[1],
          );
          transport._targetCityId = parseInt(
            data[
              "js_MilitaryMovementsEventRow" + value + "TargetLink"
            ].href.match(/cityId=(\d+)/)[1],
          );
          transport._mission =
            data["js_MilitaryMovementsEventRow" + value + "MissionIcon"][
              "class"
            ].split(" ")[1];
          var status =
            data["js_MilitaryMovementsEventRow" + value + "Mission"]["class"];
          if (status) {
            if (Utils.existsIn(status, "arrow_left_green")) {
              var t = transport._originCityId;
              transport._originCityId = transport._targetCityId;
              transport._targetCityId = t;
            }
          } else {
            var serverTyp = 1;
            if (ikariam.Server() == "s201" || ikariam.Server() == "s202")
              serverTyp = 3;
            transport._loadingTime = transport._arrivalTime;
            if (
              database.getCityFromId(transport._originCityId) &&
              database.getCityFromId(transport._targetCityId)
            ) {
              transport._arrivalTime +=
                Utils.estimateTravelTime(
                  database.getCityFromId(transport._originCityId)
                    .getCoordinates,
                  database.getCityFromId(transport._targetCityId)
                    .getCoordinates,
                ) / serverTyp;
            }
          }
          switch (transport._mission) {
            case "trade":
            case "transport":
            case "plunder":
              $.each(
                data["js_MilitaryMovementsEventRow" + value + "UnitDetails"]
                  .appendElement,
                function (index: number, item: any) {
                  if (Utils.existsIn(item["class"], Constant.Resources.WOOD)) {
                    transport._resources.wood = parseInt(
                      item.text
                        .split(
                          database.getGlobalData.getLocalisedString(
                            "thousandSeperator",
                          ),
                        )
                        .join(""),
                    );
                  } else if (
                    Utils.existsIn(item["class"], Constant.Resources.WINE)
                  ) {
                    transport._resources.wine = parseInt(
                      item.text
                        .split(
                          database.getGlobalData.getLocalisedString(
                            "thousandSeperator",
                          ),
                        )
                        .join(""),
                    );
                  } else if (
                    Utils.existsIn(item["class"], Constant.Resources.MARBLE)
                  ) {
                    transport._resources.marble = parseInt(
                      item.text
                        .split(
                          database.getGlobalData.getLocalisedString(
                            "thousandSeperator",
                          ),
                        )
                        .join(""),
                    );
                  } else if (
                    Utils.existsIn(item["class"], Constant.Resources.GLASS)
                  ) {
                    transport._resources.glass = parseInt(
                      item.text
                        .split(
                          database.getGlobalData.getLocalisedString(
                            "thousandSeperator",
                          ),
                        )
                        .join(""),
                    );
                  } else if (
                    Utils.existsIn(item["class"], Constant.Resources.SULFUR)
                  ) {
                    transport._resources.sulfur = parseInt(
                      item.text
                        .split(
                          database.getGlobalData.getLocalisedString(
                            "thousandSeperator",
                          ),
                        )
                        .join(""),
                    );
                  } else if (
                    Utils.existsIn(item["class"], Constant.Resources.GOLD)
                  ) {
                    transport._resources.gold = parseInt(
                      item.text
                        .split(
                          database.getGlobalData.getLocalisedString(
                            "thousandSeperator",
                          ),
                        )
                        .join(""),
                    );
                  }
                },
              );
              break;
            case "deployarmy":
            case "deployfleet":
            case "plunder":
              transport._military = new MilitaryUnits();
              $.each(
                data["js_MilitaryMovementsEventRow" + value + "UnitDetails"]
                  .appendElement,
                function (index, item) {
                  $.each(
                    Constant.UnitData,
                    function findIsUnit(val: string, info: any) {
                      if (Utils.existsIn(item["class"], " " + val)) {
                        transport._military.setUnit(val, parseInt(item.text));
                        return false;
                      }
                    },
                  );
                },
              );
              break;
            default:
              return true;
          }
          database.getGlobalData.addFleetMovement(transport);
          changes.push(transport._targetCityId);
        });
      }
      if (changes.length)
        events(Constant.Events.MOVEMENTS_UPDATED).pub($.exclusive(changes));
    } catch (e) {
      empire.error("parseMilitaryAdvisor", e);
    } finally {
    }
    render.toast(
      updatedPrefix() + $("#js_MilitaryMovementsFleetMovements h3").text(),
    );
  },
  parseCityMilitary: function () {
    try {
      var $elemArmy = $("#tabUnits").find("> div.contentBox01h td");
      var $elemShips = $("#tabShips").find("> div.contentBox01h td");
      var city = ikariam.getCurrentCity;
      var cityArmy = {};
      cityArmy[Constant.Military.SLINGER] = parseInt(
        $elemArmy[5].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.SWORDSMAN] = parseInt(
        $elemArmy[4].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.HOPLITE] = parseInt(
        $elemArmy[1].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.MARKSMAN] = parseInt(
        $elemArmy[7].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.MORTAR] = parseInt(
        $elemArmy[11].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.CATAPULT] = parseInt(
        $elemArmy[10].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.RAM] = parseInt(
        $elemArmy[8].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.STEAM_GIANT] = parseInt(
        $elemArmy[2].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.BALLOON_BOMBADIER] = parseInt(
        $elemArmy[13].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.COOK] = parseInt(
        $elemArmy[14].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.DOCTOR] = parseInt(
        $elemArmy[15].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.GYROCOPTER] = parseInt(
        $elemArmy[12].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.ARCHER] = parseInt(
        $elemArmy[6].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.SPEARMAN] = parseInt(
        $elemArmy[3].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.SPARTAN] = parseInt(
        $elemArmy[16].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );

      cityArmy[Constant.Military.RAM_SHIP] = parseInt(
        $elemShips[3].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.FLAME_THROWER] = parseInt(
        $elemShips[1].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.SUBMARINE] = parseInt(
        $elemShips[8].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.BALLISTA_SHIP] = parseInt(
        $elemShips[4].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.CATAPULT_SHIP] = parseInt(
        $elemShips[5].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.MORTAR_SHIP] = parseInt(
        $elemShips[6].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.STEAM_RAM] = parseInt(
        $elemShips[2].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.ROCKET_SHIP] = parseInt(
        $elemShips[7].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.PADDLE_SPEEDBOAT] = parseInt(
        $elemShips[10].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.BALLOON_CARRIER] = parseInt(
        $elemShips[11].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      cityArmy[Constant.Military.TENDER] = parseInt(
        $elemShips[12].innerHTML
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      var changes = city.military.updateUnits(cityArmy);
      $elemArmy = null;
      $elemShips = null;
      events(Constant.Events.MILITARY_UPDATED).pub(city.getId, changes);
    } catch (e) {
      empire.error("parseCityMilitary", e);
    } finally {
    }
  },
  parsePremium: function (view, html, tData) {
    var changes = [];
    var features = [];
    $("#premiumOffers")
      .find('table.table01 tbody > tr[class]:not([class=""])')
      .each(function () {
        var item = $(this).attr("class").split(" ").shift();
        if (Constant.PremiumData[item] !== undefined) {
          features.push(item);
        }
      });
    $.each(features, function (index, val) {
      var active = false;
      var endTime = 0;
      var continuous = false;
      var type = 0;
      active = $("#js_buy" + val + "ActiveTime").hasClass("green");
      if (active) {
        endTime =
          parseInt(
            $("#js_buy" + val + "Link")
              .attr("href")
              .split("typeUntil=")
              .pop()
              .split("&")
              .shift(),
          ) - Constant.PremiumData[val].duration;
        if (isNaN(endTime)) {
          var str = $("#js_buy" + val + "ActiveTime").text();
          var time = new Date();
          time.setSeconds(
            time.getSeconds() +
              (str.match(/(\d+)s/) ? parseInt(str.match(/(\d+)s/)[1]) : 0),
          );
          time.setMinutes(
            time.getMinutes() +
              (str.match(/(\d+)m/) ? parseInt(str.match(/(\d+)m/)[1]) : 0),
          );
          time.setHours(
            time.getHours() +
              (str.match(/(\d+)h/) ? parseInt(str.match(/(\d+)h/)[1]) : 0),
          );
          time.setDate(
            time.getDate() +
              (str.match(/(\d+)D/) ? parseInt(str.match(/(\d+)D/)[1]) : 0),
          );
          endTime = time.getTime() / 1000;
        }
        type = parseInt(
          $("#js_buy" + val + "Link")
            .attr("href")
            .split("type=")
            .pop()
            .split("&")
            .shift(),
        );
        continuous = $("#empireViewExtendCheckbox" + type + "Img").hasClass(
          "checked",
        );
      }
      changes.push(
        database.getGlobalData.setPremiumFeature(
          val,
          endTime * 1000,
          continuous,
        ),
      );
    });
    events(Constant.Events.PREMIUM_UPDATED).pub(changes);
    render.toast(updatedPrefix() + $("#premium").children(":first").text());
  },
  FetchAllTowns: function () {
    var _relatedCityData = unsafeWindow.ikariam.model.relatedCityData;
    var _cityId = null;
    var city = null;
    var order = database.settings.cityOrder.value;
    if (!order.length) order = [];
    if (_relatedCityData) {
      for (_cityId in _relatedCityData) {
        if (_cityId != "selectedCity" && _cityId != "additionalInfo") {
          var own = _relatedCityData[_cityId].relationship == "ownCity";
          var deployed =
            _relatedCityData[_cityId].relationship == "deployedCities";
          var occupied =
            _relatedCityData[_cityId].relationship == "occupiedCities";
          if (own) {
            if (database.cities[_relatedCityData[_cityId].id] == undefined) {
              (database.cities[_relatedCityData[_cityId].id] = database.addCity(
                _relatedCityData[_cityId].id,
              )).init();
              city = database.cities[_relatedCityData[_cityId].id];
              city.updateTradeGoodID(
                parseInt(_relatedCityData[_cityId].tradegood),
              );
              city.isOwn = own;
            }
            city = database.cities[_relatedCityData[_cityId].id];
            city.updateName(_relatedCityData[_cityId].name);
            // BUG IN THE ORIGINAL: the regex had no `g` flag. A single-group
            // match returns [wholeMatch, group1], and with one group both
            // entries are the SAME number — so `"[12:34]"` produced
            // ["12","12"] and every city's Y coordinate silently became a
            // copy of its X. `g` makes it return every number: ["12","34"].
            // Values are also parsed to numbers here, matching the other
            // call site which passes `parseInt(...)`.
            var coords = _relatedCityData[_cityId].coords.match(/\d+/g);
            if (coords && coords.length >= 2) {
              city.updateCoordinates(parseInt(coords[0]), parseInt(coords[1]));
            }
            if ($.inArray(city.getId, order) == -1) {
              order.push(city.getId);
            }
          }
        }
      }
      // Drop towns that are genuinely no longer ours.
      //
      // THE ORIGINAL TREATED ABSENCE AS PROOF OF LOSS: any own town missing
      // from `relatedCityData` was deleted outright. But that object
      // describes the view you are currently on, not the empire — so every
      // town except the one on screen looked like a ghost, was deleted, and
      // was recreated empty by the loop above on the next pass. Everything
      // the board had recorded about it went with it.
      //
      // That is why a scan could walk all nine towns, with the ajax trace
      // showing 25 building positions arriving for each of them, and still
      // leave the Buildings tab blank: the data was written into City
      // objects that were thrown away moments later. The give-away was
      // `knownTime` — set once in the City constructor and preserved
      // through save/load — jumping forward by 45 minutes between two
      // exports, which only a fresh `new City()` can do.
      //
      // Absence now means nothing. A town is removed only when the game
      // says, in so many words, that it is no longer an `ownCity`.
      for (_cityId in _relatedCityData) {
        if (_cityId === "selectedCity" || _cityId === "additionalInfo") {
          continue;
        }
        var entry = _relatedCityData[_cityId];
        if (!entry || entry.relationship === "ownCity") continue;
        var known = database.cities[entry.id];
        if (known && known.isOwn) {
          delete database.cities[entry.id];
        }
      }
    }
    database.settings.cityOrder.value = order;
  },
  get currentShips() {
    if (this.$freeTransporters == undefined) {
      this.$freeTransporters = $("#js_GlobalMenu_freeTransporters");
    }
    return parseInt(this.$freeTransporters.text());
  },
};

/***********************************************************************************************************************
 * Constants
 **********************************************************************************************************************/
