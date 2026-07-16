/**
 * ui 中间件 — 注入 ctx.ui.render()
 *
 * `ctx.ui.render(entryPath)` 编译 TSX 入口文件，返回客户端 JS bundle。
 * 编译结果可内联到页面或写为静态文件服务。
 *
 * 替换独立的构建脚本 — 不再需要 `node scripts/build.mjs`。
 *
 * ```ts
 * import { ui, serve } from 'weifuwu'
 *
 * app.use(ui())
 *
 * // 编译客户端 bundle 并作为 JS 文件服务
 * app.get('/static/app.js', async (req, ctx) => {
 *   const js = await ctx.ui.render('./src/main.tsx')
 *   return new Response(js, {
 *     headers: { 'Content-Type': 'application/javascript' },
 *   })
 * })
 * ```
 */

import { build } from 'esbuild'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Middleware, Context } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    ui: {
      /** 编译 TSX 入口，返回客户端 JS bundle */
      render: (entryPath: string) => Promise<string>
    }
  }
}

const _dirname = dirname(fileURLToPath(import.meta.url))
const _projectRoot = resolve(_dirname, '..')

export function ui(): Middleware {
  const cache = new Map<string, { code: string; mtime: number }>()

  return async (_req, ctx, next) => {
    ctx.ui = {
      async render(entryPath: string): Promise<string> {
        const absPath = resolve(entryPath)
        const cached = cache.get(absPath)
        // TODO: 生产环境下可以根据 mtime 做缓存失效
        if (cached) return cached.code

        const result = await build({
          entryPoints: [absPath],
          bundle: true,
          format: 'esm',
          platform: 'browser',
          jsx: 'automatic',
          jsxImportSource: 'weifuwu/client',
          write: false,
          external: [],
        })

        const code = result.outputFiles[0].text
        cache.set(absPath, { code, mtime: Date.now() })
        return code
      },
    }
    return next(_req, ctx)
  }
}
