/**
 * weifuwu/dev — Node 运行时 loader：让服务端直接跑 .ts / .tsx（含 JSX）
 *
 * 用法：
 *   node --import weifuwu/dev server.ts
 *
 * 原理：registerHooks 注册 load 钩子，用 esbuild 实时编译 .ts/.tsx——
 *   - loader: tsx（JSX → automatic，jsxImportSource 与客户端一致）
 *   - 零构建产物、零配置；与 ctx.ui.js 的前端动态编译同一理念
 *   - 两端同一 jsx 运行时 → 服务端/客户端 VNode 结构一致 → hydration 可靠
 */

import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

registerHooks({
  load(url, context, next) {
    if (url.startsWith('file:') && (url.endsWith('.ts') || url.endsWith('.tsx'))) {
      const file = fileURLToPath(url)
      const code = readFileSync(file, 'utf-8')
      const result = transformSync(code, {
        loader: url.endsWith('.tsx') ? 'tsx' : 'ts',
        jsx: 'automatic',
        jsxImportSource: 'weifuwu/ui-dom',
        format: 'esm',
        sourcemap: 'inline',
        target: 'node22',
      })
      return { format: 'module', source: result.code, shortCircuit: true }
    }
    return next(url, context)
  },
})
