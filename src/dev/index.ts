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

// bare specifier → 源码路径（与 tsconfig paths 一致——测试/dev 单模块图，
// 防 dist/src 双实例：页面 JSX 编出的 weifuwu/ui-dom import 必须与测试同图）
const SRC_ROOT = new URL('..', import.meta.url).pathname
const BARE_ALIASES: Record<string, string> = {
  'weifuwu/ui-dom/jsx-runtime': SRC_ROOT + 'ui-dom/jsx-runtime.ts',
  'weifuwu/ui-dom/testing': SRC_ROOT + 'ui-dom/testing.ts',
  'weifuwu/ui-dom': SRC_ROOT + 'ui-dom/index.ts',
  'weifuwu/components': SRC_ROOT + 'components/index.ts',
  'weifuwu': SRC_ROOT + 'index.ts',
}

registerHooks({
  // 相对路径无扩展名自动补 .ts/.tsx（node ESM 要求显式扩展——页面内部 import 惯例省略）
  resolve(specifier, context, next) {
    const alias = BARE_ALIASES[specifier]
    if (alias) return next(alias, context)
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/.test(specifier)) {
      for (const ext of ['.ts', '.tsx']) {
        try { return next(specifier + ext, context) } catch { /* 试下一扩展 */ }
      }
    }
    return next(specifier, context)
  },
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
