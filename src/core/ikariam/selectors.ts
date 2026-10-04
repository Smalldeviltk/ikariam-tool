/**
 * Every CSS selector that depends on the game's markup, in one place.
 *
 * This is the most brittle part of the project: Gameforge can change the DOM
 * without warning and the script breaks silently. In the old JS these strings
 * were scattered across ~12k lines, so fixing one selector meant hunting down
 * every copy. From here on, only this file changes.
 */

export const SEL = {
  /** Account name, read from the `title` attribute. */
  accountName: ".avatarName > a.noViewParameters",
  /** The block around the account name, a fallback when its link is absent. */
  accountBlock: ".avatarName",

  /** The `<ul>` holding the town list inside the town-picker dropdown. */
  townListContainer: "#dropDown_js_citySelectContainer > div.bg > ul",

  /** Name of the currently open town. */
  cityBread: "#js_cityBread",
  /** The form the town dropdown submits to change town, and its city field. */
  changeCityForm: "#changeCityForm",
  changeCityInput: "#js_cityIdOnChange",
  /** Shown by the game from the start of a request until it is handled. */
  loadingIndicator: "#loadingPreview",
  /**
   * The game's left city menu. Send Resources appends its entry here; Empire
   * Overview uses the same list. Absent on some pages, so callers fall back.
   */
  menuSlots: ".menu_slots",

  /** Link back to the town view. */
  cityLink: "#js_cityLink > a",
  backlinkButton: "#js_backlinkButton",

  /** Counters in the global menu bar. */
  globalMenu: {
    maxActionPoints: "#js_GlobalMenu_maxActionPoints",
    freeTransporters: "#js_GlobalMenu_freeTransporters",
    freeFreighters: "#js_GlobalMenu_freeFreighters",
    wine: "#js_GlobalMenu_wine",
    /** The current town's stock of one resource. Crystal is `glass` here. */
    resource: (resource: string) =>
      `#js_GlobalMenu_${resource === "glass" ? "crystal" : resource}`,
  },

  /** Building slots around the town. */
  position: (n: number) => `#position${n}`,
  buildings: "div[id^='position'].building:not(.buildingGround)",
  /**
   * The Wine Press. Ikariam's internal name for it is "vineyard".
   *
   * Matched by class, not by slot: the position differs from town to town —
   * one capture has it at `position19`, another at `position20`. Both read
   * `building vineyard level40` with the tooltip "Wine Press (40)".
   */
  winePress: "div[id^='position'].building.vineyard",
  buildingHover: ".hoverable",
  constructionSite: ".constructionSite",
  safehouse: "div.building.safehouse > a",
  buildingUpgradeButton: "#js_buildingUpgradeButton",

  /**
   * The shipment form, as `?view=transport&destinationCityId=<id>` draws it
   * (captured through Bug Report, 03/10): `form#transportForm`, submitted by
   * the game's `checkTransporterForm()`, with the destination in a hidden
   * `destinationCityId` field. The old port town list (`.cities.clearfix`) is
   * gone from the game; the destination is no longer picked from a list.
   */
  shipmentForm: "#transportForm",
  shipmentDestination: (cityId: string) =>
    `#transportForm input[name="destinationCityId"][value="${cityId}"]`,

  /** Fields of the shipment form — unchanged by the game, checked 03/10. */
  resourceField: (resource: string) => `#textfield_${resource}`,
  wineField: "#textfield_wine",
  submit: "#submit",
  freightersMaxButton: "#slider_freighters_max",
  setMax: ".setMax",

  /**
   * Empire Overview board (Build tab / Resource tab).
   *
   * IMPORTANT: this board is rendered by the Empire Overview script
   * (`#empireBoard`), NOT by the game itself. Auto Wine therefore depends on
   * that script running with its board rendered — see `readWineBoard`.
   *
   * Each resource occupies TWO adjacent `td.resource.<name>` cells:
   *   cell 1: span.current (stock) + span.incoming (in transit)
   *   cell 2: span.production.Green + span.consumption.Red + span.emptytime.Red
   */
  buildTabTownNames: "#BuildTab .city_name > span.clickable",
  resTabRows: "#ResTab > table > tbody > tr",
  resTabTownName: "td.city_name > .clickable",
  resTabWineStock: "td.resource.wine span.current",
  resTabWineConsumption: "td.resource.wine span.consumption",
  /** Legacy selector: the first `span.Red` in the wine cell is the consumption one. */
  resTabWineConsumed: "td.resource.wine > span.Red",

  /** Finance cells on the Resource tab. */
  currentWood: "#t_currentwood",
  woodIncome: "#t_woodincome > span.Green",

  /** Barbarian village / barbarian fleet. */
  barbarianVillageResources: "#barbarianVillage ul.resources",
  barbarianFleetResources: "#barbarianFleet ul.resources",

  /** Shipyard — used to calibrate cargo capacity. */
  unitBlocks: "div.units.clearboth",
  merchantShipTitle: '[title="Merchant Ships"]',
  freighterTitle: '[title="Freighter"]',
  upgradeDesc: ".upgrade_desc",

  /** Main content wrapper, used as the MutationObserver root. */
  container: "#container",
  footer: "#footer",
  closeButton: ".close",
} as const;

/** Id of the popup this script creates (reused for every Send Resources dialog). */
export const DIALOG_ID = "ikaMationTransporterDialog";
