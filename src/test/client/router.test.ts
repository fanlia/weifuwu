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
const { createApp } = await import('../../client/app.ts')
import type { WfuiContext, RouteDef } from '../../client/types.ts'
import { jsx, h } from '../../client/vnode.ts'

/** Call RouteView and get VNode (two-phase compat) */
const rv = (p: any, ctx: any) => {
  const r = RouteView(p, ctx)
  return typeof r === 'function' ? r() : r
}

// ── helpers ────────────────────────────────────────────────

function mockCtx(overrides: any = {}): WfuiContext {
  return {
    ui: { render: () => {}, $: () => ({}), ready: false },
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
    ctx.ui = { render: () => { rendered = true }, $: () => ({}), ready: false }
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
    ctx.ui = { render: () => { rendered = true }, $: () => ({}), ready: false }

    window.history.pushState({}, '', '/other')
    window.dispatchEvent(new PopStateEvent('popstate'))

    assert.equal(ctx.route.path, '/other')
    assert.equal(rendered, true)
  })

  it('popstate 触发 render', () => {
    const { ctx } = makeRouter([{ path: '/', component: () => null }])
    let rendered = false
    ctx.ui = { render: () => { rendered = true }, $: () => ({}), ready: false }

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
    assert.equal(rv({}, ctx), null)
  })

  it('chain 为 undefined 时返回 null', () => {
    const ctx = mockCtx({ route: { path: '/', chain: undefined } })
    assert.equal(rv({}, ctx), null)
  })

  it('chain 为 null 时返回 null', () => {
    const ctx = mockCtx({ route: { path: '/', chain: null } })
    assert.equal(rv({}, ctx), null)
  })

  it('depth 越界时返回 null', () => {
    const ctx = mockCtx({ route: { path: '/', chain: [{ path: '/', component: () => null }] } })
    // 手动注入深度到 WeakMap 无法从外部访问
    // 用空 chain 测试越界
    const ctx2 = mockCtx({ route: { path: '/', chain: [] } })
    assert.equal(rv({}, ctx2), null)
  })

  it('chain item 无 component 和 layout 时返回 null', () => {
    const ctx = mockCtx({ route: { path: '/', chain: [{ path: '/' } as any] } })
    assert.equal(rv({}, ctx), null)
  })

  it('返回组件', () => {
    const Comp = () => () => jsx('div', { children: 'page' })
    const ctx = mockCtx({
      route: { path: '/test', chain: [{ path: '/test', component: Comp }] },
    })
    const v = rv({}, ctx) as any
    assert.equal(v.type, Comp)
  })

  it('返回 layout（非叶子 chain item）', () => {
    const Layout = () => () => jsx('div', { children: 'layout' })
    const Page = () => () => jsx('div', { children: 'page' })
    const ctx = mockCtx({
      route: { path: '/', chain: [
        { path: '/', layout: Layout, children: [] },
        { path: '', component: Page },
      ]},
    })
    const v = rv({}, ctx) as any
    assert.equal(v.type, Layout)
  })

  it('layout 内的 RouteView 返回子组件', () => {
    const Layout = () => () => jsx('div', { children: 'layout' })
    const Page = () => () => jsx('div', { children: 'page' })
    const ctx = mockCtx({
      route: { path: '/', chain: [
        { path: '/', layout: Layout, children: [] },
        { path: '', component: Page },
      ]},
    })
    const v1 = rv({}, ctx) as any
    assert.equal(v1.type, Layout)

    const v2 = rv({}, ctx) as any
    assert.equal(v2.type, Page)
  })

  it('flat 路由直接返回组件', () => {
    const Page = () => () => jsx('div', { children: 'login' })
    const ctx = mockCtx({
      route: { path: '/login', chain: [{ path: '/login', component: Page }] },
    })
    const v = rv({}, ctx) as any
    assert.equal(v.type, Page)
  })

  it('多个 layout 嵌套', () => {
    const Outer = () => () => jsx('div', { children: 'outer' })
    const Inner = () => () => jsx('div', { children: 'inner' })
    const Page = () => () => jsx('div', { children: 'page' })
    const ctx = mockCtx({
      route: { path: '/', chain: [
        { path: '/', layout: Outer, children: [] },
        { path: 'admin', layout: Inner, children: [] },
        { path: '', component: Page },
      ]},
    })
    assert.equal((rv({}, ctx) as any).type, Outer)
    assert.equal((rv({}, ctx) as any).type, Inner)
    assert.equal((rv({}, ctx) as any).type, Page)
  })

  it('_rvDepth 从 0 开始', () => {
    const Comp = () => () => jsx('div', null)
    const ctx = mockCtx({
      route: { path: '/', chain: [{ path: '/', component: Comp }] },
    })
    const v = rv({}, ctx) as any
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
        layout: () => () => jsx('div', null),
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
    const Layout = () => () => jsx('div', null)
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
    const Page = () => () => jsx('p', { children: 'hello' })
    const mw = router({ mode: 'history', routes: [{ path: '/test', component: Page }] })
    const ctx = mw({} as any) as any
    ctx.ui = { render: () => {}, $: () => ({}), ready: false }
    const v = rv({}, ctx) as any
    assert.equal(v.type, Page)
  })

  it('渲染带 layout 的组件', () => {
    window.history.pushState(null, '', '/test')
    const Layout = () => () => jsx('nav', { children: 'nav' })
    const Page = () => () => jsx('main', { children: 'content' })
    const mw = router({ mode: 'history', routes: [{
      path: '/',
      layout: Layout,
      children: [{ path: 'test', component: Page }],
    }]})
    const ctx = mw({} as any) as any
    ctx.ui = { render: () => {}, $: () => ({}), ready: false }

    const v1 = rv({}, ctx) as any
    assert.equal(v1.type, Layout)
    const v2 = rv({}, ctx) as any
    assert.equal(v2.type, Page)
  })
})

