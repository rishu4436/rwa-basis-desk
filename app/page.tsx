import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LogoMark } from "@/components/logo";

const GITHUB = "https://github.com/rishu4436/rwa-basis-desk";
const HACKATHON = "https://dorahacks.io/hackathon/coinmarketcap-api-202609";
const DESK = "/desk?asset=GOLD";

export const metadata: Metadata = {
  title: {
    absolute: "Basis Desk — Same asset. Different wrappers. One desk call.",
  },
  description:
    "Basis Desk compares tokenized representations of the same real-world asset, filters liquidity traps, measures wrapper basis, checks historical context, and produces a desk-level call.",
  openGraph: {
    title: "Basis Desk — Same asset. Different wrappers. One desk call.",
    description:
      "CMC tells you what tokenized wrappers exist. Basis Desk tells you which wrapper is actually interesting.",
  },
  twitter: {
    title: "Basis Desk — Same asset. Different wrappers. One desk call.",
    description:
      "CMC tells you what tokenized wrappers exist. Basis Desk tells you which wrapper is actually interesting.",
  },
};

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E3B341]";

const endpoints = [
  "/v5/real-world-assets/map",
  "/v5/real-world-assets/quotes/latest",
  "/v5/real-world-assets/info",
  "/v5/real-world-assets/issuers",
  "/v3/cryptocurrency/quotes/latest",
  "/v2/cryptocurrency/ohlcv/historical",
];

const pipeline = [
  ["01", "Resolve", "rwa_id"],
  ["02", "Discover", "tokens + issuers"],
  ["03", "Normalize", "$/share or $/oz"],
  ["04", "Filter", "liquidity + depth"],
  ["05", "Compare", "basis"],
  ["06", "Check", "30d range"],
  ["07", "Call", "Trade / Wait / Skip"],
] as const;

const trace = [
  ["CGO looks cheapest", "The raw sort stops here."],
  ["Volume is only $7K/day", "Below the liquidity floor."],
  ["Liquidity trap", "Cheap is not tradeable."],
  ["PAXG vs XAUt", "The liquid book, only."],
  ["21.4 bps", "Gross wrapper basis."],
  ["96th percentile", "Against 30 daily closes."],
] as const;

