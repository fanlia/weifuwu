import { createContext, type Context } from 'react'

/**
 * Shared context for useServerData().
 *
 * Uses a global Symbol registry to ensure that even when this module
 * is bundled into multiple entry points (react/index, react/navigation,
 * react/client), they all share the SAME context object.
 *
 * Without this, each bundle creates its own createContext() call,
 * producing independent context objects that don't pass data between them.
 */
const CTX_KEY = Symbol.for('weifuwu.react.ServerDataContext')

function getServerDataContext(): Context<Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalStore = globalThis as any
  if (globalStore[CTX_KEY]) return globalStore[CTX_KEY]
  const ctx = createContext<Record<string, unknown>>({})
  ctx.displayName = 'ServerData'
  globalStore[CTX_KEY] = ctx
  return ctx
}

export const ServerDataContext = getServerDataContext()
