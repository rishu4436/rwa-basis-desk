import type {
  HistorySummary,
  Ticket,
  TicketTrap,
  Tradability,
  Venue,
  Wrapper,
} from "./types";

/** Explicit desk rules. These are policy, not a market fact. */
export const DESK_POLICY = {
  wideBasisBps: 15,
  minHistoryDays: 5,
  extremePercentile: 90,
  executionDepthHaircut: 0.25,
  minLiquidWrappers: 2,
} as const;

/** Gap that counts as wide. 15 bps = 0.15%. */
export const WIDE_BPS = DESK_POLICY.wideBasisBps;

export function tradabilityFromVolume(volume24h: number): Tradability {
  if (volume24h >= 10_000_000) return "A";
  if (volume24h >= 1_000_000) return "B";
  if (volume24h >= 100_000) return "C";
  if (volume24h >= 10_000) return "D";
  return "F";
}

/** Minimum positive ±2% depth across live venues. Sample prints are ignored. */
export function aggregateDepthUsd(venues: Venue[]): number | null {
  const depths = venues
    .filter((v) => v.listed !== "demo" && v.depthUsd != null && v.depthUsd > 0)
    .map((v) => v.depthUsd as number);
  if (!depths.length) return null;
  return Math.min(...depths);
}

/** Conservative size cap. Null when there is no live depth to haircut. */
export function safeCapacityFromDepth(
  depthUsd: number | null,
  haircut = DESK_POLICY.executionDepthHaircut,
): number | null {
  if (depthUsd == null || !(depthUsd > 0)) return null;
  return depthUsd * haircut;
}

/**
 * Liquidity-weighted reference of wrappers above the volume floor.
 * Returns null unless at least two liquid wrappers exist — a thin name
 * must not set the reference when the book is thin.
 */
export function liquidReference(
  wrappers: Wrapper[],
  volumeFloorUsd: number,
): number | null {
  const priced = wrappers.filter(
    (w) => w.normalizedUsd != null && w.normalizedUsd > 0,
  );
  const liquid = priced.filter((w) => w.volume24h >= volumeFloorUsd);
  if (liquid.length < DESK_POLICY.minLiquidWrappers) return null;
  const weightSum = liquid.reduce((s, w) => s + Math.max(w.volume24h, 1), 0);
  if (weightSum <= 0) return null;
  return (
    liquid.reduce(
      (s, w) => s + (w.normalizedUsd as number) * Math.max(w.volume24h, 1),
      0,
    ) / weightSum
  );
}

export const volumeWeightedFairValue = liquidReference;

export function basisBps(price: number, fair: number): number {
  return ((price - fair) / fair) * 10_000;
}

export function applyFairValue(
  wrappers: Wrapper[],
  fair: number | null,
): Wrapper[] {
  return wrappers
    .map((w) => ({
      ...w,
      basisBps:
        fair && w.normalizedUsd != null
          ? basisBps(w.normalizedUsd, fair)
          : null,
      tradability: tradabilityFromVolume(w.volume24h),
      depthUsd: aggregateDepthUsd(w.venues),
      capacityUsd: safeCapacityFromDepth(aggregateDepthUsd(w.venues)),
    }))
    .sort((a, b) => {
      const av = a.normalizedUsd ?? Number.POSITIVE_INFINITY;
      const bv = b.normalizedUsd ?? Number.POSITIVE_INFINITY;
      return av - bv;
    });
}

export function isLiquidEnough(w: Wrapper, floor: number): boolean {
  return w.normalizedUsd != null && w.volume24h >= floor;
}

export function wrapperKey(w: {
  cryptoId: number | null;
  symbol: string;
}): string {
  return w.cryptoId != null ? `id:${w.cryptoId}` : `sym:${w.symbol}`;
}

/** Same ticker, different issuer — show the issuer so two SPYs do not look identical. */
export function wrapperLabel(w: Wrapper, peers: Wrapper[]): string {
  const clashes = peers.filter((p) => p.symbol === w.symbol).length > 1;
  if (!clashes) return w.symbol;
  const issuer = (w.issuerName || w.name).trim();
  return issuer ? `${w.symbol} · ${issuer}` : w.symbol;
}

/** Cheapest vs richest among every wrapper above the volume floor. */
export function liquidSpreadPair(
  wrappers: Wrapper[],
  floor: number,
): { cheap: Wrapper; rich: Wrapper; liquid: Wrapper[] } | null {
  const liquid = wrappers.filter((w) => isLiquidEnough(w, floor));
  if (liquid.length < 2) return null;
  const byPx = [...liquid].sort(
    (a, b) => (a.normalizedUsd as number) - (b.normalizedUsd as number),
  );
  const cheap = byPx[0];
  const rich = byPx[byPx.length - 1];
  if (wrapperKey(cheap) === wrapperKey(rich)) return null;
  return { cheap, rich, liquid };
}

