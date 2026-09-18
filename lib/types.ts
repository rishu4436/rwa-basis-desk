export type AssetClass = "commodity" | "equity" | "etf";

export type TicketAction = "buy" | "skip" | "wait" | "only-one";

export type Tradability = "A" | "B" | "C" | "D" | "F";

export type SeedToken = {
  symbol: string;
  cryptoId: number;
  issuerName: string;
  ouncesPerToken: number;
};

export type ClusterDef = {
  id: string;
  label: string;
  blurb: string;
  unit: string;
  assetClass: AssetClass;
  /** Symbols sent to RWA map / quotes (CMC grouped-RWA tickers). */
  rwaSymbols: string[];
  volumeFloorUsd: number;
  seedTokens: SeedToken[];
  rwaId?: number;
};

export type WatchItem = {
  id: string;
  rwaId: number;
  symbol: string;
  name: string;
  assetType: string;
  wrappers?: number;
};

export type CatalogHit = {
  rwaId: number;
  symbol: string;
  name: string;
  slug: string;
  assetType: string;
  rank: number | null;
  hasTokens: boolean;
  wrappers: number | null;
  comparable: boolean;
};

export type Venue = {
  exchange: string;
  slug: string;
  pair: string;
  category: string;
  kind: "cex" | "dex";
  volume24h: number;
  priceUsd: number | null;
  cryptoId: number | null;
  recommended: boolean;
};

export type Wrapper = {
  symbol: string;
  name: string;
  cryptoId: number | null;
  rwaId: number | null;
  issuerId: string | null;
  issuerName: string;
  rawPriceUsd: number | null;
  normalizedUsd: number | null;
  ouncesPerToken: number;
  volume24h: number;
  marketCap: number;
  percentChange24h: number | null;
  pairCount: number;
  basisBps: number | null;
  tradability: Tradability;
  capacityUsd: number;
  venues: Venue[];
};

export type HistorySummary = {
  leftSymbol: string;
  rightSymbol: string;
  lastBps: number;
  minBps: number;
  maxBps: number;
  percentile: number;
  days: number;
  extreme: boolean;
};

export type Ticket = {
  action: TicketAction;
  headline: string;
  detail: string;
  buySymbol: string | null;
  avoidSymbol: string | null;
  spreadBps: number | null;
  dollarGap: number | null;
  venues: Venue[];
  history: HistorySummary | null;
};

export type UnderlyingInfo = {
  rwaId: number;
  name: string;
  symbol: string;
  assetType: string;
  website: string | null;
  industry: string | null;
  cik: string | null;
  founded: string | null;
  employees: number | null;
  primaryExchange: string | null;
  about: string | null;
  tokenizedMcap: number | null;
  tokenizedVolume: number | null;
};

export type DeskSnapshot = {
  cluster: ClusterDef;
  generatedAt: string;
  source: "live" | "seed-fallback";
  fairValueUsd: number | null;
  wrappers: Wrapper[];
  main: Wrapper[];
  dust: Wrapper[];
  ticket: Ticket;
  spread: SpreadSeries | null;
  underlying: UnderlyingInfo | null;
  endpointsUsed: string[];
  warnings: string[];
  evidence: {
    rwaMapCount: number;
    rwaQuoteCount: number;
    cryptoQuoteCount: number;
    pairCount: number;
  };
};

export type SpreadPoint = {
  date: string;
  bps: number | null;
  buyClose: number | null;
  avoidClose: number | null;
};

export type SpreadSeries = {
  clusterId: string;
  buySymbol: string;
  avoidSymbol: string;
  points: SpreadPoint[];
  summary: HistorySummary | null;
  endpointsUsed: string[];
};

export type BoardRow = {
  id: string;
  symbol: string;
  name: string;
  action: TicketAction;
  headline: string;
  buySymbol: string | null;
  avoidSymbol: string | null;
  spreadBps: number | null;
  dollarGap: number | null;
  fairValueUsd: number | null;
  venue: Venue | null;
  liquidCount: number;
  error?: string;
};
