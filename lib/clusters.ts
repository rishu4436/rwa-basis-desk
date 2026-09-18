import type { AssetClass, ClusterDef } from "./types";

/**
 * Curated underlyings for the demo. Gold/SPY IDs are public CMC UCIDs
 * (from coinmarketcap.com currency pages / RWA tables). Live mode still
 * resolves via /v5/real-world-assets/* and merges by crypto_id.
 */
export const CLUSTERS: ClusterDef[] = [
  {
    id: "gold",
    label: "Gold",
    blurb: "One ounce of gold. Three wrappers. Three prices.",
    unit: "troy ounce",
    assetClass: "commodity",
    rwaSymbols: ["GOLD", "XAUT", "PAXG", "XAUM"],
    volumeFloorUsd: 1_000_000,
    seedTokens: [
      {
        symbol: "XAUt",
        cryptoId: 5176,
        issuerName: "Tether Holdings",
        ouncesPerToken: 1,
      },
      {
        symbol: "PAXG",
        cryptoId: 4705,
        issuerName: "Paxos",
        ouncesPerToken: 1,
      },
      {
        symbol: "XAUM",
        cryptoId: 34212,
        issuerName: "Matrixdock",
        ouncesPerToken: 1,
      },
    ],
  },
  {
    id: "spy",
    label: "S&P 500 (SPY)",
    blurb: "Same ETF, two issuers. Watch the wrapper gap.",
    unit: "share",
    assetClass: "etf",
    rwaSymbols: ["SPY"],
    volumeFloorUsd: 100_000,
    seedTokens: [
      {
        symbol: "SPYon",
        cryptoId: 38067,
        issuerName: "Ondo Assets",
        ouncesPerToken: 1,
      },
      {
        symbol: "SPYX",
        cryptoId: 37006,
        issuerName: "Backed / xStocks",
        ouncesPerToken: 1,
      },
    ],
  },
  {
    id: "nvda",
    label: "NVIDIA",
    blurb: "One stock. Several on-chain wrappers.",
    unit: "share",
    assetClass: "equity",
    rwaSymbols: ["NVDA"],
    volumeFloorUsd: 100_000,
    seedTokens: [
      {
        symbol: "NVDAX",
        cryptoId: 36992,
        issuerName: "Backed / xStocks",
        ouncesPerToken: 1,
      },
    ],
  },
  {
    id: "tsla",
    label: "Tesla",
    blurb: "Same company, different tokenized share.",
    unit: "share",
    assetClass: "equity",
    rwaSymbols: ["TSLA"],
    volumeFloorUsd: 100_000,
    seedTokens: [
      {
        symbol: "TSLAX",
        cryptoId: 37004,
        issuerName: "Backed / xStocks",
        ouncesPerToken: 1,
      },
    ],
  },
  {
    id: "crcl",
    label: "Circle",
    blurb: "CRCL shows up on Ondo, xStocks, and bStocks.",
    unit: "share",
    assetClass: "equity",
    rwaSymbols: ["CRCL"],
    volumeFloorUsd: 100_000,
    seedTokens: [],
  },
];

export function getCluster(id: string): ClusterDef | undefined {
  return CLUSTERS.find((c) => c.id === id);
}

export function assetClassFrom(type: string): AssetClass {
  const t = type.toLowerCase();
  if (t.includes("commodity")) return "commodity";
  if (t.includes("etf") || t.includes("fund")) return "etf";
  return "equity";
}

export function clusterFromAsset(asset: {
  rwaId: number;
  symbol: string;
  name: string;
  assetType: string;
}): ClusterDef {
  const known = CLUSTERS.find(
    (c) =>
      c.rwaSymbols.includes(asset.symbol) ||
      c.label.toLowerCase() === asset.name.toLowerCase(),
  );
  if (known) return { ...known, rwaId: asset.rwaId };
  const assetClass = assetClassFrom(asset.assetType);
  return {
    id: `rwa-${asset.rwaId}`,
    label: asset.name,
    blurb: `Tokenized ${asset.symbol}. Compare every wrapper before you buy.`,
    unit: assetClass === "commodity" ? "troy ounce" : "share",
    assetClass,
    rwaSymbols: [asset.symbol],
    volumeFloorUsd: assetClass === "commodity" ? 1_000_000 : 100_000,
    seedTokens: [],
    rwaId: asset.rwaId,
  };
}

/** Gram-denominated gold tokens. Convert to USD per troy ounce. */
const GRAMS_PER_TROY_OUNCE = 31.1034768;
const GRAM_GOLD_SYMBOLS = new Set(["CGO", "VNXAU", "KAU", "GRAMG"]);

export function ouncesPerToken(symbol: string, fallback = 1): number {
  const upper = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (GRAM_GOLD_SYMBOLS.has(upper)) return 1 / GRAMS_PER_TROY_OUNCE;
  return fallback;
}
