import { useContext } from 'react'
import { ServerDataContext } from './context.ts'

/**
 * Access server-loaded data in any component.
 * On the server, reads from the request-scoped ServerDataContext.
 * On the client (after hydration), reads from the same context populated by hydrate().
 */
export function useServerData<T extends Record<string, unknown> = Record<string, unknown>>(): T {
  return useContext(ServerDataContext) as T
}
