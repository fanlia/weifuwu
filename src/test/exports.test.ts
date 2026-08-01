/**
 * weifuwu 公开入口导出面审计测试
 *
 * 保证 README 声称的 API 都能从公开入口导出（防「文档声称、入口缺失」回归）。
 *
 * 实现方式：静态解析入口文件的 export 语句（不加载模块）。
 * 理由：node 原生 TS 执行（strip-types）不支持 parameter properties
 * （src/ui/index.ts 的 HtmlSafe），import 入口会触发
 * ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX；且审计目标本就是「入口 export 声明」本身。
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** 解析入口文件的导出名（覆盖 function/const/class + export { a, b } 重导出）
 * rel: 相对 src/ 的路径 */
function exportsOf(rel: string): Set<string> {
  const src = readFileSync(resolve(here, '..', rel), 'utf8')
  const names = new Set<string>()
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1])
  }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/)[0]?.trim()
      if (n && n !== 'type') names.add(n)
    }
  }
  return names
}

describe('weifuwu 后端入口导出（src/index.ts）', () => {
  const exp = exportsOf('index.ts')

  it('createMiddleware 从入口导出（README 声称 import { createMiddleware } from "weifuwu"）', () => {
    assert.ok(exp.has('createMiddleware'), 'src/index.ts 缺少 createMiddleware 导出')
  })

  it('README 模块总览声明的后端 API 全部导出', () => {
    // graphql：Router 实例方法 app.graphql()；response：导出为 ok/badRequest/... 各函数（非 response 命名导出）
    for (const name of ['serve', 'Router', 'cors', 'serveStatic', 'postgres', 'redis', 'ui', 'createMiddleware', 'parseBody', 'HttpError', 'ok', 'badRequest', 'redirect']) {
      assert.ok(exp.has(name), `src/index.ts 缺失导出: ${name}`)
    }
  })
})

describe('weifuwu/client 入口导出（src/client/index.ts）', () => {
  const exp = exportsOf('client/index.ts')

  it('computeFixedPosRect 从入口导出（README 声称 popup 工具 computeFixedPos / computeFixedPosRect）', () => {
    assert.ok(exp.has('computeFixedPosRect'), 'src/client/index.ts 缺少 computeFixedPosRect 导出')
    assert.ok(exp.has('computeFixedPos'), 'src/client/index.ts 缺少 computeFixedPos 导出')
  })

  it('README 声称的 client API 全部导出', () => {
    for (const name of ['createApp', 'h', 'router', 'RouteView', 'api', 'auth', 'ws', 'i18n', 'ErrorBoundary', 'lockScroll', 'trapFocus']) {
      assert.ok(exp.has(name), `src/client/index.ts 缺失导出: ${name}`)
    }
  })
})
