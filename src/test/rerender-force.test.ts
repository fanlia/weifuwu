/**
 * mountRoot.rerender() force 透传——native/Fragment 层递归丢 opts 的独立 bug
 *
 * 真实 bug（2026-12 探针定位）：buildVNode 的 native/Fragment 分支递归 children 时
 * 不传 opts——rerender({ force: true }) 在 native 层丢失 → 数组分支收到 opts=undefined
 * → 嵌套组件剪枝命中（props 同 + 版本同）→ renderFn 不重跑 → 内部状态变化不刷新。
 *
 * rerender 语义 = 整树强制重建（读最新内部状态）——force 必须贯穿全树。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/context.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'

before(setupJsdom)

test('rerender()：native 层嵌套组件内部状态变化被感知（force 贯穿全树）', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })
  const Comp = async (_init: any) => {
    let n = 0
    return () => {
      n++
      return h('span', { id: 'n' }, String(n))
    }
  }
  // 根是 native div（rerender 时 native 分支丢 force——bug 触发路径）
  await handle.mount(h('div', {}, h(Comp, {})))
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(container.querySelector('#n')?.textContent, '1', '首帧 n=1')

  await handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  // 修复前：剪枝命中（props 同）→ renderFn 不重跑 → n 仍 1；修复后：force → n=2
  assert.equal(container.querySelector('#n')?.textContent, '2', 'rerender 后 n=2（force 贯穿 native 层）')

  await handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(container.querySelector('#n')?.textContent, '3', 'rerender 后 n=3')
  handle.close?.()
  container.remove()
})

test('rerender()：Fragment 内嵌套组件同样被感知', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })
  const Comp = async (_init: any) => {
    let n = 0
    return () => {
      n++
      return h('span', { id: 'f', class: 'inner' }, String(n))
    }
  }
  await handle.mount(h('div', {}, h(Fragment as any, {}, h(Comp, {}))))
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(container.querySelector('#f')?.textContent, '1')
  await handle.rerender()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(container.querySelector('#f')?.textContent, '2', 'Fragment 层 force 贯穿')
  handle.close?.()
  container.remove()
})
