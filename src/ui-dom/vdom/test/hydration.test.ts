/**
 * vdom hydration + SSR 测试
 *
 * hydration：buildVNode 预构建 → 游标收养（不重建 DOM——事件接线）
 * SSR：renderSsr → HTML 字符串 → __DATA__ → 客户端 hydrate 收养
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../../test/client/setup.ts'
import { createClientBrowser } from '../../browser.ts'
import { UIRouter, h } from '../../index.ts'
import { ssrPage, serializeData } from '../ssr.ts'
import { hydrateVNode } from '../hydration.ts'
import { createVdomContext } from '../mount.ts'
import { createRegistry } from '../registry.ts'

before(setupJsdom)
afterEach(() => {
  createClientBrowser().clearBody()
})

// ── 1. SSR：HTML 字符串（属性/事件剥离/组件展开） ──

test('SSR: 组件 → HTML（属性渲染 + 事件剥离 + 文本转义）', async () => {
  const Page = async (_init: any) => () =>
    h('div', { class: 'page', 'data-x': '1', onClick: () => {} },
      h('span', {}, 'hello <world>'),
      h('button', { draggable: true }, 'btn'),
    )
  const router = new UIRouter()
  router.get('/', () => h(Page, {}), { title: 'SSR' })
  const { html, dataScript, page } = await ssrPage(router, { url: '/' })
  assert.ok(html.includes('<div class="page" data-x="1">'), '属性渲染')
  assert.ok(!html.includes('onClick'), '事件剥离')
  assert.ok(html.includes('hello &lt;world&gt;'), '文本转义')
  assert.ok(html.includes('draggable="true"'), 'enumerated 显式字符串')
  assert.ok(dataScript.includes('window.__DATA__'), '__DATA__ 脚本')
  assert.ok(page.includes('<div id="root">'), '完整 HTML')
  assert.ok(page.includes('<title>SSR</title>'), '路由 title')
})

// ── 2. SSR + hydration：数据管道 __DATA__ 种子同步命中 ──

test('SSR + hydrate: ctx.data 预取 → __DATA__ → 客户端种子命中（fetcher 不重跑）', async () => {
  // SSR 阶段
  let serverFetches = 0
  const Page = async (_init: any, ctx: any) => {
    const user = await ctx.data.get('/api/user/7', async () => { serverFetches++; return { name: 'SSR-USER' } })
    return () => h('div', { id: 'user' }, user.name)
  }
  const router = new UIRouter()
  router.get('/', () => h(Page, {}))
  const { html, dataScript } = await ssrPage(router, { url: '/' })
  assert.equal(serverFetches, 1, '服务端 fetcher 一次')
  assert.ok(html.includes('SSR-USER'), 'SSR 渲染数据')
  // 客户端：__DATA__ 种子 + hydrate 收养
  ;(window as any).__DATA__ = JSON.parse(dataScript.replace(/<script>window.__DATA__=/, '').replace(/;<\/script>/, ''))
  const b = createClientBrowser()
  b.navigate('/')
  const el = b.createElement('div')
  if (!el) throw new Error('createElement failed')
  b.bodyAppend(el)
  el.id = 'root'
  el.innerHTML = html // 模拟服务端 HTML
  let clientFetches = 0
  const Page2 = async (_init: any, ctx: any) => {
    const user = await ctx.data.get('/api/user/7', async () => { clientFetches++; return { name: 'client' } })
    return () => h('div', { id: 'user' }, user.name)
  }
  const router2 = new UIRouter()
  router2.get('/', () => h(Page2, {}))
  const { ctx: vctx } = createVdomContext({ browser: b, root: el })
  // 模拟 vdom serve 注入的 ctx.data（__DATA__ 种子已在 dataCache）
  const dataCache = new Map<string, any>()
  for (const [k, v] of Object.entries((window as any).__DATA__)) dataCache.set(k, { value: v })
  ;(vctx as any).data = {
    async get(key: string) { const e = dataCache.get(key); return e && 'value' in e ? e.value : undefined },
    set(key: string, v: unknown) { dataCache.set(key, { value: v }) },
    has(key: string) { return dataCache.has(key) },
  }
  const vnode = h(Page2, {})
  await hydrateVNode(el, vnode, vctx)
  assert.equal(clientFetches, 0, '__DATA__ 种子命中——客户端不重跑 fetcher')
  assert.equal(el.querySelector('#user')?.textContent, 'SSR-USER', '收养服务端内容')
  delete (window as any).__DATA__
})

// ── 3. hydration：收养 DOM（不重建——引用保持 + 事件接线） ──

test('hydrate: 收养现有 DOM——元素引用保持 + 事件接线', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = b.createElement('div')
  if (!el) throw new Error('createElement failed')
  b.bodyAppend(el)
  el.id = 'root'
  el.innerHTML = '<div class="counter"><button id="b">0</button></div>' // 服务端 HTML
  let clicks = 0
  const Counter = async (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    $.n = 0
    ;(globalThis as any).__inc = () => { $.n++ }
    return () => h('div', { class: 'counter' }, h('button', { id: 'b', onClick: () => { clicks++; $.n++ } }, String($.n)))
  }
  const router = new UIRouter()
  router.get('/', () => h(Counter, {}))
  const { ctx: vctx } = createVdomContext({ browser: b, root: el })
  const vnode = h(Counter, {})
  await hydrateVNode(el, vnode, vctx)
  // 引用保持：button 是原节点（未重建）
  const btn = el.querySelector('#b') as HTMLElement
  assert.ok(btn, 'button 存在')
  // 事件接线：点击 → $ 赋值 → 渲染
  btn.dispatchEvent(new (window as any).MouseEvent('click'))
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(clicks, 1, '事件接线')
  assert.equal(el.querySelector('#b')?.textContent, '1', '$ 赋值渲染')
  // 清理（hydrate 后组件在注册表——手动清理）
  ;(globalThis as any).__inc()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(el.querySelector('#b')?.textContent, '2')
})

// ── 4. serializeData：XSS 转义 ──

test('serializeData: < 转义防 XSS', () => {
  const data = new Map<string, unknown>()
  data.set('x', '<script>alert(1)</script>')
  const s = serializeData(data)
  assert.ok(!s.includes('<script>alert'), '未转义的 script 不出现')
  assert.ok(s.includes('\\u003cscript'), '转义后')
})

// ── 5. hydration 残留清理 ──

test('hydrate: 服务端多余节点清理', async () => {
  const b = createClientBrowser()
  b.navigate('/')
  const el = b.createElement('div')
  if (!el) throw new Error('createElement failed')
  b.bodyAppend(el)
  el.id = 'root'
  el.innerHTML = '<div class="page"><span>keep</span><span>extra</span></div>'
  const Page = async (_init: any) => () => h('div', { class: 'page' }, h('span', {}, 'keep'))
  const router = new UIRouter()
  router.get('/', () => h(Page, {}))
  const { ctx: vctx } = createVdomContext({ browser: b, root: el })
  const vnode = h(Page, {})
  await hydrateVNode(el, vnode, vctx)
  assert.equal(el.querySelectorAll('span').length, 1, '多余 span 清理')
  assert.equal(el.querySelector('span')?.textContent, 'keep')
})
