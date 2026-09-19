/**
 * Show how many ships are needed to carry the loot from a barbarian village or
 * barbarian fleet.
 *
 * Ported from the MutationObserver at the end of the original `main()`. The
 * observer watches `#container` and, once the game injects the barbarian panel,
 * appends an extra `<li>` with the ship count.
 */

import { qs, qsa } from "@core/dom";
import { SEL } from "@core/ikariam/selectors";

/**
 * Capacity used for the estimate. The original hard-coded 520 (a low-level
 * merchant ship) rather than the calibrated value; kept so the displayed number
 * does not change unexpectedly.
 */
const ESTIMATE_CAPACITY = 520;

const MARKER_CLASS = "needingShip";

function annotate(containerSelector: string, addOne: boolean): void {
  const container = qs(containerSelector);
  if (!container) return;
  if (qs(`.${MARKER_CLASS}`, container)) return;

  const items = qsa("li", container);
  let total = 0;
  // Skip the first item (the label) and sum the numeric cells.
  for (let i = 1; i < items.length; i++) {
    total += Number(items[i].innerHTML.replace(/,/g, ""));
  }

  const node = document.createElement("li");
  node.className = MARKER_CLASS;
  const ships = Math.round(total / ESTIMATE_CAPACITY);
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

/**
 * Capture a pirate raid when no captcha blocks it.
 *
 * The original defined this as `checkPirate` but its only call site was
 * commented out inside `refreshStatus`. Kept available; still not wired in.
 */
export function capturePirate(): void {
  try {
    if (qs(SEL.pirateCaptcha)) return;
    const table = qs(SEL.pirateTable);
    if (!table) return;
    const links = qsa(SEL.pirateActionLinks, table);
    if (links[0]?.classList.contains("capture")) links[0].click();
  } catch (e) {
    console.log(e);
  }
}