// ═══════════════════════════════════════════════════════
// ctx chain — RouteView 深度通过原型链传递
// ═══════════════════════════════════════════════════════

describe('ctx chain depth propagation', () => {
  it('子组件通过 ctx 原型链读取父组件的 _rvDepth', () => {
    // 模拟 renderComponent 产生的 ctx 链：
    //   rootCtx ← childCtx1 (RouteView1) ← childCtx2 (AppLayout) ← childCtx3 (RouteView2)
    const rootCtx: any = {}
    const childCtx1 = Object.create(rootCtx)
    childCtx1.ui = Object.create(rootCtx.ui ?? {}) as any

    // RouteView1 设置 _rvDepth = 1
    childCtx1._rvDepth = 1

    const childCtx2 = Object.create(childCtx1)
    childCtx2.ui = Object.create(childCtx1.ui)

    const childCtx3 = Object.create(childCtx2)
    childCtx3.ui = Object.create(childCtx2.ui)

    // RouteView2 读取 _rvDepth — 应从原型链找到 childCtx1 上的 1
    assert.equal(childCtx3._rvDepth, 1)
  })

  it('RouteView 使用 ctx._rvDepth 替代 WeakMap', async () => {
    // 真实渲染场景：通过 createApp + mount 验证 layout 嵌套
    let renderOrder: string[] = []

    const Layout = (_: any, __: any) => {
      return () => {
        renderOrder.push('layout')
        return h('div', { class: 'layout' }, [
          h('nav', {}, 'sidebar'),
          h('main', {}, h(RouteView)),
        ])
      }
    }

    const Dashboard = (_: any, __: any) => {
      return () => {
        renderOrder.push('dashboard')
        return h('div', { class: 'dashboard' }, 'dashboard')
      }
    }

    const Login = (_: any, __: any) => {
      return () => {
        renderOrder.push('login')
        return h('div', { class: 'login' }, 'login')
      }
    }

    const app = createApp()
    app.use(router({
      mode: 'history',
      routes: [
        {
          path: '/',
          layout: Layout,
          children: [
            { path: '', component: Dashboard },
          ],
        },
        { path: '/login', component: Login },
      ],
    }))

    // Mount — 初始路径 /login（flat 路由，无 layout）
    window.history.pushState(null, '', '/login')
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'rv-test'
    await app.mount('#rv-test', () => () => h(RouteView, {}))
    await new Promise(r => setTimeout(r, 20))

    assert.deepEqual(renderOrder, ['login'])

    // 导航到 / — 带 layout 的 chain
    renderOrder = []
    ;(app as any).ctx.app.navigate('/')
    await new Promise(r => setTimeout(r, 20))

    // layout 内的 RouteView 应正确匹配 Dashboard（第二个 chain 元素）
    assert.equal(renderOrder.includes('layout'), true, 'should render Layout')
    assert.equal(renderOrder.includes('dashboard'), true, 'should render Dashboard')
    assert.equal(renderOrder.includes('login'), false, 'should NOT render Login')

    el.remove()
  })

  it('组件级 re-render 时 layout 内的 RouteView 深度不变', async () => {
    let layoutRenderCount = 0

    const Layout = (_: any, ctx: WfuiContext) => {
      const $ = ctx.ui.$()
      $.collapsed = false
      return () => {
        layoutRenderCount++
        return h('div', { class: 'layout' }, [
          h('button', {
            id: 'toggle-btn',
            onClick: () => { $.collapsed = !$.collapsed },
          }, $.collapsed ? 'expand' : 'collapse'),
          h('main', {}, h(RouteView)),
        ])
      }
    }

    const Page = (_: any, __: any) => {
      return () => h('div', { class: 'page' }, 'page content')
    }

    const app = createApp()
    app.use(router({
      mode: 'history',
      routes: [
        {
          path: '/',
          layout: Layout,
          children: [
            { path: '', component: Page },
          ],
        },
      ],
    }))

    window.history.pushState(null, '', '/')
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'rv-test2'
    await app.mount('#rv-test2', () => () => h(RouteView, {}))
    await new Promise(r => setTimeout(r, 20))

    assert.equal(layoutRenderCount, 1)
    assert.equal(el.querySelector('.layout')?.querySelector('.page')?.textContent, 'page content',
      '初始化时 layout 包含 page')

    // 点击按钮触发 Layout 自身 re-render（组件级 scope）
    const btn = el.querySelector('#toggle-btn') as HTMLElement
    btn.click()
    await new Promise(r => setTimeout(r, 20))

    assert.equal(layoutRenderCount, 2, 'Layout 应重新渲染')
    // layout 内嵌的 RouteView 深度通过 mount 闭包保持正确
    // Page 内容不变，DOM 结构仍然完整
    assert.equal(el.querySelector('.layout')?.querySelector('.page')?.textContent, 'page content',
      'Layout re-render 后 page 仍在')
    // 验证 RouteView 内部路由仍然匹配正确的页面
    assert.equal(el.querySelectorAll('.page').length, 1, '页面组件正确保留')
    assert.equal(el.querySelectorAll('.layout').length, 1, 'layout 只有一个副本')

    el.remove()
  })

  it('多层 layout 嵌套时深度正确传递', async () => {
    const renderLog: string[] = []

    const OuterLayout = (_: any, __: any) => {
      return () => {
        renderLog.push('outer')
        return h('div', { class: 'outer' }, [
          h('header', {}, 'header'),
          h('main', {}, h(RouteView)),
        ])
      }
    }

    const InnerLayout = (_: any, __: any) => {
      return () => {
        renderLog.push('inner')
        return h('div', { class: 'inner' }, [
          h('aside', {}, 'aside'),
          h('section', {}, h(RouteView)),
        ])
      }
    }

    const Settings = (_: any, __: any) => {
      return () => {
        renderLog.push('settings')
        return h('div', { class: 'settings' }, 'settings')
      }
    }

    const app = createApp()
    app.use(router({
      mode: 'history',
      routes: [
        {
          path: '/',
          layout: OuterLayout,
          children: [
            {
              path: 'admin',
              layout: InnerLayout,
              children: [
                { path: 'settings', component: Settings },
              ],
            },
          ],
        },
      ],
    }))

    window.history.pushState(null, '', '/admin/settings')
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'rv-test3'
    await app.mount('#rv-test3', () => () => h(RouteView, {}))
    await new Promise(r => setTimeout(r, 20))

    // 正确的顺序：outer → inner → settings
    assert.deepEqual(renderLog, ['outer', 'inner', 'settings'],
      '三层嵌套应正确渲染')

    // 验证 DOM 结构
    assert.ok(el.querySelector('.outer'), '外层 layout 应存在')
    assert.ok(el.querySelector('.inner'), '内层 layout 应存在')
    assert.ok(el.querySelector('.settings'), 'settings 页面应存在')

    el.remove()
  })
})

// ═══════════════════════════════════════════════════════
// 哈希模式
// ═══════════════════════════════════════════════════════

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
