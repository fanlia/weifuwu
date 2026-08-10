/**
 * T2 — ref 回调错误隔离回归测试
 *
 * 验证用户 ref 回调抛错时不中断渲染/卸载管线：
 *   - mount ref(el) 抛错 → console.error + 子树继续渲染
 *   - unmount ref(null) 抛错 → 不中断 callRefCleanup 递归
 *
 * 用真实 createApp（非 mock）。
 */

import { test, afterEach, before } from 'node:test'
import assert from 'node:assert/strict'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { setupJsdom } from './setup.ts'

before(setupJsdom)

import { h } from '../../ui-dom/vnode.ts'
import { mountApp } from '../ui-dom-mount.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
const browser = createClientBrowser()

afterEach(() => {
  browser.clearBody()
})

let _idSeq = 0
async function mount(comp: (p: any, ctx: WfuiContext) => any) {
  const el = browser.createElement('div')
  browser.bodyAppend(el)
  el.id = `t2-root-${++_idSeq}`
  const handle = await mountApp(el, comp)
  return { app: handle, el }
}

test('mount ref 抛错不中断子树渲染', async () => {
  const errors: string[] = []
  const origErr = console.error
  console.error = (...a: any[]) => errors.push(a.join(' '))

  try {
    const { el } = await mount(() => () =>
      h('div', { ref: () => { throw new Error('ref boom') } },
        h('span', { id: 'child' }, 'after')
      )
    )
    // 子树应继续渲染（ref 在 appendChild 前触发，但抛错不应阻止后续）
    assert.ok(el.querySelector('#child'), 'ref 抛错后子树仍应渲染')
    assert.ok(errors.some((e) => e.includes('ref boom')), '应 console.error 暴露 ref 错误')
  } finally {
    console.error = origErr
  }
})

test('unmount ref(null) 抛错不中断 callRefCleanup 递归', async () => {
  const errors: string[] = []
  const origErr = console.error
  console.error = (...a: any[]) => errors.push(a.join(' '))

  let secondCleaned = false
  const { app } = await mount(() => () =>
    h('div', {},
      // 第一个组件 ref(null) 抛错
      h('div', { ref: (el: any) => { if (!el) throw new Error('cleanup boom') } }),
      // 第二个组件应仍被清理（递归不中断）
      h('span', { ref: (el: any) => { if (!el) secondCleaned = true } }),
    )
  )

  ;(app as any).close?.()
  assert.ok(errors.some((e) => e.includes('cleanup boom')), '应 console.error 暴露 cleanup 错误')
  assert.equal(secondCleaned, true, '后续组件 ref(null) 仍应被调用（递归不中断）')
})

test('ref 正常工作不被 safeCallRef 影响', async () => {
  let mountCalled = false
  let cleanupCalled = false
  const { app } = await mount(() => () =>
    h('div', { ref: (e: any) => {
      if (e) mountCalled = true
      else cleanupCalled = true
    } }, 'ok')
  )
  assert.equal(mountCalled, true, 'mount ref 正常调用')

  ;(app as any).close?.()
  assert.equal(cleanupCalled, true, 'cleanup ref 正常调用')
})
