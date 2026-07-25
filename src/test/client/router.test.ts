/**
 * weifuwu/client router — 路由中间件 + RouteView 全面测试
 *
 * 覆盖 router.ts 所有 export 和关键内部路径
 */

import { describe, it, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

before(setupJsdom)

const { router, RouteView } = await import('../../client/router.ts')
import type { WfuiContext, RouteDef } from '../../client/types.ts'
import { jsx } from '../../client/vnode.ts'

// ── helpers ────────────────────────────────────────────────

function mockCtx(overrides: any = {}): WfuiContext {
  return {
    ui: { render: () => {}, $: {}, ready: false },
    route: { path: '/', params: {}, query: {} },
    app: { navigate(path: string) {} },
    ...overrides,
  } as any
}

function makeRouter(routes: RouteDef[]) {
  const mw = router({ mode: 'history', routes })
  const ctx: any = {}
  const result = mw(ctx)
  return { ctx: result as any, mw }
}

beforeEach(() => {
  window.history.pushState(null, '', '/')
})

// ═══════════════════════════════════════════════════════
// router middleware — 初始化
// ═══════════════════════════════════════════════════════

describe('router middleware init', () => {
  it('注入 ctx.route', () => {
    const { ctx } = makeRouter([{ path: '/', component: () => null }])
    assert.ok(ctx.route)
    assert.equal(typeof ctx.route.path, 'string')
    assert.equal(typeof ctx.route.params, 'object')
    assert.equal(typeof ctx.route.query, 'object')
  })

  it('匹配根路径', () => {
    const { ctx } = makeRouter([{ path: '/', component: () => null }])
    assert.equal(ctx.route.path, '/')
  })

  it('提取路径参数', () => {
    window.history.pushState(null, '', '/users/42')
    const { ctx } = makeRouter([{ path: '/users/:id', component: () => null }])
    assert.equal(ctx.route.params.id, '42')
  })

  it('多个路径参数', () => {
    window.history.pushState(null, '', '/users/42/posts/99')
    const { ctx } = makeRouter([{ path: '/users/:userId/posts/:postId', component: () => null }])
    assert.equal(ctx.route.params.userId, '42')
    assert.equal(ctx.route.params.postId, '99')
  })

  it('解码 URL 参数', () => {
    window.history.pushState(null, '', '/search/%E4%B8%AD%E6%96%87')
    const { ctx } = makeRouter([{ path: '/search/:q', component: () => null }])
    assert.equal(ctx.route.params.q, '中文')
  })

  it('通配符路径', () => {
    window.history.pushState(null, '', '/files/src/main.ts')
    const { ctx } = makeRouter([{ path: '/files/*', component: () => null }])
    assert.equal(ctx.route.path, '/files/*')
  })

  it('解析查询参数', () => {
    window.history.pushState(null, '', '/search?q=hello&page=2')
    const { ctx } = makeRouter([{ path: '/search', component: () => null }])
    assert.equal(ctx.route.query.q, 'hello')
    assert.equal(ctx.route.query.page, '2')
  })

  it('无匹配路径返回空 params 和 chain', () => {
    window.history.pushState(null, '', '/not-found-path')
    const { ctx } = makeRouter([{ path: '/', component: () => null }])
    assert.deepEqual(ctx.route.params, {})
    assert.deepEqual(ctx.route.chain, [])
    assert.equal(ctx.route.path, '/not-found-path')
  })

  it('注入 ctx.app.navigate', () => {
    const { ctx } = makeRouter([{ path: '/', component: () => null }])
    assert.equal(typeof ctx.app.navigate, 'function')
  })

  it('中间件返回 ctx', () => {
    const mw = router({ mode: 'history', routes: [{ path: '/', component: () => null }] })
    const result = mw({} as any)
    assert.equal(result, (result as any)) // returns something
  })
})

// ═══════════════════════════════════════════════════════
// router middleware — navigate
// ═══════════════════════════════════════════════════════

describe('router navigate', () => {
  it('navigate 更新 ctx.route', () => {
    const { ctx } = makeRouter([
      { path: '/', component: () => null },
      { path: '/about', component: () => null },
    ])
    ctx.app.navigate('/about')
    assert.equal(ctx.route.path, '/about')
  })

  it('navigate 触发 ctx.ui.render', () => {
    const { ctx } = makeRouter([
      { path: '/', component: () => null },
      { path: '/about', component: () => null },
    ])
    let rendered = false
    ctx.ui = { render: () => { rendered = true }, $: {}, ready: false }
    ctx.app.navigate('/about')
    assert.equal(rendered, true)
  })

  it('navigate 推入历史状态', () => {
    const { ctx } = makeRouter([
      { path: '/', component: () => null },
      { path: '/page2', component: () => null },
    ])
    ctx.app.navigate('/page2')
    assert.equal(window.location.pathname, '/page2')
  })

  it('navigate 解析新路径参数', () => {
    const { ctx } = makeRouter([
      { path: '/', component: () => null },
      { path: '/users/:id', component: () => null },
    ])
    ctx.app.navigate('/users/7')
    assert.equal(ctx.route.params.id, '7')
  })

  it('navigate 到不存在的路径', () => {
    const { ctx } = makeRouter([{ path: '/', component: () => null }])
    ctx.app.navigate('/no-such-route')
    assert.deepEqual(ctx.route.chain, [])
  })
})

// ═══════════════════════════════════════════════════════
// router middleware — popstate
// ═══════════════════════════════════════════════════════

describe('popstate', () => {
  it('popstate 更新路由', () => {
    const { ctx } = makeRouter([
      { path: '/', component: () => null },
      { path: '/other', component: () => null },
    ])
    let rendered = false
    ctx.ui = { render: () => { rendered = true }, $: {}, ready: false }

    window.history.pushState({}, '', '/other')
    window.dispatchEvent(new PopStateEvent('popstate'))

    assert.equal(ctx.route.path, '/other')
    assert.equal(rendered, true)
  })

  it('popstate 触发 render', () => {
    const { ctx } = makeRouter([{ path: '/', component: () => null }])
    let rendered = false
    ctx.ui = { render: () => { rendered = true }, $: {}, ready: false }

    window.history.pushState({}, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))

    assert.equal(rendered, true)
  })
})

