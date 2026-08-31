import type { Db } from '../db/client.js'
import { type SyncProgress, SyncService, type T212Api } from './sync-service.js'

export interface SyncStatus extends SyncProgress {
  running: boolean
  startedAt: string | null
  finishedAt: string | null
  error: string | null
}

export const IDLE_STATUS: SyncStatus = {
  running: false,
  phase: 'summary',
  pagesFetched: 0,
  positions: 0,
  lotsAdded: 0,
  salesAdded: 0,
  dividendsAdded: 0,
  transactionsAdded: 0,
  startedAt: null,
  finishedAt: null,
  error: null,
}

const PHASE_LOGS: Record<SyncProgress['phase'], string> = {
  summary: 'account summary',
  positions: 'positions',
  orders: 'order history',
  dividends: 'dividends',
  transactions: 'transactions',
}

// Holds the state of the single running sync: the UI starts it and then polls the status.
// Also a guard against concurrent syncs (a double click) - a second start just returns the state.
export class SyncRunner {
  private current: SyncStatus = IDLE_STATUS
  private readonly service: SyncService

  constructor(
    db: Db,
    api: T212Api,
    private readonly log: (message: string) => void = console.log,
  ) {
    this.service = new SyncService(db, api, (progress) => this.handleProgress(progress))
  }

  start(): SyncStatus {
    if (this.current.running) return this.status()
    this.current = { ...IDLE_STATUS, running: true, startedAt: new Date().toISOString() }
    this.log('[sync] start')
    void this.service
      .syncT212()
      .then((result) => {
        this.current = { ...this.current, ...result, running: false, finishedAt: new Date().toISOString() }
        this.log(
          `[sync] done: ${result.positions} positions, +${result.lotsAdded} purchases, +${result.salesAdded} sales, +${result.dividendsAdded} dividends, +${result.transactionsAdded} transactions`,
        )
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        this.current = { ...this.current, running: false, error: message, finishedAt: new Date().toISOString() }
        this.log(`[sync] CHYBA: ${message}`)
        console.error('[sync]', error)
      })
    return this.status()
  }

  status(): SyncStatus {
    return { ...this.current }
  }

  private handleProgress(progress: SyncProgress): void {
    this.current = { ...this.current, ...progress }
    this.log(
      `[sync] ${PHASE_LOGS[progress.phase]} - ${progress.pagesFetched} pages, +${progress.lotsAdded} purchases, +${progress.salesAdded} sales, +${progress.dividendsAdded} dividends, +${progress.transactionsAdded} transactions`,
    )
  }
}
