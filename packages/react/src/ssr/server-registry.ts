/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * server-registry — per-file transformSync + vm module loading for SSR.
 *
 * Each .tsx/.ts file is transformed individually via esbuild.transformSync
 * (~0.5ms) and loaded into a shared vm context via IIFE wrapper.
 */
import * as esbuild from 'esbuild'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'

let _userRequire: ReturnType<typeof createRequire> | null = null

function getUserRequire(): NodeRequire {
  if (!_userRequire) {
    try {
      _userRequire = createRequire(resolve(process.cwd(), 'package.json'))
    } catch {
      _userRequire = createRequire(import.meta.url)
    }
  }
  return _userRequire
}

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
      } catch {
        // ignore
      }
    }
  }
  _alias = {}
  return {}
}

function applyAlias(id: string, _moduleDir: string): string | null {
  const aliases = resolveAliases()
  for (const [prefix, target] of Object.entries(aliases)) {
    if (id.startsWith(prefix)) {
      const rest = id.slice(prefix.length)
      return target + rest
    }
  }
  return null
}

const exts = ['.tsx', '.ts', '.jsx', '.js']

function tryResolve(base: string): string | null {
  if (existsSync(base)) {
    const stat = statSync(base)
    if (stat.isFile()) return base
    if (stat.isDirectory()) {
      for (const ext of exts) {
        const p = resolve(base, `index${ext}`)
        if (existsSync(p)) return p
      }
      return null
    }
  }
  for (const ext of exts) {
    const p = base + ext
    if (existsSync(p)) return p
  }
  return null
}

interface ModuleEntry {
  exports: any
}

const registry = new Map<string, ModuleEntry>()
const _ctx = vm.createContext(Object.create(globalThis))

function transformToCjs(absPath: string, source: string): string {
  const isTsx = absPath.endsWith('.tsx')
  const result = esbuild.transformSync(source, {
    loader: isTsx ? 'tsx' : 'ts',
    format: 'cjs',
    jsx: isTsx ? 'automatic' : undefined,
    jsxImportSource: isTsx ? 'react' : undefined,
    sourcemap: false,
  })
  return result.code
}

type RequireFn = (id: string) => any

function makeRequire(modulePath: string): RequireFn {
  const moduleDir = dirname(modulePath)

  return (id: string) => {
    if (id.startsWith('.')) {
      const base = resolve(moduleDir, id)
      const file = tryResolve(base)
      if (!file) {
        throw new Error(
          `[server-registry] Cannot resolve '${id}' from '${modulePath}'. ` +
            `Tried: ${[base, ...exts.map((e) => base + e)].filter((p) => !p.endsWith(base)).join(', ')}`,
        )
      }
      return getServerModule(file)
    }

    const aliased = applyAlias(id, moduleDir)
    if (aliased) {
      const file = tryResolve(aliased)
      if (file) return getServerModule(file)
    }

    return getUserRequire()(id)
  }
}

function evaluateModule(code: string, modulePath: string): any {
  const mod = { exports: {} as any }
  const require = makeRequire(modulePath)
  const _dirname = dirname(modulePath)
  const _filename = modulePath

  const wrapped = `(function(require,module,exports,__dirname,__filename){\n${code}\n})`

  try {
    new vm.Script(wrapped).runInContext(_ctx)(require, mod, mod.exports, _dirname, _filename)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const cause = err instanceof Error ? err : undefined
    throw new Error(
      `[server-registry] Error evaluating '${modulePath}': ${msg}`,
      cause ? { cause } : undefined,
    )
  }

  return mod.exports
}

export function getServerModule(absPath: string): any {
  const normalized = resolve(absPath)
  if (registry.has(normalized)) return registry.get(normalized)!.exports

  const source = readFileSync(normalized, 'utf-8')
  const code = transformToCjs(normalized, source)
  const exports = evaluateModule(code, normalized)

  registry.set(normalized, { exports })
  return exports
}

export function clearServerModule(absPath?: string): void {
  if (absPath) {
    const normalized = resolve(absPath)
    registry.delete(normalized)
  } else {
    registry.clear()
    _alias = null
  }
}
