import { num } from "./cmc";
import type { Venue } from "./types";

const DEX =
  /uniswap|pancake|sushi|curve|raydium|orca|balancer|aerodrome|velodrome|traderjoe|spooky|quickswap|camelot|thruster|fluid|jupiter|meteora|lydia|sunswap|biswap/i;

export function parseVenues(pairs: unknown[]): Venue[] {
  const out: Venue[] = [];
  for (const raw of pairs) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const category = String(p.category || "").toLowerCase();
    if (category !== "spot") continue;
    const ex = (p.exchange || {}) as Record<string, unknown>;
    const base = (p.market_pair_base || {}) as Record<string, unknown>;
    const quotes = Array.isArray(p.quotes) ? p.quotes : [];
    const usd =
      (quotes.find((q) => {
        const row = q as Record<string, unknown>;
        return row.symbol === "USD";
      }) as Record<string, unknown> | undefined) ??
      (quotes[0] as Record<string, unknown> | undefined) ??
      {};
    const name = String(ex.name || "");
    const slug = String(ex.slug || "");
    if (!name) continue;
    out.push({
      exchange: name,
      slug,
      pair: String(p.market_pair || ""),
      category,
      kind: DEX.test(name) || DEX.test(slug) ? "dex" : "cex",
      volume24h: num(usd.volume_24h) ?? 0,
      priceUsd: num(usd.price),
      cryptoId: num(base.crypto_id),
      recommended: false,
      marketScore: num(p.market_score ?? p.marketScore),
      depthUsd: num(
        p.depth_negative_two ??
          p.depth_usd_negative_2 ??
          p.effective_liquidity,
      ),
      lastUpdated: usd.last_updated
        ? String(usd.last_updated)
        : p.last_updated
          ? String(p.last_updated)
          : null,
    });
  }
  return out;
}

const STALE_MS = 6 * 60 * 60 * 1000;

function ageMs(v: Venue, now: number): number | null {
  if (!v.lastUpdated) return null;
  const t = Date.parse(v.lastUpdated);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, now - t);
}

/**
 * Preferred print for a buy.
 * Price and ±2% depth come first. Market score and volume are tie-breaks.
 * A large venue with a worse price does not win on size alone.
 */
export function pickPrint(rows: Venue[], now = Date.now()): Venue {
  const priced = rows.filter((v) => v.priceUsd != null && v.priceUsd > 0);
  const pool = priced.length ? priced : rows;
  const fresh = pool.filter((v) => {
    const age = ageMs(v, now);
    return age == null || age <= 24 * 60 * 60 * 1000;
  });
  const candidates = fresh.length ? fresh : pool;
  const bestPrice = Math.min(
    ...candidates.map((v) => v.priceUsd ?? Number.POSITIVE_INFINITY),
  );

  function score(v: Venue): number {
    const price = v.priceUsd ?? bestPrice;
    const gapBps =
      bestPrice > 0 && Number.isFinite(bestPrice) && price > 0
        ? ((price - bestPrice) / bestPrice) * 10_000
        : 500;
    // A few bps is quote noise when depth is the real cost. Ignore it.
    const pricePenalty = gapBps <= 5 ? 0 : gapBps - 5;
    const depth = v.depthUsd ?? 0;
    const depthPenalty = depth <= 0 ? 80 : depth < 10_000 ? 40 : 0;
    const age = ageMs(v, now);
    const stalePenalty =
      age == null ? 15 : age > STALE_MS ? 60 : age > 60 * 60 * 1000 ? 10 : 0;
    const quality = -((v.marketScore ?? 0) * 0.5);
    const volume = -Math.log10(Math.max(v.volume24h, 1)) * 0.25;
    return pricePenalty + depthPenalty + stalePenalty + quality + volume;
  }

  return [...candidates].sort(
    (a, b) => score(a) - score(b) || (b.depthUsd ?? 0) - (a.depthUsd ?? 0),
  )[0];
}

/** Labelled sample prints for the gold walkthrough when market pairs are plan-gated. */
const DEMO_PRINTS: Record<number, Venue> = {
  4705: {
    exchange: "Binance",
    slug: "binance",
    pair: "PAXG/USDT",
    category: "spot",
    kind: "cex",
    volume24h: 12_000_000,
    priceUsd: null,
    cryptoId: 4705,
    recommended: false,
    marketScore: null,
    depthUsd: 48_200,
    lastUpdated: null,
    listed: "demo",
  },
  5176: {
    exchange: "Binance",
    slug: "binance",
    pair: "XAUt/USDT",
    category: "spot",
    kind: "cex",
    volume24h: 40_000_000,
    priceUsd: null,
    cryptoId: 5176,
    recommended: false,
    marketScore: null,
    depthUsd: 61_000,
    lastUpdated: null,
    listed: "demo",
  },
};

export function demoVenuesFor(cryptoId: number | null): Venue[] {
  if (cryptoId == null) return [];
  const row = DEMO_PRINTS[cryptoId];
  return row ? [{ ...row }] : [];
}

/** Top spot prints for one wrapper. Prefer a real CEX if one has volume. */
export function venuesFor(
  venues: Venue[],
  cryptoId: number | null,
  take = 3,
): Venue[] {
  if (cryptoId == null) return [];
  const rows = venues
    .filter((v) => v.cryptoId === cryptoId && v.volume24h > 0)
    .sort((a, b) => b.volume24h - a.volume24h);
  if (!rows.length) return [];
  const pick = pickPrint(rows);
  const top = rows.slice(0, take).map((v) => ({
    ...v,
    recommended: v.exchange === pick.exchange && v.pair === pick.pair,
  }));
  if (!top.some((v) => v.recommended)) {
    top[0] = { ...top[0], recommended: false };
    return [
      { ...pick, recommended: true },
      ...top.filter((v) => v.exchange !== pick.exchange || v.pair !== pick.pair),
    ].slice(0, take);
  }
  return top;
}

export function pairCountFor(venues: Venue[], cryptoId: number | null): number {
  if (cryptoId == null) return 0;
  return venues.filter((v) => v.cryptoId === cryptoId).length;
}
