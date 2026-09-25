"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CatalogModal, hitToWatch } from "@/components/catalog-modal";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { formatUsd, wrapperKey, wrapperLabel } from "@/lib/basis";
import {
  BasisHistory,
  DecisionHero,
  PipelinePanel,
  StructurePanel,
  WhyPanel,
} from "@/components/decision-deck";
import {
  extraOnNotional,
  formatDelta,
  type DisplayUnit,
} from "@/lib/display";
import { cmcCurrencyUrl, edgarCompanyUrl } from "@/lib/links";
import type {
  BoardRow,
  CatalogHit,
  DeskSnapshot,
  IssuerProfile,
  TradfiMarket,
  UnderlyingInfo,
  Venue,
  WatchItem,
  Wrapper,
} from "@/lib/types";
import {
  DEFAULT_WATCHLIST,
  deskPath,
  frozenDeskPath,
  loadActiveId,
  loadWatchlist,
  parseFrozenShare,
  removeWatch,
  resolveAssetParam,
  saveActiveId,
  saveWatchlist,
  upsertWatch,
  type FrozenShare,
} from "@/lib/watchlist";

const UNIT_KEY = "basis-desk-unit-v1";
const SIZE_KEY = "basis-desk-notional-v1";

function formatClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export default function Page() {
  const [clusterId, setClusterId] = useState("gold");
  const [watchlist, setWatchlist] = useState<WatchItem[]>(DEFAULT_WATCHLIST);
  const [hydrated, setHydrated] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [desk, setDesk] = useState<DeskSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [dustOpen, setDustOpen] = useState(false);
  const [unit, setUnit] = useState<DisplayUnit>("usd");
  const [notional, setNotional] = useState(10_000);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [frozen, setFrozen] = useState<FrozenShare | null>(null);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => {
    const list = loadWatchlist();
    setWatchlist(list);
    const fromUrl = resolveAssetParam(
      new URLSearchParams(window.location.search).get("asset"),
    );
    const stored = loadActiveId();
    const active =
      fromUrl ??
      (list.some((x) => x.id === stored) ? stored : list[0]?.id ?? "gold");
    setClusterId(active);
    saveActiveId(active);
    const savedUnit = localStorage.getItem(UNIT_KEY) as DisplayUnit | null;
    if (savedUnit === "usd" || savedUnit === "pct" || savedUnit === "bps") {
      setUnit(savedUnit);
    }
    const savedSize = Number(localStorage.getItem(SIZE_KEY));
    if (Number.isFinite(savedSize) && savedSize > 0) setNotional(savedSize);
    setFrozen(parseFrozenShare(new URLSearchParams(window.location.search)));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const next = deskPath(clusterId, watchlist);
    const current = `${window.location.pathname}${window.location.search}`;
    if (current === next) return;
    const existing = resolveAssetParam(
      new URLSearchParams(window.location.search).get("asset"),
    );
    if (existing && existing.toLowerCase() === clusterId.toLowerCase()) {
      setFrozen(parseFrozenShare(new URLSearchParams(window.location.search)));
      return;
    }
    window.history.replaceState(null, "", next);
    setFrozen(parseFrozenShare(new URLSearchParams(window.location.search)));
  }, [clusterId, hydrated, watchlist]);

  useEffect(() => {
    return () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    };
  }, []);

  function openItem(item: WatchItem) {
    const next = upsertWatch(watchlist, item);
    setWatchlist(next);
    saveWatchlist(next);
    setClusterId(item.id);
    saveActiveId(item.id);
    setCatalogOpen(false);
  }

  function pinHit(hit: CatalogHit) {
    const next = upsertWatch(watchlist, hitToWatch(hit));
    setWatchlist(next);
    saveWatchlist(next);
  }

  function unpin(id: string) {
    const next = removeWatch(watchlist, id);
    setWatchlist(next);
    saveWatchlist(next);
    if (clusterId === id) {
      setClusterId(next[0].id);
      saveActiveId(next[0].id);
    }
  }

  function changeUnit(next: DisplayUnit) {
    setUnit(next);
    localStorage.setItem(UNIT_KEY, next);
  }

  function changeNotional(next: number) {
    setNotional(next);
    localStorage.setItem(SIZE_KEY, String(next));
  }

  async function shareDesk() {
    const path = desk
      ? frozenDeskPath(desk, watchlist)
      : deskPath(clusterId, watchlist);
    const url = `${window.location.origin}${path}`;
    window.history.replaceState(null, "", path);
    setFrozen(parseFrozenShare(path.split("?")[1] || ""));
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelected(null);
    fetch(`/api/desk?cluster=${encodeURIComponent(clusterId)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || r.statusText);
        return json as DeskSnapshot;
      })
      .then((next) => {
        if (cancelled) return;
        setDesk(next);
        const buy =
          next.wrappers.find((w) =>
            next.ticket.buyCryptoId != null
              ? w.cryptoId === next.ticket.buyCryptoId
              : w.symbol === next.ticket.buySymbol,
          ) ?? next.wrappers.find((w) => w.symbol === next.ticket.buySymbol);
        setSelected(buy ? wrapperKey(buy) : next.ticket.buySymbol);
        const item: WatchItem = {
          id: next.cluster.id,
          rwaId: next.cluster.rwaId ?? 0,
          symbol: next.cluster.rwaSymbols[0] ?? next.cluster.label,
          name: next.cluster.label,
          assetType: next.cluster.assetClass,
        };
        setWatchlist((prev) => {
          if (
            prev.some(
              (x) =>
                x.id === item.id || (item.rwaId > 0 && x.rwaId === item.rwaId),
            )
          ) {
            return prev;
          }
          const pinned = upsertWatch(prev, item);
          saveWatchlist(pinned);
          return pinned;
        });
        if (clusterId !== next.cluster.id) {
          setClusterId(next.cluster.id);
          saveActiveId(next.cluster.id);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to load desk";
        setError(msg);
        if (msg.includes("No tokenized wrapper")) saveActiveId("gold");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId, hydrated]);

  const watchIds = watchlist.map((w) => w.id).join(",");
  useEffect(() => {
    if (!hydrated || !watchIds) return;
    let cancelled = false;
    setBoardLoading(true);
    fetch(`/api/board?ids=${encodeURIComponent(watchIds)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || r.statusText);
        return json.rows as BoardRow[];
      })
      .then((rows) => {
        if (!cancelled) setBoard(rows);
      })
      .catch(() => {
        if (!cancelled) setBoard([]);
      })
      .finally(() => {
        if (!cancelled) setBoardLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [watchIds, hydrated]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (
        e.key === "/" ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")
      ) {
        e.preventDefault();
        setCatalogOpen(true);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= watchlist.length) {
        const item = watchlist[n - 1];
        setClusterId(item.id);
        saveActiveId(item.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [watchlist]);

  const loadingItem = watchlist.find((w) => w.id === clusterId);
  const loadingLabel = loadingItem?.symbol ?? clusterId.toUpperCase();

  const rows = desk?.main?.length ? desk.main : (desk?.wrappers ?? []);
  const selectedWrapper =
    rows.find((w) => wrapperKey(w) === selected) ??
    desk?.wrappers.find((w) => wrapperKey(w) === selected) ??
    rows.find((w) => w.symbol === selected) ??
    desk?.wrappers.find((w) => w.symbol === selected);
  const venues = selectedWrapper?.venues?.length
    ? selectedWrapper.venues
    : (desk?.ticket.venues ?? []);

  return (
    <div className="flex min-h-screen">
      <WatchRail
        watchlist={watchlist}
        clusterId={clusterId}
        onCluster={(id) => {
          setClusterId(id);
          saveActiveId(id);
        }}
        onUnpin={unpin}
        onSearch={() => setCatalogOpen(true)}
      />

      <div className="relative min-w-0 flex-1">
        {loading && <LoadingPop symbol={loadingLabel} first={!desk} />}
        <Header
          watchlist={watchlist}
          clusterId={clusterId}
          onCluster={(id) => {
            setClusterId(id);
            saveActiveId(id);
          }}
          onUnpin={unpin}
          onSearch={() => setCatalogOpen(true)}
          live={desk?.source === "live"}
          at={desk?.generatedAt}
          loading={loading}
          unit={unit}
          onUnit={changeUnit}
          copied={copied}
          onShare={shareDesk}
        />

        <CatalogModal
          open={catalogOpen}
          onClose={() => setCatalogOpen(false)}
          watchlist={watchlist}
          activeId={clusterId}
          onOpen={openItem}
          onPin={pinHit}
          onUnpin={unpin}
        />

        <main className="mx-auto max-w-[1280px] px-4 pb-16 pt-5 sm:px-6">
          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}
          {desk?.source === "seed-fallback" && (
            <div className="mb-4 rounded-xl border border-gold-400/25 bg-gold-400/10 px-4 py-3 text-sm text-gold-400">
              {desk.warnings[0] ?? "Waiting on a live CoinMarketCap key."}
            </div>
          )}
          {desk?.source === "fixture" && (
            <div className="mb-4 rounded-xl border border-gold-400/25 bg-gold-400/10 px-4 py-3 text-sm text-gold-400">
              Fixture desk — canned Gold so the ticket is visible without a CMC
              key. Add CMC_API_KEY for live quotes.
            </div>
          )}
          {frozen && (
            <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
              Snapshot {formatClock(frozen.at)} · {frozen.call}
              {frozen.buy ? ` · trade ${frozen.buy}` : ""}
              {frozen.avoid ? ` / skip ${frozen.avoid}` : ""}
              {frozen.bps != null ? ` · ${frozen.bps.toFixed(1)} bps` : ""}
              {frozen.fv != null ? ` · fair $${frozen.fv.toFixed(2)}` : ""}
              {frozen.trap ? ` · trap ${frozen.trap}` : ""}. Live desk below may
              have moved.
            </div>
          )}

          {loading && !desk ? (
            <SkeletonDash />
          ) : desk ? (
            <>
              <DecisionHero
                desk={desk}
                unit={unit}
                notional={notional}
                onNotional={changeNotional}
              />
              <div className="mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
                <div className="xl:col-span-5">
                  <WhyPanel desk={desk} />
                </div>
                <div className="xl:col-span-7">
                  <BasisHistory
                    spread={desk.spread}
                    unit={unit}
                    fairUsd={desk.fairValueUsd}
                  />
                </div>
              </div>
              <StructurePanel desk={desk} />
              <WatchBoard
                rows={board}
                loading={boardLoading}
                activeId={clusterId}
                unit={unit}
                notional={notional}
                fairFallback={desk.fairValueUsd}
                onOpen={(id) => {
                  setClusterId(id);
                  saveActiveId(id);
                }}
              />

              <div className="mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
                <section className="card overflow-hidden xl:col-span-8">
                  <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 sm:px-5">
                    <div>
                      <h2 className="text-sm font-medium text-white">
                        Tradeable wrappers
                      </h2>
                      <p className="mt-0.5 text-xs text-white/40">
                        vs fair in {unit === "usd" ? "dollars" : unit === "pct" ? "percent" : "bps"} · extra on a $
                        {notional.toLocaleString()} buy
                      </p>
                    </div>
                  </div>
                  <WrapperTable
                    desk={desk}
                    rows={rows}
                    selected={selected}
                    onSelect={setSelected}
                    unit={unit}
                    notional={notional}
                  />
                  {desk.dust?.length > 0 && (
                    <div className="border-t border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => setDustOpen((v) => !v)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left text-xs text-white/45 hover:text-white/70 sm:px-5"
                      >
                        <span>
                          Illiquid / dust · {desk.dust.length} names you cannot
                          exit
                        </span>
                        <span className="font-mono">{dustOpen ? "−" : "+"}</span>
                      </button>
                      {dustOpen && (
                        <WrapperTable
                          desk={desk}
                          rows={desk.dust}
                          selected={selected}
                          onSelect={setSelected}
                          unit={unit}
                          notional={notional}
                          muted
                        />
                      )}
                    </div>
                  )}
                </section>

                <aside className="flex flex-col gap-4 xl:col-span-4">
                  <VenueCard
                    symbol={
                      selectedWrapper
                        ? wrapperLabel(selectedWrapper, desk.wrappers)
                        : desk.ticket.buySymbol
                    }
                    venues={venues}
                  />
                  <UnderlyingCard info={desk.underlying} />
                  <IssuerCard issuer={desk.issuer} />
                  <TradfiCard markets={desk.tradfiMarkets} />
                  <GuideCard unit={unit} assetUnit={desk.cluster.unit} />
                </aside>
              </div>
              <PipelinePanel desk={desk} />
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function LoadingPop({
  symbol,
  first,
}: {
  symbol: string;
  first: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0d10]/70 backdrop-blur-sm xl:left-56"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-white/10 bg-[#11141a] px-6 py-7 text-center shadow-2xl">
        <div className="flex justify-center">
          <LogoMark className="h-10 w-10" />
        </div>
        <div className="mx-auto mt-5 spinner" />
        <p className="mt-5 text-sm font-medium text-white">
          Loading {symbol}
        </p>
        <p className="mt-2 text-xs leading-5 text-white/45">
          {first
            ? "Fetching wrappers, venues, and the ticket from CoinMarketCap."
            : "Updating the desk for this ticker. The last view stays underneath."}
        </p>
      </div>
    </div>
  );
}

function WatchRail({
  watchlist,
  clusterId,
  onCluster,
  onUnpin,
  onSearch,
}: {
  watchlist: WatchItem[];
  clusterId: string;
  onCluster: (id: string) => void;
  onUnpin: (id: string) => void;
  onSearch: () => void;
}) {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-white/[0.06] bg-[#0e1014] xl:flex">
      <div className="px-4 py-4">
        <Link href="/" className="block">
          <LogoWordmark />
        </Link>
        <button
          type="button"
          onClick={onSearch}
          className="mt-4 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs text-white/50 hover:border-white/20 hover:text-white"
        >
          Add asset
          <span className="float-right font-mono text-[10px] text-white/25">
            /
          </span>
        </button>
        <p className="mt-2 text-[11px] leading-4 text-white/30">
          Press / and type AAPL — tradfi ticker, not AAPLX.
        </p>
      </div>
      <p className="px-4 pb-2 text-[10px] uppercase tracking-[0.16em] text-white/30">
        Watchlist
      </p>
      <nav className="flex-1 overflow-y-auto px-2 pb-6">
        {watchlist.map((item, i) => {
          const active = item.id === clusterId;
          return (
            <div
              key={item.id}
              className={`group mb-0.5 flex items-center rounded-lg ${
                active ? "bg-white/[0.07]" : "hover:bg-white/[0.03]"
              }`}
            >
              <button
                type="button"
                onClick={() => onCluster(item.id)}
                className="min-w-0 flex-1 px-2.5 py-2 text-left"
              >
                <p className={`font-mono text-sm ${active ? "text-white" : "text-white/70"}`}>
                  {item.symbol}
                </p>
                <p className="truncate text-[11px] text-white/35">{item.name}</p>
              </button>
              <span className="pr-1 font-mono text-[10px] text-white/20">{i + 1}</span>
              {watchlist.length > 1 && (
                <button
                  type="button"
                  onClick={() => onUnpin(item.id)}
                  className="hidden px-2 text-white/25 hover:text-rose-300 group-hover:block"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function Header({
  watchlist,
  clusterId,
  onCluster,
  onUnpin,
  onSearch,
  live,
  at,
  loading,
  unit,
  onUnit,
  copied,
  onShare,
}: {
  watchlist: WatchItem[];
  clusterId: string;
  onCluster: (id: string) => void;
  onUnpin: (id: string) => void;
  onSearch: () => void;
  live: boolean;
  at?: string;
  loading: boolean;
  unit: DisplayUnit;
  onUnit: (u: DisplayUnit) => void;
  copied: boolean;
  onShare: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0b0d10]/80 backdrop-blur-md">
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3 xl:hidden">
          <Link href="/" className="flex items-center gap-3">
            <LogoMark className="h-8 w-8" />
            <div>
              <p className="text-sm font-semibold text-white">Basis Desk</p>
              <div className="flex items-center gap-1.5 text-[11px] text-white/40">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${live ? "live-dot bg-emerald-400" : "bg-white/25"}`}
                />
                {loading ? "Refreshing…" : live ? "Live CMC" : "Offline"}
              </div>
            </div>
          </Link>
        </div>
        <div className="hidden items-center gap-2 text-[11px] text-white/40 xl:flex">
          <span
            className={`h-1.5 w-1.5 rounded-full ${live ? "live-dot bg-emerald-400" : "bg-white/25"}`}
          />
          {loading ? "Refreshing…" : live ? "Live CMC" : "Offline"}
          {at && (
            <span className="font-mono">
              · {new Date(at).toUTCString().replace(" GMT", " UTC")}
            </span>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onSearch}
            className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 xl:hidden"
          >
            Search
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full border border-white/[0.08] bg-white/[0.03] p-1 xl:hidden">
            {watchlist.map((c) => {
              const active = c.id === clusterId;
              return (
                <span
                  key={c.id}
                  className={`flex shrink-0 items-center rounded-full ${
                    active ? "bg-white text-[#0b0d10]" : "text-white/55"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onCluster(c.id)}
                    className="whitespace-nowrap px-3 py-1.5 text-xs"
                  >
                    {c.symbol}
                  </button>
                  {watchlist.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onUnpin(c.id)}
                      className="pr-2 text-[10px]"
                    >
                      ×
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onShare}
            title="Copy a link to this desk"
            className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:border-white/25 hover:text-white"
          >
            {copied ? "Copied" : "Share"}
          </button>
          <UnitToggle unit={unit} onUnit={onUnit} />
        </div>
      </div>
    </header>
  );
}

function UnitToggle({
  unit,
  onUnit,
}: {
  unit: DisplayUnit;
  onUnit: (u: DisplayUnit) => void;
}) {
  const opts: { id: DisplayUnit; label: string }[] = [
    { id: "usd", label: "$" },
    { id: "pct", label: "%" },
    { id: "bps", label: "bps" },
  ];
  return (
    <div className="flex shrink-0 rounded-full border border-white/10 p-0.5">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onUnit(o.id)}
          title={
            o.id === "usd"
              ? "Dollars per unit"
              : o.id === "pct"
                ? "Percent"
                : "Basis points (0.01%)"
          }
          className={`rounded-full px-2.5 py-1 font-mono text-xs ${
            unit === o.id ? "bg-white text-[#0b0d10]" : "text-white/45 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function attentionScore(row: BoardRow): number {
  const gap = Math.abs(row.spreadBps ?? 0);
  if (row.action === "skip") return 400 + gap;
  if (row.action === "buy") return 250 + gap;
  if (row.action === "wait") return 80 + gap;
  return gap;
}

function WatchBoard({
  rows,
  loading,
  activeId,
  unit,
  notional,
  fairFallback,
  onOpen,
}: {
  rows: BoardRow[];
  loading: boolean;
  activeId: string;
  unit: DisplayUnit;
  notional: number;
  fairFallback: number | null;
  onOpen: (id: string) => void;
}) {
  const [sort, setSort] = useState<"attention" | "gap" | "size">("attention");
  const ranked = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sort === "gap")
        return Math.abs(b.spreadBps ?? 0) - Math.abs(a.spreadBps ?? 0);
      if (sort === "size") {
        const ae = a.spreadBps != null ? Math.abs(extraOnNotional(a.spreadBps, notional)) : 0;
        const be = b.spreadBps != null ? Math.abs(extraOnNotional(b.spreadBps, notional)) : 0;
        return be - ae;
      }
      return attentionScore(b) - attentionScore(a);
    });
    return copy;
  }, [rows, sort, notional]);
  const maxGap = Math.max(...ranked.map((r) => Math.abs(r.spreadBps ?? 0)), 1);

  return (
    <section className="card mt-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-medium text-white">Leaderboard</h2>
          <p className="mt-0.5 text-xs text-white/40">
            Ranked by who needs a look first. Click a row to open the desk.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="text-[11px] text-white/35">Updating…</span>
          )}
          <div className="flex rounded-full border border-white/10 p-0.5">
            {(
              [
                ["attention", "Attention"],
                ["gap", "Gap"],
                ["size", `On $${notional / 1000}k`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSort(id)}
                className={`rounded-full px-2.5 py-1 text-[11px] ${
                  sort === id
                    ? "bg-white text-[#0b0d10]"
                    : "text-white/45 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-[10px] uppercase tracking-[0.14em] text-white/35">
            <tr>
              <th className="w-12 px-4 py-2.5 font-medium sm:px-5">#</th>
              <th className="px-3 py-2.5 font-medium">Asset</th>
              <th className="px-3 py-2.5 font-medium">Call</th>
              <th className="px-3 py-2.5 font-medium text-right">Gap</th>
              <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Scale</th>
              <th className="px-3 py-2.5 font-medium text-right">
                On ${notional >= 1000 ? `${notional / 1000}k` : notional}
              </th>
              <th className="px-3 py-2.5 font-medium">Trade</th>
              <th className="px-4 py-2.5 font-medium sm:px-5">Venue</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row, i) => {
              const extra =
                row.spreadBps != null
                  ? extraOnNotional(Math.abs(row.spreadBps), notional)
                  : null;
              const active = row.id === activeId;
              const call =
                row.action === "skip"
                  ? "Skip trap"
                  : row.action === "buy"
                    ? "Buy gap"
                    : row.action === "wait"
                      ? "No trade"
                      : "One wrapper";
              const width = Math.max(
                8,
                (Math.abs(row.spreadBps ?? 0) / maxGap) * 100,
              );
              return (
                <tr
                  key={row.id}
                  onClick={() => onOpen(row.id)}
                  className={`cursor-pointer border-t border-white/[0.04] hover:bg-white/[0.03] ${
                    active ? "bg-white/[0.05]" : ""
                  } ${i === 0 ? "border-l-2 border-l-gold-400" : ""}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-white/40 sm:px-5">
                    {i === 0 ? (
                      <span className="text-gold-400">01</span>
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-mono text-white">{row.symbol}</p>
                    <p className="text-xs text-white/35">{row.name}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[11px] ${
                        row.action === "skip"
                          ? "bg-rose-500/15 text-rose-300"
                          : row.action === "buy"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-white/10 text-white/55"
                      }`}
                    >
                      {call}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono num text-white/80">
                    {formatDelta(
                      row.spreadBps,
                      unit,
                      row.fairValueUsd ?? fairFallback,
                    )}
                  </td>
                  <td className="hidden px-3 py-3 sm:table-cell">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={`h-full rounded-full ${
                          row.action === "skip"
                            ? "bg-rose-400"
                            : row.action === "buy"
                              ? "bg-emerald-400"
                              : "bg-gold-400/80"
                        }`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono num text-white/60">
                    {extra == null ? "—" : `$${extra.toFixed(0)}`}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-white/70">
                    {row.buySymbol ?? "—"}
                    {row.avoidSymbol ? (
                      <span className="text-white/35"> / skip {row.avoidSymbol}</span>
                    ) : null}
                    {row.trapSymbol && row.trapSymbol !== row.avoidSymbol ? (
                      <span className="block text-[10px] text-rose-300/80">
                        trap {row.trapSymbol}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-white/55 sm:px-5">
                    {row.venue
                      ? `${row.venue.exchange} ${row.venue.pair}`
                      : "—"}
                  </td>
                </tr>
              );
            })}
            {!ranked.length && (
              <tr>
                <td className="px-4 py-6 text-sm text-white/40 sm:px-5" colSpan={8}>
                  {loading
                    ? "Loading leaderboard…"
                    : "Pin names from search to fill this board."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}


function WrapperTable({
  desk,
  rows,
  selected,
  onSelect,
  unit,
  notional,
  muted = false,
}: {
  desk: DeskSnapshot;
  rows: Wrapper[];
  selected: string | null;
  onSelect: (symbol: string) => void;
  unit: DisplayUnit;
  notional: number;
  muted?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-[10px] uppercase tracking-[0.14em] text-white/35">
          <tr>
            <th className="px-4 py-2.5 font-medium sm:px-5">Token</th>
            <th className="px-3 py-2.5 font-medium">Issuer</th>
            <th className="px-3 py-2.5 font-medium text-right">Price</th>
            <th className="px-3 py-2.5 font-medium text-right">
              vs fair ({unit === "usd" ? "$" : unit === "pct" ? "%" : "bps"})
            </th>
            <th className="px-3 py-2.5 font-medium text-right">
              On ${notional >= 1000 ? `${notional / 1000}k` : notional}
            </th>
            <th className="px-3 py-2.5 font-medium text-right">24h vol</th>
            <th className="px-4 py-2.5 font-medium text-right sm:px-5">Grade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => {
            const noisy = Math.abs(w.basisBps ?? 0) < 15;
            const cheap = !noisy && (w.basisBps ?? 0) < -5;
            const rich = !noisy && (w.basisBps ?? 0) > 5;
            const isSel = wrapperKey(w) === selected || w.symbol === selected;
            const isBuy =
              desk.ticket.buyCryptoId != null
                ? w.cryptoId === desk.ticket.buyCryptoId
                : w.symbol === desk.ticket.buySymbol;
            const isSkip =
              desk.ticket.avoidCryptoId != null
                ? w.cryptoId === desk.ticket.avoidCryptoId
                : w.symbol === desk.ticket.avoidSymbol;
            const isTrap =
              desk.ticket.trap != null &&
              (desk.ticket.trap.cryptoId != null
                ? w.cryptoId === desk.ticket.trap.cryptoId
                : w.symbol === desk.ticket.trap.symbol);
            const extra =
              w.basisBps != null ? extraOnNotional(w.basisBps, notional) : null;
            return (
              <tr
                key={`${w.cryptoId}-${w.symbol}`}
                onClick={() => onSelect(wrapperKey(w))}
                className={`cursor-pointer border-t border-white/[0.04] transition ${
                  isSel
                    ? "bg-white/[0.05]"
                    : isBuy
                      ? "bg-emerald-500/[0.04]"
                      : isSkip
                        ? "bg-rose-500/[0.04]"
                        : "hover:bg-white/[0.03]"
                } ${muted ? "opacity-70" : ""}`}
              >
                <td className="px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">
                      {wrapperLabel(w, desk.wrappers)}
                    </span>
                    {isBuy && (
                      <span
                        title="Best wrapper you can actually trade"
                        className="rounded bg-emerald-500/15 px-1.5 py-px text-[9px] uppercase tracking-wider text-emerald-300"
                      >
                        trade
                      </span>
                    )}
                    {isSkip && !isTrap && (
                      <span className="rounded bg-rose-500/15 px-1.5 py-px text-[9px] uppercase tracking-wider text-rose-300">
                        skip
                      </span>
                    )}
                    {isTrap && (
                      <span className="rounded bg-rose-500/15 px-1.5 py-px text-[9px] uppercase tracking-wider text-rose-300">
                        trap
                      </span>
                    )}
                  </div>
                  {w.slug ? (
                    <a
                      href={cmcCurrencyUrl(w.slug)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Open on CoinMarketCap"
                      className="text-xs text-white/35 hover:text-gold-400 hover:underline"
                    >
                      {w.name}
                    </a>
                  ) : (
                    <div className="text-xs text-white/35">{w.name}</div>
                  )}
                </td>
                <td className="px-3 py-3 text-white/60">{w.issuerName || "—"}</td>
                <td className="px-3 py-3 text-right font-mono num text-white">
                  {w.normalizedUsd != null
                    ? `$${w.normalizedUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                    : "—"}
                </td>
                <td
                  className={`px-3 py-3 text-right font-mono num ${
                    cheap ? "text-emerald-300" : rich ? "text-rose-300" : "text-white/55"
                  }`}
                >
                  {formatDelta(w.basisBps, unit, desk.fairValueUsd)}
                </td>
                <td
                  className={`px-3 py-3 text-right font-mono num ${
                    noisy
                      ? "text-white/45"
                      : extra != null && extra > 1
                        ? "text-rose-300"
                        : extra != null && extra < -1
                          ? "text-emerald-300"
                          : "text-white/45"
                  }`}
                >
                  {extra == null
                    ? "—"
                    : extra > 0
                      ? `+$${extra.toFixed(0)}`
                      : extra < 0
                        ? `−$${Math.abs(extra).toFixed(0)}`
                        : "$0"}
                </td>
                <td className="px-3 py-3 text-right font-mono num text-white/75">
                  ${formatUsd(w.volume24h)}
                </td>
                <td className="px-4 py-3 text-right sm:px-5">
                  <Grade grade={w.tradability} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Grade({ grade }: { grade: string }) {
  const color =
    grade === "A" || grade === "B"
      ? "text-emerald-300 bg-emerald-500/10"
      : grade === "C"
        ? "text-gold-400 bg-gold-400/10"
        : "text-rose-300 bg-rose-500/10";
  return (
    <span className={`inline-block rounded-md px-1.5 py-0.5 font-mono text-[11px] ${color}`}>
      {grade}
    </span>
  );
}

function VenueCard({
  symbol,
  venues,
}: {
  symbol: string | null | undefined;
  venues: Venue[];
}) {
  const max = Math.max(...venues.map((v) => v.volume24h), 1);
  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-white">Where to trade {symbol ?? ""}</h2>
      <p className="mt-1 text-xs text-white/40">Spot prints. Click a wrapper to retarget.</p>
      {venues.length === 0 ? (
        <p className="mt-6 text-sm text-white/40">No spot venues on this name.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {venues.map((v) => (
            <li key={`${v.exchange}-${v.pair}`}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-white">
                  {v.recommended && (
                    <span className="mr-2 text-[10px] uppercase tracking-wider text-gold-400">
                      print
                    </span>
                  )}
                  {v.exchange}
                  <span className="ml-2 text-xs text-white/35">{v.pair}</span>
                </span>
                <span className="font-mono text-xs text-white/55 num">
                  ${formatUsd(v.volume24h)}
                </span>
              </div>
              {(v.marketScore != null || v.depthUsd != null || v.lastUpdated) && (
                <p className="mt-0.5 text-[10px] text-white/30">
                  {v.marketScore != null ? `score ${v.marketScore.toFixed(1)}` : ""}
                  {v.depthUsd != null
                    ? `${v.marketScore != null ? " · " : ""}±2% $${formatUsd(v.depthUsd)}`
                    : ""}
                  {v.lastUpdated
                    ? `${v.marketScore != null || v.depthUsd != null ? " · " : ""}${formatClock(v.lastUpdated)}`
                    : ""}
                </p>
              )}
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`h-full rounded-full ${v.recommended ? "bg-gold-400" : "bg-white/25"}`}
                  style={{ width: `${Math.max(6, (v.volume24h / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UnderlyingCard({ info }: { info: UnderlyingInfo | null }) {
  if (!info) return null;
  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-white">Underlying</h2>
      <p className="mt-1 font-mono text-sm text-white/80">
        {info.symbol}
        <span className="ml-2 text-xs text-white/40">{info.assetType}</span>
      </p>
      <p className="mt-1 text-xs text-white/50">{info.name}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-white/45">
        {info.primaryExchange && (
          <>
            <dt>Exchange</dt>
            <dd className="text-right text-white/70">{info.primaryExchange}</dd>
          </>
        )}
        {info.industry && (
          <>
            <dt>Industry</dt>
            <dd className="text-right text-white/70">{info.industry}</dd>
          </>
        )}
        {info.cik && (
          <>
            <dt>CIK</dt>
            <dd className="text-right font-mono">
              <a
                href={edgarCompanyUrl(info.cik)}
                target="_blank"
                rel="noreferrer"
                title="Open SEC EDGAR filings"
                className="text-gold-400 hover:underline"
              >
                {info.cik}
              </a>
            </dd>
          </>
        )}
        {info.employees != null && (
          <>
            <dt>Employees</dt>
            <dd className="text-right font-mono text-white/70">
              {info.employees.toLocaleString()}
            </dd>
          </>
        )}
        {info.tokenizedMcap != null && info.tokenizedMcap > 0 && (
          <>
            <dt>Tokenized cap</dt>
            <dd className="text-right font-mono text-white/70">
              ${formatUsd(info.tokenizedMcap)}
            </dd>
          </>
        )}
      </dl>
      {info.about && (
        <p className="mt-3 text-xs leading-5 text-white/45">{info.about}</p>
      )}
      {(info.website || info.cik) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {info.website && (
            <a
              href={info.website}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-gold-400 hover:underline"
            >
              {info.website.replace(/^https?:\/\//, "")}
            </a>
          )}
          {info.cik && (
            <a
              href={edgarCompanyUrl(info.cik)}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-gold-400 hover:underline"
            >
              SEC EDGAR filings
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function GuideCard({ unit, assetUnit }: { unit: DisplayUnit; assetUnit: string }) {
  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-white">How to read this</h2>
      <ul className="mt-3 space-y-2 text-xs leading-5 text-white/50">
        <li>
          <span className="text-white/80">$</span> — extra dollars per {assetUnit}.{" "}
          {unit === "usd" ? "You are here." : "Switch the $/%/bps toggle."}
        </li>
        <li>
          <span className="text-white/80">%</span> — same gap as a percent. 0.10% cheaper
          is a small deal; 1% is not.
        </li>
        <li>
          <span className="text-white/80">bps</span> — trader shorthand. 100 bps = 1%. 10
          bps = 0.10%.
        </li>
        <li>
          <span className="text-white/80">On $10k</span> — what that gap costs if you
          actually spend that much.
        </li>
      </ul>
    </section>
  );
}

function IssuerCard({ issuer }: { issuer: IssuerProfile | null }) {
  if (!issuer) return null;
  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-white">Issuer</h2>
      <p className="mt-1 text-sm text-white/80">{issuer.name}</p>
      <p className="mt-1 font-mono text-[11px] text-white/40">
        {issuer.numTokens} token{issuer.numTokens === 1 ? "" : "s"} on CMC
      </p>
      {issuer.tokens.length > 0 && (
        <p className="mt-2 text-xs leading-5 text-white/55">
          {issuer.tokens.map((t) => t.symbol).join(" · ")}
        </p>
      )}
      {issuer.website && (
        <a
          href={issuer.website}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-[11px] text-gold-400 hover:underline"
        >
          {issuer.website.replace(/^https?:\/\//, "")}
        </a>
      )}
    </section>
  );
}

function TradfiCard({ markets }: { markets: TradfiMarket[] }) {
  if (!markets.length) return null;
  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-white">TradFi print</h2>
      <p className="mt-1 text-xs text-white/40">
        CMC tradfi markets — not a NAV. Shown only when the API fills it.
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {markets.map((m) => {
          const label = `${m.exchange}${m.ticker ? ` ${m.ticker}` : ""}`;
          const inner = (
            <span className="text-white/80 hover:text-gold-400">{label}</span>
          );
          return (
            <li key={`${m.exchange}-${m.ticker}-${m.url ?? ""}`}>
              {m.url ? (
                <a href={m.url} target="_blank" rel="noreferrer">
                  {inner}
                </a>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}


function SkeletonDash() {
  return (
    <div className="space-y-4">
      <div className="card skeleton h-72" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="card skeleton h-64 xl:col-span-5" />
        <div className="card skeleton h-64 xl:col-span-7" />
      </div>
      <div className="card skeleton h-48" />
    </div>
  );
}
