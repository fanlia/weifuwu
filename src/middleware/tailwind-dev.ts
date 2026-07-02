/**
 * tailwindDev — on-the-fly Tailwind CSS v4 compilation for development.
 *
 * Compiles a CSS entry file (with @import "tailwindcss") and scans content
 * files for class names, generating optimized CSS in memory on first request.
 *
 * Caches results based on source file mtime and serves with ETag support.
 *
 * @example
 * ```ts
 * import { tailwindDev } from 'weifuwu'
 *
 * app.use(tailwindDev({
 *   '/assets/tailwind.css': {
 *     entry: './styles/input.css',
 *     content: ['./components/**\/*.ts', './pages/**\/*.ts'],
 *   },
 * }))
 * ```
 *
 * CSS entry example (styles/input.css):
 * ```css
 * @import "tailwindcss";
 * ```
 */

import { resolve } from 'node:path'
import { stat, readFile, realpath } from 'node:fs/promises'
import { glob } from 'node:fs/promises'
import type { Middleware, Context } from '../types.ts'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface TailwindDevEntry {
  /** Path to CSS entry file (with @import "tailwindcss"). */
  entry: string
  /** Glob patterns for content files to scan for class names. */
  content?: string[]
  /** Minify output (default: false in dev). */
  minify?: boolean
}

export interface TailwindDevOptions {
  /** Map of URL path → entry config (string shorthand for { entry }). */
  entries: Record<string, TailwindDevEntry | string>
  /** Cache strategy: 'memory' keeps compiled results, 'none' recompiles every request. */
  cache?: 'memory' | 'none'
  /** Custom HTML template for build errors (receives escaped error text). */
  errorTemplate?: (errors: string) => string
}

type CompileFn = typeof import('@tailwindcss/node').compile

