/**
 * vdom 集成测试——mount + 渲染触发（无自动渲染）
 *
 * **核心原则回归（render-only）**：只有 ctx.ui.render() 显式触发才渲染（无自动渲染）。
 * 无 flush 批处理、无自动调度循环。
 *
 * 关键场景：
 * 1. $ 赋值 → 渲染（fire-and-forget async）
 * 2. .then 后 async 组件动态挂载 → 构建 → 渲染（列表页事故）
 * 3. chat 数组 [Ava, body] 动态挂载 + 不重复
 * 4. 无死循环：动态挂载后多次重渲染，工厂不重跑
 * 5. 组件输出 null ↔ 内容切换
 * 6. Portal 内容更新
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { h } from '../ui-dom/vnode.ts'
import { mountRoot } from '../ui-dom/vdom/mount.ts'

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

// ── 1. $ 赋值 → 重渲染 ──

test('集成：$ 赋值 → 组件重渲染（renderFn 重跑 + DOM 更新）', async () => {
  const el = mount('m1')
  const App = async (_init: any, ctx: any) => {
    let count = 0
    ;(globalThis as any).__inc = () => { count++; ctx.ui.render() }
    return () => h('button', {}, `count: ${count}`)
  }
  const handle = mountRoot({ browser: createClientBrowser(), root: el })
  await handle.mount(h(App, {}))
  assert.equal(el.textContent, 'count: 0')
  ;(globalThis as any).__inc()
  await tick()
  assert.equal(el.textContent, 'count: 1')
  ;(globalThis as any).__inc()
  await tick()
  assert.equal(el.textContent, 'count: 2')
})

// ── 2. .then 动态挂载（agents 列表场景）──

test('集成：.then 加载后 async 组件动态挂载 → 渲染（列表页事故）', async () => {
  const el = mount('m2')
  const Item = async (_init: any) => () => h('div', { class: 'item' }, 'I')
  const App = async (_init: any, ctx: any) => {
    let items: any[] = []
    ;(globalThis as any).__load = (it: any[]) => { items = it; ctx.ui.render() }
    return () => h('div', { class: 'list' },
      (items as any[]).map((i: any) => h(Item, { key: i })),
    )
  }
  const handle = mountRoot({ browser: createClientBrowser(), root: el })
  await handle.mount(h(App, {}))
  ;(globalThis as any).__load([1, 2, 3])
  await tick(); await tick()
  assert.equal(el.querySelectorAll('.item').length, 3, '3 items 渲染')
})

// ── 3. chat 场景：数组 [Ava, body] 动态挂载 + 不重复 ──

test('集成：chat 数组 [Ava, body] 动态挂载 → 渲染 ×1 不重复', async () => {
  const el = mount('m3')
  const Ava = async (_init: any) => () => h('div', { class: 'ava' }, 'A')
  const App = async (_init: any, ctx: any) => {
    let msgs: any[] = []
    ;(globalThis as any).__set = (list: any[]) => { msgs = list; ctx.ui.render() }
    return () => h('div', { class: 'list' },
      (msgs as any[]).map((m: any) =>
        h('div', { class: 'item', key: m.id }, h(Ava, {}), h('div', { class: 'body' }, String(m.id))),
      ),
    )
  }
  const handle = mountRoot({ browser: createClientBrowser(), root: el })
  await handle.mount(h(App, {}))
  ;(globalThis as any).__set([{ id: 1 }, { id: 2 }])
  await tick(); await tick()
  assert.equal(el.querySelectorAll('.item').length, 2, '2 items')
  assert.equal(el.querySelectorAll('.ava').length, 2, '2 avatars')
  assert.equal(el.querySelectorAll('.body').length, 2, '2 bodies')
  // 再次渲染同数组：不重复（chat ×2 回归）
  ;(globalThis as any).__set([{ id: 1 }, { id: 2 }])
  await tick(); await tick()
  assert.equal(el.querySelectorAll('.item').length, 2, '再次渲染不重复')
  assert.equal(el.querySelectorAll('.ava').length, 2)
  // 新增一条：3 items
  ;(globalThis as any).__set([{ id: 1 }, { id: 2 }, { id: 3 }])
  await tick(); await tick()
  assert.equal(el.querySelectorAll('.item').length, 3, '新增一条')
  assert.equal(el.querySelectorAll('.ava').length, 3)
})

// ── 4. 无死循环：动态挂载后反复重渲染（工厂不重跑、无自动渲染）──

test('集成：动态挂载后多次重渲染无死循环（工厂不重跑）', async () => {
  const el = mount('m4')
  let factoryCalls = 0
  const Item = async (_init: any) => { factoryCalls++; return () => h('div', { class: 'item' }, 'I') }
  const App = async (_init: any, ctx: any) => {
    let items: any[] = []
    let n = 0
    ;(globalThis as any).__load = (it: any[]) => { items = it; ctx.ui.render() }
    ;(globalThis as any).__bump = () => { n++; ctx.ui.render() }
    return () => h('div', {},
      h('span', { class: 'n' }, String(n)),
      (items as any[]).map((i: any) => h(Item, { key: i })),
    )
  }
  const handle = mountRoot({ browser: createClientBrowser(), root: el })
  await handle.mount(h(App, {}))
  ;(globalThis as any).__load([1, 2])
  await tick(); await tick()
  assert.equal(el.querySelectorAll('.item').length, 2)
  const callsAfterLoad = factoryCalls
  // 反复重渲染（n 变化）——每次 $ 赋值触发一次渲染，无新增动态挂载、无工厂重跑
  for (let i = 0; i < 5; i++) {
    ;(globalThis as any).__bump()
    await tick()
  }
  assert.equal(el.querySelectorAll('.item').length, 2, 'items 保持 2')
  assert.equal(factoryCalls, callsAfterLoad, '工厂不重跑（无死循环）')
  assert.equal(el.querySelector('.n')?.textContent, '5')
})

// ── 5. 组件输出 null（Modal open=false 场景）──

test('集成：组件输出 null ↔ 内容切换', async () => {
  const el = mount('m5')
  const Modal = async (_init: any, ctx: any) => {
    let open = false
    ;(globalThis as any).__open = () => { open = true; ctx.ui.render() }
    ;(globalThis as any).__close = () => { open = false; ctx.ui.render() }
    return () => open ? h('div', { class: 'modal' }, 'M') : null
  }
  const App = async (_init: any) => () => h('div', {}, h(Modal, {}), h('span', {}, 'tail'))
  const handle = mountRoot({ browser: createClientBrowser(), root: el })
  await handle.mount(h(App, {}))
  assert.equal(el.querySelector('.modal'), null, '初始 null')
  ;(globalThis as any).__open()
  await tick()
  assert.equal(el.querySelector('.modal')?.textContent, 'M', '打开')
  ;(globalThis as any).__close()
  await tick()
  assert.equal(el.querySelector('.modal'), null, '关闭')
  assert.equal(el.textContent, 'tail', '兄弟节点保持')
})

// ── 6. Portal 动态挂载 ──

test('集成：Portal 内容更新', async () => {
  const { createPortal } = await import('../ui-dom/vnode.ts')
  const el = mount('m6')
  const App = async (_init: any, ctx: any) => {
    let text = 'a'
    ;(globalThis as any).__set = (t: string) => { text = t; ctx.ui.render() }
    return () => h('div', {}, 'wrap', createPortal(h('span', { class: 'po' }, text), 'p'))
  }
  const handle = mountRoot({ browser: createClientBrowser(), root: el })
  await handle.mount(h(App, {}))
  const po = document.querySelector('#__wf_portal [data-portal="p"]')
  assert.equal(po?.textContent, 'a')
  ;(globalThis as any).__set('b')
  await tick(); await tick()
  assert.equal(document.querySelector('#__wf_portal [data-portal="p"]')?.textContent, 'b')
})

// ── 7. 手动 render()/dirty() 触发 ──

test('集成：ctx.ui.render()/dirty() 手动触发渲染', async () => {
  const el = mount('m7')
  const App = async (_init: any, ctx: any) => {
    let manual = 0
    ;(globalThis as any).__r = () => ctx.ui.render()
    return () => h('div', { class: 'man' }, `manual: ${manual++}`)
  }
  const handle = mountRoot({ browser: createClientBrowser(), root: el })
  await handle.mount(h(App, {}))
  assert.equal(el.querySelector('.man')?.textContent, 'manual: 0')
  ;(globalThis as any).__r()
  await tick()
  assert.equal(el.querySelector('.man')?.textContent, 'manual: 1', 'render() 触发')
  ;(globalThis as any).__r()
  await tick()
  assert.equal(el.querySelector('.man')?.textContent, 'manual: 2', 'render() 再次触发')
})
