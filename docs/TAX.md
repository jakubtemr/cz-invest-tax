# The Czech tax module

What the app computes, which reading it takes where the law leaves room, and what it leaves to you.
Section references are to Act No. 586/1992 Coll., on income taxes (ZDP).

**Not tax advice.** The numbers are meant to be checked. The gaps at the bottom are the real content.

```
sales     → FIFO per instrument → per-lot time test → s. 10 base (loss clamped to zero)
dividends → gross in CZK, withholding per source state ┐
interest  → gross in CZK                               ┴→ s. 8 base
                          ↓
   base rounded down to whole hundreds (s. 16), then 15 % / 23 % (s. 16a)
                          ↓
        minus the ordinary foreign tax credit, computed per source state
```

## Sales

**FIFO, per instrument, not per account.** The tax is assessed on the taxpayer, so a purchase at one
broker and a sale at another are the same holding. Rows sharing a timestamp are ordered by id, so the
result cannot depend on what order the database returns.

**Time test (s. 4(1)(x)).** Exempt once the holding period *exceeds* three years — a sale on the
anniversary itself does not qualify, the first exempt day is the day after. Counted in Prague
calendar days: a US fill on 31 Dec 23:30 UTC is already 1 January here. 29 February with no
counterpart collapses to 28 February (Civil Code s. 605).

**The 100 000 CZK exemption (s. 4(1)(w)).** Under the limit, all sale income for the year is exempt.

> **Interpretation:** income already exempt under the time test does *not* consume the limit. A sale
> qualifies under (w) or under (x), never both, so what (x) has exempted never reaches (w). The
> screen shows total proceeds *and* the amount measured against the limit, so the conservative
> reading stays one glance away.

An **unmatched quantity** — shares sold with no purchase behind them in the imported history — always
consumes the limit: its exemption cannot be demonstrated. Taxed with a zero cost basis and reported
as an error, not a note.

**The 40 000 000 CZK cap (s. 4(3)) — 2025 only.** The consolidation package capped time-test-exempt
income from 1 January 2025; the 2026 amendment took securities and business shares back out and left
the cap for crypto-assets, which this app does not track. Where it applies the app reports the
overflow but does not pick which sales to tax — that is your choice, and the cap also counts exempt
income the app never sees.

**Expenses (s. 10(5)).** Cost is the purchase price plus fees incurred on acquisition and on sale.
Broker fees arrive per fill and are allocated *pro rata*: half a lot sold carries half its fee. Fees
reduce the gain, not the *income*, so the 100k limit measures gross proceeds.

**Loss clamp (s. 10(4)).** Gains and losses offset within the year; if expenses exceed income the
excess is disregarded. The app reports `gainCzk` (may be negative) and `baseCzk` (never).

## Dividends and interest

**Gross, not net.** The s. 8 base is the gross dividend, reconstructed as gross-per-share × quantity
at the CNB rate, while the net is converted in the currency it was actually paid in. With no gross
reported the app falls back to net, calls withholding zero and says so — that understates the base;
it is a flagged data gap, not a choice.

**Source state** comes from the ISIN prefix, which is a good default and a bad certainty: an ADR on a
European company carries a US ISIN, an Irish-domiciled ETF an IE one whatever it holds, and `XS` is a
depository rather than a country. So it is **overridable per instrument** on the Dividends tab.

**Withholding is inferred, never reported.** No broker payload carries it: it is the reconstructed
gross minus the net the broker credited at its own rate on its own day, rounded to whole hellers. Two
exchange-rate bases, so the implied rate jitters — the more so the smaller the payment.

Therefore the treaty cap *always* applies (a cap can only understate a credit), while the *warning*
is judged in **percentage points**, never in crowns: on fractional holdings no single withholding
reaches a crown, so an amount-based tolerance would hide a 25 % Canadian rate as readily as a
rounding error. One percentage point, widened on small payments by what a heller of rounding is
worth. This catches relief not applied at source — Canada withholding its domestic 25 % against a
treaty 15 %, the Netherlands 15 % against 10 %, a US payer taking 30 % for a missing W-8BEN. It
cannot catch a mislabelled ADR; that is what the country override is for.

