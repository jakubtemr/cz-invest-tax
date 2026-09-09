import { z } from 'zod'
import { createDb, type Db } from './client.js'

// Integration tests run against a real database, never a mock - it just no longer needs a server.
// An in-memory SQLite carrying the real migrations is the same schema the app runs on, and every
// test file gets its own, so nothing leaks between them.

const MIGRATIONS_TABLE = '__drizzle_migrations'
const tableRows = z.array(z.object({ name: z.string() }))

export function createTestDb(): Db {
  return createDb(':memory:')
}

// The table list comes from the database itself, so a table added to the schema cannot be forgotten
// here the way a hand-written list rots. Foreign keys go off for the wipe so the order does not
// matter, and the autoincrement counters reset so ids stay predictable from one test to the next.
export function resetDb(db: Db): void {
  const names = tableRows.parse(
    db.$client
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != ?`)
      .all(MIGRATIONS_TABLE),
  )
  const deletes = names.map((row) => `DELETE FROM "${row.name}";`).join('')
  db.$client.exec(`PRAGMA foreign_keys=OFF;${deletes}DELETE FROM sqlite_sequence;PRAGMA foreign_keys=ON;`)
}
