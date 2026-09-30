import type { Metadata } from "next";
import { JudgeShell } from "@/components/judge-shell";
import { DESK_POLICY } from "@/lib/basis";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How Basis Desk turns CMC RWA quotes into a Prefer, Skip, or Wait ticket.",
};

export default function MethodologyPage() {
  return (
    <JudgeShell
      title="Methodology"
      lede="The ticket is a gross wrapper basis against the liquid core. It is not a NAV, not arbitrage, and not a locked-in profit."
    >
      <section>
        <h2 className="text-base font-medium text-white">Eligibility, in order</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Presence — a wrapper needs a price and 24h volume, or it is listed as no market.</li>
          <li>Unit — gram gold is scaled to USD per troy ounce before any comparison.</li>
          <li>Accrual — Ondo total-return tokens sit beside the book. Dividends are inside the price, so they do not set Prefer or Skip.</li>
          <li>
            Core — dollar floor ($1M gold, $100k equities) and at least{" "}
            {Math.round(DESK_POLICY.leadVolumeShare * 100)}% of the lead wrapper&apos;s volume.
            At least {DESK_POLICY.minLiquidWrappers} core wrappers are required for a reference.
          </li>
          <li>Reference — volume-weighted price of the core. Blank unless two core wrappers exist.</li>
          <li>
            Extreme — a core wrapper is at least {DESK_POLICY.wideBasisBps} bps under that
            reference, and today&apos;s discount is at or above the{" "}
            {DESK_POLICY.extremePercentile}th percentile of the 30-day series.
          </li>
          <li>
            Fill — Prefer only when the recommended venue&apos;s ±2% ask book can take at
            least ${DESK_POLICY.minExecutableUsd.toLocaleString("en-US")} and the average
            fill is still {DESK_POLICY.wideBasisBps} bps under the reference. A missing book
            or a sample print stays Wait. The desk does not invent a size from 24h volume.
          </li>
          <li>
            Trap — the cheapest priced name outside the core is a warning, not the call.
            With a live ask book, that cheap price holds for a stated dollar size, then it
            is gone.
          </li>
        </ol>
      </section>
      <section>
        <h2 className="text-base font-medium text-white">Formulas</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-[13px] text-white/70">
          <li>basis bps = (price − liquid reference) / liquid reference × 10,000</li>
          <li>dollar gap = price − liquid reference, per ounce or share</li>
          <li>extra on a buy = |bps| / 10,000 × notional</li>
          <li>
            executable buy = ±2% ask depth × (discount bps − {DESK_POLICY.wideBasisBps}) / 100
          </li>
          <li>trap hold = ±2% ask depth × discount bps / 100</li>
          <li>benchmark bps = (liquid reference − Yahoo print) / Yahoo print × 10,000</li>
        </ul>
        <p className="mt-3">
          The Yahoo line is a labeled benchmark for equities and ETFs. It never enters the
          liquid reference or the Prefer rule. Commodities such as gold have no LBMA print
          on CMC, so the desk says so and stays wrapper versus wrapper.
        </p>
      </section>
      <section>
        <h2 className="text-base font-medium text-white">What Prefer means</h2>
        <p>
          Prefer names the cheapest core wrapper that clears the dollar floor, the lead-volume
          share, the {DESK_POLICY.wideBasisBps} bps discount, and the 30-day extreme, and whose
          recommended venue can take at least ${DESK_POLICY.minExecutableUsd.toLocaleString("en-US")}{" "}
          while the average fill stays{" "}
          {DESK_POLICY.wideBasisBps} bps under the reference. The ticket states that dollar
          size and the venue. Walking the full ±2% ask book costs 200 bps at the margin and
          100 bps on the average fill. Skip names a thin trap. When that trap has a live ask
          book, the ticket says how many dollars the cheap price holds before the discount
          is gone. Wait means the gap is inside the recent range, history is missing, the
          book is too tight, or the fill gives the discount back. A missing or sample book
          stays Wait.
        </p>
      </section>
    </JudgeShell>
  );
}
