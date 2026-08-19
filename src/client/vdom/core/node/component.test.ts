/**
 * vdom core — component 测试（组件渲染——两阶段工厂 + renderFn）
 *
 * 锁定规则（AGENTS §3）：工厂 = mount（一次——可 await ctx.data）；renderFn =
 * 每次渲染（同步或 async）；输出 null → 空洞占位；数组 → 隐式 Fragment；
 * per-instance ctx（onUnmount 收集）；实例注册表（同位置同类型复用）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser } from '../../setup.ts'
import { h, type Component } from '../vnode.ts'
import { renderToStream } from '../build.ts'
import { renderComponent, createComponentRegistry, disposeComponent } from './component.ts'
import { CommandApplier } from '../patch/index.ts'
import { pathId } from './native.ts'
import type { UIContext } from '../../context/UIContext.ts'

async function applyAll(browser: ReturnType<typeof testBrowser>, rootV: ReturnType<typeof h>) {
  const stream = renderToStream(rootV)
  const root = browser.document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, browser.document)
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    applier.apply(value)
  }
  return root
}

test('组件渲染：工厂 mount + renderFn 输出（无状态）', async () => {
  const browser = testBrowser()
  const Hello: Component = () => () => h('div', { class: 'hello' }, 'hi')
  const root = await applyAll(browser, h(Hello, {}))
  assert.equal(root.querySelector('.hello')?.textContent, 'hi')
})

test('组件内部状态：工厂闭包 let + renderFn 读最新（mount 只一次）', async () => {
  const browser = testBrowser()
  let mounts = 0
  const Counter: Component<{ step?: number }> = (initProps) => {
    mounts++
    let count = 0
    return (props) => h('button', { id: 'c', onClick: () => { count += props.step ?? 1 } }, `count:${count}`)
  }
  const reg = createComponentRegistry()
  const stream = renderToStream(h(Counter, { step: 1 }), {}, reg)
  const root = browser.document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, browser.document)
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    applier.apply(value)
  }
  assert.equal(mounts, 1, '工厂只跑一次')
  const btn = root.querySelector('#c') as HTMLElement
  assert.equal(btn.textContent, 'count:0')
  btn.click()
  assert.equal(btn.textContent, 'count:0', '无 render()——DOM 保持首帧（render-only 语义）')
  // 下次渲染（diff 时）——同 registry 复用——renderFn 读最新闭包
  const rec = reg.get('root.0')!
  const out = rec.renderFn({ step: 1 }) as { props: { children: string } }
  assert.equal(out.props.children, 'count:1', '闭包状态保持——事件回调生效')
})

test('组件嵌套：组件内组件（递归渲染）', async () => {
  const browser = testBrowser()
  const Badge: Component = () => () => h('span', { class: 'badge' }, '★')
  const App: Component = () => () => h('div', {}, [h(Badge, {}), h(Badge, {})])
  const root = await applyAll(browser, h(App, {}))
  assert.equal(root.querySelectorAll('.badge').length, 2)
})

test('async 组件工厂：await 后渲染（数据预取模式）', async () => {
  const browser = testBrowser()
  const AsyncUser: Component = async (initProps: Record<string, unknown>) => {
    const data = await Promise.resolve({ name: `user-${initProps.id}` })
    return () => h('div', { class: 'user' }, data.name)
  }
  const root = await applyAll(browser, h(AsyncUser, { id: 7 }))
  assert.equal(root.querySelector('.user')?.textContent, 'user-7')
})

test('组件输出 null → 空洞占位（同构保持）', async () => {
  const browser = testBrowser()
  const Empty: Component = () => () => null
  const App: Component = () => () => h('div', {}, [h('span', {}, 'a'), h(Empty, {}), h('span', {}, 'b')])
  const root = await applyAll(browser, h(App, {}))
  const div = root.querySelector('div')!
  assert.equal(div.childNodes.length, 3, '3 子项 ⟷ 3 节点（null 占位）')
  assert.equal(div.childNodes[1].nodeType, 8, 'null 输出 → 注释占位')
})

test('组件输出数组 → 隐式 Fragment（多根展开）', async () => {
  const browser = testBrowser()
  const Multi: Component = () => () => [h('span', { class: 'm1' }, '1'), h('span', { class: 'm2' }, '2')]
  const App: Component = () => () => h('div', {}, [h(Multi, {})])
  const root = await applyAll(browser, h(App, {}))
  assert.equal(root.querySelectorAll('.m1').length, 1)
  assert.equal(root.querySelectorAll('.m2').length, 1)
})

test('onUnmount 收集：per-instance ctx——dispose 执行清理', async () => {
  const browser = testBrowser()
  const registry = createComponentRegistry()
  const cleaned: string[] = []
  const Watch: Component = (_init, ctx: UIContext) => {
    ctx.onUnmount(() => cleaned.push('cleanup'))
    return () => h('div', { class: 'w' }, 'w')
  }
  const stream = renderToStream(h('div', {}, h(Watch, {})), {}, registry)
  const root = browser.document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, browser.document)
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    applier.apply(value)
  }
  const compId = pathId('root.0', 0)   // 组件锚 id（root.0 的 0 子项）
  assert.ok(registry.get(compId), '实例已注册')
  disposeComponent(compId, registry)
  assert.deepEqual(cleaned, ['cleanup'], 'onUnmount 回调执行')
  assert.equal(registry.get(compId), undefined, '注册表已清理')
})

test('renderComponent 独立调用：工厂 + renderFn 输出经 sink', async () => {
  const seen: string[] = []
  const Comp: Component = () => (props) => h('span', {}, `v:${props.label}`)
  const sink = async (v: unknown) => { seen.push((v as { type: string }).type as string) }
  await renderComponent(
    h(Comp, { label: 'x' }) as never,
    'p', 0, null, 'cid', {} as UIContext, createComponentRegistry(),
    sink as never,
  )
  assert.deepEqual(seen, ['span'], '输出 vnode 经 sink 递归')
})
