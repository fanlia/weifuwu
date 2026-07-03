/**
 * esbuildDev — on-the-fly esbuild compilation middleware for development.
 *
 * Compiles TypeScript/JSX/TSX client bundles in memory on first request,
 * caches results based on source file mtime, and serves with ETag support.
 *
 * @example
 * ```ts
 * import { esbuildDev } from 'weifuwu'
 *
 * app.use(esbuildDev({
 *   entries: {
 *     '/assets/vendor.js': { entry: './client/vendor.ts', bundle: true },
 *     '/assets/client.js': { entry: './client/client.ts', external: ['react', 'react-dom/client'] },
 *   },
 *   importmap: true,  // auto-generate importmap script
 * }))
 * ```
 */

import { resolve, relative, dirname } from 'node:path'
import { stat, readFile, realpath } from 'node:fs/promises'
import type { Middleware, Context } from '../types.ts'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface EsbuildDevEntry {
  /** Source entry point relative to cwd or absolute. Ignored when `clientRouter` is set. */
  entry?: string
  /**
   * Auto-generate a client entry from route config — eliminates client.ts.
   * The generated entry imports routes + layout, calls createBrowserRouter().
   */
  clientRouter?: {
    /** Path to the shared routes file (relative to cwd). Overridden by `pages`. */
    routes?: string
    /** Inline page definitions — alternative to a separate routes.ts file. */
    pages?: Record<string, string>
    /** Layout component import path (relative to cwd). */
    layout: string
    /** Named export to use for layout (default: 'default'). */
    layoutExport?: string
    /** Fallback 404 component import path (relative to cwd). */
    fallback?: string
  }
  /** Bundle all dependencies (default: true). */
  bundle?: boolean
  /** Packages to leave external (not bundled). */
  external?: string[]
  /** Minify output (default: true). */
  minify?: boolean
  /** Target platform (default: 'browser'). */
  platform?: 'browser' | 'neutral' | 'node'
  /** Output format (default: 'esm'). */
  format?: 'esm' | 'iife'
  /** Generate sourcemaps (default: false). */
  sourcemap?: boolean | 'inline' | 'external' | 'linked'
  /** Enable code splitting for dynamic import() (default: false). */
  splitting?: boolean
  /** Compile-time constant substitution. */
  define?: Record<string, string>
  /** Custom loaders per file extension. */
  loader?: Record<string, string>
}

export interface EsbuildDevOptions {
  /** Map of URL path → entry config (string shorthand for { entry }). */
  entries: Record<string, EsbuildDevEntry | string>
  /** Auto-generate a /assets/importmap script that maps react → vendor */
  importmap?: boolean
  /** Importmap overrides (e.g. { 'react': '/assets/custom-vendor.js' }). */
  importmapOverrides?: Record<string, string>
  /** Cache strategy: 'memory' keeps compiled results, 'none' recompiles every request. */
  cache?: 'memory' | 'none'
  /** Custom HTML template for build errors (receives escaped error text). */
  errorTemplate?: (errors: string) => string
}

type Esbuild = typeof import('esbuild')

