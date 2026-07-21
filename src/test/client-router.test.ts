/**
 * weifuwu/client router 测试
 *
 * 嵌套 layout 路由 + RouteView 深度推导。
 * 回归：从无 layout 路由导航到有 layout 路由时，layout 不得重复渲染。
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

// ── 浏览器全局环境 ─────────────────────────────────────────

before(() => {
  if (typeof document !== 'undefined') return

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/login',
    pretendToBeVisual: true,
  })

  const win = dom.window as any
  const g = globalThis as any
  for (const key of Object.getOwnPropertyNames(win)) {
    if (key === 'Object' || key === 'Array' || key === 'Function' ||
        key === 'String' || key === 'Number' || key === 'Boolean' ||
        key === 'Symbol' || key === 'Map' || key === 'Set' ||
        key === 'RegExp' || key === 'Promise' || key === 'Error' ||
        key === 'Date' || key === 'Math' || key === 'JSON' ||
        key === 'parseInt' || key === 'parseFloat' ||
        key === 'isNaN' || key === 'isFinite' ||
        key === 'undefined' || key === 'NaN' || key === 'Infinity') continue
    if (typeof g[key] === 'undefined') {
      try { g[key] = win[key] } catch { /* read-only, skip */ }
    }
  }
})

const { createApp } = await import('../client/app.ts')
const { router, RouteView } = await import('../client/router.ts')
const { jsx } = await import('../client/jsx-runtime.ts')

// ── 测试组件 ───────────────────────────────────────────────

function LoginPage() {
  const el = document.createElement('div')
  el.className = 'login-page'
  el.textContent = 'login'
  return el
}

function HomePage() {
  const el = document.createElement('div')
  el.className = 'home-page'
  el.textContent = 'home'
  return el
}

function AboutPage() {
  const el = document.createElement('div')
  el.className = 'about-page'
  el.textContent = 'about'
  return el
}

/** 嵌套 layout — 内含一个 RouteView 出口 */
function TestLayout(_props: {}, _ctx: any) {
  const el = document.createElement('div')
  el.className = 'test-layout'
  const outlet = jsx(RouteView as any, {})
  el.appendChild(outlet)
  return el
}

// ═════════════════════════════════════════════════════════════

describe('client router — 嵌套 layout', () => {
  it('从无 layout 路由导航到有 layout 路由，layout 只渲染一次（回归）', async () => {
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

    await app.mount('#root', () => jsx(RouteView as any, {}) as any)

    // 初始：/login（无 layout）
    assert.equal(document.querySelectorAll('.login-page').length, 1)
    assert.equal(document.querySelectorAll('.test-layout').length, 0)

    // 导航到 /（有 layout）— 此前 bug：layout 会被渲染两次
    app.ctx.app.navigate('/')
    assert.equal(document.querySelectorAll('.test-layout').length, 1,
      'layout 应只渲染一次')
    assert.equal(document.querySelectorAll('.home-page').length, 1,
      '子页面应渲染在嵌套出口中')
    assert.equal(document.querySelectorAll('.login-page').length, 0)

    // layout 内的嵌套 RouteView 应渲染子页面，而非再次渲染 layout
    const layoutEl = document.querySelector('.test-layout')!
    assert.equal(layoutEl.querySelectorAll('.test-layout').length, 0,
      'layout 不得嵌套自身')
  })

  it('同级子路由切换时 layout 保持持久（不重复挂载）', async () => {
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
    await app.mount('#root', () => jsx(RouteView as any, {}) as any)

    const layoutBefore = document.querySelector('.test-layout')
    assert.ok(layoutBefore)

    app.ctx.app.navigate('/about')
    assert.equal(document.querySelectorAll('.test-layout').length, 1)
    assert.equal(document.querySelectorAll('.about-page').length, 1)
    assert.equal(document.querySelectorAll('.home-page').length, 0)
    // layout 实例未变（持久化）
    assert.equal(document.querySelector('.test-layout'), layoutBefore)
  })

  it('从 layout 路由导航回无 layout 路由，layout 被移除', async () => {
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
    await app.mount('#root', () => jsx(RouteView as any, {}) as any)
    assert.equal(document.querySelectorAll('.test-layout').length, 1)

    app.ctx.app.navigate('/login')
    assert.equal(document.querySelectorAll('.test-layout').length, 0)
    assert.equal(document.querySelectorAll('.login-page').length, 1)
  })
})