export function splitBoard(
  wrappers: Wrapper[],
  floor: number,
): { main: Wrapper[]; dust: Wrapper[] } {
  const priced = wrappers.filter((w) => w.normalizedUsd != null);
  const main = priced.filter((w) => w.volume24h >= floor);
  const dust = wrappers.filter(
    (w) => w.normalizedUsd == null || w.volume24h < floor,
  );
  if (!main.length) return { main: wrappers, dust: [] };
  return { main, dust };
}

export type TicketContext = {
  /** Keyed by crypto id so two wrappers with the same ticker keep their books. */
  venuesByCryptoId?: Record<number, Venue[]>;
  history?: HistorySummary | null;
};

function venueLine(venues: Venue[] | undefined): string {
  const pick = venues?.find((v) => v.recommended) ?? venues?.[0];
  if (!pick) return "";
  const kind = pick.kind === "dex" ? "DEX" : "CEX";
  return ` If you still buy, use ${pick.exchange} ${pick.pair} (${kind}, $${formatUsd(pick.volume24h)} / day).`;
}

function ordinal(n: number): string {
  const v = Math.round(n);
  const m = v % 100;
  if (m >= 11 && m <= 13) return `${v}th`;
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

function historyLine(h: HistorySummary | null | undefined): string {
  if (!h) return "";
  return ` ${h.leftSymbol} vs ${h.rightSymbol} is ${h.lastBps.toFixed(1)} bps today, ${ordinal(h.percentile)} percentile of ${h.days} days (${h.minBps.toFixed(1)} to ${h.maxBps.toFixed(1)}).`;
}

function finish(
  ticket: Omit<Ticket, "venues" | "history">,
  ctx?: TicketContext,
): Ticket {
  const venues =
    ticket.buyCryptoId != null
      ? ctx?.venuesByCryptoId?.[ticket.buyCryptoId] ?? []
      : [];
  let detail = ticket.detail;
  if (ctx?.history && !detail.includes("percentile")) detail += historyLine(ctx.history);
  if (venues.length && !detail.includes("If you still buy")) detail += venueLine(venues);
  return {
    ...ticket,
    detail,
    venues,
    history: ctx?.history ?? null,
  };
}

function emptySides(): Pick<
  Ticket,
  "buySymbol" | "avoidSymbol" | "buyCryptoId" | "avoidCryptoId"
> {
  return {
    buySymbol: null,
    avoidSymbol: null,
    buyCryptoId: null,
    avoidCryptoId: null,
  };
}

function sides(buy: Wrapper | null, avoid: Wrapper | null) {
  return {
    buySymbol: buy?.symbol ?? null,
    avoidSymbol: avoid?.symbol ?? null,
    buyCryptoId: buy?.cryptoId ?? null,
    avoidCryptoId: avoid?.cryptoId ?? null,
  };
}

function asTrap(
  trap: Wrapper,
  vs: Wrapper | null,
  fair: number | null,
): TicketTrap {
  return {
    symbol: trap.symbol,
    cryptoId: trap.cryptoId,
    issuerName: trap.issuerName,
    volume24h: trap.volume24h,
    spreadBps:
      fair && trap.normalizedUsd != null
        ? basisBps(trap.normalizedUsd, fair)
        : null,
    dollarGap:
      trap.normalizedUsd != null && vs?.normalizedUsd != null
        ? vs.normalizedUsd - trap.normalizedUsd
        : null,
    vsSymbol: vs?.symbol ?? null,
  };
}

export function buildTicket(
  wrappers: Wrapper[],
  fair: number | null,
  volumeFloorUsd: number,
  unit: string,
  ctx?: TicketContext,
): Ticket {
  const priced = wrappers.filter((w) => w.normalizedUsd != null);
  const label = (w: Wrapper) => wrapperLabel(w, wrappers);

  if (priced.length <= 1) {
    const only = priced[0];
    return finish(
      {
        action: "only-one",
        headline: only
          ? `Only ${label(only)} is priced — nothing to compare`
          : "No priced wrappers yet",
        detail: only
          ? "CMC only returned one live wrapper for this underlying. A basis trade needs two tokens of the same thing."
          : "Add CMC_API_KEY to .env.local, or this underlying has no live quotes yet.",
        ...sides(only ?? null, null),
        spreadBps: null,
        dollarGap: null,
        trap: null,
      },
      ctx,
    );
  }

  const liquid = priced.filter((w) => isLiquidEnough(w, volumeFloorUsd));
  const cheapestOverall = [...priced].sort(
    (a, b) => (a.normalizedUsd as number) - (b.normalizedUsd as number),
  )[0];
  const mostLiquid = [...priced].sort((a, b) => b.volume24h - a.volume24h)[0];
  const trapRow =
    cheapestOverall && !isLiquidEnough(cheapestOverall, volumeFloorUsd)
      ? cheapestOverall
      : null;
  const trap =
    trapRow && mostLiquid && wrapperKey(trapRow) !== wrapperKey(mostLiquid)
      ? asTrap(trapRow, mostLiquid, fair)
      : null;

  if (liquid.length < 2) {
    const only = liquid[0] ?? mostLiquid;
    const trapLine = trap
      ? `${label(trapRow!)} looks cheaper at $${formatUsd(trap.volume24h)} / day — that discount is illiquidity, not a deal. `
      : "";
    return finish(
      {
        action: trap ? "skip" : "only-one",
        headline: trap
          ? `${label(trapRow!)} looks cheaper — you probably cannot exit`
          : `${label(only)} is the only wrapper you can actually trade`,
        detail: trap
          ? `${trapLine}Prefer ${label(only)} ($${formatUsd(only.volume24h)} / day). A basis trade still needs two liquid tokens of the same ${unit}.`
          : `Other listings are missing volume. A basis trade needs two liquid tokens of the same ${unit}.`,
        ...sides(only, null),
        spreadBps: trap?.spreadBps ?? null,
        dollarGap: trap?.dollarGap ?? null,
        trap,
      },
      ctx,
    );
  }

  const pair = liquidSpreadPair(priced, volumeFloorUsd);
  if (!pair) {
    return finish(
      {
        action: "wait",
        headline: "Not enough prices to call a ticket",
        detail: "Wrappers resolved but at least one is missing a live USD quote.",
        ...emptySides(),
        spreadBps: null,
        dollarGap: null,
        trap,
      },
      ctx,
    );
  }

  const { cheap, rich } = pair;
  const spreadBpsVal =
    cheap.normalizedUsd && rich.normalizedUsd
      ? basisBps(rich.normalizedUsd, cheap.normalizedUsd)
      : null;
  const dollarGap =
    cheap.normalizedUsd != null && rich.normalizedUsd != null
      ? rich.normalizedUsd - cheap.normalizedUsd
      : null;

  if (spreadBpsVal == null || dollarGap == null) {
    return finish(
      {
        action: "wait",
        headline: "Not enough prices to call a ticket",
        detail: "Wrappers resolved but at least one is missing a live USD quote.",
        ...sides(cheap, rich),
        spreadBps: null,
        dollarGap: null,
        trap,
      },
      ctx,
    );
  }

  const wide = spreadBpsVal >= WIDE_BPS;
  const extreme = Boolean(ctx?.history?.extreme);
  const cheapName = label(cheap);
  const richName = label(rich);

  if (!wide) {
    return finish(
      {
        action: "wait",
        headline: `No trade — ${cheapName} and ${richName} are ${spreadBpsVal.toFixed(1)} bps apart`,
        detail: `${cheapName} and ${richName} are inside a few dollars of each other across the liquid book. Paying extra for a brand name is optional, not a mistake.`,
        ...sides(cheap, rich),
        spreadBps: spreadBpsVal,
        dollarGap,
        trap,
      },
      ctx,
    );
  }

  if (!extreme) {
    const why = ctx?.history
      ? `The ${spreadBpsVal.toFixed(1)} bps gap is inside the 30-day range — not a fade.`
      : `The liquid book is ${spreadBpsVal.toFixed(1)} bps wide but there is no 30-day history yet, so this is not a fade.`;
    return finish(
      {
        action: "wait",
        headline: ctx?.history
          ? `No trade — ${spreadBpsVal.toFixed(1)} bps is typical, not a fade`
          : `No trade — ${spreadBpsVal.toFixed(1)} bps, no 30-day range yet`,
        detail: why,
        ...sides(cheap, rich),
        spreadBps: spreadBpsVal,
        dollarGap,
        trap,
      },
      ctx,
    );
  }

  const size =
    cheap.capacityUsd != null && cheap.depthUsd != null
      ? `Estimated executable size $${formatUsd(cheap.capacityUsd)} (${Math.round(DESK_POLICY.executionDepthHaircut * 100)}% of ±2% depth $${formatUsd(cheap.depthUsd)}).`
      : "Executable size is not estimated — ±2% venue depth is missing.";
  return finish(
    {
      action: "buy",
      headline: `Prefer ${cheapName}, skip ${richName}`,
      detail: `Gross wrapper basis, not a locked-in profit. Same ${unit}. ${richName} costs $${dollarGap.toFixed(2)} more (${spreadBpsVal.toFixed(1)} bps) than ${cheapName} — wide versus the 30-day range. ${size}`,
      ...sides(cheap, rich),
      spreadBps: spreadBpsVal,
      dollarGap,
      trap,
    },
    ctx,
  );
}

export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (abs >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

export function formatBps(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)} bps`;
}
