import * as esbuild from 'esbuild'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const _cjsRequire = createRequire(import.meta.url)
let _userRequire: ReturnType<typeof createRequire> | null = null

const OUT_DIR = '.weifuwu/ssr'
const cache = new Map<string, any>()

const externals = [
  'react', 'react-dom', 'esbuild',
  'graphql', 'ws', 'zod',
  '@graphql-tools/schema', 'ai',
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
      } catch { }
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
  _alias = null
}

export async function compileTsx(path: string): Promise<any> {
  const absPath = resolve(path)
  if (cache.has(absPath)) return cache.get(absPath)!
  mkdirSync(OUT_DIR, { recursive: true })
  const hash = id(absPath)
  const outPath = join(OUT_DIR, hash + '.js')

  await esbuild.build({
    entryPoints: { [hash]: absPath },
    outdir: OUT_DIR,
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

function loadSSRModule(code: string): any {
  const ctx = vm.createContext(Object.create(globalThis))
  const mod = { exports: {} }
  ;(ctx as any).require = (name: string) => _cjsRequire(name)
  ;(ctx as any).module = mod
  ;(ctx as any).exports = mod.exports
  new vm.Script(code).runInContext(ctx)
  return mod.exports
}

/** Dev hot-reload: CJS + in-memory + vm (faster than ESM + disk + import) */
export async function compileTsxDev(path: string): Promise<any> {
  const absPath = resolve(path)
  if (cache.has(absPath)) return cache.get(absPath)!
  const result = await esbuild.build({
    entryPoints: { [id(absPath)]: absPath },
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    jsxImportSource: 'react',
    bundle: true,
    external: externals,
    alias: resolveAliases(),
    write: false,
  })
  const code = new TextDecoder().decode(result.outputFiles[0].contents)
  const mod = loadSSRModule(code)
  cache.set(absPath, mod)
  return mod
}

/** Auto-select dev (vm) or prod (ESM + import) compilation */
export function compile(path: string): Promise<any> {
  return process.env.NODE_ENV !== 'production' ? compileTsxDev(path) : compileTsx(path)
}

let vendorBundle: string | null = null

/** Build a single vendor bundle containing all needed vendor modules */
export async function compileVendorBundle(): Promise<string> {
  if (vendorBundle) return vendorBundle
  if (!_userRequire) _userRequire = createRequire(join(process.cwd(), 'package.json'))

  const modules: Record<string, string[]> = {
    'react': [],
    'react-dom': ['react'],
    'react-dom/client': ['react'],
    'react/jsx-runtime': ['react'],
  }

  for (const request of Object.keys(modules)) {
    const mod = _userRequire(request)
    const keys = Object.keys(mod).filter(k => !k.startsWith('_') && k !== 'default')
    modules[request] = keys
  }

  // weifuwu/react is already ESM — import * as + re-export works
  const wfwMod = _userRequire('weifuwu/react')
  const wfwKeys = Object.keys(wfwMod).filter(k => !k.startsWith('_') && k !== 'default')

  const used = new Set<string>()
  const stmts = ['']
  for (const [request, keys] of Object.entries(modules)) {
    const unique = keys.filter(k => !used.has(k) && used.add(k))
    if (unique.length > 0) stmts.push(`export { ${unique.join(', ')} } from ${JSON.stringify(request)};`)
  }
  const uidWfw = wfwKeys.filter(k => !used.has(k) && used.add(k))
  if (uidWfw.length > 0) stmts.push(`export { ${uidWfw.join(', ')} } from 'weifuwu/react';`)

  const result = await esbuild.build({
    stdin: { contents: stmts.join('\n'), resolveDir: process.cwd() },
    format: 'esm',
    bundle: true,
    write: false,
  })
  vendorBundle = new TextDecoder().decode(result.outputFiles[0].contents)
  return vendorBundle
}

/** Hot-reload: ESM bundle, calls __WFW_REFRESH on import */
export async function compileHotComponent(path: string): Promise<{ hash: string; code: string }> {
  const absPath = resolve(path)
  const h = id(absPath)
  const stdin = `import C from ${JSON.stringify(absPath)};\n(window.__WFW_REFRESH||function(){})(C)`
  const result = await esbuild.build({
    stdin: { contents: stdin, loader: 'tsx', resolveDir: dirname(absPath) },
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    jsxImportSource: 'react',
    bundle: true,
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'weifuwu/react'],
    write: false,
  })
  let code = new TextDecoder().decode(result.outputFiles[0].contents)
  // Replace esbuild's CJS require polyfill calls with import from vendor bundle
  if (code.includes('__require') && (code.includes('"react"') || code.includes("'react'"))) {
    code = `import * as __r from 'react';\n` + code.replace(/__require\(["']react["']\)/g, '__r')
  }
  return { hash: h, code }
}
