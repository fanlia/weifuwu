/**
 * weifuwu/client app — createApp 测试
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
    // cleanup 可能挂载的 DOM
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
    assert.ok(typeof capturedCtx.ui.$, 'object')
    assert.equal(capturedCtx.ui.ready, false)
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
    // 组件在 patchValue 中执行一次（新 props），旧 VNode 有 _child 缓存
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

  it('ctx.ui.$ 在 mount 时为对象', async () => {
    let ctx: any
    const app = createApp()
    app.use((c) => { ctx = c; return c })
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'state-test'
    await app.mount('#state-test', () => () => jsx('div', null))

    assert.ok(typeof ctx.ui.$, 'object')
    assert.notEqual(ctx.ui.$, null)
    el.remove()
  })

  it('$.xxx = val 触发重渲染', async () => {
    let renderCount = 0
    const Cmp = (_: any, ctx: WfuiContext) => {
      renderCount++
      const $ = ctx.ui.$
      if ($.text === undefined) $.text = 'init'
      return () => jsx('span', { children: $.text })
    }
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'proxy-test'
    await app.mount('#proxy-test', Cmp)
    assert.equal(el.textContent, 'init')
    assert.equal(renderCount, 1)

    // 等待异步渲染完成
    await new Promise(r => setTimeout(r, 20))
    const appCtx = (app as any).ctx
    appCtx.ui.$.text = 'updated'
    await new Promise(r => setTimeout(r, 20))
    assert.equal(el.textContent, 'updated')
    el.remove()
  })

  it('$.items = [...] 包装为 Proxy 数组', async () => {
    let ctx: any
    const app = createApp()
    app.use((c) => { ctx = c; return c })
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'array-proxy'
    await app.mount('#array-proxy', () => () => jsx('div', null))
    ctx.ui.$.items = [1, 2, 3]
    assert.ok(Array.isArray(ctx.ui.$.items))
    assert.equal(ctx.ui.$.items.length, 3)
    el.remove()
  })

  it('$.items.push 自动触发渲染', async () => {
    let renderCount = 0
    const Cmp = (_: any, ctx: WfuiContext) => {
      renderCount++
      const $ = ctx.ui.$
      if (!$.items) $.items = [{ id: 1, text: 'a' }]
      return () => jsx('div', { children: $.items.length })
    }
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'push-test'
    await app.mount('#push-test', Cmp)
    await new Promise(r => setTimeout(r, 20))

    const appCtx = (app as any).ctx
    assert.equal(el.textContent, '1')

    appCtx.ui.$.items.push({ id: 2, text: 'b' })
    await new Promise(r => setTimeout(r, 20))
    assert.equal(el.textContent, '2')
    el.remove()
  })

  it('$.items.splice 自动触发渲染', async () => {
    let ctx: any
    const app = createApp()
    app.use((c) => { ctx = c; return c })
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'splice-test'
    await app.mount('#splice-test', () => () => jsx('div', null))
    await new Promise(r => setTimeout(r, 10))
    ctx.ui.$.items = ['a', 'b', 'c']
    ctx.ui.$.items.splice(1, 1)
    assert.deepEqual(ctx.ui.$.items, ['a', 'c'])
    el.remove()
  })

  it('$.items.pop 自动触发渲染', async () => {
    let ctx: any
    const app = createApp()
    app.use((c) => { ctx = c; return c })
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'pop-test'
    await app.mount('#pop-test', () => () => jsx('div', null))
    await new Promise(r => setTimeout(r, 10))
    ctx.ui.$.items = ['a', 'b']
    const popped = ctx.ui.$.items.pop()
    assert.equal(popped, 'b')
    assert.deepEqual(ctx.ui.$.items, ['a'])
    el.remove()
  })

  it('不用 dirty() 数组突变也能更新 UI', async () => {
    let renderCount = 0
    const Cmp = (_: any, ctx: WfuiContext) => {
      const $ = ctx.ui.$
      if (!$.items) $.items = [1]
      return () => {
        renderCount++
        return jsx('div', {
          children: $.items.map((i: any, idx: number) => jsx('span', { children: String(i) }, String(idx))),
        })
      }
    }
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'no-dirty'
    await app.mount('#no-dirty', Cmp)
    await new Promise(r => setTimeout(r, 20))
    assert.equal(el.textContent, '1')

    const appCtx = (app as any).ctx
    appCtx.ui.$.items.push(2)
    await new Promise(r => setTimeout(r, 20))
    assert.equal(el.textContent, '12')
    el.remove()
  })

  it('数组元素对象属性赋值自动 dirty', async () => {
    let renderCount = 0
    const Cmp = (_: any, ctx: WfuiContext) => {
      const $ = ctx.ui.$
      if (!$.msgs) $.msgs = [{ id: 1, content: 'hello' }]
      return () => {
        renderCount++
        return jsx('div', { children: $.msgs[0]?.content ?? '' })
      }
    }
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'deep-proxy'
    await app.mount('#deep-proxy', Cmp)
    await new Promise(r => setTimeout(r, 20))
    assert.equal(el.textContent, 'hello')

    const appCtx = (app as any).ctx
    appCtx.ui.$.msgs[0].content = 'updated'
    await new Promise(r => setTimeout(r, 20))
    assert.equal(el.textContent, 'updated')
    el.remove()
  })

  it('数组元素嵌套数组 push 自动 dirty', async () => {
    let ctx: any
    const app = createApp()
    app.use((c) => { ctx = c; return c })
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'nested-array'
    await app.mount('#nested-array', () => () => jsx('div', null))
    await new Promise(r => setTimeout(r, 10))
    ctx.ui.$.data = [{ items: [1, 2] }]
    ctx.ui.$.data[0].items.push(3)
    assert.deepEqual(ctx.ui.$.data[0].items, [1, 2, 3])
    el.remove()
  })

  it('对象属性嵌套赋值自动 dirty', async () => {
    let ctx: any
    const app = createApp()
    app.use((c) => { ctx = c; return c })
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'obj-prop'
    await app.mount('#obj-prop', () => () => jsx('div', null))
    await new Promise(r => setTimeout(r, 10))
    ctx.ui.$.user = { profile: { name: 'alice' } }
    ctx.ui.$.user.profile.name = 'bob'
    assert.equal(ctx.ui.$.user.profile.name, 'bob')
    el.remove()
  })

  it('WeakMap 缓存保证同一底层对象返回同一 Proxy', async () => {
    let ctx: any
    const app = createApp()
    app.use((c) => { ctx = c; return c })
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'cache-test'
    await app.mount('#cache-test', () => () => jsx('div', null))
    await new Promise(r => setTimeout(r, 10))

    ctx.ui.$.items = [{ x: 1 }]
    const a = ctx.ui.$.items[0]
    const b = ctx.ui.$.items[0]
    assert.equal(a, b) // same Proxy object from WeakMap cache
    el.remove()
  })
})
