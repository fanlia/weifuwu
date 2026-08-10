/**
 * ctx.ui.useReducedMotion / useAnimationEnd / useTween — 动画基础设施（P-动画）
 *
 * useReducedMotion：响应式系统偏好（JS 动画侧跳过用）；
 * useAnimationEnd：元素动画完成回调（入场 settle / 退场判断）；
 * useTween：数值补间（count-up/进度，reduced-motion 直落终值）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { setupJsdom } from './setup.ts'

setupJsdom()

import { mountApp } from '../ui-dom-mount.ts'
import { h, type Component } from '../../ui-dom/vnode.ts'
const browser = createClientBrowser()

// ── useReducedMotion ────────────────────────────────

test('useReducedMotion：返回系统偏好（matchMedia 判定）', async () => {
  let query = '(prefers-reduced-motion: reduce)'
  const mql = { matches: true, addEventListener: () => {}, removeEventListener: () => {} }
  ;(window as any).matchMedia = (q: string) => (q === query ? mql : { matches: false, addEventListener: () => {}, removeEventListener: () => {} })

  let rm: any = null
  const Comp: Component = (_init, c) => {
    rm = c.ui.useReducedMotion()
    return () => h('div', {}, 'x')
  }
  const container = browser.createElement('div')
  browser.bodyAppend(container)
  const mountRes = await mountApp(container as any, Comp)
  assert.equal(rm, true, 'reduced-motion 开启 → true')
  ;(mountRes as any).close?.()
})

// ── useAnimationEnd ──────────────────────────────────

test('useAnimationEnd：stableRef 挂载绑定 animationend，卸载清理', async () => {
  const calls: string[] = []
  let settleRef: any = null
  const Comp: Component = (_init, c) => {
    settleRef = c.ui.useAnimationEnd(() => { calls.push('anim-end') }, { once: true })
    return () => h('div', { class: 'panel', ref: settleRef }, 'p')
  }
  const container = browser.createElement('div')
  browser.bodyAppend(container)
  const mountRes = await mountApp(container as any, Comp)

  const panel = container.querySelector('.panel') as HTMLElement
  panel.dispatchEvent(new (window as any).Event('animationend'))
  assert.deepEqual(calls, ['anim-end'], '动画结束触发回调')

  // once：第二次不触发
  panel.dispatchEvent(new (window as any).Event('animationend'))
  assert.deepEqual(calls, ['anim-end'], 'once 后不重复')
  ;(mountRes as any).close?.()
})

test('useAnimationEnd：常驻模式（无 once）可多次触发 + 卸载后不触发', async () => {
  const calls: string[] = []
  let settleRef: any = null
  const Comp: Component = (_init, c) => {
    settleRef = c.ui.useAnimationEnd(() => { calls.push('e') })
    return () => h('div', { class: 'panel', ref: settleRef }, 'p')
  }
  const container = browser.createElement('div')
  browser.bodyAppend(container)
  const mountRes = await mountApp(container as any, Comp)

  const panel = container.querySelector('.panel') as HTMLElement
  panel.dispatchEvent(new (window as any).Event('animationend'))
  panel.dispatchEvent(new (window as any).Event('animationend'))
  assert.equal(calls.length, 2, '常驻可多次触发')

  // 卸载 → ref(null) 清理（ref 契约由渲染器保证；destroy 走 innerHTML 不走 ref）
  settleRef(null)
  panel.dispatchEvent(new (window as any).Event('animationend'))
  assert.equal(calls.length, 2, '卸载后不再触发（监听已清理）')
  ;(mountRes as any).close?.()
})

// ── useTween ────────────────────────────────────────

test('useTween：目标值驱动补间，reduced-motion 直落终值', async () => {
  ;(window as any).matchMedia = (q: string) => ({ matches: q.includes('reduced-motion'), addEventListener: () => {}, removeEventListener: () => {} })
  let tween: any = null
  const Comp: Component = (_init, c) => {
    tween = c.ui.useTween(42, { duration: 300 })
    return () => h('div', {}, String(tween.value))
  }
  const container = browser.createElement('div')
  browser.bodyAppend(container)
  const mountRes = await mountApp(container as any, Comp)
  // reduced-motion → 直落终值（无 rAF 等待）
  await new Promise(r => setTimeout(r, 10))
  assert.equal(tween.value, 42, 'reduced-motion 直落终值')
  ;(mountRes as any).close?.()
})