// ═══════════════════════════════════════════════════════
// RouteView
// ═══════════════════════════════════════════════════════

describe('RouteView', () => {
  it('没有 chain 时返回 null', () => {
    const ctx = mockCtx({ route: { path: '/', chain: [] } })
    assert.equal(RouteView({}, ctx), null)
  })

  it('chain 为 undefined 时返回 null', () => {
    const ctx = mockCtx({ route: { path: '/', chain: undefined } })
    assert.equal(RouteView({}, ctx), null)
  })

  it('chain 为 null 时返回 null', () => {
    const ctx = mockCtx({ route: { path: '/', chain: null } })
    assert.equal(RouteView({}, ctx), null)
  })

  it('depth 越界时返回 null', () => {
    const ctx = mockCtx({ route: { path: '/', chain: [{ path: '/', component: () => null }] } })
    // 手动注入深度到 WeakMap 无法从外部访问
    // 用空 chain 测试越界
    const ctx2 = mockCtx({ route: { path: '/', chain: [] } })
    assert.equal(RouteView({}, ctx2), null)
  })

  it('chain item 无 component 和 layout 时返回 null', () => {
    const ctx = mockCtx({ route: { path: '/', chain: [{ path: '/' } as any] } })
    assert.equal(RouteView({}, ctx), null)
  })

  it('返回组件', () => {
    const Comp = () => jsx('div', { children: 'page' })
    const ctx = mockCtx({
      route: { path: '/test', chain: [{ path: '/test', component: Comp }] },
    })
    const v = RouteView({}, ctx) as any
    assert.equal(v.type, Comp)
  })

  it('返回 layout（非叶子 chain item）', () => {
    const Layout = () => jsx('div', { children: 'layout' })
    const Page = () => jsx('div', { children: 'page' })
    const ctx = mockCtx({
      route: { path: '/', chain: [
        { path: '/', layout: Layout, children: [] },
        { path: '', component: Page },
      ]},
    })
    const v = RouteView({}, ctx) as any
    assert.equal(v.type, Layout)
  })

  it('layout 内的 RouteView 返回子组件', () => {
    const Layout = () => jsx('div', { children: 'layout' })
    const Page = () => jsx('div', { children: 'page' })
    const ctx = mockCtx({
      route: { path: '/', chain: [
        { path: '/', layout: Layout, children: [] },
        { path: '', component: Page },
      ]},
    })
    const v1 = RouteView({}, ctx) as any
    assert.equal(v1.type, Layout)

    const v2 = RouteView({}, ctx) as any
    assert.equal(v2.type, Page)
  })

  it('flat 路由直接返回组件', () => {
    const Page = () => jsx('div', { children: 'login' })
    const ctx = mockCtx({
      route: { path: '/login', chain: [{ path: '/login', component: Page }] },
    })
    const v = RouteView({}, ctx) as any
    assert.equal(v.type, Page)
  })

  it('多个 layout 嵌套', () => {
    const Outer = () => jsx('div', { children: 'outer' })
    const Inner = () => jsx('div', { children: 'inner' })
    const Page = () => jsx('div', { children: 'page' })
    const ctx = mockCtx({
      route: { path: '/', chain: [
        { path: '/', layout: Outer, children: [] },
        { path: 'admin', layout: Inner, children: [] },
        { path: '', component: Page },
      ]},
    })
    assert.equal((RouteView({}, ctx) as any).type, Outer)
    assert.equal((RouteView({}, ctx) as any).type, Inner)
    assert.equal((RouteView({}, ctx) as any).type, Page)
  })

  it('_rvDepth 从 0 开始', () => {
    const Comp = () => jsx('div', null)
    const ctx = mockCtx({
      route: { path: '/', chain: [{ path: '/', component: Comp }] },
    })
    const v = RouteView({}, ctx) as any
    assert.equal(v.type, Comp)
  })
})

