import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyFairValue,
  buildTicket,
  liquidSpreadPair,
  safeCapacityFromDepth,
  splitBoard,
  tradabilityFromVolume,
  volumeWeightedFairValue,
  wrapperLabel,
} from "./basis";
import { closesForId, summarizeHistory } from "./history";
import { CmcError, isPlanGate } from "./cmc";
import { assetClassFrom, unitFor } from "./clusters";
import { allowRequest } from "./guard";
import { parseVenues, pickPrint, venuesFor } from "./venues";
import { goldFixture } from "./fixture";
import {
  basisOpportunity,
  basisRead,
  deskCall,
  endpointHits,
  liquidityBars,
  structureColumns,
  structureCounts,
  whyLines,
} from "./narrative";
import { parseIssuer, parseTradfiMarkets } from "./issuer";
import { ouncesPerToken } from "./clusters";
import {
  bpsToPct,
  bpsToUsd,
  extraOnNotional,
  formatDelta,
  formatNotional,
  formatPlainUsd,
  nextNotional,
} from "./display";
import { cmcCurrencyUrl, edgarCompanyUrl } from "./links";
import type { Wrapper } from "./types";
import {
  DEFAULT_WATCHLIST,
  deskPath,
  frozenDeskPath,
  parseFrozenShare,
  resolveAssetParam,
  shareAssetKey,
} from "./watchlist";

