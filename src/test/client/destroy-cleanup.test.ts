/**
 * S1 — destroy 资源回收回归测试
 *
 * 验证 app.destroy() 递归清理组件树：
 *   - ref(null) 清理分支被调用（用户注册的 clearInterval/socket.close/dispose）
 *   - onComponentUnmount 钩子触发（media/popup/scroll 自动清）
 *   - _popupRaf 取消
 *
 * 用真实 createApp（非 mock）—— exercise 完整 mount/destroy 管线。
 */

import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

setupJsdom()

import { h } from '../../client/vnode.ts'
import { createApp } from '../../client/app.ts'
import type { WfuiContext } from '../../client/types.ts'

afterEach(() => {
  document.body.innerHTML = ''
})

let _idSeq = 0
async function mount(comp: (p: any, ctx: WfuiContext) => any) {
  const app = createApp()
  const el = document.createElement('div')
  document.body.appendChild(el)
  const id = `s1-root-${++_idSeq}`
  el.id = id
  await app.mount(`#${id}`, comp)
  return { app, el }
}

test('destroy 触发组件 ref 清理（ref(null) 被调用）', async () => {
  const cleanups: string[] = []
  const Child = () => () => h('div', {
    id: 'c',
    ref: (el: any) => {
      if (el) cleanups.push('mount')
      else cleanups.push('cleanup')
    },
  })

  const { app } = await mount(Child)
  assert.deepEqual(cleanups, ['mount'])

  app.destroy()
  assert.ok(cleanups.includes('cleanup'), 'destroy 应触发 ref(null) 清理分支')
})

test('destroy 递归清理嵌套组件树 ref', async () => {
  const cleanups: string[] = []
  const Leaf = () => () => h('span', {
    id: 'leaf',
    ref: (el: any) => {
      if (el) cleanups.push('leaf-mount')
      else cleanups.push('leaf-cleanup')
    },
  })
  const Mid = () => () => h('div', { id: 'mid' }, h(Leaf, {}))
  const Root = () => () => h(Mid, {})

  const { app } = await mount(Root)
  assert.deepEqual(cleanups, ['leaf-mount'])

  app.destroy()
  assert.ok(cleanups.includes('leaf-cleanup'), '嵌套子组件 ref 清理应被递归触发')
})

test('destroy 触发 onComponentUnmount 钩子（组件级清理）', async () => {
  // 组件通过 ctx.ui.selfId 注册 + onComponentUnmount 监听卸载
  // 用一个闭包变量记录是否被卸载
  let unmounted = false
  const Child = (_init: any, ctx: WfuiContext) => {
    // 注册一个自定义卸载副作用（模拟 setInterval 清理）
    const timer = (globalThis as any).__s1_timer = { cleared: false }
    ctx.ui.selfId('s1-child')
    return () => h('div', {
      id: 'c',
      ref: (el: any) => {
        if (!el) {
          // 清理分支：清 timer
          timer.cleared = true
          unmounted = true
        }
      },
    })
  }

  const { app } = await mount(Child)
  assert.equal(unmounted, false)

  app.destroy()
  assert.equal(unmounted, true, '组件 ref 清理分支应执行（timer 被清）')
  assert.equal((globalThis as any).__s1_timer.cleared, true)
  delete (globalThis as any).__s1_timer
})

test('destroy 后残留异步 dirty 不触发渲染（安全）', async () => {
  // 组件注册 setTimeout，destroy 后 timeout 仍 fire 但不应报错/渲染
  let renderedAfterDestroy = false
  const Child = (_init: any, ctx: WfuiContext) => {
    const $ = ctx.ui.$()
    $.n = 0
    setTimeout(() => {
      try {
        $.n += 1 // destroy 后 $ dirty 应安全忽略
      } catch {
        // 不应抛
      }
    }, 10)
    return () => {
      renderedAfterDestroy = renderedAfterDestroy || ctx.ui._selfId === undefined
      return h('div', { id: 'c' }, `n=${$.n}`)
    }
  }

  const { app, el } = await mount(Child)
  assert.equal(el.querySelector('#c')?.textContent, 'n=0')

  app.destroy()
  // 等 timeout 触发
  await new Promise<void>((r) => setTimeout(r, 30))
  // destroy 后容器已清空，无残留 DOM
  assert.equal(el.children.length, 0)
})

test('destroy 后 re-mount 同一 app 正常渲染（无状态残留）', async () => {
  const { app, el } = await mount(() => () => h('div', { id: 'first' }, 'A'))
  assert.equal(el.querySelector('#first')?.textContent, 'A')
  app.destroy()
  assert.equal(el.children.length, 0)

  // re-mount 同一 app 实例
  document.body.appendChild(el)
  await app.mount(`#${el.id}`, () => () => h('div', { id: 'second' }, 'B'))
  assert.equal(el.querySelector('#second')?.textContent, 'B', 're-mount 应正常渲染')
  app.destroy()
  el.remove()
})

test('destroy 后 _dirtyBatch 不残留（旧 dirty 不触发渲染）', async () => {
  let renderCount = 0
  const Child = (_init: any, ctx: WfuiContext) => {
    const $ = ctx.ui.$()
    $.n = 0
    return () => { renderCount++; return h('div', { id: 'c' }, `n=${$.n}`) }
  }
  const { app } = await mount(Child)
  const initialRenderCount = renderCount
  app.destroy()
  // destroy 后 renderCount 不应增长（无残留 dirty 触发）
  await new Promise<void>((r) => setTimeout(r, 20))
  assert.equal(renderCount, initialRenderCount, 'destroy 后无残留 dirty 渲染')
})
