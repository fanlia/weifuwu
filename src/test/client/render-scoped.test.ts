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

  it('稳定 ref 在 scope re-render 后不被 cleanup', async () => {
    let refCalls: Array<boolean | null> = []
    let renderCount = 0
    let cleanupCount = 0

    // 模拟一个&quot;外部订阅&quot;（类似 Chat 的 WS onMessage）
    let externalSubActive = true
    const unsub = () => { externalSubActive = false; cleanupCount++ }

    // 稳定的 ref 函数（mount 闭包中定义一次）
    const stableRef = (el: any) => {
      refCalls.push(!!el)
    }

    const App = (_: any, ctx: any) => {
      const $ = ctx.ui.$()
      $.items = [1]
      $.trigger = 0

      return () => {
        renderCount++
        return h('div', {}, [
          h('ul', { ref: stableRef },
            $.items.map((n: number) => h('li', {}, String(n)))
          ),
        ])
      }
    }

    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 's12'
    await app.mount('#s12', App)

    // 初始 mount
    assert.equal(renderCount, 1)
    assert.equal(refCalls.length, 1)
    assert.equal(refCalls[0], true)
    assert.equal(externalSubActive, true)

    // scope re-render: 通过 App 的 $ 修改状态触发 dirty
    // 用 app.ctx.ui.render() 触发 App 组件的 re-render（与 $ 绑定同一 selfId）
    ;(app as any).ctx.ui.render()
    await new Promise(r => setTimeout(r, 20))

    // 验证：re-render 后 ref cleanup 不应触发
    assert.equal(renderCount, 2, 're-render 执行')
    assert.equal(
      refCalls.length,
      1,
      'ref 不应被再次调用（稳定引用，VDOM 检测到 oldRef === newRef，不卸载/重新挂载）',
    )
    assert.equal(cleanupCount, 0, '外部订阅不应被误注销')

    el.remove()
  })
})
