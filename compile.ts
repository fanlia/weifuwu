/* eslint-disable @typescript-eslint/no-explicit-any */
import * as esbuild from 'esbuild'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { isDev as _isDev, isBundled } from './env.ts'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { getServerModule, clearServerModule } from './server-registry.ts'

let _userRequire: ReturnType<typeof createRequire> | null = null

export const OUT_DIR = '.weifuwu/ssr'
const cache = new Map<string, any>()

const externals = [
  'react',
  'react-dom',
  'esbuild',
  'graphql',
  'ws',
  'zod',
  '@graphql-tools/schema',
  'ai',
]

let _alias: Record<string, string> | null = null

function resolveAliases(): Record<string, string> {
  if (_alias) return _alias
  const configFiles = ['tsconfig.json', 'jsconfig.json']
  for (const file of configFiles) {
    const p = resolve(file)
    if (existsSync(p)) {
      try {
        const config = JSON.parse(readFileSync(p, 'utf-8'))
        const paths = config.compilerOptions?.paths
        if (paths) {
          const alias: Record<string, string> = {}
          for (const [key, values] of Object.entries(paths as Record<string, string[]>)) {
            const cleanKey = key.replace('/*', '')
            const val = values[0]?.replace('/*', '')
            if (val) alias[cleanKey] = resolve(dirname(p), val)
          }
          _alias = alias
          return alias
        }
      } catch {}
    }
  }
  _alias = {}
  return {}
}

export function id(s: string): string {
  return createHash('md5').update(s).digest('hex').slice(0, 8)
}

export function clearCompileCache() {
  cache.clear()
  clearServerModule()
  _alias = null
}

export async function compileTsx(path: string): Promise<any> {
  const absPath = resolve(path)
  if (cache.has(absPath)) return cache.get(absPath)!
  const outDir = resolve(OUT_DIR)
  mkdirSync(outDir, { recursive: true })
  const hash = id(absPath)
  const outPath = join(outDir, hash + '.js')

  await esbuild.build({
    entryPoints: { [hash]: absPath },
    outdir: outDir,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    jsxImportSource: 'react',
    bundle: true,
    external: externals,
    alias: resolveAliases(),
    write: true,
    allowOverwrite: true,
  })

  const mod = await import(pathToFileURL(outPath).href)
  cache.set(absPath, mod)
  return mod
}

/**
 * Dev hot-reload: per-file transformSync (~0.5ms) + shared vm context.
 * No bundler, no disk I/O. Relative imports are resolved through
 * server-registry recursively.
 */
export function compileTsxDev(path: string): any {
  const absPath = resolve(path)
  const mod = getServerModule(absPath)
  // Also populate compile's cache so compileTsx (production) can share
  cache.set(absPath, mod)
  return mod
}

/** Auto-select dev (registry+vm) or prod (ESM + import) compilation */
export function compile(path: string): Promise<any> {
  return _isDev() ? Promise.resolve(compileTsxDev(path)) : compileTsx(path)
}

let vendorBundle: string | null = null
export let vendorHash = ''

/** Build a single vendor bundle containing all needed vendor modules */
export async function compileVendorBundle(): Promise<string> {
  if (vendorBundle) return vendorBundle
  if (!_userRequire) _userRequire = createRequire(join(process.cwd(), 'package.json'))

  const modules: Record<string, string[]> = {
    react: [],
    'react-dom': ['react'],
    'react-dom/client': ['react'],
    'react/jsx-runtime': ['react'],
  }

  for (const request of Object.keys(modules)) {
    const mod = _userRequire(request)
    const keys = Object.keys(mod).filter((k) => !k.startsWith('_') && k !== 'default')
    modules[request] = keys
  }

  // isBundled() avoids runtime filesystem check — determined at build time via --define.
  // Dev (TS source):   import.meta.dirname = repo root → react.ts barrel file
  // Published (dist/): import.meta.dirname = dist/     → react.js bundled output
  const baseDir = import.meta.dirname ?? __dirname
  const reactAbsPath = isBundled() ? resolve(baseDir, 'react.js') : resolve(baseDir, 'react.ts')
  const reactSrc = readFileSync(reactAbsPath, 'utf-8')
  const wfwKeys: string[] = []
  if (reactAbsPath.endsWith('.ts')) {
    // Parse export { ... } from in TS barrel file
    for (const line of reactSrc.split('\n')) {
      const m = line.match(/^export\s+\{[^}]+\}\s*from/)
      if (m) {
        const names = line
          .slice(line.indexOf('{') + 1, line.indexOf('}'))
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        for (const n of names) {
          if (!n.startsWith('type ') && !wfwKeys.includes(n)) wfwKeys.push(n)
        }
      }
    }
  } else {
    // Parse final export { ... } block in bundled JS
    const exportMatch = reactSrc.match(/\bexport\s*\{([^}]+)\}\s*;/)
    if (exportMatch) {
      const names = exportMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      for (const n of names) {
        if (!n.startsWith('type ') && !wfwKeys.includes(n)) wfwKeys.push(n)
      }
    }
  }

  const used = new Set<string>()
  const stmts = ['']
  for (const [request, keys] of Object.entries(modules)) {
    const unique = keys.filter((k) => !used.has(k) && used.add(k))
    if (unique.length > 0)
      stmts.push(`export { ${unique.join(', ')} } from ${JSON.stringify(request)};`)
  }
  const uidWfw = wfwKeys.filter((k) => !used.has(k) && used.add(k))
  if (uidWfw.length > 0)
    stmts.push(`export { ${uidWfw.join(', ')} } from ${JSON.stringify(reactAbsPath)};`)

  const result = await esbuild.build({
    stdin: { contents: stmts.join('\n'), resolveDir: process.cwd() },
    format: 'esm',
    bundle: true,
    write: false,
  })
  vendorBundle = new TextDecoder().decode(result.outputFiles[0].contents)
  // Content hash for cache busting
  const hashBytes = new TextEncoder().encode(vendorBundle)
  const hashBuffer = await crypto.subtle.digest('SHA-1', hashBytes)
  vendorHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 8)
  return vendorBundle
}
