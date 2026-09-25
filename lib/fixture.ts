import { applyFairValue, buildTicket, liquidReference, splitBoard } from "./basis";
import { getCluster } from "./clusters";
import type { DeskSnapshot, Venue, Wrapper } from "./types";

function venue(partial: Omit<Venue, "recommended" | "marketScore" | "depthUsd" | "lastUpdated" | "kind" | "category" | "slug"> & Partial<Venue>): Venue {
  return {
    slug: "",
    category: "spot",
    kind: "cex",
    recommended: false,
    marketScore: null,
    depthUsd: null,
    lastUpdated: "2026-09-18T12:00:00.000Z",
    ...partial,
  };
}

function wrap(partial: Partial<Wrapper> & Pick<Wrapper, "symbol">): Wrapper {
  return {
    name: partial.symbol,
    slug: null,
    cryptoId: null,
    rwaId: 1,
    issuerId: null,
    issuerName: "",
    rawPriceUsd: partial.normalizedUsd ?? null,
    normalizedUsd: null,
    ouncesPerToken: 1,
    volume24h: 0,
    marketCap: 0,
    percentChange24h: null,
    pairCount: 0,
    basisBps: null,
    tradability: "F",
    depthUsd: null,
    capacityUsd: null,
    venues: [],
    ...partial,
  };
}

/** Canned Gold desk for judges with no CMC key. */
export function goldFixture(): DeskSnapshot {
  const cluster = getCluster("gold");
  if (!cluster) throw new Error("gold cluster missing");
  const binance = venue({
    exchange: "Binance",
    slug: "binance",
    pair: "XAUt/USDT",
    volume24h: 48_000_000,
    priceUsd: 4170,
    cryptoId: 5176,
    depthUsd: 61_000,
    recommended: true,
  });
  const wrappers = applyFairValue(
    [
      wrap({
        symbol: "PAXG",
        name: "PAX Gold",
        slug: "pax-gold",
        cryptoId: 4705,
        issuerId: "paxos",
        issuerName: "Paxos",
        normalizedUsd: 4166,
        rawPriceUsd: 4166,
        volume24h: 280_000_000,
        marketCap: 800_000_000,
        pairCount: 12,
        venues: [
          venue({
            exchange: "Coinbase",
            slug: "coinbase",
            pair: "PAXG/USD",
            volume24h: 12_000_000,
            priceUsd: 4166,
            cryptoId: 4705,
            depthUsd: 48_200,
            recommended: true,
          }),
        ],
      }),
      wrap({
        symbol: "XAUt",
        name: "Tether Gold",
        slug: "tether-gold",
        cryptoId: 5176,
        issuerId: "tether",
        issuerName: "Tether Holdings",
        normalizedUsd: 4173,
        rawPriceUsd: 4173,
        volume24h: 17_000_000_000,
        marketCap: 1_400_000_000,
        pairCount: 40,
        venues: [binance],
      }),
      wrap({
        symbol: "CGO",
        name: "Comtech Gold",
        slug: "comtech-gold",
        cryptoId: 1,
        issuerName: "Comtech",
        ouncesPerToken: 1 / 31.1034768,
        normalizedUsd: 4100,
        rawPriceUsd: 132,
        volume24h: 8_000,
        pairCount: 1,
      }),
    ],
    4168,
  );
  const fair = liquidReference(wrappers, cluster.volumeFloorUsd) ?? 4168;
  const scored = applyFairValue(wrappers, fair);
  const { main, dust } = splitBoard(scored, cluster.volumeFloorUsd);
  const paxgVenues = scored.find((w) => w.symbol === "PAXG")?.venues ?? [];
  const ticket = buildTicket(scored, fair, cluster.volumeFloorUsd, cluster.unit, {
    venuesByCryptoId: {
      4705: paxgVenues,
      5176: [binance],
    },
    history: {
      leftSymbol: "PAXG",
      rightSymbol: "XAUt",
      lastBps: 16.8,
      minBps: 2,
      maxBps: 28,
      percentile: 55,
      days: 30,
      extreme: false,
      avgBps: 12,
      avgDollarGap: 10,
    },
  });
  const points = Array.from({ length: 12 }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
    bps: 8 + (i % 5) * 2,
    buyClose: 4160,
    avoidClose: 4170,
  }));
  return {
    cluster,
    generatedAt: "2026-09-18T12:00:00.000Z",
    source: "fixture",
    liquidReferenceUsd: fair,
    venueCoverage: {
      status: "live",
      detail: "Canned prints for the no-key walkthrough. Not a CMC market-pairs response.",
    },
    averageTokenizedPrice: 4168.4,
    tradfiMarkets: [],
    issuer: {
      issuerId: "paxos",
      name: "Paxos",
      website: "https://www.paxos.com/",
      numTokens: 1,
      tokens: [{ symbol: "PAXG", name: "PAX Gold", cryptoId: 4705 }],
    },
    wrappers: scored,
    main,
    dust,
    ticket,
    spread: {
      clusterId: "gold",
      buySymbol: "PAXG",
      avoidSymbol: "XAUt",
      points,
      summary: ticket.history,
      endpointsUsed: [],
    },
    underlying: {
      rwaId: 1,
      name: "Gold",
      symbol: "GOLD",
      assetType: "commodity",
      website: null,
      industry: "Commodity",
      cik: null,
      founded: null,
      employees: null,
      primaryExchange: null,
      about: "Canned Gold desk for judges running without a CMC key.",
      tokenizedMcap: 4_600_000_000,
      tokenizedVolume: 400_000_000,
    },
    endpointsUsed: [
      "GET /v5/real-world-assets/map",
      "GET /v5/real-world-assets/quotes/latest",
      "GET /v5/real-world-assets/market-pairs/list",
      "GET /v5/real-world-assets/info",
      "GET /v5/real-world-assets/issuers",
      "GET /v3/cryptocurrency/quotes/latest",
      "GET /v2/cryptocurrency/ohlcv/historical",
    ],
    warnings: [
      "Fixture — no CMC_API_KEY. This is a canned Gold desk so the ticket is still visible.",
    ],
    evidence: {
      rwaMapCount: 4,
      rwaQuoteCount: 1,
      cryptoQuoteCount: 3,
      pairCount: 12,
      cmcTimestamp: "2026-09-18T12:00:00.000Z",
      lastUpdated: "2026-09-18T12:00:00.000Z",
    },
  };
}
