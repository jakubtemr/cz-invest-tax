# The Czech tax module

What this app computes, which reading of the law it takes where the law leaves room, and what it
deliberately does not do. Section references are to Act No. 586/1992 Coll., on income taxes (ZDP),
unless stated otherwise.

**This is not tax advice.** It is a working sheet: the numbers are meant to be checked, and the
gaps below are the ones you have to close yourself.

---

## The shape of the computation

```
sales     → FIFO matching per instrument → per-lot time test → s. 10 partial base
dividends → gross in CZK, withholding per source state       → s. 8 partial base
interest  → gross in CZK                                     → s. 8 partial base
                                                              ↓
                    base rounded down to whole hundreds (s. 16)
                                                              ↓
                          15 % up to the threshold, 23 % above (s. 16a)
                                                              ↓
                     minus the ordinary foreign tax credit, per source state
```

## Sales

### FIFO, per instrument, not per account

A sale consumes the oldest open lots of the same instrument first. Matching is deliberately **per
instrument and not per account**: the tax is assessed on the taxpayer, so a purchase held at one
broker and a sale executed at another are still the same holding.

Lots and sales sharing a timestamp are ordered by database id, so the result cannot depend on the
order Postgres happens to return rows in.

### The three-year time test (s. 4(1)(x))

Exempt once the period between acquisition and sale **exceeds** three years, so a sale on the third
anniversary itself does **not** qualify — the first exempt day is the day after. The period is
counted in calendar days in the Europe/Prague zone, because a US after-hours fill on 31 December
23:30 UTC is already 1 January in Prague: a different year, a different exchange rate, and possibly
a different side of the anniversary.

29 February with no counterpart in the target year collapses to 28 February (Civil Code s. 605).

### The 100 000 CZK exemption (s. 4(1)(w))

If total sale income for the year stays at or below the limit, the whole lot of it is exempt.

**Interpretation taken:** income already exempt under the time test does **not** consume the limit.
The two exemptions cannot be combined for one and the same security — a sale qualifies under s.
4(1)(w) or under s. 4(1)(x), not both — so income that the time test has already exempted never
reaches the limit. The screen shows both figures, total proceeds and the amount measured against the
limit, so the more conservative reading (counting everything) remains one glance away.

An **unmatched quantity** — shares sold with no purchase behind them in the imported history —
always consumes the limit: its exemption cannot be demonstrated, so it is treated as taxable income
with a zero cost basis, and it is reported as an error, not a note.

### The 40 000 000 CZK cap on exempt income (s. 4(3))

**In force for 2025 alone.** The 2024 consolidation package capped income exempt under the time
test from 1 January 2025; the amendment effective for 2026 took securities and business shares back
out of the cap and left it applying only to crypto-assets, which this app does not track. So the
figure is non-zero for 2025 and zero in every other year.

Where it does apply, income exempt under the time test above the cap becomes taxable. The app
**reports the overflow** but does not decide which sales to tax — that choice is the taxpayer's, and
the cap counts exempt income the app never sees (a stake in a company, real estate).

### Expenses (s. 10(5))

The cost is the acquisition price plus the fees demonstrably incurred on the acquisition and on the
sale. Broker fees arrive per fill (`walletImpact.taxes` in the Trading 212 API: currency conversion
fee, stamp duty reserve tax, financial transaction tax) and are allocated **pro rata** to the
matched quantity — half a lot sold carries half the lot's purchase fee.

Fees reduce the gain, they do not reduce **income**. The 100 000 CZK limit therefore measures gross
proceeds.

*Gap:* if one fill carries fees in more than one currency, they are dropped rather than added up,
because the mapping layer has no exchange rate. No such fill has been observed; the raw payload is
kept in the database either way.

### The loss clamp (s. 10(4))

Within the partial base, losses and gains on sales offset each other. If expenses exceed income for
the year as a whole, the excess is disregarded: the partial base is zero, never negative. The app
reports both — `gainCzk` (which may be negative, informational) and `baseCzk` (clamped).

