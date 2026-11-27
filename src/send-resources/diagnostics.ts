/**
 * Application-specific diagnostics for the bug reporter.
 *
 * `core/bug-report.ts` knows nothing about queues, towns or selectors — it just
 * asks registered providers for context when something goes wrong. This is that
 * provider, plus a selector health check.
 *
 * The context recorded here is chosen from what actually turned out to matter
 * while debugging this codebase: which task was running, whether the game model
 * was readable, which view the page was on, and whether the selectors the
 * feature depends on were matching anything at all. "Nothing happened" is almost
 * always one of those four.
 */

import {
  buildBugReport,
  clearBugs,
  getBugs,
  registerContextProvider,
  summariseBugs,
} from "@core/bug-report";
import { qs, qsa } from "@core/dom";
import { errorMessage } from "@core/format";
import { getCurrentTownName, pageWindow } from "@core/ikariam/globals";
import {
  actionRequestToken,
  ikariamRequest,
  quickUpgradeTraces,
  redactTokens,
  tokenInEntries,
  toolNewestToken,
  toolRequestTraces,
  townSwitchTraces,
} from "@core/ikariam/http";
import { recentLogLines } from "@core/logger";
import {
  hasModel,
  modelCityName,
  modelCurrentCityId,
  modelCurrentCityName,
} from "@core/ikariam/model";
import { DIALOG_ID, SEL } from "@core/ikariam/selectors";
import { positionsFromResponse } from "./features/auto-build";
import { pirateCaptureTraces } from "./features/pirate";
import { ownTownIds } from "./features/sync-towns";
import { ELEMENT_CRAWL } from "./messages";
import { getState } from "./state";
import { LAUNCHER_CLASS, WINDOW_ID } from "./ui/panel";

/**
 * Selectors whose absence explains a whole class of "it did nothing".
 *
 * Deliberately a small set: this is probed on every bug, so it has to stay
 * cheap, and a long list of selectors that are legitimately absent on the
 * current screen would only add noise.
 */
const CRITICAL_SELECTORS: Record<string, string> = {
  cityBread: SEL.cityBread,
  townList: SEL.townListContainer,
  // Belongs to the Empire Overview script, not the game. Its absence is the
  // reason town switching used to be impossible with Send Resources alone.
  buildTabTownNames: SEL.buildTabTownNames,
  freeTransporters: SEL.globalMenu.freeTransporters,
};

/** How many of the critical selectors currently match. */
export function selectorHealth(): Record<string, number> {
  const health: Record<string, number> = {};
  for (const [name, selector] of Object.entries(CRITICAL_SELECTORS)) {
    try {
      health[name] = qsa(selector).length;
    } catch {
      health[name] = -1; // the selector itself is malformed
    }
  }
  return health;
}

/** Everything worth attaching to a bug record. */
function appContext(): Record<string, unknown> {
  const context: Record<string, unknown> = {
    town: getCurrentTownName() || null,
    modelTown: modelCurrentCityName(),
    hasModel: hasModel(),
    selectors: selectorHealth(),
    dialogOpen: !!qs(`#${DIALOG_ID}`),
  };

  // State may not exist yet — errors can fire before `initState`.
  try {
    const { accountName, queue } = getState();
    const head = queue.head();
    context.account = accountName;
    context.queueLength = queue.length;
    context.queueHead = head
      ? { type: head.type, id: head.id, data: head.data }
      : null;
  } catch {
    context.stateInitialised = false;
  }

  return context;
}

/** Characters kept of each captured piece of game markup or source. */
const MAX_CAPTURE_CHARS = 20_000;
/** Log lines a report carries, newest first. */
const MAX_REPORT_LOG_LINES = 200;
/** Visible controls listed from the shipment screen. */
const MAX_CAPTURED_CONTROLS = 200;
/** Characters kept of each control's text. */
const MAX_CONTROL_TEXT = 40;
/** What counts as a control on the shipment screen. */
const SHIPMENT_CONTROLS =
  "form, input, select, button, a.button, [id^=slider], [id*=submit]";
/**
 * This script's own controls — its window, its launcher, its settings
 * dialogs — left out of the capture: with the window open they were most of
 * the list (03/10), and none of them is the game's.
 */
const OWN_CONTROLS = `#${WINDOW_ID}, .${LAUNCHER_CLASS}, #${DIALOG_ID}`;

/**
 * The shipment screen as the game draws it today — what the shipment handler
 * fills in, so a report shows whether the game has changed it. Only on screen
 * after "Transport goods" was clicked; otherwise `present` is false.
 *
 * The form around the wine field, and every control of the game's that is
 * showing.
 */
