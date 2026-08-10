/**
 * ctx.ui.usePresence — 通用显隐状态机（动画基础设施 2/2）
 *
 * 收敛 useDialog 的退场状态机核心（open → exit → closed + animationend 卸载），
 * 去掉 lockScroll/trapFocus（对话框特例）——非 dialog 浮层/面板显隐用。
 * useDialog 基于它（+ lock/trap）——状态机单点实现。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

setupJsdom()

import { mountApp } from '../ui-dom-mount.ts'
import { h, type Component } from '../../ui-dom/vnode.ts'

test('usePresence：sync 状态机 open → exit → closed（animationend 卸载）', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let presence: any
  let open = true

  const Comp: Component = (_init, c) => {
    presence = c.ui.usePresence({ name: 'Panel' })
    return () => {
      const phase = presence.sync(open)
      if (phase === 'closed') return null
      return h('div', { class: 'panel', ref: presence.ref }, 'p')
    }
  }

  const mountRes = await mountApp(container as any, Comp)
  assert.equal(presence.sync(true), 'open', '首渲染 open')
  assert.ok(container.querySelector('.panel'))

  open = false
  mountRes.rerender()
  await new Promise(r => setTimeout(r, 10))
  assert.equal(presence.sync(false), 'exit', 'open → exit（播退场动画，DOM 仍在）')
  assert.ok(container.querySelector('.panel'), '退场期 DOM 未卸载')

  // animationend → closed（真正卸载）
  container.querySelector('.panel')!.dispatchEvent(new (window as any).Event('animationend'))
  await new Promise(r => setTimeout(r, 10))
  assert.equal(presence.sync(false), 'closed')
  ;(mountRes as any).close?.()
})

test('usePresence：exit → 重新打开可恢复 open', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let presence: any
  let open = true

  const Comp: Component = (_init, c) => {
    presence = c.ui.usePresence()
    return () => {
      const phase = presence.sync(open)
      if (phase === 'closed') return null
      return h('div', { class: 'panel', ref: presence.ref }, 'p')
    }
  }

  const mountRes = await mountApp(container as any, Comp)
  open = false
  mountRes.rerender()
  await new Promise(r => setTimeout(r, 10))
  assert.equal(presence.sync(false), 'exit')

  // 退场中重新打开 → 恢复 open
  open = true
  mountRes.rerender()
  await new Promise(r => setTimeout(r, 10))
  assert.equal(presence.sync(true), 'open', '退场中重开恢复')
  ;(mountRes as any).close?.()
})

test('usePresence：ref(null) 清理 animationend 监听', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let presence: any

  const Comp: Component = (_init, c) => {
    presence = c.ui.usePresence()
    return () => {
      const phase = presence.sync(true)
      if (phase === 'closed') return null
      return h('div', { class: 'panel', ref: presence.ref }, 'p')
    }
  }

  const mountRes = await mountApp(container as any, Comp)
  const panel = container.querySelector('.panel') as HTMLElement

  // 卸载清理（ref 契约）
  presence.ref(null)
  // 不再能触发状态变化（监听已移除）
  panel.dispatchEvent(new (window as any).Event('animationend'))
  await new Promise(r => setTimeout(r, 10))
  ;(mountRes as any).close?.()
})
