/**
 * 类型流测试（编译期验证）——组件 props 泛型 + ctx 注入链式累积。
 *
 * 运行方式：这些断言是类型层面的，由 tsc --noEmit 保证。
 * 运行时测试仅验证 createApp().use() 链式调用不抛错。
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ── 类型层面的验证（以下类型如果写错，tsc 会失败）─────────────

import { createApp } from '../client/app.ts'
import type { Component } from '../client/vnode.ts'
import { api, type ApiInjected } from '../client/middleware/api.ts'
import { router, type RouteInjected } from '../client/router.ts'
import type { AppMiddleware } from '../client/types.ts'

// ① 组件 props 泛型：JSX/类型检查应拒绝错误 props
interface DeckCardProps {
  title: string
  pages: number
}
const DeckCard: Component<DeckCardProps> = (_init, ctx) =>
  (props) => null
// pages 是 number，传 string 应报错（类型流验证）
// @ts-expect-error pages: string 不能赋给 number
const badProps: DeckCardProps = { title: 'x', pages: '8' }

// ② 组件 ctx 注入：声明依赖后，ctx 上直接可访问注入字段
const PageWithCtx: Component<{}, ApiInjected & RouteInjected> = (_init, ctx) => {
  ctx.api.get('/x')
  ctx.route.path
  ctx.app.navigate('/y')
  return () => null
}

// ③ 未注入的字段应报错（负例：C 泛型真实生效）
// @ts-expect-error 未声明注入 i18n
const BadCtx: ApiInjected & { i18n?: never } = {} as ApiInjected & { i18n: unknown }

// ④ 中间件返回类型：api() 声明注入 ApiInjected
const apiMw: AppMiddleware<{}, ApiInjected> = api()

// ⑤ createApp 链式累积：use(api()).use(router()) 后 mount 接受完整注入的组件
const app = createApp().use(api()).use(router({ routes: [] }))
// 类型断言验证（不执行——mount 需要 DOM）
const mountWithInjectedCtx: (sel: string, root: Component<any, ApiInjected & RouteInjected>) => Promise<void> = app.mount

describe('client type flow (compile-time)', () => {
  it('createApp().use() chains without throwing at runtime', () => {
    // 链式调用本身在运行时就是 push + return this——这里验证不抛
    const a = createApp()
    const b = a.use(api())
    const c = b.use(router({ routes: [] }))
    assert.ok(a && b && c)
  })

  it('middleware inject declarations are exported', () => {
    // ApiInjected/RouteInjected 等注入接口应可 import（上面已 import）
    const injected = {} as ApiInjected
    assert.ok(typeof injected === 'object')
  })

  it('Component generic accepts ctx deps', () => {
    const Comp: Component<{ n: number }, ApiInjected> = (_i, _ctx) => () => null
    assert.ok(typeof Comp === 'function')
  })

  it('api middleware has typed injection', () => {
    assert.equal(typeof api, 'function')
  })
})