function captureShipmentForm(): Record<string, unknown> {
  const wineField = qs<HTMLInputElement>(SEL.wineField);
  return {
    present: !!wineField,
    url: location.search,
    wineFieldForm:
      wineField?.form?.outerHTML.slice(0, MAX_CAPTURE_CHARS) ?? null,
    visibleControls: visibleGameControls(),
  };
}

/**
 * Every control of the game's that is showing — forms, fields, buttons,
 * sliders — left out those inside `leaveOut` (this script's own by default);
 * the first `MAX_CAPTURED_CONTROLS`.
 */
function visibleGameControls(
  leaveOut: string = OWN_CONTROLS,
): Record<string, unknown>[] {
  return qsa<HTMLElement>(SHIPMENT_CONTROLS)
    .filter(
      (element) => element.offsetParent !== null && !element.closest(leaveOut),
    )
    .slice(0, MAX_CAPTURED_CONTROLS)
    .map((element) => {
      const field = element as HTMLInputElement;
      return {
        tag: element.tagName,
        id: element.id,
        name: element.getAttribute("name"),
        cls: String(element.className).slice(0, 80),
        type: field.type,
        value: field.value,
        text: (element.textContent ?? "").trim().slice(0, MAX_CONTROL_TEXT),
        form: field.form?.id,
      };
    });
}

/**
 * The game's `createPopup`. Its parameters were named from this capture
 * (03/10, `IkariamPageApi` in `core/ikariam/globals.ts`); kept, because the
 * game can change it again. Neither script wraps it, so the source read here
 * is the game's own.
 */
function captureCreatePopupSource(): string | null {
  const popup = (
    pageWindow as unknown as { ikariam?: { createPopup?: unknown } }
  ).ikariam?.createPopup;
  return typeof popup === "function"
    ? String(popup).slice(0, MAX_CAPTURE_CHARS)
    : null;
}

/**
 * Data read from the game itself, from the page as it is when Bug Report is
 * pressed. Each piece is caught on its own, so one that fails
 * cannot take the rest of the report with it.
 */
export function captureGameData(): Record<string, unknown> {
  const capture = (read: () => unknown) => {
    try {
      return read();
    } catch (e) {
      return { error: errorMessage(e) };
    }
  };
  return {
    shipmentForm: capture(captureShipmentForm),
    createPopupSource: capture(captureCreatePopupSource),
    // What the game answered the board's quick upgrades.
    quickUpgrades: capture(quickUpgradeTraces),
    // Town switches that did not land, each with the tool's requests before it.
    townSwitches: capture(townSwitchTraces),
    // The tool's own latest requests, with tags of the tokens.
    toolRequests: capture(toolRequestTraces),
    // What the game answered the last captures Pirate could not start.
    pirateCaptures: capture(pirateCaptureTraces),
  };
}

export interface FullBugReport {
  /** The bug report plus `gameData` and the recent log, as JSON. */
  text: string;
  /** Whether the shipment form was on screen and is in `text`. */
  shipmentFormCaptured: boolean;
  /** Whether the game's `createPopup` source is in `text`. */
  createPopupCaptured: boolean;
  /** How many quick upgrades, with the game's answers, are in `text`. */
  quickUpgradesCaptured: number;
}

/**
 * The bug report, plus the game data above and the newest log lines — what
 * Bug Report saves — and which of the game data was actually there, so the
 * player can be told.
 *
 * The log is what a bug record cannot show: the order things happened in
 * across page loads (`Going to town …`, `Back to the town view: …`, reloads).
 * Two reports of a town switch that never landed (03/10) could not be
 * explained without it.
 */
export function exportFullBugReport(): FullBugReport {
  const gameData = captureGameData();
  const shipmentForm = gameData.shipmentForm as { present?: unknown };
  const log = recentLogLines(MAX_REPORT_LOG_LINES);
  return {
    text: JSON.stringify({ ...buildBugReport(), gameData, log }, null, 2),
    shipmentFormCaptured: shipmentForm?.present === true,
    createPopupCaptured: typeof gameData.createPopupSource === "string",
    quickUpgradesCaptured: Array.isArray(gameData.quickUpgrades)
      ? gameData.quickUpgrades.length
      : 0,
  };
}

let installed = false;

/**
 * Register the context provider and expose the console helpers.
 *
 * The console commands mirror `tools/collect-dom-report.js` so there is one
 * habit to learn: do the thing, then copy the result out.
 */
