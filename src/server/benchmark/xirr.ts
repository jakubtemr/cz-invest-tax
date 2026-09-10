import Decimal from 'decimal.js'
import { daysBetween } from '../../shared/dates.js'
import { AppError } from '../errors.js'

export interface DatedFlow {
  readonly day: string
  // Signed from the investor's point of view: money paid in is negative, money taken out (or the
  // final value still held) is positive.
  readonly amount: Decimal
}

const DAYS_PER_YEAR = 365
const MAX_ITERATIONS = 100
const TOLERANCE = new Decimal('1e-12')
// Below -100 % a year the discount factor is undefined; above this ceiling nothing a portfolio
// does is meaningful, and the bracket keeps bisection finite.
const RATE_FLOOR = new Decimal('-0.999999')
const RATE_CEILING = new Decimal(100)
const INITIAL_GUESS = new Decimal('0.1')

function years(from: string, to: string): Decimal {
  return new Decimal(daysBetween(from, to)).div(DAYS_PER_YEAR)
}

export function npv(flows: readonly DatedFlow[], rate: Decimal): Decimal {
  const start = earliest(flows)
  const base = rate.plus(1)
  return flows.reduce((sum, flow) => sum.plus(flow.amount.div(base.pow(years(start, flow.day)))), new Decimal(0))
}

function npvDerivative(flows: readonly DatedFlow[], rate: Decimal): Decimal {
  const start = earliest(flows)
  const base = rate.plus(1)
  return flows.reduce((sum, flow) => {
    const t = years(start, flow.day)
    return sum.minus(flow.amount.times(t).div(base.pow(t.plus(1))))
  }, new Decimal(0))
}

function earliest(flows: readonly DatedFlow[]): string {
  return flows.reduce((min, flow) => (flow.day < min ? flow.day : min), flows[0]!.day)
}

// Annualised money-weighted return (the XIRR of spreadsheets, 365-day year). Newton from a
// modest guess, and whenever a step leaves the bracket or stalls, bisection takes over - the
// combination converges for every sign-changing series a portfolio can produce.
export function xirr(flows: readonly DatedFlow[]): Decimal {
  const hasOutflow = flows.some((flow) => flow.amount.isNegative())
  const hasInflow = flows.some((flow) => flow.amount.isPositive())
  if (!hasOutflow || !hasInflow) {
    throw new AppError('XIRR needs at least one outflow and one inflow', 'XIRR_INVALID_FLOWS')
  }

  let low = RATE_FLOOR
  let high = RATE_CEILING
  let rate = INITIAL_GUESS
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const value = npv(flows, rate)
    if (value.abs().lt(TOLERANCE)) return rate
    // NPV falls as the rate rises when the outflows come first, which is the case for a
    // portfolio: a positive NPV means the true rate is higher.
    if (value.isPositive()) low = rate
    else high = rate

    const slope = npvDerivative(flows, rate)
    const newton = slope.isZero() ? null : rate.minus(value.div(slope))
    rate = newton?.gt(low) && newton.lt(high) ? newton : low.plus(high).div(2)
  }
  throw new AppError('XIRR did not converge', 'XIRR_NO_CONVERGENCE')
}
