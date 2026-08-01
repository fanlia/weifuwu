/**
 * weifuwu/client router 测试（VDOM 版）
 *
 * 嵌套 layout + RouteView 深度推导。
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

// ── jsdom ────────────────────────────────────────────────

before(() => {
  if (typeof globalThis.document !== 'undefined') return
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
  })
  const win = dom.window as any
  for (const key of Object.getOwnPropertyNames(win)) {
    if (key === 'window' || key === 'self' || key === 'document') continue
    try {
      const desc = Object.getOwnPropertyDescriptor(win, key)
      if (desc && !desc.get && !desc.set) {
        ;(globalThis as any)[key] = win[key]
      }
    } catch {}
  }
  ;(globalThis as any).window = win
  ;(globalThis as any).self = win
  ;(globalThis as any).document = win.document
  ;(globalThis as any).Node = win.Node
  ;(globalThis as any).Element = win.Element
  ;(globalThis as any).MutationObserver = win.MutationObserver
  ;(globalThis as any).location = win.location

  // 添加 #root 容器
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
})

const { createApp } = await import('../client/app.ts')
const { router, RouteView } = await import('../client/router.ts')
const { jsx } = await import('../client/vnode.ts')
import type { Component } from '../client/vnode.ts'

// ── 测试组件（返回 VNode）────────────────────────────────

const LoginPage: Component = () => () => jsx('div', { class: 'login-page', children: 'login' })
const HomePage: Component = () => () => jsx('div', { class: 'home-page', children: 'home' })
const AboutPage: Component = () => () => jsx('div', { class: 'about-page', children: 'about' })
const NotFoundPage: Component = () => () => jsx('div', { class: 'not-found-page', children: 'not found' })

/** 嵌套 layout — 内含一个 RouteView 出口 */
const TestLayout: Component = (_props, ctx) =>
  () => jsx('div', { class: 'test-layout', children: jsx(RouteView, {}) })

// ── 测试 ─────────────────────────────────────────────────

function resetRoot() {
  const root = document.getElementById('root')
  if (root) root.innerHTML = ''
}

describe('client router — 嵌套 layout', () => {
  it('从无 layout 路由导航到有 layout 路由，layout 只渲染一次', async () => {
    resetRoot()
    window.history.pushState({}, '', '/login')
    const app = createApp()
    app.use(router({
      mode: 'history',
      routes: [
        { path: '/login', component: LoginPage },
        {
          path: '/',
          layout: TestLayout,
          children: [
            { path: '', component: HomePage },
            { path: 'about', component: AboutPage },
          ],
        },
      ],
    }))

    await app.mount('#root', () => () => jsx(RouteView, {}) as any)

    // 初始：/login（无 layout）
    assert.equal(document.querySelectorAll('.login-page').length, 1)
    assert.equal(document.querySelectorAll('.test-layout').length, 0)

    // 导航到 /（有 layout）— layout 只渲染一次
    app.ctx.app.navigate('/')
    assert.equal(document.querySelectorAll('.test-layout').length, 1,
      'layout 应只渲染一次')
    assert.equal(document.querySelectorAll('.home-page').length, 1,
      '子页面应渲染在嵌套出口中')
    assert.equal(document.querySelectorAll('.login-page').length, 0)
  })

  it('同级子路由切换时 layout 保持', async () => {
    resetRoot()
    const app = createApp()
    app.use(router({
      mode: 'history',
      routes: [
        {
          path: '/',
          layout: TestLayout,
          children: [
            { path: '', component: HomePage },
            { path: 'about', component: AboutPage },
          ],
        },
      ],
    }))

    window.history.pushState({}, '', '/')
    await app.mount('#root', () => () => jsx(RouteView, {}) as any)

    assert.equal(document.querySelectorAll('.home-page').length, 1)

    app.ctx.app.navigate('/about')
    assert.equal(document.querySelectorAll('.about-page').length, 1)
    assert.equal(document.querySelectorAll('.home-page').length, 0)
    assert.equal(document.querySelectorAll('.test-layout').length, 1)
  })

  it('从 layout 路由导航回无 layout 路由，layout 被移除', async () => {
    resetRoot()
    const app = createApp()
    app.use(router({
      mode: 'history',
      routes: [
        { path: '/login', component: LoginPage },
        {
          path: '/',
          layout: TestLayout,
          children: [{ path: '', component: HomePage }],
        },
      ],
    }))

    window.history.pushState({}, '', '/')
    await app.mount('#root', () => () => jsx(RouteView, {}) as any)
    assert.equal(document.querySelectorAll('.test-layout').length, 1)

    app.ctx.app.navigate('/login')
    // effect 同步执行，navigate 返回时 DOM 已更新
    assert.equal(document.querySelectorAll('.test-layout').length, 0)
    assert.equal(document.querySelectorAll('.login-page').length, 1)
  })

  it('未匹配路由渲染 notFound 组件（navigate + 直载）', async () => {
    resetRoot()
    window.history.pushState({}, '', '/')
    const app = createApp()
    app.use(router({
      mode: 'history',
      notFound: NotFoundPage,
      routes: [
        { path: '/', component: HomePage },
        { path: '/about', component: AboutPage },
      ],
    }))

    await app.mount('#root', () => () => jsx(RouteView, {}) as any)
    assert.equal(document.querySelectorAll('.home-page').length, 1)

    // 客户端 navigate 到未匹配路径 → notFound
    app.ctx.app.navigate('/no/such/route')
    assert.equal(document.querySelectorAll('.not-found-page').length, 1,
      '未匹配路径应渲染 notFound 组件')
    assert.equal(document.querySelectorAll('.home-page').length, 0)

    // 从 404 导航回已知路由 → 正常渲染
    app.ctx.app.navigate('/about')
    assert.equal(document.querySelectorAll('.about-page').length, 1)
    assert.equal(document.querySelectorAll('.not-found-page').length, 0)

    // 未配置 notFound 时：未匹配路径渲染空白（不崩溃）
    const app2 = createApp()
    app2.use(router({
      mode: 'history',
      routes: [{ path: '/', component: HomePage }],
    }))
    resetRoot()
    window.history.pushState({}, '', '/')
    await app2.mount('#root', () => () => jsx(RouteView, {}) as any)
    app2.ctx.app.navigate('/missing')
    assert.equal(document.querySelectorAll('.home-page').length, 0)
    assert.equal(document.querySelectorAll('.not-found-page').length, 0)
  })
})
