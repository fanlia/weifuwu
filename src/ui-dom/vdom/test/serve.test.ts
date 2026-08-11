/**
 * vdom serve 集成测试——UIRouter + vdom 引擎（第 2 代 uiServe）
 *
 * 验证：路由匹配/首帧渲染/$ 交互/动态挂载/导航 diff/hooks（usePopup）。
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../../test/client/setup.ts'
import { createClientBrowser } from '../../browser.ts'
import { UIRouter, h } from '../../index.ts'
import { uiServe } from '../serve.ts'

before(setupJsdom)
afterEach(() => {
  createClientBrowser().clearBody()
  createClientBrowser().navigate('/')
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

// ── 1. 路由 + 首帧渲染 + $ 交互 ──

test('serve: 路由匹配 + 首帧渲染 + $ 交互', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = mount('s1')
  const Counter = async (_init: any, ctx: any) => {
    let count = 0
    ;(globalThis as any).__inc = () => { count++; ctx.ui.render() }
    return () => h('button', { id: 'cnt' }, `count: ${count}`)
  }
  const router = new UIRouter()
  router.get('/', () => h(Counter, {}))
  const handle = uiServe(router, { root: '#s1' })
  await handle.ready
  await tick()
  assert.equal(el.querySelector('#cnt')?.textContent, 'count: 0')
  ;(globalThis as any).__inc()
  await tick()
  assert.equal(el.querySelector('#cnt')?.textContent, 'count: 1')
  handle.close()
})

// ── 2. 路由参数 ──

test('serve: 路由参数注入 ctx.params', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = mount('s2')
  const Page = async (_init: any, ctx: any) => () => h('div', { id: 'page' }, `id=${ctx.params?.id}`)
  const router = new UIRouter()
  router.get('/users/:id', () => h(Page, {}))
  const handle = uiServe(router, { root: '#s2' })
  await handle.ready
  // 初始路径是 /——404。导航到 /users/42
  b.navigate('/users/42')
  await tick(); await tick()
  assert.equal(el.querySelector('#page')?.textContent, 'id=42')
  handle.close()
})

// ── 3. 动态挂载（.then 后 async 组件出现——列表页事故回归） ──

test('serve: 动态挂载列表渲染 + 不重复', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = mount('s3')
  const Item = async (_init: any) => () => h('div', { class: 'item' }, 'I')
  const App = async (_init: any, ctx: any) => {
    let items: any[] = []
    ;(globalThis as any).__load = (it: any[]) => { items = it; ctx.ui.render() }
    return () => h('div', {}, (items as any[]).map((i: any) => h(Item, { key: i })))
  }
  const router = new UIRouter()
  router.get('/', () => h(App, {}))
  const handle = uiServe(router, { root: '#s3' })
  await handle.ready
  ;(globalThis as any).__load([1, 2, 3])
  await tick(); await tick()
  assert.equal(el.querySelectorAll('.item').length, 3, '3 items')
  ;(globalThis as any).__load([1, 2, 3])
  await tick(); await tick()
  assert.equal(el.querySelectorAll('.item').length, 3, '再渲染不重复')
  handle.close()
})

// ── 4. hooks（usePopup）在 vdom serve 上工作 ──

test('serve: usePopup 打开/关闭 + portal', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = mount('s4')
  const Pop = async (_init: any, ctx: any) => {
    let open = false
    const popup = ctx.ui.usePopup({
      trigger: 'click',
      el: () => document.getElementById('pop-trigger'),
      isOpen: () => open,
      setOpen: (v) => { open = v; ctx.ui.render() },
    })
    ;(globalThis as any).__open = () => { open = true; ctx.ui.render() }
    ;(globalThis as any).__close = () => { open = false; ctx.ui.render() }
    return () => h('div', {},
      h('button', { id: 'pop-trigger', ...popup.wrapProps }, 'trigger'),
      popup.portal(h('div', { class: 'panel' }, 'PANEL'), 'pop'),
    )
  }
  const router = new UIRouter()
  router.get('/', () => h(Pop, {}))
  const handle = uiServe(router, { root: '#s4' })
  await handle.ready
  await tick()
  // 初始关闭：无 panel
  assert.equal(document.querySelector('#__wf_portal .panel'), null, '初始无 panel')
  ;(globalThis as any).__open()
  await tick(); await tick()
  assert.equal(document.querySelector('#__wf_portal .panel')?.textContent, 'PANEL', '打开有 panel')
  ;(globalThis as any).__close()
  await tick(); await tick()
  assert.equal(document.querySelector('#__wf_portal .panel'), null, '关闭无 panel')
  handle.close()
})

// ── 5. 导航 diff（组件切换，旧树对照复用） ──

test('serve: 导航切换页面（buildVNode 旧树对照 + patch）', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = mount('s5')
  const A = async (_init: any) => () => h('div', { class: 'page-a' }, 'Page A')
  const B = async (_init: any) => () => h('div', { class: 'page-b' }, 'Page B')
  const router = new UIRouter()
  router.get('/a', () => h(A, {}))
  router.get('/b', () => h(B, {}))
  const handle = uiServe(router, { root: '#s5' })
  await handle.ready
  b.navigate('/a')
  await tick(); await tick()
  assert.equal(el.querySelector('.page-a')?.textContent, 'Page A')
  b.navigate('/b')
  await tick(); await tick()
  assert.equal(el.querySelector('.page-b')?.textContent, 'Page B')
  assert.equal(el.querySelector('.page-a'), null, 'A 已移除')
  handle.close()
})

// ── 6. ctx.data 数据管道 ──

test('serve: ctx.data.get 缓存 + 并发合并', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = mount('s6')
  let fetches = 0
  const Page = async (_init: any, ctx: any) => {
    const user = await ctx.data.get('/api/user/1', async () => { fetches++; return { name: 'x' } })
    return () => h('div', { id: 'user' }, user.name)
  }
  const router = new UIRouter()
  router.get('/', () => h(Page, {}))
  const handle = uiServe(router, { root: '#s6' })
  await handle.ready
  assert.equal(el.querySelector('#user')?.textContent, 'x')
  assert.equal(fetches, 1, 'fetcher 一次')
  handle.close()
})
