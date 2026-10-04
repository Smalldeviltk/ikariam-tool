/**
 * Styles for the control panel and the popups.
 *
 * The original declared three style blocks (`style`, `styleAutoBuild` and
 * `styleExtra`) but only appended `style` to `<head>`; the other two were dead
 * code, which is why the auto-build popup rendered unstyled. They are merged
 * here into one sheet, so the build popup finally gets the CSS that was
 * written for it. Rules for elements nothing renders any more were dropped.
 *
 * Elements that only ever appear inside the settings popup are styled once,
 * under the popup's id. The original wrote their rules both with and without
 * that id; the id is kept because it makes the rule outweigh the game's own
 * popup styles. `.fullTable` is the exception, and appears twice on purpose:
 * the panel's queue table uses it outside the popup too.
 */

import { DIALOG_ID } from "@core/ikariam/selectors";
import { BUILDING_LEVEL_CLASS } from "../features/auto-build";
import { FLAG, isFlagTrue } from "../state";
import { RESOURCE_TABLE_SCROLL_ID } from "./dialogs";
import { QUEUE_SCROLL_CLASS } from "./queue-view";

export function buildStyles(): string {
  const panelDisplay = isFlagTrue(FLAG.isSendResourceHidden) ? "none" : "block";

  return `
#autoWineTable th, #autoWineTable td { padding: 7px; }

.fullTable { width: 100%; overflow: hidden; display: block; }

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
.ika-queue-table { font-size: 10px; }
.ika-queue-table th, .ika-queue-table td { padding: 2px 4px; text-align: left; }
.ika-queue-table tr.active { background: #efdca8; font-weight: bold; }
.ika-queue-table button { padding: 0 4px; margin-left: 2px; height: 18px; line-height: 1; }
.ika-move:disabled { opacity: 0.4; cursor: default; }
.ika-queue-empty { font-style: italic; color: #6b5433; margin: 2px 0 4px; }

/* The two lists capped at ten rows (capVisibleRows): their header row
   stays in place while the rows scroll. .fullTable hides its overflow,
   which would make the table itself the scroll container that sticky
   holds to; inside these boxes it is let through to the box. */
.${QUEUE_SCROLL_CLASS} > table, #${RESOURCE_TABLE_SCROLL_ID} > table { overflow: visible; }
.${QUEUE_SCROLL_CLASS} th, #${RESOURCE_TABLE_SCROLL_ID} thead th {
  position: sticky; top: 0; z-index: 1; background: #f8e7b3;
}

.needingShip {
  background: url("cdn/all/both/characters/fleet/40x40/ship_transport_r_40x40.png") no-repeat 0 0;
  background-size: 22px 19px;
}
#logger textarea:hover { z-index: 99999; }

.ika-notification-switch { display: inline-block; margin: 2px 10px 2px 0; cursor: pointer; }

/* A building's level on the city view. Clicks pass through to the building. */
.${BUILDING_LEVEL_CLASS} {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  z-index: 1; pointer-events: none;
  padding: 0 4px; border: 1px solid #7e4a21; border-radius: 8px;
  background: rgba(253, 247, 221, 0.9); color: #542c0f;
  font: bold 11px/14px Arial, sans-serif; white-space: nowrap;
}

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
