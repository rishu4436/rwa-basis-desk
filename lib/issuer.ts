import { asArray, cmcGet, num } from "./cmc";
import type { IssuerProfile, TradfiMarket } from "./types";

export function parseTradfiMarkets(raw: unknown): TradfiMarket[] {
  const out: TradfiMarket[] = [];
  for (const row of asArray<Record<string, unknown>>(raw)) {
    const ex =
      row.exchange && typeof row.exchange === "object"
        ? (row.exchange as Record<string, unknown>)
        : {};
    const exchange = String(ex.name ?? row.exchange ?? "").trim();
    const ticker = String(row.ticker ?? row.symbol ?? "").trim();
    const url = row.market_url
      ? String(row.market_url)
      : row.url
        ? String(row.url)
        : null;
    if (!exchange && !ticker) continue;
    out.push({ exchange: exchange || ticker, ticker, url });
  }
  return out;
}

export function parseIssuer(data: unknown, fallbackId: string): IssuerProfile | null {
  const root = (data ?? {}) as Record<string, unknown>;
  const row = (asArray<Record<string, unknown>>(root.issuers)[0] ??
    root) as Record<string, unknown>;
  const name = String(row.name ?? "").trim();
  if (!name && !row.issuer_id) return null;
  const tokens = asArray<Record<string, unknown>>(row.tokens).map((t) => ({
    symbol: String(t.symbol ?? ""),
    name: String(t.name ?? t.symbol ?? ""),
    cryptoId: num(t.crypto_id),
  }));
  return {
    issuerId: String(row.issuer_id ?? fallbackId),
    name: name || fallbackId,
    website: row.website ? String(row.website) : null,
    numTokens: num(row.num_tokens) ?? tokens.length,
    tokens: tokens.filter((t) => t.symbol).slice(0, 12),
  };
}

export async function loadIssuer(issuerId: string): Promise<IssuerProfile | null> {
  const res = await cmcGet("/v5/real-world-assets/issuers", {
    issuer_id: issuerId,
  });
  return parseIssuer(res.data, issuerId);
}
