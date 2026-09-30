import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyBenchmark, premiumVsPrint, printSymbol } from "./benchmark";
import { handleRpc, listTools } from "./mcp";
import {
  applyFairValue,
  buildTicket,
  discountBps,
  executableBuyUsd,
  formatDollars,
  liquidSpreadPair,
  quoteHoldUsd,
  splitBoard,
  tradabilityFromVolume,
  volumeWeightedFairValue,
  wrapperLabel,
} from "./basis";
import {
  closesForId,
  discountSeries,
  rankAgainstHistory,
  summarizeHistory,
} from "./history";
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
import type { Venue, Wrapper } from "./types";
import {
  DEFAULT_WATCHLIST,
  deskPath,
  frozenDeskPath,
  parseFrozenShare,
  resolveAssetParam,
  shareAssetKey,
} from "./watchlist";

function spot(partial: Partial<Venue> & Pick<Venue, "exchange">): Venue {
  return {
    slug: partial.exchange.toLowerCase(),
    pair: "X/USD",
    category: "spot",
    kind: "cex",
    volume24h: 1_000_000,
    priceUsd: 100,
    cryptoId: null,
    recommended: true,
    marketScore: null,
    depthUsd: null,
    lastUpdated: null,
    listed: "live",
    ...partial,
  };
}

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
        wrap({ symbol: "XAUt", normalizedUsd: 4164, volume24h: 1_000_000_000 }),
        wrap({ symbol: "PAXG", normalizedUsd: 4173, volume24h: 280_000_000 }),
        wrap({ symbol: "XAUM", normalizedUsd: 4200, volume24h: 700_000 }),
      ],
      volumeWeightedFairValue(
        [
          wrap({ symbol: "XAUt", normalizedUsd: 4164, volume24h: 1_000_000_000 }),
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

  it("sizes the buy from the recommended ask book", () => {
    const price = 9_885;
    const fair = 10_000;
    const rows = applyFairValue(
      [
        wrap({
          symbol: "PAXG",
          normalizedUsd: price,
          volume24h: 5_000_000,
          venues: [
            spot({
              exchange: "Binance",
              pair: "PAXG/USDT",
              askDepthUsd: 40_000,
              bidDepthUsd: 12_000,
              recommended: true,
            }),
            spot({
              exchange: "OKX",
              pair: "PAXG/USDT",
              askDepthUsd: 90_000,
              recommended: false,
            }),
          ],
        }),
      ],
      fair,
    );
    const q = discountBps(price, fair);
    assert.equal(q, 115);
    assert.equal(rows[0].depthUsd, 40_000);
    assert.equal(rows[0].capacityUsd, executableBuyUsd(40_000, q));
    assert.equal(rows[0].capacityUsd, 40_000);
  });

  it("does not treat a bid book or a sample print as a buy", () => {
    const bidOnly = applyFairValue(
      [
        wrap({
          symbol: "PAXG",
          normalizedUsd: 9_885,
          volume24h: 5_000_000,
          venues: [
            spot({
              exchange: "Binance",
              depthUsd: 500_000,
              bidDepthUsd: 500_000,
              askDepthUsd: null,
            }),
          ],
        }),
      ],
      10_000,
    );
    assert.equal(bidOnly[0].depthUsd, null);
    assert.equal(bidOnly[0].capacityUsd, null);

    const sample = applyFairValue(
      [
        wrap({
          symbol: "PAXG",
          normalizedUsd: 9_885,
          volume24h: 5_000_000,
          venues: [
            spot({
              exchange: "Binance",
              askDepthUsd: 80_000,
              listed: "demo",
            }),
          ],
        }),
      ],
      10_000,
    );
    assert.equal(sample[0].capacityUsd, null);
    assert.equal(sample[0].depthUsd, null);
  });

  it("returns no size when the quote is inside 15 bps", () => {
    assert.equal(executableBuyUsd(50_000, 15), 0);
    assert.equal(executableBuyUsd(null, 40), null);
    assert.equal(quoteHoldUsd(100_000, 40), 40_000);
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
        wrap({ symbol: "XAUt", normalizedUsd: 4164, volume24h: 1_000_000_000 }),
        wrap({ symbol: "PAXG", normalizedUsd: 4166, volume24h: 280_000_000 }),
      ],
      4164.5,
    );
    const ticket = buildTicket(scored, 4164.5, 1_000_000, "troy ounce");
    assert.equal(ticket.action, "wait");
    assert.match(ticket.headline, /under the liquid reference/);
    assert.equal(ticket.trap, null);
    assert.equal(ticket.avoidSymbol, null);
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
    assert.equal(ticket.avoidSymbol, null);
    assert.match(ticket.headline, /under the liquid reference/);
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
    assert.equal(ticket.avoidSymbol, null);
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
    assert.equal(pair?.rich.symbol, "NVDAX");
    const ticket = buildTicket(scored, 225.6, 100_000, "share", {
      history: {
        leftSymbol: "NVDAB",
        rightSymbol: "reference",
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
    assert.equal(ticket.action, "wait");
    assert.equal(ticket.buySymbol, "NVDAB");
    assert.equal(ticket.avoidSymbol, null);
    assert.equal(splitBoard(scored, 100_000).dust[0]?.symbol, "WNVDAX");
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

  const extremeSpy = {
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
  };

  it("waits on a 30-day extreme when the buy book is missing", () => {
    const scored = applyFairValue(
      [
        wrap({ symbol: "SPYon", normalizedUsd: 671.75, volume24h: 1_400_000 }),
        wrap({
          symbol: "SPYX",
          normalizedUsd: 680.1,
          volume24h: 1_700_000,
          venues: [
            spot({
              exchange: "Kraken",
              pair: "SPYX/USD",
              depthUsd: 1_000_000,
              bidDepthUsd: 1_000_000,
              askDepthUsd: null,
            }),
          ],
        }),
      ],
      676,
    );
    const ticket = buildTicket(scored, 676, 100_000, "share", { history: extremeSpy });
    assert.equal(ticket.action, "wait");
    assert.equal(ticket.buySymbol, "SPYon");
    assert.match(ticket.headline, /buy book is unmeasured/);
    assert.match(ticket.detail, /will not call Prefer/);
    assert.equal(ticket.avoidSymbol, null);
  });

  it("prefers when the ask book keeps 15 bps on at least $10,000", () => {
    const ask = 25_000;
    const scored = applyFairValue(
      [
        wrap({
          symbol: "SPYon",
          cryptoId: 1,
          normalizedUsd: 671.75,
          volume24h: 1_400_000,
          venues: [
            spot({
              exchange: "Kraken",
              pair: "SPYon/USD",
              cryptoId: 1,
              askDepthUsd: ask,
              bidDepthUsd: 9_000,
            }),
          ],
        }),
        wrap({ symbol: "SPYX", normalizedUsd: 680.1, volume24h: 1_700_000 }),
      ],
      676,
    );
    const ticket = buildTicket(scored, 676, 100_000, "share", {
      history: extremeSpy,
      venuesByCryptoId: { 1: scored[0].venues },
    });
    const size = executableBuyUsd(ask, discountBps(671.75, 676));
    assert.ok(size != null && size >= 10_000);
    assert.equal(ticket.action, "buy");
    assert.equal(ticket.headline, `You can buy ${formatDollars(size!)} of SPYon`);
    assert.match(ticket.detail, /on Kraken SPYon\/USD/);
    assert.match(ticket.detail, /still 15 bps under the liquid reference/);
    assert.equal(ticket.avoidSymbol, null);
  });

  it("waits when the surviving fill is under $10,000", () => {
    const scored = applyFairValue(
      [
        wrap({
          symbol: "SPYon",
          normalizedUsd: 671.75,
          volume24h: 1_400_000,
          venues: [
            spot({
              exchange: "Kraken",
              pair: "SPYon/USD",
              askDepthUsd: 8_000,
            }),
          ],
        }),
        wrap({ symbol: "SPYX", normalizedUsd: 680.1, volume24h: 1_700_000 }),
      ],
      676,
    );
    const ticket = buildTicket(scored, 676, 100_000, "share", { history: extremeSpy });
    assert.equal(ticket.action, "wait");
    assert.match(ticket.headline, /gives the/);
    assert.match(ticket.detail, /under the \$10,000 floor/);
  });

  it("says how far a trap's cheap price holds", () => {
    const fair = 4_164;
    const scored = applyFairValue(
      [
        wrap({
          symbol: "XAUM",
          normalizedUsd: 4_100,
          volume24h: 7_000,
          venues: [spot({ exchange: "Gate", pair: "XAUM/USDT", askDepthUsd: 20_000 })],
        }),
        wrap({ symbol: "XAUt", normalizedUsd: fair, volume24h: 17_000_000_000 }),
      ],
      fair,
    );
    const ticket = buildTicket(scored, fair, 1_000_000, "troy ounce");
    const hold = quoteHoldUsd(20_000, discountBps(4_100, fair));
    assert.equal(ticket.action, "skip");
    assert.equal(ticket.trap?.holdUsd, hold);
    assert.match(ticket.detail, new RegExp(`holds for about ${formatDollars(hold!).replace("$", "\\$")}`));
    assert.match(ticket.detail, /then it is gone/);
  });

  it("keeps a thin tail and a dead quote out of the call", () => {
    const scored = [
      wrap({
        symbol: "NVDA",
        issuerName: "Robinhood",
        normalizedUsd: 223.35,
        volume24h: 33_000_000,
      }),
      wrap({
        symbol: "NVDAB",
        issuerName: "bStocks",
        normalizedUsd: 223.02,
        volume24h: 14_000_000,
      }),
      wrap({
        symbol: "rNVDA",
        issuerName: "Reality",
        normalizedUsd: 223,
        volume24h: 255_000,
      }),
      wrap({
        symbol: "NVDA",
        issuerName: "Hyperliquid Assets",
        normalizedUsd: 200,
        volume24h: 0,
      }),
    ];
    const split = splitBoard(scored, 100_000);
    assert.deepEqual(
      split.main.map((w) => w.symbol),
      ["NVDAB", "NVDA"],
    );
    assert.equal(split.dust[0]?.symbol, "rNVDA");
    assert.equal(split.quiet[0]?.issuerName, "Hyperliquid Assets");
    const fair = volumeWeightedFairValue(scored, 100_000);
    const ticket = buildTicket(scored, fair, 100_000, "share");
    assert.equal(ticket.action, "wait");
    assert.equal(ticket.trap?.symbol, "rNVDA");
    assert.notEqual(ticket.buySymbol, "rNVDA");
  });

  it("does not let an Ondo total-return token set the call", () => {
    const scored = [
      wrap({
        symbol: "SPY",
        issuerName: "Robinhood",
        normalizedUsd: 767.8,
        volume24h: 11_000_000,
      }),
      wrap({
        symbol: "SPYX",
        issuerName: "Backed Assets",
        normalizedUsd: 770.3,
        volume24h: 14_000_000,
      }),
      wrap({
        symbol: "SPYon",
        issuerName: "Ondo Assets",
        normalizedUsd: 776,
        volume24h: 2_200_000,
      }),
    ];
    const split = splitBoard(scored, 100_000);
    assert.deepEqual(
      split.accrual.map((w) => w.symbol),
      ["SPYon"],
    );
    assert.equal(split.main.some((w) => w.symbol === "SPYon"), false);
    const fair = volumeWeightedFairValue(scored, 100_000);
    const ticket = buildTicket(scored, fair, 100_000, "share", {
      history: {
        leftSymbol: "SPY",
        rightSymbol: "reference",
        lastBps: 80,
        minBps: 1,
        maxBps: 90,
        percentile: 99,
        days: 30,
        avgBps: 10,
        avgDollarGap: 2,
        extreme: true,
      },
    });
    assert.notEqual(ticket.buySymbol, "SPYon");
    assert.notEqual(ticket.avoidSymbol, "SPYon");
    assert.equal(ticket.trap?.symbol ?? null, null);
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

  it("parks zero-volume quotes and total-return tokens outside the core", () => {
    const split = splitBoard(
      [
        wrap({ symbol: "QQQ", normalizedUsd: 737, volume24h: 15_000_000, issuerName: "bStocks" }),
        wrap({ symbol: "QQQon", normalizedUsd: 741, volume24h: 2_000_000, issuerName: "Ondo Assets" }),
        wrap({ symbol: "QQQ", normalizedUsd: 680, volume24h: 0, issuerName: "Hyperliquid Assets" }),
      ],
      100_000,
    );
    assert.deepEqual(split.main.map((w) => w.symbol), ["QQQ"]);
    assert.deepEqual(split.accrual.map((w) => w.symbol), ["QQQon"]);
    assert.equal(split.quiet.length, 1);
    assert.equal(split.dust.length, 0);
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

  it("treats a live gap above every daily close as extreme", () => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      bps: 10 + (i % 3),
      buyClose: 100,
      avoidClose: 101,
    }));
    const summary = summarizeHistory(points, "NVDAX", "NVDAB");
    assert.ok(summary);
    assert.equal(summary.extreme, false);
    const ranked = rankAgainstHistory(points, 40);
    assert.ok(ranked);
    assert.equal(ranked.percentile, 100);
    assert.equal(ranked.extreme, true);
    assert.equal(rankAgainstHistory(points, 11)?.extreme, false);
    assert.equal(rankAgainstHistory(points, -40)?.extreme, false);
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

  it("measures the cheap close against the volume-weighted core", () => {
    const data = {
      "1": {
        quotes: [{ time_close: "2026-09-01T00:00:00.000Z", quote: { USD: { close: 90 } } }],
      },
      "2": {
        quotes: [{ time_close: "2026-09-01T00:00:00.000Z", quote: { USD: { close: 100 } } }],
      },
    };
    const cheap = { symbol: "NVDAB", cryptoId: 1, ouncesPerToken: 1, volume24h: 10 };
    const core = [
      cheap,
      { symbol: "NVDA", cryptoId: 2, ouncesPerToken: 1, volume24h: 30 },
    ];
    const point = discountSeries(data, cheap, core)[0];
    assert.equal(point?.buyClose, 90);
    assert.equal(point?.avoidClose, 97.5);
    assert.ok(Math.abs((point?.bps ?? 0) - ((97.5 - 90) / 97.5) * 10_000) < 1e-6);
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

  it("reads ask and bid depth, and does not treat unlabeled liquidity as a buy", () => {
    const parsed = parseVenues([
      {
        category: "spot",
        exchange: { name: "Binance", slug: "binance" },
        market_pair: "PAXG/USDT",
        market_pair_base: { crypto_id: 4705 },
        quotes: [{ symbol: "USD", volume_24h: 12_000_000, price: 4368 }],
        depth_negative_two: 500_000,
        depth_positive_two: 120_000,
      },
      {
        category: "spot",
        exchange: { name: "OKX", slug: "okx" },
        market_pair: "PAXG/USDT",
        market_pair_base: { crypto_id: 4705 },
        quote: { USD: { depth_positive_two: 80_000, depth_negative_two: 70_000 } },
        quotes: [{ symbol: "USD", volume_24h: 1_000_000, price: 4369 }],
      },
      {
        category: "spot",
        exchange: { name: "Loose", slug: "loose" },
        market_pair: "PAXG/USDT",
        market_pair_base: { crypto_id: 4705 },
        quotes: [{ symbol: "USD", volume_24h: 100, price: 4370 }],
        effective_liquidity: 9_000,
      },
    ]);
    const binance = parsed.find((v) => v.exchange === "Binance");
    const okx = parsed.find((v) => v.exchange === "OKX");
    const loose = parsed.find((v) => v.exchange === "Loose");
    assert.equal(binance?.askDepthUsd, 120_000);
    assert.equal(binance?.bidDepthUsd, 500_000);
    assert.equal(binance?.depthUsd, 120_000);
    assert.equal(okx?.askDepthUsd, 80_000);
    assert.equal(okx?.bidDepthUsd, 70_000);
    assert.equal(loose?.askDepthUsd, null);
    assert.equal(loose?.bidDepthUsd, null);
    assert.equal(loose?.depthUsd, 9_000);
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
    assert.match(call.detail, /CGO has no live/);
    assert.match(call.detail, /under the liquid reference/);
    assert.equal(call.detail.includes(".."), false);

    const opp = basisOpportunity(desk);
    assert.equal(opp?.left, "PAXG");
    assert.equal(opp?.right, "the liquid reference");
    assert.ok((opp?.dollar ?? 0) > 0);

    const why = whyLines(desk).join(" ");
    assert.match(why, /inside the band where the desk does not call a trade/);
    assert.match(why, /fails the \$1\.00M daily volume floor/);
    assert.match(why, /CGO has no live/);
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
    assert.equal(read.pair, "PAXG vs reference");
    assert.ok(endpointHits(desk.endpointsUsed).every((hit) => hit.live));
  });

  it("names the executable buy when the wide gap survives the ask book", () => {
    const scored = applyFairValue(
      [
        wrap({
          symbol: "SPYon",
          cryptoId: 1,
          normalizedUsd: 671.75,
          volume24h: 1_400_000,
          venues: [
            spot({
              exchange: "Kraken",
              pair: "SPYon/USD",
              cryptoId: 1,
              askDepthUsd: 25_000,
            }),
          ],
        }),
        wrap({
          symbol: "SPYX",
          normalizedUsd: 680.1,
          volume24h: 1_700_000,
          venues: [],
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
      venuesByCryptoId: { 1: scored.find((w) => w.symbol === "SPYon")?.venues ?? [] },
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
    const call = deskCall(desk);
    assert.equal(call.verb, "PREFER SPYon");
    assert.match(call.detail, /You can buy \$11,967 of SPYon on Kraken SPYon\/USD/);
    assert.match(call.detail, /still 15 bps under the liquid reference/);
    const why = whyLines(desk).join(" ");
    assert.match(why, /SPYon is \$4\.25 cheaper per share than the liquid reference/);
    assert.match(why, /96th percentile/);
    assert.match(why, /unusually wide/);
    assert.match(why, /You can buy \$11,967 on Kraken SPYon\/USD/);
  });

  it("waits out loud when an extreme discount has no buy book", () => {
    const scored = applyFairValue(
      [
        wrap({ symbol: "SPYon", normalizedUsd: 671.75, volume24h: 1_400_000 }),
        wrap({ symbol: "SPYX", normalizedUsd: 680.1, volume24h: 1_700_000 }),
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
      venueCoverage: {
        status: "plan-gated" as const,
        detail: "Growth+ market pairs are missing.",
      },
      liquidReferenceUsd: 676,
      wrappers: scored,
      main: scored,
      dust: [],
      ticket,
      spread: null,
      issuer: null,
    };
    assert.equal(deskCall(desk).verb, "WAIT");
    assert.match(deskCall(desk).detail, /buy book is unmeasured/);
    const why = whyLines(desk).join(" ");
    assert.match(why, /fill does not keep it/);
    assert.match(why, /will not call Prefer or invent a size from 24h volume/);
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
          issuerName: "Backed Assets",
          normalizedUsd: 102,
          volume24h: 2_000_000,
          venues: [ondo],
        }),
      ],
      101,
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

describe("benchmark and mcp", () => {
  it("measures the liquid core against a print and refuses a missing one", () => {
    assert.deepEqual(premiumVsPrint(100, null), {
      premiumBps: null,
      dollarGap: null,
    });
    const gap = premiumVsPrint(101.5, 100);
    assert.equal(gap.premiumBps, 150);
    assert.ok(Math.abs((gap.dollarGap ?? 0) - 1.5) < 1e-9);
    const blank = emptyBenchmark("GOLD", "No LBMA print on CMC.");
    assert.equal(blank.priceUsd, null);
    assert.equal(blank.source, "none");
    assert.equal(goldFixture().benchmark.source, "none");
    assert.equal(goldFixture().benchmark.priceUsd, null);
    assert.equal(printSymbol("NVDA"), "NVDA");
    assert.equal(printSymbol("../etc"), null);
    assert.equal(printSymbol("BRK.B"), "BRK.B");
  });

  it("lists tools and returns API friction without a live desk", async () => {
    assert.equal(listTools().length, 4);
    const listed = await handleRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    const tools = (listed?.result as { tools: { name: string }[] }).tools;
    assert.deepEqual(
      tools.map((tool) => tool.name),
      ["desk_ticket", "desk_board", "desk_search", "desk_evidence"],
    );
    const evidence = await handleRpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "desk_evidence", arguments: {} },
    });
    const text = (evidence?.result as { content: { text: string }[] }).content[0]
      .text;
    assert.match(text, /market-pairs/);
    assert.match(text, /rwa_assets/);
    const missing = await handleRpc({
      jsonrpc: "2.0",
      id: 3,
      method: "nope",
    });
    assert.equal((missing?.error as { code: number }).code, -32601);
    const bad = await handleRpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "desk_ticket", arguments: { asset: "../secret" } },
    });
    assert.match(String((bad?.error as { message: string }).message), /invalid asset/);
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
