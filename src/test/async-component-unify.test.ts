/**
 * 组件统一回归测试——asyncComponent → 原生 async 组件（TDD 红→绿）
 *
 * 目标形态（与 Component 同签名，唯一差别是 async 关键字）：
 * ```tsx
 * const Home = async (initProps, ctx) => {
 *   const msg = await ctx.data.get('/api/hello')   // 三场景：SSR→__DATA__ / hydration 种子 / SPA fetch
 *   return (props) => <h1>{msg.msg}</h1>
 * }
 * ```
 *
 * 关键决策（design/async-component-unify-plan.md）：
 *   D1 签名统一：AsyncComponent = (initProps, ctx) => Promise<Component>——判别改为返回值 instanceof Promise
 *   D2 缓存按实例：工厂结果存组件实例；ctx.data 兜底去重；asyncComponent 保留为显式全局一次
 *   D3 占位/补全复用现有机制（mountComponent 返回 null + scheduleFullReRender）
 *   D4 SSR 遍历器统一 await，删 isAsyncComponent 分支
 */
import { test, afterEach, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { UIRouter, uiServe, h, asyncComponent, Suspense } from '../ui-dom/index.ts'
import { ssrToString } from '../ui/ssr.ts'

before(setupJsdom)

afterEach(() => {
  createClientBrowser().clearBody()
  createClientBrowser().navigate('/')
  delete (globalThis as any).__DATA__
})

function mount(id: string): HTMLDivElement {
  const b = createClientBrowser()
  const el = b.createElement('div')
  b.bodyAppend(el)
  el.id = id
  return el
}

function flush() {
  return new Promise<void>((r) => setTimeout(r, 0))
}

// ── T9 Suspense 边界（可选：占位显示 fallback） ──────────

test('T9 Suspense 边界：async 组件占位期显示 fallback，resolve 后显示内容', async () => {
  const b = createClientBrowser()
  let resolveSlow!: () => void
  const slowPromise = new Promise<void>((r) => { resolveSlow = r })
  const Slow = async (_init: any) => {
    await slowPromise
    return () => h('div', { id: 't9' }, 'loaded')
  }
  const router = new UIRouter()
  router.get('/', () =>
    h('div', { id: 't9-wrap' },
      h(Suspense, { fallback: h('span', { id: 't9-fb' }, 'loading…') }, h(Slow, {})),
    ),
  )
  b.navigate('/')
  const el = mount('unify-t9')
  const handle = uiServe(router, { root: '#unify-t9' })
  await flush()

  // 占位期（promise 未 resolve）：Suspense fallback 显示
  assert.equal(el.querySelector('#t9-fb')?.textContent, 'loading…', '占位期显示 fallback')
  assert.equal(el.querySelector('#t9'), null, '内容未加载')

  // resolve 后：内容显示，fallback 消失
  resolveSlow()
  await flush()
  assert.equal(el.querySelector('#t9')?.textContent, 'loaded', 'resolve 后显示内容')
  assert.equal(el.querySelector('#t9-fb'), null, 'fallback 消失')
  handle.close()
})

test('T9b 无 Suspense 边界：占位为 null（向后兼容，行为同旧占位）', async () => {
  const b = createClientBrowser()
  let resolveSlow!: () => void
  const slowPromise = new Promise<void>((r) => { resolveSlow = r })
  const Slow = async (_init: any) => {
    await slowPromise
    return () => h('div', { id: 't9b' }, 'loaded')
  }
  const router = new UIRouter()
  router.get('/', () => h('div', {}, h(Slow, {})))
  b.navigate('/')
  const el = mount('unify-t9b')
  const handle = uiServe(router, { root: '#unify-t9b' })
  await flush()

  assert.equal(el.querySelector('#t9b'), null, '占位期无输出（fallback 缺失 → null）')
  resolveSlow()
  await flush()
  assert.equal(el.querySelector('#t9b')?.textContent, 'loaded', 'resolve 后显示')
  handle.close()
})

// ── T1 原生 async 组件挂载（占位 → 补全） ─────────────────

test('T1 原生 async 组件（无 asyncComponent 包装）→ 占位后 DOM 补全', async () => {
  const b = createClientBrowser()
  const Home = async (_init: any, ctx: any) => {
    const msg = await Promise.resolve({ text: 'hello async' })
    return (props: any) => h('div', { id: 't1' }, `${msg.text} ${props.suffix ?? ''}`)
  }
  const router = new UIRouter()
  router.get('/', () => h(Home, {}))
  b.navigate('/')
  const el = mount('unify-t1')
  const handle = uiServe(router, { root: '#unify-t1' })
  await flush()

  assert.equal(el.querySelector('#t1')?.textContent, 'hello async ', 'async 组件必须挂载并补全（修复前：抛"must return a render function"）')
  handle.close()
})

test('T1b async 组件工厂拿得到 initProps（与同步组件同签名）', async () => {
  const b = createClientBrowser()
  const Card = async (initProps: any, ctx: any) => {
    const d = await Promise.resolve({ prefix: initProps.prefix ?? 'p' })
    return () => h('span', { id: 't1b' }, `${d.prefix}:c`)
  }
  const router = new UIRouter()
  router.get('/', () => h('div', {}, h(Card, { prefix: 'X' }), h(Card, { prefix: 'Y' })))
  b.navigate('/')
  const el = mount('unify-t1b')
  const handle = uiServe(router, { root: '#unify-t1b' })
  await flush()

  assert.equal(el.querySelectorAll('#t1b').length, 2, '两个实例')
  const texts = [...el.querySelectorAll('#t1b')].map((n) => n.textContent)
  assert.deepEqual(texts, ['X:c', 'Y:c'], 'initProps 各实例独立传入')
  handle.close()
})

// ── T2 ctx.data 三场景（SSR __DATA__ / hydration 种子 / SPA fetch） ──

test('T2a SSR：原生 async 组件内 ctx.data.get → 数据进 __DATA__ 与 HTML', async () => {
  const data = new Map<string, unknown>()
  const Page = async (_init: any, ctx: any) => {
    const post = await ctx.data.get('/api/posts/1', async () => ({ title: 'SSR 标题' }))
    return () => h('article', {}, h('h1', {}, post.title))
  }
  const html = await ssrToString(Page, {}, {}, { data } as any)
  assert.equal(html.toString(), '<article><h1>SSR 标题</h1></article>')
  assert.deepEqual(data.get('/api/posts/1'), { title: 'SSR 标题' }, 'dataStore 收集 → __DATA__ 序列化')
})

test('T2b hydration：__DATA__ 种子命中 → 不触发 fetcher', async () => {
  const b = createClientBrowser()
  ;(globalThis as any).__DATA__ = { '/api/seed': { v: '种子值' } }
  let fetchCount = 0
  const Page = async (_init: any, ctx: any) => {
    const d = await ctx.data.get('/api/seed', async () => { fetchCount++; return { v: 'fetched' } })
    return () => h('div', { id: 't2b' }, d.v)
  }
  const router = new UIRouter()
  router.get('/', () => h(Page, {}))
  b.navigate('/')
  const el = mount('unify-t2b')
  const handle = uiServe(router, { root: '#unify-t2b' })
  await flush()

  assert.equal(el.querySelector('#t2b')?.textContent, '种子值', 'hydration 种子命中')
  assert.equal(fetchCount, 0, '种子命中不 fetch')
  handle.close()
})

test('T2c SPA：无种子 → 触发 fetcher 并补全', async () => {
  const b = createClientBrowser()
  const Page = async (_init: any, ctx: any) => {
    const d = await ctx.data.get('/api/spa', async () => ({ v: 'fetched' }))
    return () => h('div', { id: 't2c' }, d.v)
  }
  const router = new UIRouter()
  router.get('/', () => h(Page, {}))
  b.navigate('/')
  const el = mount('unify-t2c')
  const handle = uiServe(router, { root: '#unify-t2c' })
  await flush()

  assert.equal(el.querySelector('#t2c')?.textContent, 'fetched', 'SPA 未命中触发 fetcher')
  handle.close()
})

// ── T3 多实例 initProps 隔离 ─────────────────────────────

test('T3 多实例 initProps 隔离：工厂按实例执行，各得各自数据', async () => {
  const b = createClientBrowser()
  const Card = async (initProps: any, ctx: any) => {
    const d = await ctx.data.get(`/api/card/${initProps.url}`, async () => ({ v: initProps.url === 'a' ? '1' : '2' }))
    return () => h('div', { id: 't3' }, `${initProps.url}:${d.v}`)
  }
  const router = new UIRouter()
  router.get('/', () => h('div', {}, h(Card, { url: 'a' }), h(Card, { url: 'b' })))
  b.navigate('/')
  const el = mount('unify-t3')
  const handle = uiServe(router, { root: '#unify-t3' })
  await flush()

  const texts = [...el.querySelectorAll('#t3')].map((n) => n.textContent)
  assert.deepEqual(texts.sort(), ['a:1', 'b:2'].sort(), 'url=a 与 url=b 各得各自数据（全局一次缓存会串数据）')
  handle.close()
})

// ── T4 工厂执行次数（ctx.data fetcher 仍 1 次） ───────────

test('T4 工厂按实例执行 N 次；ctx.data fetcher 合并只 1 次', async () => {
  const b = createClientBrowser()
  let factoryRuns = 0
  let fetcherRuns = 0
  const Card = async (_init: any, ctx: any) => {
    factoryRuns++
    const d = await ctx.data.get('/api/shared', async () => { fetcherRuns++; return { v: 'x' } })
    return () => h('div', { class: 't4' }, d.v)
  }
  const router = new UIRouter()
  router.get('/', () => h('div', {}, h(Card, {}), h(Card, {}), h(Card, {})))
  b.navigate('/')
  const el = mount('unify-t4')
  const handle = uiServe(router, { root: '#unify-t4' })
  await flush()

  assert.equal(el.querySelectorAll('.t4').length, 3, '三个实例')
  assert.equal(factoryRuns, 3, '工厂按实例执行 3 次')
  assert.equal(fetcherRuns, 1, 'ctx.data 同 key 并发合并 → fetcher 只 1 次')
  handle.close()
})

// ── T5 同步组件零感知 ───────────────────────────────────

test('T5 同步组件与原生 async 组件混排正常', async () => {
  const b = createClientBrowser()
  const Sync = (_init: any) => (props: any) => h('span', { class: 'sync' }, `s:${props.x}`)
  const Async = async (_init: any) => {
    await Promise.resolve()
    return (props: any) => h('span', { class: 'async' }, `a:${props.x}`)
  }
  const router = new UIRouter()
  router.get('/', () => h('div', {}, h(Sync, { x: 1 }), h(Async, { x: 2 })))
  b.navigate('/')
  const el = mount('unify-t5')
  const handle = uiServe(router, { root: '#unify-t5' })
  await flush()

  assert.equal(el.querySelector('.sync')?.textContent, 's:1')
  assert.equal(el.querySelector('.async')?.textContent, 'a:2', 'async 与同步混排')
  handle.close()
})

// ── T6 SSR await（嵌套 async） ──────────────────────────

test('T6 SSR：嵌套原生 async 组件 await 展开', async () => {
  const Inner = async (_init: any) => {
    await Promise.resolve()
    return () => h('b', {}, 'inner')
  }
  const Outer = async (_init: any, ctx: any) => {
    const d = await Promise.resolve({ label: 'outer' })
    return () => h('div', {}, d.label, h(Inner, {}))
  }
  const html = await ssrToString(Outer, {}, {}, { data: new Map() } as any)
  assert.equal(html.toString(), '<div>outer<b>inner</b></div>', 'SSR 直接 await 无占位')
})

// ── T7 asyncComponent 兼容（显式全局一次） ───────────────

test('T7 asyncComponent 包装仍可用（全局一次 + 无占位）', async () => {
  const b = createClientBrowser()
  let factoryRuns = 0
  const Profile = asyncComponent(async (ctx: any) => {
    factoryRuns++
    const d = await Promise.resolve({ name: 'Bob' })
    return (_init: any) => (props: any) => h('div', { id: 't7' }, `user:${d.name}`)
  })
  const router = new UIRouter()
  router.get('/', () => h('div', {}, h(Profile, {}), h(Profile, {})))
  b.navigate('/')
  const el = mount('unify-t7')
  const handle = uiServe(router, { root: '#unify-t7' })
  await flush()

  assert.equal(el.querySelectorAll('#t7').length, 2, '两个实例')
  assert.equal(factoryRuns, 1, 'asyncComponent 显式全局一次')
  handle.close()
})

// ── T8 _render 复用（resolve 后二次渲染不重跑工厂） ──────

test('T8 resolve 后 $ 赋值二次渲染：走 _render，不重跑工厂', async () => {
  const b = createClientBrowser()
  let factoryRuns = 0
  const Home = async (_init: any, ctx: any) => {
    factoryRuns++
    const d = await Promise.resolve({ base: 'b' })
    const $ = ctx.ui.$()
    $.count = 0
    ;(globalThis as any).__inc = () => { $.count++ }
    return () => h('div', { id: 't8' }, `${d.base}:${$.count}`)
  }
  const router = new UIRouter()
  router.get('/', () => h(Home, {}))
  b.navigate('/')
  const el = mount('unify-t8')
  const handle = uiServe(router, { root: '#unify-t8' })
  await flush()

  assert.equal(el.querySelector('#t8')?.textContent, 'b:0')
  const runsAfterMount = factoryRuns
  ;(globalThis as any).__inc()
  await flush()
  assert.equal(el.querySelector('#t8')?.textContent, 'b:1', '$ 赋值触发重渲染')
  assert.equal(factoryRuns, runsAfterMount, '二次渲染不重跑工厂（走 _render）')
  handle.close()
})

test('T10 hydration：hydrate:true + SSR HTML 种子 → async 组件收养渲染', async () => {
  const b = createClientBrowser()
  ;(globalThis as any).__DATA__ = { '/api/hyd': { v: 'hydrated' } }
  const Page = async (_init: any, ctx: any) => {
    const d = await ctx.data.get('/api/hyd', async () => ({ v: 'fetched' }))
    return () => h('div', { id: 't10' }, d.v)
  }
  // 模拟 SSR 已输出 HTML（含 async-page 内容——工厂已 await，无占位）
  const el = mount('unify-t10')
  el.innerHTML = '<div class="shell"><div id="t10">hydrated</div></div>'
  const router = new UIRouter()
  router.get('/', () => h('div', { class: 'shell' }, h(Page, {})))
  b.navigate('/')
  const handle = uiServe(router, { root: '#unify-t10', hydrate: true })
  await flush(); await flush()

  assert.equal(el.querySelector('#t10')?.textContent, 'hydrated', 'hydration 种子命中：async 组件内容保留/渲染')
  handle.close()
})
