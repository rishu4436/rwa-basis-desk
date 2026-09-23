import Link from "next/link";
import { LogoMark } from "@/components/logo";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0b0d10]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <LogoMark />
            <span className="text-sm font-semibold text-white">Basis Desk</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <a
              href="https://github.com/rishu4436/rwa-basis-desk"
              className="hidden text-white/50 hover:text-white sm:inline"
            >
              GitHub
            </a>
            <Link
              href="/desk?asset=GOLD"
              className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-[#0b0d10] hover:bg-gold-400"
            >
              Open the desk
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <p className="text-[11px] uppercase tracking-[0.22em] text-gold-400">
            CoinMarketCap API · Real World Assets
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl sm:leading-[1.1]">
            Same gold. Three tokens. Three prices.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/55">
            Basis Desk tells you which tokenized wrapper to trade, where to
            trade it, and whether the gap is real — in dollars, percent, or
            bps. Built on the CoinMarketCap RWA API.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/desk?asset=GOLD"
              className="rounded-full bg-gold-400 px-5 py-2.5 text-sm font-medium text-[#0b0d10] hover:bg-gold-400/90"
            >
              Open the desk
            </Link>
            <a
              href="https://github.com/rishu4436/rwa-basis-desk"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/70 hover:border-white/30 hover:text-white"
            >
              View the repo
            </a>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                k: "The trap",
                t: "A thin gold token looks $50 cheaper per ounce. Volume is $4k a day. You cannot exit.",
              },
              {
                k: "The ticket",
                t: "Skip that wrapper. Trade XAUt. Print is a real CEX pair with size.",
              },
              {
                k: "The units",
                t: "New users stay on $. Traders can switch to % or bps. Same gap, three languages.",
              },
            ].map((card) => (
              <div key={card.k} className="card p-5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-gold-400">
                  {card.k}
                </p>
                <p className="mt-3 text-sm leading-6 text-white/60">{card.t}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
          <h2 className="text-xl font-semibold text-white">The desk</h2>
          <p className="mt-2 max-w-xl text-sm text-white/45">
            Trap warning, liquid-book ticket, venues, and the 30-day gap — Gold
            on the left, SPY on the right.
          </p>
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#11141a]">
            <img
              src="/desk-desktop.png"
              alt="Basis Desk showing the Gold ticket, wrapper board, and venues on desktop"
              className="hidden w-full sm:block"
            />
            <img
              src="/desk-mobile.png"
              alt="Basis Desk Gold ticket on a phone"
              className="w-full sm:hidden"
            />
          </div>
          <img
            src="/desk-spy.png"
            alt="Basis Desk SPY wrapper comparison"
            className="mt-4 hidden w-full rounded-2xl border border-white/[0.08] sm:block"
          />
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
          <h2 className="text-xl font-semibold text-white">How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                n: "01",
                t: "Pick an underlying",
                d: "Gold, NVDA, SPY — or search AAPL. We cluster every wrapper of the same real-world thing.",
              },
              {
                n: "02",
                t: "Read the ticket",
                d: "Trade / skip / wait, in dollars per unit and on a $10k buy. Illiquid names go in the dust drawer.",
              },
              {
                n: "03",
                t: "See where to trade",
                d: "Spot venues from CMC market pairs. Major CEX preferred when volume is close.",
              },
            ].map((s) => (
              <li key={s.n} className="card p-5">
                <p className="font-mono text-xs text-gold-400">{s.n}</p>
                <p className="mt-2 text-sm font-medium text-white">{s.t}</p>
                <p className="mt-2 text-sm leading-6 text-white/50">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
          <div className="card flex flex-col items-start justify-between gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Open the live desk
              </h2>
              <p className="mt-2 max-w-md text-sm text-white/50">
                Leaderboard of your watchlist, then the full Gold ticket.
                CoinMarketCap RWA data. No wallet. Not financial advice.
              </p>
            </div>
            <Link
              href="/desk?asset=GOLD"
              className="shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-[#0b0d10] hover:bg-gold-400"
            >
              Launch Basis Desk
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-white/35">
        Build with CMC · DoraHacks 2026 ·{" "}
        <a
          href="https://dorahacks.io/hackathon/coinmarketcap-api-202609"
          className="text-white/50 hover:text-white"
        >
          Hackathon
        </a>
      </footer>
    </div>
  );
}
