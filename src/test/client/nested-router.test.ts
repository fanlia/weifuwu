/**
 * 嵌套布局路由测试 — RouteView 在子路由切换时的行为
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

before(() => {
  if (typeof document !== 'undefined') return
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
  })
  const win = dom.window as any
  const g = globalThis as any
  for (const key of Object.getOwnPropertyNames(win)) {
    if (['Object','Array','Function','String','Number','Boolean','Symbol','Map','Set','RegExp','Promise','Error','Date','Math','JSON','parseInt','parseFloat','isNaN','isFinite','undefined','NaN','Infinity'].includes(key)) continue
    if (typeof g[key] === 'undefined') {
      try { g[key] = win[key] } catch {}
    }
  }
})

const { router, RouteView } = await import('../../client/router.ts')
const { jsx, setCtx } = await import('../../client/jsx-runtime.ts')
import type { WfuiContext, RouteDef } from '../../client/types.ts'

function createMockCtx(overrides: Partial<WfuiContext> = {}): WfuiContext {
  const ctx: WfuiContext = {
    route: {
      path: '/',
      params: {},
      query: {},
      hash: '',
      component: null,
      data: {},
      loading: false,
    },
    app: {
      navigate: (path: string) => {
        ctx.route.path = path
        const Ctor = (window as any).CustomEvent || CustomEvent
        window.dispatchEvent(new Ctor('wefu:route', { detail: { path } }))
      },
    },
    provide: () => {},
    inject: () => null,
    ws: null as any,
    ...overrides,
  }
  return ctx
}

function Layout(_props: {}, _ctx: WfuiContext) {
  return jsx('div', { class: 'layout' }, jsx('div', { class: 'outlet' }, RouteView({}, _ctx)))
}
function PageA(_props: {}, _ctx: WfuiContext) {
  return jsx('div', { class: 'page-a' }, 'PageA')
}
function PageB(_props: {}, _ctx: WfuiContext) {
  return jsx('div', { class: 'page-b' }, 'PageB')
}
function HomePage(_props: {}, _ctx: WfuiContext) {
  return jsx('div', { class: 'home' }, 'Home')
}

const routes: RouteDef[] = [
  { path: '/', component: HomePage },
  {
    path: '/dashboard',
    layout: Layout,
    children: [
      { path: '/a', component: PageA },
      { path: '/b', component: PageB },
    ],
  },
]

describe('嵌套布局 RouteView', () => {
  it('初始渲染嵌套路由', () => {
    const ctx = createMockCtx()
    router({ routes, mode: 'history' })(ctx)

    // 导航到 /dashboard/a
    ctx.app.navigate('/dashboard/a')

    const el = RouteView({}, ctx)
    // RouteView 应渲染 Layout，Layout 内 RouteView 渲染 PageA
    assert.ok(el instanceof HTMLDivElement)
    const layout = el.querySelector('.layout')
    assert.ok(layout, 'layout 应被渲染')
    const pageA = el.querySelector('.page-a')
    assert.ok(pageA, 'PageA 应被渲染')
    assert.equal(pageA?.textContent, 'PageA')
  })

  it('切换子路由时 layout 保持，子组件替换', () => {
    const ctx = createMockCtx()
    router({ routes, mode: 'history' })(ctx)

    ctx.app.navigate('/dashboard/a')
    const el = RouteView({}, ctx)

    // 切换子路由
    ctx.app.navigate('/dashboard/b')

    // layout 应保持在 el 中
    const layout = el.querySelector('.layout')
    assert.ok(layout, 'layout 应保持')
    // PageB 应替换 PageA
    const pageB = el.querySelector('.page-b')
    assert.ok(pageB, 'PageB 应被渲染')
    assert.equal(pageB?.textContent, 'PageB')
    // PageA 应消失
    const pageA = el.querySelector('.page-a')
    assert.equal(pageA, null, 'PageA 应被替换')
  })
})