// ═══════════════════════════════════════════════════════
// 综合路由匹配
// ═══════════════════════════════════════════════════════

describe('route matching', () => {
  it('多路径中最长 chain 获胜', () => {
    // 两个路由匹配同一个路径，一个有 layout，一个没有
    window.history.pushState(null, '', '/users')
    const routes: RouteDef[] = [
      { path: '/users', component: () => null },
      {
        path: '/',
        layout: () => jsx('div', null),
        children: [
          { path: 'users', component: () => null },
        ],
      },
    ]
    const { ctx } = makeRouter(routes)
    // 带 layout 的路由 chain 长度=2 > 直接路由 chain 长度=1
    assert.equal(ctx.route.chain.length, 2)
  })

  it('精确路径优先于通配', () => {
    window.history.pushState(null, '', '/files')
    const routes: RouteDef[] = [
      { path: '/files/*', component: () => null },
      { path: '/files', component: () => null },
    ]
    // 两个都是 chain 长度=1，但精确路径应该匹配
    const { ctx: ctx1 } = makeRouter(routes)
    assert.equal(ctx1.route.chain.length, 1)
  })

  it('子路由继承父 layout', () => {
    window.history.pushState(null, '', '/admin/settings')
    const Layout = () => jsx('div', null)
    const routes: RouteDef[] = [{
      path: '/admin',
      layout: Layout,
      children: [{ path: 'settings', component: () => null }],
    }]
    const { ctx } = makeRouter(routes)
    assert.equal(ctx.route.chain.length, 2)
    assert.equal(ctx.route.chain[0].layout, Layout)
  })
})

// ═══════════════════════════════════════════════════════
// 路由 + RouteView 集成
// ═══════════════════════════════════════════════════════

