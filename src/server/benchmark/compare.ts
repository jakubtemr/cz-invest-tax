import Decimal from 'decimal.js'
import { AppError } from '../errors.js'
import { type DatedFlow, xirr } from './xirr.js'

export interface ExternalFlow {
  readonly day: string
  // Money the investor moved into (positive) or out of (negative) the brokerage, in crowns.
  readonly amountCzk: Decimal
}

export type DayLookup = (day: string) => Decimal | null

export interface BenchmarkInput {
  readonly flows: readonly ExternalFlow[]
  readonly portfolioValueCzk: Decimal
  // The day the portfolio value was taken; the index is valued on the same day.
  readonly asOf: string
  readonly closeOn: DayLookup
  readonly usdRate: DayLookup
}

export interface BenchmarkComparison {
  readonly since: string
  readonly asOf: string
  readonly netInvestedCzk: string
  readonly portfolioValueCzk: string
  readonly benchmarkValueCzk: string
  readonly differenceCzk: string
  // Null when the level is zero - everything withdrawn - and a ratio has no meaning.
  readonly differencePct: string | null
  readonly portfolioGainCzk: string
  readonly benchmarkGainCzk: string
  readonly portfolioXirrPct: string
  readonly benchmarkXirrPct: string
  readonly alphaPp: string
}

const MONEY_PLACES = 2
const PERCENT_PLACES = 2
const HUNDRED = new Decimal(100)

function required(lookup: DayLookup, day: string, code: string, what: string): Decimal {
  const value = lookup(day)
  if (value === null) throw new AppError(`No ${what} for ${day}`, code)
  return value
}

// The shadow portfolio: every crown that entered the account buys the index at that day's close,
// every crown that left sells it. What it is worth on the valuation day is the level to beat.
function shadowUnits(input: BenchmarkInput): Decimal {
  return input.flows.reduce((units, flow) => {
    const usd = flow.amountCzk.div(required(input.usdRate, flow.day, 'BENCHMARK_FX_MISSING', 'USD rate'))
    const close = required(input.closeOn, flow.day, 'BENCHMARK_PRICE_MISSING', 'index close')
    return units.plus(usd.div(close))
  }, new Decimal(0))
}

function investorFlows(flows: readonly ExternalFlow[], finalValue: Decimal, asOf: string): DatedFlow[] {
  return [...flows.map((flow) => ({ day: flow.day, amount: flow.amountCzk.neg() })), { day: asOf, amount: finalValue }]
}

const TOTAL_LOSS = new Decimal(-1)

// A side worth nothing with no withdrawal to show for it lost everything: the NPV only reaches
// zero as the rate tends to -100 %, which Newton cannot land on, so it is stated outright.
function annualReturn(flows: readonly ExternalFlow[], finalValue: Decimal, asOf: string): Decimal {
  const dated = investorFlows(flows, finalValue, asOf)
  if (finalValue.isZero() && !dated.some((flow) => flow.amount.gt(0))) return TOTAL_LOSS
  return xirr(dated)
}

const money = (value: Decimal) => value.toFixed(MONEY_PLACES)
const percent = (ratio: Decimal) => ratio.times(HUNDRED).toFixed(PERCENT_PLACES)

export function compareToBenchmark(input: BenchmarkInput): BenchmarkComparison {
  if (input.flows.length === 0) throw new AppError('No external flows to compare', 'BENCHMARK_NO_FLOWS')

  const units = shadowUnits(input)
  const benchmarkValue = units
    .times(required(input.closeOn, input.asOf, 'BENCHMARK_PRICE_MISSING', 'index close'))
    .times(required(input.usdRate, input.asOf, 'BENCHMARK_FX_MISSING', 'USD rate'))
  const netInvested = input.flows.reduce((sum, flow) => sum.plus(flow.amountCzk), new Decimal(0))

  const portfolioXirr = annualReturn(input.flows, input.portfolioValueCzk, input.asOf)
  const benchmarkXirr = annualReturn(input.flows, benchmarkValue, input.asOf)

  return {
    since: input.flows.reduce((min, flow) => (flow.day < min ? flow.day : min), input.flows[0]!.day),
    asOf: input.asOf,
    netInvestedCzk: money(netInvested),
    portfolioValueCzk: money(input.portfolioValueCzk),
    benchmarkValueCzk: money(benchmarkValue),
    differenceCzk: money(input.portfolioValueCzk.minus(benchmarkValue)),
    differencePct: benchmarkValue.isZero() ? null : percent(input.portfolioValueCzk.div(benchmarkValue).minus(1)),
    portfolioGainCzk: money(input.portfolioValueCzk.minus(netInvested)),
    benchmarkGainCzk: money(benchmarkValue.minus(netInvested)),
    portfolioXirrPct: percent(portfolioXirr),
    benchmarkXirrPct: percent(benchmarkXirr),
    alphaPp: percent(portfolioXirr.minus(benchmarkXirr)),
  }
}
