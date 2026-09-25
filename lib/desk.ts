import {
  applyFairValue,
  basisBps,
  buildTicket,
  liquidReference,
  liquidSpreadPair,
  splitBoard,
} from "./basis";
import { clusterForQuery } from "./catalog";
import { getCluster, ouncesPerToken } from "./clusters";
import { asArray, cmcGet, cmcGetLive, hasApiKey, isPlanGate, num, usdQuote } from "./cmc";
import { goldFixture } from "./fixture";
import { fetchSpreadHistory, rankAgainstHistory } from "./history";
import { loadIssuer, parseTradfiMarkets } from "./issuer";
import { loadUnderlying } from "./underlying";
import { demoVenuesFor, pairCountFor, parseVenues, venuesFor } from "./venues";
import type {
  BoardRow,
  ClusterDef,
  DeskSnapshot,
  IssuerProfile,
  TradfiMarket,
  UnderlyingInfo,
  Venue,
  VenueCoverage,
  Wrapper,
} from "./types";

type RwaAsset = Record<string, unknown>;
type TokenRow = Record<string, unknown>;

const cache = new Map<string, { exp: number; value: unknown }>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.value as T);
  return fn().then((value) => {
    cache.set(key, { exp: Date.now() + ttlMs, value });
    return value;
  });
}

function tokenKey(t: { cryptoId: number | null; symbol: string }): string {
  return t.cryptoId != null ? `id:${t.cryptoId}` : `sym:${t.symbol.toUpperCase()}`;
}

function readTokens(asset: RwaAsset): TokenRow[] {
  return asArray<TokenRow>(asset.tokens ?? asset.linked_tokens);
}

function rwaAssetsFrom(data: unknown): RwaAsset[] {
  const root = (data ?? {}) as Record<string, unknown>;
  return asArray<RwaAsset>(
    root.rwa_assets ?? root.assets ?? (Array.isArray(data) ? data : []),
  );
}

function cmcStatusTimestamp(raw: unknown): string | null {
  const status = (raw as { status?: { timestamp?: unknown } } | null)?.status;
  const ts = status?.timestamp;
  return typeof ts === "string" && ts ? ts : null;
}

