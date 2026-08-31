import type { lots, sales } from '../db/schema.js'
import type { TaxLot, TaxSale } from './fifo.js'

// One row -> domain mapping for both callers of fifoMatch. The tax overview and the
// corporate-action transfer tool must see identical lots, or they disagree about the same trade.

export function toTaxLot(row: typeof lots.$inferSelect): TaxLot {
  return {
    lotId: row.id,
    quantity: row.quantity,
    pricePerShare: row.pricePerShare,
    currency: row.currency,
    acquiredAt: row.acquiredAt,
    fee: row.fee,
    feeCurrency: row.feeCurrency,
  }
}

export function toTaxSale(row: typeof sales.$inferSelect): TaxSale {
  return {
    saleId: row.id,
    quantity: row.quantity,
    pricePerShare: row.pricePerShare,
    currency: row.currency,
    soldAt: row.soldAt,
    fee: row.fee,
    feeCurrency: row.feeCurrency,
  }
}
