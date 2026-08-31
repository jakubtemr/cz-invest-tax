import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import type { AppRouter } from '../server/router.js'

const link = new RPCLink({ url: `${window.location.origin}/rpc` })

export const api: RouterClient<AppRouter> = createORPCClient(link)

export type Overview = Awaited<ReturnType<typeof api.portfolio.overview>>
export type OverviewAccount = Overview['accounts'][number]
export type OverviewPosition = OverviewAccount['positions'][number]

// Whatever comes back from a failed call, rendered as something a person can read. The server
// already put a message and a code on its AppErrors; anything else is a network or runtime fault.
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
