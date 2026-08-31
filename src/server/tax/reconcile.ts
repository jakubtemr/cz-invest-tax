import Decimal from 'decimal.js'
import type { OpenLot } from './fifo.js'
import { type TaxWarning, warn } from './warnings.js'

// When the broker reports a different quantity than the transaction history adds up to, the usual
// cause is a split: the history keeps the pre-split shares because a split is not a trade. Rescale
// quantity and price by the factor and KEEP acquiredAt - the holding period survives a split, so
// the three-year test must keep running from the original purchase.

const MAX_SPLIT_DENOMINATOR = 20
const SPLIT_TOLERANCE = new Decimal('0.0001')

export type ReconcileKind = 'split' | 'adjusted' | 'closed' | 'unexplained'

export interface ReconcileResult {
  readonly lots: OpenLot[]
  readonly kind: ReconcileKind | null
  readonly ratio: string | null
}

function sumQuantity(lots: readonly OpenLot[]): Decimal {
  return lots.reduce((sum, lot) => sum.plus(lot.remainingQuantity), new Decimal(0))
}

// Name the ratio only when it lands on a clean n:m - "2:1" is worth telling the user, "1.037" is not.
function splitRatio(factor: Decimal): string | null {
  for (let denominator = 1; denominator <= MAX_SPLIT_DENOMINATOR; denominator++) {
    const numerator = factor.times(denominator)
    if (numerator.minus(numerator.round()).abs().lte(SPLIT_TOLERANCE) && numerator.round().gt(0)) {
      return `${denominator}:${numerator.round().toString()}`
    }
  }
  return null
}

export function reconcileOpenLots(lots: readonly OpenLot[], brokerQuantity: Decimal | null): ReconcileResult {
  const unchanged = { lots: [...lots], kind: null, ratio: null }
  if (brokerQuantity === null) return unchanged

  const history = sumQuantity(lots)
  if (history.equals(brokerQuantity)) return unchanged
  if (brokerQuantity.lte(0)) return { lots: [], kind: 'closed', ratio: null }
  if (history.lte(0)) return { lots: [...lots], kind: 'unexplained', ratio: null }

  const factor = brokerQuantity.div(history)
  const ratio = splitRatio(factor)
  return {
    lots: lots.map((lot) => ({
      ...lot,
      remainingQuantity: new Decimal(lot.remainingQuantity).times(factor).toString(),
      pricePerShare: new Decimal(lot.pricePerShare).div(factor).toString(),
    })),
    kind: ratio ? 'split' : 'adjusted',
    ratio,
  }
}

export function reconcileWarning(
  result: ReconcileResult,
  instrument: string,
  broker: string,
  history: string,
): TaxWarning | null {
  if (result.kind === null) return null
  const params = { instrument, broker, history, ratio: result.ratio ?? '' }
  return warn(`reconcile.${result.kind}` as const, params, result.kind === 'unexplained' ? 'error' : 'info')
}