function wrap(partial: Partial<Wrapper> & Pick<Wrapper, "symbol">): Wrapper {
  return {
    name: partial.symbol,
    slug: null,
    cryptoId: null,
    rwaId: null,
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

describe("display units", () => {
  it("converts bps to percent, dollars, and notional extra", () => {
    assert.equal(bpsToPct(100), 1);
    assert.equal(bpsToUsd(-10, 4000), -4);
    assert.equal(extraOnNotional(50, 10_000), 50);
    assert.equal(formatDelta(-10, "pct", 4000), "−0.10%");
    assert.equal(formatDelta(-10, "usd", 4000), "−$4.00");
    assert.equal(formatNotional(100_000), "$100,000");
    assert.equal(formatPlainUsd(1034), "$1,034");
    assert.equal(formatPlainUsd(0.3), "$0.30");
    assert.equal(nextNotional(10_000), 100_000);
    assert.equal(nextNotional(100_000), 1_000);
  });
});

describe("gold units", () => {
  it("treats PAXG as one ounce and CGO as grams", () => {
    assert.equal(ouncesPerToken("PAXG"), 1);
    assert.ok(Math.abs(ouncesPerToken("CGO") - 1 / 31.1034768) < 1e-9);
  });
});

describe("fair value", () => {
  it("ignores thin names when two liquid wrappers exist", () => {
    const rows = applyFairValue(
      [
        wrap({ symbol: "XAUt", normalizedUsd: 4164, volume24h: 17_000_000_000 }),
        wrap({ symbol: "PAXG", normalizedUsd: 4173, volume24h: 280_000_000 }),
        wrap({ symbol: "XAUM", normalizedUsd: 4200, volume24h: 700_000 }),
      ],
      volumeWeightedFairValue(
        [
          wrap({ symbol: "XAUt", normalizedUsd: 4164, volume24h: 17_000_000_000 }),
          wrap({ symbol: "PAXG", normalizedUsd: 4173, volume24h: 280_000_000 }),
          wrap({ symbol: "XAUM", normalizedUsd: 4200, volume24h: 700_000 }),
        ],
        1_000_000,
      ),
    );
    const xaum = rows.find((r) => r.symbol === "XAUM");
    assert.ok((xaum?.basisBps ?? 0) > 0);
  });

  it("returns no reference when fewer than two wrappers are liquid", () => {
    const ref = volumeWeightedFairValue(
      [
        wrap({ symbol: "XAUt", normalizedUsd: 4200, volume24h: 300_000_000 }),
        wrap({ symbol: "XAUM", normalizedUsd: 4050, volume24h: 30_000 }),
      ],
      1_000_000,
    );
    assert.equal(ref, null);
  });

  it("sets executable size to 25% of the minimum live depth", () => {
    const rows = applyFairValue(
      [
        wrap({
          symbol: "PAXG",
          normalizedUsd: 4100,
          volume24h: 5_000_000,
          venues: [
            {
              exchange: "Binance",
              slug: "binance",
              pair: "PAXG/USDT",
              category: "spot",
              kind: "cex",
              volume24h: 5_000_000,
              priceUsd: 4100,
              cryptoId: 4705,
              recommended: true,
              marketScore: null,
              depthUsd: 40_000,
              lastUpdated: null,
              listed: "live",
            },
            {
              exchange: "OKX",
              slug: "okx",
              pair: "PAXG/USDT",
              category: "spot",
              kind: "cex",
              volume24h: 1_000_000,
              priceUsd: 4102,
              cryptoId: 4705,
              recommended: false,
              marketScore: null,
              depthUsd: 32_800,
              lastUpdated: null,
              listed: "live",
            },
          ],
        }),
      ],
      4100,
    );
    assert.equal(rows[0].depthUsd, 32_800);
    assert.equal(rows[0].capacityUsd, safeCapacityFromDepth(32_800));
    assert.equal(rows[0].capacityUsd, 8_200);
  });

  it("ignores sample depth when estimating executable size", () => {
    const rows = applyFairValue(
      [
        wrap({
          symbol: "PAXG",
          normalizedUsd: 4100,
          volume24h: 5_000_000,
          venues: [
            {
              exchange: "Binance",
              slug: "binance",
              pair: "PAXG/USDT",
              category: "spot",
              kind: "cex",
              volume24h: 1,
              priceUsd: null,
              cryptoId: 4705,
              recommended: false,
              marketScore: null,
              depthUsd: 48_200,
              lastUpdated: null,
              listed: "demo",
            },
          ],
        }),
      ],
      null,
    );
    assert.equal(rows[0].capacityUsd, null);
    assert.equal(rows[0].depthUsd, null);
  });
});

describe("ticket", () => {
  it("warns on a cheap illiquid wrapper when it is the only other name", () => {
    const scored = applyFairValue(
      [
        wrap({ symbol: "XAUM", normalizedUsd: 4100, volume24h: 7_000 }),
        wrap({ symbol: "XAUt", normalizedUsd: 4164, volume24h: 17_000_000_000 }),
      ],
      4164,
    );
    const ticket = buildTicket(scored, 4164, 1_000_000, "troy ounce");
    assert.equal(ticket.action, "skip");
    assert.equal(ticket.trap?.symbol, "XAUM");
    assert.equal(ticket.buySymbol, "XAUt");
  });

  it("says wait when liquid wrappers are tight", () => {
    const scored = applyFairValue(
      [
        wrap({ symbol: "XAUt", normalizedUsd: 4164, volume24h: 17_000_000_000 }),
        wrap({ symbol: "PAXG", normalizedUsd: 4166, volume24h: 280_000_000 }),
      ],
      4164.5,
    );
    const ticket = buildTicket(scored, 4164.5, 1_000_000, "troy ounce");
    assert.equal(ticket.action, "wait");
    assert.match(ticket.headline, /bps apart/);
    assert.equal(ticket.trap, null);
  });

  it("keeps the liquid ticket when a dust trap exists", () => {
    const scored = applyFairValue(
      [
        wrap({ symbol: "XAUM", normalizedUsd: 4302, volume24h: 447_000 }),
        wrap({ symbol: "XAUt", normalizedUsd: 4320, volume24h: 297_000_000 }),
        wrap({ symbol: "PAXG", normalizedUsd: 4325, volume24h: 247_000_000 }),
      ],
      4322,
    );
    const ticket = buildTicket(scored, 4322, 1_000_000, "troy ounce");
    assert.equal(ticket.action, "wait");
    assert.equal(ticket.trap?.symbol, "XAUM");
    assert.equal(ticket.buySymbol, "XAUt");
    assert.equal(ticket.avoidSymbol, "PAXG");
    assert.match(ticket.headline, /bps apart/);
  });

  it("waits on a wide liquid gap when there is no 30-day history", () => {
    const scored = applyFairValue(
      [
        wrap({ symbol: "SPYon", normalizedUsd: 671.75, volume24h: 1_400_000 }),
        wrap({ symbol: "SPYX", normalizedUsd: 680.1, volume24h: 1_700_000 }),
      ],
      676,
    );
    const ticket = buildTicket(scored, 676, 100_000, "share");
    assert.equal(ticket.action, "wait");
    assert.match(ticket.headline, /no 30-day range/);
    assert.equal(ticket.buySymbol, "SPYon");
    assert.equal(ticket.avoidSymbol, "SPYX");
  });

  it("compares the whole liquid book, not the two fattest prints", () => {
    const scored = applyFairValue(
      [
        wrap({
          symbol: "NVDAB",
          normalizedUsd: 225.3,
          volume24h: 27_000_000,
          issuerName: "bStocks",
        }),
        wrap({
          symbol: "NVDAX",
          normalizedUsd: 225.75,
          volume24h: 29_000_000,
          issuerName: "Backed Assets",
        }),
        wrap({
          symbol: "WNVDAX",
          normalizedUsd: 226.03,
          volume24h: 1_200_000,
          issuerName: "Backed Assets",
        }),
      ],
      225.6,
    );
    const pair = liquidSpreadPair(scored, 100_000);
    assert.equal(pair?.cheap.symbol, "NVDAB");
    assert.equal(pair?.rich.symbol, "WNVDAX");
    const ticket = buildTicket(scored, 225.6, 100_000, "share", {
      history: {
        leftSymbol: "NVDAB",
        rightSymbol: "WNVDAX",
        lastBps: 40,
        minBps: 5,
        maxBps: 42,
        percentile: 95,
        days: 30,
        avgBps: 20,
        avgDollarGap: null,
        extreme: true,
      },
    });
    assert.equal(ticket.action, "buy");
    assert.equal(ticket.buySymbol, "NVDAB");
    assert.equal(ticket.avoidSymbol, "WNVDAX");
  });

  it("grades volume into tradability", () => {
    assert.equal(tradabilityFromVolume(20_000_000), "A");
    assert.equal(tradabilityFromVolume(5_000), "F");
  });

  it("waits on a wide gap that is not a 30-day extreme", () => {
    const scored = applyFairValue(
      [
        wrap({ symbol: "SPYon", normalizedUsd: 671.75, volume24h: 1_400_000 }),
        wrap({ symbol: "SPYX", normalizedUsd: 680.1, volume24h: 1_700_000 }),
      ],
      676,
    );
    const ticket = buildTicket(scored, 676, 100_000, "share", {
      history: {
        leftSymbol: "SPYX",
        rightSymbol: "SPYon",
        lastBps: 124,
        minBps: 80,
        maxBps: 200,
        percentile: 40,
        days: 30,
        avgBps: 20,
        avgDollarGap: null,
        extreme: false,
      },
    });
    assert.equal(ticket.action, "wait");
    assert.match(ticket.headline, /typical, not a fade/);
  });

  it("keeps buy when the wide gap is a 30-day extreme", () => {
    const scored = applyFairValue(
      [
        wrap({ symbol: "SPYon", normalizedUsd: 671.75, volume24h: 1_400_000 }),
        wrap({ symbol: "SPYX", normalizedUsd: 680.1, volume24h: 1_700_000 }),
      ],
      676,
    );
    const ticket = buildTicket(scored, 676, 100_000, "share", {
      history: {
        leftSymbol: "SPYX",
        rightSymbol: "SPYon",
        lastBps: 124,
        minBps: 10,
        maxBps: 130,
        percentile: 95,
        days: 30,
        avgBps: 20,
        avgDollarGap: null,
        extreme: true,
      },
    });
    assert.equal(ticket.action, "buy");
  });
});

describe("board split", () => {
  it("hides sub-floor wrappers in the dust drawer", () => {
    const { main, dust } = splitBoard(
      [
        wrap({ symbol: "XAUt", normalizedUsd: 4371, volume24h: 200_000_000 }),
        wrap({ symbol: "VNXAU", normalizedUsd: 4313, volume24h: 8_000 }),
      ],
      1_000_000,
    );
    assert.deepEqual(main.map((w) => w.symbol), ["XAUt"]);
    assert.deepEqual(dust.map((w) => w.symbol), ["VNXAU"]);
  });
});

describe("history", () => {
  it("flags a 30-day extreme at the 95th percentile", () => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      bps: i === 19 ? 40 : 8,
      buyClose: 100,
      avoidClose: 100,
    }));
    const s = summarizeHistory(points, "XAUt", "PAXG");
    assert.ok(s);
    assert.equal(s.extreme, true);
    assert.ok(s.percentile >= 90);
    assert.equal(s.avgDollarGap, 0);
  });

  it("averages the historical dollar gap instead of scaling bps by today's price", () => {
    const points = [
      { date: "2026-09-01", bps: 10, buyClose: 100, avoidClose: 110 },
      { date: "2026-09-02", bps: 20, buyClose: 100, avoidClose: 130 },
      { date: "2026-09-03", bps: 30, buyClose: 200, avoidClose: 230 },
      { date: "2026-09-04", bps: 40, buyClose: 200, avoidClose: 240 },
      { date: "2026-09-05", bps: 50, buyClose: 200, avoidClose: 250 },
    ];
    const s = summarizeHistory(points, "PAXG", "XAUt");
    assert.ok(s);
    assert.equal(s.avgDollarGap, (10 + 30 + 30 + 40 + 50) / 5);
  });

  it("reads both crypto ids from one OHLCV payload", () => {
    const data = {
      "5176": {
        quotes: [
          {
            time_close: "2026-09-01T00:00:00.000Z",
            quote: { USD: { close: 4100 } },
          },
        ],
      },
      "4705": {
        quotes: [
          {
            time_close: "2026-09-01T00:00:00.000Z",
            quote: { USD: { close: 4200 } },
          },
        ],
      },
    };
    assert.equal(closesForId(data, 5176, 1).get("2026-09-01"), 4100);
    assert.equal(closesForId(data, 4705, 1).get("2026-09-01"), 4200);
  });
});

