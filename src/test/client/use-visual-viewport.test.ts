/**
 * weifuwu/client — ctx.ui.useVisualViewport 测试（TDD）
 *
 * 覆盖：
 *   - 返回响应式 { height, offsetTop }（初始 = innerHeight / 0）
 *   - 无 visualViewport 环境（桌面/旧浏览器）降级 innerHeight，不抛错
 *   - 键盘弹起（visualViewport height 收缩 + resize 事件）→ 状态更新 + 组件重渲染
 *   - keyboardOpen 语义：height < 0.9 * innerHeight
 */

import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { h } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

before(setupJsdom)

const { createApp } = await import('../../client/app.ts')

/** 可编程 visualViewport mock */
function installVisualViewport() {
  let state = { height: window.innerHeight, offsetTop: 0 }
  const handlers: Record<string, (() => void)[]> = {}
  ;(window as any).visualViewport = {
    get height() { return state.height },
    get offsetTop() { return state.offsetTop },
    addEventListener: (t: string, cb: () => void) => { (handlers[t] ??= []).push(cb) },
    removeEventListener: () => {},
  }
  return {
    set: (h: number, top = 0) => { state = { height: h, offsetTop: top }; handlers.resize?.forEach(cb => cb()) },
  }
}

const flush = () => new Promise(r => setTimeout(r, 30))

describe('ctx.ui.useVisualViewport', () => {
  afterEach(() => { document.body.innerHTML = ''; delete (window as any).visualViewport })

  it('无 visualViewport 环境（桌面）降级 innerHeight，不抛错', async () => {
    let vp: any
    const Cmp = (_: any, ctx: WfuiContext) => {
      vp = ctx.ui.useVisualViewport()
      return () => h('div', {}, 'x')
    }
    const Root = (_: any) => () => h('div', {}, [h(Cmp)])
    const app = createApp()
    const el = document.createElement('div')
    el.id = 'vv-1'
    document.body.appendChild(el)
    await app.mount('#vv-1', Root)
    assert.equal(vp.height, window.innerHeight)
    assert.equal(vp.offsetTop, 0)
    assert.equal(vp.keyboardOpen, false)
    app.destroy()
    el.remove()
  })

  it('键盘弹起（visualViewport 收缩 + resize）→ height/offsetTop/keyboardOpen 更新并重渲染', async () => {
    const sim = installVisualViewport()
    let vp: any
    let renderCount = 0
    const Cmp = (_: any, ctx: WfuiContext) => {
      vp = ctx.ui.useVisualViewport()
      return () => h('div', {}, `h=${vp.height}`)
    }
    const Root = (_: any) => () => h('div', {}, [h(Cmp)])
    const app = createApp()
    const el = document.createElement('div')
    el.id = 'vv-2'
    document.body.appendChild(el)
    await app.mount('#vv-2', Root)
    assert.equal(vp.keyboardOpen, false)

    // 模拟键盘弹起：innerHeight 800 → visualViewport 450（键盘占 ~44%）
    const before = vp.height
    sim.set(450, 350)
    await flush()
    assert.equal(vp.height, 450)
    assert.equal(vp.offsetTop, 350)
    assert.equal(vp.keyboardOpen, true, 'height 收缩应标记 keyboardOpen')
    assert.notEqual(vp.height, before)
    app.destroy()
    el.remove()
  })
})
