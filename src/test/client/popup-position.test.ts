/**
 * weifuwu/client — ctx.ui.usePopupPosition 测试
 *
 * 覆盖：
 *   - 返回 pos 对象（top/left 初始 0 + refresh）
 *   - scroll（capture）/ resize 触发重算 + 定向渲染
 *   - rAF 节流：一帧内多次 scroll 只重算一次
 *   - isOpen=false 或 el 缺失时跳过
 *   - refresh() 立即重算但不触发渲染
 *   - compute 支持附加属性（width）
 *   - 全局单例：多个组件同时打开，一次 scroll 全部刷新
 */

import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { h } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'

before(setupJsdom)

const { createApp } = await import('../../client/app.ts')

/** 等待 rAF/微任务队列消化 */
const flush = () => new Promise(r => setTimeout(r, 30))

/** jsdom 事件构造（Node 内置 Event 与 jsdom EventTarget 不兼容） */
const fireScroll = () => (window as any).dispatchEvent(new (window as any).Event('scroll'))
const fireResize = () => (window as any).dispatchEvent(new (window as any).Event('resize'))

/** 构造可 override 的 DOMRect */
function fakeRect(over: Partial<DOMRect>): DOMRect {
  return {
    top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON: () => ({}), ...over,
  } as DOMRect
}

