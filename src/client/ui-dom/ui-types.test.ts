/**
 * vdom3 类型流测试（S1）——编译期验证统一类型契约
 *
 * vdom2 时代（UIRouter/UIHandler/UIMiddleware）已删除——全面 vdom3：
 *   - V3Ctx extends WfuiContext（类型唯一化——vdom2 时代组件签名零改动兼容）
 *   - Component<P, C>：ctx = C & WfuiContext（注入面 + 基础面自动交叉）
 *   - FS-02：ctx 注入类型（C 泛型）编译期保证（负例 @ts-expect-error）
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { createClientBrowser } from './browser.ts'
import { setupJsdom } from './setup.ts'
import type { WfuiContext } from './types.ts'
import type { V3Ctx, V3Ui, Component, VNode } from './vdom3/types.ts'
import { h } from './vdom3/jsx.ts'
const browser = createClientBrowser()

before(setupJsdom)

// ── 编译期类型断言 ────────────────────────────────────

// ① V3Ctx extends WfuiContext——V3Ctx 可赋给 WfuiContext（类型唯一化：
//    vdom2 时代组件声明 ctx: WfuiContext 在 vdom3 树运行零改动）
const asWfui = (_c: V3Ctx): WfuiContext => _c
// V3Ctx 的 ui 满足 WfuiContext['ui']（render: void ⊂ void | Promise<void>）
const asUi = (_c: V3Ctx): WfuiContext['ui'] => _c.ui

// ② Component 默认 ctx = V3Ctx——组件可用 ctx.render（vdom3 语义）
const Comp1: Component = async (_init, ctx) => {
  const fn = () => { ctx.render() } // V3Ctx.render 同步
  const b = ctx.browser // 继承 WfuiContext 的 browser
  void fn; void b
  return async () => h('div', {}, 'x')
}

// ③ 注入面 C 自动 & WfuiContext（vdom2 语义——demo 的 Component<any, ToastInjected> 模式）
interface ToastInjected {
  toast: (msg: string) => void
}
const Comp2: Component<Record<string, unknown>, ToastInjected> = async (_init, ctx) => {
  ctx.toast('hi') // C 注入面
  ctx.ui.render() // 自动 & WfuiContext 的基础面（vdom2 时代可用性保持）
  return async () => h('div', {}, 'y')
}

// ④ vdom2 时代内联签名（ctx: WfuiContext）组件——赋给 vdom3 Component（逆变兼容）
const LegacyInline: Component = async (_init, ctx: WfuiContext) => {
  void ctx
  return async () => h('span', {}, 'legacy')
}
const comp4: Component = LegacyInline

// ⑤ 负例：C 泛型未声明 toast——编译期报错（FS-02 生效）
// @ts-expect-error ctx.toast 未注入（C = {} 无 toast）
const badComp: Component<Record<string, unknown>, {}> = async (_init, ctx) => {
  ctx.toast('x')
  return async () => h('div', {})
}

// ⑥ V3Ui 面：hooks 完整（组件库消费面）
const uiCheck = (_ui: V3Ui) => {
  const a: typeof _ui.useExternal = _ui.useExternal
  const b: typeof _ui.usePopup = _ui.usePopup
  const c: typeof _ui.useControlledInput = _ui.useControlledInput
  const d: typeof _ui.useChat = _ui.useChat
  void a; void b; void c; void d
}

// ── 运行时（仅类型形状，不执行）──

test('vdom3 统一类型契约形状正确', () => {
  assert.equal(typeof asWfui, 'function')
  assert.equal(typeof asUi, 'function')
  assert.equal(typeof Comp1, 'function')
  assert.equal(typeof Comp2, 'function')
  assert.equal(typeof comp4, 'function')
  assert.equal(typeof badComp, 'function')
  assert.equal(typeof uiCheck, 'function')
})

test('VNode 工厂统一（vdom3 h——children 单值/数组 vdom2 语义）', () => {
  const single = h('span', {}, 'x')
  assert.equal((single.props as Record<string, unknown>).children, 'x', '单子节点存单值')
  const multi = h('div', {}, h('a', {}), h('b', {}))
  assert.ok(Array.isArray((multi.props as Record<string, unknown>).children), '多子节点存数组')
  const arr = h('ul', {}, [h('li', {}), h('li', {})])
  assert.ok(Array.isArray((arr.props as Record<string, unknown>).children), '单数组参数存数组')
})

test('browser 环境（ctx.browser 继承自 WfuiContext）', () => {
  assert.ok(browser)
  void browser
})
