/**
 * Quick-amount buttons on the game's own shipment form.
 *
 * The form gives you a slider and a text field. Typing a round number into it
 * is the single most repeated action in the game, and the slider cannot hit one
 * reliably. IkaEasy adds a row of increments next to each resource
 * (`tpl/transport-buttons.ejs`); this is the same idea, with one difference.
 *
 * ITS STEPS ARE FIXED AT 500 / 1000 / 5000 / 50000. Those are not round numbers
 * in general — they are one, two, ten and a hundred ships at the game's BASE
 * merchant capacity of 500. As soon as cargo research is upgraded they stop
 * lining up with anything: on the server this was tested against, a merchant
 * ship carries 620 and a freighter 53,000.
 *
 * This project already measures both (`ship-capacity.ts`, calibrated from the
 * shipyard text or `transportConfig`), so the steps here are multiples of the
 * real capacity. A press fills whole ships, which is what the amount is for.
 *
 * The ship COUNT is what each button carries, not the amount — the amount is
 * worked out when the button is pressed, so recalibrating takes effect without
 * rebuilding anything.
 *
 * Amounts are applied through `setInputValue`, not by assigning `.value`: the
 * game recalculates the ship count and the mission summary from the field's own
 * events, so a bare assignment leaves the form showing the old convoy.
 *
 * PLACEMENT. The row goes after `.sliderinput`, as the last child of the
 * resource's `<li>`, and the sheet below lets that `<li>` grow. Inside
 * `.sliderinput` there is no room: six buttons carrying real amounts
 * ("+53,000", not IkaEasy's "+50k") are wider than the gap beside the text
 * field, so the row wraps past the row's fixed height and the NEXT resource's
 * slider — painted later — covers it. IkaEasy dodges this by parking its row at
 * `top: -56px; left: 403px`, which only holds at one zoom and one font size.
 */

import { qs, qsa, setInputValue } from "@core/dom";
import { SEL } from "@core/ikariam/selectors";
import { action } from "../ui/actions";
import { getFreighterCapacity, getPerShipCapacity } from "../ship-capacity";

/** Marks a field that already has its buttons, so they are added once. */
const MARKER_CLASS = "ika-transport-buttons";

/** Identifies this module's sheet, so it is installed once. */
export const TRANSPORT_STYLE_ID = "ika-transport-buttons-style";

/** Resources the shipment form carries, in the order the game lists them. */
const RESOURCES = ["wood", "wine", "marble", "glass", "sulfur"] as const;

export type ShipKind = "merchant" | "freighter";

interface Step {
  ships: number;
  kind: ShipKind;
}

/**
 * One down, then one, five and ten merchant ships, then a whole freighter.
 *
 * A freighter holds roughly a hundred merchant ships' worth, so it earns its
 * own button rather than ten presses of the one beside it.
 */
const STEPS: readonly Step[] = [
  { ships: -1, kind: "merchant" },
  { ships: 1, kind: "merchant" },
  { ships: 5, kind: "merchant" },
  { ships: 10, kind: "merchant" },
  { ships: 1, kind: "freighter" },
];

/**
 * The sheet, installed once.
 *
 * The `#transportGoods` prefix is there for specificity rather than scoping:
 * the game sizes these rows with plain class selectors, so an id in front is
 * enough to grow them.
 *
 * `padding` is the one declaration carrying `!important`. The game's `.button`
 * rule wins otherwise — IkaEasy's own sheet needs the same override on the same
 * property, from a three-class selector.
 *
 * `z-index` is insurance, not the fix. Making room is the fix; the z-index
 * only means that if some other rule still forces the row's height, the buttons
 * end up on top of the next slider rather than hidden behind it.
 */
function transportStyles(): string {
  return `
#transportGoods ul.resourceAssign > li { height: auto; min-height: 0; overflow: visible; }

.${MARKER_CLASS} {
  display: block;
  clear: both;
  position: relative;
  z-index: 2;
  margin: 2px 0 5px 0;
  padding: 0;
  /* The right edge is pinned to the text field's by alignRowToField, which
     sets padding-right; this is what makes that padding move the group. */
  text-align: right;
  white-space: nowrap;
  line-height: 1;
}

.${MARKER_CLASS} > a.button {
  display: inline-block;
  min-width: 34px;
  width: auto;
  margin: 0;
  padding: 4px 9px !important;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  direction: ltr;
}

/* One strip rather than six loose buttons, the way the game's own button
   groups read. */
.${MARKER_CLASS} > a.button:not(:first-child) { border-left: 1px solid #c9a584; }
.${MARKER_CLASS} > a.button:not(:last-child) { border-right: none; }
`;
}

