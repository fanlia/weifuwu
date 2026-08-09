/**
 * ctx.ui.useStableRef — 稳定 ref 引用（P1-2）
 *
 * 内联 ref 陷阱：ref-diff 在 ref 函数引用变化时调用旧 ref(null)——内联 ref
 * 每次渲染都是新函数 → 清理逻辑（退订/removeEventListener/dispose）反复触发，
 * 而非仅在卸载时。useStableRef 在 mount 作用域持有稳定引用，根治该陷阱。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

setupJsdom()

import { h, type Component } from '../../client/vnode.ts'
import { createApp } from '../../client/app.ts'

test('useStableRef：返回的 ref 引用恒定，不随渲染重建', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let refs: any[] = []
  let renders = 0

  const Comp: Component = (_init, c) => {
    const ref = c.ui.useStableRef((el) => { void el })
    refs.push(ref)
    return () => {
      renders++
      return h('div', { id: 'target', ref })
    }
  }

  const app = createApp()
  await app.mount(container as any, Comp as any, {} as any)
  // mount 期间（含 wrapComponent 两次 render）拿到的 ref 都是同一个稳定引用
  assert.equal(refs.length, 1, 'mount 只创建一次稳定 ref')

  // re-render 不重建 ref
  ;(app as any).ctx.ui.render()
  await new Promise(r => setTimeout(r, 10))
  assert.equal(refs.length, 1, 're-render 不创建新 ref（引用恒等）')
  assert.ok(renders >= 2, '确实发生了 re-render')
  ;(app as any).destroy()
})

test('useStableRef：cleanup 只在真正卸载时触发（re-render 不误触）', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const initCalls: any[] = []
  const cleanupCalls: string[] = []

  const Inner: Component = (_init, c) => {
    const ref = c.ui.useStableRef(
      (el) => { initCalls.push(el) },
      () => { cleanupCalls.push('cleanup') },
    )
    return () => h('div', { id: 'target', ref })
  }

  // 闭包变量 + 手动 render（不依赖 $）——lifecycle.test 同模式
  let show = true
  const Outer: Component = (_init, c) => {
    return () => h('div', { class: 'outer' }, show ? h(Inner, {}) : null)
  }

  const app = createApp()
  await app.mount(container as any, Outer as any, {} as any)
  assert.equal(initCalls.length, 1, 'mount 时 init 一次')
  assert.equal(cleanupCalls.length, 0, '初始无 cleanup')

  // re-render（不卸载）：Inner 仍在 → ref 引用恒等，不误触 cleanup
  ;(app as any).ctx.ui.render()
  await new Promise(r => setTimeout(r, 10))
  assert.equal(initCalls.length, 1, 're-render 不重复 init（ref 引用恒等）')
  assert.equal(cleanupCalls.length, 0, 're-render 不触发 cleanup（根治内联 ref 陷阱）')

  // 真正卸载：show=false → Inner 组件树被移除 → callRefCleanup → ref(null)
  show = false
  ;(app as any).ctx.ui.render()
  await new Promise(r => setTimeout(r, 10))
  assert.equal(cleanupCalls.length, 1, '真正卸载时 cleanup 恰好一次')
  ;(app as any).destroy()
})
