import { basisBps, formatUsd, isLiquidEnough, WIDE_BPS, wrapperKey, wrapperLabel } from "./basis";
import type { DeskSnapshot, SpreadSeries, Venue, Wrapper } from "./types";

export type DeskTone = "buy" | "skip" | "wait" | "only-one";

export type DeskCall = {
  verb: string;
  detail: string;
  tone: DeskTone;
};

export type BasisOpportunity = {
  left: string;
  right: string;
  /** How many dollars the right-hand wrapper costs above the left, per unit. */
  dollar: number;
  bps: number;
};

export type LiquidityBar = {
  key: string;
  label: string;
  volume24h: number;
  /** Log volume versus the largest name, so a thin wrapper stays visible. */
  widthPct: number;
  thin: boolean;
};

export type StructureColumn = {
  key: string;
  symbol: string;
  issuer: string;
  price: number | null;
  volume24h: number;
  venues: number;
  liquidity: "High" | "Medium" | "Thin";
};

export type BasisRead = {
  pair: string;
  current: number | null;
  average: number | null;
  percentile: number | null;
  days: number | null;
  signal: "unusually wide" | "unusually tight" | "typical" | "no 30-day range";
};

export const CMC_ENDPOINTS = [
  "/v5/real-world-assets/map",
  "/v5/real-world-assets/quotes/latest",
  "/v5/real-world-assets/market-pairs/list",
  "/v5/real-world-assets/info",
  "/v5/real-world-assets/issuers",
  "/v3/cryptocurrency/quotes/latest",
  "/v2/cryptocurrency/ohlcv/historical",
] as const;

const PIPELINE = [
  { label: "RWA map", note: "rwa_id" },
  { label: "RWA quotes", note: "tokens[]" },
  { label: "crypto_id", note: "price + volume" },
  { label: "Market pairs", note: "venues" },
  { label: "Liquidity filter", note: "volume floor" },
  { label: "Basis engine", note: "fair + gap" },
  { label: "Trade ticket", note: "trade / skip / wait" },
] as const;

export function pipelineSteps(): { label: string; note: string }[] {
  return PIPELINE.map((step) => ({ ...step }));
}

export function endpointHits(used: string[]): { path: string; live: boolean }[] {
  return CMC_ENDPOINTS.map((path) => ({
    path,
    live: used.some((row) => row.includes(path)),
  }));
}

export function shortUnit(unit: string): string {
  if (unit === "troy ounce") return "oz";
  return unit;
}

export function lowerVolumePhrase(thin: number, ref: number): string | null {
  if (!(ref > 0) || thin >= ref) return null;
  const pct = (1 - thin / ref) * 100;
  if (pct >= 99) return "more than 99% lower volume";
  return `${Math.round(pct)}% lower volume`;
}

function findWrapper(
  desk: DeskSnapshot,
  symbol: string | null,
  cryptoId: number | null,
): Wrapper | undefined {
  if (cryptoId != null) {
    const byId = desk.wrappers.find((w) => w.cryptoId === cryptoId);
    if (byId) return byId;
  }
  if (!symbol) return undefined;
  return desk.wrappers.find((w) => w.symbol === symbol);
}

function nameOf(
  desk: DeskSnapshot,
  symbol: string | null,
  cryptoId: number | null,
): string {
  const row = findWrapper(desk, symbol, cryptoId);
  if (!row) return symbol ?? "—";
  return wrapperLabel(row, desk.wrappers);
}

export function basisOpportunity(desk: DeskSnapshot): BasisOpportunity | null {
  const t = desk.ticket;
  if (
    t.action !== "skip" &&
    t.buySymbol &&
    t.avoidSymbol &&
    t.dollarGap != null &&
    t.spreadBps != null
  ) {
    return {
      left: nameOf(desk, t.buySymbol, t.buyCryptoId),
      right: nameOf(desk, t.avoidSymbol, t.avoidCryptoId),
      dollar: t.dollarGap,
      bps: t.spreadBps,
    };
  }
  const trap = t.trap;
  if (!trap || trap.dollarGap == null || !trap.vsSymbol) return null;
  const cheap = findWrapper(desk, trap.symbol, trap.cryptoId);
  const rich = desk.wrappers.find((w) => w.symbol === trap.vsSymbol);
  const bps =
    cheap?.normalizedUsd != null && rich?.normalizedUsd != null
      ? basisBps(rich.normalizedUsd, cheap.normalizedUsd)
      : trap.spreadBps;
  if (bps == null) return null;
  return {
    left: nameOf(desk, trap.symbol, trap.cryptoId),
    right: nameOf(desk, trap.vsSymbol, rich?.cryptoId ?? null),
    dollar: trap.dollarGap,
    bps,
  };
}

function trapVersus(desk: DeskSnapshot): { phrase: string; ref: string } | null {
  const trap = desk.ticket.trap;
  if (!trap) return null;
  const ref =
    desk.wrappers.find((w) => w.symbol === trap.vsSymbol) ??
    [...desk.wrappers].sort((a, b) => b.volume24h - a.volume24h)[0];
  if (!ref) return { phrase: "below the liquidity floor", ref: "" };
  return {
    phrase: lowerVolumePhrase(trap.volume24h, ref.volume24h) ?? "below the liquidity floor",
    ref: wrapperLabel(ref, desk.wrappers),
  };
}

