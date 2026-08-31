import type { cashTransactions, dividends, lots, positions, sales } from '../db/schema.js'
import type {
  T212DividendItem,
  T212FillFee,
  T212HistoricalOrder,
  T212Position,
  T212TransactionItem,
} from './schemas.js'

type PositionRow = Omit<typeof positions.$inferInsert, 'id' | 'syncedAt'>
type LotRow = Omit<typeof lots.$inferInsert, 'id'>
type SaleRow = Omit<typeof sales.$inferInsert, 'id'>
type DividendRow = Omit<typeof dividends.$inferInsert, 'id'>
type TransactionRow = Omit<typeof cashTransactions.$inferInsert, 'id'>

export type OrderMapping =
  | { kind: 'lot'; row: LotRow }
  | { kind: 'sale'; row: SaleRow }
  | { kind: 'skip'; reason: string }

const TRADE_FILL_TYPE = 'TRADE'

// Shares acquired outside a trade: scrip and stock dividends, distributions. They become a lot
// priced at the fill price (typically zero). The holding period runs from the acquisition date and
// a zero cost basis is the conservative reading. STOCK_SPLIT is deliberately absent - a split
// rescales existing lots and a plain new lot would double the quantity (reconcile.ts handles it).
const ACQUISITION_FILL_TYPES = new Set([
  'SCRIP_STOCK_DIVIDENDS',
  'STOCK_DIVIDENDS',
  'STOCK_DISTRIBUTION',
  'CUSTOM_STOCK_DISTRIBUTION',
  'EQUITY_RIGHTS',
  'SPIN_OFF',
])

function isMappableFillType(type: string): boolean {
  return type === TRADE_FILL_TYPE || ACQUISITION_FILL_TYPES.has(type)
}

// Pre-check for the sync loop: lets it skip before resolving the instrument in the database.
export function isMappableOrder(item: T212HistoricalOrder): boolean {
  return item.fill != null && isMappableFillType(item.fill.type)
}

export function numToStr(value: number): string
export function numToStr(value: number | null | undefined): string | null
export function numToStr(value: number | null | undefined): string | null {
  return value == null ? null : String(value)
}

// Charges arrive as negative amounts, one entry per kind, all settled in the same currency in
// practice. A mixed-currency set cannot be added up without an FX rate this layer does not have,
// so it is left out rather than guessed - see docs/TAX.md.
export function sumFees(fees: readonly T212FillFee[] | null | undefined): {
  fee: string | null
  feeCurrency: string | null
} {
  const charged = (fees ?? []).filter((entry) => entry.currency != null && entry.quantity !== 0)
  const currencies = new Set(charged.map((entry) => entry.currency))
  if (charged.length === 0 || currencies.size > 1) return { fee: null, feeCurrency: null }
  const total = charged.reduce((sum, entry) => sum + Math.abs(entry.quantity), 0)
  return { fee: String(total), feeCurrency: charged[0]!.currency! }
}

export function mapPosition(position: T212Position, accountId: number, instrumentId: number): PositionRow {
  const wallet = position.walletImpact
  return {
    accountId,
    instrumentId,
    quantity: numToStr(position.quantity),
    averagePrice: numToStr(position.averagePricePaid),
    currentPrice: numToStr(position.currentPrice),
    currentValue: numToStr(wallet?.currentValue),
    totalCost: numToStr(wallet?.totalCost),
    unrealizedPnl: numToStr(wallet?.unrealizedProfitLoss),
    fxImpact: numToStr(wallet?.fxImpact),
    valueCurrency: wallet?.currency ?? null,
    source: 'sync',
  }
}

export function mapOrder(item: T212HistoricalOrder, accountId: number, instrumentId: number): OrderMapping {
  const { order, fill } = item
  if (!fill) return { kind: 'skip', reason: 'no-fill' }
  if (!isMappableFillType(fill.type)) return { kind: 'skip', reason: `fill-type-${fill.type}` }

  const currency = order?.instrument?.currency ?? order?.currency
  if (!currency) return { kind: 'skip', reason: 'no-currency' }
  const reference = `t212-fill-${fill.id}`
  const filledAt = new Date(fill.filledAt)
  const quantity = numToStr(Math.abs(fill.quantity))
  const pricePerShare = numToStr(fill.price)
  const { fee, feeCurrency } = sumFees(fill.walletImpact?.taxes)

  if (order?.side === 'SELL' || fill.quantity < 0) {
    return {
      kind: 'sale',
      row: {
        accountId,
        instrumentId,
        quantity,
        pricePerShare,
        currency,
        soldAt: filledAt,
        realizedPnl: numToStr(fill.walletImpact?.realisedProfitLoss),
        fee,
        feeCurrency,
        reference,
        source: 'sync',
        raw: item,
      },
    }
  }

  return {
    kind: 'lot',
    row: {
      accountId,
      instrumentId,
      quantity,
      pricePerShare,
      currency,
      acquiredAt: filledAt,
      fee,
      feeCurrency,
      reference,
      source: 'sync',
      raw: item,
    },
  }
}

export function mapDividend(item: T212DividendItem, accountId: number, instrumentId: number): DividendRow {
  return {
    accountId,
    instrumentId,
    amount: numToStr(item.amount),
    currency: item.currency,
    grossAmountPerShare: numToStr(item.grossAmountPerShare),
    quantity: numToStr(item.quantity),
    type: item.type ?? 'UNKNOWN',
    paidOn: new Date(item.paidOn),
    reference: item.reference,
  }
}

export function mapTransaction(item: T212TransactionItem, accountId: number): TransactionRow {
  return {
    accountId,
    amount: numToStr(item.amount),
    currency: item.currency,
    type: item.type,
    occurredAt: new Date(item.dateTime),
    reference: item.reference,
  }
}
