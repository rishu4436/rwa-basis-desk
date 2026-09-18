import type { HistorySummary, Ticket, Tradability, Venue, Wrapper } from "./types";

export function tradabilityFromVolume(volume24h: number): Tradability {
  if (volume24h >= 10_000_000) return "A";
  if (volume24h >= 1_000_000) return "B";
  if (volume24h >= 100_000) return "C";
  if (volume24h >= 10_000) return "D";
  return "F";
}

export function capacityFromVolume(volume24h: number): number {
  return volume24h * 0.01;
}

export function volumeWeightedFairValue(
  wrappers: Wrapper[],
  volumeFloorUsd: number,
): number | null {
  const priced = wrappers.filter(
    (w) => w.normalizedUsd != null && w.normalizedUsd > 0,
  );
  const liquid = priced.filter((w) => w.volume24h >= volumeFloorUsd);
  const pool = liquid.length >= 2 ? liquid : priced;
  const weightSum = pool.reduce((s, w) => s + Math.max(w.volume24h, 1), 0);
  if (!pool.length || weightSum <= 0) return null;
  return (
    pool.reduce(
      (s, w) => s + (w.normalizedUsd as number) * Math.max(w.volume24h, 1),
      0,
    ) / weightSum
  );
}

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
      capacityUsd: capacityFromVolume(w.volume24h),
    }))
    .sort((a, b) => {
      const av = a.normalizedUsd ?? Number.POSITIVE_INFINITY;
      const bv = b.normalizedUsd ?? Number.POSITIVE_INFINITY;
      return av - bv;
    });
}

function isLiquidEnough(w: Wrapper, floor: number): boolean {
  return w.normalizedUsd != null && w.volume24h >= floor;
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
  venuesBySymbol?: Record<string, Venue[]>;
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
  const venues = ticket.buySymbol
    ? ctx?.venuesBySymbol?.[ticket.buySymbol] ?? []
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

export function buildTicket(
  wrappers: Wrapper[],
  fair: number | null,
  volumeFloorUsd: number,
  unit: string,
  ctx?: TicketContext,
): Ticket {
  const priced = wrappers.filter((w) => w.normalizedUsd != null);
  if (priced.length <= 1) {
    const only = priced[0];
    return finish(
      {
        action: "only-one",
        headline: only
          ? `Only ${only.symbol} is priced — nothing to compare`
          : "No priced wrappers yet",
        detail: only
          ? "CMC only returned one live wrapper for this underlying. A basis trade needs two tokens of the same thing."
          : "Add CMC_API_KEY to .env.local, or this underlying has no live quotes yet.",
        buySymbol: only?.symbol ?? null,
        avoidSymbol: null,
        spreadBps: null,
        dollarGap: null,
      },
      ctx,
    );
  }

  const liquid = priced.filter((w) => isLiquidEnough(w, volumeFloorUsd));
  const cheapestOverall = [...priced].sort(
    (a, b) => (a.normalizedUsd as number) - (b.normalizedUsd as number),
  )[0];
  const mostLiquid = [...priced].sort((a, b) => b.volume24h - a.volume24h)[0];

  const trap =
    cheapestOverall && !isLiquidEnough(cheapestOverall, volumeFloorUsd)
      ? cheapestOverall
      : null;
  if (trap && mostLiquid && trap.symbol !== mostLiquid.symbol) {
    const gap =
      trap.normalizedUsd != null && mostLiquid.normalizedUsd != null
        ? mostLiquid.normalizedUsd - trap.normalizedUsd
        : null;
    return finish(
      {
        action: "skip",
        headline: `${trap.symbol} looks cheaper — you probably cannot exit`,
        detail: `${trap.symbol} prints a lower price but only trades $${formatUsd(trap.volume24h)} / day. That discount is illiquidity, not a deal. Prefer ${mostLiquid.symbol} ($${formatUsd(mostLiquid.volume24h)} / day).`,
        buySymbol: mostLiquid.symbol,
        avoidSymbol: trap.symbol,
        spreadBps:
          fair && trap.normalizedUsd != null
            ? basisBps(trap.normalizedUsd, fair)
            : null,
        dollarGap: gap,
      },
      ctx,
    );
  }

  if (liquid.length < 2) {
    return finish(
      {
        action: "only-one",
        headline: `${mostLiquid.symbol} is the only wrapper you can actually trade`,
        detail: `Other listings are missing volume. A basis trade needs two liquid tokens of the same ${unit}.`,
        buySymbol: mostLiquid.symbol,
        avoidSymbol: null,
        spreadBps: null,
        dollarGap: null,
      },
      ctx,
    );
  }

  const ranked = [...liquid].sort((a, b) => b.volume24h - a.volume24h);
  const a = ranked[0];
  const b = ranked[1];
  const cheapest =
    (a.normalizedUsd as number) <= (b.normalizedUsd as number) ? a : b;
  const richest = cheapest === a ? b : a;

  const spreadBpsVal =
    cheapest.normalizedUsd && richest.normalizedUsd
      ? basisBps(richest.normalizedUsd, cheapest.normalizedUsd)
      : null;
  const dollarGap =
    cheapest.normalizedUsd != null && richest.normalizedUsd != null
      ? richest.normalizedUsd - cheapest.normalizedUsd
      : null;

  if (spreadBpsVal == null || dollarGap == null) {
    return finish(
      {
        action: "wait",
        headline: "Not enough prices to call a ticket",
        detail: "Wrappers resolved but at least one is missing a live USD quote.",
        buySymbol: null,
        avoidSymbol: null,
        spreadBps: null,
        dollarGap: null,
      },
      ctx,
    );
  }

  const wide = spreadBpsVal >= 15;
  const extreme = Boolean(ctx?.history?.extreme);
  if (!wide || (ctx?.history && !extreme)) {
    const why =
      ctx?.history && wide && !extreme
        ? `The ${spreadBpsVal.toFixed(1)} bps gap is inside the 30-day range — not a fade.`
        : `${cheapest.symbol} and ${richest.symbol} are inside a few dollars of each other. Paying extra for a brand name is optional, not a mistake.`;
    return finish(
      {
        action: "wait",
        headline: `No trade — wrappers are within ${spreadBpsVal.toFixed(1)} bps`,
        detail: why,
        buySymbol: cheapest.symbol,
        avoidSymbol: richest.symbol,
        spreadBps: spreadBpsVal,
        dollarGap,
      },
      ctx,
    );
  }

  return finish(
    {
      action: "buy",
      headline: `Buy ${cheapest.symbol}, skip ${richest.symbol}`,
      detail: `Same ${unit}. ${richest.symbol} costs $${dollarGap.toFixed(2)} more (${spreadBpsVal.toFixed(1)} bps) than ${cheapest.symbol}${ctx?.history?.extreme ? " — a 30-day wide" : ""}. Cap size around $${formatUsd(Math.min(cheapest.capacityUsd, richest.capacityUsd))} (1% of 24h volume).`,
      buySymbol: cheapest.symbol,
      avoidSymbol: richest.symbol,
      spreadBps: spreadBpsVal,
      dollarGap,
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
