import https from "node:https";
import { Resolver } from "node:dns/promises";

const BASE = "https://pro-api.coinmarketcap.com";
const HOST = "pro-api.coinmarketcap.com";

// Some ISPs rewrite CMC DNS to a dead anycast. Resolve via public DNS.
const dnsResolver = new Resolver();
dnsResolver.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
const ipCache = new Map<string, { exp: number; ips: string[] }>();

export type CmcCall = {
  method: "GET";
  path: string;
  params: Record<string, string | number>;
};

export class CmcError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cmcCode?: string | number,
  ) {
    super(message);
    this.name = "CmcError";
  }
}

function apiKey(): string {
  return (
    process.env.CMC_API_KEY?.trim() ||
    process.env.COINMARKETCAP_API_KEY?.trim() ||
    ""
  );
}

export function hasApiKey(): boolean {
  return apiKey().length > 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function resolveIps(host: string): Promise<string[]> {
  const hit = ipCache.get(host);
  if (hit && hit.exp > Date.now()) return hit.ips;
  const ips = await dnsResolver.resolve4(host);
  if (!ips.length) throw new CmcError(`DNS returned no A records for ${host}`);
  ipCache.set(host, { exp: Date.now() + 5 * 60_000, ips });
  return ips;
}

function requestOnce(
  url: URL,
  ip: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: ip,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: url.hostname,
        headers: { ...headers, Host: url.hostname },
        timeout: 20_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error(`timeout connecting to ${ip}`)));
    req.on("error", reject);
    req.end();
  });
}

function friendlyCmcMessage(
  path: string,
  status: number,
  errorCode: string | number | undefined,
  errorMessage: string,
  raw: string,
): string {
  if (errorCode === 1003 || errorCode === "1003") {
    return "CMC says this API key is not activated yet. Open https://pro.coinmarketcap.com/account/plan and activate the Startup plan (hackathon signup uses the same CMC account email).";
  }
  if (errorMessage) return `${path} CMC ${errorCode}: ${errorMessage}`;
  return `${path} HTTP ${status}: ${raw.slice(0, 240)}`;
}

const PUBLIC_PATHS = new Set([
  "/v3/cryptocurrency/quotes/latest",
  "/v1/cryptocurrency/map",
  "/v2/cryptocurrency/info",
  "/v1/cryptocurrency/listings/latest",
  "/v1/global-metrics/quotes/latest",
  "/v3/fear-and-greed/latest",
]);

export async function cmcGet<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<{ data: T; raw: unknown; call: CmcCall }> {
  return cmcRequest<T>(path, params, { requireKey: true });
}

/** Keyed first, then CMC public-api for endpoints that allow no key. */
export async function cmcGetLive<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<{ data: T; raw: unknown; call: CmcCall; via: "keyed" | "public" }> {
  if (hasApiKey()) {
    try {
      const keyed = await cmcRequest<T>(path, params, { requireKey: true });
      return { ...keyed, via: "keyed" };
    } catch (err) {
      if (!PUBLIC_PATHS.has(path) || !isActivationError(err)) throw err;
    }
  }
  if (!PUBLIC_PATHS.has(path)) {
    throw new CmcError(`${path} needs an activated CMC API key.`);
  }
  const pub = await cmcRequest<T>(path, params, { requireKey: false, publicApi: true });
  return { ...pub, via: "public" };
}

export function isActivationError(err: unknown): boolean {
  return err instanceof CmcError && (err.cmcCode === 1003 || err.cmcCode === "1003");
}

async function cmcRequest<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  opts: { requireKey: boolean; publicApi?: boolean },
): Promise<{ data: T; raw: unknown; call: CmcCall }> {
  const key = apiKey();
  if (opts.requireKey && !key) {
    throw new CmcError(
      "CMC_API_KEY is not set. Add it to .env.local (hackathon Startup-tier key).",
    );
  }

  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    search.set(k, String(v));
  }
  const root = opts.publicApi ? `${BASE}/public-api` : BASE;
  const url = new URL(`${root}${path}${search.size ? `?${search}` : ""}`);
  const call: CmcCall = {
    method: "GET",
    path: opts.publicApi ? `/public-api${path}` : path,
    params: Object.fromEntries(search.entries()),
  };

  const ips = await resolveIps(HOST);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.requireKey && key) headers["X-CMC_PRO_API_KEY"] = key;

  let lastText = "";
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    const ip = ips[attempt % ips.length];
    let status = 0;
    try {
      const res = await requestOnce(url, ip, headers);
      status = res.status;
      lastStatus = res.status;
      lastText = res.body;
    } catch (err) {
      lastText = err instanceof Error ? err.message : String(err);
      if (attempt < 3) {
        await sleep(300 * 2 ** attempt);
        continue;
      }
      throw new CmcError(
        `${path} could not reach CoinMarketCap (${lastText}).`,
        0,
      );
    }

    let payload: Record<string, unknown> | null = null;
    try {
      payload = JSON.parse(lastText) as Record<string, unknown>;
    } catch {
      payload = null;
    }
    const statusObj = (payload?.status ?? {}) as Record<string, unknown>;
    const errorCode = statusObj.error_code as string | number | undefined;
    const errorMessage = String(statusObj.error_message ?? "");
    const rateLimited =
      status === 429 || errorCode === 1008 || errorCode === "1008";

    if (rateLimited && attempt < 3) {
      await sleep(400 * 2 ** attempt + Math.floor(Math.random() * 200));
      continue;
    }
    if (status === 402 || errorCode === 1003 || errorCode === "1003") {
      throw new CmcError(
        friendlyCmcMessage(path, status, errorCode, errorMessage, lastText),
        status,
        errorCode,
      );
    }
    if (status < 200 || status >= 300) {
      throw new CmcError(
        friendlyCmcMessage(path, status, errorCode, errorMessage, lastText),
        status,
        errorCode,
      );
    }
    if (errorCode !== undefined && errorCode !== 0 && errorCode !== "0") {
      throw new CmcError(
        friendlyCmcMessage(path, status, errorCode, errorMessage, lastText),
        status,
        errorCode,
      );
    }
    return { data: (payload?.data ?? payload) as T, raw: payload, call };
  }

  throw new CmcError(
    `${path} failed after retries (HTTP ${lastStatus}): ${lastText.slice(0, 200)}`,
    lastStatus,
  );
}

export function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") return Object.values(value) as T[];
  return [];
}

export function usdQuote(node: unknown): {
  price: number | null;
  volume24h: number;
  marketCap: number;
  percentChange24h: number | null;
} {
  const rec = (node ?? {}) as Record<string, unknown>;
  let usd: Record<string, unknown> | null = null;
  const quote = rec.quote;
  if (Array.isArray(quote)) {
    usd =
      (quote.find((q) => {
        const row = q as Record<string, unknown>;
        return row.symbol === "USD" || row.convert === "USD";
      }) as Record<string, unknown> | undefined) ??
      ((quote[0] as Record<string, unknown>) ?? null);
  } else if (quote && typeof quote === "object") {
    const q = quote as Record<string, unknown>;
    usd = (q.USD as Record<string, unknown>) ?? (q.usd as Record<string, unknown>) ?? q;
  }
  const price = num(usd?.price ?? rec.price);
  return {
    price,
    volume24h: num(usd?.volume_24h ?? rec.volume_24h) ?? 0,
    marketCap: num(usd?.market_cap ?? rec.market_cap) ?? 0,
    percentChange24h: num(usd?.percent_change_24h ?? rec.percent_change_24h),
  };
}

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}
