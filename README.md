# Basis Desk

Hackathon project for **Build with CMC: API Hackathon** (DoraHacks, Sep 2026).  
Track: **Real World Assets**.

Find the cheapest liquid way to own the same real-world asset.

Same underlying. Different wrappers. Different liquidity. Basis Desk compares tokenized representations of one RWA, filters out untradeable size, measures wrapper basis, and prints an execution-aware ticket: trade, skip, or wait.

This is not a clone of [coinmarketcap.com/real-world-assets](https://coinmarketcap.com/real-world-assets/). CMC lists tokens. The desk **clusters by underlying**, **normalizes units**, **prices the wrapper spread**, and prints a **ticket**.

## What a user gets

You want gold (or NVDA, or SPY) on-chain. CMC shows three gold tokens as three products. In the market it is one ounce of gold at three prices. If you buy the rich, illiquid wrapper you pay extra and cannot exit.

The ticket is the product: **buy this / skip that / wait, the gap is normal**.

## Run

```bash
cp .env.example .env.local
# paste the Startup-tier key from the hackathon signup
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the landing page, then **Open the desk**. Direct app: [http://localhost:3000/desk](http://localhost:3000/desk).

```bash
npm test
npm run build
```

Do not put `CMC_API_KEY` in client code or git.

Without a key, `/desk?asset=GOLD` still loads a **fixture** Gold ticket so judges can read the product. Other tickers need the Startup key.

Share copies a frozen print (`at`, `call`, `buy`, `bps`, `fv`) in the URL so a tweet can reopen the same ticket, not only the live refetch.

## Deploy (Vercel)

```bash
npx vercel --prod
```

Set **one** server env var in the Vercel project (not `NEXT_PUBLIC_`):

```
CMC_API_KEY=<your Startup-tier key>
```

Redeploy after the env is set so live quotes work.

## Hackathon submit

Track: **Real World Assets**  
DoraHacks: https://dorahacks.io/hackathon/coinmarketcap-api-202609

1. Public GitHub repo (this project).
2. Live demo URL (Vercel landing + `/desk`).
3. ~90s screen recording: Gold ticket → skip illiquid → TRADE wrapper → Binance print → `$/%/bps` → search `AAPL`.
4. X post: DoraHacks link + demo + video + `#BuildwithCMC`.
5. BUIDL: named CMC endpoints (see below) + API-feedback note (see below).

## Read the numbers

The header toggle is **$ / % / bps**. New users should leave **$** on.

- **$** — extra dollars per ounce or share (and “on a $10k buy”).
- **%** — same gap as a percent (0.10% = small).
- **bps** — trader shorthand. 100 bps = 1%.

Position size chips ($1k / $10k / $100k) scale the “what this costs me” column.

## Watchlist (not 5 coins)

CMC tracks ~8,000 RWAs. The desk does **not** dump them in the header.

- Default watchlist: Gold, SPY, NVIDIA, Tesla, Circle (saved in the browser).
- **Search** (`/` or Ctrl/Cmd+K) looks up a tradfi ticker (`AAPL`, not `AAPLX`). Filter **Stocks / ETFs / Commodities / Treasuries**. Multi-wrapper names sort first.
- Each desk has an **Underlying** card from `GET /v5/real-world-assets/info` (industry, CIK, exchange, about).
- **Pin** keeps it in the header. **Remove** with ×. Click a row in search to open that desk.
- A name with one wrapper still opens, but the ticket will say there is nothing to compare.

The **watchlist board** on the home desk is the scan: every pinned name, the call, gap in $, extra on your size, wrapper to trade, and venue. Click a row to open the full desk.

## Demo path (90 seconds)

1. Open **Gold**. Tradeable board is XAUt / PAXG (and any other name above the volume floor).
2. A **trap** banner flags the cheap illiquid wrapper (VNXAU / XAUM in the dust drawer). The ticket itself is the liquid book — usually **no trade** if XAUt and PAXG are tight.
3. **Where to trade** lists spot venues from `market-pairs/list` — the **print** is the CEX with real volume.
4. 30-day chart: fade only if today is a range extreme; otherwise the ticket stays **no trade**.
5. Switch to **S&P 500 (SPY)** and **NVIDIA**.
6. Footer lists the live endpoints that actually ran.

Speak in dollars: “same ounce, this one is $36 more and has 1/400th the volume.” Do not lead with “8 bps.”

## How it works

1. Curated underlyings: Gold, SPY, NVIDIA, Tesla, Circle.
2. `GET /v5/real-world-assets/map` + `quotes/latest` for those symbols.
3. Expand `tokens[]` (issuer + `crypto_id`).
4. Batch `GET /v3/cryptocurrency/quotes/latest` for live price/volume.
5. `GET /v5/real-world-assets/market-pairs/list` for venue count.
6. Fair value = volume-weighted mid of wrappers above a volume floor (thin names do not pull the peg).
7. Ticket from the **full liquid book** (cheapest vs richest above the floor). A thin cheap name is a trap warning, not the whole call.
8. 30-day spread = `crypto_id` → `GET /v2/cryptocurrency/ohlcv/historical` (RWA has no history endpoint).

Gram-denominated gold (CGO and similar) is scaled to **USD per troy ounce**.

## Endpoints used

| Endpoint | Why |
|---|---|
| `GET /v5/real-world-assets/map` | Resolve GOLD / NVDA / SPY to `rwa_id` (0 credits) |
| `GET /v5/real-world-assets/quotes/latest` | Asset quotes + `tokens[]` with issuer |
| `GET /v5/real-world-assets/market-pairs/list` | How many venues you can actually exit on |
| `GET /v5/real-world-assets/info` | Underlying card: CIK → EDGAR, industry, about |
| `GET /v5/real-world-assets/issuers` | Issuer card: site, token roster, `num_tokens` |
| `GET /v3/cryptocurrency/quotes/latest` | Per-wrapper price, volume, market cap, slug |
| `GET /v2/cryptocurrency/ohlcv/historical` | Wrapper spread history (RWA has no timeseries yet) |

## API feedback (for CMC)

- **No underlying NAV.** There is no LBMA / NYSE print on the RWA family, so basis is wrapper vs wrapper, not vs the real asset.
- **No RWA history.** Spread charts have to join `crypto_id` into crypto OHLCV.
- **Units are inconsistent.** Some gold tokens are per ounce, some per gram. A naive price sort is wrong.
- **One underlying is many `rwa_id`s.** Gold is not always one `tokens[]` array. Clustering by ticker family is required for the product to exist.
- `quotes/latest` `data` is sometimes `rwa_assets`, sometimes `assets`. Parsers have to accept both.

## Rules of the road

- Public repo, live demo, this README.
- X post: DoraHacks link + demo + `#BuildwithCMC`.
- One track: **Real World Assets**.
- No keys in git.

Not financial advice. Not an execution venue.
