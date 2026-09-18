"use client";

import { useEffect, useMemo, useState } from "react";
import { CatalogModal, hitToWatch } from "@/components/catalog-modal";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { formatUsd } from "@/lib/basis";
import {
  extraOnNotional,
  formatDelta,
  NOTIONAL_PRESETS,
  type DisplayUnit,
} from "@/lib/display";
import {
  DEFAULT_WATCHLIST,
  loadActiveId,
  loadWatchlist,
  removeWatch,
  saveActiveId,
  saveWatchlist,
  upsertWatch,
} from "@/lib/watchlist";
import type {
  BoardRow,
  CatalogHit,
  DeskSnapshot,
  SpreadPoint,
  SpreadSeries,
  TicketAction,
  UnderlyingInfo,
  Venue,
  WatchItem,
  Wrapper,
} from "@/lib/types";

const UNIT_KEY = "basis-desk-unit-v1";
const SIZE_KEY = "basis-desk-notional-v1";

const ACTION: Record<
  TicketAction,
  { label: string; tone: string; chip: string }
> = {
  buy: {
    label: "Buy",
    tone: "from-emerald-500/15 to-transparent border-emerald-500/25",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  },
  skip: {
    label: "Skip trap",
    tone: "from-rose-500/15 to-transparent border-rose-500/25",
    chip: "bg-rose-500/15 text-rose-300 border-rose-500/25",
  },
  wait: {
    label: "No trade",
    tone: "from-white/5 to-transparent border-white/10",
    chip: "bg-white/[0.08] text-white/70 border-white/[0.12]",
  },
  "only-one": {
    label: "One wrapper",
    tone: "from-white/5 to-transparent border-white/10",
    chip: "bg-white/[0.08] text-white/70 border-white/[0.12]",
  },
};

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

  useEffect(() => {
    const list = loadWatchlist();
    setWatchlist(list);
    const active = loadActiveId();
    setClusterId(
      list.some((x) => x.id === active) ? active : list[0]?.id ?? "gold",
    );
    const savedUnit = localStorage.getItem(UNIT_KEY) as DisplayUnit | null;
    if (savedUnit === "usd" || savedUnit === "pct" || savedUnit === "bps") {
      setUnit(savedUnit);
    }
    const savedSize = Number(localStorage.getItem(SIZE_KEY));
    if (Number.isFinite(savedSize) && savedSize > 0) setNotional(savedSize);
    setHydrated(true);
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
        setSelected(next.ticket.buySymbol);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load desk");
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

          {loading && !desk ? (
            <SkeletonDash />
          ) : desk ? (
            <>
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
              <KpiRow
                desk={desk}
                unit={unit}
                notional={notional}
                onNotional={changeNotional}
              />

              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
                <TicketCard
                  desk={desk}
                  unit={unit}
                  notional={notional}
                  className="xl:col-span-7"
                />
                <SpreadCard
                  spread={desk.spread}
                  unit={unit}
                  className="xl:col-span-5"
                />
              </div>

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
                    symbol={selectedWrapper?.symbol ?? desk.ticket.buySymbol}
                    venues={venues}
                  />
                  <UnderlyingCard info={desk.underlying} />
                  <GuideCard unit={unit} assetUnit={desk.cluster.unit} />
                  <EvidenceCard desk={desk} />
                </aside>
              </div>
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
        <LogoWordmark />
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
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0b0d10]/80 backdrop-blur-md">
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3 xl:hidden">
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
    <section className="card mb-4 overflow-hidden">
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

function KpiRow({
  desk,
  unit,
  notional,
  onNotional,
}: {
  desk: DeskSnapshot;
  unit: DisplayUnit;
  notional: number;
  onNotional: (n: number) => void;
}) {
  const t = desk.ticket;
  const liquidBps = t.history?.lastBps ?? t.spreadBps;
  const trapBps = t.spreadBps;
  const extra =
    trapBps != null ? extraOnNotional(Math.abs(trapBps), notional) : null;
  const skip = t.action === "skip";
  const items = [
    {
      label: "Fair value",
      value:
        desk.fairValueUsd != null
          ? `$${desk.fairValueUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
          : "—",
      hint: `per ${desk.cluster.unit}`,
    },
    {
      label: "Liquid gap",
      value: formatDelta(liquidBps, unit, desk.fairValueUsd),
      hint:
        unit === "bps"
          ? "1% = 100 bps"
          : t.history
            ? `${t.history.leftSymbol} vs ${t.history.rightSymbol}`
            : "between liquid wrappers",
    },
    {
      label: t.action === "skip" ? "Trap extra" : "Gap",
      value: t.dollarGap != null ? `$${Math.abs(t.dollarGap).toFixed(2)}` : "—",
      hint: `per ${desk.cluster.unit}${t.avoidSymbol ? ` · ${t.avoidSymbol}` : ""}`,
      accent: t.action === "skip" ? "text-rose-300" : "",
    },
    {
      label: skip ? `Looks cheap on $${(notional / 1000).toFixed(0)}k` : `On $${(notional / 1000).toFixed(0)}k buy`,
      value: extra != null ? `$${extra.toFixed(0)}` : "—",
      hint: skip ? "discount you cannot exit" : "extra if you pick the rich wrapper",
      accent: extra && extra > 0 ? "text-rose-300" : "",
    },
  ];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.16em] text-white/35">
          Position size
        </span>
        {NOTIONAL_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onNotional(n)}
            className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${
              notional === n
                ? "border-white/30 bg-white/10 text-white"
                : "border-white/10 text-white/40 hover:text-white"
            }`}
          >
            ${n >= 1000 ? `${n / 1000}k` : n}
          </button>
        ))}
      </div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((k) => (
          <div key={k.label} className="card px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">
              {k.label}
            </p>
            <p
              className={`mt-2 font-mono text-xl tracking-tight num ${k.accent ?? "text-white"}`}
            >
              {k.value}
            </p>
            <p className="mt-1 text-[11px] text-white/35">{k.hint}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function TicketCard({
  desk,
  unit,
  notional,
  className = "",
}: {
  desk: DeskSnapshot;
  unit: DisplayUnit;
  notional: number;
  className?: string;
}) {
  const t = desk.ticket;
  const look = ACTION[t.action];
  const extra =
    t.spreadBps != null ? extraOnNotional(Math.abs(t.spreadBps), notional) : null;
  return (
    <section
      className={`card relative overflow-hidden bg-gradient-to-br ${look.tone} p-5 sm:p-6 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${look.chip}`}
        >
          {look.label}
        </span>
        <div className="flex gap-2 font-mono text-xs">
          {t.buySymbol && (
            <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
              trade {t.buySymbol}
            </span>
          )}
          {t.avoidSymbol && (
            <span className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-rose-300">
              skip {t.avoidSymbol}
            </span>
          )}
        </div>
      </div>
      <h2 className="mt-4 max-w-2xl text-2xl font-semibold leading-snug tracking-tight text-white sm:text-[28px]">
        {t.headline}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
        {t.detail.split(/(?<=\.)\s+/)[0]}
      </p>
      {t.dollarGap != null && (
        <p className="mt-4 font-mono text-2xl text-white num">
          {formatDelta(t.spreadBps, unit, desk.fairValueUsd)}
          <span className="ml-2 text-sm text-white/40">
            {unit === "usd"
              ? `per ${desk.cluster.unit}`
              : unit === "pct"
                ? "cheaper / richer"
                : "· 100 bps = 1%"}
          </span>
        </p>
      )}
      {extra != null && extra >= 1 && (
        <p className="mt-1 text-sm text-white/50">
          {t.action === "skip" ? (
            <>
              On ${notional.toLocaleString()} that looks like a{" "}
              <span className="text-rose-300">${extra.toFixed(0)}</span> discount
              — you probably cannot sell.
            </>
          ) : (
            <>
              On a ${notional.toLocaleString()} buy that is about{" "}
              <span className="text-rose-300">${extra.toFixed(0)}</span> extra.
            </>
          )}
        </p>
      )}
      {t.history && (
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-4 font-mono text-xs">
          <Mini
            label="Today"
            value={formatDelta(t.history.lastBps, unit, desk.fairValueUsd)}
          />
          <Mini
            label="30d range"
            value={`${formatDelta(t.history.minBps, unit, desk.fairValueUsd)} → ${formatDelta(t.history.maxBps, unit, desk.fairValueUsd)}`}
          />
          <Mini
            label="Unusual?"
            value={t.history.extreme ? "Yes — wide" : "No — typical"}
          />
        </div>
      )}
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-white/35">{label}</p>
      <p className="mt-1 text-white/80 num">{value}</p>
    </div>
  );
}

function SpreadCard({
  spread,
  unit,
  className = "",
}: {
  spread: SpreadSeries | null;
  unit: DisplayUnit;
  className?: string;
}) {
  const points = spread?.points.filter((p) => p.bps != null) ?? [];
  return (
    <section className={`card flex flex-col p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-white">30-day gap</h2>
          <p className="mt-0.5 font-mono text-[11px] text-white/40">
            {spread?.avoidSymbol && spread.buySymbol
              ? `${spread.avoidSymbol} − ${spread.buySymbol}`
              : "Need two liquid wrappers"}
          </p>
        </div>
        {spread?.summary && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] ${
              spread.summary.extreme
                ? "border-rose-500/30 text-rose-300"
                : "border-white/10 text-white/45"
            }`}
          >
            {spread.summary.extreme ? "Unusual" : "Typical"}
          </span>
        )}
      </div>
      <div className="mt-4 flex-1">
        {points.length < 2 ? (
          <p className="text-sm text-white/40">Waiting on history for a pair.</p>
        ) : (
          <SpreadChart points={points} unit={unit} />
        )}
      </div>
    </section>
  );
}

function pointValue(p: SpreadPoint, unit: DisplayUnit): number | null {
  if (unit === "usd") {
    if (p.avoidClose != null && p.buyClose != null) return p.avoidClose - p.buyClose;
    return null;
  }
  if (p.bps == null) return null;
  return unit === "pct" ? p.bps / 100 : p.bps;
}

function SpreadChart({
  points,
  unit,
}: {
  points: SpreadPoint[];
  unit: DisplayUnit;
}) {
  const vals = points
    .map((p) => pointValue(p, unit))
    .filter((n): n is number => n != null);
  if (vals.length < 2) return null;
  const w = 640;
  const h = 200;
  const padX = 8;
  const padY = 22;
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const span = max - min || 1;
  const xy = vals.map((v, i) => {
    const x = padX + (i / Math.max(vals.length - 1, 1)) * (w - padX * 2);
    const y = padY + (1 - (v - min) / span) * (h - padY * 2);
    return { x, y, v };
  });
  const line = xy
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const last = xy[xy.length - 1];
  const zeroY = padY + (1 - (0 - min) / span) * (h - padY * 2);
  const area = `${line} L${last.x.toFixed(1)},${zeroY.toFixed(1)} L${xy[0].x.toFixed(1)},${zeroY.toFixed(1)} Z`;
  const fmt = (n: number) =>
    unit === "usd"
      ? `$${n.toFixed(1)}`
      : unit === "pct"
        ? `${n.toFixed(2)}%`
        : n.toFixed(1);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full">
        <defs>
          <linearGradient id="spreadFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#e0b44a" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#e0b44a" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1={padX}
          x2={w - padX}
          y1={zeroY}
          y2={zeroY}
          stroke="rgba(255,255,255,0.12)"
          strokeDasharray="4 4"
        />
        <path d={area} fill="url(#spreadFill)" />
        <path d={line} fill="none" stroke="#e0b44a" strokeWidth="2" />
        <circle cx={last.x} cy={last.y} r="3.5" fill="#e0b44a" />
        <text x={padX} y={14} fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily="ui-monospace">
          {fmt(max)}
        </text>
        <text x={padX} y={h - 4} fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily="ui-monospace">
          {fmt(min)}
        </text>
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-white/30">
        <span>{points[0]?.date?.slice(5)}</span>
        <span>{points[points.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
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
            const isSel = w.symbol === selected;
            const isBuy = w.symbol === desk.ticket.buySymbol;
            const isSkip = w.symbol === desk.ticket.avoidSymbol;
            const extra =
              w.basisBps != null ? extraOnNotional(w.basisBps, notional) : null;
            return (
              <tr
                key={`${w.cryptoId}-${w.symbol}`}
                onClick={() => onSelect(w.symbol)}
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
                    <span className="font-medium text-white">{w.symbol}</span>
                    {isBuy && (
                      <span
                        title="Best wrapper you can actually trade"
                        className="rounded bg-emerald-500/15 px-1.5 py-px text-[9px] uppercase tracking-wider text-emerald-300"
                      >
                        trade
                      </span>
                    )}
                    {isSkip && (
                      <span className="rounded bg-rose-500/15 px-1.5 py-px text-[9px] uppercase tracking-wider text-rose-300">
                        skip
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/35">{w.name}</div>
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
            <dd className="text-right font-mono text-white/70">{info.cik}</dd>
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
      {info.website && (
        <a
          href={info.website}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-[11px] text-gold-400 hover:underline"
        >
          {info.website.replace(/^https?:\/\//, "")}
        </a>
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

function EvidenceCard({ desk }: { desk: DeskSnapshot }) {
  const endpoints = useMemo(
    () => [...new Set(desk.endpointsUsed)],
    [desk.endpointsUsed],
  );
  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-white">API evidence</h2>
      <p className="mt-1 font-mono text-[11px] text-white/40">
        map {desk.evidence.rwaMapCount} · quotes {desk.evidence.rwaQuoteCount} · crypto{" "}
        {desk.evidence.cryptoQuoteCount} · pairs {desk.evidence.pairCount}
      </p>
      <ul className="mt-3 space-y-1 font-mono text-[11px] text-white/40">
        {endpoints.map((e) => (
          <li key={e}>{e.replace("GET ", "")}</li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] leading-5 text-white/30">
        Wrapper vs wrapper, not vs NAV. Not investment advice.
      </p>
    </section>
  );
}

function SkeletonDash() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card skeleton h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="card skeleton h-56 xl:col-span-7" />
        <div className="card skeleton h-56 xl:col-span-5" />
      </div>
    </div>
  );
}