interface CacheEntry {
  css: string
  etag: string
  files: Map<string, number> // file path → mtimeMs
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function defaultErrorTemplate(errors: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tailwind Build Error</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui; background: #1a1a2e; color: #e0e0e0; padding: 2rem; }
    .overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
    .card { background: #16213e; border: 1px solid #06b6d4; border-radius: 12px; padding: 2rem; max-width: 800px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
    h1 { color: #06b6d4; font-size: 1.5rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
    pre { background: #0f0f23; padding: 1.5rem; border-radius: 8px; overflow: auto; font-size: 0.85rem; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <div class="overlay">
    <div class="card">
      <h1>🎨 Tailwind CSS Build Error</h1>
      <pre>${escapeHtml(errors)}</pre>
    </div>
  </div>
</body>
</html>`
}

/**
 * Regex to extract potential Tailwind v4 class names from source files.
 * Matches: utility classes, modifiers (hover:, md:, etc.), arbitrary values,
 * and grouped variants. Intentionally permissive — Tailwind's build()
 * silently ignores non-matching candidates.
 */
const TW_CANDIDATE_RE = /[a-z][\w-]*(?::[a-z][\w-]*)*(?:-\[[^\]]*\])*(?:\/[0-9]+)?/gi

/**
 * Regex to find content strings likely to contain class names:
 *   class="..."  className="..."  class: "..."  cn("...")  clsx("...")
 *   Also captures bare strings in template literals and arrays.
 */
const CLASS_CONTEXT_RE = /(?:class(?:Name)?\s*[=:]\s*["'`]([^"'`]+)["'`]|["'`]([^"'`\n]{2,})["'`])/g

async function extractCandidates(patterns: string[], root: string): Promise<string[]> {
  const seen = new Set<string>()

  for (const pattern of patterns) {
    const resolved = resolve(root, pattern)
    try {
      for await (const file of glob(resolved)) {
        try {
          const content = await readFile(file, 'utf-8')

          // Extract strings that are likely in class-name contexts
          for (const m of content.matchAll(CLASS_CONTEXT_RE)) {
            const str = m[1] ?? m[2]
            if (!str) continue
            // Extract individual class-name candidates from the string
            for (const c of str.matchAll(TW_CANDIDATE_RE)) {
              seen.add(c[0])
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    } catch {
      // glob error — skip
    }
  }

  return [...seen]
}

async function collectFileMtimes(files: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  await Promise.all(
    files.map(async (f) => {
      try {
        const s = await stat(f)
        map.set(f, s.mtimeMs)
      } catch {
        // file disappeared
      }
    }),
  )
  return map
}

function isCacheValid(cached: CacheEntry): Promise<boolean> {
  return Promise.all(
    [...cached.files].map(async ([file, mtime]) => {
      try {
        const s = await stat(file)
        return s.mtimeMs === mtime
      } catch {
        return false
      }
    }),
  ).then((results) => results.every(Boolean))
}

// ═══════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════

export function tailwindDev(opts: TailwindDevOptions): Middleware<Context, Context> {
  const cacheMode = opts.cache ?? 'memory'
  const errorTemplate = opts.errorTemplate ?? defaultErrorTemplate

  // Normalize entries
  const entries: Array<{
    path: string
    config: TailwindDevEntry
  }> = Object.entries(opts.entries).map(([p, e]) => {
    const path = p.startsWith('/') ? p : '/' + p
    const config: TailwindDevEntry = typeof e === 'string' ? { entry: e } : e
    return { path, config }
  })

  // In-memory cache
  const cacheStore = new Map<string, CacheEntry>()

  // Lazy-loaded @tailwindcss/node
  let compileFn: CompileFn | null = null
  let loadError: string | null = null

  async function getCompile(): Promise<CompileFn> {
    if (compileFn) return compileFn
    try {
      const mod = await import('@tailwindcss/node')
      compileFn = mod.compile
      return compileFn
    } catch (err) {
      loadError = `@tailwindcss/node is not installed. Run: npm install -D tailwindcss @tailwindcss/node\n\n${String(err)}`
      throw new Error(loadError)
    }
  }

  async function compileCss(entry: TailwindDevEntry): Promise<{ css: string; etag: string; files: string[] }> {
    const compile = await getCompile()

    const entryAbs = resolve(entry.entry)

    // Read the CSS entry file
    const cssSource = await readFile(entryAbs, 'utf-8')
    const baseDir = resolve(entry.entry, '..')

    // Track dependencies
    const deps: string[] = [entryAbs]

    // Compile the CSS to get the design system
    const result = await compile(cssSource, {
      base: baseDir,
      onDependency: (p: string) => {
        if (!deps.includes(p)) deps.push(p)
      },
    })

    // Resolve content sources from the compiled result
    const contentPatterns = entry.content ?? []
    // Also add source patterns from @source directives
    for (const src of result.sources) {
      if (!src.negated) {
        contentPatterns.push(resolve(src.base, src.pattern))
      }
    }

    // Extract candidates from content files
    let candidates: string[] = []
    if (contentPatterns.length > 0) {
      candidates = await extractCandidates(contentPatterns, baseDir)
    }

    // Build CSS from candidates
    const css = result.build(candidates)

    // Collect content file mtines for cache invalidation
    for (const pattern of contentPatterns) {
      try {
        for await (const file of glob(resolve(baseDir, pattern))) {
          if (!deps.includes(file)) deps.push(file)
        }
      } catch {
        // skip
      }
    }

    const etag = `"tw-${hashCode(css)}"`
    return { css, etag, files: deps }
  }

  return async (req, ctx, next) => {
    const url = new URL(req.url)
    const pathname = url.pathname

    // Match entry
    const matched = entries.find((e) => e.path === pathname)
    if (!matched) return next(req, ctx)

    const { config } = matched

    try {
      // Check cache
      if (cacheMode === 'memory') {
        const cached = cacheStore.get(pathname)
        if (cached) {
          const valid = await isCacheValid(cached)
          if (valid) {
            if (req.headers.get('if-none-match') === cached.etag) {
              return new Response(null, { status: 304 })
            }
            return new Response(cached.css, {
              headers: {
                'Content-Type': 'text/css; charset=utf-8',
                ETag: cached.etag,
                'Cache-Control': 'no-cache',
              },
            })
          }
          cacheStore.delete(pathname)
        }
      }

      // Compile
      const { css, etag, files } = await compileCss(config)

      // Store cache
      if (cacheMode === 'memory') {
        const mtimes = await collectFileMtimes(files)
        cacheStore.set(pathname, { css, etag, files: mtimes })
      }

      return new Response(css, {
        headers: {
          'Content-Type': 'text/css; charset=utf-8',
          ETag: etag,
          'Cache-Control': 'no-cache',
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const html = errorTemplate(message)
      return new Response(html, {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }
  }
}

function hashCode(s: string): string {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    hash = ((hash << 5) - hash) + ch
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}