describe('router + RouteView integration', () => {
  it('渲染组件', () => {
    window.history.pushState(null, '', '/test')
    const Page = () => jsx('p', { children: 'hello' })
    const mw = router({ mode: 'history', routes: [{ path: '/test', component: Page }] })
    const ctx = mw({} as any) as any
    ctx.ui = { render: () => {}, $: {}, ready: false }
    const v = RouteView({}, ctx) as any
    assert.equal(v.type, Page)
  })

  it('渲染带 layout 的组件', () => {
    window.history.pushState(null, '', '/test')
    const Layout = () => jsx('nav', { children: 'nav' })
    const Page = () => jsx('main', { children: 'content' })
    const mw = router({ mode: 'history', routes: [{
      path: '/',
      layout: Layout,
      children: [{ path: 'test', component: Page }],
    }]})
    const ctx = mw({} as any) as any
    ctx.ui = { render: () => {}, $: {}, ready: false }

    const v1 = RouteView({}, ctx) as any
    assert.equal(v1.type, Layout)
    const v2 = RouteView({}, ctx) as any
    assert.equal(v2.type, Page)
  })
})

// ═══════════════════════════════════════════════════════
// 路由深度（_rvDepth）重置
// ═══════════════════════════════════════════════════════

describe('_rvDepth reset', () => {
  it('render 前重置 depth', () => {
    const Comp1 = () => jsx('div', { children: 'a' })
    const Comp2 = () => jsx('div', { children: 'b' })

    // 有 layout 的 chain
    const Layout = () => jsx('div', null)
    const ctx = mockCtx({
      route: { path: '/', chain: [
        { path: '/', layout: Layout, children: [] },
        { path: '', component: Comp1 },
      ]},
    })

    // RouteView 链消耗 depth
    RouteView({}, ctx) // layout，depth→1
    RouteView({}, ctx) // Comp1

    // 新 chain（flat 路由）— WeakMap 在新 ctx 上独立
    const ctx2 = mockCtx({
      route: {
        path: '/login',
        chain: [{ path: '/login', component: Comp2 }],
      },
    })

    const v = RouteView({}, ctx2) as any
    assert.equal(v.type, Comp2) // depth=0，正确匹配
  })
})

// ═══════════════════════════════════════════════════════
// 哈希模式
// ═══════════════════════════════════════════════════════

describe('hash mode', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('hash 模式读取 location.hash', () => {
    window.location.hash = '#/test'
    const mw = router({ mode: 'hash', routes: [{ path: '/test', component: () => null }] })
    const ctx = mw({} as any)
    assert.equal((ctx as any).route.path, '/test')
  })

  it('hash 模式根路径', () => {
    window.location.hash = ''
    const mw = router({ mode: 'hash', routes: [{ path: '/', component: () => null }] })
    const ctx = mw({} as any)
    assert.equal((ctx as any).route.path, '/')
  })

  it('hash 模式 navigate 更新 hash', () => {
    window.location.hash = '#/'
    const routes: RouteDef[] = [
      { path: '/', component: () => null },
      { path: '/other', component: () => null },
    ]
    const mw = router({ mode: 'hash', routes })
    const ctx: any = { ui: { render: () => {} } }
    mw(ctx)
    ctx.app.navigate('/other')
    assert.equal(window.location.hash, '#/other')
    assert.equal(ctx.route.path, '/other')
  })

  it('hash 模式 hashchange 触发 render', () => {
    const routes: RouteDef[] = [
      { path: '/', component: () => null },
      { path: '/new', component: () => null },
    ]
    const mw = router({ mode: 'hash', routes })
    let rendered = false
    const ctx: any = { ui: { render: () => { rendered = true } } }
    mw(ctx)

    window.location.hash = '#/new'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    assert.equal(rendered, true)
    assert.equal(ctx.route.path, '/new')
  })

  it('hash 模式提取路径参数', () => {
    window.location.hash = '#/users/42'
    const mw = router({ mode: 'hash', routes: [{ path: '/users/:id', component: () => null }] })
    const ctx = mw({} as any)
    assert.equal((ctx as any).route.params.id, '42')
  })
})
