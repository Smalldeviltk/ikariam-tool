/**
 * Show how many ships are needed to carry the loot from a barbarian village or
 * barbarian fleet.
 *
 * Ported from the MutationObserver at the end of the original `main()`. The
 * observer watches `#container` and, once the game injects the barbarian panel,
 * appends an extra `<li>` with the ship count.
 */

import { qs, qsa } from "@core/dom";
import { parseGameNumber } from "@core/format";
import { SEL } from "@core/ikariam/selectors";
import { getPerShipCapacity } from "../ship-capacity";

const MARKER_CLASS = "needingShip";

function annotate(containerSelector: string, addOne: boolean): void {
  const container = qs(containerSelector);
  if (!container) return;
  if (qs(`.${MARKER_CLASS}`, container)) return;

  const items = qsa("li", container);
  let total = 0;
  // Skip the first item (the label) and sum the numeric cells.
  for (let i = 1; i < items.length; i++) {
    total += parseGameNumber(items[i].textContent) ?? 0;
  }

  const node = document.createElement("li");
  node.className = MARKER_CLASS;
  // One merchant ship's cargo: the calibrated figure, 500 until calibrated.
  // The original hard-coded 520, which is right for one research level only.
  const ships = Math.round(total / getPerShipCapacity());
  node.innerHTML = addOne ? String(ships + 1) : `${ships} (${total})`;
  container.appendChild(node);
}

export function startBarbarianObserver(): void {
  const target = qs(SEL.container);
  if (!target) return;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const previousId = (mutation.previousSibling as HTMLElement | null)?.id;
      if (previousId === "barbarianVillage_c") {
        annotate(SEL.barbarianVillageResources, false);
        return;
      }
      if (previousId === "barbarianFleet_c") {
        annotate(SEL.barbarianFleetResources, true);
        return;
      }
    }
  });

  observer.observe(target, { childList: true });
}
