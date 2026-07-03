/**
 * On-the-fly TSX compilation for server-side rendering.
 *
 * Compiles .tsx/.ts component files using esbuild (peerDep), bundles local
 * imports, and rewrites react/weifuwu imports to use the framework's own
 * resolved paths — guaranteeing a single React instance for hooks to work.
 *
 * Compiled output cached in node_modules/.weifuwu/react/ by content hash.
 */

import { stat, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import type { ComponentType } from 'react'

/** Imports that should be resolved from the framework's dependency tree. */
const FRAMEWORK_IMPORTS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/server',
  'react-dom/client',
  'weifuwu',
]

/** All external packages (framework imports + subpaths that don't need rewriting). */
const EXTERNAL_PKGS = [
  'react',
  'react-dom',
  'react-dom/server',
  'react-dom/client',
  'weifuwu',
  'weifuwu/react',

  'weifuwu/react/client',
]

interface CacheEntry {
  mtime: number
  exports: Record<string, unknown>
}

const cache = new Map<string, CacheEntry>()

/**
 * Build an import map: bare specifier → file:// URL, resolved from the
 * framework's own module context (guarantees same React instance).
 */
function buildResolveMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const spec of FRAMEWORK_IMPORTS) {
    try {
      map[spec] = import.meta.resolve(spec)
    } catch { /* optional dep */ }
  }
  return map
}

let _resolveMap: Record<string, string> | null = null
function resolveMap(): Record<string, string> {
  if (!_resolveMap) _resolveMap = buildResolveMap()
  return _resolveMap
}

/** Rewrite bare imports to use file:// URLs from the framework's resolve map. */
function rewriteImports(code: string): string {
  const map = resolveMap()
  let result = code
  for (const [spec, url] of Object.entries(map)) {
    // Rewrite `from "react"` → `from "file://..."`
    const quoted = JSON.stringify(spec) // "react"
    const escaped = quoted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape for regex

    // from "react"
    const reFrom = new RegExp(`(from\\s+)${escaped}`, 'g')
    result = result.replace(reFrom, `$1${JSON.stringify(url)}`)

    // import "react" (side-effect import)
    const reImport = new RegExp(`(import\\s+)${escaped}(\\s*;)`, 'g')
    result = result.replace(reImport, `$1${JSON.stringify(url)}$2`)

    // export ... from "react"
    const reExport = new RegExp(`(export\\s+.*?from\\s+)${escaped}`, 'g')
    result = result.replace(reExport, `$1${JSON.stringify(url)}`)
  }
  return result
}

/**
 * Compile and load a .tsx/.ts component file.
 * Returns the module namespace with named and default exports.
 */
export async function loadTsxModule(entryPath: string): Promise<Record<string, unknown>> {
  const abs = resolve(entryPath)

  try {
    const s = await stat(abs)
    const cached = cache.get(abs)
    if (cached && cached.mtime === s.mtimeMs) {
      return cached.exports
    }
  } catch {
    // File doesn't exist — let esbuild report the error
  }

  const esbuild = await import('esbuild')

  const result = await esbuild.build({
    entryPoints: [abs],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    external: EXTERNAL_PKGS,
    logLevel: 'silent',
  })

  let code = result.outputFiles[0]?.text ?? ''
  if (!code) throw new Error(`esbuild produced empty output for ${entryPath}`)

  // Rewrite imports to use framework's React instance
  code = rewriteImports(code)

  const hash = createHash('sha256').update(code).digest('hex').slice(0, 12)

  // Write to node_modules/.weifuwu/react/ so Node.js module resolution works
  const cwd = process.cwd()
  const tmpDir = join(cwd, 'node_modules', '.weifuwu', 'react')
  await mkdir(tmpDir, { recursive: true })
  const tmpFile = join(tmpDir, `${hash}.mjs`)
  await writeFile(tmpFile, code)

  const mod = await import(tmpFile + '?' + hash)
  const s = await stat(abs)
  cache.set(abs, { mtime: s.mtimeMs, exports: mod as Record<string, unknown> })
  return mod as Record<string, unknown>
}

/**
 * Compile a .tsx file for browser consumption.
 * Externalizes react/react-dom/weifuwu (resolved via importmap),
 * bundles local imports. Returns compiled code + content hash.
 */
export async function compileForBrowser(entryPath: string): Promise<{ code: string; hash: string }> {
  const abs = resolve(entryPath)
  const esbuild = await import('esbuild')

  const result = await esbuild.build({
    entryPoints: [abs],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: [
      'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
      'weifuwu', 'weifuwu/react', 'weifuwu/react/client',
    ],
    logLevel: 'silent',
  })

  const code = result.outputFiles[0]?.text ?? ''
  if (!code) throw new Error(`esbuild produced empty output for ${entryPath}`)
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 12)
  return { code, hash }
}

/**
 * Load a component from a .tsx file.
 * Uses default export if present, otherwise first function export.
 */
export async function loadTsxComponent(entryPath: string): Promise<ComponentType<any>> {
  const mod = await loadTsxModule(entryPath)

  if (mod.default) return mod.default as ComponentType<any>

  for (const [, val] of Object.entries(mod)) {
    if (typeof val === 'function') return val as ComponentType<any>
  }

  throw new Error(
    `No component export found in ${entryPath}. ` +
    `Export a default or named component function.`,
  )
}
