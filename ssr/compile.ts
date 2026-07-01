/**
 * compile — Module loader with caching for SSR page/layout modules.
 *
 * Node.js 24+ natively supports TypeScript via `import()`, so no
 * compilation step is needed on the server side. This module provides
 * a simple cached loader that deduplicates concurrent loads.
 *
 * For browser-side module serving (dev mode), see the `ssr/module.ts`
 * module which uses esbuild's `transformSync`.
 */
import { resolve, isAbsolute } from 'node:path'

const moduleCache = new Map<string, Promise<unknown>>()
const loading = new Map<string, Promise<unknown>>()

/**
 * Load a `.ts` module with caching.
 *
 * - Modules are loaded once and cached indefinitely.
 * - Concurrent calls for the same path share a single load promise.
 * - Cache can be cleared for a specific path or entirely.
 *
 * @param path - Absolute or relative path to a `.ts` module.
 * @returns The module exports.
 */
export async function loadModule<T = Record<string, unknown>>(path: string): Promise<T> {
  const absPath = isAbsolute(path) ? path : resolve(process.cwd(), path)

  const cached = moduleCache.get(absPath)
  if (cached) return cached as Promise<T>

  // Deduplicate concurrent loads
  const inFlight = loading.get(absPath)
  if (inFlight) return inFlight as Promise<T>

  const promise = import(absPath)
    .then((mod) => {
      loading.delete(absPath)
      moduleCache.set(absPath, Promise.resolve(mod))
      return mod as T
    })
    .catch((err: unknown) => {
      loading.delete(absPath)
      moduleCache.delete(absPath)
      throw new Error(
        `[compile] Failed to load module "${path}": ${err instanceof Error ? err.message : String(err)}`,
      )
    })

  loading.set(absPath, promise)
  return promise
}

/**
 * Clear the module cache for a specific path or entirely.
 *
 * @param path - If provided, only clear this module. If omitted, clear all.
 */
export function clearModuleCache(path?: string): void {
  if (path) {
    const absPath = isAbsolute(path) ? path : resolve(process.cwd(), path)
    moduleCache.delete(absPath)
    loading.delete(absPath)
  } else {
    moduleCache.clear()
    loading.clear()
  }
}

/**
 * Get the number of cached modules (for testing/debugging).
 */
export function cachedModuleCount(): number {
  return moduleCache.size
}
