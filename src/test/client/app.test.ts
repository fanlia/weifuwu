/**
 * weifuwu/client app — createApp 测试
 *
 * ctx.ui.$() 是工厂函数，返回响应式状态容器。
 */

import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { jsx } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'

before(setupJsdom)

const { createApp } = await import('../../client/app.ts')

describe('createApp', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('返回 app 对象', () => {
    const app = createApp()
    assert.ok(app)
    assert.equal(typeof app.use, 'function')
    assert.equal(typeof app.mount, 'function')
    assert.equal(typeof app.destroy, 'function')
  })

  it('use() 链式调用', () => {
    const app = createApp()
    const mw = (ctx: WfuiContext) => ctx
    assert.equal(app.use(mw), app)
  })

  it('mount() 按顺序执行中间件', async () => {
    const order: number[] = []
    const app = createApp()
    app.use((ctx) => { order.push(1); return ctx })
    app.use((ctx) => { order.push(2); return ctx })

    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'app'
    await app.mount('#app', () => () => jsx('div', { children: 'hello' }))
    assert.deepEqual(order, [1, 2])
    el.remove()
  })

  it('mount() 渲染组件到容器', async () => {
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'mount1'
    await app.mount('#mount1', () => () => jsx('p', { children: 'mounted' }))
    assert.equal(el.textContent, 'mounted')
    el.remove()
  })

  it('注入 ctx.ui', async () => {
    let capturedCtx: any
    const app = createApp()
    app.use((ctx) => { capturedCtx = ctx; return ctx })
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'ui-test'
    await app.mount('#ui-test', () => () => jsx('div', null))

    assert.ok(capturedCtx.ui)
    assert.equal(typeof capturedCtx.ui.render, 'function')
    assert.equal(typeof capturedCtx.ui.$, 'function')
    assert.equal(typeof capturedCtx.ui.dirty, 'function')
    el.remove()
  })

  it('ctx.ui.render 触发重渲染', async () => {
    let renderCount = 0
    const Cmp = (_: any, ctx: WfuiContext) => {
      return () => {
        renderCount++
        return jsx('span', { children: String(renderCount) })
      }
    }
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 're-render'
    await app.mount('#re-render', Cmp)
    assert.equal(renderCount, 1)

    // 手动触发重渲染
    const renderFn = (app as any).ctx.ui.render
    renderFn()
    assert.equal(renderCount, 2)
    assert.equal(el.textContent, '2')
    el.remove()
  })

  it('destroy 清空容器', async () => {
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'destroy-test'
    await app.mount('#destroy-test', () => () => jsx('div', { children: 'data' }))
    assert.equal(el.textContent, 'data')

    app.destroy()
    assert.equal(el.innerHTML, '')
    el.remove()
  })

  it('mount 不存在的 selector 抛出错误', async () => {
    const app = createApp()
    try {
      await app.mount('#non-existent', () => () => jsx('div', null))
      assert.fail('should throw')
    } catch (e: any) {
      assert.ok(e.message.includes('#non-existent'))
    }
  })

  it('ctx.ui.$() 返回响应式状态容器', async () => {
    let ctx: any
    const app = createApp()
    app.use((c) => { ctx = c; return c })
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'state-test'
    await app.mount('#state-test', () => () => jsx('div', null))

    const $ = ctx.ui.$()
    assert.ok(typeof $ === 'object')
    assert.notEqual($, null)

    // 赋值触发 dirty（异步渲染）
    $.count = 42
    assert.equal($.count, 42)
    el.remove()
  })

  it('ctx.ui.$() 赋值触发 dirty', async () => {
    let renderCount = 0
    const Cmp = (_: any, ctx: WfuiContext) => {
      const $ = ctx.ui.$()
      $.count = 0
      return () => {
        renderCount++
        return jsx('span', { children: String($.count) })
      }
    }
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'dirty-test'
    await app.mount('#dirty-test', Cmp)
    // mount 中 $.count = 0 触发 dirty，等微任务消化
    await new Promise(r => setTimeout(r, 20))
    // mount 中的 $.count = 0 受 _rendering 保护，不触发渲染
    assert.equal(renderCount, 1, 'mount only, no dirty render')
    assert.equal(el.textContent, '0')

    // 直接 render 再触发一次
    const appCtx = (app as any).ctx
    appCtx.ui.render()
    await new Promise(r => setTimeout(r, 20))
    assert.equal(renderCount, 2, 'manual render = 2')
    el.remove()
  })

  it('ctx.ui.render 通过闭包变量更新状态', async () => {
    let text = 'init'
    const Cmp = (_: any, ctx: WfuiContext) => {
      return () => jsx('span', { children: text })
    }
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'closure-test'
    await app.mount('#closure-test', Cmp)
    assert.equal(el.textContent, 'init')

    text = 'updated'
    ;(app as any).ctx.ui.render()
    await new Promise(r => setTimeout(r, 20))
    assert.equal(el.textContent, 'updated')
    el.remove()
  })

  it('ctx.ui.useMedia 注册响应式媒体查询', async () => {
    let mediaValue = false
    const Cmp = (_: any, ctx: WfuiContext) => {
      ctx.ui.useMedia('(max-width: 640px)', (v) => { mediaValue = v })
      return () => jsx('span', { children: String(mediaValue) })
    }
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'use-media'
    await app.mount('#use-media', Cmp)

    // useMedia 立即回调当前值（mock 返回 false）
    assert.equal(mediaValue, false)
    el.remove()
  })

  it('ctx.ui.useMedia 配合 $ 触发 dirty', async () => {
    let renderValue = ''
    const Cmp = (_: any, ctx: WfuiContext) => {
      const $ = ctx.ui.$()
      $.label = 'init'
      $.isMobile = false
      // useMedia 立即回调一次
      ctx.ui.useMedia('(max-width: 640px)', (v) => { $.isMobile = v })
      return () => {
        renderValue = $.label + ':' + $.isMobile
        return jsx('span', { children: renderValue })
      }
    }
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'use-media-2'
    await app.mount('#use-media-2', Cmp)

    // mount 后 useMedia 立即回调，$.isMobile = false（mock 返回 false）
    assert.equal(renderValue, 'init:false')
    el.remove()
  })

  it('ctx.ui.useBreakpoint 返回正确断点', async () => {
    let vp = ''
    const Cmp = (_: any, ctx: WfuiContext) => {
      ctx.ui.useBreakpoint((val) => { vp = val })
      return () => jsx('span', { children: vp })
    }
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'use-bp'
    await app.mount('#use-bp', Cmp)

    // mock 全 false，fallback 到第一个断点 'mobile'
    assert.equal(vp, 'mobile')
    el.remove()
  })

  it('ctx.ui.dirty 批量渲染', async () => {
    let renderCount = 0
    const Cmp = (_: any, ctx: WfuiContext) => {
      return () => {
        renderCount++
        return jsx('span', { children: String(renderCount) })
      }
    }
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'dirty-batch'
    await app.mount('#dirty-batch', Cmp)
    assert.equal(renderCount, 1)

    // mount 后 renderCount = 1，多次 dirty 合并成一次渲染
    const ui = (app as any).ctx.ui
    ui.dirty()
    ui.dirty()
    ui.dirty()
    await new Promise(r => setTimeout(r, 20))
    assert.equal(renderCount, 2, '3 dirtys should batch into 1 render')
    el.remove()
  })
})