export function deskCall(desk: DeskSnapshot): DeskCall {
  const t = desk.ticket;
  const trap = trapVersus(desk);
  const trapLine = t.trap
    ? `Avoid ${nameOf(desk, t.trap.symbol, t.trap.cryptoId)} — ${trap?.phrase ?? "below the liquidity floor"}`
    : null;

  if (t.action === "buy" && t.buySymbol) {
    return {
      tone: "buy",
      verb: `TRADE ${nameOf(desk, t.buySymbol, t.buyCryptoId)}`,
      detail:
        trapLine ??
        (t.avoidSymbol
          ? `Skip ${nameOf(desk, t.avoidSymbol, t.avoidCryptoId)} — richest liquid wrapper`
          : "Liquid book is unusually wide"),
    };
  }

  if (t.action === "skip" && t.trap) {
    const prefer = t.buySymbol
      ? `Prefer ${nameOf(desk, t.buySymbol, t.buyCryptoId)}`
      : "Too thin to exit";
    return {
      tone: "skip",
      verb: `SKIP ${nameOf(desk, t.trap.symbol, t.trap.cryptoId)}`,
      detail: trapLine ? `${trapLine}. ${prefer}` : prefer,
    };
  }

  if (t.action === "only-one") {
    return {
      tone: "only-one",
      verb: t.buySymbol ? `ONLY ${nameOf(desk, t.buySymbol, t.buyCryptoId)}` : "NO PAIR",
      detail: "A basis trade needs two liquid wrappers of the same asset",
    };
  }

  let range = "No trade on the liquid book";
  if (t.history && t.spreadBps != null && t.spreadBps >= WIDE_BPS) {
    range = `${t.spreadBps.toFixed(1)} bps is inside the 30-day range`;
  } else if (!t.history && t.spreadBps != null && t.spreadBps >= WIDE_BPS) {
    range = `${t.spreadBps.toFixed(1)} bps wide — no 30-day range yet`;
  } else if (t.buySymbol && t.avoidSymbol && t.spreadBps != null) {
    range = `${nameOf(desk, t.buySymbol, t.buyCryptoId)} and ${nameOf(desk, t.avoidSymbol, t.avoidCryptoId)} are ${t.spreadBps.toFixed(1)} bps apart`;
  }
  return {
    tone: "wait",
    verb: "WAIT",
    detail: trapLine ? `${trapLine}. ${range}` : range,
  };
}

function bestPrint(desk: DeskSnapshot): Venue | null {
  const t = desk.ticket;
  const buy = findWrapper(desk, t.buySymbol, t.buyCryptoId);
  const venues = buy?.venues.length ? buy.venues : t.venues;
  return venues.find((v) => v.recommended) ?? venues[0] ?? null;
}

export function whyLines(desk: DeskSnapshot): string[] {
  const t = desk.ticket;
  const unit = desk.cluster.unit;
  const lines: string[] = [];
  const opp = basisOpportunity(desk);

  if (t.action === "buy" && opp && t.avoidSymbol) {
    lines.push(
      `${opp.left} is $${opp.dollar.toFixed(2)} cheaper per ${unit} than ${opp.right}, the richest liquid wrapper (${opp.bps.toFixed(1)} bps).`,
    );
  } else if (t.action === "wait" && opp && t.spreadBps != null && t.spreadBps < WIDE_BPS) {
    lines.push(
      `${opp.left} and ${opp.right} are ${opp.bps.toFixed(1)} bps apart. That is inside the band where the desk does not call a trade.`,
    );
  } else if (t.action === "wait" && opp && t.history) {
    lines.push(
      `${opp.left} is $${opp.dollar.toFixed(2)} cheaper per ${unit} than ${opp.right} (${opp.bps.toFixed(1)} bps), but that gap sits inside the 30-day range.`,
    );
  } else if (t.action === "wait" && opp) {
    lines.push(
      `The liquid book is ${opp.bps.toFixed(1)} bps wide (${opp.left} vs ${opp.right}), and there is no 30-day history yet, so the desk waits.`,
    );
  } else if (t.action === "skip" && opp) {
    lines.push(
      `${opp.left} looks $${opp.dollar.toFixed(2)} cheaper per ${unit} than ${opp.right}. The discount is the illiquid wrapper, not the liquid book.`,
    );
  } else if (t.action === "only-one") {
    lines.push(
      t.buySymbol
        ? `${nameOf(desk, t.buySymbol, t.buyCryptoId)} is the only wrapper with a live price and enough volume to compare.`
        : "CMC did not return two priced wrappers for this underlying.",
    );
  }

  if (t.trap && t.action !== "skip") {
    const versus = trapVersus(desk);
    const extra = versus?.ref ? ` than ${versus.ref}` : "";
    lines.push(
      `${nameOf(desk, t.trap.symbol, t.trap.cryptoId)} is technically cheaper, but it fails the $${formatUsd(desk.cluster.volumeFloorUsd)} daily volume floor${versus ? ` — ${versus.phrase}${extra}` : ""}.`,
    );
  }

  lines.push(
    `Fair value is the volume-weighted price of wrappers above $${formatUsd(desk.cluster.volumeFloorUsd)} a day. Thin names do not move it.`,
  );

  if (t.history?.extreme) {
    lines.push(
      `Today is the ${ordinal(t.history.percentile)} percentile of the last ${t.history.days} sessions — ${t.history.percentile >= 90 ? "unusually wide" : "unusually tight"}.`,
    );
  }

  const print = bestPrint(desk);
  if (print) {
    const where = `${print.exchange}${print.pair ? ` ${print.pair}` : ""}`;
    lines.push(
      t.action === "buy"
        ? `Best execution venue: ${where}.`
        : `Best print on the liquid wrapper: ${where}.`,
    );
  }

  return lines;
}