The treaty table is in `src/server/tax/constants.ts`, each row citing its promulgation in the
Collection of Laws, cross-checked against the overview KODAP publishes. Taiwan is there too, granted
by a domestic act (45/2020 Coll.) since Czechia does not recognise it as a state. **Verify before
filing** — treaties get amended, and the table covers what a European retail portfolio usually
touches, not everything. Note the UK at 15 %: ordinary UK dividends carry no withholding at all, but
a REIT's property income distribution is withheld at 20 %, and that is when the cap bites.

**Czech-source dividends** are taxed by final withholding as a separate base (s. 36) — not in s. 8,
not in the credit, not in the return. Flagged and excluded.

## Tax and the credit

The base is rounded **down to whole hundreds** (s. 16), then 15 % up to 36× the average wage and 23 %
above (s. 16a); the tax is rounded up to whole crowns.

> s. 16 rounds the base *as a whole*. Rounding s. 8 and s. 10 separately and adding them would shave
> up to 198 CZK off and understate the tax, so the app rounds the sum and reports the partial bases
> unrounded beside it.

The 23 % threshold is shared across **all** sections, and the app only sees investments — hence the
**"other partial tax bases"** input, defaulting to zero. At zero the result is exact for someone
whose only income is investments, and honest for everyone else, because the number is visibly an
input.

**Ordinary credit (s. 38f(2))**, per source state:

```
credit(state) = min( creditable withholding(state),
                     Czech tax × gross income from state / total base )
```

State by state, so a generous treaty in one country cannot subsidise tax on income from another. The
uncredited remainder is reported; s. 24(2)(ch) allows claiming it as an expense next year and **the
app carries nothing forward**. An unused credit is not a refund — tax owed stops at zero.

Every rate, limit and threshold is keyed by year, currently 2021–2026, because the 23 % threshold is
announced annually and the tax cannot be computed without it. An unsupported year **throws** rather
than reusing last year's numbers, and the year picker greys it out. The README says how to add one.

## Exchange rates

Daily CNB rates cached in the database, keyed by the **requested** date — over a weekend CNB returns
the last business day's table, which is the rate the conversion has to use. GBX is GBP ÷ 100.

Two failures are kept apart because they mean different things: a currency CNB does not quote (a
permanent gap) and a day whose table could not be read (an outage). Either way the base is
**incomplete** and the screen says so. Every leg of an item must be priced — sale, lot and fee
currency — or the whole item drops out; pricing only the sale would let an unpriced lot into the
arithmetic.

## Splits and corporate actions

A split is not a trade, so it never appears in the order history — the broker simply reports more
shares than the transactions add up to. Open lots are rescaled by the factor with the **acquisition
date preserved**, so the three-year clock keeps running; a clean n:m factor is named in the message.
Reconciliation is per (account, instrument), because an instrument-level total would hide drift on
one account behind a matching total on another. It touches open lots only — past sales are not
retroactively rescaled. A ticker change or spin-off is handled by the transfer tool on the Taxes
screen, which moves the unmatched remainder keeping date and price.

## What it does not do

| Not computed | Why |
| --- | --- |
| The uniform annual exchange rate | Published after year end, no API. Daily CNB only. |
| Weighted-average cost basis | The per-lot time test needs per-lot identity. |
| Mergers, demergers, share exchanges | Only the manual transfer tool (ticker change, simple spin-off). |
| The DPFO XML | Figures to transcribe, plus a CSV export. |
| Loss carry-forward | s. 10 losses do not carry anyway; the s. 24 residual is reported, not carried. |
| Securities in a business asset base | s. 10 only — an individual's non-business holdings. |
| Derivatives, crypto, bonds, FX gains on cash | Only what the brokers report as equity positions. |
| Fees charged in a currency other than the fill's | The mapper has no FX rate; the raw payload is kept. |
| Verifying the limits across your whole life | The app sees only its own database. The 100k and 40M limits are per-taxpayer figures covering income it cannot see. |

`src/server/tax/**` and `src/shared/**` are held at 100 % of lines, branches, statements and functions
by `pnpm verify`. Integration tests run against a real database, never a mock.