export function installDiagnostics(): void {
  if (installed) return;
  installed = true;

  registerContextProvider(appContext);

  const anyWindow = window as unknown as Record<string, unknown>;
  anyWindow.ikaBugs = () => {
    console.log(summariseBugs());
    return getBugs();
  };
  anyWindow.ikaBugReport = () => {
    const json = exportFullBugReport().text;
    try {
      // DevTools' console helper; undefined anywhere else.
      const copyToClipboard = anyWindow.copy as
        ((text: string) => void) | undefined;
      copyToClipboard?.(json);
    } catch {
      /* clipboard only exists in the DevTools console */
    }
    return json;
  };
  anyWindow.ikaClearBugs = () => {
    clearBugs();
    console.log("[ika] bug reports cleared");
  };
}

/* ──────────────────── Crawl by id: an element, or JS code ───────────────── */

/** How many elements an HTML crawl describes: the target, then its descendants. */
const ELEMENT_CRAWL_MAX_ELEMENTS = 300;

/**
 * The computed properties an HTML crawl records for each element: the ones
 * that decide where a box goes and how wide it is.
 */
const LAYOUT_PROPERTIES = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "margin",
  "padding",
  "border",
  "boxSizing",
  "overflowX",
  "overflowY",
  "float",
  "clear",
  "zIndex",
  "flex",
  "flexDirection",
  "flexWrap",
  "alignItems",
  "justifyContent",
  "gap",
  "gridTemplateColumns",
  "whiteSpace",
  "textOverflow",
  "tableLayout",
  "verticalAlign",
  "visibility",
  "opacity",
  "transform",
  "fontSize",
  "lineHeight",
  "color",
  "backgroundColor",
] as const;

/**
 * Why a crawl, or one part of it, could not be done: where it stopped, and
 * the error as thrown, stack included. Written to the file in place of what
 * could not be read, so a failed crawl still says why.
 */
export interface CrawlError {
  /** The step that failed: `find`, `selector`, `sheet`, `element`, `compile`, `run`, `save`... */
  stage: string;
  name: string;
  message: string;
  stack?: string;
  /** The error that stopped it, when the step reported it in its own words. */
  cause?: CrawlError;
}

/**
 * A crawl that cannot go on, thrown to the code that saves its error file:
 * the step, the reason in the player's words, and the error behind it when
 * there is one.
 */
export class CrawlStopped extends Error {
  constructor(
    readonly stage: string,
    message: string,
    readonly reason?: unknown,
  ) {
    super(message);
    this.name = "CrawlStopped";
  }
}

