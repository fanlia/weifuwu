/**
 * weifuwu/client — ctx.ui.usePopup 组合器测试（TDD）
 *
 * 覆盖：
 *   - trigger='hover'：触屏（(hover: hover) false）mouseenter 不打开、tap 打开、点外部关闭
 *   - trigger='hover'：桌面（(hover: hover) true）mouseenter 打开、mouseleave 关闭
 *   - trigger='click'：tap/click 切换
 *   - Escape 关闭（wrapProps.onKeyDown 冒泡）
 *   - trigger='longpress'：pointerdown + 500ms 触发；提前松开取消
 *   - 宽度 clamp：width 传 400 时 maxWidth = min(400px, calc(100vw - 32px))
 *   - 受控 open + onOpenChange：内部不直接改状态
 */

import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { h, type VNode } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'

before(setupJsdom)

const { createApp } = await import('../../client/app.ts')

/** 可切换的 hover 能力 mock */
let HOVER = false
function installMatchMedia() {
  const fn = (query: string) => ({
    matches: query.includes('(hover: hover)') ? HOVER : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
  ;(globalThis as any).matchMedia = fn
  ;(window as any).matchMedia = fn
}
before(installMatchMedia)

/** 等待 rAF/微任务/长按计时消化 */
const flush = (ms = 30) => new Promise(r => setTimeout(r, ms))

/** jsdom 事件构造（Node 内置 Event 与 jsdom EventTarget 不兼容） */
const fire = (el: Element | Document, type: string) =>
  el.dispatchEvent(new (window as any).Event(type, { bubbles: true, cancelable: true }))

/** 键盘事件（带 key） */
const fireKey = (el: Element, key: string) =>
  el.dispatchEvent(new (window as any).KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

interface HarnessOpts {
  trigger?: 'hover' | 'click' | 'longpress'
  width?: number
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** 挂载一个使用 usePopup 的最小组件，返回 DOM 查询句柄 */
async function mountPopup(opts: HarnessOpts = {}) {
  let wrapEl: HTMLElement | null = null
  let handle: any
  const Cmp = (_: any, ctx: WfuiContext) => {
    const $ = ctx.ui.$()
    $.open = false
    const wrapRef = (el: HTMLElement | null) => { wrapEl = el }
    handle = ctx.ui.usePopup({
      trigger: opts.trigger ?? 'click',
      el: () => wrapEl,
      isOpen: () => $.open,
      setOpen: (v) => { $.open = v; ctx.ui.render() },
      open: opts.open,
      onOpenChange: opts.onOpenChange,
      width: opts.width,
    })
    return () => h('div', {
      class: 'popup-wrap',
      ref: wrapRef,
      ...handle.wrapProps,
    }, [
      h('button', { class: 'trigger', type: 'button' }, 'T'),
      handle.portal(h('div', { class: 'wf-panel', 'data-test': 'panel' }, 'P')),
    ].filter(Boolean))
  }
  const Root = (_: any) => () => h('div', {}, [h(Cmp)])
  const app = createApp()
  const el = document.createElement('div')
  el.id = 'popup-harness'
  document.body.appendChild(el)
  await app.mount('#popup-harness', Root)
  // 注意：无 key 子节点每次渲染重建 DOM（框架 diff 行为），交互前必须重新查询 live 节点
  const q = (sel: string) => document.querySelector(sel) as HTMLElement | null
  return {
    app,
    get wrap() { return q('.popup-wrap') },
    get trigger() { return q('.trigger') },
    panel: () => q('[data-test="panel"]'),
    get handle() { return handle },
  }
}

describe('ctx.ui.usePopup', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    HOVER = false
  })

  it('hover 触发 + 触屏环境：(hover: hover) false → mouseenter 不打开，tap 打开，点外部关闭', async () => {
    HOVER = false
    const t = await mountPopup({ trigger: 'hover' })
    // mouseenter 不打开（触屏无 hover 语义）
    fire(t.wrap, 'mouseenter')
    await flush()
    assert.equal(t.panel(), null, '触屏下 mouseenter 不应打开')

    // tap（click）打开
    fire(t.trigger, 'click')
    await flush()
    assert.ok(t.panel(), 'tap 应打开')

    // 点外部关闭
    fire(document.body, 'mousedown')
    await flush()
    assert.equal(t.panel(), null, '点外部应关闭')
    t.app.destroy()
  })

  it('hover 触发 + 桌面环境：(hover: hover) true → mouseenter 打开，mouseleave 关闭', async () => {
    HOVER = true
    const t = await mountPopup({ trigger: 'hover' })
    fire(t.wrap, 'mouseenter')
    await flush()
    assert.ok(t.panel(), '桌面 mouseenter 应打开')

    fire(t.wrap, 'mouseleave')
    await flush()
    assert.equal(t.panel(), null, 'mouseleave 应关闭')
    t.app.destroy()
  })

  it('click 触发：tap 切换开关', async () => {
    const t = await mountPopup({ trigger: 'click' })
    fire(t.trigger, 'click')
    await flush()
    assert.ok(t.panel(), '第一次 tap 打开')
    fire(t.trigger, 'click')
    await flush()
    assert.equal(t.panel(), null, '第二次 tap 关闭')
    t.app.destroy()
  })

  it('Escape 关闭（wrapProps.onKeyDown 冒泡）', async () => {
    const t = await mountPopup({ trigger: 'click' })
    fire(t.trigger, 'click')
    await flush()
    assert.ok(t.panel())
    fireKey(t.wrap, "Escape")
    await flush()
    assert.equal(t.panel(), null, 'Escape 应关闭')
    t.app.destroy()
  })

  it('longpress 触发：pointerdown 按住 500ms 触发；提前松开取消', async () => {
    const t = await mountPopup({ trigger: 'longpress' })
    // 提前松开 → 取消
    fire(t.trigger, 'pointerdown')
    await flush(60)
    fire(t.trigger, 'pointerup')
    await flush(550)
    assert.equal(t.panel(), null, '提前松开不应打开')

    // 按住 500ms → 打开
    fire(t.trigger, 'pointerdown')
    await flush(550)
    assert.ok(t.panel(), '长按 500ms 应打开')
    t.app.destroy()
  })

  it('宽度 clamp：width=400 时面板 maxWidth = min(400px, calc(100vw - 32px))', async () => {
    const t = await mountPopup({ trigger: 'click', width: 400 })
    fire(t.trigger, 'click')
    await flush()
    const panel = t.panel()
    assert.ok(panel, '面板应打开')
    assert.match(panel.style.maxWidth, /min\(400px, calc\(100vw - 32px\)\)/)
    t.app.destroy()
  })

  it('受控模式：open/onOpenChange 由外部接管，组件内 setOpen 不直接改状态', async () => {
    let external = false
    const calls: boolean[] = []
    const t = await mountPopup({
      trigger: 'click',
      open: external,
      onOpenChange: (v) => { calls.push(v) },
    })
    // 组件内点击 → 只走 onOpenChange，不直接打开（open 由外部控制）
    fire(t.trigger, 'click')
    await flush()
    assert.deepEqual(calls, [true], 'onOpenChange 收到 true')
    assert.equal(t.panel(), null, '受控 open=false 时面板不渲染')
    t.app.destroy()
  })
})



describe('usePopup portal 锚点感知（client 层修复）', () => {
  it('打开后切换锚点：portal 自动重算坐标（不残留旧锚点）', async () => {
    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'popup-anchor-switch2'
    let anchorA: HTMLElement | null = null
    let anchorB: HTMLElement | null = null
    let cur = 'A'
    let pos: any
    const rects: Record<string, DOMRect> = {
      A: { top: 100, bottom: 124, left: 50, right: 250, width: 200, height: 24, x: 0, y: 0, toJSON() {} } as DOMRect,
      B: { top: 300, bottom: 324, left: 500, right: 700, width: 200, height: 24, x: 0, y: 0, toJSON() {} } as DOMRect,
    }
    const Cmp = (_: any, ctx: WfuiContext) => {
      const $ = ctx.ui.$()
      $.open = false
      const popup = ctx.ui.usePopup({
        trigger: () => 'click',
        placement: () => 'bottom',
        el: () => (cur === 'A' ? anchorA : anchorB),
        isOpen: () => $.open,
        setOpen: (v) => { $.open = v; ctx.ui.render() },
      })
      pos = popup
      return () => h('div', {
        class: 'popup-wrap2',
        ...popup.wrapProps,
      }, [
        h('div', { class: 'anchor-a', ref: (r: HTMLElement | null) => {
          if (r) { anchorA = r; (r as any).getBoundingClientRect = () => rects.A }
        } }),
        h('div', { class: 'anchor-b', ref: (r: HTMLElement | null) => {
          if (r) { anchorB = r; (r as any).getBoundingClientRect = () => rects.B }
        } }),
        h('button', { class: 'switch', type: 'button', onClick: () => { cur = 'B'; ctx.ui.render() } }, '切B'),
        popup.portal(h('div', { class: 'panel' }), 'anchor-switch2'),
      ])
    }
    await app.mount('#popup-anchor-switch2', Cmp)
    const wrap = el.querySelector('.popup-wrap2') as HTMLElement
    // 点击 wrap 打开（wrapProps onClick）
    wrap.dispatchEvent(new (window as any).Event('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 30))
    const panel = document.querySelector('#__wf_portal .panel') as HTMLElement
    if (!panel) throw new Error('panel 未渲染（打开失败）——wrap:' + !!wrap + ' portal容器:' + !!document.querySelector('#__wf_portal'))
    // A 锚点坐标（bottom 124 + gap 6）
    assert.equal(panel.style.top, '130px', '打开时 A 锚点坐标')
    // 切换锚点 B（组件内部 render）——portal 锚点感知自动重算
    el.querySelector('.switch')!.dispatchEvent(new (window as any).Event('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 30))
    assert.equal(panel.style.top, '330px', '切换锚点后坐标跟随 B（不残留 A）')
    app.destroy()
    el.remove()
  })
})
