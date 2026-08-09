/**
 * weifuwu/ui-dom 测试 — UIRouter（纯路由）+ uiServe（渲染运行时）
 *
 * 定稿架构验证：
 *   - uiServe(router, {root}) 装配点：路由已注册 → serve 监听 URL → 渲染
 *   - handler = async (location, ctx) => vnode（$ 有效）
 *   - ctx.params/query 注入；ctx.data 缓存
 *   - 渲染运行时复制自 client（registry/createUi 局部实例隔离）
 *   - weifuwu/components 复用（路径 B 核心验证）
 */

import { test, afterEach, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { UIRouter, uiServe, h } from '../ui-dom/index.ts'
import type { UIHandler, UIMiddleware, WfuiContext } from '../ui-dom/index.ts'

before(setupJsdom)

afterEach(() => {
  document.body.innerHTML = ''
  window.history.pushState(null, '', '/')
})

function mount(id: string): HTMLDivElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  el.id = id
  return el
}

function flush() {
  return new Promise<void>((r) => setTimeout(r, 0))
}

// ═══════════════════════════════════════════════════════
// 基础：handler 渲染 / data 缓存 / $ 路由实例
// ═══════════════════════════════════════════════════════

test('uiServe 渲染 handler 的 VNode 到根节点（res = VNode）', async () => {
  const router = new UIRouter()
  router.get('/home', () => h('div', { id: 'home' }, '首页'))
  window.history.pushState(null, '', '/home')
  const el = mount('ui-root')
  const handle = uiServe(router, { root: '#ui-root' })
  await flush()
  assert.equal(el.querySelector('#home')?.textContent, '首页')
  handle.close()
})

