import { integer, jsonb, numeric, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  broker: text('broker', { enum: ['T212', 'F24'] })
    .notNull()
    .unique(),
  externalId: text('external_id'),
  currency: text('currency').notNull(),
  // Set only after a COMPLETE history download; until then every sync paginates from the start,
  // so an interrupted run cannot leave a silent hole (incremental stop assumes a complete base).
  historyBackfilledAt: timestamp('history_backfilled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const instruments = pgTable('instruments', {
  id: serial('id').primaryKey(),
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
export const positions = pgTable(
  'positions',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id),
    instrumentId: integer('instrument_id')
      .notNull()
      .references(() => instruments.id),
    quantity: numeric('quantity').notNull(),
    averagePrice: numeric('average_price').notNull(),
    currentPrice: numeric('current_price'),
    currentValue: numeric('current_value'),
    totalCost: numeric('total_cost'),
    unrealizedPnl: numeric('unrealized_pnl'),
    fxImpact: numeric('fx_impact'),
    valueCurrency: text('value_currency'),
    source: text('source', { enum: ['sync', 'manual'] }).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('positions_account_instrument_idx').on(t.accountId, t.instrumentId)],
)

export const lots = pgTable('lots', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  instrumentId: integer('instrument_id')
    .notNull()
    .references(() => instruments.id),
  quantity: numeric('quantity').notNull(),
  pricePerShare: numeric('price_per_share').notNull(),
  currency: text('currency').notNull(),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull(),
  // Broker fees charged on the fill, positive, in feeCurrency (broker settles them in the
  // account currency, which need not be the trade currency). Part of the acquisition cost.
  fee: numeric('fee'),
  feeCurrency: text('fee_currency'),
  reference: text('reference').notNull().unique(),
  source: text('source', { enum: ['sync', 'manual'] }).notNull(),
  raw: jsonb('raw'),
})

export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  instrumentId: integer('instrument_id')
    .notNull()
    .references(() => instruments.id),
  quantity: numeric('quantity').notNull(),
  pricePerShare: numeric('price_per_share').notNull(),
  currency: text('currency').notNull(),
  soldAt: timestamp('sold_at', { withTimezone: true }).notNull(),
  realizedPnl: numeric('realized_pnl'),
  fee: numeric('fee'),
  feeCurrency: text('fee_currency'),
  reference: text('reference').notNull().unique(),
  source: text('source', { enum: ['sync', 'manual'] }).notNull(),
  raw: jsonb('raw'),
})

export const dividends = pgTable('dividends', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  instrumentId: integer('instrument_id')
    .notNull()
    .references(() => instruments.id),
  amount: numeric('amount').notNull(),
  currency: text('currency').notNull(),
  grossAmountPerShare: numeric('gross_amount_per_share'),
  quantity: numeric('quantity'),
  type: text('type').notNull(),
  paidOn: timestamp('paid_on', { withTimezone: true }).notNull(),
  reference: text('reference').notNull().unique(),
})

export const cashTransactions = pgTable('cash_transactions', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  amount: numeric('amount').notNull(),
  currency: text('currency').notNull(),
  type: text('type').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  reference: text('reference').notNull().unique(),
})

// Account state over time (after every sync) - the basis for a value chart.
export const snapshots = pgTable('snapshots', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  takenAt: timestamp('taken_at', { withTimezone: true }).notNull().defaultNow(),
  totalValue: numeric('total_value'),
  cash: numeric('cash'),
  invested: numeric('invested'),
  unrealizedPnl: numeric('unrealized_pnl'),
  realizedPnl: numeric('realized_pnl'),
  currency: text('currency').notNull(),
})

// Daily CNB rate cache - the key is the REQUESTED date (a weekend or holiday stores the rate
// of the last business day, which is the rate the tax conversion has to use).
export const fxRates = pgTable(
  'fx_rates',
  {
    id: serial('id').primaryKey(),
    date: text('date').notNull(),
    currency: text('currency').notNull(),
    rate: numeric('rate').notNull(),
    amount: integer('amount').notNull().default(1),
  },
  (t) => [uniqueIndex('fx_rates_date_currency_idx').on(t.date, t.currency)],
)
