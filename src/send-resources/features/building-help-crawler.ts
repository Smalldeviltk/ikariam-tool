/**
 * TEMPORARY: save the building shown in the game's Help > building details
 * dialog to a JSON file.
 *
 * The game's help dialog (`#buildingDetail`, opened by
 * `?view=buildingDetail&buildingId=N&helpId=1`) lists every building in a row
 * of icons (`table.building_nav`) and shows the selected one's cost, time and
 * effect for every level in `table.table01`. Those figures are the game's
 * current ones; the wiki's are out of date. They are wanted for checking
 * `Constant.BuildingData` in the Empire Overview board.
 *
 * The player selects a building in the dialog by hand, waits for it to load,
 * then presses the button; each press saves the building on screen. Nothing
 * here clicks the game or sends a request.
 *
 * Markup read here comes from one capture of the Town Hall's page
 * (`sample/wiki/town-hall.html`). The cost columns are headed by resource
 * icons, not words; each column keeps its icon URL, and gets a name from
 * `COLUMN_KEY_BY_ICON` when the icon is a known one.
 */

import { qs, qsa } from "@core/dom";
import { logInfo } from "@core/logger";
import { showToast } from "@core/ui/window";
import { BUILDING_CRAWL } from "../messages";
import { downloadJson } from "../ui/data-transfer-ui";

const HELP_DIALOG_SELECTOR = "#buildingDetail";

/**
 * What each header icon stands for, as identified by the user from the game.
 * Keyed by the icon's file name: the same file is served from `gf1`, `gf2`
 * or `gf3.geo.gfsrv.net`, so the host is not part of the key.
 */
const COLUMN_KEY_BY_ICON: Readonly<Record<string, string>> = {
  "c3527b2f694fb882563c04df6d8972.png": "wood",
  "94ddfda045a8f5ced3397d791fd064.png": "wine",
  "fc258b990c1a2a36c5aeb9872fc08a.png": "marble",
  "417b4059940b2ae2680c070a197d8c.png": "crystal",
  "5578a7dfa3e98124439cca4a387a61.png": "sulfur",
  "465f0358d2cb09c07cd0f5a53e38eb.png": "time",
};

interface ColumnHeader {
  className: string;
  text: string;
  /** The `src` of the header's icon: cost columns carry no text. */
  iconSrc: string | null;
  /** `wood`, `wine`, `marble`, `crystal`, `sulfur` or `time`; `null` for an unknown icon or none. */
  key: string | null;
}

function columnKeyForIcon(iconSrc: string | null): string | null {
  const fileName = iconSrc?.split("/").pop();
  return (fileName && COLUMN_KEY_BY_ICON[fileName]) || null;
}

interface BuildingHelpCapture {
  capturedAt: string;
  host: string;
  /** From the selected icon's `onclick`, `null` if it could not be read. */
  buildingId: number | null;
  /** The icon's building class, e.g. `townHall`, `academy`. */
  buildingClass: string | null;
  name: string;
  description: string[];
  columns: ColumnHeader[];
  /** One array per level; a cost cell gives its full figure, not "1.33M". */
  rows: string[][];
  /** `#buildingDetail .content` as it was, in case the parse above is wrong. */
  contentHtml: string;
}

const cleanText = (element: Element | null): string =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

/**
 * A cost cell shows a short figure ("1.33M") with the exact one in a hidden
 * `.tooltip` ("1,327,370"); an effect cell such as a warehouse's capacity
 * keeps it in its `title` ("13.15M" shown, "13,152,172" in the title). Every
 * other cell is plain text.
 */
function cellValue(cell: Element): string {
  const tooltip = qs(".tooltip", cell);
  if (tooltip) return cleanText(tooltip);
  const title = cell.getAttribute("title");
  return title ? title.replace(/\s+/g, " ").trim() : cleanText(cell);
}

function readSelectedBuilding(
  dialog: Element,
): Pick<BuildingHelpCapture, "buildingId" | "buildingClass"> {
  const selected = qs(".building_nav .button_building.selected", dialog);
  if (!selected) return { buildingId: null, buildingClass: null };

  const idMatch = (selected.getAttribute("onclick") ?? "").match(
    /buildingId=(\d+)/,
  );
  const buildingClass =
    Array.from(selected.classList).find(
      (name) => name !== "selected" && name !== "button_building",
    ) ?? null;
  return {
    buildingId: idMatch ? Number(idMatch[1]) : null,
    buildingClass,
  };
}

function readBuildingHelp(dialog: Element): BuildingHelpCapture {
  const content = qs(".content", dialog);
  const table = content ? qs("table.table01", content) : null;
  const tableRows = table ? qsa("tr", table) : [];
  const headerRow = tableRows.find((row) => qs("th", row));

  const columns: ColumnHeader[] = headerRow
    ? qsa("th", headerRow).map((th) => {
        const iconSrc = qs("img", th)?.getAttribute("src") ?? null;
        return {
          className: th.className,
          text: cleanText(th),
          iconSrc,
          key: columnKeyForIcon(iconSrc),
        };
      })
    : [];

  const rows = tableRows
    .filter((row) => row !== headerRow)
    .map((row) => qsa(":scope > td", row).map(cellValue))
    .filter((cells) => cells.length > 0);

  return {
    capturedAt: new Date().toISOString(),
    host: location.host,
    ...readSelectedBuilding(dialog),
    name: cleanText(qs("h3.header", dialog)),
    description: content ? qsa("p", content).map(cleanText) : [],
    columns,
    rows,
    contentHtml: content?.outerHTML ?? "",
  };
}

/** The panel button's action. */
export function saveBuildingHelpToFile(): void {
  const dialog = qs(HELP_DIALOG_SELECTOR);
  if (!dialog) {
    showToast(BUILDING_CRAWL.noDialog);
    return;
  }

  const capture = readBuildingHelp(dialog);
  const label = capture.buildingClass ?? "unknown";
  const filename = `building-help-${label}-${capture.buildingId ?? "x"}.json`;
  downloadJson(filename, JSON.stringify(capture, null, 2));

  logInfo(
    `Saved building help: ${capture.name || label}, ${capture.rows.length} levels`,
  );
  showToast(
    BUILDING_CRAWL.saved(capture.name || label, capture.rows.length, filename),
  );
}
