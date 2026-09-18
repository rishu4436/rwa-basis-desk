"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RWA_TYPE_CHIPS } from "@/lib/rwa-types";
import { DEFAULT_WATCHLIST } from "@/lib/watchlist";
import type { CatalogHit, WatchItem } from "@/lib/types";

type Tab = "search" | "watchlist";

export function CatalogModal({
  open,
  onClose,
  watchlist,
  activeId,
  onOpen,
  onPin,
  onUnpin,
}: {
  open: boolean;
  onClose: () => void;
  watchlist: WatchItem[];
  activeId: string;
  onOpen: (item: WatchItem) => void;
  onPin: (hit: CatalogHit) => void;
  onUnpin: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("search");
  const [q, setQ] = useState("");
  const [assetType, setAssetType] = useState("all");
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTab("search");
    setQ("");
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      setLoading(true);
      setErr(null);
      const type = assetType === "all" ? "" : assetType;
      fetch(
        `/api/catalog?q=${encodeURIComponent(q.trim())}&type=${encodeURIComponent(type)}`,
      )
        .then(async (r) => {
          const json = await r.json();
          if (!r.ok) throw new Error(json.error || r.statusText);
          setHits((json.results ?? []) as CatalogHit[]);
        })
        .catch((e: unknown) =>
          setErr(e instanceof Error ? e.message : "Search failed"),
        )
        .finally(() => setLoading(false));
    }, q ? 220 : 0);
    return () => clearTimeout(handle);
  }, [q, open, assetType]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pinnedIds = useMemo(
    () => new Set(watchlist.map((w) => w.rwaId)),
    [watchlist],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close catalog"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[72vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#11141a] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-3">
          <button
            type="button"
            onClick={() => setTab("search")}
            className={`px-2 py-3 text-xs ${tab === "search" ? "text-white" : "text-white/40"}`}
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => setTab("watchlist")}
            className={`px-2 py-3 text-xs ${tab === "watchlist" ? "text-white" : "text-white/40"}`}
          >
            Watchlist · {watchlist.length}
          </button>
        </div>

        {tab === "search" ? (
          <>
            <div className="border-b border-white/[0.06] px-4 py-3">
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ticker or name — AAPL, QQQ, silver…"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              />
              <div className="mt-3 flex flex-wrap gap-1">
                {RWA_TYPE_CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setAssetType(chip.id)}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                      assetType === chip.id
                        ? "border-white/30 bg-white/10 text-white"
                        : "border-white/10 text-white/40 hover:text-white"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-white/35">
                Filter by RWA type, then pin. Multi-wrapper names sort first.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {err && (
                <p className="px-4 py-3 text-sm text-rose-300">{err}</p>
              )}
              {loading && (
                <p className="px-4 py-3 text-sm text-white/40">Searching…</p>
              )}
              {!loading &&
                hits.map((hit) => {
                  const pinned = pinnedIds.has(hit.rwaId);
                  return (
                    <div
                      key={hit.rwaId}
                      className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2.5"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => onOpen(hitToWatch(hit))}
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-sm text-white">
                            {hit.symbol}
                          </span>
                          <span className="truncate text-xs text-white/50">
                            {hit.name}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-white/35">
                          {hit.assetType}
                          {hit.wrappers != null
                            ? ` · ${hit.wrappers} wrapper${hit.wrappers === 1 ? "" : "s"}`
                            : hit.hasTokens
                              ? " · tokenized"
                              : " · no tokens"}
                          {hit.wrappers === 1 ? " · no basis" : ""}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => onPin(hit)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] ${
                          pinned
                            ? "border-white/15 text-white/40"
                            : "border-gold-400/30 text-gold-400"
                        }`}
                      >
                        {pinned ? "Pinned" : "Pin"}
                      </button>
                    </div>
                  );
                })}
              {!loading && !hits.length && q && (
                <p className="px-4 py-6 text-sm text-white/40">
                  No match. Try the tradfi ticker (NVDA, not NVDAX).
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {watchlist.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2.5"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onOpen(item)}
                >
                  <span className="font-mono text-sm text-white">
                    {item.symbol}
                  </span>
                  <span className="ml-2 text-xs text-white/45">{item.name}</span>
                  {item.id === activeId && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-gold-400">
                      open
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onUnpin(item.id)}
                  className="text-[11px] text-white/35 hover:text-rose-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function hitToWatch(hit: CatalogHit): WatchItem {
  const known = DEFAULT_WATCHLIST.find((x) => x.rwaId === hit.rwaId);
  if (known) {
    return { ...known, wrappers: hit.wrappers ?? known.wrappers };
  }
  return {
    id: `rwa-${hit.rwaId}`,
    rwaId: hit.rwaId,
    symbol: hit.symbol,
    name: hit.name,
    assetType: hit.assetType,
    wrappers: hit.wrappers ?? undefined,
  };
}
