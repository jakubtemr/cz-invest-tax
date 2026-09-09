import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// Money is stored as TEXT and never as a number. SQLite has no exact decimal type, so a REAL column
// would silently turn every amount into a float; as text it comes back byte for byte and all
// arithmetic happens in decimal.js in the service layer, where it belongs anyway.
const money = (name: string) => text(name)

const id = () => integer('id').primaryKey({ autoIncrement: true })
const createdAt = (name: string) =>
  integer(name, { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())

export const accounts = sqliteTable('accounts', {
  id: id(),
  broker: text('broker', { enum: ['T212', 'F24'] })
    .notNull()
    .unique(),
  externalId: text('external_id'),
  currency: text('currency').notNull(),
  // Set only after a COMPLETE history download; until then every sync paginates from the start,
  // so an interrupted run cannot leave a silent hole (incremental stop assumes a complete base).
  historyBackfilledAt: integer('history_backfilled_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt('created_at'),
})

export const instruments = sqliteTable('instruments', {
  id: id(),
  ticker: text('ticker').notNull().unique(),
  name: text('name'),
  isin: text('isin'),
  currency: text('currency').notNull(),
  // Source state for the dividend withholding credit: ISO 3166-1 alpha-2 derived from the ISIN
  // prefix, overridable by hand because the ISIN says where the security is registered, not
  // always where the dividend is taxed. See docs/TAX.md.
  country: text('country'),
})

// Current position state for the UI - overwritten on sync (T212) or recomputed from lots (F24).
export const positions = sqliteTable(
  'positions',
  {
    id: id(),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id),
    instrumentId: integer('instrument_id')
      .notNull()
      .references(() => instruments.id),
    quantity: money('quantity').notNull(),
    averagePrice: money('average_price').notNull(),
    currentPrice: money('current_price'),
    currentValue: money('current_value'),
    totalCost: money('total_cost'),
    unrealizedPnl: money('unrealized_pnl'),
    fxImpact: money('fx_impact'),
    valueCurrency: text('value_currency'),
    source: text('source', { enum: ['sync', 'manual'] }).notNull(),
    syncedAt: createdAt('synced_at'),
  },
  (t) => [uniqueIndex('positions_account_instrument_idx').on(t.accountId, t.instrumentId)],
)

export const lots = sqliteTable('lots', {
  id: id(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  instrumentId: integer('instrument_id')
    .notNull()
    .references(() => instruments.id),
  quantity: money('quantity').notNull(),
  pricePerShare: money('price_per_share').notNull(),
  currency: text('currency').notNull(),
  acquiredAt: integer('acquired_at', { mode: 'timestamp_ms' }).notNull(),
  // Broker fees charged on the fill, positive, in feeCurrency (broker settles them in the
  // account currency, which need not be the trade currency). Part of the acquisition cost.
  fee: money('fee'),
  feeCurrency: text('fee_currency'),
  reference: text('reference').notNull().unique(),
  source: text('source', { enum: ['sync', 'manual'] }).notNull(),
  raw: text('raw', { mode: 'json' }),
})

export const sales = sqliteTable('sales', {
  id: id(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  instrumentId: integer('instrument_id')
    .notNull()
    .references(() => instruments.id),
  quantity: money('quantity').notNull(),
  pricePerShare: money('price_per_share').notNull(),
  currency: text('currency').notNull(),
  soldAt: integer('sold_at', { mode: 'timestamp_ms' }).notNull(),
  realizedPnl: money('realized_pnl'),
  fee: money('fee'),
  feeCurrency: text('fee_currency'),
  reference: text('reference').notNull().unique(),
  source: text('source', { enum: ['sync', 'manual'] }).notNull(),
  raw: text('raw', { mode: 'json' }),
})

export const dividends = sqliteTable('dividends', {
  id: id(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  instrumentId: integer('instrument_id')
    .notNull()
    .references(() => instruments.id),
  amount: money('amount').notNull(),
  currency: text('currency').notNull(),
  grossAmountPerShare: money('gross_amount_per_share'),
  quantity: money('quantity'),
  type: text('type').notNull(),
  paidOn: integer('paid_on', { mode: 'timestamp_ms' }).notNull(),
  reference: text('reference').notNull().unique(),
})

export const cashTransactions = sqliteTable('cash_transactions', {
  id: id(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  amount: money('amount').notNull(),
  currency: text('currency').notNull(),
  type: text('type').notNull(),
  occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  reference: text('reference').notNull().unique(),
})

// Account state over time (after every sync) - the basis for a value chart.
export const snapshots = sqliteTable('snapshots', {
  id: id(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  takenAt: createdAt('taken_at'),
  totalValue: money('total_value'),
  cash: money('cash'),
  invested: money('invested'),
  unrealizedPnl: money('unrealized_pnl'),
  realizedPnl: money('realized_pnl'),
  currency: text('currency').notNull(),
})

// Daily CNB rate cache - the key is the REQUESTED date (a weekend or holiday stores the rate
// of the last business day, which is the rate the tax conversion has to use).
export const fxRates = sqliteTable(
  'fx_rates',
  {
    id: id(),
    date: text('date').notNull(),
    currency: text('currency').notNull(),
    rate: money('rate').notNull(),
    amount: integer('amount').notNull().default(1),
  },
  (t) => [uniqueIndex('fx_rates_date_currency_idx').on(t.date, t.currency)],
)
