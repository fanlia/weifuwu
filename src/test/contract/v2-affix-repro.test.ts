/**
 * vdom v2 — Affix 核心最小复现（手写组件核心——契约层零浏览器）
 *
 * 用户指示：手写 Affix 核心到测试——复现「scroll 后不固定」——
 * 链：FakeWindow.scrollY 变化 → scroll 事件 dispatch → useScrollPosition
 *   → 段 requestRender → 组件重渲染 → data-fixed 变化
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import { renderV2 } from '../../client/vdom/core/v2/render.ts'
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'

/** FakeWindow（scroll 事件通道——Affix 场景最小） */
class FakeWindow {
  listeners = new Map<string, Array<() => void>>()
  rafs: Array<() => void> = []
  now = 0
  scrollY = 0
  innerHeight = 800
  document = { querySelector: () => null, createElement: () => null }
  addEventListener(type: string, fn: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, [])
    this.listeners.get(type)!.push(fn)
  }
  removeEventListener(type: string, fn: () => void): void {
    const arr = this.listeners.get(type)
    if (arr) { const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1) }
  }
  requestAnimationFrame(cb: () => void): number { this.rafs.push(cb); return this.rafs.length }
  cancelAnimationFrame(): void { this.rafs = [] }
  performance = { now: () => this.now }
  getBoundingClientRect(): { width: number; height: number; top: number; left: number } {
    return { width: 100, height: 50, top: 200 - this.scrollY, left: 0 }
  }
  /** 测试触发滚动 */
  dispatchScroll(): void {
    this.scrollY = 600
    for (const fn of [...(this.listeners.get('scroll') ?? [])]) fn()
  }
}

function collect(o: import('../../client/vdom/observable/index.ts').Observable<Command>): Promise<Command[]> {
  return new Promise((resolve, reject) => {
    const out: Command[] = []
    o.subscribe({ next: (c) => out.push(c), error: reject, complete: () => resolve(out) })
  })
}

/** **Affix 核心手写**（契约层——贴 Affix.ts 的真实逻辑 + FakeWindow） */
test('Affix 核心：scroll 150px → data-fixed=yes（复现——红则修）', async () => {
  const fw = new FakeWindow()
  const browser = { window: fw as never, document: fw.document } as never

  const wrapEl = { getBoundingClientRect: () => fw.getBoundingClientRect() }
  let renders = 0
  let lastFixed = 'no'
  const Comp: any = (_p: any, ctx: any) => {
    // Affix 核心（useScrollPosition + 计算）
    const scroll = ctx.ui.useScrollPosition({ getScroller: () => fw })
    return () => {
      renders++
      // Affix 语义：scrollY >= 文档偏移（200-偏移）→ fixed
      const fixed = scroll.y >= 100 ? 'yes' : 'no'
      lastFixed = fixed
      return h('div', { 'data-fixed': fixed, class: 'wf-affix' }, [
        h('div', { class: 'wf-affix-sentinel' }, '内容'),
      ])
    }
  }

  const segments = new Map<string, never>() as never
  // 段化渲染（hooks 经段 env——browser 注入）
  await collect(renderV2(h(Comp, {}), { render: async () => {}, browser } as never, createComponentRegistry(), segments, () => {
    // 段 requestRender → 真实重渲染（重调 renderFn——读 scroll.y）
    void collect(renderV2(h(Comp, {}), { render: async () => {}, browser } as never, createComponentRegistry(), segments)).then(() => {})
  }))
  assert.equal(lastFixed, 'no', '初始不固定')
  const before = renders
  fw.dispatchScroll() // 滚动 600px（触发 scroll 监听——rAF 排队）
  while (fw.rafs.length) { fw.rafs.splice(0).forEach((r) => r()) } // 执行 rAF（emit）
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(renders > before, `scroll 后必须重渲染（renders ${before} → ${renders}——段回调断链）`)
  assert.equal(lastFixed, 'yes', `scroll 后必须 fixed（实际 ${lastFixed}——Affix 断链复现）`)
})
