import { DESK_POLICY, WIDE_BPS, executableBuyUsd } from "./basis";
import type { SpreadPoint } from "./types";

/** Value at the extreme-percentile rank. A discount at or above this bar is in the tail. */
export function percentileBar(values: number[], percentile = DESK_POLICY.extremePercentile): number | null {
  const vals = values.filter((n) => Number.isFinite(n));
  if (vals.length < DESK_POLICY.minHistoryDays) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

export function ordinal(n: number): string {
  const v = Math.round(n);
  const mod = v % 100;
  if (mod >= 11 && mod <= 13) return `${v}th`;
  switch (v % 10) {
    case 1:
      return `${v}st`;
    case 2:
      return `${v}nd`;
    case 3:
      return `${v}rd`;
    default:
      return `${v}th`;
  }
}

/**
 * How far today's discount is from a Prefer. The sentence does not change the call.
 * A window whose high never clears 15 bps cannot Prefer, even on its widest day.
 */
export function distanceLine(input: {
  spreadBps: number | null;
  days: number | null;
  percentile: number | null;
  maxBps: number | null;
  barBps: number | null;
}): string | null {
  const spread = input.spreadBps;
  if (spread == null || !Number.isFinite(spread)) return null;
  const days = input.days;
  const max = input.maxBps;
  if (max != null && days != null && max < WIDE_BPS) {
    return `${spread.toFixed(1)} bps, and the ${days}-day high is ${max.toFixed(1)}, so this window cannot Prefer.`;
  }
  const bar = input.barBps;
  const percentile = input.percentile;
  const clearsBand = spread >= WIDE_BPS;
  const clearsBar = bar != null && spread + 1e-9 >= bar;
  if (clearsBand && bar != null && !clearsBar) {
    return `${spread.toFixed(1)} bps under the liquid book, ${Math.round(bar - spread)} bps short of the ${Math.round(bar)} bps bar for this window.`;
  }
  if (!clearsBand && percentile != null && percentile >= DESK_POLICY.extremePercentile) {
    return `${ordinal(percentile)} percentile, ${(WIDE_BPS - spread).toFixed(1)} bps short of the ${WIDE_BPS} bps band.`;
  }
  if (!clearsBand && bar != null && spread < bar) {
    return `${spread.toFixed(1)} bps under the liquid book, ${(WIDE_BPS - spread).toFixed(1)} bps short of the ${WIDE_BPS} bps band and ${Math.round(bar - spread)} bps short of the ${Math.round(bar)} bps bar.`;
  }
  if (!clearsBand) {
    return `${spread.toFixed(1)} bps under the liquid book, ${(WIDE_BPS - spread).toFixed(1)} bps short of the ${WIDE_BPS} bps band.`;
  }
  return null;
}

/** Days in this window that cleared 15 bps and the percentile bar, in date order. */
export function sessionsThatCleared(
  points: SpreadPoint[],
  barBps: number | null,
): { date: string; bps: number }[] {
  if (barBps == null) return [];
  const hits: { date: string; bps: number }[] = [];
  for (const point of points) {
    if (point.bps == null || !Number.isFinite(point.bps)) continue;
    if (point.bps + 1e-9 < WIDE_BPS || point.bps + 1e-9 < barBps) continue;
    hits.push({ date: point.date, bps: point.bps });
  }
  return hits;
}

/** Latest day in this window that cleared 15 bps and the percentile bar. */
export function lastClearedSession(
  points: SpreadPoint[],
  barBps: number | null,
): { date: string; bps: number; referenceUsd: number | null } | null {
  const hits = sessionsThatCleared(points, barBps);
  const last = hits[hits.length - 1];
  if (!last) return null;
  const point = [...points].reverse().find((row) => row.date === last.date && row.bps === last.bps);
  return { date: last.date, bps: last.bps, referenceUsd: point?.avoidClose ?? null };
}

/**
 * Dollars paid to buy the base asset on a constant-product pool while the
 * average fill stays at or under `targetUsd`. Returns 0 when the pool's spot
 * is already at or above that target. Null when the reserves are unusable.
 * Pool TVL is not an input. No fee is applied.
 */
export function constantProductBuyUsd(
  reserveBase: number,
  reserveQuote: number,
  targetUsd: number,
): number | null {
  if (!(reserveBase > 0) || !(reserveQuote > 0) || !(targetUsd > 0)) return null;
  if (!Number.isFinite(reserveBase) || !Number.isFinite(reserveQuote) || !Number.isFinite(targetUsd)) {
    return null;
  }
  const spot = reserveQuote / reserveBase;
  if (spot >= targetUsd) return 0;
  const dx = reserveBase - reserveQuote / targetUsd;
  if (!(dx > 0) || dx >= reserveBase) return 0;
  const paid = (reserveQuote * dx) / (reserveBase - dx);
  return paid > 0 && Number.isFinite(paid) ? paid : null;
}

/** Ask-book size for a past discount. Today's ticket is not an input. */
export function illustrativeFillUsd(askDepthUsd: number | null, discountBps: number): number | null {
  return executableBuyUsd(askDepthUsd, discountBps);
}
