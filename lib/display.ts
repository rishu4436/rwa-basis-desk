export type DisplayUnit = "usd" | "pct" | "bps";

export const UNIT_LABEL: Record<DisplayUnit, string> = {
  usd: "$",
  pct: "%",
  bps: "bps",
};

/** 100 bps = 1%. */
export function bpsToPct(bps: number): number {
  return bps / 100;
}

export function bpsToUsd(bps: number, fairUsd: number): number {
  return (bps / 10_000) * fairUsd;
}

/** Extra dollars if you spend `notional` on this wrapper vs fair (or vs cheap). */
export function extraOnNotional(bps: number, notional: number): number {
  return (bps / 10_000) * notional;
}

export function formatSignedUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const body =
    abs >= 1000
      ? abs.toLocaleString("en-US", { maximumFractionDigits: 0 })
      : abs >= 1
        ? abs.toFixed(2)
        : abs.toFixed(4);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${body}`;
}

export function formatSignedPct(bps: number): string {
  if (!Number.isFinite(bps)) return "—";
  const pct = bpsToPct(bps);
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

export function formatSignedBps(bps: number): string {
  if (!Number.isFinite(bps)) return "—";
  const sign = bps > 0 ? "+" : bps < 0 ? "−" : "";
  return `${sign}${Math.abs(bps).toFixed(1)} bps`;
}

export function formatDelta(
  bps: number | null,
  unit: DisplayUnit,
  fairUsd: number | null,
): string {
  if (bps == null || !Number.isFinite(bps)) return "—";
  if (unit === "pct") return formatSignedPct(bps);
  if (unit === "bps") return formatSignedBps(bps);
  if (fairUsd == null || !Number.isFinite(fairUsd)) return formatSignedPct(bps);
  return formatSignedUsd(bpsToUsd(bps, fairUsd));
}

export function unitHint(unit: DisplayUnit, assetUnit: string): string {
  if (unit === "usd") return `extra $ per ${assetUnit}`;
  if (unit === "pct") return "percent cheaper / richer";
  return "basis points (0.01%)";
}

export const NOTIONAL_PRESETS = [1_000, 10_000, 100_000] as const;

/** Always en-US so 100000 is $100,000, not a locale grouping like 1,00,000. */
export function formatNotional(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatSizeLabel(n: number): string {
  if (n >= 1000 && n % 1000 === 0) return `$${n / 1000}k`;
  return formatNotional(n);
}

export function nextNotional(current: number): number {
  const idx = NOTIONAL_PRESETS.findIndex((n) => n === current);
  return NOTIONAL_PRESETS[(idx + 1) % NOTIONAL_PRESETS.length] ?? NOTIONAL_PRESETS[0];
}

/** Dollar impact of a size. Keeps cents below $100 so a 1 bp gap does not render as $0. */
export function formatPlainUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 0 : 2;
  return `$${abs.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}
