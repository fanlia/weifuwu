import * as esbuild from 'esbuild'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { isDev as _isDev, isBundled } from './env.ts'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const _cjsRequire = createRequire(import.meta.url)
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
  return _isDev() ? compileTsxDev(path) : compileTsx(path)
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

/** Compile page component for browser (served at /__ssr/[hash].js).
 *  The weifuwu source modules are externalized — they come from the vendor
 *  bundle at runtime via importmap, ensuring store is shared. */
export async function compileBrowser(path: string, outDir?: string): Promise<string> {
  const absPath = resolve(path)
  const h = id(absPath)
  outDir = outDir ?? resolve(OUT_DIR)
  const outPath = join(outDir, h + '.js')
  // Skip esbuild if already compiled (production: file persists; dev: HMR handles recompilation)
  if (!_isDev() && existsSync(outPath)) return h
  mkdirSync(outDir, { recursive: true })

  // Map weifuwu source paths to weifuwu/react (external) so they are not inlined
  const wfwDir = resolve(import.meta.dirname ?? __dirname)
  const plugin: esbuild.Plugin = {
    name: 'wfw-external',
    setup(build) {
      build.onResolve({ filter: /./ }, (args) => {
        if (args.kind === 'entry-point') return
        const abs = args.path.startsWith('.') ? join(args.resolveDir, args.path) : args.path
        // Only externalize weifuwu framework source files directly in wfwDir (no subdir).
        // User project files (cli/template/ui/) should be bundled normally.
        if (abs.startsWith(wfwDir) && !abs.includes('node_modules')) {
          const rel = abs.slice(wfwDir.length + 1)
          if (rel.includes('/')) return
          return { path: 'weifuwu/react', external: true }
        }
      })
    },
  }

  await esbuild.build({
    entryPoints: { [h]: absPath },
    outdir: outDir,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    jsxImportSource: 'react',
    bundle: true,
    external: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'weifuwu',
      'weifuwu/react',
    ],
    plugins: [plugin],
    write: true,
    allowOverwrite: true,
  })

  return h
}

/** Hot-reload: ESM bundle, calls __WFW_REFRESH on import */
export async function compileHotComponent(path: string): Promise<{ hash: string; code: string }> {
  const absPath = resolve(path)
  const h = id(absPath)
  const stdin = `import C from ${JSON.stringify(absPath)};\n(window.__WFW_REFRESH||function(){})(C)`

  const wfwDir = resolve(import.meta.dirname ?? __dirname)
  const plugin: esbuild.Plugin = {
    name: 'wfw-external',
    setup(build) {
      build.onResolve({ filter: /./ }, (args) => {
        if (args.kind === 'entry-point') return
        const abs = args.path.startsWith('.') ? join(args.resolveDir, args.path) : args.path
        if (abs.startsWith(wfwDir) && !abs.includes('node_modules')) {
          const rel = abs.slice(wfwDir.length + 1)
          if (rel.includes('/')) return
          return { path: 'weifuwu/react', external: true }
        }
      })
    },
  }

  const result = await esbuild.build({
    stdin: { contents: stdin, loader: 'tsx', resolveDir: dirname(absPath) },
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    jsxImportSource: 'react',
    bundle: true,
    external: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'weifuwu',
      'weifuwu/react',
    ],
    plugins: [plugin],
    write: false,
  })
  let code = new TextDecoder().decode(result.outputFiles[0].contents)
  // Replace esbuild's CJS require polyfill calls with import from vendor bundle
  if (code.includes('__require') && (code.includes('"react"') || code.includes("'react'"))) {
    code = `import * as __r from 'react';\n` + code.replace(/__require\(["']react["']\)/g, '__r')
  }
  return { hash: h, code }
}

/** Clean up esbuild's internal worker pool. Call when you're done compiling. */
export async function closeCompile(): Promise<void> {
  await esbuild.stop()
}
