import { asArray, cmcGet, hasApiKey, num } from "./cmc";
import type { HistorySummary, SpreadPoint } from "./types";

export async function fetchSpreadHistory(
  left: { symbol: string; cryptoId: number; ouncesPerToken: number },
  right: { symbol: string; cryptoId: number; ouncesPerToken: number },
): Promise<{ points: SpreadPoint[]; summary: HistorySummary | null; endpoint: string }> {
  if (!hasApiKey()) {
    return { points: [], summary: null, endpoint: "" };
  }
  const timeEnd = new Date();
  const timeStart = new Date(timeEnd.getTime() - 30 * 24 * 3600 * 1000);
  const [a, b] = await Promise.all([
    cmcGet("/v2/cryptocurrency/ohlcv/historical", {
      id: left.cryptoId,
      convert: "USD",
      interval: "daily",
      time_start: timeStart.toISOString(),
      time_end: timeEnd.toISOString(),
    }),
    cmcGet("/v2/cryptocurrency/ohlcv/historical", {
      id: right.cryptoId,
      convert: "USD",
      interval: "daily",
      time_start: timeStart.toISOString(),
      time_end: timeEnd.toISOString(),
    }),
  ]);
  const closesA = closesByDay(a.data, left.ouncesPerToken);
  const closesB = closesByDay(b.data, right.ouncesPerToken);
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
  if (vals.length < 5) return null;
  const last = vals[vals.length - 1];
  const minBps = Math.min(...vals);
  const maxBps = Math.max(...vals);
  const below = vals.filter((v) => v <= last).length;
  const percentile = (below / vals.length) * 100;
  const extreme =
    Math.abs(last) >= 15 && (percentile >= 90 || percentile <= 10);
  return {
    leftSymbol,
    rightSymbol,
    lastBps: last,
    minBps,
    maxBps,
    percentile,
    days: vals.length,
    extreme,
  };
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
