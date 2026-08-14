/**
 * hooks 挂载集成测试（mediaRegistry 防线——2026-12 走查暴露的引擎 bug 回归测试）
 *
 * 根因：createPopupTrackerSystem 返回值无 mediaRegistry，mount.ts 用 `as any` 解构
 * 掩盖为 undefined——useMedia/useBreakpoint 在真实挂载场景报
 * `Cannot read properties of undefined (reading 'has')`。组件库测试未覆盖此路径
 * （无组件在挂载上下文调用 useBreakpoint 实测暴露）——layouts-demo /components-demo 走查抓到。
 * 修复：mount.ts 自建 mediaRegistry Map。本测试锁定：完整 vdom 上下文（createVdomContext）
 * 下 useMedia/useBreakpoint 挂载 + 触发不报错。
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { h } from '../ui-dom/vnode.ts'
import { buildVNode } from '../ui-dom/vdom2/build.ts'
import { renderValue } from '../ui-dom/vdom2/render.ts'
import { createVdomContext } from '../ui-dom/context.ts'

before(setupJsdom)

test('useMedia/useBreakpoint 在完整挂载上下文工作（mediaRegistry 防线）', async () => {
  const b = createClientBrowser()
  const root = b.createElement('div')!
  b.bodyAppend(root)

  let bp = ''
  let mediaMatched: boolean | undefined

  const Comp = async (_init: any, ctx: any) => {
    // 与真实组件相同的挂载路径（childCtx.ui = Object.create(rootUi) + makeEnv）
    ctx.ui.useMedia('(min-width: 640px)', (m) => { mediaMatched = m })
    ctx.ui.useBreakpoint({ mobile: '(max-width: 639px)', desktop: '(min-width: 640px)' }, (vp: string) => { bp = vp })
    return async () => h('div', { id: 'hook-comp' }, `bp:${bp} media:${mediaMatched}`)
  }

  const { ctx, registry } = createVdomContext({ browser: b, root })
  const v = h(Comp, {})
  await buildVNode(v, ctx, undefined, registry)   // 挂载（此前报 mediaRegistry.has 错误）
  const node = renderValue(v as any, ctx, b)
  root.appendChild(node)

  assert.ok(bp, `useBreakpoint 回调应已触发（当前: "${bp}"）`)
  assert.notEqual(mediaMatched, undefined, 'useMedia 回调应已触发（jsdom matchMedia stub 恒 false——不依赖匹配结果，只验证挂载/触发链路）')
  const el = root.querySelector('#hook-comp')!
  assert.match(el.textContent ?? '', /bp:/, '渲染输出含 breakpoint 值')
})
