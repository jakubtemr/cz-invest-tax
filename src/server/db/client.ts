import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { AppError } from '../errors.js'
import * as schema from './schema.js'

export type Db = ReturnType<typeof createDb>

// A connection URL left over from a previous setup would otherwise be taken as a relative path and
// quietly created as a directory tree - "postgres://host/db" becomes ./postgres:/host/db.
const CONNECTION_URL = /^[a-z][a-z0-9+.-]*:\/\//i

// Resolved from this module rather than the working directory, so the migrations are found however
// the server was started.
const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '../../../drizzle')

// One file, no server, no container. A single-user ledger of a few thousand rows has nothing to gain
// from a database process, and every contributor gains a working checkout without one.
export function createDb(file: string) {
  if (CONNECTION_URL.test(file)) {
    throw new AppError(`DATABASE_FILE must be a file path, not a connection URL: ${file}`, 'DB_FILE_INVALID')
  }
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })

  const sqlite = new Database(file)
  // SQLite ignores foreign keys unless asked, and WAL keeps a read during a write from blocking.
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')

  const db = drizzle(sqlite, { schema })
  // Migrating on open is what lets the app be started with nothing but a checkout: the first run
  // creates the file and the schema together, and a later one applies whatever is new. Cheap and
  // idempotent - drizzle records what it has already run.
  migrate(db, { migrationsFolder: MIGRATIONS })
  return db
}
