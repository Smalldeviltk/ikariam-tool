/**
 * Diagnostics for Empire Overview.
 *
 * WHY THIS MATTERS MORE HERE THAN ANYWHERE ELSE
 * This is 10,767 lines of mechanically ported code — the least-reviewed and
 * least-tested part of the project, and the part still held to a looser
 * TypeScript configuration. It is also the part most likely to break when
 * Gameforge changes the game, because it parses far more of the page than Send
 * Resources does.
 *
 * Until now it carried no instrumentation at all: a throw inside the renderer
 * left the board blank and no trace of why.
 *
 * Records land in the same storage as the Send Resources reports, so one export
 * covers both scripts; each record is stamped with its originating build (see
 * `setBuildInfo`) so they stay distinguishable.
 */

import {
  installErrorHandlers,
  registerContextProvider,
  setBuildInfo,
} from "@core/bug-report";
import $, { isChromium } from "./jquery";

/**
 * Whether the board actually rendered.
 *
 * `#empireBoard` missing while the menu button exists is the signature of the
 * renderer having thrown part-way through — the single most useful thing to
 * know about a failure here.
 */
function boardHealth(): Record<string, unknown> {
  const has = (selector: string) => $(selector).length;
  return {
    menuButton: has(".empire_Menu"),
    board: has("#empireBoard"),
    tabs: has("#empire_Tabs"),
    resTabRows: has("#ResTab > table > tbody > tr"),
    buildTab: has("#BuildTab"),
    armyTab: has("#ArmyTab"),
  };
}

function empireContext(): Record<string, unknown> {
  const anyWindow = window as unknown as Record<string, any>;
  return {
    board: boardHealth(),
    isChromium,
    // The renderer needs jQuery UI; the two packagings supply different
    // versions of it, which is the first thing to check on a render failure.
    jQuery: $.fn?.jquery ?? null,
    jQueryUi: ($ as any).ui?.version ?? null,
    // The port reaches these through `unsafeWindow`; their absence explains a
    // whole class of parse failures.
    hasIkariamModel: !!anyWindow.ikariam?.model,
    hasLocalizationStrings:
      typeof anyWindow.LocalizationStrings !== "undefined",
    templateView: anyWindow.ikariam?.templateView?.id ?? null,
    bodyId: document.body?.id ?? null,
  };
}

let installed = false;

export function installEmpireDiagnostics(
  packaging: "userscript" | "extension",
  version: string,
): void {
  if (installed) return;
  installed = true;

  setBuildInfo({ packaging, script: "empire-overview", version });
  registerContextProvider(empireContext);
  installErrorHandlers();
}
