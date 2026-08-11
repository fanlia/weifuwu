/**
 * vdom useExternal/createStore 测试（render-only 方案——design/render-only-plan.md）
 *
 * 覆盖：
 * 1. createStore：set/update/notify 通知订阅者；退订后不再通知
 * 2. useExternal：订阅共享 store → 变化 → 组件重渲染（DOM 更新）
 * 3. useExternal：unmount 自动退订（组件卸载后 store 变化不再触发渲染）
 * 4. useExternal 返回 store.state（渲染期读最新值）
 * 5. 多消费者：两个组件订阅同一 store，各自独立重渲染
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { h } from '../ui-dom/vnode.ts'
import { mountRoot } from '../ui-dom/vdom/mount.ts'
import { createStore } from '../ui-dom/store.ts'

before(setupJsdom)
afterEach(() => {
  createClientBrowser().clearBody()
})

function mount(id: string): HTMLDivElement {
  const b = createClientBrowser()
  const el = b.createElement('div')
  if (!el) throw new Error('createElement failed')
  b.bodyAppend(el)
  el.id = id
  return el
}

const tick = () => new Promise<void>((r) => setTimeout(r, 5))

// ── 1. createStore 订阅/通知 ──

test('createStore: set/update 通知订阅者；退订后不再通知', () => {
  const store = createStore({ count: 0, list: [] as string[] })
  let fired = 0
  const unsub = store.subscribe(() => fired++)

  store.set({ count: 1 })
  assert.equal(fired, 1)
  assert.equal(store.state.count, 1)

  store.update((s) => { s.list.push('a') })
  assert.equal(fired, 2)
  assert.deepEqual(store.state.list, ['a'])

  unsub()
  store.set({ count: 2 })
  assert.equal(fired, 2, '退订后不再通知')
})

test('createStore: 返回独立 state 实例（互不污染）', () => {
  const a = createStore({ x: 1 })
  const b = createStore({ x: 2 })
  assert.equal(a.state.x, 1)
  assert.equal(b.state.x, 2)
})

// ── 2. useExternal 集成：订阅 → 变化 → 组件重渲染 ──

test('useExternal: 订阅 store → set 变化 → 组件重渲染（DOM 更新）', async () => {
  const el = mount('ext1')
  const store = createStore({ count: 0 })

  const App = async (_init: any, ctx: any) => {
    ctx.ui.useExternal(store)          // 订阅：变化 → 自身重渲染
    return () => h('button', {}, `count: ${store.state.count}`)
  }
  const handle = mountRoot({ browser: createClientBrowser(), root: el })
  await handle.mount(h(App, {}))
  assert.equal(el.textContent, 'count: 0')

  store.set({ count: 5 })              // 写路径：自动通知订阅者
  await tick()
  assert.equal(el.textContent, 'count: 5', 'store 变化 → 组件重渲染')
})

test('useExternal: update 原地变异（push）→ 重渲染读到最新值', async () => {
  const el = mount('ext2')
  const store = createStore({ messages: [] as string[] })

  const App = async (_init: any, ctx: any) => {
    ctx.ui.useExternal(store)
    return () => h('div', {}, store.state.messages.map((m) => h('p', {}, m)))
  }
  const handle = mountRoot({ browser: createClientBrowser(), root: el })
  await handle.mount(h(App, {}))
  assert.equal(el.textContent, '')

  store.update((s) => { s.messages.push('hello') })
  await tick()
  assert.equal(el.textContent, 'hello', '原地 push + 显式 notify 路径')
})

// ── 3. unmount 自动退订 ──

test('useExternal: 组件卸载后 store 变化不再触发渲染（自动退订）', async () => {
  const el = mount('ext3')
  const store = createStore({ count: 0 })
  let renderCount = 0

  const App = async (_init: any, ctx: any) => {
    ctx.ui.useExternal(store)
    return () => { renderCount++; return h('div', {}, `count: ${store.state.count}`) }
  }
  const handle = mountRoot({ browser: createClientBrowser(), root: el })
  await handle.mount(h(App, {}))
  assert.equal(renderCount, 1)

  handle.unmount()                     // 卸载 → 自动退订
  store.set({ count: 1 })
  await tick()
  assert.equal(renderCount, 1, '卸载后订阅已退，不重渲染')
})

// ── 4. 多消费者：两个组件订阅同一 store，各自独立重渲染 ──

test('useExternal: 多消费者各自订阅同一 store', async () => {
  const el = mount('ext4')
  const store = createStore({ count: 0 })

  const A = async (_init: any, ctx: any) => {
    ctx.ui.useExternal(store)
    return () => h('span', {}, `A:${store.state.count}`)
  }
  const B = async (_init: any, ctx: any) => {
    ctx.ui.useExternal(store)
    return () => h('span', {}, `B:${store.state.count}`)
  }
  const App = async (_init: any, ctx: any) => {
    return () => h('div', {}, h(A, {}), h(B, {}))
  }
  const handle = mountRoot({ browser: createClientBrowser(), root: el })
  await handle.mount(h(App, {}))
  assert.equal(el.textContent, 'A:0B:0')

  store.set({ count: 9 })
  await tick()
  assert.equal(el.textContent, 'A:9B:9', '两个订阅者都重渲染')
})
