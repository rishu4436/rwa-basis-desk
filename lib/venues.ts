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

const MAJOR =
  /binance|coinbase|kraken|okx|bybit|bitget|kucoin|gate|mexc|htx|bitfinex|gemini|crypto\.com/i;

function isMajor(v: Venue): boolean {
  return (
    v.kind === "cex" && (MAJOR.test(v.exchange) || MAJOR.test(v.slug))
  );
}

/** Prefer a major CEX when its volume is in the same league as the leader. */
export function pickPrint(rows: Venue[]): Venue {
  const ranked = [...rows].sort((a, b) => b.volume24h - a.volume24h);
  const top = ranked[0];
  const scored = ranked.filter(
    (v) => v.marketScore != null && v.volume24h >= 100_000,
  );
  if (scored.length) {
    scored.sort(
      (a, b) =>
        (b.marketScore as number) - (a.marketScore as number) ||
        b.volume24h - a.volume24h,
    );
    const best = scored[0];
    const floor = (best.marketScore as number) * 0.9;
    const major = scored.find((v) => isMajor(v) && (v.marketScore as number) >= floor);
    return major ?? best;
  }
  const floor = Math.max(100_000, top.volume24h * 0.45);
  const major =
    ranked.find((v) => isMajor(v) && v.volume24h >= floor) ??
    ranked.find((v) => v.kind === "cex" && v.volume24h >= 100_000);
  return major ?? top;
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
