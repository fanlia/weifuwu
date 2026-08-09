/**
 * T1 — onComponentUnmount 钩子自退订回归测试
 *
 * 验证组件级 use* 原语的卸载钩子触发后自退订，不随 mount 累积——
 * 长生命周期 SPA 导航多次后 _unmountHooks 数组不无限增长。
 */

import { test, afterEach, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

before(setupJsdom)

import { h } from '../../client/vnode.ts'
import { createApp } from '../../client/app.ts'
import { __testHookCount } from '../../client/registry.ts'
import type { WfuiContext } from '../../client/types.ts'

afterEach(() => {
  document.body.innerHTML = ''
})

async function mountAndDestroy(comp: (p: any, ctx: WfuiContext) => any) {
  const app = createApp()
  const el = document.createElement('div')
  document.body.appendChild(el)
  el.id = 't1-hook'
  await app.mount('#t1-hook', comp)
  app.destroy()
  el.remove()
}

test('各 use* 原语钩子触发后自退订（不随 mount 累积）', async () => {
  const before = __testHookCount()
  const cases: Array<{ name: string; use: (ctx: WfuiContext) => void }> = [
    { name: 'useChat', use: (ctx) => ctx.ui.useChat({ url: '/api/chat' }) },
    { name: 'useMedia', use: (ctx) => ctx.ui.useMedia('(max-width: 1px)', () => {}) },
    { name: 'useGlobalKey', use: (ctx) => ctx.ui.useGlobalKey(() => {}) },
    { name: 'useHoverCapable', use: (ctx) => ctx.ui.useHoverCapable() },
  ]
  for (const { name, use } of cases) {
    for (let i = 0; i < 5; i++) {
      await mountAndDestroy((_init, ctx) => { use(ctx); return () => h('div') })
    }
    assert.equal(__testHookCount(), before, `${name} 钩子 5 次 mount/unmount 后自退订不累积`)
  }
  // 多原语混合
  for (let i = 0; i < 5; i++) {
    await mountAndDestroy((_init, ctx) => {
      ctx.ui.useMedia('(max-width: 1px)', () => {})
      ctx.ui.useGlobalKey(() => {})
      ctx.ui.useHoverCapable()
      return () => h('div')
    })
  }
  assert.equal(__testHookCount(), before, '多原语混合后钩子全部自退订')
})

test('钩子内自退订不破坏同批次其他钩子触发（快照遍历）', async () => {
  // 多个 use* 原语同组件卸载时，各自 unsub 不影响同批次其他钩子
  let refCleaned = false
  const app = createApp()
  const el = document.createElement('div')
  document.body.appendChild(el)
  el.id = 't1-batch'
  await app.mount('#t1-batch', (_init, ctx) => {
    ctx.ui.useMedia('(max-width: 1px)', () => {})
    ctx.ui.useGlobalKey(() => {})
    return () => h('div', { ref: (e: any) => { if (!e) refCleaned = true } })
  })
  app.destroy()
  // 两个原语钩子 + 组件 ref 都应触发（快照遍历防 unsub 错位）
  assert.equal(refCleaned, true, '同批次卸载钩子都应触发')
  el.remove()
})