describe("venues", () => {
  it("keeps spot pairs and prefers a CEX print", () => {
    const parsed = parseVenues([
      {
        category: "derivatives",
        exchange: { name: "Binance", slug: "binance" },
        market_pair: "XAU/USDT",
        market_pair_base: { crypto_id: 39344 },
        quotes: [{ symbol: "USD", volume_24h: 9e9, price: 1 }],
      },
      {
        category: "spot",
        exchange: { name: "Uniswap v3", slug: "uniswap-v3" },
        market_pair: "PAXG/USDC",
        market_pair_base: { crypto_id: 4705 },
        quotes: [{ symbol: "USD", volume_24h: 50_000, price: 4360 }],
      },
      {
        category: "spot",
        exchange: { name: "Binance", slug: "binance" },
        market_pair: "PAXG/USDT",
        market_pair_base: { crypto_id: 4705 },
        quotes: [{ symbol: "USD", volume_24h: 12_000_000, price: 4368 }],
        depth_negative_two: 500_000,
      },
    ]);
    assert.equal(parsed.length, 2);
    const top = venuesFor(parsed, 4705);
    assert.equal(top[0].exchange, "Binance");
    assert.equal(top[0].recommended, true);
    assert.equal(top[0].kind, "cex");
  });

  it("prefers the cheaper print when depth is equal", () => {
    const parsed = parseVenues([
      {
        category: "spot",
        exchange: { name: "Deepcoin", slug: "deepcoin" },
        market_pair: "XAUt/USDT",
        market_pair_base: { crypto_id: 5176 },
        quotes: [{ symbol: "USD", volume_24h: 30_000_000, price: 4360 }],
      },
      {
        category: "spot",
        exchange: { name: "Binance", slug: "binance" },
        market_pair: "XAUt/USDT",
        market_pair_base: { crypto_id: 5176 },
        quotes: [{ symbol: "USD", volume_24h: 20_000_000, price: 4361 }],
      },
    ]);
    const top = venuesFor(parsed, 5176);
    assert.equal(top.find((v) => v.recommended)?.exchange, "Deepcoin");
  });

  it("does not let market score override a worse price", () => {
    const parsed = parseVenues([
      {
        category: "spot",
        market_score: 2,
        exchange: { name: "Deepcoin", slug: "deepcoin" },
        market_pair: "XAUt/USDT",
        market_pair_base: { crypto_id: 5176 },
        quotes: [{ symbol: "USD", volume_24h: 30_000_000, price: 4360 }],
      },
      {
        category: "spot",
        market_score: 9,
        exchange: { name: "Binance", slug: "binance" },
        market_pair: "XAUt/USDT",
        market_pair_base: { crypto_id: 5176 },
        quotes: [{ symbol: "USD", volume_24h: 5_000_000, price: 4500 }],
        depth_negative_two: 20_000,
      },
    ]);
    assert.equal(pickPrint(parsed).exchange, "Deepcoin");
    assert.equal(parsed[0].marketScore, 2);
  });

  it("uses market score when price and depth match", () => {
    const now = Date.parse("2026-09-25T12:00:00.000Z");
    const parsed = parseVenues([
      {
        category: "spot",
        market_score: 2,
        exchange: { name: "Deepcoin", slug: "deepcoin" },
        market_pair: "XAUt/USDT",
        market_pair_base: { crypto_id: 5176 },
        quotes: [
          {
            symbol: "USD",
            volume_24h: 30_000_000,
            price: 4360,
            last_updated: "2026-09-25T12:00:00.000Z",
          },
        ],
        depth_negative_two: 40_000,
      },
      {
        category: "spot",
        market_score: 9,
        exchange: { name: "Binance", slug: "binance" },
        market_pair: "XAUt/USDT",
        market_pair_base: { crypto_id: 5176 },
        quotes: [
          {
            symbol: "USD",
            volume_24h: 5_000_000,
            price: 4360,
            last_updated: "2026-09-25T12:00:00.000Z",
          },
        ],
        depth_negative_two: 40_000,
      },
    ]);
    assert.equal(pickPrint(parsed, now).exchange, "Binance");
  });

  it("treats a sub-5 bps price gap as a tie and uses volume", () => {
    const now = Date.parse("2026-09-25T12:00:00.000Z");
    const parsed = parseVenues([
      {
        category: "spot",
        exchange: { name: "Tiny", slug: "tiny" },
        market_pair: "PAXG/USDT",
        market_pair_base: { crypto_id: 4705 },
        quotes: [
          {
            symbol: "USD",
            volume_24h: 1_000_000,
            price: 4360,
            last_updated: "2026-09-25T12:00:00.000Z",
          },
        ],
        depth_negative_two: 40_000,
      },
      {
        category: "spot",
        exchange: { name: "Binance", slug: "binance" },
        market_pair: "PAXG/USDT",
        market_pair_base: { crypto_id: 4705 },
        quotes: [
          {
            symbol: "USD",
            volume_24h: 30_000_000,
            price: 4362,
            last_updated: "2026-09-25T12:00:00.000Z",
          },
        ],
        depth_negative_two: 40_000,
      },
    ]);
    assert.equal(pickPrint(parsed, now).exchange, "Binance");
  });

  it("penalizes a stale quote against an equal fresh print", () => {
    const now = Date.parse("2026-09-25T12:00:00.000Z");
    const parsed = parseVenues([
      {
        category: "spot",
        exchange: { name: "StaleX", slug: "stalex" },
        market_pair: "PAXG/USDT",
        market_pair_base: { crypto_id: 4705 },
        quotes: [
          {
            symbol: "USD",
            volume_24h: 20_000_000,
            price: 4360,
            last_updated: "2026-09-20T12:00:00.000Z",
          },
        ],
        depth_negative_two: 40_000,
      },
      {
        category: "spot",
        exchange: { name: "FreshX", slug: "freshx" },
        market_pair: "PAXG/USDT",
        market_pair_base: { crypto_id: 4705 },
        quotes: [
          {
            symbol: "USD",
            volume_24h: 8_000_000,
            price: 4360,
            last_updated: "2026-09-25T11:50:00.000Z",
          },
        ],
        depth_negative_two: 40_000,
      },
    ]);
    assert.equal(pickPrint(parsed, now).exchange, "FreshX");
  });
});

