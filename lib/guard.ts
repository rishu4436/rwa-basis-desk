import type { NextRequest } from "next/server";

type Bucket = { tokens: number; refilled: number };

const buckets = new Map<string, Bucket>();

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "local";
  return req.headers.get("x-real-ip")?.trim() || "local";
}

/** In-memory token bucket. Enough to stop a tab from emptying the CMC quota. */
export function allowRequest(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  const row = buckets.get(key) ?? { tokens: limit, refilled: now };
  const elapsed = Math.max(0, now - row.refilled);
  row.tokens = Math.min(limit, row.tokens + (elapsed / windowMs) * limit);
  row.refilled = now;
  if (row.tokens < 1) {
    buckets.set(key, row);
    return false;
  }
  row.tokens -= 1;
  buckets.set(key, row);
  return true;
}

const CLUSTER_RE = /^[A-Za-z0-9._-]{1,64}$/;
const ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

export function validCluster(raw: string): boolean {
  return CLUSTER_RE.test(raw);
}

export function validBoardIds(ids: string[]): boolean {
  return ids.length <= 12 && ids.every((id) => ID_RE.test(id));
}

const CATALOG_TYPES = new Set([
  "",
  "stock",
  "etf",
  "commodity",
  "treasury",
  "currency",
  "real_estate",
  "government_security",
]);

export function validCatalogType(type: string): boolean {
  return CATALOG_TYPES.has(type);
}
