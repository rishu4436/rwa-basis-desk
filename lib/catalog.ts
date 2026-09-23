import { asArray, CmcError, cmcGet, num } from "./cmc";
import { clusterFromAsset, getCluster } from "./clusters";
import { TREASURY_SYMBOLS } from "./rwa-types";
import type { CatalogHit, ClusterDef } from "./types";

type RwaAsset = Record<string, unknown>;

function rwaAssets(data: unknown): RwaAsset[] {
  const root = (data ?? {}) as Record<string, unknown>;
  return asArray<RwaAsset>(root.rwa_assets ?? root.assets ?? []);
}

function isDeriv(token: Record<string, unknown>): boolean {
  const blob = `${token.issuer_name ?? ""} ${token.name ?? ""}`;
  return /deriv/i.test(blob);
}

function toHit(asset: RwaAsset, wrappers: number | null): CatalogHit {
  const symbol = String(asset.symbol ?? "");
  const tokens = asArray<Record<string, unknown>>(asset.tokens);
  const comparableTokens = tokens.filter((t) => !isDeriv(t));
  const count = wrappers ?? (tokens.length ? comparableTokens.length : null);
  return {
    rwaId: num(asset.rwa_id ?? asset.id) ?? 0,
    symbol,
    name: String(asset.name ?? symbol),
    slug: String(asset.slug ?? ""),
    assetType: String(asset.asset_type ?? "stock"),
    rank: num(asset.rwa_rank),
    hasTokens: Boolean(asset.has_tokens),
    wrappers: count,
    comparable: (count ?? 0) >= 2 || (!count && Boolean(asset.has_tokens)),
  };
}

const popularCache = new Map<string, { exp: number; hits: CatalogHit[] }>();

export async function listPopular(
  limit = 40,
  assetType = "",
): Promise<CatalogHit[]> {
  const key = `${assetType || "all"}:v2`;
  const hit = popularCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.hits.slice(0, limit);

  if (assetType === "treasury") {
    const hits = await listBySymbols(TREASURY_SYMBOLS);
    popularCache.set(key, { exp: Date.now() + 10 * 60_000, hits });
    return hits.slice(0, limit);
  }

  const params: Record<string, string | number> = {
    limit: assetType === "etf" ? Math.max(limit, 100) : limit,
    convert: "USD",
  };
  if (assetType) params.asset_type = assetType;
  const res = await cmcGet("/v5/real-world-assets/assets/list", params);
  let hits = rwaAssets(res.data)
    .map((a) => toHit(a, null))
    .filter((h) => h.hasTokens && h.rwaId);
  if (assetType === "etf") {
    const seeded = await listBySymbols([
      "SPY",
      "QQQ",
      "IWM",
      "DIA",
      "GLD",
      "SLV",
      "EEM",
      "VTI",
    ]);
    const seen = new Set(hits.map((h) => h.rwaId));
    hits = [...seeded.filter((h) => !seen.has(h.rwaId)), ...hits];
  }
  popularCache.set(key, { exp: Date.now() + 10 * 60_000, hits });
  return hits.slice(0, limit);
}

async function listBySymbols(symbols: string[]): Promise<CatalogHit[]> {
  const hits: CatalogHit[] = [];
  for (const symbol of symbols) {
    try {
      const mapped = await cmcGet("/v5/real-world-assets/map", { symbol });
      const row = rwaAssets(mapped.data)[0];
      if (!row) continue;
      const id = num(row.rwa_id ?? row.id);
      if (id == null) continue;
      hits.push(toHit(row, null));
    } catch {
      /* skip missing */
    }
  }
  return hits.filter((h) => h.hasTokens);
}

export async function searchCatalog(
  q: string,
  assetType = "",
): Promise<CatalogHit[]> {
  const query = q.trim();
  if (!query) return listPopular(40, assetType);

  const ticker = query.toUpperCase().replace(/[^A-Z0-9.]/g, "");
  const hits = new Map<number, CatalogHit>();

  if (ticker.length >= 1 && ticker.length <= 8) {
    try {
      const mapped = await cmcGet("/v5/real-world-assets/map", { symbol: ticker });
      const rows = rwaAssets(mapped.data);
      const ids = rows
        .map((a) => num(a.rwa_id ?? a.id))
        .filter((id): id is number => id != null)
        .slice(0, 8);
      if (ids.length) {
        const quoted = await cmcGet("/v5/real-world-assets/quotes/latest", {
          rwa_id: ids.join(","),
          convert: "USD",
        });
        for (const a of rwaAssets(quoted.data)) {
          const hit = toHit(a, null);
          if (hit.rwaId) hits.set(hit.rwaId, hit);
        }
      }
    } catch {
      /* fall through to name scan */
    }
  }

  const popular = await listPopular(80, assetType);
  const needle = query.toLowerCase();
  for (const hit of popular) {
    if (
      hit.symbol.toLowerCase().includes(needle) ||
      hit.name.toLowerCase().includes(needle)
    ) {
      if (!hits.has(hit.rwaId)) hits.set(hit.rwaId, hit);
    }
  }

  let results = [...hits.values()];
  if (assetType && assetType !== "treasury") {
    results = results.filter((h) => h.assetType === assetType);
  }
  if (assetType === "treasury") {
    const allow = new Set(TREASURY_SYMBOLS);
    results = results.filter(
      (h) =>
        allow.has(h.symbol) ||
        /treasury|t-bill|bond|tips|aggregate/i.test(h.name),
    );
  }

  return results.sort((a, b) => {
    if (a.comparable !== b.comparable) return a.comparable ? -1 : 1;
    return (a.rank ?? 9999) - (b.rank ?? 9999);
  });
}

export class UnknownAssetError extends Error {
  constructor(readonly query: string) {
    super(
      `No tokenized wrapper found for "${query}". Search a tradfi ticker like AAPL.`,
    );
    this.name = "UnknownAssetError";
  }
}

function isBadTicker(err: unknown): boolean {
  if (!(err instanceof CmcError)) return false;
  const code = err.cmcCode;
  return (
    code === 4001 ||
    code === "4001" ||
    err.status === 400 ||
    err.status === 404
  );
}

export async function clusterForQuery(query: string): Promise<ClusterDef> {
  const known = getCluster(query);
  if (known) return known;

  if (query.startsWith("rwa-")) {
    const rwaId = Number(query.slice(4));
    if (Number.isFinite(rwaId)) {
      try {
        const quoted = await cmcGet("/v5/real-world-assets/quotes/latest", {
          rwa_id: rwaId,
          convert: "USD",
        });
        const asset = rwaAssets(quoted.data)[0];
        if (asset) {
          return clusterFromAsset({
            rwaId,
            symbol: String(asset.symbol ?? ""),
            name: String(asset.name ?? ""),
            assetType: String(asset.asset_type ?? "stock"),
          });
        }
      } catch (err) {
        if (isBadTicker(err)) throw new UnknownAssetError(query);
        throw err;
      }
      throw new UnknownAssetError(query);
    }
  }

  const ticker = query.toUpperCase();
  try {
    const mapped = await cmcGet("/v5/real-world-assets/map", { symbol: ticker });
    const asset = rwaAssets(mapped.data)[0];
    if (asset) {
      return clusterFromAsset({
        rwaId: num(asset.rwa_id) ?? 0,
        symbol: String(asset.symbol ?? ticker),
        name: String(asset.name ?? ticker),
        assetType: String(asset.asset_type ?? "stock"),
      });
    }
  } catch (err) {
    if (isBadTicker(err)) throw new UnknownAssetError(query);
    throw err;
  }

  throw new UnknownAssetError(query);
}