interface CacheEntry {
  code: string
  etag: string
  files: Map<string, number> // file path → mtimeMs
  chunks?: Map<string, { code: string; etag: string }>
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
  <title>Build Error</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui; background: #1a1a2e; color: #e0e0e0; padding: 2rem; }
    .overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
    .card { background: #16213e; border: 1px solid #e74c3c; border-radius: 12px; padding: 2rem; max-width: 800px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
    h1 { color: #e74c3c; font-size: 1.5rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
    pre { background: #0f0f23; padding: 1.5rem; border-radius: 8px; overflow: auto; font-size: 0.85rem; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <div class="overlay">
    <div class="card">
      <h1>⚠ esbuild Build Error</h1>
      <pre>${escapeHtml(errors)}</pre>
    </div>
  </div>
</body>
</html>`
}

async function collectDeps(entryPath: string): Promise<Map<string, number>> {
  const files = new Map<string, number>()
  const visited = new Set<string>()
  const queue = [entryPath]

  while (queue.length > 0) {
    const p = queue.shift()!
    try {
      const real = await realpath(p)
      if (visited.has(real)) continue
      visited.add(real)
      const s = await stat(real)
      files.set(real, s.mtimeMs)
    } catch {
      // file doesn't exist or can't be read — esbuild will report it
      continue
    }

    // For TypeScript/JSX files, try to find statically importable deps.
    // Quick heuristic: scan for bare/relative import specifiers.
    // We don't follow node_modules (those are stable or handled by esbuild).
    try {
      const content = await readFile(p, 'utf-8')
      const importRe = /from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g
      let m: RegExpExecArray | null
      while ((m = importRe.exec(content)) !== null) {
        const spec = m[1] ?? m[2]
        if (spec.startsWith('.') || spec.startsWith('/')) {
          // Resolve relative to the importing file
          const dir = dirname(p)
          const resolved = resolve(dir, spec)
          // Try common extensions
          for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js']) {
            const candidate = resolved + ext
            if (!visited.has(candidate)) {
              queue.push(candidate)
              break
            }
            break // only push once (the first match)
          }
          queue.push(resolved) // let esbuild figure out the extension
        }
      }
    } catch {
      // ignore read errors
    }
  }

  return files
}

// ═══════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════

export function esbuildDev(opts: EsbuildDevOptions): Middleware<Context, Context> {
  const cache = opts.cache ?? 'memory'
  const importmap = opts.importmap ?? false
  const importmapOverrides = opts.importmapOverrides ?? {}
  const errorTemplate = opts.errorTemplate ?? defaultErrorTemplate

  // Normalize entries
  const entries: Array<{
    path: string
    config: EsbuildDevEntry
  }> = Object.entries(opts.entries).map(([p, e]) => {
    const path = p.startsWith('/') ? p : '/' + p
    const config: EsbuildDevEntry = typeof e === 'string' ? { entry: e } : e
    return { path, config }
  })

  // In-memory cache (path → entry; also stores chunks keyed by chunk name)
  const cacheStore = new Map<string, CacheEntry>()
  // Chunk paths know which entry they belong to
  const chunkMap = new Map<string, string>() // chunkName → entryPath

  // esbuild instance (lazy-loaded)
  let esbuild_: Esbuild | null = null
  let esbuildLoadError: string | null = null

  async function getEsbuild(): Promise<Esbuild> {
    if (esbuild_) return esbuild_
    try {
      esbuild_ = await import('esbuild')
      return esbuild_
    } catch (err) {
      esbuildLoadError = `esbuild is not installed. Run: npm install -D esbuild\n\n${String(err)}`
      throw new Error(esbuildLoadError, { cause: err })
    }
  }

  // Build importmap script tag
  let importmapScript: string | null = null
  function buildImportmap(): string {
    // Auto-detect vendor entries: any path containing 'vendor' or with bundle=true and no externals
    // that exports react → map react + react-dom to it
    const mappings: Record<string, string> = {}

    // First, apply overrides
    Object.assign(mappings, importmapOverrides)

    // Then, scan entries for vendor-like patterns
    for (const { path, config } of entries) {
      const entryName = path.split('/').pop() ?? ''
      if (
        entryName.includes('vendor') ||
        (config.external && config.external.length === 0) ||
        (!config.external && config.bundle !== false)
      ) {
        // This looks like a vendor bundle — map react/react-dom to it
        if (!mappings['react']) mappings['react'] = path
        if (!mappings['react/jsx-runtime']) mappings['react/jsx-runtime'] = path
        if (!mappings['react-dom/client']) mappings['react-dom/client'] = path
        if (!mappings['react-dom']) mappings['react-dom'] = path
      }
    }

    const json = JSON.stringify({ imports: mappings })
    return `<script type="importmap">${json}</script>`
  }

  async function compile(entry: EsbuildDevEntry): Promise<{ code: string; etag: string; chunks?: Map<string, { code: string; etag: string }> }> {
    const esbuild = await getEsbuild()

    const isClientRouter = !!entry.clientRouter
    let entryAbs: string
    let buildOpts: Parameters<typeof esbuild.build>[0]

    if (isClientRouter) {
      // Generate virtual client entry that imports routes + layout
      const cr = entry.clientRouter!
      const virtualModule = 'weifuwu:client-entry'
      entryAbs = virtualModule

      const layoutImport = cr.layoutExport
        ? `import { ${cr.layoutExport} as Layout } from '${cr.layout}'`
        : `import Layout from '${cr.layout}'`

      // Routes: inline from pages, or import from file
      let routesCode: string
      if (cr.pages) {
        const entries = Object.entries(cr.pages).map(([path, component]) =>
          `  '${path}': () => import('${component}'),`,
        )
        routesCode = `const routes = {\n${entries.join('\n')}\n}`
      } else if (cr.routes) {
        routesCode = `import { routes } from '${cr.routes}'`
      } else {
        routesCode = 'const routes = {}'
      }

      const fallbackLine = cr.fallback
        ? `const fallback = () => import('${cr.fallback}')`
        : ''
      const fallbackOpt = cr.fallback ? '  fallback,' : ''

      const generatedCode = [
        `import { createBrowserRouter } from 'weifuwu/react/client'`,
        layoutImport,
        routesCode,
        fallbackLine,
        '',
        'createBrowserRouter({',
        '  layout: Layout,',
        '  routes,',
        fallbackOpt,
        '})',
      ].filter(Boolean).join('\n')

      buildOpts = {
        entryPoints: [virtualModule],
        bundle: entry.bundle ?? true,
        external: entry.external ?? [],
        minify: entry.minify ?? true,
        platform: entry.platform ?? 'browser',
        format: entry.format ?? 'esm',
        sourcemap: entry.sourcemap ?? false,
        splitting: entry.splitting ?? false,
        ...(entry.splitting ? { outdir: resolve('.weifuwu-esbuild-out') } : {}),
        define: entry.define,
        loader: entry.loader as Record<string, import('esbuild').Loader> | undefined,
        write: false,
        logLevel: 'silent',
        plugins: [{
          name: 'weifuwu-client-router',
          setup(build: import('esbuild').PluginBuild) {
            build.onResolve({ filter: new RegExp(`^${virtualModule.replace(/:/g, '\\:')}$`) }, () => ({
              path: virtualModule,
              namespace: 'weifuwu-client',
            }))
            build.onLoad({ filter: /.*/, namespace: 'weifuwu-client' }, () => ({
              contents: generatedCode,
              loader: 'ts',
              resolveDir: process.cwd(),
            }))
          },
        }],
      }
    } else {
      entryAbs = resolve(entry.entry!)
      buildOpts = {
        entryPoints: [entryAbs],
        bundle: entry.bundle ?? true,
        external: entry.external ?? [],
        minify: entry.minify ?? true,
        platform: entry.platform ?? 'browser',
        format: entry.format ?? 'esm',
        sourcemap: entry.sourcemap ?? false,
        splitting: entry.splitting ?? false,
        ...(entry.splitting ? { outdir: dirname(entryAbs) } : {}),
        define: entry.define,
        loader: entry.loader as Record<string, import('esbuild').Loader> | undefined,
        write: false,
        logLevel: 'silent',
      }
    }

    const result = await esbuild.build(buildOpts)

    // Accumulate warnings and errors
    const msgs: string[] = []
    for (const w of result.warnings) {
      const loc = w.location ? ` at ${relative('.', w.location.file ?? '')}:${w.location.line}:${w.location.column}` : ''
      msgs.push(`[warn] ${w.text}${loc}`)
    }
    for (const e of result.errors) {
      const loc = e.location ? ` at ${relative('.', e.location.file ?? '')}:${e.location.line}:${e.location.column}` : ''
      msgs.push(`[error] ${e.text}${loc}`)
    }

    if (result.errors.length > 0) {
      throw new Error(msgs.join('\n'))
    }

    // With splitting, esbuild produces multiple output files.
    // The first one is the entry, the rest are chunks.
    const outputFiles = result.outputFiles!
    const entryFile = outputFiles.find(f => f.path === entryAbs)
      ?? outputFiles[0]
    const code = entryFile?.text ?? ''

    let chunks: Map<string, { code: string; etag: string }> | undefined
    if (outputFiles.length > 1) {
      chunks = new Map()
      for (const f of outputFiles) {
        if (f === entryFile) continue
        const chunkName = f.path.split('/').pop() ?? f.path
        chunks.set(chunkName, { code: f.text, etag: `"esbuild-${hashCode(f.text)}"` })
      }
    }

    const etag = `"esbuild-${hashCode(code)}"`

    // Log warnings to stderr
    if (msgs.length > 0) {
      // eslint-disable-next-line no-console
      console.error('[esbuildDev]', msgs.join('\n'))
    }

    return { code, etag, chunks }
  }

  function isCacheValid(cached: CacheEntry): Promise<boolean> {
    return Promise.all(
      [...cached.files].map(async ([file, mtime]) => {
        try {
          const s = await stat(file)
          return s.mtimeMs === mtime
        } catch {
          return false // file deleted
        }
      }),
    ).then(results => results.every(Boolean))
  }



  return async (req, ctx, next) => {
    const url = new URL(req.url)
    const pathname = url.pathname

    // Handle importmap request
    if (importmap && pathname === '/assets/importmap') {
      if (!importmapScript) importmapScript = buildImportmap()
      return new Response(importmapScript, {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      })
    }

    // Match entry or chunk
    const matched = entries.find(e => e.path === pathname)
    const chunkName = pathname.split('/').pop() ?? ''
    const chunkOwner = chunkMap.get(chunkName)

    if (!matched && !chunkOwner) return next(req, ctx)

    // Serve a cached chunk
    if (!matched && chunkOwner) {
      const ownerCache = cacheStore.get(chunkOwner)
      const chunk = ownerCache?.chunks?.get(chunkName)
      if (chunk) {
        if (req.headers.get('if-none-match') === chunk.etag) {
          return new Response(null, { status: 304 })
        }
        return new Response(chunk.code, {
          headers: {
            'Content-Type': 'text/javascript; charset=utf-8',
            ETag: chunk.etag,
            'Cache-Control': 'no-cache',
          },
        })
      }
      return next(req, ctx)
    }

    const { config } = matched!

    try {
      // Check cache
      if (cache === 'memory') {
        const cached = cacheStore.get(pathname)
        if (cached) {
          const valid = await isCacheValid(cached)
          if (valid) {
            // Check ETag for 304
            if (req.headers.get('if-none-match') === cached.etag) {
              return new Response(null, { status: 304 })
            }
            return new Response(cached.code, {
              headers: {
                'Content-Type': 'text/javascript; charset=utf-8',
                ETag: cached.etag,
                'Cache-Control': 'no-cache',
              },
            })
          }
          // Cache invalidated — drop it and its chunks
          for (const [cn] of cached.chunks ?? []) chunkMap.delete(cn)
          cacheStore.delete(pathname)
        }
      }

      // Compile
      const { code, etag, chunks } = await compile(config)

      // Collect dependency files for cache invalidation
      const depEntry = config.clientRouter?.routes
        ?? (config.clientRouter?.pages ? Object.values(config.clientRouter.pages)[0] : undefined)
        ?? config.entry!
      const deps = await collectDeps(resolve(depEntry))

      // Store cache (including chunks)
      if (cache === 'memory') {
        cacheStore.set(pathname, { code, etag, files: deps, chunks })
        if (chunks) {
          for (const [cn] of chunks) chunkMap.set(cn, pathname)
        }
      }

      return new Response(code, {
        headers: {
          'Content-Type': 'text/javascript; charset=utf-8',
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

// ═══════════════════════════════════════════════════════════════
// Simple string hash
// ═══════════════════════════════════════════════════════════════

function hashCode(s: string): string {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    hash = ((hash << 5) - hash) + ch
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}
