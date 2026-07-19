/**
 * weifuwu/client 应用测试 — createApp / 中间件链 / mount / hydrate
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

// ── 浏览器全局环境设置 ───────────────────────────────────────

before(() => {
  if (typeof document !== 'undefined') return

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost',
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

// ── 导入被测模块 ────────────────────────────────────────────

const { createApp } = await import('../../client/app.ts')
const { jsx, setCtx, getCtx } = await import('../../client/jsx-runtime.ts')
import type { WfuiContext, AppMiddleware } from '../../client/types.ts'

// ═════════════════════════════════════════════════════════════
// createApp
// ═════════════════════════════════════════════════════════════

describe('createApp', () => {
  it('创建 app 实例', () => {
    const app = createApp()
    assert.ok(app.ctx)
    assert.equal(typeof app.use, 'function')
    assert.equal(typeof app.mount, 'function')
    assert.equal(typeof app.hydrate, 'function')
  })

  it('初始 ctx 有默认值', () => {
    const app = createApp()
    assert.equal(app.ctx.route.path, '/')
    assert.ok(typeof app.ctx.app.navigate, 'function')
  })

  it('use 返回自身，支持链式调用', () => {
    const app = createApp()
    const mw: AppMiddleware = (ctx) => ctx
    const result = app.use(mw)
    assert.equal(result, app)
  })

  it('中间件链按顺序执行', async () => {
    const app = createApp()
    const order: number[] = []

    app.use((ctx) => { order.push(1); return ctx })
    app.use((ctx) => { order.push(2); return ctx })
    app.use((ctx) => { order.push(3); return ctx })

    // mount 触发中间件链执行
    const Comp = (_props: {}, _ctx: WfuiContext) => jsx('div', {}, 'hello')
    await app.mount('#root', Comp)

    assert.deepEqual(order, [1, 2, 3])
  })

  it('中间件可以注入字段到 ctx', async () => {
    const app = createApp()

    app.use((ctx) => {
      (ctx as any).customField = 'injected'
      return ctx
    })

    const Comp = (_props: {}, ctx: WfuiContext) => {
      // 组件中 ctx 应包含 customField
      assert.equal((ctx as any).customField, 'injected')
      return jsx('div', {}, 'test')
    }

    await app.mount('#root', Comp)
  })

  it('异步中间件正常工作', async () => {
    const app = createApp()

    app.use(async (ctx) => {
      await new Promise(r => setTimeout(r, 5))
      ;(ctx as any).asyncData = 'loaded'
      return ctx
    })

    const Comp = (_props: {}, ctx: WfuiContext) => {
      assert.equal((ctx as any).asyncData, 'loaded')
      return jsx('div', {}, 'async')
    }

    await app.mount('#root', Comp)
  })

  it('mount 将组件渲染到指定容器', async () => {
    const root = document.getElementById('root')!
    root.innerHTML = ''

    const Comp = (_props: {}, _ctx: WfuiContext) => jsx('div', { class: 'mounted' }, 'ok')
    const app = createApp()
    await app.mount('#root', Comp)

    assert.equal(root.children.length, 1)
    assert.equal(root.firstElementChild?.className, 'mounted')
    assert.equal(root.textContent, 'ok')

    root.innerHTML = ''
  })
})

// ═════════════════════════════════════════════════════════════
// hydrate
// ═════════════════════════════════════════════════════════════

describe('hydrate', () => {
  it('在现有 DOM 上附加组件', () => {
    const root = document.getElementById('root')!
    root.innerHTML = '<div class="ssr-content">Server rendered</div>'

    const Comp = (_props: {}, _ctx: WfuiContext) => jsx('div', { class: 'hydrated' }, 'client')
    const app = createApp()
    app.hydrate('#root', Comp)

    // 原有内容保留
    assert.ok(root.innerHTML.includes('Server rendered'))
    // 新增内容追加
    assert.ok(root.innerHTML.includes('hydrated'))
    assert.ok(root.innerHTML.includes('client'))

    root.innerHTML = ''
  })

  it('目标不存在时给出警告', () => {
    const app = createApp()
    // 不应抛出异常
    app.hydrate('#nonexistent', (_props: {}, _ctx: WfuiContext) => jsx('div', {}))
  })
})
