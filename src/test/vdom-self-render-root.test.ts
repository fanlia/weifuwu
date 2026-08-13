/**
 * diff 回归：组件在 buildVNode 期间自渲染（renderFn 内 ctx.ui.render()）——
 * 此时 _parentNode/_refNode 皆空，renderOne 不得 fallback 到 rootEl（#root）——
 * 否则整树被 append 到 root 成为 stray 兄弟节点。
 *
 * 根因（components-demo 实测 2026-12）：滚动到底部懒加载「新增批次」分组时，
 * DemoAnchor 的 renderFn 在 build 期间 computeActive → onAnchorChange →
 * ctx.ui.render() → renderOne 的 parent 解析 `_parentNode ?? _refNode?.parentNode
 * ?? opts.rootEl` 落到 rootEl → 锚点树被 append 到 #root（与 .wf-container 并列）。
 * 修复：无挂载点（两者皆空 = 构建中/已移除）→ 跳过渲染（父树渲染会带上最新状态）；
 * 根组件（App）经 _refNode.parentNode（= rootEl）正常定位，无需 fallback。
 */

import { test, before } from 'node:test'
import assert from 'node:assert'
import { h } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/context.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'

before(setupJsdom)

test('build 期间组件自渲染：不得 append 到 rootEl（stray 兄弟节点）', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })

  // 模拟 DemoAnchor：组件 renderFn 在 build 期间触发自身 render（onAnchorChange 同款）——
  // 此时组件未挂载（_parentNode/_refNode 皆空）→ 不得 fallback rootEl。
  // 场景还原：App 初始只渲染 Button；点击后条件渲染 Child（懒加载）——
  // Child 在 build 期间自渲染 → renderOne(childId) 无挂载点（真实事故路径）
  const Child = async (_init: any, c: any) => {
    let fired = false
    return async () => {
      if (!fired) { fired = true; c.ui.render() } // 首次 build 时自触发（DemoAnchor onAnchorChange → ctx.ui.render 同款）
      return h('div', { id: 'child' }, 'child')
    }
  }
  const App = async (_init: any, c: any) => {
    let show = false
    return async () => {
      return h('div', { id: 'app' },
        h('button', { id: 'btn', onClick: () => { show = true; c.ui.render() } }, 'go'),
        show ? h(Child, {}) : null,
      )
    }
  }
  await handle.mount(h(App, {}))
  ;(container.querySelector('#btn') as HTMLElement).click() // 触发懒加载 Child（App 重渲染）
  await new Promise((r) => setTimeout(r, 80))

  assert.equal(container.querySelectorAll('#child').length, 1,
    '组件输出只能有一份——build 期间自渲染不得 append 到 rootEl')
  assert.deepEqual([...container.children].map((n) => n.id), ['app'],
    'root 只能有一个顶层节点（App 输出）——不得出现 stray 兄弟')
})

test('挂载后组件自渲染（有 _parentNode）：正常原地更新', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })

  let count = 0
  const Counter = async (_init: any, c: any) => {
    return async () => {
      count++
      return h('div', { id: 'counter', onClick: () => c.ui.render() }, String(count))
    }
  }
  await handle.mount(h(Counter, {}))
  // 挂载后（_parentNode 已设）触发自渲染——应原地更新而非 append
  ;(container.querySelector('#counter') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 50))

  assert.equal(container.querySelectorAll('#counter').length, 1,
    '挂载后自渲染应原地 patch（不产生第二份）')
  assert.equal(container.querySelector('#counter')?.textContent, '2',
    '挂载后自渲染应更新内容（count=2）')
})
