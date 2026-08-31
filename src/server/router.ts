import { ORPCError, os } from '@orpc/server'
import { z } from 'zod'
import { AppError } from './errors.js'
import type { ManualService } from './manual/manual-service.js'
import type { PortfolioService } from './portfolio/portfolio-service.js'
import { IDLE_STATUS, type SyncRunner } from './sync/sync-runner.js'
import { dividendsCsv, salesCsv } from './tax/csv.js'
import type { TaxService } from './tax/tax-service.js'

// A positive number without zero and with a sane ceiling (PG numeric takes more, but the input is
// typed by a person).
const POSITIVE_DECIMAL = /^(?!0+(\.0+)?$)\d{1,12}(\.\d{1,10})?$/
const NON_NEGATIVE_DECIMAL = /^\d{1,12}(\.\d{1,2})?$/

const currencyInput = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z]{3}$/, 'Currency must be a three-letter ISO code'))

const addLotInput = z.object({
  ticker: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(200).nullish(),
  currency: currencyInput,
  quantity: z.string().trim().regex(POSITIVE_DECIMAL, 'Quantity must be a positive number'),
  pricePerShare: z.string().trim().regex(POSITIVE_DECIMAL, 'Price must be a positive number'),
  acquiredAt: z.iso.date(),
  broker: z.enum(['F24', 'T212']).default('F24'),
})

const transferRemainderInput = z.object({
  fromTicker: z.string().trim().min(1).max(32),
  toTicker: z.string().trim().min(1).max(32),
  quantity: z.string().trim().regex(POSITIVE_DECIMAL, 'Quantity must be a positive number').nullish(),
})

const setPriceInput = z.object({
  instrumentId: z.number().int().positive(),
  currentPrice: z.string().trim().regex(POSITIVE_DECIMAL, 'Price must be a positive number'),
})

const setCountryInput = z.object({
  instrumentId: z.number().int().positive(),
  country: z.string().trim().toUpperCase().min(2).max(7),
})

const taxYearInput = z.object({
  year: z.number().int().min(2000).max(2100),
  otherBasesCzk: z.string().trim().regex(NON_NEGATIVE_DECIMAL, 'Amount must be a number').optional(),
})

export interface RouterDeps {
  portfolio: PortfolioService
  manual: ManualService
  sync: SyncRunner | null
  tax: TaxService
}

// An AppError carries a message meant for the user and must not disappear into a generic 500;
// everything else gets logged (the only place a server error is ever seen) and masked by oRPC.
function toRpcError(error: unknown): never {
  console.error('[rpc]', error)
  if (error instanceof AppError) {
    const status = error.code.endsWith('NOT_FOUND') ? 'NOT_FOUND' : 'BAD_REQUEST'
    throw new ORPCError(status, { message: `${error.message} (${error.code})` })
  }
  throw error
}

export function createRouter(deps: RouterDeps) {
  return {
    portfolio: {
      overview: os.handler(() => deps.portfolio.overview().catch(toRpcError)),
    },
    sync: {
      // Kicks the sync off in the background and returns immediately - progress is polled.
      t212: os.handler(() => {
        if (!deps.sync) {
          throw new ORPCError('BAD_REQUEST', {
            message: 'No T212 key configured - add T212_API_KEY and T212_API_SECRET to .env and restart the server.',
          })
        }
        return deps.sync.start()
      }),
      status: os.handler(() => deps.sync?.status() ?? IDLE_STATUS),
    },
    tax: {
      overview: os.input(taxYearInput).handler(({ input }) => deps.tax.overview(input).catch(toRpcError)),
      exportSales: os.input(taxYearInput).handler(({ input }) =>
        deps.tax
          .overview(input)
          .then((overview) => salesCsv(overview.summary.sales))
          .catch(toRpcError),
      ),
      exportDividends: os.input(taxYearInput).handler(({ input }) =>
        deps.tax
          .overview(input)
          .then((overview) => dividendsCsv(overview.summary.dividends.items))
          .catch(toRpcError),
      ),
    },
    manual: {
      addLot: os
        .input(addLotInput)
        .handler(({ input }) =>
          deps.manual.addLot({ ...input, acquiredAt: new Date(input.acquiredAt) }).catch(toRpcError),
        ),
      removeLot: os
        .input(z.object({ lotId: z.number().int().positive() }))
        .handler(({ input }) => deps.manual.removeLot(input.lotId).catch(toRpcError)),
      transferRemainder: os
        .input(transferRemainderInput)
        .handler(({ input }) => deps.manual.transferRemainder(input).catch(toRpcError)),
      setPrice: os
        .input(setPriceInput)
        .handler(({ input }) => deps.manual.setPrice(input.instrumentId, input.currentPrice).catch(toRpcError)),
      setCountry: os
        .input(setCountryInput)
        .handler(({ input }) => deps.manual.setCountry(input.instrumentId, input.country).catch(toRpcError)),
    },
  }
}

export type AppRouter = ReturnType<typeof createRouter>