export default function Landing() {
  return (
    <div className="land-root min-h-screen bg-[#080A0D] text-[#F1EEE6]">
      <style>{`
        .land-root { overflow-x: hidden; }
        .land-root img { max-width: 100%; height: auto; }
      `}</style>
      <a
        href="#main"
        className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-[#E3B341] focus:px-3 focus:py-2 focus:text-sm focus:text-[#080A0D] ${focus}`}
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#080A0D]/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 min-w-0 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className={`flex items-center gap-2 ${focus} rounded-md`}>
            <LogoMark className="h-7 w-7" />
            <span className="text-sm font-semibold tracking-tight">Basis Desk</span>
          </Link>
          <nav aria-label="Page" className="hidden items-center gap-5 text-[13px] text-[#858B96] md:flex">
            <a href="#product" className={`hover:text-[#F1EEE6] ${focus} rounded-sm`}>
              Product
            </a>
            <a href="#how" className={`hover:text-[#F1EEE6] ${focus} rounded-sm`}>
              How it works
            </a>
            <a href="#cmc" className={`hover:text-[#F1EEE6] ${focus} rounded-sm`}>
              CMC API
            </a>
            <a href={GITHUB} className={`hover:text-[#F1EEE6] ${focus} rounded-sm`}>
              GitHub
            </a>
          </nav>
          <Link
            href={DESK}
            className={`shrink-0 rounded-full bg-[#F1EEE6] px-3.5 py-1.5 text-[13px] font-medium text-[#080A0D] hover:bg-[#E3B341] ${focus}`}
          >
            Open the desk
          </Link>
        </div>
        <nav
          aria-label="Page sections"
          className="flex gap-4 overflow-x-auto border-t border-white/[0.04] px-4 py-2 text-[12px] text-[#858B96] md:hidden"
        >
          <a href="#product" className={`shrink-0 ${focus} rounded-sm`}>
            Product
          </a>
          <a href="#how" className={`shrink-0 ${focus} rounded-sm`}>
            How it works
          </a>
          <a href="#cmc" className={`shrink-0 ${focus} rounded-sm`}>
            CMC API
          </a>
          <a href={GITHUB} className={`shrink-0 ${focus} rounded-sm`}>
            GitHub
          </a>
        </nav>
      </header>

      <main id="main">
        <section className="mx-auto grid min-w-0 max-w-6xl items-center gap-10 px-4 pb-14 pt-12 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:pt-16">
          <div className="min-w-0">
            <p className="max-w-full font-mono text-[11px] uppercase leading-5 tracking-[0.14em] text-[#E3B341] sm:tracking-[0.18em]">
              CMC RWA data · Real-world asset relative value
            </p>
            <h1 className="mt-4 max-w-xl text-[2rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl">
              Same asset. Different wrappers. One desk call.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#858B96] sm:text-[17px]">
              Basis Desk finds the liquid on-chain wrapper with the better relative
              price, then shows the liquidity, historical basis, and market context
              behind the call.
            </p>
            <p className="mt-4 max-w-xl border-l border-[#E3B341]/50 pl-3 text-sm leading-6 text-[#F1EEE6]/80">
              CMC tells you what tokenized wrappers exist. Basis Desk tells you
              which wrapper is actually interesting.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={DESK}
                className={`rounded-full bg-[#E3B341] px-5 py-2.5 text-sm font-medium text-[#080A0D] hover:bg-[#E3B341]/90 ${focus}`}
              >
                Open the live desk
              </Link>
              <a
                href={GITHUB}
                className={`rounded-full border border-white/15 px-5 py-2.5 text-sm text-[#F1EEE6]/80 hover:border-white/30 hover:text-[#F1EEE6] ${focus}`}
              >
                View GitHub
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-[11px] uppercase tracking-[0.14em] text-[#858B96]">
              <li>Powered by CoinMarketCap RWA API</li>
              <li className="text-white/20" aria-hidden>
                ·
              </li>
              <li>RWA-native</li>
              <li className="text-white/20" aria-hidden>
                ·
              </li>
              <li>No wallet required</li>
            </ul>
          </div>

          <aside
            aria-label="Example Gold desk call"
            className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#101319] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-5"
          >
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#E3B341]">
                Gold
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#858B96]">
                Example book
              </p>
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-[0.16em] text-[#858B96]">
              Liquid reference
            </p>
            <p className="num mt-1 font-mono text-3xl tracking-tight sm:text-4xl">
              $4,182.41
              <span className="ml-2 text-sm text-[#858B96]">/ oz</span>
            </p>
            <div className="mt-4 rounded-xl border border-[#E3B341]/25 bg-[#E3B341]/[0.06] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#858B96]">
                Desk call
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold text-[#43D17A]">
                Prefer PAXG
              </p>
            </div>
            <dl className="mt-4 space-y-1.5 font-mono text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt>PAXG</dt>
                <dd className="num shrink-0 text-[#43D17A]">$4,176.82</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-[#858B96]">
                <dt>XAUt</dt>
                <dd className="num shrink-0">$4,185.77</dd>
              </div>
            </dl>
            <p className="num mt-3 font-mono text-sm text-[#F1EEE6]">
              +21.4 bps
              <span className="ml-3 text-[#858B96]">+$8.95 / oz</span>
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-3 text-[11px]">
              <div>
                <p className="uppercase tracking-[0.14em] text-[#858B96]">30d basis</p>
                <p className="num mt-1 font-mono text-[#F1EEE6]">96th percentile</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.14em] text-[#858B96]">Liquidity</p>
                <p className="num mt-1 font-mono">
                  XAUt <span className="text-[#858B96]">$17B</span>
                </p>
                <p className="num font-mono">
                  PAXG <span className="text-[#858B96]">$280M</span>
                </p>
              </div>
            </div>
          </aside>
        </section>

        <section aria-label="CMC data model" className="border-y border-white/[0.06] bg-[#101319]">
          <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {[
                ["RWA map", "Underlying identity"],
                ["6 asset types", "Stock through real estate"],
                ["rwa_id", "Stable CMC key"],
                ["issuer → token", "Who wrapped it"],
                ["CMC API", "Quotes and history"],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="font-mono text-sm text-[#F1EEE6]">{k}</dt>
                  <dd className="mt-0.5 text-[11px] text-[#858B96]">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[11px] text-[#858B96]">
              Built on CoinMarketCap&apos;s RWA data model. Six documented types:
              stock, ETF, commodity, currency, government security, real estate.
            </p>
          </div>
        </section>

        <section id="product" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            The ticker is not the trade.
          </h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <article className="rounded-2xl border border-white/[0.08] bg-[#101319] p-5">
              <h3 className="text-[11px] uppercase tracking-[0.16em] text-[#E3B341]">
                Same underlying
              </h3>
              <ul className="mt-4 flex flex-wrap gap-2 font-mono text-sm">
                {["GOLD", "XAUt", "PAXG", "XAUM", "CGO"].map((s) => (
                  <li key={s} className="rounded-md border border-white/10 px-2 py-1">
                    {s}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-6 text-[#858B96]">
                Multiple tokens can represent the same underlying asset.
              </p>
            </article>
            <article className="rounded-2xl border border-white/[0.08] bg-[#101319] p-5">
              <h3 className="text-[11px] uppercase tracking-[0.16em] text-[#E3B341]">
                Different price
              </h3>
              <ul className="num mt-4 space-y-1 font-mono text-sm">
                {["$4,176", "$4,185", "$4,302", "$4,110"].map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-6 text-[#858B96]">
                The lowest token price is not automatically the best trade.
              </p>
            </article>
            <article className="rounded-2xl border border-white/[0.08] bg-[#101319] p-5">
              <h3 className="text-[11px] uppercase tracking-[0.16em] text-[#E3B341]">
                Different liquidity
              </h3>
              <ul className="num mt-4 space-y-1 font-mono text-sm">
                <li>$17B</li>
                <li>$280M</li>
                <li className="text-[#E3B341]">$447K</li>
                <li className="text-[#F06B78]">$7K</li>
              </ul>
              <p className="mt-4 text-sm leading-6 text-[#858B96]">
                A cheap wrapper can simply be an illiquid wrapper.
              </p>
            </article>
          </div>
        </section>

        <section id="how" className="border-y border-white/[0.06] bg-[#101319]/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              From CMC data to a desk call
            </h2>
            <ol className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
              {pipeline.map(([n, title, note], i) => (
                <li
                  key={n}
                  className="group relative min-w-0 rounded-xl border border-white/[0.08] bg-[#080A0D] p-3 transition hover:border-[#E3B341]/50"
                >
                  <p className="font-mono text-[10px] text-[#E3B341]">{n}</p>
                  <p className="mt-2 text-sm font-medium">{title}</p>
                  <p className="mt-1 font-mono text-[11px] text-[#858B96]">{note}</p>
                  {i < pipeline.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute -right-2 top-1/2 hidden h-px w-3 bg-white/20 group-hover:bg-[#E3B341] lg:block"
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              See the desk think.
            </h2>
            <p className="max-w-sm text-sm text-[#858B96]">
              Numbers are the evidence. The ticket is the product.
            </p>
          </div>
          <div className="mt-8 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <figure className="min-w-0">
              <div className="relative min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101319]">
                <Image
                  src="/desk-desktop.png"
                  alt="Basis Desk desktop: Gold liquid reference, XAUM liquidity trap, basis history, and a wait call"
                  width={1440}
                  height={980}
                  sizes="(min-width: 1024px) 900px, 100vw"
                  className="hidden h-auto w-full max-w-full sm:block"
                  priority
                />
                <Image
                  src="/desk-mobile.png"
                  alt="Basis Desk on a phone: Gold reference, wait call, and XAUM marked thin"
                  width={390}
                  height={844}
                  sizes="100vw"
                  className="mx-auto h-auto w-full max-w-sm sm:hidden"
                  priority
                />
                <ul className="pointer-events-none absolute inset-0 hidden sm:block">
                  {[
                    ["1", "Liquid reference", "left-[22%] top-[14%]"],
                    ["2", "Liquidity trap", "left-[48%] top-[28%]"],
                    ["4", "Desk call", "right-[7%] top-[16%]"],
                    ["3", "Basis history", "right-[10%] top-[60%]"],
                    ["5", "Execution context", "left-[20%] top-[58%]"],
                  ].map(([n, label, pos]) => (
                    <li
                      key={n}
                      className={`absolute ${pos} flex items-center gap-1.5 rounded-full border border-white/15 bg-[#080A0D]/85 px-2 py-1 text-[10px] uppercase tracking-[0.12em]`}
                    >
                      <span className="font-mono text-[#E3B341]">{n}</span>
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
              <figcaption className="mt-3 text-xs text-[#858B96]">
                Desktop Gold book. The phone frame is the same desk.
              </figcaption>
              <ol className="mt-3 grid grid-cols-1 gap-1 text-[12px] text-[#858B96] sm:hidden">
                {[
                  "Liquid reference",
                  "Liquidity trap",
                  "Basis history",
                  "Desk call",
                  "Execution context",
                ].map((label, i) => (
                  <li key={label}>
                    <span className="font-mono text-[#E3B341]">{i + 1}. </span>
                    {label}
                  </li>
                ))}
              </ol>
            </figure>
            <figure className="hidden min-w-0 lg:block">
              <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101319]">
                <Image
                  src="/desk-mobile.png"
                  alt="Mobile Basis Desk for Gold"
                  width={390}
                  height={844}
                  sizes="220px"
                  className="h-auto w-full max-w-full"
                />
              </div>
            </figure>
          </div>
          <figure className="mt-4 min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101319]">
            <Image
              src="/desk-spy.png"
              alt="Basis Desk comparing two SPY wrappers, SPYB and SPYon, with a wait call"
              width={1440}
              height={980}
              sizes="(min-width: 1024px) 1100px, 100vw"
              className="h-auto w-full max-w-full"
            />
            <figcaption className="px-4 py-3 text-xs text-[#858B96]">
              Same desk, equity wrappers. SPY is one underlying and more than one ticker.
            </figcaption>
          </figure>
        </section>

        <section className="border-y border-white/[0.06] bg-[#101319]">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                One asset. One complete decision.
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#858B96]">
                Illustrative Gold book. The live desk recomputes this from CMC.
              </p>
              <ul className="mt-6 divide-y divide-white/[0.06] font-mono text-sm">
                {[
                  ["PAXG", "$4,176.82", "text-[#43D17A]"],
                  ["XAUt", "$4,185.77", "text-[#F1EEE6]"],
                  ["XAUM", "$4,302.10", "text-[#E3B341]"],
                  ["CGO", "$4,110.40", "text-[#F06B78]"],
                ].map(([sym, px, tone]) => (
                  <li key={sym} className="flex items-baseline justify-between py-2">
                    <span>{sym}</span>
                    <span className={`num ${tone}`}>{px}</span>
                  </li>
                ))}
              </ul>
            </div>
            <ol className="rounded-2xl border border-white/[0.08] bg-[#080A0D] p-4 sm:p-5">
              {trace.map(([title, note], i) => (
                <li key={title} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#E3B341]" />
                    {i < trace.length - 1 && (
                      <span className="w-px flex-1 bg-white/10" aria-hidden />
                    )}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm text-[#F1EEE6]">{title}</p>
                    <p className="text-[12px] text-[#858B96]">{note}</p>
                  </div>
                </li>
              ))}
              <li className="mt-1 rounded-xl border border-[#E3B341]/30 bg-[#E3B341]/10 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#858B96]">
                  Desk call
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold text-[#E3B341]">Wait</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Why Basis Desk
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              [
                "Wrapper-relative pricing",
                "Compare tokenized representations of the same RWA instead of unrelated tokens.",
              ],
              [
                "Liquidity-aware",
                "A cheap wrapper below the liquidity floor is treated as a trap, not automatically as an opportunity.",
              ],
              [
                "Historical context",
                "A wide spread is not enough. Basis Desk checks whether today's gap is unusual relative to recent history.",
              ],
              [
                "CMC-native",
                "RWA mapping, quotes, issuers, metadata and crypto history come directly from CoinMarketCap.",
              ],
            ].map(([title, body]) => (
              <article key={title} className="rounded-2xl border border-white/[0.08] bg-[#101319] p-5">
                <h3 className="text-sm font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#858B96]">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="cmc" className="border-y border-white/[0.06] bg-[#101319]/70">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Powered by the CMC RWA stack
            </h2>
            <ul className="mt-6 flex flex-wrap gap-2">
              {endpoints.map((path) => (
                <li
                  key={path}
                  className="max-w-full break-all rounded-full border border-white/10 bg-[#080A0D] px-3 py-1 font-mono text-[11px] text-[#F1EEE6]/80"
                >
                  {path}
                </li>
              ))}
            </ul>
            <ol className="mt-8 grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {[
                "RWA map",
                "rwa_id",
                "RWA quotes",
                "tokens[]",
                "crypto_id",
                "Price + volume",
                "History",
                "Desk call",
              ].map((step, i) => (
                <li key={step} className="flex items-center gap-2 sm:block">
                  <span className="font-mono text-[10px] text-[#E3B341]">0{i + 1}</span>
                  <span className="text-sm">{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-6 max-w-xl text-sm leading-6 text-[#858B96]">
              Basis Desk is built around CMC&apos;s RWA identifier and token
              relationship model.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Know what the number means.
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              ["Reference", "Liquid-wrapper reference price, not intrinsic NAV."],
              ["History", "Historical comparison uses daily crypto OHLCV closes."],
              ["Execution", "Venue and depth data are market evidence, not guaranteed fills."],
            ].map(([k, v]) => (
              <div key={k}>
                <h3 className="text-[11px] uppercase tracking-[0.16em] text-[#858B96]">{k}</h3>
                <p className="mt-2 text-sm leading-6 text-[#F1EEE6]/85">{v}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="rounded-2xl border border-white/[0.08] bg-[#101319] px-5 py-8 sm:px-8">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Stop comparing tickers. Start comparing wrappers.
            </h2>
            <p className="mt-3 max-w-md text-sm text-[#858B96]">
              Open Basis Desk and see what the market actually gives you.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={DESK}
                className={`rounded-full bg-[#F1EEE6] px-5 py-2.5 text-sm font-medium text-[#080A0D] hover:bg-[#E3B341] ${focus}`}
              >
                Launch Basis Desk
              </Link>
              <a
                href={GITHUB}
                className={`rounded-full border border-white/15 px-5 py-2.5 text-sm text-[#F1EEE6]/80 hover:border-white/30 hover:text-[#F1EEE6] ${focus}`}
              >
                View source code
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-sm font-medium">Basis Desk</p>
            <p className="mt-1 text-xs text-[#858B96]">
              Built for Build with CMC · Real World Assets
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-4 text-xs text-[#858B96]">
            <a href={GITHUB} className={`hover:text-[#F1EEE6] ${focus} rounded-sm`}>
              GitHub
            </a>
            <a href={HACKATHON} className={`hover:text-[#F1EEE6] ${focus} rounded-sm`}>
              Hackathon
            </a>
            <Link href={DESK} className={`hover:text-[#F1EEE6] ${focus} rounded-sm`}>
              Open Desk
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
