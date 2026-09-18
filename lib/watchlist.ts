import type { WatchItem } from "./types";

const KEY = "basis-desk-watchlist-v1";
const ACTIVE = "basis-desk-active-v1";

export const DEFAULT_WATCHLIST: WatchItem[] = [
  { id: "gold", rwaId: 1, symbol: "GOLD", name: "Gold", assetType: "commodity" },
  { id: "spy", rwaId: 86, symbol: "SPY", name: "S&P 500", assetType: "etf" },
  { id: "nvda", rwaId: 2, symbol: "NVDA", name: "NVIDIA", assetType: "stock" },
  { id: "tsla", rwaId: 14, symbol: "TSLA", name: "Tesla", assetType: "stock" },
  { id: "crcl", rwaId: 115, symbol: "CRCL", name: "Circle", assetType: "stock" },
];

export function loadWatchlist(): WatchItem[] {
  if (typeof window === "undefined") return DEFAULT_WATCHLIST;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_WATCHLIST;
    const parsed = JSON.parse(raw) as WatchItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_WATCHLIST;
    return parsed.filter((x) => x && x.symbol && x.rwaId);
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

export function saveWatchlist(items: WatchItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function loadActiveId(): string {
  if (typeof window === "undefined") return "gold";
  return localStorage.getItem(ACTIVE) || "gold";
}

export function saveActiveId(id: string): void {
  localStorage.setItem(ACTIVE, id);
}

export function upsertWatch(list: WatchItem[], item: WatchItem): WatchItem[] {
  if (list.some((x) => x.rwaId === item.rwaId || x.id === item.id)) {
    return list.map((x) =>
      x.rwaId === item.rwaId || x.id === item.id ? { ...x, ...item } : x,
    );
  }
  return [...list, item];
}

export function removeWatch(list: WatchItem[], id: string): WatchItem[] {
  const next = list.filter((x) => x.id !== id);
  return next.length ? next : DEFAULT_WATCHLIST;
}