## Dividends and interest

### Gross, not net

The s. 8 base is the **gross** dividend, before foreign withholding. Trading 212 reports a net
payout plus a gross amount per share; the gross is reconstructed as `gross per share × quantity`,
converted at the rate for the payment day in the currency of the instrument, while the net is
converted in the currency it was actually paid in.

When the gross amount is missing, the app falls back to the net amount, reports withholding as zero
and says so. That understates the base — it is a data gap, flagged, not a silent choice.

Broker FX rounding can make the converted net come out a hair above the gross. Withholding is
clamped at zero, silently within a tolerance of 1 CZK or 1 % of the gross and with a loud warning
above it.

### Source state

The credit needs to know where the income came from. The source state is derived from the **first
two characters of the ISIN**, which is a good default and a bad certainty:

- an ADR on a European company carries a US ISIN;
- an Irish-domiciled UCITS ETF distributes under an IE ISIN whatever it holds;
- `XS` and other X-prefixes are supranational depositories, not countries.

So the derived country is a starting point and is **overridable per instrument**. Where it is
unknown, the credit is not capped and the app says the cap is missing.

### Treaty rates and excess withholding

Each dividend gets an effective rate of `withheld / gross`. When it exceeds the rate the double
taxation treaty allows, the excess is **not creditable in Czechia** — it is refundable from the
source state. A 30 % US withholding almost always means a missing W-8BEN.

**The withholding is inferred, not reported.** No broker payload carries the tax withheld: it is
the reconstructed gross minus the net the broker credited in the account currency, at its own rate
on its own day, rounded to whole hellers. Two exchange-rate bases and a rounding, so the implied
rate jitters around the real one — the more so the smaller the payment.

The cap therefore always applies (a treaty limit can only understate a credit, never overstate it),
while the *warning* is judged in **percentage points**, never as an amount. On a portfolio of
fractional shares no single withholding reaches a crown, so an amount-based tolerance would hide a
25 % Canadian rate exactly as readily as a rounding error. The threshold is one percentage point,
widened on small payments by what one heller of rounding is worth: on a 0.11 CZK dividend a single
heller moves the implied rate by nine points, and nothing can be concluded from it.

What this catches in practice: relief at source not applied. Canada withholding its domestic 25 %
against a treaty 15 %, the Netherlands 15 % against 10 %, or a US payer taking 30 % for a missing
W-8BEN. What it cannot catch is an ADR: a Taiwanese company on a US ISIN passes through Taiwanese
withholding while the derived source state says US — which is why the state is overridable.

The treaty table lives in `src/server/tax/constants.ts`, each row citing the promulgation in the
Collection of Laws and cross-checked against the treaty overview KODAP publishes. Taiwan is in there
too, granted by a domestic act (45/2020 Coll.) rather than a treaty, because Czechia does not
recognise it as a state. **Verify the rate before filing:** treaties get amended, and the table
covers the countries a European retail portfolio usually touches, not all of them.

Note the United Kingdom. Ordinary UK dividends carry no withholding at all, so the 15 % cap looks
irrelevant — until a REIT distributes property income, which the UK withholds at 20 %. That is the
one case where the cap bites, and it is why the entry is 15 % rather than zero.

### Czech-source dividends

A dividend from a Czech source is taxed by final withholding as a separate tax base (s. 36). It
belongs neither in the s. 8 base nor in the credit and is not reported in the return at all. The app
keeps it in the dividend list, excludes it from the base and the credit, and flags it.

## Tax and the credit

### Rates and rounding

The base is rounded **down to whole hundreds of crowns** (s. 16), then 15 % applies up to
36× the average wage and 23 % above it (s. 16a). The resulting tax is rounded up to whole crowns.

**Deviation from the original plan, stated explicitly:** s. 16 rounds the tax base as a whole, not
each partial base separately. Rounding s. 8 and s. 10 independently and then adding them would shave
up to 198 CZK off the base and understate the tax, so the app rounds the sum. The unrounded partial
bases are reported next to it.