describe("shareable desk URLs", () => {
  it("maps GOLD and gold onto the gold cluster", () => {
    assert.equal(resolveAssetParam("GOLD"), "gold");
    assert.equal(resolveAssetParam("gold"), "gold");
    assert.equal(resolveAssetParam("SPY"), "spy");
    assert.equal(resolveAssetParam("rwa-86"), "rwa-86");
    assert.equal(resolveAssetParam("AAPL"), "AAPL");
    assert.equal(resolveAssetParam("  "), null);
    assert.equal(resolveAssetParam(null), null);
  });

  it("writes /desk?asset=GOLD for tweets and judges", () => {
    assert.equal(shareAssetKey("gold", DEFAULT_WATCHLIST), "GOLD");
    assert.equal(deskPath("gold", DEFAULT_WATCHLIST), "/desk?asset=GOLD");
    assert.equal(deskPath("spy", DEFAULT_WATCHLIST), "/desk?asset=SPY");
  });

  it("freezes the ticket into the share URL", () => {
    const desk = goldFixture();
    const path = frozenDeskPath(desk, DEFAULT_WATCHLIST);
    assert.match(path, /asset=GOLD/);
    assert.match(path, /call=/);
    assert.match(path, /at=/);
    const snap = parseFrozenShare(path.split("?")[1] || "");
    assert.ok(snap);
    assert.equal(snap.call, desk.ticket.action);
    assert.equal(snap.buy, desk.ticket.buySymbol);
  });
});

