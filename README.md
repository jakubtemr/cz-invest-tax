# cz-invest-tax

[![verify](https://github.com/jakubtemr/cz-invest-tax/actions/workflows/verify.yml/badge.svg)](https://github.com/jakubtemr/cz-invest-tax/actions/workflows/verify.yml)

A local portfolio tracker for **Trading 212** (synced) and **Freedom24** (entered by hand), with a
**Czech investment-tax module** that does the part nobody enjoys: FIFO matching, the three-year time
test per lot, the 100 000 CZK exemption, dividends, and the credit for tax withheld abroad.

Single user, `localhost`, no auth, no cloud. Czech and English interface.

The portfolio screen also answers the one question that matters: **are you beating the S&P 500,
and by how much** — every deposit replayed into the total-return index on the same day, in crowns,
with the money-weighted annual return of both.

**Status:** a finished snapshot, published as a reference. It is not actively developed and there
is no roadmap; issues and pull requests are welcome but may sit.

![The Taxes screen](docs/screenshot.jpg)

> **Not tax advice.** This produces a working sheet to check and transcribe, not a filing. Read
> [docs/TAX.md](docs/TAX.md) for the interpretations it takes and — more importantly — the gaps it
> leaves you to close.

## What the tax module computes

| Computed | Not computed |
| --- | --- |
| FIFO matching of sales against purchase lots, per instrument | Weighted-average cost basis |
| The three-year time test per lot, in Prague calendar days | Mergers, demergers, share exchanges |
| The 100 000 CZK exemption (s. 4(1)(w)), measured against sales not already exempt | The uniform annual exchange rate (no API) |
| The 40 000 000 CZK cap on exempt income (s. 4(3)) — 2025 only, reported not allocated | Which sales to tax once over that cap |
| The s. 10(4) loss clamp | Loss carry-forward between years |
| Broker fees folded into cost, pro rata (s. 10(5)) | Fees charged in a currency other than the fill's |
| Gross dividends and interest into the s. 8 base | Czech-source dividends (s. 36 — flagged and excluded) |
| Source state from the ISIN, overridable by hand | Verifying where an ADR or an ETF is really taxed |
| Treaty withholding caps, with the excess flagged as refundable at source | Filing that refund |
| The ordinary credit (zápočet prostý), per source state | Carrying the uncredited residual to next year |
| 15 / 23 % with the s. 16 rounding, and other partial bases as an input | Deductions, credits, and everything outside investments |
| Daily CNB rates with a cache, GBX as GBP/100 | Derivatives, crypto, bonds, currency gains on cash |
| CSV export of sales and dividends | The DPFO XML |

Splits are reconciled against the broker's reported quantity with the acquisition date preserved, so
the time test survives them. The source state of a dividend is derived from the ISIN and can be
corrected per instrument on the Dividends tab — an ADR or an ETF is rarely taxed where it is
registered.

## Quickstart

Requires **Node 22+** (`--env-file-if-exists`, used by the dev script) and pnpm. Nothing else — the
database is a SQLite file the app creates on first run.

```bash
pnpm install
cp .env.example .env          # then fill in the Trading 212 key, or leave it blank
pnpm dev                      # server on :8792, UI on http://localhost:5178
```

Without a Trading 212 key everything still works — the sync button reports that no key is
configured, and positions can be entered by hand.

The database lives at `data/invest.db` (override with `DATABASE_FILE`). `data/`, `*.db` and
`*.sqlite` are gitignored: that one file is your entire portfolio and must never reach a commit.
Backing it up is `cp`.

The server binds `127.0.0.1` and pins the origins it accepts, because there is no authentication of
any kind. **Do not put it behind a reverse proxy or expose the port**; anyone who reaches it reads
your whole portfolio.

### The Trading 212 key

Settings → API (Beta) → Generate API key. **Grant read scopes only.** The client never calls a write
endpoint, but a key that cannot write is a guarantee rather than a promise. Put the key and secret in
`.env`; `.env*` is gitignored except for the example.

The `history/*` endpoints are limited to 6 requests per minute, so the first full import of a long
history takes a while. Progress is reported live in the UI and in the server log.

### Tests

```bash
pnpm verify                   # typecheck, lint, tests, coverage gate, build
```

`pnpm verify` is the gate before a commit. Integration tests run against a real database rather than
mocks — an in-memory SQLite carrying the same migrations the app runs on, so they need no setup and
leave nothing behind.

## Adding a tax year

Covers **2021 to 2026**. The range is not arbitrary: the threshold where the 23 % rate starts is 36×
the average wage, announced every autumn for the year ahead, so a year without that number cannot be
computed at all. Rather than quietly reuse the previous year's figure, an unsupported year throws and
the year picker greys it out.

Rates and limits live in `src/server/tax/constants.ts`. To add 2027:

1. Add a row to `THRESHOLDS` — 36x the average wage announced by ČSSZ for that year.
2. Check the `year >= 2025` rule for the 40M exemption cap still holds.
3. Re-check `TREATY_WITHHOLDING` against the Ministry of Finance's current treaty list.

`SUPPORTED_TAX_YEARS` derives itself, and the year picker greys out anything missing.

## Documentation

- [docs/TAX.md](docs/TAX.md) — the rules, the section references, the interpretations, the gaps
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — modules, design rules, what was deliberately left out

## License

MIT — see [LICENSE](LICENSE).
