# cz-invest-tax

Portfolio tracker (Trading 212 sync + manual Freedom24) with a Czech investment-tax module.
Single user, localhost, no auth. Design: `docs/ARCHITECTURE.md`. Tax rules: `docs/TAX.md`.

## Commands

- `pnpm dev` — server on :8792 + Vite on :5178 (proxies `/rpc`)
- `pnpm verify` — typecheck, lint, tests, tax coverage, build. The gate before every commit.
- `pnpm db:generate` — write a migration after changing the schema; `pnpm db:push` for a quick local sync

## Rules

- **Money is never a float.** Amounts are TEXT in SQLite and strings in TypeScript; arithmetic goes
  through `decimal.js`, never through SQL. `Number()` belongs in the UI only.
- **Trading 212: read scope only**, never a write endpoint. Respect the rate limits (`history/*` is
  6 req/min). Writes are idempotent through a unique broker reference plus `onConflictDoNothing`.
- **Integration tests run against a real database, never a mock** — an in-memory SQLite built from
  the migrations by `src/server/db/testing.ts`. No setup, no container.
- **`src/server/tax/**` and `src/shared/**` stay at 100 % coverage.** New tax logic arrives with
  its tests; `pnpm verify` enforces it.
- **The domain layer does not write sentences.** Warnings are `{ code, severity, params }`; the
  client renders them through `src/client/i18n`.
- **Czech text lives in `src/client/i18n/cs.ts` and nowhere else.** Code, comments and warning codes
  are English; legal reasoning goes in `docs/TAX.md` with short `// s. 4(1)(w)` markers at the call
  site.
- `.env` and `data/` never go into git. The database file is the whole portfolio.
