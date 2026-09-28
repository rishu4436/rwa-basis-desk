import type { Metadata } from "next";
import { JudgeShell } from "@/components/judge-shell";
import { API_FRICTION } from "@/lib/mcp";

export const metadata: Metadata = {
  title: "API feedback",
  description: "Where the CoinMarketCap RWA API got in the way of Basis Desk.",
};

export default function FeedbackPage() {
  return (
    <JudgeShell
      title="API feedback"
      lede="What the RWA API made possible, and six places it got in the way. These are the frictions the live desk works around."
    >
      <section>
        <h2 className="text-base font-medium text-white">What it made possible</h2>
        <p>
          <span className="font-mono text-[13px]">quotes/latest</span> returns each wrapper
          with issuer and a price in one object. That is the whole product: cluster by
          underlying, normalize units, score a liquid core, print Prefer / Skip / Wait.
          Map resolves a tradfi ticker to <span className="font-mono">rwa_id</span>. Info
          supplies CIK for EDGAR. Issuers name who minted the token. Crypto quotes and
          OHLCV fill live volume and the 30-day series the RWA family does not have.
        </p>
      </section>
      <section>
        <h2 className="text-base font-medium text-white">Where it got in the way</h2>
        <ol className="mt-2 list-decimal space-y-3 pl-5">
          {API_FRICTION.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </section>
    </JudgeShell>
  );
}
