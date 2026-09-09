import { desc, eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { accounts, instruments, lots, positions, snapshots } from '../db/schema.js'

export class PortfolioService {
  constructor(private readonly db: Db) {}

  async overview() {
    const [accountRows, positionRows, snapshotRows, manualLots] = await Promise.all([
      this.db.select().from(accounts),
      this.db
        .select({
          id: positions.id,
          accountId: positions.accountId,
          instrumentId: positions.instrumentId,
          ticker: instruments.ticker,
          name: instruments.name,
          isin: instruments.isin,
          instrumentCurrency: instruments.currency,
          quantity: positions.quantity,
          averagePrice: positions.averagePrice,
          currentPrice: positions.currentPrice,
          currentValue: positions.currentValue,
          totalCost: positions.totalCost,
          unrealizedPnl: positions.unrealizedPnl,
          fxImpact: positions.fxImpact,
          valueCurrency: positions.valueCurrency,
          source: positions.source,
          syncedAt: positions.syncedAt,
        })
        .from(positions)
        .innerJoin(instruments, eq(positions.instrumentId, instruments.id)),
      // Newest first, then the first row per account wins - SQLite has no DISTINCT ON, and one
      // snapshot per sync is far too few rows to be worth a window function.
      this.db.select().from(snapshots).orderBy(desc(snapshots.takenAt)),
      this.db
        .select({
          id: lots.id,
          instrumentId: lots.instrumentId,
          ticker: instruments.ticker,
          name: instruments.name,
          quantity: lots.quantity,
          pricePerShare: lots.pricePerShare,
          currency: lots.currency,
          acquiredAt: lots.acquiredAt,
          broker: accounts.broker,
        })
        .from(lots)
        .innerJoin(instruments, eq(lots.instrumentId, instruments.id))
        .innerJoin(accounts, eq(lots.accountId, accounts.id))
        .where(eq(lots.source, 'manual'))
        .orderBy(desc(lots.acquiredAt)),
    ])

    return {
      accounts: accountRows.map((account) => ({
        ...account,
        positions: positionRows.filter((p) => p.accountId === account.id),
        snapshot: snapshotRows.find((s) => s.accountId === account.id) ?? null,
      })),
      manualLots,
    }
  }
}
