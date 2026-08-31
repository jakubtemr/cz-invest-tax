import { z } from 'zod'

export const t212InstrumentSchema = z.object({
  ticker: z.string(),
  name: z.string().nullish(),
  isin: z.string().nullish(),
  currency: z.string(),
})

export const t212PositionSchema = z.object({
  averagePricePaid: z.number(),
  createdAt: z.string().nullish(),
  currentPrice: z.number().nullish(),
  instrument: t212InstrumentSchema,
  quantity: z.number(),
  quantityAvailableForTrading: z.number().nullish(),
  quantityInPies: z.number().nullish(),
  walletImpact: z
    .object({
      currency: z.string().nullish(),
      currentValue: z.number().nullish(),
      fxImpact: z.number().nullish(),
      totalCost: z.number().nullish(),
      unrealizedProfitLoss: z.number().nullish(),
    })
    .nullish(),
})

export const t212AccountSummarySchema = z.object({
  cash: z.object({
    availableToTrade: z.number().nullish(),
    inPies: z.number().nullish(),
    reservedForOrders: z.number().nullish(),
  }),
  currency: z.string(),
  id: z.number(),
  investments: z.object({
    currentValue: z.number().nullish(),
    realizedProfitLoss: z.number().nullish(),
    totalCost: z.number().nullish(),
    unrealizedProfitLoss: z.number().nullish(),
  }),
  totalValue: z.number().nullish(),
})

// Per-fill charges the broker settles in the account currency: conversion fees, stamp duty,
// financial transaction taxes. Amounts arrive negative because they are debits.
export const t212FillFeeSchema = z.object({
  name: z.string(),
  currency: z.string().nullish(),
  quantity: z.number(),
  chargedAt: z.string().nullish(),
})

export const t212HistoricalOrderSchema = z.object({
  order: z
    .object({
      createdAt: z.string().nullish(),
      currency: z.string().nullish(),
      id: z.number(),
      instrument: t212InstrumentSchema.nullish(),
      quantity: z.number().nullish(),
      side: z.enum(['BUY', 'SELL']).nullish(),
      status: z.string().nullish(),
      ticker: z.string().nullish(),
      type: z.string().nullish(),
    })
    .nullish(),
  fill: z
    .object({
      filledAt: z.iso.datetime({ offset: true }),
      id: z.number(),
      price: z.number(),
      quantity: z.number(),
      type: z.string(),
      walletImpact: z
        .object({
          currency: z.string().nullish(),
          fxRate: z.number().nullish(),
          netValue: z.number().nullish(),
          realisedProfitLoss: z.number().nullish(),
          taxes: z.array(t212FillFeeSchema).nullish(),
        })
        .nullish(),
    })
    .nullish(),
})

export const t212DividendItemSchema = z.object({
  amount: z.number(),
  currency: z.string(),
  grossAmountPerShare: z.number().nullish(),
  instrument: t212InstrumentSchema.nullish(),
  paidOn: z.iso.datetime({ offset: true }),
  quantity: z.number().nullish(),
  reference: z.string(),
  ticker: z.string().nullish(),
  type: z.string().nullish(),
})

export const t212TransactionItemSchema = z.object({
  amount: z.number(),
  currency: z.string(),
  dateTime: z.iso.datetime({ offset: true }),
  reference: z.string(),
  type: z.string(),
})

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextPagePath: z.string().nullish(),
  })
}

export type T212FillFee = z.infer<typeof t212FillFeeSchema>
export type T212Instrument = z.infer<typeof t212InstrumentSchema>
export type T212Position = z.infer<typeof t212PositionSchema>
export type T212AccountSummary = z.infer<typeof t212AccountSummarySchema>
export type T212HistoricalOrder = z.infer<typeof t212HistoricalOrderSchema>
export type T212DividendItem = z.infer<typeof t212DividendItemSchema>
export type T212TransactionItem = z.infer<typeof t212TransactionItemSchema>
