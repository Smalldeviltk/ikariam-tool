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

.active { font-weight: bold; }
.min { border: 1px solid red; }
th { font-weight: bold; }

#customDiv { display: ${panelDisplay}; }
#empireBoard { display: ${panelDisplay}; }

#tdListBuilding tr, #tdQueue tr { border-bottom: 1px solid black; }
#tdListBuilding tr:last-child, #tdQueue tr:last-child { border: 0; }
#tdListBuilding, .tdQueue { vertical-align: top; padding: 1px 1px 0 1px; text-align: left; }

#autoBuildTable { overflow: auto; max-height: 501px; }
#autoBuildTable button { float: right; }
#autoBuildTable span { float: left; width: 100%; border-bottom: 1px dotted gray; }
#autoBuildTable th { padding: 2px; }

.zoom { transform: scale(0.7); bottom: -12px !important; left: -188px !important; }
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