describe("issuer and tradfi parsers", () => {
  it("ignores empty tradfi_markets and reads a filled print", () => {
    assert.deepEqual(parseTradfiMarkets([]), []);
    const rows = parseTradfiMarkets([
      {
        exchange: { slug: "binance", name: "Binance" },
        ticker: "NVDA",
        market_url: "https://www.binance.com/en/stocks/EQ_NVDA",
      },
    ]);
    assert.equal(rows[0].exchange, "Binance");
    assert.equal(rows[0].ticker, "NVDA");
  });

  it("reads a single-issuer payload", () => {
    const issuer = parseIssuer(
      {
        name: "Paxos",
        website: "https://www.paxos.com/",
        issuer_id: "abc",
        num_tokens: 1,
        tokens: [{ name: "PAX Gold", symbol: "PAXG", crypto_id: 4705 }],
      },
      "abc",
    );
    assert.ok(issuer);
    assert.equal(issuer.name, "Paxos");
    assert.equal(issuer.tokens[0].symbol, "PAXG");
  });
});

describe("fixture desk", () => {
  it("returns a readable Gold ticket without a CMC key", () => {
    const desk = goldFixture();
    assert.equal(desk.source, "fixture");
    assert.equal(desk.cluster.id, "gold");
    assert.ok(desk.ticket.headline.length > 0);
    assert.ok(desk.evidence.cmcTimestamp);
  });
});

