import * as esbuild from 'esbuild'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const _cjsRequire = createRequire(import.meta.url)

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

function id(s: string): string {
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

/** Browser hot-reload: CJS + react externals, sent via WS and evaled in browser */
export async function compileTsxBrowser(path: string): Promise<string> {
  const absPath = resolve(path)
  const result = await esbuild.build({
    entryPoints: { [id(absPath)]: absPath },
    format: 'cjs',
    platform: 'browser',
    jsx: 'automatic',
    jsxImportSource: 'react',
    bundle: true,
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'weifuwu/react'],
    write: false,
  })
  return new TextDecoder().decode(result.outputFiles[0].contents)
}
