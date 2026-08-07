/**
 * P3 生命周期资源回收 — 组件卸载时退订 media/breakpoint listener、清理 popup tracker
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

setupJsdom()

// jsdom 的 matchMedia 需可 spy 版本（记录 add/removeEventListener 调用）
function installSpyMatchMedia() {
  const calls: Array<{ op: 'add' | 'remove'; query: string }> = []
  const spy = (query: string) => {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_t: string) => { calls.push({ op: 'add', query }) },
      removeEventListener: (_t: string) => { calls.push({ op: 'remove', query }) },
      dispatchEvent: () => false,
    }
  }
  ;(globalThis as any).matchMedia = spy
  ;(window as any).matchMedia = spy
  return calls
}

import { h, type VNode } from '../../client/vnode.ts'
import { createApp } from '../../client/app.ts'
import { callRefCleanup, onComponentUnmount } from '../../client/registry.ts'

test('onComponentUnmount 钩子在 callRefCleanup 注销 _id 时触发（含 _customId）', () => {
  const fired: string[] = []
  const hook = (id: string) => fired.push(id)
  onComponentUnmount(hook)

  const v = { type: 'div', props: {}, _id: '_wf_999', _customId: 'my-id' } as unknown as VNode
  callRefCleanup(v)
  assert.ok(fired.includes('_wf_999'), '钩子应收到 _id')
  assert.ok(fired.includes('my-id'), '钩子应收到 _customId')
})

test('useMedia 组件卸载后 mql listener 被退订', async () => {
  const calls = installSpyMatchMedia()

  const MediaComp: any = (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    ctx.ui.useMedia('(max-width: 640px)', (v: boolean) => { $.isMobile = v })
    return () => h('div', { class: 'media-comp' }, 'M')
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp()
  await app.mount(container as any, MediaComp, {} as any)

  const addCalls = calls.filter(c => c.op === 'add' && c.query === '(max-width: 640px)')
  assert.equal(addCalls.length, 1, 'mount 应注册一个 change listener')

  ;(app as any).destroy()

  const removeCalls = calls.filter(c => c.op === 'remove' && c.query === '(max-width: 640px)')
  assert.ok(removeCalls.length >= 1, 'destroy 应退订 change listener')
})

test('useBreakpoint 组件卸载后全部断点 listener 被退订', async () => {
  const calls = installSpyMatchMedia()

  const BpComp: any = (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    ctx.ui.useBreakpoint({ narrow: '(max-width: 480px)', wide: '(min-width: 1200px)' }, (vp: string) => { $.vp = vp })
    return () => h('div', { class: 'bp-comp' }, 'B')
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp()
  await app.mount(container as any, BpComp, {} as any)

  const bpQueries = ['(max-width: 480px)', '(min-width: 1200px)']
  const added = calls.filter(c => c.op === 'add' && bpQueries.includes(c.query))
  assert.equal(added.length, 2, '两个断点各注册一个 listener')

  ;(app as any).destroy()

  const removed = calls.filter(c => c.op === 'remove' && bpQueries.includes(c.query))
  assert.equal(removed.length, 2, '两个断点 listener 都被退订')
})

test('组件内卸载（非 destroy）也会退订 media listener', async () => {
  const calls = installSpyMatchMedia()

  const Inner: any = (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    ctx.ui.useMedia('(min-width: 900px)', (v: boolean) => { $.wide = v })
    return () => h('span', { class: 'inner' }, 'I')
  }
  let show = true
  const Outer: any = (_init: any, ctx: any) => {
    return () => h('div', { class: 'outer' }, show ? h(Inner, {}) : null)
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp()
  await app.mount(container as any, Outer, {} as any)

  const query = '(min-width: 900px)'
  assert.equal(calls.filter(c => c.op === 'add' && c.query === query).length, 1)

  // 父组件重渲染移除 Inner → 卸载钩子退订
  show = false
  ;(app as any).ctx.ui.render()

  const removes = calls.filter(c => c.op === 'remove' && c.query === query)
  assert.ok(removes.length >= 1, '组件树内卸载应退订 listener')
})
