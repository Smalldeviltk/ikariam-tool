/**
 * The fixed control panel in the corner of the screen, plus the log box.
 *
 * Ported from the trailing `$("body").append(...)` block of the original.
 * Built with DOM APIs instead of chained jQuery strings, and buttons use
 * `data-ika-action` rather than inline onclick.
 */

import { addStyle, qs } from "@core/dom";
import { action } from "./actions";
import { buildStyles } from "./styles";

export const PANEL_ID = "customDiv";

export function buildPanel(): void {
  if (qs(`#${PANEL_ID}`)) return;

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.style.cssText =
    "position:fixed; overflow:hidden; z-index:66; bottom:20px; left:0; min-height:233px; min-width:250px;";

  panel.innerHTML = `
    <div id="summaryAccount" style="display:none; float:left; height:auto; width:auto; padding-left:10px; border:1px solid #ffffff; background:#f8e7b3 50% 50% repeat-x; position:fixed; left:55px">
      <div id="summaryAccountList"></div>
      <button class="button" ${action("account.update")}>Update Account</button>
      <button class="button" ${action("panel.toggleZoom")}>Toggle Zoom</button>
      <button class="button" ${action("log.clear")}>Clear Log</button>
    </div>

    <div id="userscript" style="float:left; height:auto; width:auto; padding-left:10px; border:1px solid #ffffff; background:#f8e7b3 50% 50% repeat-x; position:fixed; top:45px; left:635px">
      <h2 style="font-size:14px;font-weight:bold;display:inline">Auto Wine: </h2>
      <button class="button" id="btnStartScriptAutoWine" ${action("wine.chooseSource")}>Start</button>
      <button class="button" ${action("wine.settings")}>Setting</button><br/>

      <h2 style="font-size:14px;font-weight:bold;">Send Resources</h2>
      <button class="button" id="btnStartScript" ${action("queue.toggle")}>Start Timer</button>
      <button class="button" ${action("send.settings")}>Setting</button><br/>
      <p id="transporterInfo">Nothing is transferring</p>

      <h2 style="font-size:14px;font-weight:bold;display:inline">Auto Build: </h2>
      <button class="button" ${action("build.settings")}>Setting</button>
      <button class="button" ${action("build.startNow")}>Start</button><br/>
      <button class="button" id="btnStartAutoBuild" ${action("build.toggleTimer")}>Start Timer</button>
      <button class="button" id="btnStartScanBuilding" ${action("build.scan")}>Scan</button>
      <button class="button" id="calibratePerShipCapacity" ${action("ship.calibrate")}>Calibrate Cargo</button>
      <button class="button" id="btnBugReport" ${action("bug.report")}>Bug Report</button><br/>
      <button class="button" id="btnExportData" ${action("data.export")}>Export Data</button>
      <button class="button" id="btnImportData" ${action("data.import")}>Import Data</button>
    </div>

    <div id="logger" style="float:left; height:auto; width:auto; padding-left:10px; border:1px solid #ffffff; background:#f8e7b3 50% 50% repeat-x; margin-top:150px">
      <textarea rows="4" cols="80" id="txtLogger" style="font-size:9px; display:none"></textarea>
    </div>
  `;

  document.body.appendChild(panel);
  addStyle(buildStyles());

  // The original raised the footer's z-index so the panel is not covered.
  const footer = qs("#footer");
  if (footer) footer.style.zIndex = "2";
}

export function setQueueButtonLabel(running: boolean): void {
  const button = qs("#btnStartScript");
  if (button) button.textContent = running ? "Stop Timer" : "Start Timer";
}

export function setAutoBuildButtonLabel(running: boolean): void {
  const button = qs("#btnStartAutoBuild");
  if (button) button.textContent = running ? "Stop Timer" : "Start Timer";
}

export function setTransferInfo(text: string): void {
  const element = qs("#transporterInfo");
  if (element) element.textContent = text;
}

export function toggleZoom(): void {
  qs(`#${PANEL_ID}`)?.classList.toggle("zoom");
}

/** Show/hide the panel. The button was commented out but hotkey Space still calls it. */
export function togglePanel(): void {
  const panel = qs(`#${PANEL_ID}`);
  if (!panel) return;
  panel.style.display = panel.style.display === "none" ? "block" : "none";
}
