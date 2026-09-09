import { describe, expect, it } from 'vitest'
import { createDb } from './client.js'

describe('createDb', () => {
  it('creates the schema on open, so a first run needs nothing but a checkout', () => {
    const db = createDb(':memory:')
    const tables = db.$client.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
    expect(tables.length).toBeGreaterThan(5)
  })

  it('refuses a connection URL instead of turning it into a directory tree', () => {
    // A DATABASE_URL left over from the Postgres days used to be created as ./postgres:/host/db
    expect(() => createDb('postgres://invest:invest@localhost:5459/invest')).toThrow(
      expect.objectContaining({ code: 'DB_FILE_INVALID' }),
    )
    expect(() => createDb('file:///tmp/x.db')).toThrow(expect.objectContaining({ code: 'DB_FILE_INVALID' }))
  })
})
