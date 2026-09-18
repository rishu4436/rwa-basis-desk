import {
  applyFairValue,
  buildTicket,
  splitBoard,
  volumeWeightedFairValue,
} from "./basis";
import { clusterForQuery } from "./catalog";
import { ouncesPerToken } from "./clusters";
import { asArray, cmcGet, cmcGetLive, hasApiKey, num, usdQuote } from "./cmc";
import { fetchSpreadHistory } from "./history";
import { loadUnderlying } from "./underlying";
import { pairCountFor, parseVenues, venuesFor } from "./venues";
import type {
  BoardRow,
  ClusterDef,
  DeskSnapshot,
  UnderlyingInfo,
  Venue,
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

export async function loadDesk(
  clusterId: string,
  opts?: { lite?: boolean },
): Promise<DeskSnapshot> {
  const lite = Boolean(opts?.lite);
  const cluster = await clusterForQuery(clusterId);
  const endpointsUsed: string[] = [];
  const warnings: string[] = [];
  let source: DeskSnapshot["source"] = "live";

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

  if (hasApiKey()) {
    try {
      const symbolParam = cluster.rwaSymbols.join(",");
      const mapRes = await cached(`map:${symbolParam}`, 5 * 60_000, () =>
        cmcGet("/v5/real-world-assets/map", { symbol: symbolParam }),
      );
      endpointsUsed.push("GET /v5/real-world-assets/map");
      const mapped = rwaAssetsFrom(mapRes.data);
      rwaMapCount = mapped.length;

      const mappedIds = [
        ...new Set(
          mapped
            .map((a) => num(a.rwa_id ?? a.id))
            .filter((id): id is number => id != null),
        ),
      ];
      const quoteParam = mappedIds.length
        ? { rwa_id: mappedIds.join(","), convert: "USD" }
        : { symbol: cluster.rwaSymbols[0], convert: "USD" };
      const quoteRes = await cached(`rwaq:${JSON.stringify(quoteParam)}`, 45_000, () =>
        cmcGet("/v5/real-world-assets/quotes/latest", quoteParam),
      );
      endpointsUsed.push("GET /v5/real-world-assets/quotes/latest");
      const quoted = rwaAssetsFrom(quoteRes.data);
      rwaQuoteCount = quoted.length;
      if (mappedIds[0] != null) primaryRwaId = mappedIds[0];
      const head = quoted[0];
      if (head) {
        tokenizedMcap = num(head.tokenized_market_cap) ?? tokenizedMcap;
        tokenizedVolume = num(head.tokenized_volume_24h) ?? tokenizedVolume;
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

      const rwaIds = [
        ...new Set(
          [...wrappers.values()]
            .map((w) => w.rwaId)
            .filter((id): id is number => id != null),
        ),
      ].slice(0, 6);

      const allVenues: Venue[] = [];
      await Promise.all(
        rwaIds.map(async (id) => {
          try {
            const pages = await loadPairPages(id, lite ? 1 : 4);
            endpointsUsed.push("GET /v5/real-world-assets/market-pairs/list");
            pairCount += pages.reported;
            allVenues.push(...pages.venues);
          } catch (err) {
            warnings.push(
              `market-pairs rwa_id=${id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }),
      );
      for (const w of wrappers.values()) {
        w.venues = venuesFor(allVenues, w.cryptoId);
        const n = pairCountFor(allVenues, w.cryptoId);
        if (n) w.pairCount = n;
      }

      if (!lite) {
        try {
          await cached("issuers", 10 * 60_000, () =>
            cmcGet("/v5/real-world-assets/issuers/list"),
          );
          endpointsUsed.push("GET /v5/real-world-assets/issuers/list");
        } catch (err) {
          warnings.push(
            `issuers/list: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      warnings.push(
        `RWA family: ${err instanceof Error ? err.message : String(err)}`,
      );
      source = "seed-fallback";
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
  if (list.some((w) => w.normalizedUsd != null)) source = "live";
  const fair = volumeWeightedFairValue(list, cluster.volumeFloorUsd);
  const scored = applyFairValue(list, fair);
  const { main, dust } = splitBoard(scored, cluster.volumeFloorUsd);

  const liquidPair = [...main]
    .filter((w) => w.cryptoId != null && w.normalizedUsd != null)
    .sort((a, b) => b.volume24h - a.volume24h);
  let spread = null;
  let history = null;
  if (!lite && liquidPair[0]?.cryptoId && liquidPair[1]?.cryptoId) {
    try {
      const hist = await fetchSpreadHistory(
        {
          symbol: liquidPair[0].symbol,
          cryptoId: liquidPair[0].cryptoId,
          ouncesPerToken: liquidPair[0].ouncesPerToken,
        },
        {
          symbol: liquidPair[1].symbol,
          cryptoId: liquidPair[1].cryptoId,
          ouncesPerToken: liquidPair[1].ouncesPerToken,
        },
      );
      if (hist.endpoint) endpointsUsed.push(hist.endpoint);
      history = hist.summary;
      spread = {
        clusterId: cluster.id,
        buySymbol: liquidPair[0].symbol,
        avoidSymbol: liquidPair[1].symbol,
        points: hist.points,
        summary: hist.summary,
        endpointsUsed: hist.endpoint ? [hist.endpoint] : [],
      };
    } catch (err) {
      warnings.push(
        `ohlcv: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const venuesBySymbol: Record<string, Venue[]> = {};
  for (const w of scored) {
    if (w.venues.length) venuesBySymbol[w.symbol] = w.venues;
  }
  const ticket = buildTicket(scored, fair, cluster.volumeFloorUsd, cluster.unit, {
    venuesBySymbol,
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

  return {
    cluster,
    generatedAt: new Date().toISOString(),
    source,
    fairValueUsd: fair,
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
    },
  };
}

async function loadPairPages(
  rwaId: number,
  maxPages = 4,
): Promise<{ venues: Venue[]; reported: number }> {
  const venues: Venue[] = [];
  let reported = 0;
  const last = 1 + Math.max(1, maxPages - 1) * 200;
  for (let start = 1; start <= last; start += 200) {
    const pairs = await cached(`pairs:${rwaId}:${start}`, 120_000, () =>
      cmcGet("/v5/real-world-assets/market-pairs/list", {
        rwa_id: rwaId,
        start,
        limit: 200,
      }),
    );
    const data = (pairs.data ?? {}) as Record<string, unknown>;
    const list = asArray(data.market_pairs);
    reported = Math.max(reported, num(data.num_market_pairs) ?? list.length);
    venues.push(...parseVenues(list));
    if (!data.has_more || list.length < 200) break;
  }
  return { venues, reported };
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
            spreadBps: d.ticket.spreadBps,
            dollarGap: d.ticket.dollarGap,
            fairValueUsd: d.fairValueUsd,
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
            spreadBps: null,
            dollarGap: null,
            fairValueUsd: null,
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
    capacityUsd: 0,
    venues: [],
  };
}

function normalize(
  cluster: ClusterDef,
  symbol: string,
  price: number | null,
): number | null {
  if (price == null) return null;
  const oz = ouncesPerToken(symbol);
  if (cluster.assetClass === "commodity") return price / oz;
  return price;
}
