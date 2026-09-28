import type { NextRequest } from "next/server";

type Bucket = { tokens: number; refilled: number };

const buckets = new Map<string, Bucket>();

export function clientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((part) => part.trim()).filter(Boolean);
    return parts[parts.length - 1] || "local";
  }
  return "local";
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

export function validCluster(raw: string): boolean {
  return CLUSTER_RE.test(raw) && !raw.includes("..");
}

export function validBoardIds(ids: string[]): boolean {
  return ids.length > 0 && ids.length <= 12 && ids.every((id) => validCluster(id));
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
