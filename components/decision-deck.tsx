import { DESK_POLICY, formatUsd } from "@/lib/basis";
import {
  extraOnNotional,
  formatDelta,
  formatNotional,
  formatPlainUsd,
  formatSignedBps,
  formatSignedUsd,
  formatSizeLabel,
  NOTIONAL_PRESETS,
  type DisplayUnit,
} from "@/lib/display";
import {
  basisOpportunity,
  basisRead,
  deskCall,
  endpointHits,
  liquidityBars,
  pipelineSteps,
  shortUnit,
  structureColumns,
  structureCounts,
  whyLines,
} from "@/lib/narrative";
import type { DeskSnapshot, SpreadPoint, SpreadSeries } from "@/lib/types";

function money(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function signedDollar(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

const TONE = {
  buy: {
    box: "border-emerald-400/30 bg-emerald-500/[0.08]",
    verb: "text-emerald-300",
    bar: "bg-emerald-400",
  },
  skip: {
    box: "border-rose-400/30 bg-rose-500/[0.08]",
    verb: "text-rose-300",
    bar: "bg-rose-400",
  },
  wait: {
    box: "border-gold-400/30 bg-gold-400/[0.08]",
    verb: "text-gold-400",
    bar: "bg-gold-400",
  },
  "only-one": {
    box: "border-white/15 bg-white/[0.04]",
    verb: "text-white",
    bar: "bg-white/40",
  },
} as const;

export function DecisionHero({
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
  const call = deskCall(desk);
  const look = TONE[call.tone];
  const opp = basisOpportunity(desk);
  const bars = liquidityBars(desk);
  const symbol = (desk.cluster.rwaSymbols[0] ?? desk.cluster.label).toUpperCase();
  const unitName = shortUnit(desk.cluster.unit);
  const primary =
    opp == null
      ? "—"
      : unit === "usd"
        ? signedDollar(opp.dollar)
        : formatDelta(opp.bps, unit, desk.liquidReferenceUsd);
  const extra =
    opp != null ? extraOnNotional(Math.abs(opp.bps), notional) : null;

  return (
    <section className="card overflow-hidden border-gold-400/20 bg-gradient-to-br from-gold-400/[0.07] via-transparent to-transparent">
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-12">
          <p className="text-[11px] uppercase tracking-[0.22em] text-gold-400">
            {symbol}
            <span className="ml-3 text-white/35">
              {desk.source === "live"
                ? "Live book"
                : desk.source === "partial-live"
                  ? "Partial live"
                  : desk.source === "fixture"
                    ? "Fixture book"
                    : "Fallback book"}
            </span>
          </p>
          <p className="mt-2 font-mono text-4xl tracking-tight text-white num sm:text-5xl">
            {money(desk.liquidReferenceUsd)}
          </p>
          <p className="mt-1 text-xs text-white/40">
            {desk.liquidReferenceUsd == null
              ? desk.cluster.comparable
                ? "No stable liquid reference"
                : "Unit normalization unavailable for this RWA"
              : `Liquid reference · per ${desk.cluster.unit}`}
            {desk.averageTokenizedPrice != null
              ? ` · CMC average ${money(desk.averageTokenizedPrice)}`
              : ""}
          </p>
          <p className="mt-2 text-[11px] leading-5 text-white/35">
            Desk policy · wide ≥ {DESK_POLICY.wideBasisBps} bps · extreme ≥{" "}
            {DESK_POLICY.extremePercentile}th percentile of 30 daily closes · liquid
            reference needs {DESK_POLICY.minLiquidWrappers} wrappers · size cap{" "}
            {Math.round(DESK_POLICY.executionDepthHaircut * 100)}% of ±2% depth
          </p>
        </div>

        <div className="order-2 lg:order-none lg:col-span-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">
            Basis opportunity
          </p>
          <p className="mt-2 font-mono text-sm text-white/80">
            {opp ? `${opp.left} vs ${opp.right}` : "No liquid pair"}
          </p>
          <p className="mt-2 font-mono text-3xl tracking-tight text-white num">
            {primary}
          </p>
          <p className="mt-1 font-mono text-sm text-white/55 num">
            {opp
              ? unit === "bps"
                ? `${signedDollar(opp.dollar)} / ${unitName}`
                : `${formatSignedBps(opp.bps)} · per ${unitName}`
              : `per ${unitName}`}
          </p>
          {extra != null && (
            <p className="mt-3 font-mono text-2xl tracking-tight text-white num">
              {formatPlainUsd(extra)}
              <span className="ml-2 text-xs font-sans text-white/45">
                more on a {formatNotional(notional)} buy
              </span>
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
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
                {formatSizeLabel(n)}
              </button>
            ))}
          </div>
        </div>

        <div className="order-3 lg:order-none lg:col-span-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">
            Liquidity
          </p>
          <ul className="mt-3 space-y-2.5">
            {bars.map((bar) => (
              <li key={bar.key}>
                <div className="flex items-baseline justify-between gap-3 font-mono text-xs">
                  <span className={bar.thin ? "text-rose-300" : "text-white"}>
                    {bar.label}
                    {bar.thin && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-rose-300/80">
                        thin
                      </span>
                    )}
                  </span>
                  <span className="text-white/40">${formatUsd(bar.volume24h)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full ${bar.thin ? "bg-rose-400/80" : look.bar}`}
                    style={{ width: `${bar.widthPct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-white/30">Bar length is log volume.</p>
        </div>

        <div className={`order-1 rounded-2xl border p-4 lg:order-none lg:col-span-4 ${look.box}`}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">Desk call</p>
          <p className={`mt-2 font-mono text-3xl font-semibold tracking-tight sm:text-4xl ${look.verb}`}>
            {call.verb}
          </p>
          <p className="mt-3 text-sm leading-6 text-white/70">{call.detail}</p>
          <ExecutionNote desk={desk} notional={notional} />
        </div>
      </div>
    </section>
  );
}

function ExecutionNote({
  desk,
  notional,
}: {
  desk: DeskSnapshot;
  notional: number;
}) {
  const buy =
    desk.wrappers.find((w) =>
      desk.ticket.buyCryptoId != null
        ? w.cryptoId === desk.ticket.buyCryptoId
        : w.symbol === desk.ticket.buySymbol,
    ) ?? null;
  const depth = buy?.depthUsd ?? null;
  const safe = buy?.capacityUsd ?? null;
  const util = depth != null && depth > 0 ? (notional / depth) * 100 : null;
  const gated =
    desk.venueCoverage.status === "plan-gated" || desk.venueCoverage.status === "demo";
  return (
    <div className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-5 text-white/55">
      {safe != null && depth != null ? (
        <>
          <p className="font-mono text-sm text-white">
            Estimated executable size {formatPlainUsd(safe)}
          </p>
          <p>±2% depth {formatPlainUsd(depth)}</p>
          <p>
            Desk size cap: {Math.round(DESK_POLICY.executionDepthHaircut * 100)}% of
            displayed depth
            {util != null ? ` · this size uses ${util.toFixed(0)}% of depth` : ""}
          </p>
        </>
      ) : (
        <p>
          {gated
            ? "Venue depth is unavailable on the Startup plan. Executable size is not estimated from 24h volume."
            : "No ±2% depth on the preferred wrapper, so executable size stays blank."}
        </p>
      )}
      <p className="mt-1 text-white/35">Gross wrapper basis. Not a locked-in profit.</p>
    </div>
  );
}

export function WhyPanel({ desk }: { desk: DeskSnapshot }) {
  const lines = whyLines(desk);
  return (
    <section className="card h-full p-5 sm:p-6">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-white/35">
        {desk.ticket.action === "buy" ? "Why this preference?" : "Why this call?"}
      </h2>
      <ol className="mt-4 space-y-3">
        {lines.map((line) => (
          <li key={line} className="flex gap-3 text-sm leading-6 text-white/75">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
            <span>{line}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function BasisHistory({
  spread,
  unit,
  fairUsd,
}: {
  spread: SpreadSeries | null;
  unit: DisplayUnit;
  fairUsd: number | null;
}) {
  const read = basisRead(spread);
  const points = spread?.points.filter((p) => p.bps != null) ?? [];
  const signalTone =
    read.signal === "unusually wide"
      ? "text-rose-300 border-rose-500/30"
      : read.signal === "unusually tight"
        ? "text-emerald-300 border-emerald-500/30"
        : "text-white/55 border-white/10";
  return (
    <section className="card flex flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-white/35">
            Regime check · 30-day daily closes
          </h2>
          <p className="mt-2 font-mono text-sm text-white">{read.pair}</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${signalTone}`}>
          {read.signal}
        </span>
      </div>
      <div className="mt-4 flex-1">
        {points.length < 2 ? (
          <p className="text-sm text-white/40">Waiting on a 30-day pair.</p>
        ) : (
          <BasisChart points={points} unit={unit} fairUsd={fairUsd} />
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-4 sm:grid-cols-4">
        <Stat
          label="Last close"
          value={
            unit === "usd" && read.lastDollar != null
              ? formatSignedUsd(read.lastDollar)
              : formatDelta(read.current, unit, fairUsd)
          }
        />
        <Stat
          label="30d average"
          value={
            unit === "usd" && read.averageDollar != null
              ? formatSignedUsd(read.averageDollar)
              : formatDelta(read.average, unit, fairUsd)
          }
        />
        <Stat
          label="30d percentile"
          value={read.percentile == null ? "—" : ordinal(read.percentile)}
        />
        <Stat label="Signal" value={read.signal} />
      </dl>
      <p className="mt-3 text-[11px] leading-5 text-white/30">
        Regime check uses 30-day daily closes. The desk call uses the live quote.
        Dollar stats are the average of those historical gaps, not basis times
        today&apos;s reference. CoinMarketCap has no dedicated historical RWA series,
        so this joins each wrapper&apos;s crypto_id to /v2/cryptocurrency/ohlcv/historical.
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-white/35">{label}</dt>
      <dd className="mt-1 font-mono text-sm text-white num">{value}</dd>
    </div>
  );
}

function ordinal(n: number): string {
  const v = Math.round(n);
  const mod = v % 100;
  if (mod >= 11 && mod <= 13) return `${v}th`;
  switch (v % 10) {
    case 1:
      return `${v}st`;
    case 2:
      return `${v}nd`;
    case 3:
      return `${v}rd`;
    default:
      return `${v}th`;
  }
}

function pointValue(point: SpreadPoint, unit: DisplayUnit): number | null {
  if (unit === "usd") {
    if (point.avoidClose != null && point.buyClose != null) {
      return point.avoidClose - point.buyClose;
    }
    return null;
  }
  if (point.bps == null) return null;
  return unit === "pct" ? point.bps / 100 : point.bps;
}

function BasisChart({
  points,
  unit,
  fairUsd,
}: {
  points: SpreadPoint[];
  unit: DisplayUnit;
  fairUsd: number | null;
}) {
  const vals = points
    .map((point) => pointValue(point, unit))
    .filter((n): n is number => n != null);
  if (vals.length < 2) return null;
  const w = 720;
  const h = 220;
  const padL = 58;
  const padR = 12;
  const padY = 16;
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const span = max - min || 1;
  const yOf = (v: number) => padY + (1 - (v - min) / span) * (h - padY * 2);
  const xy = vals.map((v, i) => ({
    x: padL + (i / Math.max(vals.length - 1, 1)) * (w - padL - padR),
    y: yOf(v),
  }));
  const line = xy
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const last = xy[xy.length - 1];
  const zeroY = yOf(0);
  const avg = vals.reduce((sum, n) => sum + n, 0) / vals.length;
  const fmt = (n: number) => {
    const sign = n > 0 ? "+" : n < 0 ? "−" : "";
    const abs = Math.abs(n);
    if (unit === "usd") return `${sign}$${abs >= 10 ? abs.toFixed(0) : abs.toFixed(1)}`;
    if (unit === "pct") return `${sign}${abs.toFixed(2)}%`;
    return `${sign}${abs >= 20 ? abs.toFixed(0) : abs.toFixed(1)}`;
  };
  const candidates = [...new Set([max, avg, min, 0].map((n) => Number(n.toFixed(4))))].sort(
    (a, b) => b - a,
  );
  const ticks: number[] = [];
  for (const tick of candidates) {
    if (ticks.some((kept) => Math.abs(yOf(kept) - yOf(tick)) < 14)) continue;
    ticks.push(tick);
  }

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-48 w-full" role="img" aria-label="30-day basis">
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padL}
              x2={w - padR}
              y1={yOf(tick)}
              y2={yOf(tick)}
              stroke={tick === 0 ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.05)"}
              strokeDasharray={tick === 0 ? "0" : "3 4"}
            />
            <text
              x={padL - 8}
              y={yOf(tick) + 3}
              textAnchor="end"
              fill="rgba(255,255,255,0.35)"
              fontSize="11"
              fontFamily="ui-monospace, monospace"
            >
              {fmt(tick)}
            </text>
          </g>
        ))}
        <line
          x1={padL}
          x2={w - padR}
          y1={zeroY}
          y2={zeroY}
          stroke="rgba(255,255,255,0.18)"
        />
        <path d={line} fill="none" stroke="#e0b44a" strokeWidth="2.4" />
        <circle cx={last.x} cy={last.y} r="4" fill="#e0b44a" />
      </svg>
      <div className="mt-1 flex justify-between pl-12 font-mono text-[10px] uppercase tracking-[0.14em] text-white/30">
        <span>30d</span>
        <span>Last close · {formatDelta(points.at(-1)?.bps ?? null, unit, fairUsd)}</span>
      </div>
    </div>
  );
}

export function StructurePanel({ desk }: { desk: DeskSnapshot }) {
  const cols = structureColumns(desk);
  const counts = structureCounts(desk);
  const rows: { label: string; cell: (col: (typeof cols)[number]) => string }[] = [
    { label: "Issuer", cell: (col) => col.issuer },
    { label: "Underlying", cell: () => counts.underlying },
    { label: "Wrapper price", cell: (col) => money(col.price) },
    { label: "24h volume", cell: (col) => `$${formatUsd(col.volume24h)}` },
    { label: "Venues", cell: (col) => String(col.venues) },
    { label: "Liquidity", cell: (col) => col.liquidity },
  ];
  return (
    <section className="card mt-4 overflow-hidden">
      <div className="border-b border-white/[0.06] px-5 py-4">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-white/35">
          Token structure
        </h2>
        <p className="mt-1 text-xs text-white/40">
          Same underlying. Issuer, price, and whether you can exit.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.14em] text-white/35">
              <th className="px-5 py-2.5 font-medium" />
              {cols.map((col) => (
                <th key={col.key} className="px-3 py-2.5 font-mono text-xs font-medium text-white">
                  {col.symbol}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-white/[0.04]">
                <th className="px-5 py-2.5 text-xs font-medium text-white/40">{row.label}</th>
                {cols.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2.5 font-mono text-xs num ${
                      row.label === "Liquidity" && col.liquidity === "Thin"
                        ? "text-rose-300"
                        : row.label === "Liquidity" && col.liquidity === "High"
                          ? "text-emerald-300"
                          : "text-white/80"
                    }`}
                  >
                    {row.cell(col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid grid-cols-2 gap-3 border-t border-white/[0.06] px-5 py-4 text-xs sm:grid-cols-4">
        <Count label="Underlying" value={counts.underlying} />
        <Count label="Wrapper count" value={String(counts.wrappers)} />
        <Count label="Liquid wrappers" value={String(counts.liquid)} />
        <Count label="Thin wrappers" value={String(counts.thin)} />
      </dl>
      {desk.issuer && (
        <p className="border-t border-white/[0.06] px-5 py-3 text-[11px] leading-5 text-white/40">
          CMC issuer record for {desk.issuer.name}: {desk.issuer.numTokens} linked token
          {desk.issuer.numTokens === 1 ? "" : "s"}
          {desk.issuer.tokens.length
            ? ` (${desk.issuer.tokens
                .slice(0, 8)
                .map((token) => token.symbol)
                .join(" · ")})`
            : ""}
          .
        </p>
      )}
    </section>
  );
}

function Count({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-white/35">{label}</dt>
      <dd className="mt-1 font-mono text-white/80">{value}</dd>
    </div>
  );
}

export function PipelinePanel({ desk }: { desk: DeskSnapshot }) {
  const hits = endpointHits(desk.endpointsUsed);
  const liveCount = hits.filter((hit) => hit.live).length;
  const steps = pipelineSteps();
  return (
    <details open className="card mt-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-white/35">
            CMC data pipeline
          </span>
          <span className="mt-1 block text-xs text-white/45">
            {liveCount}/{hits.length} endpoints on this load
            {desk.source === "live"
              ? " · live"
              : desk.source === "partial-live"
                ? " · partial live"
                : desk.source === "fixture"
                  ? " · fixture"
                  : " · fallback"}
          </span>
        </span>
        <span className="font-mono text-[11px] text-white/30">toggle</span>
      </summary>
      <div className="border-t border-white/[0.06] px-5 py-4">
        <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {steps.map((step, i) => (
            <li key={step.label} className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1">
                <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-white/80">
                  {step.label}
                </span>
                <span className="block text-[10px] text-white/35">{step.note}</span>
              </span>
              {i < steps.length - 1 && (
                <span className="text-white/25" aria-hidden>
                  <span className="sm:hidden">↓</span>
                  <span className="hidden sm:inline">→</span>
                </span>
              )}
            </li>
          ))}
        </ol>
        <ul className="mt-5 grid gap-1.5 sm:grid-cols-2">
          {hits.map((hit) => (
            <li key={hit.path} className="flex items-center gap-2 font-mono text-[11px]">
              <span className={hit.live ? "text-emerald-300" : "text-white/25"}>
                {hit.live ? "✓" : "·"}
              </span>
              <span className={hit.live ? "text-white/70" : "text-white/30"}>{hit.path}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 font-mono text-[11px] text-white/35">
          CMC status {clock(desk.evidence.cmcTimestamp)} · quotes {clock(desk.evidence.lastUpdated)} · map{" "}
          {desk.evidence.rwaMapCount} · quotes {desk.evidence.rwaQuoteCount} · crypto{" "}
          {desk.evidence.cryptoQuoteCount} · pairs {desk.evidence.pairCount}
        </p>
      </div>
    </details>
  );
}

function clock(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}
