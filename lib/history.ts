import { DESK_POLICY } from "./basis";
import { asArray, cmcGet, hasApiKey, num } from "./cmc";
import type { HistorySummary, SpreadPoint } from "./types";

export function summarizeHistory(
  points: SpreadPoint[],
  leftSymbol: string,
  rightSymbol: string,
): HistorySummary | null {
  const vals = points
    .map((p) => p.bps)
    .filter((n): n is number => n != null && Number.isFinite(n));
  if (vals.length < DESK_POLICY.minHistoryDays) return null;
  const last = vals[vals.length - 1];
  const minBps = Math.min(...vals);
  const maxBps = Math.max(...vals);
  const below = vals.filter((v) => v <= last).length;
  const percentile = (below / vals.length) * 100;
  const avgBps = vals.reduce((sum, n) => sum + n, 0) / vals.length;
  const dollarGaps = points
    .filter((p) => p.buyClose != null && p.avoidClose != null)
    .map((p) => (p.avoidClose as number) - (p.buyClose as number));
  const avgDollarGap = dollarGaps.length
    ? dollarGaps.reduce((sum, n) => sum + n, 0) / dollarGaps.length
    : null;
  const extreme =
    last >= DESK_POLICY.wideBasisBps &&
    percentile >= DESK_POLICY.extremePercentile;
  return {
    leftSymbol,
    rightSymbol,
    lastBps: last,
    minBps,
    maxBps,
    percentile,
    days: vals.length,
    extreme,
    avgBps,
    avgDollarGap,
  };
}

/** Where today's live gap sits in the daily-close series. */
export function rankAgainstHistory(
  points: SpreadPoint[],
  liveBps: number,
): { percentile: number; days: number; extreme: boolean } | null {
  const vals = points
    .map((p) => p.bps)
    .filter((n): n is number => n != null && Number.isFinite(n));
  if (vals.length < DESK_POLICY.minHistoryDays || !Number.isFinite(liveBps)) {
    return null;
  }
  const below = vals.filter((v) => v <= liveBps).length;
  const percentile = (below / vals.length) * 100;
  return {
    percentile,
    days: vals.length,
    extreme:
      liveBps >= DESK_POLICY.wideBasisBps &&
      percentile >= DESK_POLICY.extremePercentile,
  };
}

export type CoreLeg = {
  symbol: string;
  cryptoId: number;
  ouncesPerToken: number;
  volume24h: number;
};

/**
 * Discount of the cheap wrapper versus a volume-weighted core, one point per day.
 * Weights are today's volumes. A day needs the cheap close and at least one other.
 */
export function discountSeries(
  data: unknown,
  cheap: CoreLeg,
  core: CoreLeg[],
): SpreadPoint[] {
  const maps = new Map<number, Map<string, number>>();
  for (const leg of core) {
    maps.set(leg.cryptoId, closesForId(data, leg.cryptoId, leg.ouncesPerToken));
  }
  const days = [...new Set([...maps.values()].flatMap((m) => [...m.keys()]))].sort();
  return days.map((date) => {
    let weight = 0;
    let acc = 0;
    let others = 0;
    for (const leg of core) {
      const close = maps.get(leg.cryptoId)?.get(date);
      if (close == null || !(leg.volume24h > 0)) continue;
      weight += leg.volume24h;
      acc += close * leg.volume24h;
      if (leg.cryptoId !== cheap.cryptoId) others += 1;
    }
    const cheapClose = maps.get(cheap.cryptoId)?.get(date) ?? null;
    const vwap = weight > 0 ? acc / weight : null;
    const bps =
      cheapClose != null && vwap != null && others > 0
        ? ((vwap - cheapClose) / vwap) * 10_000
        : null;
    return { date, bps, buyClose: cheapClose, avoidClose: vwap };
  });
}

/** 30-day discount of the cheap core wrapper versus the rest of the core. */
export async function fetchCoreDiscountHistory(
  cheap: CoreLeg,
  core: CoreLeg[],
): Promise<{ points: SpreadPoint[]; summary: HistorySummary | null; endpoint: string }> {
  const ids = [...new Set(core.map((leg) => leg.cryptoId).filter((id) => id > 0))];
  if (!hasApiKey() || ids.length < 2) {
    return { points: [], summary: null, endpoint: "" };
  }
  const both = await cmcGet("/v2/cryptocurrency/ohlcv/historical", {
    id: ids.join(","),
    convert: "USD",
    time_period: "daily",
    count: 31,
    skip_invalid: "true",
  });
  const points = discountSeries(both.data, cheap, core);
  return {
    points,
    summary: summarizeHistory(points, cheap.symbol, "reference"),
    endpoint: "GET /v2/cryptocurrency/ohlcv/historical",
  };
}

/** Pull one crypto id out of a single-id or comma-separated OHLCV payload. */
export function closesForId(
  data: unknown,
  cryptoId: number,
  ouncesPerToken: number,
): Map<string, number> {
  return closesByDay(seriesNode(data, cryptoId), ouncesPerToken);
}

function seriesNode(data: unknown, cryptoId: number): unknown {
  if (!data || typeof data !== "object") return data;
  const root = data as Record<string, unknown>;
  const keyed = root[String(cryptoId)];
  if (keyed && typeof keyed === "object") return keyed;
  const id = num(root.id);
  if (id === cryptoId || Array.isArray(root.quotes)) return root;
  const inner = root.data;
  if (inner && typeof inner === "object") {
    const nested = inner as Record<string, unknown>;
    const hit = nested[String(cryptoId)];
    if (hit && typeof hit === "object") return hit;
  }
  return root;
}

function closesByDay(
  data: unknown,
  ouncesPerToken: number,
): Map<string, number> {
  const root = (data ?? {}) as Record<string, unknown>;
  const quotes = asArray<Record<string, unknown>>(
    root.quotes ??
      (root.data as Record<string, unknown> | undefined)?.quotes ??
      [],
  );
  const map = new Map<string, number>();
  for (const q of quotes) {
    const usd =
      ((q.quote as Record<string, unknown> | undefined)?.USD as
        | Record<string, unknown>
        | undefined) ?? (q.quote as Record<string, unknown> | undefined);
    const close = num(usd?.close ?? usd?.price);
    const ts = String(q.time_close ?? q.time_open ?? usd?.timestamp ?? "");
    if (close == null || !ts) continue;
    map.set(ts.slice(0, 10), close / (ouncesPerToken || 1));
  }
  return map;
}
