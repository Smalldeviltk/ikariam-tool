/**
 * Wine distribution that equalises how long each town can hold out.
 *
 * ── Why the algorithm changed ───────────────────────────────────────────────
 * The old Auto Wine used a flat rule: every town received
 * `winePerHour * multiple` — "enough for N hours" — while IGNORING existing
 * stock. A town already sitting on 30k wine got exactly as much as one about to
 * run dry, so wine piled up where it was not needed and the needy town starved.
 *
 * The approach here comes from the two drafts in `sample/`
 * (`wine-distribution.js` and `wine-distribution-2.js`): pour so that EVERY
 * town ends up with the same number of hours of wine left — the classic
 * water-filling problem.
 *
 * ── Formula ─────────────────────────────────────────────────────────────────
 * For the set of receiving towns, with `t` the target hours:
 *
 *     t     = (Σ stock + supply) / Σ consume
 *     add_i = t * consume_i − stock_i
 *
 * ── What the drafts did not handle ─────────────────────────────────────────
 * Both assume every town needs more. If a town ALREADY holds out longer than
 * `t`, its `add_i` is negative — but wine can only be shipped out, never pulled
 * back. `wine-distribution-2.js` clamps with `Math.max(0, ...)`, so the supply
 * that should have gone to the remaining towns is simply demanded on top:
 * with its own example (7 towns, supply 31,000) it asks for 37,271.
 *
 * The correct fix is to drop over-supplied towns from the set and recompute
 * `t`, repeating until none are left. Converges in at most n rounds.
 *
 * `wine-distribution.js` (the incremental draft) reaches the same answer but
 * its rounding correction is broken: it reads `arguments[1]` after assigning
 * `totalSupply = 0`, and in sloppy mode `arguments[1]` is aliased to the
 * parameter, so `diff` is never positive and the top-up loop never runs.
 */

export interface WineTown {
  /** Identity key — the town's index in the dropdown. */
  townNumber: string;
  townName: string;
  /** Current wine stock. */
  stock: number;
  /** Hourly consumption, as a positive number. */
  consume: number;
}

export interface WineAllocation {
  townNumber: string;
  townName: string;
  stock: number;
  consume: number;
  /** Wine to ship to this town — a non-negative integer. */
  add: number;
  /** Hours it can hold out after receiving. */
  finalHours: number;
}

export interface WineDistributionResult {
  /** Target hours every non-over-supplied town reaches. */
  targetHours: number;
  allocations: WineAllocation[];
  /** Total actually allocated — never more than `supply`. */
  used: number;
  /** Supply left over (when every town is already over-supplied). */
  unused: number;
}

/**
 * Split `supply` across `towns` so they all hold out for the same time.
 *
 * Towns with `consume <= 0` are excluded: they need no top-up, and keeping them
 * would divide by zero.
 */
export function distributeWine(
  towns: readonly WineTown[],
  supply: number,
): WineDistributionResult {
  const candidates = towns.filter((t) => t.consume > 0);
  const budget = Math.floor(Math.max(0, supply));

  if (candidates.length === 0 || budget <= 0) {
    return {
      targetHours: 0,
      allocations: towns.map((t) => ({
        townNumber: t.townNumber,
        townName: t.townName,
        stock: t.stock,
        consume: t.consume,
        add: 0,
        finalHours: t.consume > 0 ? t.stock / t.consume : Infinity,
      })),
      used: 0,
      unused: budget,
    };
  }

  // Water filling: repeatedly drop towns already past the target, recompute.
  let active = [...candidates];
  let targetHours = 0;

  for (;;) {
    const totalStock = active.reduce((sum, t) => sum + t.stock, 0);
    const totalConsume = active.reduce((sum, t) => sum + t.consume, 0);
    targetHours = (totalStock + budget) / totalConsume;

    const stillNeeding = active.filter(
      (t) => t.stock / t.consume < targetHours,
    );
    if (stillNeeding.length === active.length) break;
    if (stillNeeding.length === 0) {
      // Defensive only. The target is a consumption-weighted average of current
      // hours PLUS supply/Σconsume, so it always exceeds the least-stocked
      // town's hours — at least one town is below target on every round. This
      // branch would only trigger on floating-point pathologies.
      active = [];
      break;
    }
    active = stillNeeding;
  }

  const activeIds = new Set(active.map((t) => t.townNumber));

  // Whole units first, then hand out the rounding remainder.
  const exact = new Map<string, number>();
  for (const town of active) {
    exact.set(
      town.townNumber,
      Math.max(0, targetHours * town.consume - town.stock),
    );
  }

  const add = new Map<string, number>();
  let used = 0;
  for (const town of active) {
    const floored = Math.floor(exact.get(town.townNumber) ?? 0);
    add.set(town.townNumber, floored);
    used += floored;
  }

  // Distribute the floor remainder, largest fractional part first.
  let remaining = budget - used;
  const byFraction = [...active].sort(
    (a, b) =>
      ((exact.get(b.townNumber) ?? 0) % 1) -
      ((exact.get(a.townNumber) ?? 0) % 1),
  );
  for (const town of byFraction) {
    if (remaining <= 0) break;
    // Only top up towns that are genuinely still short of the target.
    if ((exact.get(town.townNumber) ?? 0) <= (add.get(town.townNumber) ?? 0)) {
      continue;
    }
    add.set(town.townNumber, (add.get(town.townNumber) ?? 0) + 1);
    used += 1;
    remaining -= 1;
  }

  const allocations: WineAllocation[] = towns.map((town) => {
    const amount = activeIds.has(town.townNumber)
      ? (add.get(town.townNumber) ?? 0)
      : 0;
    return {
      townNumber: town.townNumber,
      townName: town.townName,
      stock: town.stock,
      consume: town.consume,
      add: amount,
      finalHours:
        town.consume > 0 ? (town.stock + amount) / town.consume : Infinity,
    };
  });

  return {
    targetHours,
    allocations,
    used,
    unused: Math.max(0, budget - used),
  };
}
