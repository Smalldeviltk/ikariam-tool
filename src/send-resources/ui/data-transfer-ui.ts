/**
 * Export / import UI for moving settings between browsers.
 *
 * A downloaded file rather than the clipboard: the payload includes the town
 * cache and the building queue, which comfortably exceeds what a `prompt()` can
 * take and what a user will paste by hand. The clipboard is offered as well for
 * small exports.
 */

import {
  DEFAULT_GROUPS,
  type DataGroup,
  describeBundle,
  exportData,
  importData,
  parseBundle,
} from "@core/data-transfer";
import { logInfo } from "@core/logger";
import { getState } from "../state";

/** Groups the user can move, with the wording shown in the confirmations. */
const GROUP_LABELS: Record<DataGroup, string> = {
  config: "settings (wine lists, build queue, cargo calibration)",
  measurements: "measurements (town cache, account summary)",
  runtime: "in-flight work (task queue, running flags)",
  diagnostics: "logs and bug reports",
};

function timestampedFilename(account: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const safeAccount = account.replace(/[^\w.-]+/g, "_");
  return `ikariam-tool-${safeAccount}-${stamp}.json`;
}

function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some builds; one turn of the
  // event loop is enough for the browser to have taken the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportDataToFile(): void {
  const { accountName } = getState();
  const bundle = exportData({ groups: DEFAULT_GROUPS, account: accountName });

  if (bundle.entries.length === 0) {
    alert("There is nothing to export yet.");
    return;
  }

  const json = JSON.stringify(bundle, null, 2);
  downloadJson(timestampedFilename(accountName), json);
  void navigator.clipboard?.writeText(json).catch(() => {
    /* clipboard is a convenience; the file is the real output */
  });

  logInfo(`Exported ${bundle.entries.length} entries`);
  alert(
    `Saved ${bundle.entries.length} entries.\n\n${describeBundle(bundle)}\n\n` +
      `Moved: ${GROUP_LABELS.config} and ${GROUP_LABELS.measurements}.\n\n` +
      `NOT moved: ${GROUP_LABELS.runtime}. Two browsers running the same queue ` +
      `would both drive one game account and double-send.`,
  );
}

/**
 * Prompt for a file and merge it in.
 *
 * Account mismatch is checked rather than assumed: both browsers normally play
 * the same account so the key prefixes already line up, but importing another
 * account's keys would silently create data nothing ever reads.
 */
export function importDataFromFile(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;

    void file
      .text()
      .then((json) => {
        const bundle = parseBundle(json);
        const { accountName } = getState();
        const foreign = bundle.entries
          .map((entry) => entry.account)
          .filter(
            (account): account is string =>
              !!account && account !== accountName,
          );

        let remapAccountTo: string | undefined;
        if (foreign.length > 0) {
          const unique = [...new Set(foreign)].join(", ");
          const remap = confirm(
            `This export holds data for a different account (${unique}), ` +
              `but you are logged in as "${accountName}".\n\n` +
              `OK  = rewrite it onto "${accountName}"\n` +
              `Cancel = import only the account-independent entries`,
          );
          remapAccountTo = remap ? accountName : undefined;
          if (!remap) {
            alert(
              "Account-specific entries will be skipped. Nothing reads keys " +
                "belonging to another account.",
            );
          }
        }

        if (
          !confirm(
            `Import this?\n\n${describeBundle(bundle)}\n\n` +
              `Existing settings with the same names will be OVERWRITTEN.`,
          )
        ) {
          return;
        }

        const result = importData(json, {
          groups: DEFAULT_GROUPS,
          remapAccountTo,
          overwrite: true,
        });

        logInfo(
          `Imported ${result.imported} entries (${result.skipped} skipped)`,
        );
        alert(
          `Imported ${result.imported} entries, skipped ${result.skipped}.\n\n` +
            `Reload the page for everything to take effect.` +
            (result.notes.length
              ? `\n\n${result.notes.slice(0, 5).join("\n")}`
              : ""),
        );
      })
      .catch((error: Error) => {
        alert(`Import failed: ${error.message}`);
      });
  });

  input.click();
}
