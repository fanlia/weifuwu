/**
 * 模式 A（design/async-mode-a-plan.md）验收测试
 *
 * S1 验证：
 *   - buildVNode 兄弟 async 组件并行（Promise.all——父子串行、兄弟并行）
 *   - 导航原子切换：旧页保持到新树构建完成（零占位闪烁）
 *   - 动态挂载兜底：运行时首次挂载 async 组件 → 注释占位 → resolve 后局部补全（不整树）
 * S2 验证：
 *   - handle.ready：首帧（await 全部 + 落地）完成后 resolve
 *   - loading 模式：预置骨架屏被原子替换
 */
import { test, afterEach, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { UIRouter, uiServe, h } from '../ui-dom/index.ts'

before(setupJsdom)

afterEach(() => {
  createClientBrowser().clearBody()
  createClientBrowser().navigate('/')
})

function mount(id: string): HTMLDivElement {
  const b = createClientBrowser()
  const el = b.createElement('div')
  b.bodyAppend(el)
  el.id = id
  return el
}

function flush(ms = 0) { return new Promise<void>((r) => setTimeout(r, ms)) }

// ── S1：buildVNode 兄弟并行 ─────────────────────────────

test('S1 兄弟 async 组件并行：两个 50ms 工厂总耗时 < 90ms（非串行）', async () => {
  const b = createClientBrowser()
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
  const Slow = async (init: any) => {
    await sleep(50)
    return () => h('div', { class: 'para' }, String(init.label))
  }
  const router = new UIRouter()
  router.get('/', () => h('div', {}, h(Slow, { label: 'a' }), h(Slow, { label: 'b' })))
  b.navigate('/')
  const el = mount('ma-para')
  const t0 = Date.now()
  const handle = uiServe(router, { root: '#ma-para' })
  while (el.querySelectorAll('.para').length < 2) await flush(5)
  const elapsed = Date.now() - t0
  assert.equal(el.querySelectorAll('.para').length, 2, '两个兄弟都落地')
  assert.ok(elapsed < 90, `兄弟并行（串行需 ~100ms）：实际 ${elapsed}ms`)
  handle.close()
})

// ── S1：导航原子切换 ────────────────────────────────────

test('S1 导航原子切换：旧页保持到新树构建完成（零占位闪烁）', async () => {
  const b = createClientBrowser()
  let resolveSlow!: () => void
  const slowGate = new Promise<void>((r) => { resolveSlow = r })
  const Slow = async (_init: any) => {
    await slowGate
    return () => h('div', { id: 'ma-slow' }, '慢页')
  }
  const router = new UIRouter()
  router.get('/', () => h('div', { id: 'ma-home' }, '首页'))
  router.get('/slow', () => h(Slow, {}))
  b.navigate('/')
  const el = mount('ma-nav')
  const handle = uiServe(router, { root: '#ma-nav' })
  await flush()
  assert.equal(el.querySelector('#ma-home')?.textContent, '首页')

  // 导航到慢页：buildVNode await 期间（slowGate 未开）旧页必须保持
  b.navigate('/slow')
  ;(window as any).dispatchEvent(new PopStateEvent('popstate'))
  await flush(5)
  assert.equal(el.querySelector('#ma-home')?.textContent, '首页', '构建期旧页保持（无占位/空白替换）')
  assert.equal(el.querySelector('#ma-slow'), null, '新页未落地（await 全部）')

  // 数据就绪 → 原子切换
  resolveSlow()
  await flush(5)
  assert.equal(el.querySelector('#ma-slow')?.textContent, '慢页', '新页原子切换')
  assert.equal(el.querySelector('#ma-home'), null, '旧页移除')
  handle.close()
})

// ── S1：动态挂载局部补全 ────────────────────────────────

test('S1 动态挂载：运行时切出 async 组件 → 占位 → resolve → 局部补全（兄弟不重渲染）', async () => {
  const b = createClientBrowser()
  let siblingRenders = 0
  let resolveSlow!: () => void
  const slowGate = new Promise<void>((r) => { resolveSlow = r })
  const Sibling = async (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    $.n = 0
    return () => { siblingRenders++; return h('span', { id: 'ma-sib' }, `sib:${$.n}`) }
  }
  const Slow = async (_init: any) => {
    await slowGate
    return () => h('div', { id: 'ma-dyn' }, '动态加载')
  }
  const Holder = async (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    $.show = false
    ;(globalThis as any).__maToggle = () => { $.show = true }
    return () => h('div', {}, h(Sibling, {}), $.show ? h(Slow, {}) : null)
  }
  const router = new UIRouter()
  router.get('/', () => h(Holder, {}))
  b.navigate('/')
  const el = mount('ma-dyn-root')
  const handle = uiServe(router, { root: '#ma-dyn-root' })
  await flush()

  ;(globalThis as any).__maToggle()
  await flush(5)
  assert.equal(el.querySelector('#ma-dyn'), null, '动态挂载未 resolve：内容未出现')
  assert.ok(el.querySelector('#ma-sib'), '兄弟仍在')
  const siblingAfterTrigger = siblingRenders

  resolveSlow()
  await flush(5)
  assert.equal(el.querySelector('#ma-dyn')?.textContent, '动态加载', 'resolve 后局部补全')
  assert.equal(siblingRenders, siblingAfterTrigger, '局部补全不重渲染兄弟组件（非整树）')
  handle.close()
})

// ── S2：handle.ready + loading 骨架屏 ───────────────────

test('S2 handle.ready：首帧（await 全部 + 落地）完成后 resolve', async () => {
  const b = createClientBrowser()
  let resolveSlow!: () => void
  const slowGate = new Promise<void>((r) => { resolveSlow = r })
  const Slow = async (_init: any) => {
    await slowGate
    return () => h('div', { id: 'ma-ready' }, '数据页')
  }
  const router = new UIRouter()
  router.get('/', () => h(Slow, {}))
  b.navigate('/')
  const el = mount('ma-ready-h')
  const handle = uiServe(router, { root: '#ma-ready-h' })
  let readyResolved = false
  ;(handle as any).ready.then(() => { readyResolved = true })
  await flush(5)
  assert.equal(readyResolved, false, 'await 全部未完成 → ready 未 resolve')
  assert.equal(el.querySelector('#ma-ready'), null, '内容未落地')

  resolveSlow()
  await flush(5)
  assert.equal(readyResolved, true, '首帧完成 → ready resolve')
  assert.equal(el.querySelector('#ma-ready')?.textContent, '数据页', '内容落地')
  handle.close()
})

test('S2 loading 模式：预置骨架屏被原子替换（不 append 残留）', async () => {
  const b = createClientBrowser()
  const Page = async (_init: any) => () => h('div', { id: 'ma-content' }, '内容')
  const router = new UIRouter()
  router.get('/', () => h(Page, {}))
  b.navigate('/')
  const el = mount('ma-loading')
  // 调用方预置骨架屏
  el.innerHTML = '<div class="skeleton">加载中…</div>'
  const handle = uiServe(router, { root: '#ma-loading', loading: true } as any)
  await flush()
  assert.equal(el.querySelector('#ma-content')?.textContent, '内容', '内容落地')
  assert.equal(el.querySelector('.skeleton'), null, '骨架屏被替换（非残留）')
  assert.equal(el.childNodes.length, 1, '根节点仅一个（原子替换）')
  handle.close()
})