/**
 * Line the group's right edge up with the text field's.
 *
 * Measured rather than written into the sheet. The distance from the field to
 * the edge of the row depends on the slider's width, the game's zoom and the
 * player's font size, so there is no constant to put in the CSS — which is why
 * IkaEasy's `left: 403px; top: -56px` only holds at one of each.
 *
 * Degenerate rectangles mean the form is not laid out yet (a hidden box, or a
 * test environment with no layout engine). The row is left alone then: it still
 * reads correctly, just flush against the row's own edge.
 */
export function alignRowToField(field: Element, row: HTMLElement): void {
  const host = row.parentElement;
  if (!host) return;

  const hostRight = host.getBoundingClientRect().right;
  const fieldRight = field.getBoundingClientRect().right;
  if (hostRight <= 0 || fieldRight <= 0) return;

  const gap = Math.round(hostRight - fieldRight);
  if (gap > 0) row.style.paddingRight = `${gap}px`;
}

function installStyles(): void {
  if (document.getElementById(TRANSPORT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = TRANSPORT_STYLE_ID;
  style.textContent = transportStyles();
  document.head.appendChild(style);
}

/** Cargo one ship of this kind carries, as currently measured. */
export function capacityOf(kind: ShipKind): number {
  return kind === "freighter" ? getFreighterCapacity() : getPerShipCapacity();
}

function stepAmount(step: Step): number {
  return step.ships * capacityOf(step.kind);
}

function stepLabel(step: Step): string {
  const amount = stepAmount(step);
  const sign = amount < 0 ? "-" : "+";
  return `${sign}${Math.abs(amount).toLocaleString("en-US")}`;
}

function stepTitle(step: Step): string {
  const count = Math.abs(step.ships);
  const noun = step.kind === "freighter" ? "freighter" : "merchant ship";
  const plural = count === 1 ? "" : "s";
  return `${step.ships < 0 ? "Remove" : "Add"} ${count} ${noun}${plural}`;
}

function buttonRow(resource: string): string {
  return (
    `<span class="${MARKER_CLASS}">` +
    STEPS.map(
      (step) =>
        `<a class="button" href="#" title="${stepTitle(step)}" ` +
        `${action("transport.add", {
          "ika-resource": resource,
          "ika-ships": step.ships,
          "ika-kind": step.kind,
        })}>${stepLabel(step)}</a>`,
    ).join("") +
    `<a class="button" href="#" title="Clear" ` +
    `${action("transport.add", {
      "ika-resource": resource,
      "ika-ships": 0,
      "ika-kind": "merchant",
      "ika-set": "1",
    })}>0</a>` +
    `</span>`
  );
}

/**
 * Apply one step to a field.
 *
 * Clamped at zero: the game rejects a negative amount anyway, and leaving one
 * in the box makes the whole form refuse to submit with no visible reason.
 */
export function applyTransportStep(
  resource: string,
  ships: number,
  kind: ShipKind = "merchant",
  set = false,
): void {
  const field = qs<HTMLInputElement>(SEL.resourceField(resource));
  if (!field) return;

  const current = parseInt(field.value.replace(/\D/g, ""), 10) || 0;
  const delta = ships * capacityOf(kind);
  const next = set ? 0 : Math.max(0, current + delta);
  setInputValue(field, String(next));
}

/** Put the buttons next to every resource field the form is showing. */
export function addTransportButtons(): boolean {
  let added = false;

  for (const resource of RESOURCES) {
    const field = qs<HTMLInputElement>(SEL.resourceField(resource));
    if (!field) continue;

    // The whole resource row, so the buttons sit below the slider rather than
    // beside it. `parentElement` is the fallback for the take-offer form,
    // which uses the same field ids without the list markup around them.
    const host = field.closest("li") ?? field.parentElement;
    // The form is rebuilt on every navigation, so the marker is checked
    // against this field's own row rather than the document.
    if (!host || host.querySelector(`.${MARKER_CLASS}`)) continue;

    installStyles();
    host.insertAdjacentHTML("beforeend", buttonRow(resource));

    const row = host.lastElementChild;
    if (row instanceof HTMLElement) alignRowToField(field, row);
    added = true;
  }

  return added;
}

/** Remove them. Used by tests, and harmless otherwise. */
export function removeTransportButtons(): void {
  for (const node of qsa(`.${MARKER_CLASS}`)) node.remove();
}

/**
 * Watch for the shipment form appearing.
 *
 * The form is injected by the game's own ajax, so there is no load event to
 * hook. `barbarian.ts` watches `#container` the same way, for the same reason.
 */
export function startTransportButtonObserver(): MutationObserver | null {
  const target = qs(SEL.container);
  if (!target) return null;

  // The form may already be on screen when the script starts.
  addTransportButtons();

  const observer = new MutationObserver(() => {
    addTransportButtons();
  });
  observer.observe(target, { childList: true, subtree: true });
  return observer;
}
