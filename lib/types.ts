export type AssetClass =
  | "commodity"
  | "equity"
  | "etf"
  | "currency"
  | "government_security"
  | "real_estate"
  | "unknown";

export type AssetUnit =
  | "share"
  | "troy_ounce"
  | "gram"
  | "barrel"
  | "tonne"
  | "currency_unit"
  | "bond_face_value"
  | "unknown";

export type DataMode = "live" | "partial-live" | "fixture" | "fallback";

export type VenueCoverageStatus =
  | "live"
  | "plan-gated"
  | "demo"
  | "unavailable"
  | "skipped";

export type VenueCoverage = {
  status: VenueCoverageStatus;
  detail: string;
};

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
  /** Display unit, e.g. "troy ounce" or "share". */
  unit: string;
  unitKind: AssetUnit;
  /** False when the unit is unknown — prices must not be compared. */
  comparable: boolean;
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
  marketScore: number | null;
  depthUsd: number | null;
  lastUpdated: string | null;
  /** Demo prints are labelled samples. They are not a live book. */
  listed?: "live" | "demo";
};

export type TradfiMarket = {
  exchange: string;
  ticker: string;
  url: string | null;
};

export type IssuerProfile = {
  issuerId: string;
  name: string;
  website: string | null;
  numTokens: number;
  tokens: { symbol: string; name: string; cryptoId: number | null }[];
};

export type Wrapper = {
  symbol: string;
  name: string;
  /** CMC currency slug for coinmarketcap.com/currencies/{slug}/ */
  slug: string | null;
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
  /** ±2% depth used for the size cap. Null when venue depth is missing. */
  depthUsd: number | null;
  /** Haircut of displayed depth. Null when depth is missing or only a sample. */
  capacityUsd: number | null;
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
  /** Mean of the historical bps series. */
  avgBps: number;
  /** Mean of avoidClose − buyClose. Null when closes are missing. */
  avgDollarGap: number | null;
};

export type TicketTrap = {
  symbol: string;
  cryptoId: number | null;
  issuerName: string;
  volume24h: number;
  spreadBps: number | null;
  dollarGap: number | null;
  vsSymbol: string | null;
};

export type Ticket = {
  action: TicketAction;
  headline: string;
  detail: string;
  buySymbol: string | null;
  avoidSymbol: string | null;
  buyCryptoId: number | null;
  avoidCryptoId: number | null;
  spreadBps: number | null;
  dollarGap: number | null;
  /** Illiquid cheap name — a warning, not the liquid-book call. */
  trap: TicketTrap | null;
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
  source: DataMode;
  /** Volume-weighted price of liquid wrappers. Not a NAV. */
  liquidReferenceUsd: number | null;
  venueCoverage: VenueCoverage;
  averageTokenizedPrice: number | null;
  tradfiMarkets: TradfiMarket[];
  issuer: IssuerProfile | null;
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
    cmcTimestamp: string | null;
    lastUpdated: string | null;
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
  trapSymbol: string | null;
  spreadBps: number | null;
  dollarGap: number | null;
  liquidReferenceUsd: number | null;
  venue: Venue | null;
  liquidCount: number;
  error?: string;
};
