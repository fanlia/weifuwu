/**
 * On-the-fly TSX compilation for ctx.render().
 *
 * Compiles .tsx files with esbuild, caches by source-content hash.
 * Externalizes react/react-dom — the framework's own instance is used.
 * Persisted to disk for fast restarts.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import type { ComponentType } from 'react'

const EXTERNAL_PKGS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/server',
  'react-dom/client',
  'weifuwu',
  'weifuwu/react',
]

const FRAMEWORK_IMPORTS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/server',
  'react-dom/client',
  'weifuwu',
  'weifuwu/react',
]

interface CacheEntry {
  /** SHA256 of source content (for cache validation). */
  sourceHash: string
  mod: Record<string, unknown>
}

const memCache = new Map<string, CacheEntry>()

function buildResolveMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const spec of FRAMEWORK_IMPORTS) {
    try { map[spec] = import.meta.resolve(spec) } catch { /* optional */ }
  }
  return map
}

let _resolveMap: Record<string, string> | null = null
function resolveMap(): Record<string, string> {
  if (!_resolveMap) _resolveMap = buildResolveMap()
  return _resolveMap
}

function rewriteImports(code: string): string {
  const map = resolveMap()
  let result = code
  for (const [spec, url] of Object.entries(map)) {
    const quoted = JSON.stringify(spec)
    const escaped = quoted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result
      .replace(new RegExp(`(from\\s+)${escaped}`, 'g'), `$1${JSON.stringify(url)}`)
      .replace(new RegExp(`(import\\s+)${escaped}(\\s*;)`, 'g'), `$1${JSON.stringify(url)}$2`)
      .replace(new RegExp(`(export\\s+.*?from\\s+)${escaped}`, 'g'), `$1${JSON.stringify(url)}`)
  }
  return result
}

/** Cache directory (overridable via react options). */
let _cacheDir: string | null = null

export function setReactCacheDir(dir: string) {
  _cacheDir = dir
}

function getCacheDir(): string {
  if (_cacheDir) return _cacheDir
  _cacheDir = join(process.cwd(), 'node_modules', '.weifuwu', 'react')
  return _cacheDir
}

/**
 * Load a .tsx/.ts module, compiling on-the-fly with esbuild.
 * Results are:
 *  1. Cached in memory by source-content hash
 *  2. Persisted to disk ({cacheDir}/{sourceHash}.mjs) for instant restarts
 */
export async function loadTsxModule(entryPath: string): Promise<Record<string, unknown>> {
  const abs = resolve(entryPath)

  // 1. Read source and compute hash
  let source: string
  try {
    source = await readFile(abs, 'utf-8')
  } catch {
    throw new Error(`Cannot read file: ${entryPath}`)
  }
  const sourceHash = createHash('sha256').update(source).digest('hex').slice(0, 16)

  // 2. Check memory cache
  const memCached = memCache.get(abs)
  if (memCached && memCached.sourceHash === sourceHash) {
    return memCached.mod
  }

  const tmpDir = getCacheDir()
  const tmpFile = join(tmpDir, `${sourceHash}.mjs`)

  // 3. Try disk cache — import existing compiled file
  if (existsSync(tmpFile)) {
    try {
      const mod = await import(tmpFile + '?' + sourceHash)
      memCache.set(abs, { sourceHash, mod: mod as Record<string, unknown> })
      return mod as Record<string, unknown>
    } catch {
      // Disk cache corrupted or stale — recompile
    }
  }

  // 4. Compile with esbuild
  const esbuild = await import('esbuild')
  const result = await esbuild.build({
    entryPoints: [abs],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    external: EXTERNAL_PKGS,
    logLevel: 'silent',
  })

  let code = result.outputFiles[0]?.text ?? ''
  if (!code) throw new Error(`esbuild produced empty output for ${entryPath}`)
  code = rewriteImports(code)

  // 5. Write to disk cache & import
  await mkdir(dirname(tmpFile), { recursive: true })
  await writeFile(tmpFile, code)

  const mod = await import(tmpFile + '?' + sourceHash)
  memCache.set(abs, { sourceHash, mod: mod as Record<string, unknown> })
  return mod as Record<string, unknown>
}

export async function loadTsxComponent(entryPath: string): Promise<ComponentType> {
  const mod = await loadTsxModule(entryPath)

  if (mod.default && typeof mod.default === 'function') return mod.default as ComponentType

  for (const [, val] of Object.entries(mod)) {
    if (typeof val === 'function') return val as ComponentType
  }

  throw new Error(`No component export found in ${entryPath}. Export a default or named component function.`)
}