### Other partial tax bases

The 23 % threshold is shared across **all** sections — employment, business, rent, and investments
together. The app can only see investments, so the tax screen takes an **"other partial tax bases"**
input defaulting to zero. With zero, the result is exact for someone whose only income is
investments; for everyone else it is honest, because the number is visibly an input.

### The ordinary credit (zápočet prostý, s. 38f(2))

Foreign withholding is credited only up to the Czech tax attributable to income from **that state**:

```
credit(state) = min( creditable withholding(state),
                     Czech tax × gross income from state / total base )
```

Computed state by state, so a generous treaty in one country cannot subsidise tax on income from
another. The uncredited remainder is reported: s. 24(2)(ch) allows claiming it as an expense in the
following year, and **this app carries nothing forward**.

An unused credit is not a refund — tax owed stops at zero.

### Per-year constants

Every rate, limit and threshold is keyed by year in `src/server/tax/constants.ts`. An unsupported
year **throws** `TAX_YEAR_UNSUPPORTED` instead of quietly reusing last year's numbers: a wrong figure
the user believes is worse than a message saying the year is not covered yet.

## Exchange rates

Daily CNB rates, cached in the database, keyed by the **requested** date — over a weekend or a
holiday the CNB returns the last business day's table, which is exactly the rate the conversion has
to use. GBX (pence, how Trading 212 quotes LSE listings) is GBP ÷ 100; the CNB does not quote it.

Two failure modes are kept apart, because they mean different things:

- **the currency is not quoted at all** — a permanent gap; items in that currency drop out;
- **the rate table for a day could not be read** — an outage; items from that day drop out.

Either way the base is **incomplete**, and the screen says so rather than showing a smaller number
as if it were the answer. Every leg of an item must be priced — the sale currency, the lot currency
and the fee currency — otherwise the whole item is left out; pricing only the sale would let an
unpriced lot into the arithmetic.

## Splits and corporate actions

A split is not a trade, so it never arrives in the order history: the broker simply reports more
shares than the transactions add up to. When the broker quantity differs from the history, the open
lots are rescaled by the factor with the **acquisition date preserved** — the holding period
survives a split, so the three-year clock keeps running. A factor resolving to a clean n:m is named
in the message ("a 1:2 split"); anything else is reported as an adjustment.

Reconciliation is per **(account, instrument)** — an instrument-level total would hide drift on one
account behind a matching total on another. It applies to open lots only: past sales are not
retroactively rescaled.

A ticker change or a spin-off is handled by the **transfer tool** on the Taxes screen, which moves
the unmatched purchase remainder onto the new ticker keeping the acquisition date and price.

## What this app does NOT do

| Not implemented | Why |
| --- | --- |
| The uniform annual exchange rate (jednotný kurz) | Published after year end, with no API. Daily CNB rates only. |
| Weighted-average cost basis | The per-lot time test requires per-lot identity, so FIFO it is. |
| Mergers, demergers, share exchanges | Only the manual transfer tool, which handles a ticker change and a simple spin-off. |
| Generating the DPFO XML | The output is figures to transcribe, plus a CSV export. |
| Loss carry-forward | s. 10 losses do not carry across years anyway; the uncredited foreign tax that s. 24 would let you claim next year is reported but not carried. |
| Securities held in a business asset base | s. 10 only — an individual's non-business holdings. |
| Derivatives, crypto, bonds held to maturity, currency gains on cash | Only equity-style instruments the brokers report as positions. |
| Section 36 filings for Czech-source income | Flagged and excluded, not computed. |
| Verifying the limits across your whole life | The app only sees trades in its own database. The 100 000 CZK and 40 000 000 CZK limits are per-taxpayer figures covering income it cannot see — a flat sold, a stake in a company, another broker. |

## Test coverage

`src/server/tax/**` and `src/shared/**` are held at **100 % of lines, branches, statements and
functions** by `pnpm test:tax-coverage`, which runs as part of `pnpm verify`. Integration tests run
against a real Postgres database, never a mock.
