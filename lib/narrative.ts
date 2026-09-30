import {
  basisBps,
  DESK_POLICY,
  formatDollars,
  formatUsd,
  isLiquidEnough,
  trapHoldLine,
  WIDE_BPS,
  wrapperKey,
  wrapperLabel,
} from "./basis";
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
  /** Mean historical dollar gap (avoid close − buy close). */
  averageDollar: number | null;
  lastDollar: number | null;
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
  { label: "Market pairs", note: "venues, depth if sent" },
  { label: "Liquidity filter", note: "core of the book" },
  { label: "Basis engine", note: "liquid reference" },
  { label: "Desk call", note: "prefer / skip / wait" },
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
    t.dollarGap != null &&
    t.spreadBps != null
  ) {
    return {
      left: nameOf(desk, t.buySymbol, t.buyCryptoId),
      right: t.avoidSymbol
        ? nameOf(desk, t.avoidSymbol, t.avoidCryptoId)
        : "the liquid reference",
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

function sentences(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? "").trim().replace(/\.+$/, ""))
    .filter(Boolean)
    .join(". ");
}

export function deskCall(desk: DeskSnapshot): DeskCall {
  const t = desk.ticket;
  const trap = trapVersus(desk);
  const trapLine = t.trap
    ? `Avoid ${nameOf(desk, t.trap.symbol, t.trap.cryptoId)} — ${trap?.phrase ?? "below the liquidity floor"}`
    : null;

  if (t.action === "buy" && t.buySymbol) {
    const name = nameOf(desk, t.buySymbol, t.buyCryptoId);
    const buy = findWrapper(desk, t.buySymbol, t.buyCryptoId);
    const print = bestPrint(desk);
    const where =
      print && print.listed !== "demo"
        ? ` on ${print.exchange}${print.pair ? ` ${print.pair}` : ""}`
        : "";
    const fill =
      buy?.capacityUsd != null
        ? `You can buy ${formatDollars(buy.capacityUsd)} of ${name}${where}, and the fill is still ${WIDE_BPS} bps under the liquid reference`
        : t.spreadBps != null
          ? `${t.spreadBps.toFixed(1)} bps under the liquid reference`
          : "Liquid book is unusually wide";
    const hold = t.trap ? trapHoldLine(t.trap) : "";
    return {
      tone: "buy",
      verb: `PREFER ${name}`,
      detail: sentences([fill, trapLine, hold]),
    };
  }

  if (t.action === "skip" && t.trap) {
    const prefer = t.buySymbol
      ? `Prefer ${nameOf(desk, t.buySymbol, t.buyCryptoId)}`
      : "Too thin to exit";
    const hold = trapHoldLine(t.trap);
    return {
      tone: "skip",
      verb: `SKIP ${nameOf(desk, t.trap.symbol, t.trap.cryptoId)}`,
      detail: sentences([trapLine, hold, prefer]),
    };
  }

  if (t.action === "only-one") {
    return {
      tone: "only-one",
      verb: t.buySymbol ? `ONLY ${nameOf(desk, t.buySymbol, t.buyCryptoId)}` : "NO PAIR",
      detail: "A basis trade needs two liquid wrappers of the same asset",
    };
  }

  const buy = findWrapper(desk, t.buySymbol, t.buyCryptoId);
  const extremeWide =
    Boolean(t.history?.extreme) && t.spreadBps != null && t.spreadBps >= WIDE_BPS;
  let range = "No trade on the liquid book";
  if (extremeWide && t.spreadBps != null) {
    range =
      buy?.capacityUsd == null
        ? `${t.spreadBps.toFixed(1)} bps under the reference, and the buy book is unmeasured`
        : `A buy that keeps ${WIDE_BPS} bps is about ${formatDollars(buy.capacityUsd)}, under the ${formatDollars(DESK_POLICY.minExecutableUsd)} floor`;
  } else if (t.history && t.spreadBps != null && t.spreadBps >= WIDE_BPS) {
    range = `${t.spreadBps.toFixed(1)} bps under the reference is inside the 30-day range`;
  } else if (!t.history && t.spreadBps != null && t.spreadBps >= WIDE_BPS) {
    range = `${t.spreadBps.toFixed(1)} bps under the reference — no 30-day range yet`;
  } else if (t.buySymbol && t.spreadBps != null) {
    range = `${nameOf(desk, t.buySymbol, t.buyCryptoId)} is ${t.spreadBps.toFixed(1)} bps under the liquid reference`;
  }
  const hold = t.trap ? trapHoldLine(t.trap) : "";
  return {
    tone: "wait",
    verb: "WAIT",
    detail: sentences([trapLine, hold, range]),
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

  if (t.action === "buy" && opp) {
    lines.push(
      `${opp.left} is $${opp.dollar.toFixed(2)} cheaper per ${unit} than the liquid reference (${opp.bps.toFixed(1)} bps).`,
    );
  } else if (t.action === "wait" && opp && t.spreadBps != null && t.spreadBps < WIDE_BPS) {
    lines.push(
      `${opp.left} is ${opp.bps.toFixed(1)} bps under the liquid reference. That is inside the band where the desk does not call a trade.`,
    );
  } else if (
    t.action === "wait" &&
    opp &&
    t.history?.extreme &&
    t.spreadBps != null &&
    t.spreadBps >= WIDE_BPS
  ) {
    lines.push(
      `${opp.left} is $${opp.dollar.toFixed(2)} cheaper per ${unit} than the liquid reference (${opp.bps.toFixed(1)} bps). That discount is a 30-day extreme, and the fill does not keep it.`,
    );
  } else if (t.action === "wait" && opp && t.history) {
    lines.push(
      `${opp.left} is $${opp.dollar.toFixed(2)} cheaper per ${unit} than the liquid reference (${opp.bps.toFixed(1)} bps), but that gap sits inside the 30-day range.`,
    );
  } else if (t.action === "wait" && opp) {
    lines.push(
      `${opp.left} is ${opp.bps.toFixed(1)} bps under the liquid reference, and there is no 30-day history yet, so the desk waits.`,
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
    const trapRow = findWrapper(desk, t.trap.symbol, t.trap.cryptoId);
    const floorMiss =
      trapRow != null && trapRow.volume24h >= desk.cluster.volumeFloorUsd
        ? `it is under ${Math.round(DESK_POLICY.leadVolumeShare * 100)}% of the lead wrapper's volume`
        : `it fails the $${formatUsd(desk.cluster.volumeFloorUsd)} daily volume floor`;
    lines.push(
      `${nameOf(desk, t.trap.symbol, t.trap.cryptoId)} is technically cheaper, but ${floorMiss}${versus ? ` — ${versus.phrase}${extra}` : ""}.`,
    );
    const hold = trapHoldLine(t.trap);
    if (hold) lines.push(hold);
  }

  const share = Math.round(DESK_POLICY.leadVolumeShare * 100);
  lines.push(
    desk.liquidReferenceUsd == null
      ? `No stable liquid reference — fewer than ${DESK_POLICY.minLiquidWrappers} wrappers clear the $${formatUsd(desk.cluster.volumeFloorUsd)} volume floor and ${share}% of the lead book, so thin names are not averaged in.`
      : `Liquid reference is the volume-weighted price of the core: above $${formatUsd(desk.cluster.volumeFloorUsd)} a day and at least ${share}% of the lead wrapper. Ondo total-return tokens stay out, because reinvested dividends sit in their price. It is wrapper versus wrapper, not a NAV.`,
  );

  if (t.history?.extreme) {
    lines.push(
      `Today is the ${ordinal(t.history.percentile)} percentile of the last ${t.history.days} sessions — ${t.history.percentile >= 90 ? "unusually wide" : "unusually tight"}.`,
    );
  }

  const print = bestPrint(desk);
  if (print) {
    const where = `${print.exchange}${print.pair ? ` ${print.pair}` : ""}`;
    const sample = print.listed === "demo" ? " Sample print, not a live book." : "";
    lines.push(
      t.action === "buy"
        ? `Preferred print: ${where}.${sample} Gross wrapper basis only — fees, gas, and bridging are not in this number.`
        : `Preferred print on the liquid wrapper: ${where}.${sample}`,
    );
  }
  const buy = findWrapper(desk, t.buySymbol, t.buyCryptoId);
  const extremeWide =
    Boolean(t.history?.extreme) && t.spreadBps != null && t.spreadBps >= WIDE_BPS;
  const gated =
    desk.venueCoverage.status === "plan-gated" || desk.venueCoverage.status === "demo";
  if (t.action === "buy" && buy?.capacityUsd != null && buy.depthUsd != null) {
    const where = print
      ? `${print.exchange}${print.pair ? ` ${print.pair}` : ""}`
      : "the recommended print";
    lines.push(
      `You can buy ${formatDollars(buy.capacityUsd)} on ${where}, and the average fill is still ${WIDE_BPS} bps under the liquid reference. ±2% ask depth ${formatDollars(buy.depthUsd)}.`,
    );
  } else if (extremeWide && buy?.capacityUsd != null && buy.capacityUsd < DESK_POLICY.minExecutableUsd) {
    lines.push(
      `A buy that keeps ${WIDE_BPS} bps is about ${formatDollars(buy.capacityUsd)}, under the ${formatDollars(DESK_POLICY.minExecutableUsd)} floor, so the desk waits.`,
    );
  } else if (extremeWide && buy?.depthUsd == null) {
    lines.push(
      gated
        ? "±2% buy depth is a Growth+ market-pairs field, so the desk will not call Prefer or invent a size from 24h volume."
        : "market-pairs/list returned venues and omitted ±2% ask depth, so the desk will not call Prefer or invent a size from 24h volume.",
    );
  } else if (gated && buy?.depthUsd == null) {
    lines.push(
      "Venue depth is a Growth+ market-pairs field, so executable size is not estimated from 24h volume.",
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
    if (!isLiquidEnough(row, floor, desk.wrappers)) continue;
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
    thin: !isLiquidEnough(row, floor, desk.wrappers),
  }));
}

function liquidityWord(
  row: Wrapper,
  floor: number,
  peers: Wrapper[],
): StructureColumn["liquidity"] {
  if (!isLiquidEnough(row, floor, peers)) return "Thin";
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
  const lead = [...desk.main].sort((a, b) => b.volume24h - a.volume24h)[0];
  take(lead);
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
    liquidity: liquidityWord(row, floor, desk.wrappers),
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
  const dollars = (spread?.points ?? [])
    .filter((point) => point.buyClose != null && point.avoidClose != null)
    .map((point) => (point.avoidClose as number) - (point.buyClose as number));
  const averageDollar = dollars.length
    ? dollars.reduce((sum, n) => sum + n, 0) / dollars.length
    : (summary?.avgDollarGap ?? null);
  const lastPoint = [...(spread?.points ?? [])]
    .reverse()
    .find((point) => point.buyClose != null && point.avoidClose != null);
  const lastDollar =
    lastPoint?.buyClose != null && lastPoint.avoidClose != null
      ? lastPoint.avoidClose - lastPoint.buyClose
      : null;
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
    averageDollar,
    lastDollar,
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
