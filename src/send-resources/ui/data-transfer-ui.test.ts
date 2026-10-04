import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportData } from "@core/data-transfer";
import { IMPORT_ERRORS } from "@core/messages";
import { DATA_TRANSFER } from "../messages";
import { initState } from "../state";
import {
  exportDataToFile,
  importDataFromFile,
  timestampedFilename,
} from "./data-transfer-ui";

const showToast = vi.hoisted(() => vi.fn());
vi.mock("@core/ui/window", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/ui/window")>()),
  showToast,
}));

vi.mock("@core/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/logger")>()),
  logInfo: () => {},
}));

const ME = "tester";

/** An export taken in another browser, from `account`'s data. */
function bundleOf(account: string): string {
  localStorage.clear();
  localStorage.setItem(`${account}listSender`, '["0"]');
  localStorage.setItem("ika_perShipCapacity", "620");
  const json = JSON.stringify(exportData());
  localStorage.clear();
  return json;
}

/**
 * Answer the file picker with `content` the moment it is opened, as a player
 * choosing that file would.
 */
function pickFile(content: string): void {
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
    this: HTMLInputElement,
  ) {
    Object.defineProperty(this, "files", {
      value: [new File([content], "export.json")],
    });
    this.dispatchEvent(new Event("change"));
  });
}

/** The confirmations, answered in order. */
function answer(...replies: boolean[]): ReturnType<typeof vi.fn> {
  const confirm = vi.fn(() => replies.shift() ?? false);
  vi.stubGlobal("confirm", confirm);
  return confirm;
}

/** Let the file read and the import run to their end. */
async function imported(): Promise<void> {
  await vi.waitFor(() => expect(showToast).toHaveBeenCalled());
}

beforeEach(() => {
  localStorage.clear();
  initState(ME);
  showToast.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("importDataFromFile", () => {
  it("imports this account's export after one confirmation", async () => {
    pickFile(bundleOf(ME));
    const confirm = answer(true);

    importDataFromFile();
    await imported();

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(`${ME}listSender`)).toBe('["0"]');
    expect(localStorage.getItem("ika_perShipCapacity")).toBe("620");
  });

  it("moves another account's entries onto this one when asked to", async () => {
    pickFile(bundleOf("Alice"));
    const confirm = answer(true, true);

    importDataFromFile();
    await imported();

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(String(confirm.mock.calls[0][0])).toContain("Alice");
    expect(localStorage.getItem(`${ME}listSender`)).toBe('["0"]');
    expect(localStorage.getItem("AlicelistSender")).toBeNull();
  });

  it(
    "keeps another account's entries under that account when not asked " +
      "to move them, and says so",
    async () => {
      pickFile(bundleOf("Alice"));
      answer(false, true);

      importDataFromFile();
      await imported();

      expect(showToast).toHaveBeenCalledWith(
        DATA_TRANSFER.skippingOtherAccount,
      );
      expect(localStorage.getItem("AlicelistSender")).toBe('["0"]');
      expect(localStorage.getItem(`${ME}listSender`)).toBeNull();
    },
  );

  it("writes nothing when the import is not confirmed", async () => {
    pickFile(bundleOf(ME));
    const confirm = answer(false);

    importDataFromFile();
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(localStorage.getItem(`${ME}listSender`)).toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("says why when the file is not an export", async () => {
    pickFile("not json at all");
    answer(true);

    importDataFromFile();
    await imported();

    expect(showToast).toHaveBeenCalledWith(
      DATA_TRANSFER.failed(IMPORT_ERRORS.notJson),
    );
    expect(localStorage.length).toBe(0);
  });
});

describe("exportDataToFile", () => {
  it("says there is nothing to export rather than saving an empty file", () => {
    const createObjectURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });

    exportDataToFile();

    expect(showToast).toHaveBeenCalledWith(DATA_TRANSFER.nothingToExport);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("saves this account's data to a file", () => {
    localStorage.setItem(`${ME}listSender`, '["0"]');
    const createObjectURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });

    exportDataToFile();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicked).toHaveLength(1);
    expect(clicked[0]).toMatch(/^ikariam-tool-tester-\d{4}-\d\d-\d\d-/);
  });
});

describe("timestampedFilename", () => {
  it("keeps only file-name-safe characters from the account name", () => {
    expect(timestampedFilename("A/B: C", "report")).toMatch(
      /^report-A_B_C-\d{4}-\d\d-\d\d-\d\d-\d\d-\d\d\.json$/,
    );
  });
});