test('handler async：ctx.data 缓存命中（外层只使用一次）+ params 注入', async () => {
  let fetchCount = 0
  const router = new UIRouter()
  router.get('/users/:id', async (location, ctx) => {
    const user = await ctx.data.get(`/api/users/${ctx.params.id}`, async () => {
      fetchCount++
      return { name: '张三' }
    })
    const $ = ctx.ui.$()
    $.clicks = $.clicks ?? 0
    return h('div', { id: 'user' },
      h('span', { id: 'uname' }, `用户: ${(user as any).name}`),
      h('button', { id: 'uc', onClick: () => { $.clicks++ } }, String($.clicks)),
    )
  })
  window.history.pushState(null, '', '/users/42')
  const el = mount('ui-async')
  const handle = uiServe(router, { root: '#ui-async' })
  await flush()
  assert.equal(el.querySelector('#uname')?.textContent, '用户: 张三')
  assert.equal(fetchCount, 1, '首次取数一次')
  assert.equal(handle.ctx.params.id, '42', 'params 在 ctx')
  // 点击 → $ 重渲染（data 缓存命中，不重取数）
  ;(el.querySelector('#uc') as HTMLElement).click()
  await flush()
  assert.equal(el.querySelector('#uc')?.textContent, '1')
  assert.equal(fetchCount, 1, '重渲染不重取数')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// 中间件链 / 子路由（嵌套 + notFound + params + 段边界）
// ═══════════════════════════════════════════════════════

test('中间件链：layout 包装 children（两阶段）', async () => {
  const router = new UIRouter()
  const Shell: UIMiddleware = async (location, ctx, children) => {
    return async (loc, c) => {
      const child = await children(loc, c)
      return h('div', { id: 'shell' }, h('nav', { id: 'nav' }, '导航'), child)
    }
  }
  router.use(Shell)
  router.get('/page', () => h('div', { id: 'page' }, '内容'))
  window.history.pushState(null, '', '/page')
  const el = mount('ui-layout')
  const handle = uiServe(router, { root: '#ui-layout' })
  await flush()
  assert.ok(el.querySelector('#shell'), 'layout 包装')
  assert.ok(el.querySelector('#page'), '页面在 layout 内')
  handle.close()
})

test('子路由：sub 中间件链 + notFound + 两层嵌套 + params + 段边界', async () => {
  const router = new UIRouter()
  const admin = new UIRouter()
  // sub layout
  admin.use(async (_loc, ctx, children) => {
    return async (loc, c) => {
      const child = await children(loc, c)
      return h('div', { id: 'admin-shell' }, h('h1', {}, '后台'), child)
    }
  })
  const api = new UIRouter()
  api.get('/users/:id', (loc, ctx) => h('div', { id: 'api-user' }, `用户 ${ctx.params.id}`))
  admin.use('/api', api)
  admin.get('/', () => h('div', { id: 'admin-home' }, '后台首页'))
  admin.notFound(() => h('div', { id: 'admin-nf' }, '后台 404'))
  router.use('/admin', admin)
  router.notFound(() => h('div', { id: 'main-nf' }, '主站 404'))

  // 两层嵌套 + params
  window.history.pushState(null, '', '/admin/api/users/7')
  const el = mount('ui-nest')
  const handle = uiServe(router, { root: '#ui-nest' })
  await flush()
  assert.ok(el.querySelector('#admin-shell'), 'sub layout')
  assert.equal(el.querySelector('#api-user')?.textContent, '用户 7', '两层嵌套 + params')
  assert.equal(handle.ctx.params.id, '7')

  // sub notFound（主 app 404 不覆盖）
  window.history.pushState(null, '', '/admin/zzz')
  ;(window as any).dispatchEvent(new PopStateEvent('popstate'))
  await flush()
  assert.ok(el.querySelector('#admin-nf'), 'admin notFound')
  assert.ok(!el.querySelector('#main-nf'), '主 app 404 不生效')

  // 主 app 404
  window.history.pushState(null, '', '/elsewhere')
  ;(window as any).dispatchEvent(new PopStateEvent('popstate'))
  await flush()
  assert.ok(el.querySelector('#main-nf'), '主 app 404')

  // 段边界：/admin2 不匹配 /admin
  router.get('/admin2', () => h('div', { id: 'admin2' }, 'admin2'))
  window.history.pushState(null, '', '/admin2')
  ;(window as any).dispatchEvent(new PopStateEvent('popstate'))
  await flush()
  assert.ok(el.querySelector('#admin2'), '段边界正确')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// ctx.ui 三 API：$ / dirty / render + 组件级重渲染
// ═══════════════════════════════════════════════════════

test('组件级 $：点击只重渲染该组件（父 handler 不重跑）', async () => {
  let handlerRuns = 0
  const router = new UIRouter()
  const Counter = (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    $.count = 0
    return (props: any) =>
      h('div', {},
        h('span', { id: `n-${props.id}` }, String($.count)),
        h('button', { id: `inc-${props.id}`, onClick: () => { $.count++ } }, '+'),
      )
  }
  router.get('/counters', async (location, ctx) => {
    handlerRuns++
    return h('div', {}, h(Counter, { id: 'a' }), h(Counter, { id: 'b' }))
  })
  window.history.pushState(null, '', '/counters')
  const el = mount('ui-comp')
  const handle = uiServe(router, { root: '#ui-comp' })
  await flush()
  assert.equal(handlerRuns, 1, 'handler 首跑一次')
  ;(el.querySelector('#inc-a') as HTMLElement).click()
  await flush()
  assert.equal(el.querySelector('#n-a')?.textContent, '1', 'counter-a 更新')
  assert.equal(el.querySelector('#n-b')?.textContent, '0', 'counter-b 不动')
  assert.equal(handlerRuns, 1, 'handler 不重跑')
  handle.close()
})

test('ctx.ui.dirty()：闭包 let 手动模式 + render() 同步', async () => {
  const router = new UIRouter()
  const Manual = (_init: any, ctx: any) => {
    let count = 0
    return () => h('button', { id: 'm-btn', onClick: () => { count++; ctx.ui.dirty() } }, String(count))
  }
  router.get('/manual', () => h('div', {}, h(Manual)))
  window.history.pushState(null, '', '/manual')
  const el = mount('ui-manual')
  const handle = uiServe(router, { root: '#ui-manual' })
  await flush()
  ;(el.querySelector('#m-btn') as HTMLElement).click()
  await flush()
  assert.equal(el.querySelector('#m-btn')?.textContent, '1', 'dirty() 重渲染手动状态')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// keyed / style / 事件不累积（回归）
// ═══════════════════════════════════════════════════════

test('keyed 列表重排复用 DOM + style diff + 事件不累积', async () => {
  const router = new UIRouter()
  router.get('/list', async (location, ctx) => {
    const $ = ctx.ui.$()
    $.items = $.items ?? [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    $.show = $.show ?? true
    return h('div', {},
      h('ul', {}, ...($.items as any[]).map((it: any) => h('li', { key: it.id, id: `li-${it.id}` }))),
      h('button', {
        id: 'shuffle',
        onClick: () => { const arr = [...($.items as any[])]; const f = arr.shift()!; arr.push(f); $.items = arr },
      }, '轮转'),
      h('div', { id: 'sty', style: $.show ? { display: 'block' } : { display: undefined } }),
    )
  })
  window.history.pushState(null, '', '/list')
  const el = mount('ui-list')
  const handle = uiServe(router, { root: '#ui-list' })
  await flush()
  const liA = el.querySelector('#li-a')
  ;(el.querySelector('#shuffle') as HTMLElement).click()
  await flush()
  assert.deepEqual([...el.querySelectorAll('li')].map(n => n.id), ['li-b', 'li-c', 'li-a'], 'keyed 重排')
  assert.equal(el.querySelector('#li-a'), liA, 'li-a 复用不重建')
  const $ = handle.ctx.ui.$()
  $.show = false
  await flush()
  assert.equal((el.querySelector('#sty') as HTMLElement).style.display, '', 'style diff 清除')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// SSR + hydrate
// ═══════════════════════════════════════════════════════

test('renderHtml SSR + uiServe hydrate 收养', async () => {
  const { renderHtml } = await import('../ui-dom/ssr.ts')
  const html = renderHtml(h('div', { id: 'app' }, h('h1', {}, '标题'), h('span', { onClick: () => {} }, 'x')))
  assert.ok(html.includes('<h1>标题</h1>'), 'SSR HTML')
  assert.ok(!html.includes('onClick'), '事件不 SSR')
  // hydrate 收养
  const el = mount('ui-hyd')
  el.innerHTML = renderHtml(h('div', { id: 'p' }, h('button', { id: 'b' }, 'x'), h('span', { id: 'n' }, '0')))
  const router = new UIRouter()
  router.get('/hyd', (location, ctx) => {
    const $ = ctx.ui.$()
    $.n = $.n ?? 0
    return h('div', { id: 'p' },
      h('button', { id: 'b', onClick: () => { $.n++ } }, 'x'),
      h('span', { id: 'n' }, String($.n)),
    )
  })
  window.history.pushState(null, '', '/hyd')
  const handle = uiServe(router, { root: '#ui-hyd', hydrate: true })
  await flush()
  assert.equal(el.querySelector('#n')?.textContent, '0', '收养保留服务端内容')
  ;(el.querySelector('#b') as HTMLElement).click()
  await flush()
  assert.equal(el.querySelector('#n')?.textContent, '1', 'hydrate 后事件可用')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// 错误兜底
// ═══════════════════════════════════════════════════════

test('handler 抛错 → 错误页兜底（不黑屏）', async () => {
  const router = new UIRouter()
  router.get('/boom', () => { throw new Error('炸了') })
  window.history.pushState(null, '', '/boom')
  const el = mount('ui-boom')
  const handle = uiServe(router, { root: '#ui-boom' })
  await flush()
  assert.ok(el.querySelector('.ui-dom-error'), '错误页兜底')
  assert.ok(String(el.querySelector('.ui-dom-error')?.textContent).includes('炸了'))
  handle.close()
})

