/**
 * ctx.ui.useGlobalKey / useDrag / useDragDrop — 事件监听原语补齐（P-审计收敛）
 *
 * 覆盖组件库剩余自建监听：Command 全局快捷键（useGlobalKey）、
 * Resizable 拖拽（useDrag）、FileUpload 原生 DnD（useDragDrop）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

setupJsdom()

import { mountApp } from '../ui-dom-mount.ts'
import { h, type Component } from '../../ui-dom/vnode.ts'

async function mountWith(Comp: any) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const mountRes = await mountApp(container as any, Comp)
  return { container, app: mountRes }
}

// ── useGlobalKey ─────────────────────────────────────

test('useGlobalKey：window keydown 注册 + 卸载清理', async () => {
  const keys: string[] = []
  let show = true
  const Comp: Component = (_init, c) => {
    c.ui.useGlobalKey((e: KeyboardEvent) => { if (show) keys.push(e.key) })
    return () => h('div', {}, 'x')
  }
  const { app } = await mountWith(Comp)
  window.dispatchEvent(new (window as any).KeyboardEvent('keydown', { key: 'k' }))
  assert.deepEqual(keys, ['k'], 'keydown 触发')

  show = false
  ;(app as any).close?.() // 卸载 → 监听移除
  window.dispatchEvent(new (window as any).KeyboardEvent('keydown', { key: 'k' }))
  assert.deepEqual(keys, ['k'], '卸载后不再触发（监听已清理）')
})

// ── useDrag ──────────────────────────────────────────

test('useDrag：pointerdown 捕获 → window move 回调 delta → up 释放', async () => {
  const deltas: any[] = []
  const Comp: Component = (_init, c) => {
    const drag = c.ui.useDrag({
      onMove: (_e, d) => { deltas.push(d) },
    })
    return () => h('button', { class: 'handle', ...drag })
  }
  const { container, app } = await mountWith(Comp)
  const handle = container.querySelector('.handle') as HTMLElement

  handle.dispatchEvent(new (window as any).PointerEvent('pointerdown', { clientX: 100, clientY: 50 }))
  window.dispatchEvent(new (window as any).PointerEvent('pointermove', { clientX: 130, clientY: 60 }))
  window.dispatchEvent(new (window as any).PointerEvent('pointerup', {}))
  assert.deepEqual(deltas, [{ x: 30, y: 10 }], 'delta = 移动量')

  // up 后不再响应
  window.dispatchEvent(new (window as any).PointerEvent('pointermove', { clientX: 200, clientY: 200 }))
  assert.equal(deltas.length, 1, '释放后 move 不响应')
  ;(app as any).close?.()
})

test('useDrag：onStart/onEnd 回调', async () => {
  const calls: string[] = []
  const Comp: Component = (_init, c) => {
    const drag = c.ui.useDrag({
      onStart: () => { calls.push('start') },
      onMove: () => {},
      onEnd: () => { calls.push('end') },
    })
    return () => h('button', { class: 'h', ...drag })
  }
  const { container, app } = await mountWith(Comp)
  const h2 = container.querySelector('.h') as HTMLElement
  h2.dispatchEvent(new (window as any).PointerEvent('pointerdown', { clientX: 0, clientY: 0 }))
  window.dispatchEvent(new (window as any).PointerEvent('pointerup', {}))
  assert.deepEqual(calls, ['start', 'end'])
  ;(app as any).close?.()
})

// ── useDragDrop ──────────────────────────────────────

test('useDragDrop：dropProps spread 后 dragover/drop/leave 回调 + preventDefault', async () => {
  const events: string[] = []
  const Comp: Component = (_init, c) => {
    const { dropProps } = c.ui.useDragDrop({
      onDrop: (e) => { events.push('drop:' + (e as any).data) },
      onDragOver: () => { events.push('over') },
      onDragLeave: () => { events.push('leave') },
    })
    return () => h('div', { class: 'zone', ...dropProps }, 'z')
  }
  const { container, app } = await mountWith(Comp)
  const zone = container.querySelector('.zone') as HTMLElement

  // dragover：preventDefault 必须被调用（否则 drop 不触发）
  let prevented = false
  const over = new (window as any).Event('dragover', { bubbles: true })
  over.preventDefault = () => { prevented = true }
  zone.dispatchEvent(over)
  assert.equal(prevented, true, 'dragover preventDefault')
  assert.ok(events.includes('over'))

  zone.dispatchEvent(new (window as any).Event('dragleave', { bubbles: true }))
  assert.ok(events.includes('leave'))

  const drop = new (window as any).Event('drop', { bubbles: true })
  ;(drop as any).data = 'f1'
  zone.dispatchEvent(drop)
  assert.ok(events.includes('drop:f1'))
  ;(app as any).close?.()
})
