/**
 * vdom type-flow — 编译期类型断言（UIContext 类型增强方案验收）
 *
 * 对齐后端 Context 模式：
 * - UIContext = 接口 + 索引签名 + **declare module 合并增强**（中间件注入）
 * - 组件泛型 Component<P, C = UIContext>——默认增强后的类型
 * - 内建面具体类型（ui: Ui / browser: Browser——组件零断言）
 *
 * 负例（@ts-expect-error）：类型错误必须编译期报错。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { UIContext, Component, Ui } from './index.ts'

// ── declare module 增强（应用/中间件作者扩展——对齐后端 Context） ──
declare module './index.ts' {
  interface UIContext {
    api: { get<T>(url: string): Promise<T> }
    myField: string
  }
}

test('UIContext 内建面：ui/browser 具体类型（组件零断言——直接调用）', () => {
  // 编译期验证：ctx.ui.usePopup 类型可见（无断言）
  const useUi = (_ctx: UIContext): Ui => _ctx.ui
  assert.equal(typeof useUi, 'function')
  const useBrowser = (ctx: UIContext): Window => ctx.browser.window
  assert.equal(typeof useBrowser, 'function')
})

test('UIContext 增强面：declare module 合并后字段类型可见', () => {
  const useApi = (ctx: UIContext): string => ctx.myField
  assert.equal(typeof useApi, 'function')
  // 增强字段类型（api.get<T> 返回 Promise<T>）
  const callApi = async (ctx: UIContext): Promise<number> => {
    const v = await ctx.api.get<number>('/x')
    return v
  }
  assert.equal(typeof callApi, 'function')
  // @ts-expect-error——增强字段拼错——编译期报错
  const bad = (_ctx: UIContext): unknown => (_ctx as { notField?: unknown }).notField
  assert.equal(typeof bad, 'function')
})

test('Component 泛型：默认 UIContext——P 类型约束', () => {
  // 编译期：P 泛型 props 类型安全
  const Comp: Component<{ id: number }> = (initProps) => {
    // @ts-expect-error——props 无 name 字段
    const bad = (initProps as { name?: string }).name
    void bad
    return () => null
  }
  assert.equal(typeof Comp, 'function')
  // @ts-expect-error——C 泛型约束（C 必须是对象）
  const Bad: Component<Record<string, unknown>, string> = (_i, _c) => () => null
  void Bad
})