describe("decision narrative", () => {
  it("puts the liquid wait above the thin gold trap", () => {
    const desk = goldFixture();
    const call = deskCall(desk);
    assert.equal(call.tone, "wait");
    assert.equal(call.verb, "WAIT");
    assert.match(call.detail, /Avoid CGO/);
    assert.match(call.detail, /more than 99% lower volume/);
    assert.match(call.detail, /inside the 30-day range/);

    const opp = basisOpportunity(desk);
    assert.equal(opp?.left, "PAXG");
    assert.equal(opp?.right, "XAUt");
    assert.ok((opp?.dollar ?? 0) > 0);

    const why = whyLines(desk).join(" ");
    assert.match(why, /inside the 30-day range/);
    assert.match(why, /fails the \$1\.00M daily volume floor/);
    assert.match(why, /Liquid reference is the volume-weighted price/);
    assert.match(why, /Coinbase PAXG\/USD/);

    const bars = liquidityBars(desk);
    assert.equal(bars[0]?.label, "XAUt");
    assert.equal(bars.find((bar) => bar.label === "CGO")?.thin, true);
    assert.ok((bars.find((bar) => bar.label === "PAXG")?.widthPct ?? 0) > 50);

    const cols = structureColumns(desk);
    assert.deepEqual(
      cols.map((col) => col.symbol),
      ["PAXG", "XAUt", "CGO"],
    );
    assert.equal(cols[2]?.liquidity, "Thin");
    const counts = structureCounts(desk);
    assert.equal(counts.liquid, 2);
    assert.equal(counts.thin, 1);

    const read = basisRead(desk.spread);
    assert.equal(read.signal, "typical");
    assert.equal(read.pair, "PAXG vs XAUt");
    assert.ok(endpointHits(desk.endpointsUsed).every((hit) => hit.live));
  });

  it("says trade when the wide gap is a 30-day extreme", () => {
    const scored = applyFairValue(
      [
        wrap({
          symbol: "SPYon",
          normalizedUsd: 671.75,
          volume24h: 1_400_000,
          venues: [],
        }),
        wrap({
          symbol: "SPYX",
          normalizedUsd: 680.1,
          volume24h: 1_700_000,
          venues: [
            {
              exchange: "Kraken",
              slug: "kraken",
              pair: "SPYX/USD",
              category: "spot",
              kind: "cex",
              volume24h: 900_000,
              priceUsd: 680.1,
              cryptoId: 2,
              recommended: true,
              marketScore: null,
              depthUsd: null,
              lastUpdated: null,
            },
          ],
        }),
      ],
      676,
    );
    const ticket = buildTicket(scored, 676, 100_000, "share", {
      history: {
        leftSymbol: "SPYon",
        rightSymbol: "SPYX",
        lastBps: 124,
        minBps: 10,
        maxBps: 130,
        percentile: 96,
        days: 30,
        avgBps: 20,
        avgDollarGap: null,
        extreme: true,
      },
    });
    const cluster = goldFixture().cluster;
    const desk = {
      ...goldFixture(),
      cluster: { ...cluster, id: "spy", label: "SPY", unit: "share", volumeFloorUsd: 100_000 },
      liquidReferenceUsd: 676,
      wrappers: scored,
      main: scored,
      dust: [],
      ticket,
      spread: null,
      issuer: null,
    };
    assert.equal(deskCall(desk).verb, "PREFER SPYon");
    const why = whyLines(desk).join(" ");
    assert.match(why, /SPYon is \$8\.35 cheaper per share than SPYX/);
    assert.match(why, /96th percentile/);
    assert.match(why, /unusually wide/);
  });
});

