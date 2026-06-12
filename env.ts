import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Whether NODE_ENV is explicitly set to 'development'.
 *  Used for dev-only features: HMR, livereload, no minification, createRoot (not hydrate).
 *  NOT the opposite of isProd() — when NODE_ENV is unset, both return false. */
export function isDev(): boolean {
  return process.env.NODE_ENV === 'development'
}

/** Whether NODE_ENV is explicitly set to 'production'.
 *  Used for production-only behavior: plain-text 404, suppressed warnings, minification. */
export function isProd(): boolean {
  return process.env.NODE_ENV === 'production'
}

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
