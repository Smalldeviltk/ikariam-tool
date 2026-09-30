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
import { errorMessage } from "@core/format";
import { logInfo } from "@core/logger";
import { showToast } from "@core/ui/window";
import { DATA_TRANSFER } from "../messages";
import { getState } from "../state";

/** Groups the user can move, with the wording shown in the confirmations. */
const GROUP_LABELS: Readonly<Record<DataGroup, string>> =
  DATA_TRANSFER.groupLabels;

/** Import notes shown after an import; the rest are in the log. */
const MAX_NOTES_SHOWN = 5;

function timestampedFilename(account: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const safeAccount = account.replace(/[^\w.-]+/g, "_");
  return `ikariam-tool-${safeAccount}-${stamp}.json`;
}

export function downloadJson(filename: string, json: string): void {
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
    showToast(DATA_TRANSFER.nothingToExport);
    return;
  }

  const json = JSON.stringify(bundle, null, 2);
  downloadJson(timestampedFilename(accountName), json);
  void navigator.clipboard?.writeText(json).catch(() => {
    /* clipboard is a convenience; the file is the real output */
  });

  logInfo(`Exported ${bundle.entries.length} entries`);
  showToast(
    DATA_TRANSFER.saved(
      bundle.entries.length,
      describeBundle(bundle),
      [GROUP_LABELS.config, GROUP_LABELS.measurements],
      GROUP_LABELS.runtime,
    ),
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
            DATA_TRANSFER.otherAccount(unique, accountName),
          );
          remapAccountTo = remap ? accountName : undefined;
          if (!remap) {
            showToast(DATA_TRANSFER.skippingOtherAccount);
          }
        }

        if (!confirm(DATA_TRANSFER.confirmImport(describeBundle(bundle)))) {
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
        showToast(
          DATA_TRANSFER.imported(
            result.imported,
            result.skipped,
            result.notes.slice(0, MAX_NOTES_SHOWN).join("\n"),
          ),
        );
      })
      .catch((error: unknown) => {
        showToast(DATA_TRANSFER.failed(errorMessage(error)));
      });
  });

  input.click();
}
