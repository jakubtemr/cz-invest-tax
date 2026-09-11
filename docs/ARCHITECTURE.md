# Architecture

A single-user local application: a portfolio tracker across two brokers plus a Czech investment-tax
module. No auth, no multi-tenancy, no cloud, no database server — it runs on `localhost` against
a SQLite file.

## Stack

React 19 + Vite on the front, Hono + oRPC on the back, Drizzle over SQLite, Zod at every
boundary, Vitest for tests. Node 22 or newer is required: `pragueDay` needs a full-ICU build to
resolve the Europe/Prague zone.

## Modules

```
src/
  shared/          date helpers used by both sides (Prague calendar days, year arithmetic)
  server/
    db/            Drizzle schema and client
    t212/          Trading 212 API client (read-only, Basic auth), Zod schemas, pure mappers
    sync/          sync service and the background runner that the UI polls
    manual/        manual Freedom24 entry, price updates, the corporate-action transfer tool
    portfolio/     read queries for the portfolio screen
    fx/            CNB daily rates with a database cache
    benchmark/     the S&P 500 comparison: shadow portfolio, XIRR, Yahoo price cache
    tax/           the tax module (below)
    router.ts      the oRPC router - the single HTTP boundary, Zod-validated input
  client/
    i18n/          plain dictionaries, Czech and English, no library
    screens/       portfolio/ and taxes/, one component per table or card group
    ui.tsx         shared presentation primitives
    table.tsx      client-side sorting and paging
    format.ts      one set of number and date formatters, locale-aware
```

### The tax module

```
constants.ts   per-year rates, limits, thresholds, treaty withholding rates
country.ts     ISO country from an ISIN prefix
fifo.ts        FIFO matching, the three-year time test, open lots
proceeds.ts    total proceeds and the amount measured against the 100k limit
sale-rows.ts   the per-lot breakdown, fee allocation, taxable split
dividends.ts   gross reconstruction, withholding, treaty caps, per-state buckets
credit.ts      the ordinary credit, per source state
computation.ts s. 16 rounding, the progressive scale, applying the credit
reconcile.ts   broker quantity versus history: splits, closures, unexplained shares
fx-lookup.ts   prefetching CNB rates by day so the math can stay synchronous
year-summary.ts assembles one year of pure summary from matched sales and dividends
csv.ts         RFC 4180 export of sales and dividends
rows.ts        one row -> domain mapping, shared by the tax overview and the transfer tool
tax-service.ts the orchestrator: loads, matches, prices, reconciles, computes, returns
warnings.ts    warning codes with parameters - the domain layer never writes a sentence
```

The tax rules themselves, the interpretations taken and the gaps are in [TAX.md](./TAX.md).

## Design rules

**Money never becomes a float.** SQLite has no exact decimal type, so amounts are stored as TEXT and
stay strings all the way through the domain layer; arithmetic goes through `decimal.js` and never
through SQL, and `Number()` appears only in the UI, for display or for sorting. A REAL column would
have turned every amount into a float at the storage layer, silently.

**One file, no server.** A single-user ledger of a few thousand rows has nothing to gain from a
database process, and every contributor gains a checkout that runs with `pnpm install && pnpm dev`.
The cost is that `better-sqlite3` is synchronous, so transaction callbacks are synchronous too.

**The pure core is synchronous.** Exchange rates are prefetched into a map before the math starts,
so `summarizeYear` and everything under it is a pure function of its inputs — which is what makes
the coverage gate on `src/server/tax/**` cheap to hold.

**Warnings are codes, not sentences.** The server returns `{ code, severity, params }` and the
client renders it through the dictionary. String formatting has no business in a tax calculation,
and this is what makes the interface translatable.

**One FIFO.** Both the tax overview and the corporate-action transfer tool call the same
`fifoMatch`. Two matching rules would eventually disagree, and the disagreement would be silent.

**The benchmark is a replay, not a chart.** Whether the portfolio beats the S&P 500 is answered
by replaying every deposit and withdrawal into the total-return index on the same day, at the CNB
rate of that day, and valuing the result on the day of the latest snapshot. Comparing index returns
over a fixed window would punish or reward the timing of deposits the investor never chose against
the index; the shadow portfolio faces exactly the same cash on exactly the same days. Both sides
also get a money-weighted annual return (XIRR). Daily closes come from Yahoo's chart endpoint,
behind an interface with a fake in tests, and are cached in `benchmark_prices`.

**Layers.** HTTP handler → service → database. The router parses input and calls a service; services
own the logic; nothing skips a layer.

**Idempotent writes.** Every imported record has a unique broker reference and is inserted with
`onConflictDoNothing`, so a re-run of the sync cannot duplicate history. Emptied lots are never
deleted for the same reason: a deleted sync lot would come back at full size on the next import.

**Read-only broker access.** The Trading 212 key must have read scope only, and the client never
calls a write endpoint. `nextPagePath` from an API response is pinned to the expected origin so the
auth header cannot be redirected elsewhere.

## Paging and data volume

FIFO needs the whole transaction history by definition, but `tax.overview` is filtered per year and
a personal account produces hundreds of rows a year, so sorting and paging are client-side. Past
roughly ten thousand rows in one response that stops being true.

## Deliberately not built

Real-time prices (the broker's positions endpoint carries `currentPrice`, which is enough for a
monthly routine), alerts, multi-user support, scheduling, and FX conversion in the portfolio view —
allocation is computed within one account and currency instead of guessing a cross-currency total.
