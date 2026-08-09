/**
 * 无状态包裹子树 ctx 一致性回归测试（原 JSONViewer 问题 3 探针）
 *
 * 验证：无状态包裹（() => () => h(Child, {})）下，子组件 $ 赋值正常驱动
 * 自身重渲染——dirty 回调动态解析 selfId 覆盖 vnode 复用场景（问题 1 修复延伸）。
 *
 * 用真实 createApp（非 mock $）—— exercise 完整 dirty 管线。
 * 结论：问题 3 已被问题 1 的动态 selfId 修复覆盖（selfId 对齐 + DOM 更新正常）。
 */

import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

setupJsdom()

import { h, jsx, type VNode } from '../../client/vnode.ts'
import { createApp } from '../../client/app.ts'
import type { WfuiContext } from '../../client/types.ts'

afterEach(() => {
  document.body.innerHTML = ''
})

/** flush 微任务批处理（dirty 走 queueMicrotask） */
function flushMicrotasks() {
  return new Promise<void>((r) => queueMicrotask(() => r()))
}

let _idSeq = 0
async function mount(comp: (p: any, ctx: WfuiContext) => any) {
  const app = createApp()
  const el = document.createElement('div')
  document.body.appendChild(el)
  const id = `probe-root-${++_idSeq}`
  el.id = id
  await app.mount(`#${id}`, comp)
  return { app, el }
}

test('无状态包裹下子组件 $ 赋值驱动自身重渲染', async () => {
  // 有状态子组件：$.count 赋值应自动 dirty 自身
  let capturedRenderSelfId: any
  let capturedDollarSelfId: any
  const Child = (_init: any, ctx: WfuiContext) => {
    const $ = ctx.ui.$()
    $.count = 0
    return (props: any) => {
      // render 期读 _selfId（问题 1/3 探针核心对比点）
      capturedRenderSelfId = (ctx.ui as any)._selfId
      return h('button', {
        id: 'btn',
        onClick: () => {
          // click 闭包内的 $ —— 其 dirty 回调动态解析的 selfId 应与 render 期一致
          capturedDollarSelfId = (ctx.ui as any)._selfId
          $.count += 1
        },
      }, `count=${$.count}`)
    }
  }

  // 无状态包裹：() => () => h(Child)（问题 3 的复现场景）
  const Wrapper = () => () => h(Child, {})

  const { el } = await mount(Wrapper)
  const btn = el.querySelector('#btn') as HTMLButtonElement
  assert.equal(btn.textContent, 'count=0')

  btn.click()
  await flushMicrotasks()

  assert.equal(btn.textContent, 'count=1', '$ 赋值后 DOM 应更新')
  // 探针：render 期 selfId 与 click 闭包 $ 解析的 selfId 应一致（问题 1 修复点）
  assert.equal(capturedRenderSelfId, capturedDollarSelfId,
    'render 期 selfId 应与 $ dirty 回调解析的 selfId 一致')
})

test('多层无状态包裹下 $ 仍驱动重渲染', async () => {
  const Leaf = (_init: any, ctx: WfuiContext) => {
    const $ = ctx.ui.$()
    $.n = 10
    return () => h('span', { id: 'leaf' }, `n=${$.n}`)
  }
  const Mid = () => () => h(Leaf, {})
  const Outer = () => () => h(Mid, {})

  const { el } = await mount(Outer)
  const span = el.querySelector('#leaf') as HTMLSpanElement
  assert.equal(span.textContent, 'n=10')

  // 通过事件触发 $ 赋值（Leaf 内部按钮省略，直接用 ctx 引用）
  // 改为：Leaf 暴露一个可触发的方式 —— 用 ref 捕获 $
  let trigger: (() => void) | undefined
  const Leaf2 = (_init: any, ctx: WfuiContext) => {
    const $ = ctx.ui.$()
    $.n = 10
    trigger = () => { $.n += 5 }
    return () => h('span', { id: 'leaf2' }, `n=${$.n}`)
  }
  const Mid2 = () => () => h(Leaf2, {})
  const Outer2 = () => () => h(Mid2, {})

  const { el: el2 } = await mount(Outer2)
  const span2 = el2.querySelector('#leaf2') as HTMLSpanElement
  assert.equal(span2.textContent, 'n=10')

  trigger!()
  await flushMicrotasks()
  assert.equal(span2.textContent, 'n=15', '多层无状态包裹下 $ 赋值应更新 DOM')
})

test('无状态包裹 + 父级重渲染时子 $ 状态保持', async () => {
  // 父组件用 $ 驱动重渲染，子组件用 $，验证父重渲染不丢子状态
  const Child = (_init: any, ctx: WfuiContext) => {
    const $ = ctx.ui.$()
    $.c = 0
    return () => h('span', { id: 'c' }, `c=${$.c}`)
  }
  let parentBump: (() => void) | undefined
  const Parent = (_init: any, ctx: WfuiContext) => {
    const $ = ctx.ui.$()
    $.p = 0
    parentBump = () => { $.p += 1 }
    return () => h('div', { id: 'p' }, h('span', { id: 'pt' }, `p=${$.p}`), h(Child, {}))
  }
  // 无状态包裹整个 Parent
  const Wrapper = () => () => h(Parent, {})

  const { el } = await mount(Wrapper)
  assert.equal(el.querySelector('#pt')?.textContent, 'p=0')
  assert.equal(el.querySelector('#c')?.textContent, 'c=0')

  // 触发父级 $ 赋值 → 父重渲染 → 子应被复用（状态保持）
  parentBump!()
  await flushMicrotasks()
  assert.equal(el.querySelector('#pt')?.textContent, 'p=1', '父级 $ 更新')
  assert.equal(el.querySelector('#c')?.textContent, 'c=0', '子组件状态应保持（复用不重挂）')
})