describe('ctx.ui.usePopupPosition', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('返回 pos 对象：top/left 初始 0 + refresh 方法', async () => {
    let pos: any
    const Cmp = (_: any, ctx: WfuiContext) => {
      pos = ctx.ui.usePopupPosition({
        el: () => null,
        isOpen: () => false,
        compute: (r) => ({ top: r.bottom, left: r.left }),
      })
      return () => h('div', {}, 'x')
    }
    const Root = (_: any) => () => h('div', {}, [h(Cmp)])
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'pp-1'
    await app.mount('#pp-1', Root)

    assert.equal(pos.top, 0)
    assert.equal(pos.left, 0)
    assert.equal(typeof pos.refresh, 'function')
    app.destroy()
    el.remove()
  })

  it('scroll 事件重算坐标并定向渲染当前组件（打开状态）', async () => {
    let renderCount = 0
    let anchor: HTMLElement | null = null
    let pos: any
    const Cmp = (_: any, ctx: WfuiContext) => {
      const $ = ctx.ui.$()
      $.open = false
      pos = ctx.ui.usePopupPosition({
        el: () => anchor,
        isOpen: () => $.open,
        compute: (r) => ({ top: r.bottom + 4, left: r.left }),
      })
      return () => {
        renderCount++
        return h('button', {
          id: 'pp-2-toggle',
          onClick: () => { $.open = true },
          ref: (el: HTMLElement | null) => { anchor = el },
        }, 'x')
      }
    }
    const Root = (_: any) => () => h('div', {}, [h(Cmp)])
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'pp-2'
    await app.mount('#pp-2', Root)
    assert.equal(renderCount, 1)

    // 点击按钮打开（$ 赋值 → dirty → re-render，真实交互路径）
    ;(el.querySelector('#pp-2-toggle') as HTMLElement).dispatchEvent(new (window as any).MouseEvent('click'))
    await flush()
    assert.equal(renderCount, 2)

    // mock 锚点 rect（jsdom 默认全 0）
    anchor!.getBoundingClientRect = () => fakeRect({ top: 10, bottom: 100, left: 50, right: 200 })

    // 触发滚动（capture 监听在 window 上）
    fireScroll()
    await flush()

    assert.equal(pos.top, 104, 'rect.bottom + gap(4)')
    assert.equal(pos.left, 50)
    assert.equal(renderCount, 3, 'scroll 后组件应重渲染以应用新坐标')
    app.destroy()
    el.remove()
  })

  it('resize 事件同样触发重算', async () => {
    let open = true
    let anchor: HTMLElement | null = null
    let pos: any
    const Cmp = (_: any, ctx: WfuiContext) => {
      pos = ctx.ui.usePopupPosition({
        el: () => anchor,
        isOpen: () => open,
        compute: (r) => ({ top: r.bottom, left: r.left }),
      })
      return () => h('div', {
        ref: (el: HTMLElement | null) => { anchor = el },
      }, 'x')
    }
    const Root = (_: any) => () => h('div', {}, [h(Cmp)])
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'pp-3'
    await app.mount('#pp-3', Root)

    anchor!.getBoundingClientRect = () => fakeRect({ bottom: 88, left: 66 })
    fireResize()
    await flush()

    assert.equal(pos.top, 88)
    assert.equal(pos.left, 66)
    app.destroy()
    el.remove()
  })

  it('rAF 节流：一帧内多次 scroll 只重算一次', async () => {
    let renderCount = 0
    let open = true
    let anchor: HTMLElement | null = null
    let pos: any
    const Cmp = (_: any, ctx: WfuiContext) => {
      pos = ctx.ui.usePopupPosition({
        el: () => anchor,
        isOpen: () => open,
        compute: (r) => ({ top: r.bottom, left: r.left }),
      })
      return () => {
        renderCount++
        return h('div', {
          ref: (el: HTMLElement | null) => { anchor = el },
        }, 'x')
      }
    }
    const Root = (_: any) => () => h('div', {}, [h(Cmp)])
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'pp-4'
    await app.mount('#pp-4', Root)
    const before = renderCount

    anchor!.getBoundingClientRect = () => fakeRect({ bottom: 1, left: 2 })
    // 同一帧内连发 5 次 scroll
    fireScroll()
    fireScroll()
    fireScroll()
    fireScroll()
    fireScroll()
    await flush()

    assert.equal(renderCount, before + 1, '5 次 scroll 合并为 1 次重算 + 1 次渲染')
    assert.equal(pos.top, 1)
    app.destroy()
    el.remove()
  })

  it('isOpen=false 时 scroll 跳过（不重算不渲染）', async () => {
    let renderCount = 0
    let open = false
    let anchor: HTMLElement | null = null
    let pos: any
    const Cmp = (_: any, ctx: WfuiContext) => {
      pos = ctx.ui.usePopupPosition({
        el: () => anchor,
        isOpen: () => open,
        compute: (r) => ({ top: r.bottom, left: r.left }),
      })
      return () => {
        renderCount++
        return h('div', {
          ref: (el: HTMLElement | null) => { anchor = el },
        }, 'x')
      }
    }
    const Root = (_: any) => () => h('div', {}, [h(Cmp)])
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'pp-5'
    await app.mount('#pp-5', Root)
    const before = renderCount

    anchor!.getBoundingClientRect = () => fakeRect({ bottom: 777, left: 888 })
    fireScroll()
    await flush()

    assert.equal(pos.top, 0, '关闭状态不重算')
    assert.equal(renderCount, before, '关闭状态不渲染')
    app.destroy()
    el.remove()
  })

  it('el() 返回 null 时安全跳过', async () => {
    let open = true
    let anchor: HTMLElement | null = null
    let pos: any
    const Cmp = (_: any, ctx: WfuiContext) => {
      pos = ctx.ui.usePopupPosition({
        el: () => anchor,
        isOpen: () => open,
        compute: (r) => ({ top: r.bottom, left: r.left }),
      })
      return () => h('div', {
        ref: (el: HTMLElement | null) => { anchor = el },
      }, 'x')
    }
    const Root = (_: any) => () => h('div', {}, [h(Cmp)])
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'pp-6'
    await app.mount('#pp-6', Root)

    // 锚点尚未挂载（el 返回 null）→ scroll 不崩溃、pos 不变
    const saved = anchor
    anchor = null
    fireScroll()
    await flush()
    anchor = saved

    assert.equal(pos.top, 0)
    app.destroy()
    el.remove()
  })

  it('refresh() 立即重算坐标但不触发渲染', async () => {
    let renderCount = 0
    let open = true
    let anchor: HTMLElement | null = null
    let pos: any
    const Cmp = (_: any, ctx: WfuiContext) => {
      pos = ctx.ui.usePopupPosition({
        el: () => anchor,
        isOpen: () => open,
        compute: (r) => ({ top: r.bottom + 4, left: r.left }),
      })
      return () => {
        renderCount++
        return h('div', {
          ref: (el: HTMLElement | null) => { anchor = el },
        }, 'x')
      }
    }
    const Root = (_: any) => () => h('div', {}, [h(Cmp)])
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'pp-7'
    await app.mount('#pp-7', Root)
    const before = renderCount

    anchor!.getBoundingClientRect = () => fakeRect({ bottom: 40, left: 30, width: 100, height: 20 })
    pos.refresh()

    assert.equal(pos.top, 44)
    assert.equal(pos.left, 30)
    assert.equal(renderCount, before, 'refresh 只重算不渲染（调用方负责 render）')
    app.destroy()
    el.remove()
  })

  it('0 rect（元素替换中/未布局）→ 跳过刷新保留上一坐标', async () => {
    let open = true
    let anchor: HTMLElement | null = null
    let pos: any
    const Cmp = (_: any, ctx: WfuiContext) => {
      pos = ctx.ui.usePopupPosition({
        el: () => anchor,
        isOpen: () => open,
        compute: (r) => ({ top: r.bottom + 4, left: r.left }),
      })
      return () => h('div', {
        ref: (el: HTMLElement | null) => { anchor = el },
      }, 'x')
    }
    const Root = (_: any) => () => h('div', {}, [h(Cmp)])
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'pp-zero-rect'
    await app.mount('#pp-zero-rect', Root)

    // 正常 rect → 坐标更新
    anchor!.getBoundingClientRect = () => fakeRect({ bottom: 100, left: 50, width: 100, height: 30 })
    pos.refresh()
    assert.equal(pos.top, 104)
    // 0 rect（元素替换中）→ 保留上一坐标不覆盖
    anchor!.getBoundingClientRect = () => fakeRect({ bottom: 0, left: 0 })
    pos.refresh()
    assert.equal(pos.top, 104, '0 rect 时保留上一坐标（防弹层飞到左上角）')
    app.destroy()
    el.remove()
  })

  it('compute 支持附加属性（如 width）', async () => {
    let open = true
    let anchor: HTMLElement | null = null
    let pos: any
    const Cmp = (_: any, ctx: WfuiContext) => {
      pos = ctx.ui.usePopupPosition({
        el: () => anchor,
        isOpen: () => open,
        compute: (r) => ({ top: r.bottom + 4, left: r.left, width: r.width }),
      })
      return () => h('div', {
        ref: (el: HTMLElement | null) => { anchor = el },
      }, 'x')
    }
    const Root = (_: any) => () => h('div', {}, [h(Cmp)])
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'pp-8'
    await app.mount('#pp-8', Root)

    anchor!.getBoundingClientRect = () => fakeRect({ bottom: 100, left: 50, width: 300 })
    pos.refresh()

    assert.equal(pos.width, 300)
    app.destroy()
    el.remove()
  })

  it('全局单例：多个组件同时打开，一次 scroll 全部刷新', async () => {
    let renderA = 0
    let renderB = 0
    let anchorA: HTMLElement | null = null
    let anchorB: HTMLElement | null = null
    let posA: any
    let posB: any

    const A = (_: any, ctx: WfuiContext) => {
      posA = ctx.ui.usePopupPosition({
        el: () => anchorA,
        isOpen: () => true,
        compute: (r) => ({ top: r.bottom, left: r.left }),
      })
      return () => {
        renderA++
        return h('div', { ref: (el: HTMLElement | null) => { anchorA = el } }, 'A')
      }
    }
    const B = (_: any, ctx: WfuiContext) => {
      posB = ctx.ui.usePopupPosition({
        el: () => anchorB,
        isOpen: () => true,
        compute: (r) => ({ top: r.bottom, left: r.left }),
      })
      return () => {
        renderB++
        return h('div', { ref: (el: HTMLElement | null) => { anchorB = el } }, 'B')
      }
    }
    const Root = (_: any) => () => h('div', {}, [h(A), h(B)])

    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'pp-9'
    await app.mount('#pp-9', Root)
    const beforeA = renderA
    const beforeB = renderB

    anchorA!.getBoundingClientRect = () => fakeRect({ bottom: 10, left: 20 })
    anchorB!.getBoundingClientRect = () => fakeRect({ bottom: 30, left: 40 })
    fireScroll()
    await flush()

    assert.equal(posA.top, 10)
    assert.equal(posB.top, 30)
    assert.equal(renderA, beforeA + 1, 'A 被定向刷新')
    assert.equal(renderB, beforeB + 1, 'B 被定向刷新')
    app.destroy()
    el.remove()
  })

  it('打开/关闭后多次切换：关闭后 scroll 不再更新坐标', async () => {
    let open = false
    let anchor: HTMLElement | null = null
    let pos: any
    const Cmp = (_: any, ctx: WfuiContext) => {
      pos = ctx.ui.usePopupPosition({
        el: () => anchor,
        isOpen: () => open,
        compute: (r) => ({ top: r.bottom, left: r.left }),
      })
      return () => h('div', {
        ref: (el: HTMLElement | null) => { anchor = el },
      }, 'x')
    }
    const Root = (_: any) => () => h('div', {}, [h(Cmp)])
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'pp-10'
    await app.mount('#pp-10', Root)

    // 打开 → scroll → 更新
    open = true
    ;(app as any).ctx.ui.render()
    anchor!.getBoundingClientRect = () => fakeRect({ bottom: 50, left: 60 })
    fireScroll()
    await flush()
    assert.equal(pos.top, 50)

    // 关闭 → scroll → 不再更新（保持旧坐标）
    open = false
    ;(app as any).ctx.ui.render()
    anchor!.getBoundingClientRect = () => fakeRect({ bottom: 999, left: 999 })
    fireScroll()
    await flush()
    assert.equal(pos.top, 50, '关闭后保持旧坐标')

    // 重新打开 → scroll → 更新
    open = true
    ;(app as any).ctx.ui.render()
    fireScroll()
    await flush()
    assert.equal(pos.top, 999, '重新打开后恢复跟随')
    app.destroy()
    el.remove()
  })
})
