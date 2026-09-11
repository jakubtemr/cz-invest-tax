import type { Dictionary } from './cs.js'

export const en: Dictionary = {
  'nav.portfolio': 'Portfolio',
  'nav.taxes': 'Taxes',
  'lang.label': 'Language',

  'common.loading': 'Loading…',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.confirmDelete': 'Really delete?',
  'common.export': 'Download CSV',
  'common.none': '—',
  'common.yes': 'yes',
  'common.no': 'no',
  'common.records': '{total} rows',
  'common.page': 'page {page}/{pages}',

  'broker.T212': 'Trading 212',
  'broker.F24': 'Freedom24',

  'portfolio.loadError': 'Could not load the portfolio: {error}. Is the server running (pnpm dev)?',
  'portfolio.card.cash': 'cash',
  'portfolio.card.unrealized': 'unrealised',
  'portfolio.card.positions': 'positions',
  'benchmark.label': 'Vs. S&P 500',
  'benchmark.hint':
    'Every deposit replayed into the S&P 500 (total return) on the same day, at the CNB rate. The level is what the index would have made of the same money.',
  'benchmark.ahead': 'beating the index by {pct} %',
  'benchmark.behind': 'index ahead by {pct} %',
  'benchmark.even': 'level with the index',
  'benchmark.level': 'level',
  'benchmark.portfolio': 'portfolio',
  'benchmark.invested': 'invested',
  'benchmark.annual': 'p.a. you {mine} % · index {index} % · difference {alpha} pp',
  'benchmark.period': 'since {since} as of {asOf}',
  'benchmark.noFlows': 'No deposits yet — once T212 is synced the index comparison appears here.',
  'benchmark.noValuation': 'No portfolio valuation yet — run the T212 sync.',
  'benchmark.loadError': 'The index comparison could not be loaded: {error}',
  'portfolio.sync.start': 'Sync Trading 212',
  'portfolio.sync.running': 'Syncing…',
  'portfolio.sync.starting': 'Starting…',
  'portfolio.sync.progress':
    'Fetching {phase} — {pages} pages, +{lots} purchases, +{sales} sales, +{dividends} dividends, +{transactions} transactions · {seconds} s',
  'portfolio.sync.done':
    'Sync finished: {positions} positions, +{lots} purchases, +{sales} sales, +{dividends} dividends, +{transactions} transactions.',
  'portfolio.phase.summary': 'the account summary',
  'portfolio.phase.positions': 'positions',
  'portfolio.phase.orders': 'order history',
  'portfolio.phase.dividends': 'dividends',
  'portfolio.phase.transactions': 'transactions',

  'portfolio.positions.title': 'Positions',
  'portfolio.positions.hint': 'Across brokers; allocation is computed within one account and currency.',
  'portfolio.positions.empty': 'No positions yet — run the Trading 212 sync or add a purchase by hand below.',
  'portfolio.col.instrument': 'Instrument',
  'portfolio.col.broker': 'Broker',
  'portfolio.col.quantity': 'Qty',
  'portfolio.col.avgPrice': 'Avg. price',
  'portfolio.col.price': 'Price',
  'portfolio.col.value': 'Value',
  'portfolio.col.pnl': 'P/L',
  'portfolio.col.allocation': 'Allocation',
  'portfolio.col.newPrice': 'New price',
  'portfolio.col.date': 'Date',
  'portfolio.col.purchase': 'Purchase',

  'portfolio.manual.title': 'Manual entries',
  'portfolio.manual.hint':
    'Freedom24 has no API — its positions are entered by hand (broker F24) and the price is filled in on the position. Broker T212 is only for patching a purchase missing from the imported history (a reinvestment, say); T212 positions otherwise come from the sync.',
  'portfolio.manual.ticker': 'Ticker',
  'portfolio.manual.name': 'Name',
  'portfolio.manual.currency': 'Currency',
  'portfolio.manual.quantity': 'Quantity',
  'portfolio.manual.price': 'Price / share',
  'portfolio.manual.date': 'Purchase date',
  'portfolio.manual.broker': 'Broker',
  'portfolio.manual.brokerT212': 'T212 (patch a hole)',
  'portfolio.manual.submit': 'Add purchase',

  'taxes.loadError': 'Could not load the tax overview: {error}',
  'taxes.yearUnsupported': 'No tax constants for {year} yet.',
  'taxes.loading': 'Computing the tax overview…',
  'taxes.tab.sales': 'Sales ({count})',
  'taxes.tab.dividends': 'Dividends ({count})',
  'taxes.tab.lots': 'Time test ({count})',
  'taxes.tab.tax': 'Tax',

  'taxes.card.proceeds': 'Sale proceeds {year}',
  'taxes.card.under100k': 'under the {limit} limit — all exempt',
  'taxes.card.over100k': 'over the {limit} limit — sales failing the time test are taxed',
  'taxes.card.limitBase': '{amount} counts towards the limit',
  'taxes.card.taxableGain': 'Taxable gain on sales',
  'taxes.card.proceedsMinusCost': 'proceeds {proceeds} − cost {cost}',
  'taxes.card.loss': 'a loss, the s. 10 base is 0',
  'taxes.card.dividends': 'Dividends {year} (gross)',
  'taxes.card.withheldAbroad': 'withheld abroad {amount}',
  'taxes.card.interest': 'Interest on cash {year}',
  'taxes.card.section8': 'taxed under s. 8',
  'taxes.card.exemptOverCap': 'over the exemption cap {amount}',

  'taxes.tax.title': 'Tax computation',
  'taxes.tax.hint':
    'Rates of 15 / 23 % under s. 16a; the base is rounded down to whole hundreds (s. 16). Foreign withholding is credited under the ordinary method, computed per source state.',
  'taxes.tax.otherBases': 'Other partial tax bases (CZK)',
  'taxes.tax.otherBasesHint':
    'Employment, business, rent — the 23 % threshold is shared across every section. Zero is exact if investments are your only income.',
  'taxes.tax.section8': 'Base s. 8 (dividends + interest)',
  'taxes.tax.section10': 'Base s. 10 (gain on sales)',
  'taxes.tax.otherBasesRow': 'Other partial bases',
  'taxes.tax.totalBase': 'Total base',
  'taxes.tax.roundedBase': 'Rounded base (s. 16)',
  'taxes.tax.baseRateTax': 'Tax at 15 %',
  'taxes.tax.topRateTax': 'Tax at 23 % above {threshold}',
  'taxes.tax.taxBefore': 'Tax before credit',
  'taxes.tax.credit': 'Foreign withholding credit',
  'taxes.tax.taxAfter': 'Tax after credit',
  'taxes.tax.residual': 'Uncredited residual',
  'taxes.tax.residualHint':
    'The uncredited part may be claimed as an expense next year under s. 24; this app carries nothing forward.',

  'taxes.credit.title': 'Credit by source state',
  'taxes.credit.country': 'State',
  'taxes.credit.gross': 'Gross income',
  'taxes.credit.withheld': 'Withheld',
  'taxes.credit.creditable': 'Creditable',
  'taxes.credit.maxCredit': 'Credit cap',
  'taxes.credit.credit': 'Credit',
  'taxes.credit.residual': 'Residual',

  'taxes.sales.title': 'Sales {year}',
  'taxes.sales.hint': 'FIFO matching; CNB rates as of the transaction day. One row per lot consumed by a sale.',
  'taxes.sales.empty': 'No sales in {year}.',
  'taxes.sales.col.sold': 'Sold',
  'taxes.sales.col.proceeds': 'Proceeds',
  'taxes.sales.col.cost': 'Cost',
  'taxes.sales.col.fee': 'Fees',
  'taxes.sales.col.gain': 'Gain',
  'taxes.sales.col.timeTest': 'Time test',
  'taxes.sales.col.taxable': 'Taxable',
  'taxes.sales.noLot': '⚠ no known purchase',
  'taxes.sales.testMet': '✓ met',

  'taxes.dividends.title': 'Dividends {year}',
  'taxes.dividends.empty': 'No dividends in {year}.',
  'taxes.dividends.hint':
    'The gross amount goes into the s. 8 base. Withholding is credited up to the rate the double taxation treaty allows.',
  'taxes.dividends.col.date': 'Date',
  'taxes.dividends.col.country': 'State',
  'taxes.dividends.countryHint':
    'Source state - correct it where the ISIN misleads (an ADR, an ETF). UNKNOWN if unsure.',
  'taxes.dividends.col.type': 'Type',
  'taxes.dividends.col.gross': 'Gross',
  'taxes.dividends.col.net': 'Net',
  'taxes.dividends.col.withheld': 'Withheld',
  'taxes.dividends.col.effective': 'Rate',
  'taxes.dividends.col.treaty': 'Treaty',
  'taxes.dividends.col.creditable': 'Creditable',

  'taxes.lots.title': 'Time test — open purchases',
  'taxes.lots.hint': 'Three years after the purchase a sale is exempt whatever the amount (s. 4(1)(x)).',
  'taxes.lots.empty': 'No open purchases — run the sync on the Portfolio screen.',
  'taxes.lots.col.acquired': 'Acquired',
  'taxes.lots.col.exemptFrom': 'Exempt from',
  'taxes.lots.col.countdown': 'Countdown',
  'taxes.lots.exempt': '✓ exempt',
  'taxes.lots.days': '{days} days',

  'taxes.transfer.title': 'Patch a hole — move the purchase remainder',
  'taxes.transfer.hint':
    'A corporate action (ticker change, spin-off): moves unmatched purchases onto the new ticker keeping the acquisition date and price, so the time test runs on. A small missing purchase (a reinvestment) is added on the Portfolio screen with broker T212.',
  'taxes.transfer.from': 'From ticker',
  'taxes.transfer.to': 'To ticker',
  'taxes.transfer.quantity': 'Quantity (empty = the whole remainder)',
  'taxes.transfer.submit': 'Move remainder',
  'taxes.transfer.done': 'Moved {quantity} shares ({lots} lots) — the acquisition date was preserved.',

  'taxes.disclaimer':
    'A working sheet for the return, not tax advice. Conversions use the daily CNB rate; the alternative is the uniform rate the tax administration publishes after year end.',

  'warn.unmatchedSale':
    'Sale of {instrument} on {day}: no purchases found for {quantity} shares (a split or an incomplete history) — the income counts, the cost is zero and the time test cannot be judged. Check it by hand.',
  'warn.currencyMismatch':
    '{instrument}: purchases and sales are in different currencies — check the data, the cost is converted using the purchase currency.',
  'warn.dividendGrossMissing':
    'Dividend {instrument} on {day}: no gross amount — using the net amount, withholding counted as zero.',
  'warn.withholdingNegative':
    'Dividend {instrument} on {day}: the net amount is {amount} CZK higher than the gross, which would make withholding negative. Counted as zero — check the figures with your broker.',
  'warn.exemptOverCap':
    'Income exempt under the time test exceeded the {cap} CZK cap by {amount} CZK (s. 4(3)). The excess is taxable and you choose which sales to tax; exempt income outside this app counts towards the cap too. Talk it over with a tax adviser.',
  'warn.treatyExceeded':
    '{instrument} ({country}): {effective} % was withheld, the double taxation treaty allows {treaty} %. The {excess} CZK excess is not creditable — you reclaim it from the source state (for the US this usually means a missing W-8BEN).',
  'warn.treatyUnknown':
    'State {country}: no treaty rate on file, so the credit is not capped. Set the source state on the instrument or verify the rate yourself.',
  'warn.domesticDividend':
    '{instrument}: a Czech-source dividend is subject to final withholding as a separate tax base (s. 36) - it belongs neither in s. 8 nor in the credit, and is not reported in the return.',
  'warn.creditResidual':
    'The credit is capped by the proportional Czech tax, leaving {amount} CZK of foreign tax uncredited. s. 24 allows claiming that part as an expense next year — this app carries nothing forward.',
  'warn.otherBasesUsed': 'The computation includes {amount} CZK of other partial bases entered by hand.',
  'warn.fxCurrencyUnquoted':
    'CNB does not quote {currency} — items in that currency are left out and the base is incomplete. Convert them by hand.',
  'warn.fxRateUnavailable':
    'No CNB rate table could be read for {day} — items from that day are left out and the base is incomplete.',
  'warn.itemDroppedNoRate': '{instrument}: at least one currency of this item has no rate, so it is left out.',
  'warn.reconcile.split':
    '{instrument}: the broker reports {broker} shares instead of {history} — this looks like a {ratio} split. Quantities were aligned to the broker; the cost and the acquisition date stay, so the time test runs on.',
  'warn.reconcile.adjusted':
    '{instrument}: the broker reports {broker} shares, the history gives {history}. Quantities were aligned to the broker, the total cost is unchanged.',
  'warn.reconcile.closed':
    '{instrument}: the broker reports no position, the history left {history} shares. Closed to match the broker — fractional remainders after a sell-out do not come through the API any other way.',
  'warn.reconcile.unexplained':
    '{instrument}: the broker reports {broker} shares with not a single purchase behind them. Those shares cannot be priced or dated — check whether the full history was imported.',
}
