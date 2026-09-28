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
  /** Core member must trade at least this share of the lead wrapper's volume. */
  leadVolumeShare: 0.1,
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

/** Ondo stocks are total-return trackers: reinvested dividends sit in the token price. */
export function isTotalReturnIssuer(issuerName: string): boolean {
  return /\bondo\b/i.test(issuerName);
}

export function hasMarket(w: Wrapper): boolean {
  return w.normalizedUsd != null && w.normalizedUsd > 0 && w.volume24h > 0;
}

/** Highest volume among price wrappers that actually trade. */
export function leadVolumeUsd(wrappers: Wrapper[]): number {
  let lead = 0;
  for (const w of wrappers) {
    if (!hasMarket(w) || isTotalReturnIssuer(w.issuerName)) continue;
    if (w.volume24h > lead) lead = w.volume24h;
  }
  return lead;
}

export function isCoreWrapper(w: Wrapper, floor: number, lead: number): boolean {
  if (!hasMarket(w) || isTotalReturnIssuer(w.issuerName)) return false;
  if (w.volume24h < floor || !(lead > 0)) return false;
  return w.volume24h + 1e-6 >= lead * DESK_POLICY.leadVolumeShare;
}

/** Price wrappers that clear the dollar floor and 10% of the lead book. */
export function coreBook(wrappers: Wrapper[], floor: number): Wrapper[] {
  const lead = leadVolumeUsd(wrappers);
  return wrappers.filter((w) => isCoreWrapper(w, floor, lead));
}

export function isLiquidEnough(
  w: Wrapper,
  floor: number,
  peers: Wrapper[],
): boolean {
  return isCoreWrapper(w, floor, leadVolumeUsd(peers));
}

function byPrice(a: Wrapper, b: Wrapper): number {
  const d = (a.normalizedUsd as number) - (b.normalizedUsd as number);
  if (d !== 0) return d;
  return a.symbol.localeCompare(b.symbol);
}

export function cheapestCore(wrappers: Wrapper[], floor: number): Wrapper | null {
  const core = coreBook(wrappers, floor);
  if (!core.length) return null;
  return [...core].sort(byPrice)[0];
}

/** How far a price sits under the reference, in bps. Negative when it is rich. */
export function discountBps(price: number, fair: number): number {
  return ((fair - price) / fair) * 10_000;
}

/**
 * Volume-weighted price of the core book.
 * Returns null unless at least two core wrappers exist.
 */
