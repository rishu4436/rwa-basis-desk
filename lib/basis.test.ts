import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyFairValue,
  buildTicket,
  liquidSpreadPair,
  splitBoard,
  tradabilityFromVolume,
  volumeWeightedFairValue,
  wrapperLabel,
} from "./basis";
import { summarizeHistory } from "./history";
import { parseVenues, venuesFor } from "./venues";
import { ouncesPerToken } from "./clusters";
import {
  bpsToPct,
  bpsToUsd,
  extraOnNotional,
  formatDelta,
} from "./display";
import { cmcCurrencyUrl, edgarCompanyUrl } from "./links";
import type { Wrapper } from "./types";
import {
  DEFAULT_WATCHLIST,
  deskPath,
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
    capacityUsd: 0,
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
      },
    ]);
    assert.equal(parsed.length, 2);
    const top = venuesFor(parsed, 4705);
    assert.equal(top[0].exchange, "Binance");
    assert.equal(top[0].recommended, true);
    assert.equal(top[0].kind, "cex");
  });

  it("prefers a major CEX when volume is close to a minor leader", () => {
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
    assert.equal(top.find((v) => v.recommended)?.exchange, "Binance");
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