export function liquidityBars(desk: DeskSnapshot): LiquidityBar[] {
  const floor = desk.cluster.volumeFloorUsd;
  const trap = desk.ticket.trap;
  const ranked = [...desk.wrappers].sort((a, b) => b.volume24h - a.volume24h);
  const picked: Wrapper[] = [];
  const seen = new Set<string>();
  const take = (row: Wrapper | undefined) => {
    if (!row) return;
    const key = wrapperKey(row);
    if (seen.has(key)) return;
    seen.add(key);
    picked.push(row);
  };

  for (const row of ranked) {
    if (!isLiquidEnough(row, floor)) continue;
    take(row);
    if (picked.length >= 4) break;
  }
  if (trap) take(findWrapper(desk, trap.symbol, trap.cryptoId));
  if (!picked.length) ranked.slice(0, 4).forEach(take);

  picked.sort((a, b) => b.volume24h - a.volume24h);
  const max = Math.max(...picked.map((row) => row.volume24h), 1);
  const maxLog = Math.log10(max);
  return picked.map((row) => ({
    key: wrapperKey(row),
    label: wrapperLabel(row, desk.wrappers),
    volume24h: row.volume24h,
    widthPct:
      maxLog > 0
        ? Math.max(8, Math.min(100, (Math.log10(Math.max(row.volume24h, 1)) / maxLog) * 100))
        : 8,
    thin: !isLiquidEnough(row, floor),
  }));
}

function liquidityWord(row: Wrapper, floor: number): StructureColumn["liquidity"] {
  if (!isLiquidEnough(row, floor)) return "Thin";
  if (row.tradability === "A" || row.tradability === "B") return "High";
  return "Medium";
}

export function structureColumns(desk: DeskSnapshot): StructureColumn[] {
  const floor = desk.cluster.volumeFloorUsd;
  const t = desk.ticket;
  const picked: Wrapper[] = [];
  const seen = new Set<string>();
  const take = (row: Wrapper | undefined) => {
    if (!row) return;
    const key = wrapperKey(row);
    if (seen.has(key)) return;
    seen.add(key);
    picked.push(row);
  };
  take(findWrapper(desk, t.buySymbol, t.buyCryptoId));
  take(findWrapper(desk, t.avoidSymbol, t.avoidCryptoId));
  if (t.trap) take(findWrapper(desk, t.trap.symbol, t.trap.cryptoId));
  if (picked.length < 2) {
    [...desk.wrappers]
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, 3)
      .forEach(take);
  }
  return picked.map((row) => ({
    key: wrapperKey(row),
    symbol: wrapperLabel(row, desk.wrappers),
    issuer: row.issuerName || "—",
    price: row.normalizedUsd,
    volume24h: row.volume24h,
    venues: row.pairCount || row.venues.length,
    liquidity: liquidityWord(row, floor),
  }));
}

export function structureCounts(desk: DeskSnapshot): {
  underlying: string;
  wrappers: number;
  liquid: number;
  thin: number;
} {
  return {
    underlying: desk.underlying?.name || desk.cluster.label,
    wrappers: desk.wrappers.length,
    liquid: desk.main.length,
    thin: desk.dust.length,
  };
}

export function basisRead(spread: SpreadSeries | null): BasisRead {
  const vals = (spread?.points ?? [])
    .map((point) => point.bps)
    .filter((n): n is number => n != null && Number.isFinite(n));
  const summary = spread?.summary ?? null;
  const average = vals.length ? vals.reduce((sum, n) => sum + n, 0) / vals.length : null;
  let signal: BasisRead["signal"] = "no 30-day range";
  if (summary?.extreme && summary.percentile >= 90) signal = "unusually wide";
  else if (summary?.extreme && summary.percentile <= 10) signal = "unusually tight";
  else if (summary) signal = "typical";
  const pair =
    spread?.buySymbol && spread.avoidSymbol
      ? `${spread.buySymbol} vs ${spread.avoidSymbol}`
      : "Liquid pair";
  return {
    pair,
    current: summary?.lastBps ?? vals.at(-1) ?? null,
    average,
    percentile: summary?.percentile ?? null,
    days: summary?.days ?? (vals.length || null),
    signal,
  };
}

function ordinal(n: number): string {
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
