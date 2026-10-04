/**
 * Wine distribution that equalises how long each town can hold out.
 *
 * ── Why the algorithm changed ───────────────────────────────────────────────
 * The old Auto Wine used a flat rule: every town received
 * `winePerHour * multiple` — "enough for N hours" — while IGNORING existing
 * stock. A town already sitting on 30k wine got exactly as much as one about to
 * run dry, so wine piled up where it was not needed and the needy town starved.
 *
 * The approach here comes from two earlier drafts of this algorithm, kept
 * outside the repository: pour so that EVERY town ends up with the same number
 * of hours of wine left — the classic water-filling problem.
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
 * back. One draft clamps with `Math.max(0, ...)`, so the supply that should
 * have gone to the remaining towns is simply demanded on top: with its own
 * example (7 towns, supply 31,000 — kept in the tests) it asks for 37,271.
 *
 * The correct fix is to drop over-supplied towns from the set and recompute
 * `t`, repeating until none are left. Converges in at most n rounds.
 *
 * The other, incremental draft reaches the same answer but its rounding
 * correction is broken: it reads `arguments[1]` after assigning
 * `totalSupply = 0`, and in sloppy mode `arguments[1]` is aliased to the
 * parameter, so `diff` is never positive and the top-up loop never runs.
 *
 * ── Storage limits ──────────────────────────────────────────────────────────
 * A town is never sent more than its storage has room for. The part a full
 * town cannot take is NOT handed on to the others: it stays at the source and
 * is reported in `unused`, to be split on the next run. So `targetHours` is
 * the level the uncapped towns reach, and a capped town may end below it.
 *
 * ── Wine drunk on the way (plan item T) ─────────────────────────────────────
 * A town keeps drinking while its wine is at sea. With `transitHours` known,
 * everything here works on the stock it will have when the ships arrive,
 * `stock − consume × transitHours` (never below 0), so it is topped up to the
 * same hours at arrival rather than at departure. `stock` in the result stays
 * the stock now; `finalHours` is counted from arrival.
 *
 * ── Whole ships (plan item S) ───────────────────────────────────────────────
 * With `shipCapacity`, a share of one ship or more is rounded DOWN to whole
 * ships — 621 wine went as two merchant ships, one of them carrying 1 — and
 * the part rounded off stays at the source, in `unused`. A share under one
 * ship is sent as it is: the user chose not to leave such a town without.
 */

export interface WineTown {
  /** Identity key — the town's index in the dropdown. */
  townNumber: string;
  townName: string;
  /** Current wine stock. */
  stock: number;
  /** Hourly consumption, as a positive number. */
  consume: number;
  /** Most wine the town can hold. Absent when unknown, and then not enforced. */
  capacity?: number;
  /**
   * Hours from now until a shipment reaches this town (loading and sailing).
   * Absent when not known, and then nothing is drunk on the way.
   */
  transitHours?: number;
}

export interface WineDistributionOptions {
  /** One ship's cargo. Shares of one ship or more go in whole ships. */
  shipCapacity?: number;
}

/** The wine a town will hold when a shipment leaving now arrives. */
function stockOnArrival(town: WineTown): number {
  const drunk = town.consume * Math.max(0, town.transitHours ?? 0);
  return Math.max(0, town.stock - drunk);
}

export interface WineAllocation {
  townNumber: string;
  townName: string;
  stock: number;
  consume: number;
  /** Wine to ship to this town — a non-negative integer. */
  add: number;
  /** Hours it can hold out after receiving, counted from the arrival. */
  finalHours: number;
  /**
   * The town's storage could not take its full share, so `add` was trimmed
   * and it ends below `targetHours`.
   */
  storageFull: boolean;
}

export interface WineDistributionResult {
  /**
   * Target hours every non-over-supplied town reaches, bar the ones marked
   * `storageFull`.
   */
  targetHours: number;
  allocations: WineAllocation[];
  /** Total actually allocated — never more than `supply`. */
  used: number;
  /**
   * Supply left over: when every town is already over-supplied, or when a
   * town's storage could not take its share.
   */
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
  options: WineDistributionOptions = {},
): WineDistributionResult {
  const candidates = towns
    .filter((t) => t.consume > 0)
    // From here on `stock` means the stock on arrival; the real one is
    // restored in the result.
    .map((t) => ({ ...t, stock: stockOnArrival(t) }));
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
        finalHours: t.consume > 0 ? stockOnArrival(t) / t.consume : Infinity,
        storageFull: false,
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

  // Trim each share to the room left in that town's storage. What is trimmed
  // is not redistributed — it stays at the source for the next run.
  const trimmed = new Set<string>();
  for (const town of active) {
    if (town.capacity === undefined) continue;
    const room = Math.max(0, Math.floor(town.capacity - town.stock));
    const share = add.get(town.townNumber) ?? 0;
    if (share > room) {
      add.set(town.townNumber, room);
      used -= share - room;
      trimmed.add(town.townNumber);
    }
  }

  // Whole ships: round a share of one ship or more down to a multiple of
  // the cargo. What is rounded off stays at the source.
  const cargo = options.shipCapacity ?? 0;
  if (cargo > 0) {
    for (const town of active) {
      const share = add.get(town.townNumber) ?? 0;
      if (share < cargo) continue;
      const whole = Math.floor(share / cargo) * cargo;
      add.set(town.townNumber, whole);
      used -= share - whole;
    }
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
        town.consume > 0
          ? (stockOnArrival(town) + amount) / town.consume
          : Infinity,
      storageFull: trimmed.has(town.townNumber),
    };
  });

  return {
    targetHours,
    allocations,
    used,
    unused: Math.max(0, budget - used),
  };
}
