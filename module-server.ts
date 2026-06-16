/**
 * module-server — serves user .tsx files as ESM to the browser.
 *
 * Relative imports are rewritten to `__wfw.h()` calls so the module graph is
 * managed by a runtime registry. This allows HMR to swap individual modules
 * without re-fetching the page module.
 */
import * as esbuild from 'esbuild'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { Router } from './router.ts'
import type { Handler } from './types.ts'

const moduleCache = new Map<string, string>()
const hashCache = new Map<string, string>()

export function clearModuleCache(filePath?: string) {
  if (filePath) {
    const abs = resolve(filePath)
    for (const key of moduleCache.keys()) {
      if (key.endsWith(abs)) moduleCache.delete(key)
    }
    hashCache.delete(abs)
  } else {
    moduleCache.clear()
    hashCache.clear()
  }
}

let _importRoots: string[] = []

export function _setImportRoots(roots: string[]) {
  _importRoots = roots
}

function fileHash(absPath: string): string {
  const cached = hashCache.get(absPath)
  if (cached) return cached
  try {
    const content = readFileSync(absPath)
    const h = createHash('md5').update(content).digest('hex').slice(0, 8)
    hashCache.set(absPath, h)
    return h
  } catch {
    return '00000000'
  }
}

function rewriteImports(code: string, absPath: string, mountPath: string): string {
  const prefix = mountPath ? `${mountPath}/__wfw/m` : '/__wfw/m'
  let varCounter = 0

  return code.replace(
    /^(import|export)\s+(.+?)\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
    (_match: string, keyword: string, clause: string, modPath: string) => {
      if (!modPath.startsWith('.')) return _match
      const isReexport = keyword === 'export'
      const imports = clause.replace(/^type\s+/, '')

      const resolved = resolve(dirname(absPath), modPath)
      for (const root of _importRoots) {
        const rel = relative(root, resolved)
        if (!rel.startsWith('..') && !rel.startsWith('/')) {
          const v = fileHash(resolved)
          const url = `${prefix}/${rel}?v=${v}`

          const defaultMatch = imports.match(/^\s*(\w[\w$]*)\s*$/)
          const namedMatch = imports.match(/^\s*\{\s*([\w$,\s]+)\s*\}\s*$/)
          const mixedMatch = imports.match(/^\s*(\w[\w$]*)\s*,\s*\{\s*([\w$,\s]+)\s*\}\s*$/)

          if (defaultMatch) {
            const name = defaultMatch[1]
            if (isReexport) {
              return `const { default: ${name} } = await __wfw.h("${url}");\nexport { ${name} as default }`
            }
            return `const { default: ${name} } = await __wfw.h("${url}");`
          }

          if (namedMatch) {
            const names = namedMatch[1]
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
            if (isReexport) {
              const tmp = `__wfw$${varCounter++}`
              const lines = [`const ${tmp} = await __wfw.h("${url}");`]
              for (const n of names) lines.push(`export const ${n} = ${tmp}.${n};`)
              return lines.join('\n')
            }
            const decl = names.map((n) => `${n}`).join(', ')
            return `const { ${decl} } = await __wfw.h("${url}");`
          }

          if (mixedMatch) {
            const defaultName = mixedMatch[1]
            const namedNames = mixedMatch[2]
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
            const varName = `__wfw$${varCounter++}`
            const lines = [
              `const ${varName} = await __wfw.h("${url}");`,
              `const ${defaultName} = ${varName}.default;`,
            ]
            for (const n of namedNames) lines.push(`const { ${n} } = ${varName};`)
            return lines.join('\n')
          }

          return _match
        }
      }
      return _match
    },
  )
}

export async function transformModule(
  absPath: string,
  root: string,
  mountPath?: string,
): Promise<{ url: string; code: string }> {
  const mp = mountPath || ''
  const cacheKey = mp + absPath
  const cached = moduleCache.get(cacheKey)
  if (cached) return { url: `${mp}/__wfw/m/${relative(root, absPath)}`, code: cached }

  const source = readFileSync(absPath, 'utf-8')
  const isTsx = absPath.endsWith('.tsx')
  const result = await esbuild.transform(source, {
    loader: isTsx ? 'tsx' : 'ts',
    jsx: isTsx ? 'automatic' : undefined,
    jsxImportSource: isTsx ? 'react' : undefined,
    sourcemap: false,
  })

  let code = result.code
  code = rewriteImports(code, absPath, mp)

  moduleCache.set(cacheKey, code)
  const url = `${mp}/__wfw/m/${relative(root, absPath)}`
  return { url, code }
}

export function moduleServer(opts: { root: string | string[] }): Router {
  const roots = Array.isArray(opts.root) ? opts.root : [opts.root]
  _setImportRoots(roots)

  const router = new Router()

  router.get('/__wfw/m/*', (async (req: Request, ctx: any) => {
    const reqUrl = new URL(req.url)
    const filePath = (ctx.params['*'] || '').split('?')[0]
    const ext = filePath.split('.').pop()

    if (ext !== 'tsx' && ext !== 'ts') {
      return new Response('Not Found', { status: 404 })
    }

    const mountPath = ctx.mountPath || ''

    for (const root of roots) {
      const absPath = resolve(root, filePath)
      if (existsSync(absPath)) {
        try {
          const { code } = await transformModule(absPath, root, mountPath)
          return new Response(code, {
            headers: { 'content-type': 'application/javascript; charset=utf-8' },
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return new Response(`/* Error: ${msg} */`, { status: 500 })
        }
      }
    }

    return new Response('Not Found', { status: 404 })
  }) as Handler)

  return router
}
