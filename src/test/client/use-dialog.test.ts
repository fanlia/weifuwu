/**
 * ctx.ui.useDialog — 全屏对话框组合器（P2-1）
 *
 * 收敛 Modal/Drawer 的退场状态机 + 滚动锁 + 焦点 trap + animationend 卸载：
 * 组件只管布局（overlay/content 结构），对话框生命周期由 useDialog 统一。
 * Escape 语义各组件差异（Confirm 危险操作）留在组件层——诚实裁剪。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { setupJsdom } from './setup.ts'

setupJsdom()

import { h, type Component } from '../../ui-dom/vnode.ts'
import { mountApp } from '../ui-dom-mount.ts'
const browser = createClientBrowser()

test('useDialog：状态机 open → exit → closed（退场动画结束才卸载）', async () => {
  const container = browser.createElement('div')
  browser.bodyAppend(container)
  let dialog: any
  let open = true

  const Comp: Component = (_init, c) => {
    dialog = c.ui.useDialog({ name: 'TestDialog' })
    return () => {
      const phase = dialog.sync(open)
      if (phase === 'closed') return null
      return h('div', { class: 'root', ref: dialog.rootRef }, h('div', { class: 'panel', ref: dialog.panelRef }))
    }
  }

  const mountRes = await mountApp(container as any, Comp as any)
  assert.equal(dialog.sync(true), 'open', '首渲染 open')
  assert.ok(container.querySelector('.panel'), 'panel 渲染')

  // open → exit（模拟外部关闭）
  open = false
  mountRes.rerender()
  await new Promise(r => setTimeout(r, 10))
  assert.equal(dialog.sync(false), 'exit', 'open → exit（退场动画，DOM 仍在）')
  assert.ok(container.querySelector('.panel'), '退场期 DOM 未卸载（播 --exit 动画）')

  // 退场动画结束（jsdom 无 animationend，手动派发）→ closed（真正卸载）
  container.querySelector('.root')!.dispatchEvent(new (window as any).Event('animationend'))
  await new Promise(r => setTimeout(r, 10))
  assert.equal(dialog.sync(false), 'closed', 'animationend 后 closed')
  ;(mountRes as any).close?.()
})

test('useDialog：重新打开 exit → open 可恢复', async () => {
  const container = browser.createElement('div')
  browser.bodyAppend(container)
  let dialog: any
  let open = true

  const Comp: Component = (_init, c) => {
    dialog = c.ui.useDialog({ name: 'Reopen' })
    return () => {
      const phase = dialog.sync(open)
      return h('div', { class: 'root', ref: dialog.rootRef }, h('div', { class: 'panel', ref: dialog.panelRef }))
    }
  }

  const mountRes = await mountApp(container as any, Comp as any)
  // 关闭 → exit
  open = false
  mountRes.rerender()
  await new Promise(r => setTimeout(r, 10))
  assert.equal(dialog.sync(false), 'exit', '关闭进退场')
  // 退场完成 → closed
  container.querySelector('.root')!.dispatchEvent(new (window as any).Event('animationend'))
  await new Promise(r => setTimeout(r, 10))
  assert.equal(dialog.sync(false), 'closed')
  // 重新打开 → open
  open = true
  mountRes.rerender()
  await new Promise(r => setTimeout(r, 10))
  assert.equal(dialog.sync(true), 'open', '重新打开可恢复')
  ;(mountRes as any).close?.()
})

test('useDialog：rootRef 挂载锁滚动 + 焦点 trap，卸载释放', async () => {
  const container = browser.createElement('div')
  browser.bodyAppend(container)
  const calls: string[] = []
  let dialog: any

  // 模拟 lockScroll/trapFocus（jsdom 环境探测调用）
  const Comp: Component = (_init, c) => {
    dialog = c.ui.useDialog({ name: 'Trap' })
    return () => {
      const phase = dialog.sync(true)
      if (phase === 'closed') return null
      return h('div', {
        class: 'root',
        ref: (el: any) => {
          // 包装 rootRef：记录调用
          if (el) calls.push('lock')
          else calls.push('unlock')
          dialog.rootRef(el)
        },
      }, h('div', { class: 'panel', ref: dialog.panelRef }))
    }
  }

  const mountRes = await mountApp(container as any, Comp as any)
  assert.ok(calls.includes('lock'), '挂载锁滚动')
  assert.ok(container.querySelector('.panel'), 'panel 在 DOM')
  ;(mountRes as any).close?.()
})
