import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Build-time injection from esbuild --define. `true` in dist/index.js, undefined in TS source. */
declare var __WFW_BUNDLED__: boolean | undefined

/**
 * Whether this code is running from the compiled `dist/index.js` bundle.
 * `false` when running TypeScript source directly (dev workflow in weifuwu repo).
 *
 * Used by modules that need to resolve package-internal files differently
 * depending on whether they are compiled (published npm package) or raw TS.
 */
export function isBundled(): boolean {
  return typeof __WFW_BUNDLED__ !== 'undefined' ? __WFW_BUNDLED__ : false
}

/**
 * Whether `NODE_ENV` is explicitly set to `'development'`.
 *
 * Used for dev-only features: HMR, livereload, React `createRoot` (not hydrate).
 * **Not** the opposite of {@link isProd} — when `NODE_ENV` is unset, both return `false`.
 */
export function isDev(): boolean {
  return process.env.NODE_ENV === 'development'
}

/**
 * Whether `NODE_ENV` is explicitly set to `'production'`.
 *
 * Used for production-only behavior: plain-text 404, suppressed warnings, minified output.
 */
export function isProd(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Load environment variables from a `.env` file into `process.env`.
 *
 * Does **not** override existing `process.env` values.
 * Supports quoted values and inline comments.
 *
 * @param path - Path to `.env` file (default: `'.env'` relative to cwd).
 *
 * ```ts
 * import { loadEnv } from 'weifuwu'
 * loadEnv()
 * console.log(process.env.PORT)
 * ```
 */
export function loadEnv(path?: string): void {
  const filePath = resolve(process.cwd(), path ?? '.env')

  let content: string
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch { return }

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue

    const key = trimmed.slice(0, eqIdx).trim()
    if (!key) continue

    if (process.env[key] !== undefined) continue

    let value = trimmed.slice(eqIdx + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    } else {
      // Strip inline comments: space before #, or # at start of value
      const commentIdx = value.search(/\s#/)
      if (commentIdx !== -1) {
        value = value.slice(0, commentIdx).trimEnd()
      }
    }

    process.env[key] = value
  }
}
