/**
 * UIRouter + VDOM 类型流测试（S1）——编译期验证 ui-types 定义
 *
 * 验证：
 *   - UIHandler = async (location, ctx) => VNode（res = VNode）
 *   - UIMiddleware = 两阶段 async（children 传递）
 *   - 与后端签名对齐（handler/middleware 同形）
 *   - FS-02：ctx 注入类型（C 泛型）编译期保证
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { setupJsdom } from './setup.ts'
import type { UIRequest, UIResponse, UIHandler, UIMiddleware, UIRouteDef } from '../../ui-dom/types.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import type { VNode } from '../../ui-dom/vnode.ts'
import { h } from '../../ui-dom/vnode.ts'
const browser = createClientBrowser()

before(setupJsdom)

// ── 编译期类型断言 ────────────────────────────────────

// ① UIHandler = async (location, ctx) => VNode（对齐后端 handler(req, ctx) => Response）
const handler: UIHandler = async (location, ctx) => {
  // location = window.location（req）
  const p: string = location.pathname
  // ctx.params / ctx.query（params 在 ctx）
  const params: Record<string, string> = (ctx as any).params
  const query: Record<string, string> = (ctx as any).query
  void p; void params; void query
  // 返回 VNode（res = VNode）
  return h('div', {}, 'hi')
}

// ② 同步 handler 也合法（简单页）
const syncHandler: UIHandler = (location, ctx) => h('span', {}, 'sync')

// ③ UIMiddleware = 两阶段：外层拿 children，内层调 children 得子 VNode
const layout: UIMiddleware = async (location, ctx, children) => {
  // 外层（mount 一次）：可做初始化
  const inner: UIHandler = async (loc, c) => {
    // 内层（每次渲染）：调 children 得子 VNode 再包装
    const child = await children(loc, c)
    return h('div', { class: 'shell' }, child)
  }
  return inner
}

// ④ UIRouteDef：path + handler
const route: UIRouteDef = {
  path: '/users/:id',
  handler,
  title: '用户详情',
}

// ⑤ FS-02：中间件注入 ctx 字段后，handler 的 ctx 可访问（编译期保证）
interface ApiInjected {
  api: { get: (url: string) => Promise<unknown> }
}
const apiHandler: UIHandler<ApiInjected> = async (location, ctx) => {
  await ctx.api.get('/x')  // ctx.api 由 C 泛型注入
  return h('div', {})
}
// 负例：未注入的字段应报错（FS-02 生效）
// @ts-expect-error 未注入 i18n——C 泛型 {} 无 i18n
const badHandler: UIHandler<{}> = async (location, ctx) => {
  ;(ctx as any).i18n
  return h('div', {})
}

// ── 运行时（仅类型形状，不执行）──

test('UI 类型定义形状正确', () => {
  assert.equal(typeof handler, 'function')
  assert.equal(typeof syncHandler, 'function')
  assert.equal(typeof layout, 'function')
  assert.equal(route.path, '/users/:id')
  assert.equal(typeof apiHandler, 'function')
  assert.equal(typeof badHandler, 'function')
})

test('UIResponse 与 VNode 兼容（res = VNode）', () => {
  const v: UIResponse = h('div', {})
  assert.ok(v && typeof v === 'object')
})

test('UIRequest = Location（浏览器原生）', () => {
  // 类型层面：UIRequest 就是 Location——运行时是 window.location
  const req: UIRequest = window.location
  assert.ok(req)
  void req
})
