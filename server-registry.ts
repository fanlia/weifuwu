/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * server-registry — per-file transformSync + vm module loading for SSR.
 *
 * Instead of bundling all dependencies into a single CJS file via esbuild.build
 * (~200ms), each .tsx/.ts file is transformed individually via esbuild.transformSync
 * (~0.5ms) and loaded into a shared vm context via IIFE wrapper.
 *
 * Relative imports are resolved through a custom `require()` that recursively
 * loads dependencies from the registry. Bare imports (react, etc.) use real
 * Node.js require().
 *
 * This makes HMR O(1) per changed file and eliminates the bundler bottleneck.
 */
import * as esbuild from 'esbuild'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'

// ── Config ────────────────────────────────────────────────────────────
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

// ── Alias resolution (tsconfig paths) ────────────────────────────────
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

// ── File resolution (.tsx, .ts, .jsx, .js, /index.*) ────────────────
const exts = ['.tsx', '.ts', '.jsx', '.js']

function tryResolve(base: string): string | null {
  // Exact file
  if (existsSync(base)) {
    const stat = statSync(base)
    if (stat.isFile()) return base
    if (stat.isDirectory()) {
      // Directory index
      for (const ext of exts) {
        const p = resolve(base, `index${ext}`)
        if (existsSync(p)) return p
      }
      return null
    }
  }
  // Add extensions
  for (const ext of exts) {
    const p = base + ext
    if (existsSync(p)) return p
  }
  return null
}

// ── Registry ─────────────────────────────────────────────────────────
interface ModuleEntry {
  exports: any
}

const registry = new Map<string, ModuleEntry>()

// Shared vm context — all modules run in the same sandbox, isolated by IIFE
const _ctx = vm.createContext(Object.create(globalThis))

/** Transform a .tsx/.ts file to CJS code via esbuild.transformSync */
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

/** Build a custom require() for a specific module path */
function makeRequire(modulePath: string): RequireFn {
  const moduleDir = dirname(modulePath)

  return (id: string) => {
    // Relative import — resolve through registry
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

    // Alias import (e.g. @/components/Greeting)
    const aliased = applyAlias(id, moduleDir)
    if (aliased) {
      const file = tryResolve(aliased)
      if (file) return getServerModule(file)
    }

    // Bare import — real Node.js require
    return getUserRequire()(id)
  }
}

/** Evaluate CJS code in the shared vm context, return exports */
function evaluateModule(code: string, modulePath: string): any {
  const mod = { exports: {} as any }
  const require = makeRequire(modulePath)
  const _dirname = dirname(modulePath)
  const _filename = modulePath

  // Wrap in IIFE so var declarations are scoped to the module
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

// ── Public API ───────────────────────────────────────────────────────

/**
 * Get (or load) a server-side module. Cached in registry after first load.
 * Synchronous — uses transformSync and vm.Script.
 */
export function getServerModule(absPath: string): any {
  const normalized = resolve(absPath)
  if (registry.has(normalized)) return registry.get(normalized)!.exports

  const source = readFileSync(normalized, 'utf-8')
  const code = transformToCjs(normalized, source)
  const exports = evaluateModule(code, normalized)

  registry.set(normalized, { exports })
  return exports
}

/**
 * Clear cached modules. If `absPath` given, clear only that module (for HMR).
 * Otherwise clear all modules.
 */
export function clearServerModule(absPath?: string): void {
  if (absPath) {
    const normalized = resolve(absPath)
    registry.delete(normalized)
  } else {
    registry.clear()
    // Also clear aliases so path resolution re-reads tsconfig
    _alias = null
  }
}

/** Release resources. Call when shutting down. */
export function closeRegistry(): void {
  registry.clear()
}
