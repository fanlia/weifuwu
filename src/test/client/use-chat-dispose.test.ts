/**
 * S2 — useChat 自动 dispose 回归测试
 *
 * 验证组件卸载时 useChat 会话自动 dispose（中止 in-flight 流），
 * 无需组件手动调 $.dispose()。与其他 use* 原语（useMedia/useBreakpoint 等）一致。
 *
 * 用真实 createApp + mock fetch（捕获 AbortSignal）—— exercise mount/unmount 管线。
 */

import { test, afterEach, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

before(setupJsdom)

import { h } from '../../ui-dom/vnode.ts'
import { mountApp } from '../ui-dom-mount.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import type { UseChatHandle } from '../../ui-dom/use-chat.ts'

afterEach(() => {
  document.body.innerHTML = ''
  ;(globalThis as any).fetch = _origFetch
})

const _origFetch = (globalThis as any).fetch

let _idSeq = 0
async function mount(comp: (p: any, ctx: WfuiContext) => any) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const id = `s2-root-${++_idSeq}`
  el.id = id
  const app = await mountApp(el, comp)
  return { app, el }
}

test('组件卸载时 useChat 自动 dispose（中止 in-flight 流）', async () => {
  let capturedSignal: AbortSignal | undefined
  // mock fetch：返回永不 resolve 的流，捕获 signal
  ;(globalThis as any).fetch = async (_url: string, init: any) => {
    capturedSignal = init?.signal
    // 返回一个 pending 的 Response（流不结束）
    return new Response(new ReadableStream({ start() { /* never enqueue */ } }), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  }

  let chat$: UseChatHandle | undefined
  const ChatComp = (_init: any, ctx: WfuiContext) => {
    chat$ = ctx.ui.useChat({ url: '/api/chat' })
    return () => h('div', { id: 'c' }, 'chat')
  }
  // 无状态包裹（模拟典型用法）
  const Root = () => () => h(ChatComp, {})

  const { app } = await mount(Root)
  // 触发一次 send → 启动 aiStream → fetch（signal 已捕获）
  chat$!.input = 'hello'
  chat$!.send()
  await new Promise<void>((r) => setTimeout(r, 10)) // 让 fetch 微任务跑完
  assert.ok(capturedSignal, 'fetch 应被调用并捕获 signal')
  assert.equal(capturedSignal!.aborted, false, '卸载前 signal 未中止')

  ;(app as any).close?.()
  assert.equal(capturedSignal!.aborted, true, '卸载后 useChat 应自动 dispose → signal 中止')
})

test('useChat 仍支持手动 dispose（向后兼容）', async () => {
  let capturedSignal: AbortSignal | undefined
  ;(globalThis as any).fetch = async (_url: string, init: any) => {
    capturedSignal = init?.signal
    return new Response(new ReadableStream({ start() {} }), {
      status: 200, headers: { 'content-type': 'text/event-stream' },
    })
  }

  let chat$: UseChatHandle | undefined
  const ChatComp = (_init: any, ctx: WfuiContext) => {
    chat$ = ctx.ui.useChat({ url: '/api/chat' })
    return () => h('div', { id: 'c' })
  }
  const { app } = await mount(() => () => h(ChatComp, {}))

  chat$!.input = "hi"; chat$!.send()
  await new Promise<void>((r) => setTimeout(r, 5))
  assert.equal(capturedSignal!.aborted, false)

  // 手动 dispose 也应中止
  chat$!.dispose()
  assert.equal(capturedSignal!.aborted, true, '手动 dispose 仍生效')
  ;(app as any).close?.()
})