/** Record what was thrown; a `CrawlStopped` keeps its own step. */
export function crawlErrorOf(stage: string, error: unknown): CrawlError {
  if (error instanceof CrawlStopped) {
    return {
      stage: error.stage,
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error.reason === undefined
        ? {}
        : { cause: crawlErrorOf(error.stage, error.reason) }),
    };
  }
  if (error instanceof Error) {
    return {
      stage,
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { stage, name: typeof error, message: errorMessage(error) };
}

/**
 * One element as an HTML crawl records it. When reading it threw, `error`
 * says why and the parts not read are missing.
 */
export interface CrawledElement {
  /** `div#holder.a.b`. */
  element: string;
  /** How deep below the target: 0 is the target itself. */
  depth: number;
  rect?: { left: number; top: number; width: number; height: number };
  style?: Record<string, string>;
  /** Indexes into the crawl's `rules`: the style rules that match it. */
  rules?: number[];
  error?: CrawlError;
}

export interface ElementCrawl {
  ok: true;
  target: string;
  /** How many elements the target matches; the first is the one crawled. */
  matches: number;
  html: string;
  elements: CrawledElement[];
  /** More elements below the target than `ELEMENT_CRAWL_MAX_ELEMENTS`. */
  elementsCut: boolean;
  /** Every rule that matches at least one crawled element, once each. */
  rules: string[];
  /**
   * Stylesheets whose rules the page would not hand over (another origin's,
   * as the game's own sheets may be), with the error it gave: a rule missing
   * from `rules` may sit in one of these. `style` still shows their effect.
   */
  unreadableSheets: { sheet: string; error: CrawlError }[];
}

/** An HTML crawl that could not be done, and why. */
export interface FailedElementCrawl {
  ok: false;
  target: string;
  error: CrawlError;
}

/** `div#id.class1.class2`. */
function describeElement(element: Element): string {
  const id = element.id ? `#${element.id}` : "";
  const classes = Array.from(element.classList)
    .map((name) => `.${name}`)
    .join("");
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

/** The style rules of every sheet, nested @media and @supports included. */
function readableStyleRules(): {
  rules: CSSStyleRule[];
  unreadable: ElementCrawl["unreadableSheets"];
} {
  const rules: CSSStyleRule[] = [];
  const unreadable: ElementCrawl["unreadableSheets"] = [];
  const walk = (list: CSSRuleList): void => {
    for (const rule of Array.from(list)) {
      if ("selectorText" in rule && "style" in rule) {
        rules.push(rule as CSSStyleRule);
      } else if ("cssRules" in rule) {
        walk((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch (e) {
      unreadable.push({
        sheet: sheet.href ?? "(inline sheet)",
        error: crawlErrorOf("sheet", e),
      });
      continue;
    }
    walk(list);
  }
  return { rules, unreadable };
}

/**
 * Whether a rule applies to the element. A selector list matches when any of
 * its parts does, and a part naming a pseudo-element (`::before`) never
 * does. Should the engine refuse the whole list, each part is tried alone.
 */
function ruleMatches(rule: CSSStyleRule, element: Element): boolean {
  try {
    return element.matches(rule.selectorText);
  } catch {
    return rule.selectorText.split(",").some((part) => {
      try {
        return element.matches(part.trim());
      } catch {
        return false;
      }
    });
  }
}

/**
 * Find what a crawl names: an element id first, as typed, then a CSS
 * selector. A crawl error when nothing matches, or when the text is not an
 * id on the page and not a valid selector either.
 */
function findCrawlTarget(
  target: string,
): { element: Element; matches: number } | CrawlError {
  const byId = document.getElementById(target);
  if (byId) return { element: byId, matches: 1 };
  let all: NodeListOf<Element>;
  try {
    all = document.querySelectorAll(target);
  } catch (e) {
    return crawlErrorOf("selector", e);
  }
  if (all.length === 0) {
    return {
      stage: "find",
      name: "NotFound",
      message: ELEMENT_CRAWL.notFound(target),
    };
  }
  return { element: all[0], matches: all.length };
}

/** One element's box, layout properties and matching rules. */
function crawlOne(
  element: Element,
  depth: number,
  allRules: readonly CSSStyleRule[],
  addRule: (rule: CSSStyleRule) => number,
): CrawledElement {
  const label = describeElement(element);
  try {
    const box = element.getBoundingClientRect();
    const computed = getComputedStyle(element);
    const style: Record<string, string> = {};
    for (const property of LAYOUT_PROPERTIES) {
      style[property] = computed[property];
    }
    const rules = allRules
      .filter((rule) => ruleMatches(rule, element))
      .map(addRule);
    return {
      element: label,
      depth,
      rect: {
        left: Math.round(box.left),
        top: Math.round(box.top),
        width: Math.round(box.width),
        height: Math.round(box.height),
      },
      style,
      rules,
    };
  } catch (e) {
    return { element: label, depth, error: crawlErrorOf("element", e) };
  }
}

/**
 * An element's HTML, and for it and each element below it, its box, its
 * layout properties as computed, and the rules that match it.
 *
 * Never throws: what stops the whole crawl comes back as `ok: false` with
 * the error, and what fails for one element or one sheet is recorded beside
 * it while the rest is still read.
 */
export function crawlElement(
  target: string,
): ElementCrawl | FailedElementCrawl {
  try {
    const found = findCrawlTarget(target);
    if (!("element" in found)) return { ok: false, target, error: found };
    const { rules: allRules, unreadable } = readableStyleRules();
    const ruleIndex = new Map<CSSStyleRule, number>();
    const rules: string[] = [];
    const addRule = (rule: CSSStyleRule): number => {
      let index = ruleIndex.get(rule);
      if (index === undefined) {
        index = rules.push(rule.cssText) - 1;
        ruleIndex.set(rule, index);
      }
      return index;
    };

    const descendants = Array.from(found.element.querySelectorAll("*"));
    const elements = [found.element, ...descendants]
      .slice(0, ELEMENT_CRAWL_MAX_ELEMENTS)
      .map((element) => {
        let depth = 0;
        for (
          let node: Element | null = element;
          node && node !== found.element;
          node = node.parentElement
        ) {
          depth++;
        }
        return crawlOne(element, depth, allRules, addRule);
      });

    return {
      ok: true,
      target,
      matches: found.matches,
      html: found.element.outerHTML,
      elements,
      elementsCut: descendants.length + 1 > ELEMENT_CRAWL_MAX_ELEMENTS,
      rules,
      unreadableSheets: unreadable,
    };
  } catch (e) {
    return { ok: false, target, error: crawlErrorOf("crawl", e) };
  }
}

/** Limits on what a JS crawl writes out of its result. */
const RESULT_MAX_DEPTH = 6;
const RESULT_MAX_ITEMS = 500;
const RESULT_MAX_STRING = 100_000;
const RESULT_ELEMENT_HTML = 2_000;

/**
 * A value made safe for JSON: depth, list length and text length capped,
 * repeated objects, functions and elements replaced by a short note, and a
 * getter that throws recorded rather than thrown. Returning `window` or the
 * game's model would otherwise freeze the tab or write a huge file.
 */
function toJsonSafe(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const convert = (item: unknown, depth: number): unknown => {
    if (item === undefined) return "[undefined]";
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number") {
      return Number.isFinite(item) ? item : String(item);
    }
    if (typeof item === "string") {
      return item.length > RESULT_MAX_STRING
        ? `${item.slice(0, RESULT_MAX_STRING)}… [${item.length} chars]`
        : item;
    }
    if (typeof item === "bigint") return `${item}n`;
    if (typeof item === "symbol") return item.toString();
    if (typeof item === "function") {
      return `[Function ${item.name || "anonymous"}]`;
    }
    const object = item as object;
    if (object instanceof Element) {
      return {
        element: describeElement(object),
        html: object.outerHTML.slice(0, RESULT_ELEMENT_HTML),
      };
    }
    if (seen.has(object)) return "[Circular]";
    if (depth >= RESULT_MAX_DEPTH) return "[Too deep]";
    seen.add(object);
    try {
      if (object instanceof Error) {
        return {
          name: object.name,
          message: object.message,
          stack: object.stack,
        };
      }
      if (object instanceof Map) {
        return convert(Array.from(object.entries()), depth);
      }
      if (object instanceof Set) {
        return convert(Array.from(object.values()), depth);
      }
      if (Array.isArray(object) || object instanceof NodeList) {
        const list = Array.from(object as ArrayLike<unknown>);
        const kept = list
          .slice(0, RESULT_MAX_ITEMS)
          .map((entry) => convert(entry, depth + 1));
        if (list.length > RESULT_MAX_ITEMS) {
          kept.push(`… [${list.length - RESULT_MAX_ITEMS} more]`);
        }
        return kept;
      }
      const out: Record<string, unknown> = {};
      const keys = Object.keys(object);
      for (const key of keys.slice(0, RESULT_MAX_ITEMS)) {
        try {
          out[key] = convert(
            (object as Record<string, unknown>)[key],
            depth + 1,
          );
        } catch (e) {
          out[key] = `[Threw: ${errorMessage(e)}]`;
        }
      }
      if (keys.length > RESULT_MAX_ITEMS) {
        out["…"] = `[${keys.length - RESULT_MAX_ITEMS} more keys]`;
      }
      return out;
    } finally {
      seen.delete(object);
    }
  };
  return convert(value, 0);
}

export type CodeCrawl =
  /** What the code returned, made safe for JSON (`toJsonSafe`). */
  | { code: string; ok: true; result: unknown }
  /** `compile`: not valid JS; `run`: it threw or rejected; `save`: its result could not be written out. */
  | { code: string; ok: false; error: CrawlError };

type AsyncCode = () => Promise<unknown>;

/**
 * Compile what was typed: as one expression when it is one (`1 + 2`, a
 * console snippet), otherwise as a function body, which needs its own
 * `return`. `await` works in both. Throws when it is neither, or when the
 * page forbids compiling code.
 */
function compileCode(code: string): AsyncCode {
  const AsyncFunction = Object.getPrototypeOf(async () => {})
    .constructor as new (body: string) => AsyncCode;
  const expression = code.trim().replace(/;+\s*$/, "");
  try {
    return new AsyncFunction(`return (\n${expression}\n);`);
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    return new AsyncFunction(code);
  }
}

/**
 * Run JS typed into the crawl box and record what it returned, or where and
 * why it failed. Never throws.
 */
export async function crawlCode(code: string): Promise<CodeCrawl> {
  let compiled: AsyncCode;
  try {
    compiled = compileCode(code);
  } catch (e) {
    return { code, ok: false, error: crawlErrorOf("compile", e) };
  }
  let result: unknown;
  try {
    result = await compiled();
  } catch (e) {
    return { code, ok: false, error: crawlErrorOf("run", e) };
  }
  try {
    return { code, ok: true, result: toJsonSafe(result) };
  } catch (e) {
    return { code, ok: false, error: crawlErrorOf("save", e) };
  }
}

/* ──────────────── Crawl Page: the game screen open right now ───────────── */

/**
 * The class every crawl box of the tool carries, so a page crawl can leave
 * the boxes out of what it saves.
 */
export const CRAWL_BOX_CLASS = "ika-crawl-box";

/**
 * The tool's own parts of the page, left out of a page crawl: this script's
 * window, launcher, settings dialogs and crawl boxes, the toasts of both
 * scripts, and the Empire Overview board. None of them is the game's, and the
 * board alone is larger than most game screens.
 */
const TOOL_UI = `${OWN_CONTROLS}, .${CRAWL_BOX_CLASS}, #empireBoard, #ika-toast-stack`;

/** Characters kept of the page's HTML; past it the file says it was cut. */
const PAGE_CRAWL_MAX_HTML = 2_000_000;

/** What counts as a field of a form. */
const FORM_FIELDS = "input, select, textarea, button";

/** Inline pictures are long and say nothing about the screen. */
const DATA_URI = /data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;
const DATA_URI_PLACEHOLDER = "data:<removed>";

/** One field of a form, hidden ones included: what the form would send. */
export interface CrawledField {
  tag: string;
  type: string | null;
  id: string;
  name: string | null;
  value: string;
  checked?: boolean;
  visible: boolean;
}

/** One form on the page, with every field it holds. */
export interface CrawledForm {
  id: string;
  name: string | null;
  action: string | null;
  method: string | null;
  onsubmit: string | null;
  visible: boolean;
  fields: CrawledField[];
  html: string;
  /** Whether `html` was cut at `MAX_CAPTURE_CHARS`. */
  htmlTruncated: boolean;
}

/** A page crawl: the screen as the game has drawn it. */
export interface PageCrawl {
  url: string;
  title: string;
  forms: CrawledForm[];
  visibleControls: Record<string, unknown>[];
  /** The page's body, without the tool's parts, scripts or inline pictures. */
  html: string;
  /** The length of that HTML before any cut. */
  htmlLength: number;
  /** Whether `html` was cut at `PAGE_CRAWL_MAX_HTML`. */
  truncated: boolean;
}

function isShowing(element: Element): boolean {
  return (element as HTMLElement).offsetParent !== null;
}

function crawlField(element: Element): CrawledField {
  const field = element as HTMLInputElement;
  const type = element.getAttribute("type");
  const checkable = type === "checkbox" || type === "radio";
  return {
    tag: element.tagName,
    type,
    id: element.id,
    name: element.getAttribute("name"),
    value: typeof field.value === "string" ? field.value : "",
    ...(checkable ? { checked: field.checked } : {}),
    visible: isShowing(element),
  };
}

function crawlForm(form: HTMLFormElement): CrawledForm {
  const html = form.outerHTML.replace(DATA_URI, DATA_URI_PLACEHOLDER);
  return {
    id: form.id,
    name: form.getAttribute("name"),
    action: form.getAttribute("action"),
    method: form.getAttribute("method"),
    onsubmit: form.getAttribute("onsubmit"),
    visible: isShowing(form),
    fields: qsa(FORM_FIELDS, form).map(crawlField),
    html: html.slice(0, MAX_CAPTURE_CHARS),
    htmlTruncated: html.length > MAX_CAPTURE_CHARS,
  };
}

/** The page's body as HTML, the tool's parts and every script taken out. */
function pageHtmlWithoutTool(): string {
  const body = document.body.cloneNode(true) as HTMLElement;
  for (const element of qsa(`${TOOL_UI}, script`, body)) element.remove();
  return body.outerHTML.replace(DATA_URI, DATA_URI_PLACEHOLDER);
}

/**
 * The game screen open right now, for a screen the tool does not know yet:
 * every form with all of its fields — hidden ones too, which is what the
 * form sends — the controls that are showing, and the page's HTML. Reads the
 * page only; nothing is clicked or sent.
 */
export function crawlPage(): PageCrawl {
  const html = pageHtmlWithoutTool();
  return {
    url: location.href,
    title: document.title,
    forms: qsa<HTMLFormElement>("form")
      .filter((form) => !form.closest(TOOL_UI))
      .map(crawlForm),
    visibleControls: visibleGameControls(TOOL_UI),
    html: html.slice(0, PAGE_CRAWL_MAX_HTML),
    htmlLength: html.length,
    truncated: html.length > PAGE_CRAWL_MAX_HTML,
  };
}

/* ─────── Crawl Research: the views research, population and gold read ───── */

/** One view asked of the game: what was sent, and its answer or the error. */
export interface ViewCapture {
  request: Record<string, string | number>;
  response?: unknown[];
  error?: string;
}

/** The buildings whose views a research crawl asks for, in every town. */
const RESEARCH_TOWN_BUILDINGS = ["academy", "temple"] as const;
type ResearchTownBuilding = (typeof RESEARCH_TOWN_BUILDINGS)[number];

/** One town of a research crawl. */
export interface ResearchTown {
  cityId: number;
  name: string | null;
  townHall: ViewCapture;
  /** Each building's view; null when the town has no such building. */
  buildings: Record<ResearchTownBuilding, ViewCapture | null>;
}

/** A research crawl: the game's own answers, kept as they came. */
export interface ResearchCrawl {
  server: string;
  towns: ResearchTown[];
  /** The Palace's view, which shows the form of government; null with none. */
  palace: ViewCapture | null;
  researchAdvisor: ViewCapture;
  /** Every research track, each asked for as the advisor's own tabs do. */
  researchTracks: ResearchTracks;
  finances: ViewCapture;
  /** Whether asking moved the town the game has selected. */
  selectionMoved: boolean;
}

/** The Research Advisor's tracks, each one's answer, and the tab put back. */
export interface ResearchTracks {
  /** Each track's answer, by its `researchType` (`economy`, `knowledge`...). */
  tracks: Record<string, ViewCapture>;
  /** The track the advisor had open, asked for last to leave it open. */
  active: string | null;
  /** Whether that last request was answered; null when none was sent. */
  restored: boolean | null;
  /** Why no track was asked for, when none was. */
  skipped?: string;
}

/**
 * The tracks the Research Advisor's tabs switch to, read from its answer:
 * `js_researchAdvisorChangeResearchType<N>` carries
 * `{ ajaxrequest: "?view=noViewChange&researchType=economy", class }`, the
 * open one with class `active`. In tab order.
 */
function researchTracksOf(response: unknown[] | undefined): {
  types: string[];
  active: string | null;
} {
  const types: string[] = [];
  let active: string | null = null;
  const template = response?.find(
    (entry) => Array.isArray(entry) && entry[0] === "updateTemplateData",
  ) as [string, unknown] | undefined;
  const data = template?.[1];
  if (data === null || typeof data !== "object") return { types, active };
  const tabs = Object.entries(data as Record<string, unknown>)
    .filter(([key]) => /^js_researchAdvisorChangeResearchType\d+$/.test(key))
    .sort(
      ([a], [b]) =>
        Number(a.replace(/\D+/g, "")) - Number(b.replace(/\D+/g, "")),
    );
  for (const [, tab] of tabs) {
    if (tab === null || typeof tab !== "object") continue;
    const { ajaxrequest, class: className } = tab as {
      ajaxrequest?: unknown;
      class?: unknown;
    };
    if (typeof ajaxrequest !== "string") continue;
    const type = new URLSearchParams(ajaxrequest.replace(/^[^?]*\?/, "")).get(
      "researchType",
    );
    if (!type) continue;
    types.push(type);
    if (
      typeof className === "string" &&
      className.split(/\s+/).includes("active")
    ) {
      active = type;
    }
  }
  return { types, active };
}

/**
 * The slot of the first building `key` in a town's `position` array, or
 * null. An entry's `building` is the building's class first (`"academy"`),
 * so only that first word is compared.
 */
function slotOfBuilding(
  positions: unknown[] | null,
  key: string,
): number | null {
  if (positions === null) return null;
  const slot = positions.findIndex((entry) => {
    if (entry === null || typeof entry !== "object") return false;
    const building = (entry as { building?: unknown }).building;
    return typeof building === "string" && building.split(/\s+/)[0] === key;
  });
  return slot === -1 ? null : slot;
}

/**
 * Ask the game for the views that show research effects, population,
 * satisfaction and the scientists' gold, and keep the answers as they come:
 * their shapes are not known yet, so nothing is parsed.
 *
 * Every town: its Town Hall (the scan's request), and its Academy and Temple
 * when it has them, found from the Town Hall's `position` array. Once: the
 * Palace (form of government), the Research Advisor and Finances. A request
 * that fails is written down with its error, and the crawl goes on.
 *
 * Every token an answer carries is handed back for the file's redaction:
 * should any of the requests move the token, the page's current one would
 * not cover the earlier ones. The game's selected town is put back if asking moved it, as
 * the scan does.
 */
export async function collectResearchViews(): Promise<{
  crawl: ResearchCrawl;
  tokens: Set<string>;
}> {
  const tokens = new Set<string>();
  const ask = async (
    request: Record<string, string | number>,
  ): Promise<ViewCapture> => {
    try {
      const response = await ikariamRequest(request);
      const token = tokenInEntries(response);
      if (token) tokens.add(token);
      return { request, response };
    } catch (e) {
      return { request, error: errorMessage(e) };
    }
  };
  const buildingRequest = (
    view: string,
    cityId: number,
    position: number,
  ): Record<string, string | number> => ({
    view,
    cityId,
    position,
    backgroundView: "city",
    currentCityId: cityId,
    templateView: view,
  });
  // The scan's own request for a town (`fetchTown`).
  const townHallRequest = (
    cityId: number,
  ): Record<string, string | number> => ({
    view: "townHall",
    cityId,
    position: 0,
    backgroundView: "city",
    currentCityId: cityId,
  });

  const before = modelCurrentCityId();
  const towns: ResearchTown[] = [];
  let palace: ViewCapture | null = null;
  for (const cityId of ownTownIds()) {
    const townHall = await ask(townHallRequest(cityId));
    const positions = townHall.response
      ? positionsFromResponse(townHall.response, String(cityId))
      : null;
    const buildings = {} as Record<ResearchTownBuilding, ViewCapture | null>;
    for (const key of RESEARCH_TOWN_BUILDINGS) {
      const slot = slotOfBuilding(positions, key);
      buildings[key] =
        slot === null ? null : await ask(buildingRequest(key, cityId, slot));
    }
    if (palace === null) {
      const slot = slotOfBuilding(positions, "palace");
      if (slot !== null)
        palace = await ask(buildingRequest("palace", cityId, slot));
    }
    towns.push({ cityId, name: modelCityName(cityId), townHall, buildings });
  }
  const researchAdvisor = await ask({ view: "researchAdvisor" });
  const researchTracks = await askEveryResearchTrack(researchAdvisor, ask);
  const finances = await ask({ view: "finances" });

  const after = modelCurrentCityId();
  const selectionMoved = before !== null && after !== null && before !== after;
  if (selectionMoved) await ask(townHallRequest(before));

  return {
    crawl: {
      server: location.host,
      towns,
      palace,
      researchAdvisor,
      researchTracks,
      finances,
      selectionMoved,
    },
    tokens,
  };
}

/**
 * Each research track, as the advisor's tabs ask for it — the advisor
 * answers for the open track only, so the levels of the others (Well
 * Construction, Letter Chute in Science) need their own request. The open
 * track goes last, so the advisor is left on the tab the player had; with no
 * open track known, nothing is switched.
 *
 * Sent with `templateView: "researchAdvisor"`: the game's tab link goes
 * through `ajaxHandlerCall`, which adds the view's context to the bare link.
 */
async function askEveryResearchTrack(
  advisor: ViewCapture,
  ask: (request: Record<string, string | number>) => Promise<ViewCapture>,
): Promise<ResearchTracks> {
  const { types, active } = researchTracksOf(advisor.response);
  const tracks: Record<string, ViewCapture> = {};
  if (active === null) {
    return {
      tracks,
      active,
      restored: null,
      skipped: advisor.error
        ? `the Research Advisor was not read: ${advisor.error}`
        : "the Research Advisor's answer names no open track",
    };
  }
  const request = (researchType: string) => ({
    view: "noViewChange",
    researchType,
    templateView: "researchAdvisor",
  });
  for (const type of types) {
    if (type !== active) tracks[type] = await ask(request(type));
  }
  tracks[active] = await ask(request(active));
  return { tracks, active, restored: tracks[active].error === undefined };
}

/**
 * Every session token the page holds now: the model's, the newest a request
 * of the tool's was answered with, and any form field named `actionRequest`
 * (the town switch form has one, `#js_ChangeCityActionRequest`).
 */
function pageSessionTokens(): Set<string> {
  const tokens = new Set<string>();
  const candidates = [
    actionRequestToken(),
    toolNewestToken(),
    ...qsa<HTMLInputElement>('input[name="actionRequest"]').map(
      (input) => input.value,
    ),
  ];
  for (const token of candidates) {
    if (typeof token === "string" && token) tokens.add(token);
  }
  return tokens;
}

/**
 * The text of a crawl's file, with every session token taken out, as Bug
 * Report does: the player sends these files on, and an element's HTML, a
 * value read by JS, or the page's address can carry the live token.
 * `moreTokens` are the ones the page no longer holds — a crawl that asked
 * the game several times saw a new token with every answer.
 */
export function crawlFileText(
  payload: unknown,
  moreTokens: Iterable<string> = [],
): string {
  const tokens = pageSessionTokens();
  for (const token of moreTokens) if (token) tokens.add(token);
  return redactTokens(JSON.stringify(payload, null, 2), tokens);
}

export { clearBugs, getBugs, summariseBugs };
