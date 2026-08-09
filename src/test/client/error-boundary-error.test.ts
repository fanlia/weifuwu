/**
 * T3 — ErrorBoundary 错误路径回归测试（真实 createApp 管线）
 *
 * 现有 error-boundary.test.ts 用 mock ctx（render no-op），只验证「无 fallback→null」，
 * 未覆盖核心「子组件 render 抛错 → ErrorBoundary 重渲染显示 fallback」。本测试用真实
 * createApp 验证完整错误恢复路径。
 */

import { test, afterEach, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

before(setupJsdom)

import { h, jsx } from '../../client/vnode.ts'
import { createApp } from '../../client/app.ts'
import { ErrorBoundary } from '../../client/error-boundary.ts'
import type { WfuiContext } from '../../client/types.ts'

afterEach(() => {
  document.body.innerHTML = ''
})

let _idSeq = 0
async function mount(comp: (p: any, ctx: WfuiContext) => any) {
  const app = createApp()
  const el = document.createElement('div')
  document.body.appendChild(el)
  const id = `t3-root-${++_idSeq}`
  el.id = id
  await app.mount(`#${id}`, comp)
  return { app, el }
}

function flushMicrotasks() {
  return new Promise<void>((r) => queueMicrotask(() => r()))
}

test('子组件 render 抛错 → ErrorBoundary 显示静态 fallback', async () => {
  const ThrowCmp = () => () => { throw new Error('render boom') }
  const { el } = await mount(() => () =>
    h(ErrorBoundary, { fallback: h('p', { id: 'fb' }, '出错了') }, h(ThrowCmp, {}))
  )
  await flushMicrotasks()
  // 抛错后 ErrorBoundary 应显示 fallback 而非白屏
  assert.ok(el.querySelector('#fb'), '应渲染 fallback')
  assert.equal(el.querySelector('#fb')?.textContent, '出错了')
})

test('子组件 render 抛错 → fallback 函数形式（接收 error）', async () => {
  const ThrowCmp = () => () => { throw new Error('specific boom') }
  const { el } = await mount(() => () =>
    h(ErrorBoundary, {
      fallback: ({ error }: { error: unknown }) => h('div', { id: 'fb-fn' }, `err: ${(error as Error).message}`),
    }, h(ThrowCmp, {}))
  )
  await flushMicrotasks()
  assert.ok(el.querySelector('#fb-fn'), '应渲染函数式 fallback')
  assert.equal(el.querySelector('#fb-fn')?.textContent, 'err: specific boom')
})

test('正常子组件不触发 fallback', async () => {
  const OK = () => () => h('span', { id: 'ok' }, 'content')
  const { el } = await mount(() => () =>
    h(ErrorBoundary, { fallback: h('p', { id: 'fb' }, '出错了') }, h(OK, {}))
  )
  await flushMicrotasks()
  assert.ok(el.querySelector('#ok'), '正常子组件应渲染')
  assert.ok(!el.querySelector('#fb'), '不应渲染 fallback')
})

test('嵌套 ErrorBoundary：内层抛错被内层捕获', async () => {
  const ThrowCmp = () => () => { throw new Error('inner boom') }
  const { el } = await mount(() => () =>
    h(ErrorBoundary, { fallback: h('p', { id: 'outer-fb' }, 'outer') },
      h(ErrorBoundary, { fallback: h('p', { id: 'inner-fb' }, 'inner') },
        h(ThrowCmp, {})))
  )
  await flushMicrotasks()
  assert.ok(el.querySelector('#inner-fb'), '内层 ErrorBoundary 捕获')
  assert.ok(!el.querySelector('#outer-fb'), '外层不应触发')
})
