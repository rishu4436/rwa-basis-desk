import { DESK_POLICY } from "./basis";
import { asArray, cmcGet, hasApiKey, num } from "./cmc";
import type { HistorySummary, SpreadPoint } from "./types";

export async function fetchSpreadHistory(
  left: { symbol: string; cryptoId: number; ouncesPerToken: number },
  right: { symbol: string; cryptoId: number; ouncesPerToken: number },
): Promise<{ points: SpreadPoint[]; summary: HistorySummary | null; endpoint: string }> {
  if (!hasApiKey()) {
    return { points: [], summary: null, endpoint: "" };
  }
  const both = await cmcGet("/v2/cryptocurrency/ohlcv/historical", {
    id: `${left.cryptoId},${right.cryptoId}`,
    convert: "USD",
    time_period: "daily",
    count: 31,
    skip_invalid: "true",
  });
  const closesA = closesForId(both.data, left.cryptoId, left.ouncesPerToken);
  const closesB = closesForId(both.data, right.cryptoId, right.ouncesPerToken);
  const days = [...new Set([...closesA.keys(), ...closesB.keys()])].sort();
  const points: SpreadPoint[] = days.map((date) => {
    const buyClose = closesA.get(date) ?? null;
    const avoidClose = closesB.get(date) ?? null;
    const bps =
      buyClose && avoidClose
        ? ((avoidClose - buyClose) / buyClose) * 10_000
        : null;
    return { date, bps, buyClose, avoidClose };
  });
  return {
    points,
    summary: summarizeHistory(points, left.symbol, right.symbol),
    endpoint: "GET /v2/cryptocurrency/ohlcv/historical",
  };
}

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
    Math.abs(last) >= DESK_POLICY.wideBasisBps &&
    (percentile >= DESK_POLICY.extremePercentile || percentile <= 10);
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
      Math.abs(liveBps) >= DESK_POLICY.wideBasisBps &&
      (percentile >= DESK_POLICY.extremePercentile || percentile <= 10),
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
