import * as esbuild from 'esbuild'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

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
  if (cache.has(path)) return cache.get(path)!
  const absPath = resolve(path)
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
  cache.set(path, mod)
  return mod
}