export async function loadDesk(
  clusterId: string,
  opts?: { lite?: boolean },
): Promise<DeskSnapshot> {
  const lite = Boolean(opts?.lite);
  if (!hasApiKey()) {
    const known = getCluster(clusterId.trim().toLowerCase());
    if (known?.id === "gold") return goldFixture();
  }
  const cluster = await clusterForQuery(clusterId);
  const endpointsUsed: string[] = [];
  const warnings: string[] = [];
  let source: DeskSnapshot["source"] = "fallback";
  let rwaOk = false;

  const wrappers = new Map<string, Wrapper>();
  const push = (w: Wrapper) => {
    const key = tokenKey(w);
    const prev = wrappers.get(key);
    if (!prev) {
      wrappers.set(key, w);
      return;
    }
    wrappers.set(key, {
      ...prev,
      ...w,
      issuerName: w.issuerName || prev.issuerName,
      name: w.name || prev.name,
      slug: w.slug || prev.slug,
      pairCount: Math.max(prev.pairCount, w.pairCount),
      volume24h: w.volume24h || prev.volume24h,
      marketCap: w.marketCap || prev.marketCap,
      rawPriceUsd: w.rawPriceUsd ?? prev.rawPriceUsd,
      normalizedUsd: w.normalizedUsd ?? prev.normalizedUsd,
    });
  };

  for (const seed of cluster.seedTokens) {
    push(emptyWrapper(cluster, seed.symbol, seed));
  }

  let rwaMapCount = 0;
  let rwaQuoteCount = 0;
  let cryptoQuoteCount = 0;
  let pairCount = 0;
  let primaryRwaId: number | null = cluster.rwaId ?? null;
  let tokenizedMcap: number | null = null;
  let tokenizedVolume: number | null = null;
  let averageTokenizedPrice: number | null = null;
  let tradfiMarkets: TradfiMarket[] = [];
  let cmcTimestamp: string | null = null;
  let lastUpdated: string | null = null;
  let venueCoverage: VenueCoverage = lite
    ? {
        status: "skipped",
        detail: "The watchlist skips market pairs. Open a name for venue coverage.",
      }
    : {
        status: "unavailable",
        detail: "Venue coverage was not loaded.",
      };

  if (hasApiKey()) {
    try {
      const dynamic = cluster.id.startsWith("rwa-") && cluster.rwaId != null;
      let mapped: RwaAsset[] = [];
      if (!dynamic) {
        const symbolParam = cluster.rwaSymbols.join(",");
        const mapRes = await cached(`map:${symbolParam}`, 5 * 60_000, () =>
          cmcGet("/v5/real-world-assets/map", { symbol: symbolParam }),
        );
        endpointsUsed.push("GET /v5/real-world-assets/map");
        mapped = rwaAssetsFrom(mapRes.data);
        rwaMapCount = mapped.length;
      }

      const mappedIds = [
        ...new Set(
          mapped
            .map((a) => num(a.rwa_id ?? a.id))
            .filter((id): id is number => id != null),
        ),
      ];
      const quoteParam = dynamic
        ? { rwa_id: cluster.rwaId, convert: "USD" }
        : mappedIds.length
          ? { rwa_id: mappedIds.join(","), convert: "USD" }
          : { symbol: cluster.rwaSymbols[0], convert: "USD" };
      const quoteRes = await cached(`rwaq:${JSON.stringify(quoteParam)}`, 45_000, () =>
        cmcGet("/v5/real-world-assets/quotes/latest", quoteParam),
      );
      endpointsUsed.push("GET /v5/real-world-assets/quotes/latest");
      const quoted = rwaAssetsFrom(quoteRes.data);
      rwaQuoteCount = quoted.length;
      cmcTimestamp = cmcStatusTimestamp(quoteRes.raw) ?? cmcTimestamp;
      if (mappedIds[0] != null) primaryRwaId = mappedIds[0];
      const head = quoted[0];
      if (head) {
        tokenizedMcap = num(head.tokenized_market_cap) ?? tokenizedMcap;
        tokenizedVolume = num(head.tokenized_volume_24h) ?? tokenizedVolume;
        averageTokenizedPrice = num(head.average_tokenized_price);
        lastUpdated = head.last_updated ? String(head.last_updated) : lastUpdated;
        tradfiMarkets = parseTradfiMarkets(head.tradfi_markets);
        primaryRwaId = num(head.rwa_id) ?? primaryRwaId;
      }

      const assets = mergeAssets(mapped, quoted);

      for (const asset of assets) {
        const rwaId = num(asset.rwa_id ?? asset.id);
        const assetQuote = usdQuote(asset);
        const tokens = readTokens(asset);
        if (!tokens.length) {
          const symbol = String(asset.symbol ?? "");
          if (symbol) {
            push({
              ...emptyWrapper(cluster, symbol),
              rwaId,
              name: String(asset.name ?? symbol),
              rawPriceUsd: assetQuote.price,
              normalizedUsd: normalize(cluster, symbol, assetQuote.price),
              volume24h: assetQuote.volume24h,
              marketCap: assetQuote.marketCap,
              percentChange24h: assetQuote.percentChange24h,
            });
          }
          continue;
        }
        for (const token of tokens) {
          const symbol = String(token.symbol ?? asset.symbol ?? "");
          const issuerName = String(token.issuer_name ?? token.issuer ?? "");
          const tokenName = String(token.name ?? "");
          if (/deriv/i.test(issuerName) || /deriv/i.test(tokenName)) continue;
          const cryptoId = num(token.crypto_id ?? token.id);
          const tq = usdQuote(token);
          const price = tq.price ?? assetQuote.price;
          push({
            ...emptyWrapper(cluster, symbol),
            name: String(token.name ?? asset.name ?? symbol),
            slug: token.slug ? String(token.slug) : null,
            cryptoId,
            rwaId,
            issuerId: token.issuer_id != null ? String(token.issuer_id) : null,
            issuerName,
            rawPriceUsd: price,
            normalizedUsd: normalize(cluster, symbol, price),
            volume24h: tq.volume24h || assetQuote.volume24h,
            marketCap: tq.marketCap || assetQuote.marketCap,
            percentChange24h: tq.percentChange24h ?? assetQuote.percentChange24h,
          });
        }
      }

      rwaOk = true;

      if (!lite) {
        const rwaIds = [
          ...new Set(
            [...wrappers.values()]
              .map((w) => w.rwaId)
              .filter((id): id is number => id != null),
          ),
        ].slice(0, 4);

        const allVenues: Venue[] = [];
        let gated = false;
        for (const id of rwaIds) {
          if (gated) break;
          try {
            const pages = await loadPairPages(id);
            endpointsUsed.push("GET /v5/real-world-assets/market-pairs/list");
            pairCount += pages.reported;
            allVenues.push(...pages.venues);
          } catch (err) {
            if (isPlanGate(err)) {
              gated = true;
              warnings.push(
                "market-pairs: Growth+ endpoint. The Startup plan cannot load venues.",
              );
            } else {
              warnings.push(
                `market-pairs rwa_id=${id}: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        }
        for (const w of wrappers.values()) {
          w.venues = venuesFor(allVenues, w.cryptoId);
          const n = pairCountFor(allVenues, w.cryptoId);
          if (n) w.pairCount = n;
        }
        if (gated) {
          for (const w of wrappers.values()) {
            if (w.venues.length) continue;
            const demo = demoVenuesFor(w.cryptoId);
            if (demo.length) w.venues = demo;
          }
          const sampled = [...wrappers.values()].some((w) =>
            w.venues.some((v) => v.listed === "demo"),
          );
          venueCoverage = {
            status: sampled ? "demo" : "plan-gated",
            detail: sampled
              ? "Market pairs are a Growth+ CMC endpoint. This desk still calculates wrapper relative value using live RWA and crypto quote data. Sample prints below are not a live book."
              : "Market pairs are a Growth+ CMC endpoint. This desk still calculates wrapper relative value using live RWA and crypto quote data.",
          };
        } else {
          venueCoverage = allVenues.length
            ? {
                status: "live",
                detail: "Spot venues from market-pairs/list, top 100 by 24h volume.",
              }
            : {
                status: "unavailable",
                detail: "Market pairs returned no spot venues for these wrappers.",
              };
        }
      }

    } catch (err) {
      warnings.push(
        `RWA family: ${err instanceof Error ? err.message : String(err)}`,
      );
      rwaOk = false;
    }

  }

  const ids = [
    ...new Set(
      [...wrappers.values()]
        .map((w) => w.cryptoId)
        .filter((id): id is number => id != null),
    ),
  ];
  if (ids.length) {
    try {
      const q = await cached(`cq:${ids.sort().join(",")}`, 30_000, () =>
        cmcGetLive("/v3/cryptocurrency/quotes/latest", {
          id: ids.join(","),
          convert: "USD",
          skip_invalid: "true",
        }),
      );
      endpointsUsed.push(
        q.via === "public"
          ? "GET /public-api/v3/cryptocurrency/quotes/latest"
          : "GET /v3/cryptocurrency/quotes/latest",
      );
      if (q.via === "public") {
        warnings.push(
          "RWA / keyed endpoints are waiting on plan activation. Live prices below are from CMC's public API.",
        );
      }
      const rows = asArray<Record<string, unknown>>(q.data);
      cryptoQuoteCount = rows.length;
      for (const row of rows) {
        const cryptoId = num(row.id);
        const quote = usdQuote(row);
        for (const w of wrappers.values()) {
          if (w.cryptoId !== cryptoId) continue;
          w.name = String(row.name ?? w.name);
          w.symbol = String(row.symbol ?? w.symbol);
          w.slug = String(row.slug ?? "") || w.slug;
          w.rawPriceUsd = quote.price ?? w.rawPriceUsd;
          w.normalizedUsd = normalize(
            cluster,
            w.symbol,
            quote.price ?? w.rawPriceUsd,
          );
          w.volume24h = quote.volume24h || w.volume24h;
          w.marketCap = quote.marketCap || w.marketCap;
          w.percentChange24h = quote.percentChange24h ?? w.percentChange24h;
        }
      }
    } catch (err) {
      warnings.push(
        `crypto quotes: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else if (!hasApiKey()) {
    warnings.push(
      "No CMC_API_KEY — board is structure-only. Add the hackathon Startup key to .env.local.",
    );
  }

  const list = [...wrappers.values()].filter((w) => w.symbol);
  if (!cluster.comparable) {
    warnings.push("Unit normalization unavailable for this RWA. Prices are not compared.");
    for (const w of list) w.normalizedUsd = null;
  }
  const pricesOk = list.some((w) => w.normalizedUsd != null);
  const fair = liquidReference(list, cluster.volumeFloorUsd);
  const scored = applyFairValue(list, fair);
  const { main, dust } = splitBoard(scored, cluster.volumeFloorUsd);

  const pair = liquidSpreadPair(scored, cluster.volumeFloorUsd);
  let spread = null;
  let history = null;
  if (
    pair?.cheap.cryptoId &&
    pair?.rich.cryptoId &&
    pair.cheap.cryptoId !== pair.rich.cryptoId
  ) {
    try {
      const hist = await fetchSpreadHistory(
        {
          symbol: pair.cheap.symbol,
          cryptoId: pair.cheap.cryptoId,
          ouncesPerToken: pair.cheap.ouncesPerToken,
        },
        {
          symbol: pair.rich.symbol,
          cryptoId: pair.rich.cryptoId,
          ouncesPerToken: pair.rich.ouncesPerToken,
        },
      );
      if (hist.endpoint) endpointsUsed.push(hist.endpoint);
      const liveBps =
        pair.cheap.normalizedUsd != null && pair.rich.normalizedUsd != null
          ? basisBps(pair.rich.normalizedUsd, pair.cheap.normalizedUsd)
          : null;
      const ranked = liveBps == null ? null : rankAgainstHistory(hist.points, liveBps);
      history =
        hist.summary && ranked
          ? {
              ...hist.summary,
              percentile: ranked.percentile,
              extreme: ranked.extreme,
            }
          : hist.summary;
      spread = {
        clusterId: cluster.id,
        buySymbol: pair.cheap.symbol,
        avoidSymbol: pair.rich.symbol,
        points: hist.points,
        summary: history,
        endpointsUsed: hist.endpoint ? [hist.endpoint] : [],
      };
    } catch (err) {
      warnings.push(
        `ohlcv: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const venuesByCryptoId: Record<number, Venue[]> = {};
  for (const w of scored) {
    if (w.cryptoId != null && w.venues.length) venuesByCryptoId[w.cryptoId] = w.venues;
  }
  const ticket = buildTicket(scored, fair, cluster.volumeFloorUsd, cluster.unit, {
    venuesByCryptoId,
    history,
  });

  let underlying: UnderlyingInfo | null = null;
  if (!lite && primaryRwaId != null) {
    try {
      underlying = await loadUnderlying(primaryRwaId, {
        tokenizedMcap,
        tokenizedVolume,
      });
      endpointsUsed.push("GET /v5/real-world-assets/info");
    } catch (err) {
      warnings.push(
        `info: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  let issuer: IssuerProfile | null = null;
  if (!lite) {
    const buy = scored.find((w) =>
      ticket.buyCryptoId != null
        ? w.cryptoId === ticket.buyCryptoId
        : w.symbol === ticket.buySymbol,
    );
    const issuerId =
      buy?.issuerId || scored.find((w) => w.issuerId)?.issuerId || null;
    if (issuerId) {
      try {
        issuer = await cached(`issuer:${issuerId}`, 10 * 60_000, () =>
          loadIssuer(issuerId),
        );
        endpointsUsed.push("GET /v5/real-world-assets/issuers");
      } catch (err) {
        warnings.push(
          `issuers: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  if (rwaOk && warnings.length === 0) source = "live";
  else if (rwaOk || pricesOk) source = "partial-live";
  else source = "fallback";

  return {
    cluster,
    generatedAt: new Date().toISOString(),
    source,
    liquidReferenceUsd: fair,
    venueCoverage,
    averageTokenizedPrice,
    tradfiMarkets,
    issuer,
    wrappers: scored,
    main,
    dust,
    ticket,
    spread,
    underlying,
    endpointsUsed: [...new Set(endpointsUsed)],
    warnings,
    evidence: {
      rwaMapCount,
      rwaQuoteCount,
      cryptoQuoteCount,
      pairCount,
      cmcTimestamp,
      lastUpdated,
    },
  };
}

async function loadPairPages(
  rwaId: number,
): Promise<{ venues: Venue[]; reported: number }> {
  const base = { rwa_id: rwaId, start: 1, limit: 100 };
  let pairs;
  try {
    pairs = await cached(`pairs:${rwaId}:top`, 120_000, () =>
      cmcGet("/v5/real-world-assets/market-pairs/list", {
        ...base,
        sort: "volume_24h",
        sort_dir: "desc",
      }),
    );
  } catch (err) {
    if (isPlanGate(err)) throw err;
    pairs = await cached(`pairs:${rwaId}:plain`, 120_000, () =>
      cmcGet("/v5/real-world-assets/market-pairs/list", base),
    );
  }
  const data = (pairs.data ?? {}) as Record<string, unknown>;
  const list = asArray(data.market_pairs);
  return {
    venues: parseVenues(list),
    reported: num(data.num_market_pairs) ?? list.length,
  };
}

export async function loadBoard(ids: string[]): Promise<BoardRow[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(
    0,
    12,
  );
  const out: BoardRow[] = [];
  for (let i = 0; i < unique.length; i += 3) {
    const chunk = unique.slice(i, i + 3);
    const rows = await Promise.all(
      chunk.map(async (id) => {
        try {
          const d = await loadDesk(id, { lite: true });
          const venue =
            d.ticket.venues.find((v) => v.recommended) ??
            d.ticket.venues[0] ??
            null;
          return {
            id,
            symbol: d.cluster.rwaSymbols[0] ?? d.cluster.label,
            name: d.cluster.label,
            action: d.ticket.action,
            headline: d.ticket.headline,
            buySymbol: d.ticket.buySymbol,
            avoidSymbol: d.ticket.avoidSymbol,
            trapSymbol: d.ticket.trap?.symbol ?? null,
            spreadBps: d.ticket.spreadBps,
            dollarGap: d.ticket.dollarGap,
            liquidReferenceUsd: d.liquidReferenceUsd,
            venue,
            liquidCount: d.main.length,
          } satisfies BoardRow;
        } catch (err) {
          return {
            id,
            symbol: id,
            name: id,
            action: "only-one" as const,
            headline: err instanceof Error ? err.message : "Failed to load",
            buySymbol: null,
            avoidSymbol: null,
            trapSymbol: null,
            spreadBps: null,
            dollarGap: null,
            liquidReferenceUsd: null,
            venue: null,
            liquidCount: 0,
            error: err instanceof Error ? err.message : "Failed",
          } satisfies BoardRow;
        }
      }),
    );
    out.push(...rows);
  }
  return out;
}

function mergeAssets(a: RwaAsset[], b: RwaAsset[]): RwaAsset[] {
  const map = new Map<string, RwaAsset>();
  for (const row of [...a, ...b]) {
    const id = String(row.rwa_id ?? row.id ?? row.symbol ?? JSON.stringify(row));
    const prev = map.get(id) ?? {};
    map.set(id, { ...prev, ...row });
  }
  return [...map.values()];
}

function emptyWrapper(
  cluster: ClusterDef,
  symbol: string,
  seed?: { cryptoId: number; issuerName: string; ouncesPerToken: number },
): Wrapper {
  const oz = seed?.ouncesPerToken ?? ouncesPerToken(symbol);
  return {
    symbol,
    name: symbol,
    slug: null,
    cryptoId: seed?.cryptoId ?? null,
    rwaId: null,
    issuerId: null,
    issuerName: seed?.issuerName ?? "",
    rawPriceUsd: null,
    normalizedUsd: null,
    ouncesPerToken: oz,
    volume24h: 0,
    marketCap: 0,
    percentChange24h: null,
    pairCount: 0,
    basisBps: null,
    tradability: "F",
    depthUsd: null,
    capacityUsd: null,
    venues: [],
  };
}

function normalize(
  cluster: ClusterDef,
  symbol: string,
  price: number | null,
): number | null {
  if (price == null || !cluster.comparable || cluster.unitKind === "unknown") {
    return null;
  }
  if (cluster.unitKind === "troy_ounce" || cluster.unitKind === "gram") {
    return price / ouncesPerToken(symbol);
  }
  return price;
}