describe("duplicate tickers", () => {
  it("appends issuer when two wrappers share a symbol", () => {
    const book = [
      wrap({ symbol: "SPY", issuerName: "Robinhood", cryptoId: 1 }),
      wrap({ symbol: "SPY", issuerName: "Ondo Assets", cryptoId: 2 }),
      wrap({ symbol: "SPYX", issuerName: "Backed / xStocks", cryptoId: 3 }),
    ];
    assert.equal(wrapperLabel(book[0], book), "SPY · Robinhood");
    assert.equal(wrapperLabel(book[2], book), "SPYX");
  });
});

describe("duplicate venue books", () => {
  it("keeps each crypto id's venues when the ticker matches", () => {
    const robinhood = {
      exchange: "Robinhood",
      slug: "robinhood",
      pair: "SPY/USD",
      category: "spot",
      kind: "cex" as const,
      volume24h: 1_000_000,
      priceUsd: 100,
      cryptoId: 111,
      recommended: true,
      marketScore: null,
      depthUsd: 50_000,
      lastUpdated: null,
      listed: "live" as const,
    };
    const ondo = {
      ...robinhood,
      exchange: "Ondo",
      slug: "ondo",
      cryptoId: 222,
      priceUsd: 110,
      depthUsd: 20_000,
    };
    const scored = applyFairValue(
      [
        wrap({
          symbol: "SPY",
          cryptoId: 111,
          issuerName: "Robinhood",
          normalizedUsd: 100,
          volume24h: 2_000_000,
          venues: [robinhood],
        }),
        wrap({
          symbol: "SPY",
          cryptoId: 222,
          issuerName: "Ondo",
          normalizedUsd: 110,
          volume24h: 2_000_000,
          venues: [ondo],
        }),
      ],
      105,
    );
    const ticket = buildTicket(scored, 105, 100_000, "share", {
      venuesByCryptoId: { 111: [robinhood], 222: [ondo] },
      history: {
        leftSymbol: "SPY",
        rightSymbol: "SPY",
        lastBps: 1000,
        minBps: 1,
        maxBps: 1000,
        percentile: 96,
        days: 30,
        avgBps: 20,
        avgDollarGap: 8,
        extreme: true,
      },
    });
    assert.equal(ticket.buyCryptoId, 111);
    assert.equal(ticket.venues[0]?.exchange, "Robinhood");
    assert.notEqual(ticket.venues[0]?.exchange, "Ondo");
  });
});

