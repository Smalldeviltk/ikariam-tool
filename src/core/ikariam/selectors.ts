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

  /** The `<ul>` holding the town list inside the town-picker dropdown. */
  townListContainer: "#dropDown_js_citySelectContainer > div.bg > ul",

  /** Name of the currently open town. */
  cityBread: "#js_cityBread",

  /** Link back to the town view. */
  cityLink: "#js_cityLink > a",
  backlinkButton: "#js_backlinkButton",

  /** Counters in the global menu bar. */
  globalMenu: {
    maxActionPoints: "#js_GlobalMenu_maxActionPoints",
    freeTransporters: "#js_GlobalMenu_freeTransporters",
    freeFreighters: "#js_GlobalMenu_freeFreighters",
    wine: "#js_GlobalMenu_wine",
  },

  /** Building slots around the town. */
  position: (n: number) => `#position${n}`,
  cityPositionLink: (n: number) => `#js_CityPosition${n}Link`,
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

  /** Destination town list inside the trading port view. */
  dockCities: ".cities.clearfix > li > a",

  /** Shipment form in the trading port. */
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

  /**
   * The game's left menu, and the slots inside it.
   *
   * A launcher is appended after the last slot. Empire Overview uses the
   * same anchor; a live capture found 11 matches, so it is real - but Send
   * Resources has to cope with a page where it is not.
   */
  menuSlots: ".menu_slots",
  menuSlotExpandable: ".menu_slots > .expandable",

  /** Pirate fortress. */
  pirateCaptcha: "#pirateCaptureBox > div > form .captchaImage",
  pirateTable: "#pirateCaptureBox > div > table",
  pirateActionLinks: ".action > a",

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
