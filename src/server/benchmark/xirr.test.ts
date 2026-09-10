import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import { AppError } from '../errors.js'
import { type DatedFlow, npv, xirr } from './xirr.js'

const flow = (day: string, amount: number): DatedFlow => ({ day, amount: new Decimal(amount) })

describe('xirr', () => {
  it('a single deposit that grows 10 % over exactly 365 days yields 0.10', () => {
    const rate = xirr([flow('2023-01-01', -1000), flow('2024-01-01', 1100)])
    expect(rate.toDecimalPlaces(8).toNumber()).toBe(0.1)
  })

  it('a loss yields a negative rate', () => {
    const rate = xirr([flow('2023-01-01', -1000), flow('2024-01-01', 800)])
    expect(rate.toDecimalPlaces(8).toNumber()).toBe(-0.2)
  })

  it('zeroes the net present value of a monthly DCA series', () => {
    const flows = [
      flow('2023-01-01', -100),
      flow('2023-02-01', -100),
      flow('2023-03-01', -100),
      flow('2023-04-01', -100),
      flow('2024-01-01', 450),
    ]
    const rate = xirr(flows)
    expect(npv(flows, rate).abs().toNumber()).toBeLessThan(1e-9)
    expect(rate.toNumber()).toBeGreaterThan(0.1)
    expect(rate.toNumber()).toBeLessThan(0.3)
  })

  it('converges on a steep gain where a naive Newton step would overshoot', () => {
    const flows = [flow('2024-01-01', -100), flow('2024-03-01', 150)]
    const rate = xirr(flows)
    expect(npv(flows, rate).abs().toNumber()).toBeLessThan(1e-9)
  })

  it('converges on a deposit, withdrawal, deposit series that changes sign twice', () => {
    const flows = [
      flow('2023-01-01', -1000),
      flow('2023-04-01', 600),
      flow('2023-07-01', -800),
      flow('2024-01-01', 1400),
    ]
    const rate = xirr(flows)
    expect(npv(flows, rate).abs().toNumber()).toBeLessThan(1e-9)
  })

  it('a zero final value is not an inflow', () => {
    expect(() => xirr([flow('2023-01-01', -100), flow('2024-01-01', 0)])).toThrow(AppError)
  })

  it('accepts flows in any order', () => {
    const rate = xirr([flow('2024-01-01', 1100), flow('2023-01-01', -1000)])
    expect(rate.toDecimalPlaces(8).toNumber()).toBe(0.1)
  })

  it('rejects a series without both an outflow and an inflow', () => {
    expect(() => xirr([flow('2023-01-01', -100), flow('2024-01-01', -100)])).toThrow(AppError)
    expect(() => xirr([flow('2023-01-01', -100)])).toThrow(AppError)
  })
})
