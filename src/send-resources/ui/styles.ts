/**
 * Styles for the control panel and the popups.
 *
 * The original declared three style blocks (`style`, `styleAutoBuild` and
 * `styleExtra`) but only appended `style` to `<head>`; the other two were dead
 * code, which is why the auto-build popup rendered unstyled. They are merged
 * here into one sheet (the union of all three, duplicates collapsed), so the
 * build popup finally gets the CSS that was written for it.
 */

import { DIALOG_ID } from "@core/ikariam/selectors";
import { FLAG, isFlagTrue } from "../state";

export function buildStyles(): string {
  const panelDisplay = isFlagTrue(FLAG.isSendResourceHidden) ? "none" : "block";

  return `
#divWrapperAuto button { padding: 5px; margin: 0 0 5px 0; height: 24px; font-size: 10px !important; }
#divWrapperAuto p { font-size: 10px; }

#autoWineTable th, #autoWineTable td { padding: 7px; }
#resourceTable th, #resourceTable td { padding: 7px; }

.fullTable { width: 100%; overflow: hidden; display: block; }
.fixTable { max-height: 500px !important; }
.tableQueue tbody { max-height: 400px; overflow: auto; display: block; }

#summaryAccountTable td, #summaryAccountTable th { padding: 1.5px; }
#summaryAccountTable tr:hover { background-color: white; }
#summaryAccountTable td:hover { color: red; background-color: #f0f0f0; }

/* The wine warning in the panel. Red is "act now", amber is "worth
   knowing"; the thresholds live in features/wine-warning.ts. */
.ika-wine-list { margin: 4px 0 0 0; padding: 0; list-style: none; }
.ika-wine-list li { font-size: 11px; line-height: 15px; }
.ika-wine-critical { color: #c00000; font-weight: bold; }
.ika-wine-warning { color: #b36b00; }
.ika-wine-ok, .ika-wine-unknown { font-size: 11px; color: #5a4632; margin-top: 4px; }

.active { font-weight: bold; }
.min { border: 1px solid red; }
th { font-weight: bold; }

/* The window manages its own visibility through the hidden attribute, so it
   is not listed here: a display rule would either do nothing or fight the
   toggle. The flag still hides the Empire Overview board, which has no such
   mechanism of its own. */
#empireBoard { display: ${panelDisplay}; }

#tdListBuilding tr, #tdQueue tr { border-bottom: 1px solid black; }
#tdListBuilding tr:last-child, #tdQueue tr:last-child { border: 0; }
#tdListBuilding, .tdQueue { vertical-align: top; padding: 1px 1px 0 1px; text-align: left; }

#autoBuildTable { overflow: auto; max-height: 501px; }
#autoBuildTable button { float: right; }
#autoBuildTable span { float: left; width: 100%; border-bottom: 1px dotted gray; }
#autoBuildTable th { padding: 2px; }

/* The zoom toggle now scales the window in place rather than nudging a
   fixed-position panel back onto the screen. */
.zoom { transform: scale(0.8); transform-origin: top left; }
.ika-queue-table { font-size: 10px; }
.ika-queue-table th, .ika-queue-table td { padding: 2px 4px; text-align: left; }
.ika-queue-table tr.active { background: #efdca8; font-weight: bold; }
.ika-queue-table button { padding: 0 4px; margin-left: 2px; height: 18px; line-height: 1; }
.ika-queue-empty { font-style: italic; color: #6b5433; margin: 2px 0 4px; }

.needingShip {
  background: url("cdn/all/both/characters/fleet/40x40/ship_transport_r_40x40.png") no-repeat 0 0;
  background-size: 22px 19px;
}
#logger textarea:hover { z-index: 99999; }

/* Popup styles — declared but never attached in the original. */
#${DIALOG_ID} .popupContent,
#${DIALOG_ID} .popupMessage { width: max-content !important; }
#${DIALOG_ID} #autoBuildTable { overflow: auto; max-height: 501px; }
#${DIALOG_ID} #autoBuildTable button { float: right; }
#${DIALOG_ID} #autoBuildTable span { float: left; width: 100%; border-bottom: 1px dotted gray; }
#${DIALOG_ID} #autoBuildTable th { padding: 2px; }
#${DIALOG_ID} #tdListBuilding,
#${DIALOG_ID} .tdQueue { vertical-align: top; padding: 1px 1px 0 1px; text-align: left; }
#${DIALOG_ID} .fullTable { width: 100%; overflow: hidden; display: block; }
#${DIALOG_ID} .fixTable { max-height: 500px !important; }
#${DIALOG_ID} #resourceTable th,
#${DIALOG_ID} #resourceTable td { padding: 7px; }
`;
}
