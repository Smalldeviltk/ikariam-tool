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
  exportBugReport,
  getBugs,
  registerContextProvider,
  summariseBugs,
} from "@core/bug-report";
import { qs, qsa } from "@core/dom";
import { getCurrentTownName } from "@core/ikariam/globals";
import { hasModel, modelCurrentCityName } from "@core/ikariam/model";
import { DIALOG_ID, SEL } from "@core/ikariam/selectors";
import { getState } from "./state";

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
    const json = exportBugReport();
    try {
      (window as any).copy?.(json);
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

export { buildBugReport, clearBugs, exportBugReport, getBugs, summariseBugs };
