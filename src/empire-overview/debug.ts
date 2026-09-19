/* eslint-disable */
/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $ from "./jquery";

export const debug = false;
export const log = false;
export const timing = false;
// The original had `if (!unsafeWindow) unsafeWindow = window;` so it could run
// without a sandbox. The userscript header declares `@grant unsafeWindow`, so
// Tampermonkey always provides it — and assigning to a global declaration is
// not valid under ESM anyway. Line removed.

/***********************************************************************************************************************
 * Inject button into page before the page renders the YUI menu or it will not be animated (less work)
 **********************************************************************************************************************/
$(".menu_slots > .expandable:last").after(
  '<li class="expandable slot99 empire_Menu" onclick=""><div class="empire_Menu image" style="background-image: url(cdn/all/both/minimized/weltinfo.png); background-position: 0px 0px; background-size:33px auto"></div></div><div class="name"><span class="namebox">Empire Overview</span></div></li>',
);

/***********************************************************************************************************************
 * Utility Functions
 **********************************************************************************************************************/
