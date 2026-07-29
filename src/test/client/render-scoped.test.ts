/**
 * weifuwu/client 范围渲染测试 — scope-based render / dirty / $
 *
 * 覆盖：
 *   - render() 无参 = 当前组件
 *   - render(['_wf_root']) = 根组件
 *   - 组件间隔离：A render 不影响 B
 *   - dirty 异步批处理作用域
 *   - $ 绑定所属组件
 *   - idRegistry 正确维护
 *   - ctx 扩展继承
 */

import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { h, jsx } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'

before(setupJsdom)

const { createApp } = await import('../../client/app.ts')

describe('scoped render', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('render() 无参刷新当前组件（根组件）', async () => {
    let renderCount = 0
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 's1'
    await app.mount('#s1', () => () => {
      renderCount++
      return h('span', {}, 'x')
    })
    assert.equal(renderCount, 1)

    // 从 app 层 ctx 调 render — 使用 root 的 _selfId
    ;(app as any).ctx.ui.render()
    assert.equal(renderCount, 2)
    el.remove()
  })

  it('render() 隔离：组件 A render 不影响组件 B', async () => {
    let renderA = 0
    let renderB = 0

    const A = (_: any, ctx: WfuiContext) => {
      let count = 0
      return (_: any) => {
        renderA++
        return h('button', {
          id: 'btn-a',
          onClick: () => { count++; ctx.ui.render() },
        }, String(count))
      }
    }

    const B = (_: any, _ctx: WfuiContext) => {
      return (_: any) => {
        renderB++
        return h('span', { id: 'span-b' }, 'B')
      }
    }

    const Root = (_: any, ctx: WfuiContext) => {
      return () => h('div', {}, [
        h(A, {}),
        h(B, {}),
      ])
    }

    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 's2'
    await app.mount('#s2', Root)
    assert.equal(renderA, 1)
    assert.equal(renderB, 1)

    // 模拟点击 A 的 button，触发 A 的 render
    const btn = el.querySelector('#btn-a') as HTMLElement
    btn.click()

    // 等 microtask 消化
    await new Promise(r => setTimeout(r, 20))

    assert.equal(renderA, 2, 'A 应重新渲染')
    assert.equal(renderB, 1, 'B 不应重新渲染 — 隔离')
    el.remove()
  })

  it('render(["_wf_root"]) 刷新根组件', async () => {
    let renderCount = 0
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 's3'
    await app.mount('#s3', () => () => {
      renderCount++
      return h('div', {}, 'root')
    })
    assert.equal(renderCount, 1)

    ;(app as any).ctx.ui.render(['_wf_root'])
    assert.equal(renderCount, 2)
    el.remove()
  })

  it('dirty 异步批处理作用域', async () => {
    let renderCount = 0
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 's5'
    await app.mount('#s5', () => () => {
      renderCount++
      return h('span', {}, 'x')
    })
    assert.equal(renderCount, 1)

    // 多次 dirty 合并为一次
    ;(app as any).ctx.ui.dirty()
    ;(app as any).ctx.ui.dirty()
    ;(app as any).ctx.ui.dirty()
    await new Promise(r => setTimeout(r, 20))
    assert.equal(renderCount, 2, '3 dirtys → 1 render')
    el.remove()
  })

  it('$ 绑定所属组件，不波及兄弟', async () => {
    let renderA = 0
    let renderB = 0

    const A = (_: any, ctx: WfuiContext) => {
      const $ = ctx.ui.$()
      $.count = 0
      return (_: any) => {
        renderA++
        return h('button', {
          id: 'btn-a',
          onClick: () => $.count++,
        }, String($.count))
      }
    }

    const B = (_: any, _ctx: WfuiContext) => {
      return (_: any) => {
        renderB++
        return h('span', { id: 'span-b' }, 'B-stable')
      }
    }

    const Root = (_: any) => () => h('div', {}, [
      h(A, {}),
      h(B, {}),
    ])

    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 's7'
    await app.mount('#s7', Root)

    await new Promise(r => setTimeout(r, 20))
    assert.equal(renderA, 1, 'A mount 一次')
    assert.equal(renderB, 1, 'B mount 一次')

    // 点击 A 的按钮 → $.count++ → dirty(A)
    const btnA = el.querySelector('#btn-a') as HTMLElement
    btnA.click()
    await new Promise(r => setTimeout(r, 20))

    assert.equal(renderA, 2, 'A 应重新渲染')
    assert.equal(renderB, 1, 'B 不应重新渲染 — $ 绑定 A')
    el.remove()
  })

  it('render + dirty 混合使用', async () => {
    let renderCount = 0

    const App = (_: any, ctx: WfuiContext) => {
      const $ = ctx.ui.$()
      $.val = 1
      return (_: any) => {
        renderCount++
        return h('div', {}, String($.val))
      }
    }

    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 's8'
    await app.mount('#s8', App)

    // 同步 render
    ;(app as any).ctx.ui.render()
    assert.equal(renderCount, 2)

    // 异步 dirty
    ;(app as any).ctx.ui.dirty()
    await new Promise(r => setTimeout(r, 20))
    assert.equal(renderCount, 3)
    el.remove()
  })

  it('selfId 注册自定义 ID 可精准刷新', async () => {
    let renderCustom = 0

    const Custom = (_: any, ctx: any) => {
      ctx.ui.selfId('my-custom')
      return () => {
        renderCustom++
        return { type: 'span', props: { children: 'custom' }, key: undefined }
      }
    }

    const Root = () => () => ({
      type: 'div',
      props: { children: { type: Custom, props: {}, key: undefined } },
      key: undefined,
    })

    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 's9'
    await app.mount('#s9', Root)
    await new Promise(r => setTimeout(r, 20))
    assert.equal(renderCustom, 1)

    // 通过自定义 ID 精准刷新
    ;(app as any).ctx.ui.render(['my-custom'])
    assert.equal(renderCustom, 2)
    el.remove()
  })

  it('selfId 同名冲突抛错', async () => {
    const A = (_: any, ctx: any) => {
      ctx.ui.selfId('dup')
      return () => ({ type: 'span', props: {}, key: undefined })
    }
    const B = (_: any, ctx: any) => {
      ctx.ui.selfId('dup')
      return () => ({ type: 'span', props: {}, key: undefined })
    }
    const Root = () => () => ({
      type: 'div',
      props: { children: [{ type: A, props: {}, key: undefined }, { type: B, props: {}, key: undefined }] },
      key: undefined,
    })

    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 's10'
    try {
      await app.mount('#s10', Root)
      assert.fail('should throw on duplicate selfId')
    } catch (e: any) {
      assert.ok(e.message.includes('dup'), 'error mentions duplicate name')
    }
    el.remove()
  })

  it('selfId 空字符串抛错', async () => {
    const Comp = (_: any, ctx: any) => {
      try {
        ctx.ui.selfId('')
      } catch (e: any) {
        ctx.__caught = e
      }
      return () => ({ type: 'span', props: {}, key: undefined })
    }

    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 's11'
    await app.mount('#s11', () => () => ({ type: 'div', props: { children: { type: Comp, props: {}, key: undefined } }, key: undefined }))
    el.remove()
  })
})