export function liquidReference(
  wrappers: Wrapper[],
  volumeFloorUsd: number,
): number | null {
  const liquid = coreBook(wrappers, volumeFloorUsd);
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

/** Cheapest vs richest inside the core. Tails and total-return tokens stay out. */
export function liquidSpreadPair(
  wrappers: Wrapper[],
  floor: number,
): { cheap: Wrapper; rich: Wrapper; liquid: Wrapper[] } | null {
  const liquid = coreBook(wrappers, floor);
  if (liquid.length < 2) return null;
  const byPx = [...liquid].sort(byPrice);
  const cheap = byPx[0];
  const rich = byPx[byPx.length - 1];
  if (wrapperKey(cheap) === wrapperKey(rich)) return null;
  return { cheap, rich, liquid };
}

export type BoardSplit = {
  main: Wrapper[];
  dust: Wrapper[];
  quiet: Wrapper[];
  accrual: Wrapper[];
};

export function splitBoard(wrappers: Wrapper[], floor: number): BoardSplit {
  const lead = leadVolumeUsd(wrappers);
  const main: Wrapper[] = [];
  const dust: Wrapper[] = [];
  const quiet: Wrapper[] = [];
  const accrual: Wrapper[] = [];
  for (const w of wrappers) {
    if (!hasMarket(w)) {
      quiet.push(w);
      continue;
    }
    if (isTotalReturnIssuer(w.issuerName)) {
      accrual.push(w);
      continue;
    }
    if (isCoreWrapper(w, floor, lead)) main.push(w);
    else dust.push(w);
  }
  main.sort(byPrice);
  dust.sort(byPrice);
  accrual.sort(byPrice);
  return { main, dust, quiet, accrual };
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
  const label = (w: Wrapper) => wrapperLabel(w, wrappers);
  const anchor =
    [...wrappers]
      .filter((w) => hasMarket(w) && !isTotalReturnIssuer(w.issuerName))
      .sort((a, b) => b.volume24h - a.volume24h)[0] ?? null;
  const anchorPrice = anchor?.normalizedUsd ?? null;
  const trapRow =
    anchorPrice == null
      ? null
      : (splitBoard(wrappers, volumeFloorUsd).dust.find(
          (w) => w.normalizedUsd != null && w.normalizedUsd < anchorPrice,
        ) ?? null);
  const trap =
    trapRow && anchor && wrapperKey(trapRow) !== wrapperKey(anchor)
      ? asTrap(trapRow, anchor, fair)
      : null;
  const core = coreBook(wrappers, volumeFloorUsd);

  if (core.length < 2 || fair == null || !(fair > 0)) {
    const accrualOnly =
      !anchor &&
      wrappers.some((w) => hasMarket(w) && isTotalReturnIssuer(w.issuerName));
    const only = core[0] ?? anchor;
    if (accrualOnly) {
      return finish(
        {
          action: "only-one",
          headline: "Only a total-return wrapper is priced",
          detail:
            "Ondo prices include reinvested dividends, so one total-return token is not a wrapper basis.",
          ...emptySides(),
          spreadBps: null,
          dollarGap: null,
          trap,
        },
        ctx,
      );
    }
    const trapLine = trap
      ? `${label(trapRow!)} looks cheaper at $${formatUsd(trap.volume24h)} / day — that discount is illiquidity, not a deal. `
      : "";
    return finish(
      {
        action: trap && only ? "skip" : "only-one",
        headline:
          trap && only
            ? `${label(trapRow!)} looks cheaper — you probably cannot exit`
            : only
              ? `${label(only)} is the only wrapper you can actually trade`
              : "No priced wrappers yet",
        detail:
          trap && only
            ? `${trapLine}Prefer ${label(only)} ($${formatUsd(only.volume24h)} / day). A basis trade still needs two liquid tokens of the same ${unit}.`
            : only
              ? `Other listings are missing volume or sit outside the core. A basis trade needs two liquid tokens of the same ${unit}.`
              : "Add CMC_API_KEY to .env.local, or this underlying has no live quotes yet.",
        ...sides(only, null),
        spreadBps: trap?.spreadBps ?? null,
        dollarGap: trap?.dollarGap ?? null,
        trap,
      },
      ctx,
    );
  }

  const cheap = cheapestCore(wrappers, volumeFloorUsd);
  if (cheap?.normalizedUsd == null) {
    return finish(
      {
        action: "wait",
        headline: "Not enough prices to call a ticket",
        detail: "Wrappers resolved but the core is missing a live USD quote.",
        ...emptySides(),
        spreadBps: null,
        dollarGap: null,
        trap,
      },
      ctx,
    );
  }

  const spreadBpsVal = discountBps(cheap.normalizedUsd, fair);
  const dollarGap = fair - cheap.normalizedUsd;
  const wide = spreadBpsVal >= WIDE_BPS;
  const extreme =
    Boolean(ctx?.history?.extreme) &&
    (ctx?.history?.percentile ?? 0) >= DESK_POLICY.extremePercentile;
  const cheapName = label(cheap);

  if (!wide) {
    return finish(
      {
        action: "wait",
        headline: `No trade — ${cheapName} is ${spreadBpsVal.toFixed(1)} bps under the liquid reference`,
        detail: `${cheapName} is inside the band where the desk does not call a trade. The reference is the volume-weighted core, not the richest wrapper.`,
        ...sides(cheap, null),
        spreadBps: spreadBpsVal,
        dollarGap,
        trap,
      },
      ctx,
    );
  }

  if (!extreme) {
    const why = ctx?.history
      ? `The ${spreadBpsVal.toFixed(1)} bps discount to the liquid reference is inside the 30-day range — not a fade.`
      : `The core is ${spreadBpsVal.toFixed(1)} bps under the liquid reference, but there is no 30-day history yet, so this is not a fade.`;
    return finish(
      {
        action: "wait",
        headline: ctx?.history
          ? `No trade — ${spreadBpsVal.toFixed(1)} bps under the reference is typical, not a fade`
          : `No trade — ${spreadBpsVal.toFixed(1)} bps under the reference, no 30-day range yet`,
        detail: why,
        ...sides(cheap, null),
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
      headline: `Prefer ${cheapName}`,
      detail: `Gross wrapper basis, not a locked-in profit. Same ${unit}. ${cheapName} is $${dollarGap.toFixed(2)} under the liquid reference (${spreadBpsVal.toFixed(1)} bps) — wide versus the 30-day range. ${size}`,
      ...sides(cheap, null),
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