describe("rwa units", () => {
  it("keeps stock and ETF as shares and refuses an unknown commodity unit", () => {
    assert.equal(assetClassFrom("stock"), "equity");
    assert.equal(unitFor("equity", "AAPL", "Apple").unitKind, "share");
    assert.equal(unitFor("etf", "SPY", "SPDR").unitKind, "share");
    assert.equal(unitFor("commodity", "GOLD", "Gold").unitKind, "troy_ounce");
    assert.equal(assetClassFrom("government_security"), "government_security");
    assert.equal(
      unitFor("government_security", "UST", "US Treasury").unitKind,
      "bond_face_value",
    );
    assert.equal(assetClassFrom("currency"), "currency");
    assert.equal(unitFor("currency", "USD", "US Dollar").unitKind, "currency_unit");
    assert.equal(assetClassFrom("real_estate"), "real_estate");
    assert.equal(unitFor("real_estate", "HOME", "House").comparable, false);
    assert.equal(unitFor("commodity", "COFFEE", "Coffee").comparable, false);
    assert.equal(unitFor("unknown", "ZZZ", "Mystery").comparable, false);
  });
});

describe("plan gate and request guard", () => {
  it("treats a Growth+ rejection as a plan gate", () => {
    assert.equal(isPlanGate(new CmcError("subscription plan", 403, 1006)), true);
    assert.equal(isPlanGate(new CmcError("missing quote", 400, 400)), false);
  });

  it("stops a burst and refills after the window", () => {
    const key = `desk-test-${Math.random()}`;
    assert.equal(allowRequest(key, 2, 60_000, 1_000), true);
    assert.equal(allowRequest(key, 2, 60_000, 1_000), true);
    assert.equal(allowRequest(key, 2, 60_000, 1_000), false);
    assert.equal(allowRequest(key, 2, 60_000, 61_000), true);
  });
});

describe("source links", () => {
  it("pads CIK for EDGAR company search", () => {
    assert.equal(
      edgarCompanyUrl("320193"),
      "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&owner=exclude&count=40",
    );
    assert.equal(
      cmcCurrencyUrl("tether-gold"),
      "https://coinmarketcap.com/currencies/tether-gold/",
    );
  });
});
