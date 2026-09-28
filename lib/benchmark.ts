import type { ClusterDef, UnderlyingBenchmark } from "./types";

export function premiumVsPrint(
  liquidUsd: number | null,
  printUsd: number | null,
): { premiumBps: number | null; dollarGap: number | null } {
  if (
    liquidUsd == null ||
    printUsd == null ||
    !(liquidUsd > 0) ||
    !(printUsd > 0)
  ) {
    return { premiumBps: null, dollarGap: null };
  }
  return {
    premiumBps: ((liquidUsd - printUsd) / printUsd) * 10_000,
    dollarGap: liquidUsd - printUsd,
  };
}

export function emptyBenchmark(
  symbol: string,
  note: string,
): UnderlyingBenchmark {
  return {
    symbol,
    priceUsd: null,
    asOf: null,
    source: "none",
    premiumBps: null,
    dollarGap: null,
    note,
  };
}

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        regularMarketTime?: number;
        currency?: string;
      };
    }>;
    error?: { description?: string } | null;
  };
};

async function fetchYahooPrint(
  symbol: string,
): Promise<{ price: number; asOf: string }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "BasisDesk/0.1 (hackathon research; +https://rwa-basis-desk.vercel.app)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(4500),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const body = (await res.json()) as YahooChart;
  const meta = body.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  if (price == null || !(price > 0)) {
    throw new Error(body.chart?.error?.description || "yahoo price missing");
  }
  const asOf =
    meta?.regularMarketTime != null
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString();
  return { price, asOf };
}

const PRINT_SYMBOL = /^[A-Z0-9.]{1,10}$/;

export function printSymbol(raw: string): string | null {
  const symbol = raw.trim().toUpperCase();
  if (!PRINT_SYMBOL.test(symbol) || symbol.includes("..")) return null;
  return symbol;
}

/** Equity and ETF prints only. Commodities stay unlabeled rather than guessed. */
export async function loadBenchmark(
  cluster: ClusterDef,
  liquidUsd: number | null,
): Promise<UnderlyingBenchmark> {
  const raw = (cluster.rwaSymbols[0] ?? cluster.label).toUpperCase();
  const symbol = printSymbol(raw);
  if (!symbol) {
    return emptyBenchmark(raw.slice(0, 12), "Underlying print unavailable.");
  }
  if (cluster.assetClass !== "equity" && cluster.assetClass !== "etf") {
    return emptyBenchmark(
      symbol,
      cluster.assetClass === "commodity"
        ? "No LBMA print on CMC. The ticket stays wrapper versus wrapper."
        : "No labeled underlying print for this asset class. The ticket stays wrapper versus wrapper.",
    );
  }
  try {
    const quote = await fetchYahooPrint(symbol);
    const gap = premiumVsPrint(liquidUsd, quote.price);
    return {
      symbol,
      priceUsd: quote.price,
      asOf: quote.asOf,
      source: "yahoo",
      premiumBps: gap.premiumBps,
      dollarGap: gap.dollarGap,
      note: "Yahoo regular-market print. Benchmark only — not the liquid reference and not the ticket.",
    };
  } catch {
    return emptyBenchmark(
      symbol,
      "Underlying print unavailable. The ticket stays wrapper versus wrapper.",
    );
  }
}
