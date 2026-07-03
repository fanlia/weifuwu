/**
 * On-the-fly TSX compilation for ctx.render().
 *
 * Compiles .tsx files with esbuild, caches by mtime.
 * Externalizes react/react-dom — the framework's own instance is used.
 */

import { stat, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
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
  mtime: number
  mod: Record<string, unknown>
}

const cache = new Map<string, CacheEntry>()

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

export async function loadTsxModule(entryPath: string): Promise<Record<string, unknown>> {
  const abs = resolve(entryPath)

  try {
    const s = await stat(abs)
    const cached = cache.get(abs)
    if (cached && cached.mtime === s.mtimeMs) return cached.mod
  } catch { /* file doesn't exist — esbuild will report */ }

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

  const hash = createHash('sha256').update(code).digest('hex').slice(0, 12)
  const tmpDir = join(process.cwd(), 'node_modules', '.weifuwu', 'react')
  await mkdir(tmpDir, { recursive: true })
  const tmpFile = join(tmpDir, `${hash}.mjs`)
  await writeFile(tmpFile, code)

  const mod = await import(tmpFile + '?' + hash)
  const s = await stat(abs)
  cache.set(abs, { mtime: s.mtimeMs, mod: mod as Record<string, unknown> })
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
