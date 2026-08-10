/**
 * ctx.ui.useChat 测试 — 会话语义状态机（TDD：协议层改动先写测试）
 *
 * 单元层：脚本化 transport 注入（确定性事件序列），验证聚合逻辑：
 *   token 累积 / 工具调用内嵌（toolCallId 关联）/ HITL 审批 / error 恢复 / stop / retry
 * 集成层：wire-fake HTTP 服务器（wf: SSE）+ createApp 挂载 → DOM 断言全链路
 *
 * 不 mock 网络层（CS-04 精神）：fetch 走真实 HTTP。
 */

import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { createServer, type Server } from 'node:http'
import { createReactiveState } from '../../ui-dom/reactive.ts'
import { createChatSession, toChatMessages, type ChatTransport, type UseChatOptions, type UiMessage, type ChatApi } from '../../ui-dom/use-chat.ts'
import type { WfStreamEvent, WfApprovalRequest, WfToolCall, WfError } from '../../ai/types.ts'
import type { AiStreamCallbacks } from '../../ui-dom/ai.ts'

before(setupJsdom)

// ── 脚本化 transport（确定性事件注入，不碰网络）─────────────

const ev = (name: string, data: unknown): [string, unknown] => [name, data]

function dispatch(name: string, data: unknown, cbs: AiStreamCallbacks): void {
  switch (name) {
    case 'wf:token': return cbs.onToken?.((data as { text: string }).text)
    case 'wf:tool_call': return cbs.onToolCall?.(data as WfToolCall)
    case 'wf:tool_progress': return cbs.onToolProgress?.(data as any)
    case 'wf:tool_result': return cbs.onToolResult?.(data as any)
    case 'wf:approval_request': return cbs.onApproval?.(data as WfApprovalRequest)
    case 'wf:usage': return cbs.onUsage?.(data as any)
    case 'wf:step': return cbs.onStep?.(data as any)
    case 'wf:done': return cbs.onDone?.(data as any)
    case 'wf:error': return cbs.onError?.(data as WfError)
    default: return cbs.onEvent?.(name, data)
  }
}

interface FakeTransport {
  transport: ChatTransport
  calls: Array<{ url: string; body: unknown }>
  isAborted: () => boolean
  play: (events: Array<[string, unknown]>) => void
  lastBody: () => unknown
}

function fakeTransport(): FakeTransport {
  let cbs: AiStreamCallbacks = {}
  let aborted = false
  let n = 0
  const calls: Array<{ url: string; body: unknown }> = []
  const transport: ChatTransport = (url, body, callbacks) => {
    calls.push({ url, body })
    cbs = callbacks
    return {
      abort: () => { aborted = true },
      done: Promise.resolve(),
      traceId: `t-${++n}`,
      events: [],
    }
  }
  return {
    transport,
    calls,
    isAborted: () => aborted,
    lastBody: () => calls[calls.length - 1]?.body,
    play: (events) => { for (const [n, d] of events) dispatch(n, d, cbs) },
  }
}

function makeSession(opts: Partial<UseChatOptions> & { url?: string }, transport?: ChatTransport): { state: any; api: ChatApi; fake: FakeTransport } {
  const state = createReactiveState(() => {})
  const fake = fakeTransport()
  const api = createChatSession(state, transport ?? fake.transport, { url: '/api/chat', ...opts })
  return { state, api, fake }
}

const done = (content = '') => ev('wf:done', { content, usage: { prompt_tokens: 5, completion_tokens: 3 } })

// ── 单元：会话语义状态机 ────────────────────────────────────

describe('useChat — send / token 累积', () => {
  it('send：追加 user+assistant 占位，默认请求体为 provider 形状，traceId 作为 assistant.id', () => {
    const { state, api, fake } = makeSession({})
    state.input = '你好'
    api.send()

    const msgs = state.messages as UiMessage[]
    assert.equal(msgs.length, 2)
    assert.equal(msgs[0].role, 'user')
    assert.equal(msgs[0].content, '你好')
    assert.equal(msgs[0].status, 'done')
    assert.equal(msgs[1].role, 'assistant')
    assert.equal(msgs[1].content, '')
    assert.equal(msgs[1].status, 'streaming')
    assert.equal(msgs[1].id, 't-1')                      // traceId → assistant.id（协议 §7）
    assert.equal(state.streaming, true)
    assert.equal(state.input, '')                        // 发送后清空输入

    const body = fake.lastBody() as { messages: Array<{ role: string; content: string }> }
    assert.equal(body.messages[0].role, 'user')
    assert.equal(body.messages[0].content, '你好')
    assert.equal('status' in body.messages[0], false)    // UI 字段不进请求体
  })

  it('token 事件就地累积到最后一条 assistant（不重建数组）', () => {
    const { state, api, fake } = makeSession({})
    state.input = 'hi'
    api.send()
    const msgs = () => state.messages as UiMessage[]
    const last = () => msgs()[msgs().length - 1]
    const ref = last()

    fake.play([ev('wf:token', { text: '你' }), ev('wf:token', { text: '好' }), done('你好')])
    assert.equal(last().content, '你好')
    assert.equal(last().status, 'done')
    assert.equal(state.streaming, false)
    assert.equal(last(), ref)                            // 同一对象引用 → VDOM 只 patch 文本节点
  })

  it('空输入 / streaming 期间 send() no-op', () => {
    const { state, api, fake } = makeSession({})
    api.send()                                            // 空输入
    assert.equal((state.messages as UiMessage[]).length, 0)

    state.input = 'a'
    api.send()
    fake.play([ev('wf:token', { text: 'x' })])
    const count = (state.messages as UiMessage[]).length
    state.input = 'b'
    api.send()                                            // streaming 中
    assert.equal((state.messages as UiMessage[]).length, count)
  })
})

describe('useChat — 工具调用内嵌', () => {
  it('tool_call → running 卡片；progress 按 toolCallId 更新；result 按 id 定终态', () => {
    const { state, api, fake } = makeSession({})
    state.input = '查天气'
    api.send()
    fake.play([
      ev('wf:tool_call', { id: 'tc_1', name: 'query_weather', args: { city: '北京' } }),
      ev('wf:tool_progress', { toolCallId: 'tc_1', step: 1, total: 2, message: '查询 北京…', status: 'running' }),
      ev('wf:tool_result', { id: 'tc_1', ok: true, output: { temp: 25 } }),
      ev('wf:token', { text: '北京 25°C' }),
      done('北京 25°C'),
    ])

    const msg = (state.messages as UiMessage[])[1]
    assert.equal(msg.toolCalls!.length, 1)
    const tc = msg.toolCalls![0]
    assert.equal(tc.call.name, 'query_weather')
    assert.equal(tc.status, 'ok')
    assert.equal(tc.progress!.message, '查询 北京…')
    assert.deepEqual(tc.result!.output, { temp: 25 })
    assert.equal(msg.content, '北京 25°C')
  })

  it('并行多工具按 toolCallId / id 关联，互不串线', () => {
    const { state, api, fake } = makeSession({})
    state.input = '并行'
    api.send()
    fake.play([
      ev('wf:tool_call', { id: 'tc_a', name: 'tool_a', args: {} }),
      ev('wf:tool_call', { id: 'tc_b', name: 'tool_b', args: {} }),
      ev('wf:tool_progress', { toolCallId: 'tc_b', step: 1, total: 1, message: 'b', status: 'running' }),
      ev('wf:tool_result', { id: 'tc_a', ok: true, output: 'A' }),
      ev('wf:tool_result', { id: 'tc_b', ok: false, error: { code: 'tool_error', message: 'boom' } }),
      done(),
    ])
    const toolCalls = (state.messages as UiMessage[])[1].toolCalls!
    assert.equal(toolCalls.length, 2)
    assert.equal(toolCalls[0].status, 'ok')               // a：无 progress，result ok
    assert.equal(toolCalls[0].progress, undefined)
    assert.equal(toolCalls[1].status, 'error')            // b：progress + error result
    assert.equal(toolCalls[1].progress!.message, 'b')
    assert.equal(toolCalls[1].result!.error!.code, 'tool_error')
  })

  it('HITL：approval 挂到消息，approve(decision, note) 清卡片 + POST approveUrl', async () => {
    let posted: unknown = null
    const server: Server = createServer(async (req, res) => {
      let raw = ''
      for await (const c of req) raw += c
      posted = JSON.parse(raw)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as { port: number }

    try {
      const { state, api, fake } = makeSession({ approveUrl: `http://127.0.0.1:${port}/approve` })
      state.input = '下单'
      api.send()
      fake.play([
        ev('wf:tool_call', { id: 'tc_1', name: 'create_order', args: { qty: 2 } }),
        ev('wf:approval_request', { id: 'ap_1', toolCallId: 'tc_1', name: 'create_order', args: { qty: 2 }, reason: '确认下单' }),
      ])

      const msg = (state.messages as UiMessage[])[1]
      assert.equal(msg.approval!.name, 'create_order')
      assert.equal(msg.approval!.toolCallId, 'tc_1')

      await api.approve('approved', '用户同意')
      assert.equal(msg.approval, undefined)              // 卡片清除
      assert.deepEqual(posted, { id: 'ap_1', decision: 'approved', note: '用户同意' })

      // 审批后工具结果照常定终态
      fake.play([
        ev('wf:tool_result', { id: 'tc_1', ok: true, output: 'ok' }),
        done('已下单'),
      ])
      assert.equal(msg.toolCalls![0].status, 'ok')
    } finally {
      await new Promise((r) => server.close(() => r()))
    }
  })
})

describe('useChat — error 恢复 / stop / retry / clear', () => {
  it('wf:error → 消息 error 终态 + $.error 结构化；retry() 截断到最后 user 重发', () => {
    const { state, api, fake } = makeSession({})
    state.input = '重试我'
    api.send()
    fake.play([ev('wf:error', { code: 'rate_limited', message: 'too fast' })])
    assert.equal((state.messages as UiMessage[])[1].status, 'error')
    assert.equal(state.error!.code, 'rate_limited')
    assert.equal(state.streaming, false)

    api.retry()
    assert.equal((state.messages as UiMessage[]).length, 2)   // 截断失败消息，重发占位
    assert.equal((state.messages as UiMessage[])[0].content, '重试我')
    assert.equal((state.messages as UiMessage[])[1].status, 'streaming')
    assert.equal(state.error, null)

    fake.play([ev('wf:token', { text: 'ok' }), done('ok')])
    assert.equal((state.messages as UiMessage[])[1].content, 'ok')
    assert.equal(fake.calls.length, 2)                        // 第二次请求
  })

  it('stop：abort + 空占位移除（保留 user 消息）', () => {
    const { state, api, fake } = makeSession({})
    state.input = '停'
    api.send()
    api.stop()
    assert.equal(fake.isAborted(), true)
    assert.equal(state.streaming, false)
    const msgs = state.messages as UiMessage[]
    assert.equal(msgs.length, 1)                              // assistant 空占位已移除
    assert.equal(msgs[0].role, 'user')
  })

  it('stop 时已有部分内容 → 保留消息标记 done', () => {
    const { state, api, fake } = makeSession({})
    state.input = '停'
    api.send()
    fake.play([ev('wf:token', { text: '部分' })])
    api.stop()
    const last = (state.messages as UiMessage[])[1]
    assert.equal(last.content, '部分')
    assert.equal(last.status, 'done')
    assert.equal(state.streaming, false)
  })

  it('clear：清空全部会话状态并中止', () => {
    const { state, api, fake } = makeSession({})
    state.input = 'x'
    api.send()
    fake.play([ev('wf:token', { text: 'y' })])
    api.clear()
    assert.equal(fake.isAborted(), true)
    assert.equal((state.messages as UiMessage[]).length, 0)
    assert.equal(state.streaming, false)
    assert.equal(state.input, '')
    assert.equal(state.error, null)
    assert.equal(state.usage, null)
  })

  it('usage / step 透传', () => {
    const { state, api, fake } = makeSession({})
    state.input = 'u'
    api.send()
    fake.play([
      ev('wf:step', { type: 'llm' }),
      ev('wf:usage', { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }),
    ])
    assert.equal(state.step!.type, 'llm')
    assert.equal((state.messages as UiMessage[])[1].usage!.total_tokens, 3)
    fake.play([done()])
    assert.equal(state.step, null)                            // done 后清 step
  })

  it('initialMessages 种子初始化', () => {
    const initial: UiMessage[] = [{ id: 'u1', role: 'user', content: '历史', status: 'done' }]
    const { state, api } = makeSession({ initialMessages: initial })
    assert.equal((state.messages as UiMessage[]).length, 1)
    assert.equal((state.messages as UiMessage[])[0].content, '历史')
    // 种子不因 retry/send 而重复
    state.input = '新'
    api.send()
    assert.equal((state.messages as UiMessage[]).length, 3)
  })

  it('__watch：订阅状态变更（多消费者），退订后不再通知', () => {
    const { state, api } = makeSession({})
    let fired = 0
    const unsub = (state as any).__watch(() => { fired++ })
    state.input = 'a'
    assert.equal(fired, 1)
    api.send()
    const afterSend = fired
    assert.ok(afterSend >= 3, `send 应多次触发订阅（input 清空 + messages push + streaming），实际 ${afterSend}`)
    unsub()
    state.input = 'b'
    assert.equal(fired, afterSend) // 退订后不再通知
  })
})

describe('useChat — 请求体定制', () => {
  it('body() 覆盖默认请求体（agent 模式携带 mode）', () => {
    let mode = 'agent'
    const { state, api, fake } = makeSession({ body: (msgs) => ({ messages: toChatMessages(msgs), mode }) })
    state.input = 'hi'
    api.send()
    const body = fake.lastBody() as { mode: string; messages: unknown[] }
    assert.equal(body.mode, 'agent')
    assert.equal((body.messages[0] as any).role, 'user')
  })
})

// ── 集成：wire-fake HTTP 服务器 + createApp 全链路 ─────────

describe('useChat — 集成（真实 HTTP wf: 流 → createApp → DOM）', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('挂载组件：输入 → send → 流式 token 渲染到 DOM，streaming 状态切换', async () => {
    const server: Server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write('event: wf:message_start\ndata: {"id":"m1"}\n\n')
      res.write('event: wf:token\ndata: {"text":"你"}\n\n')
      res.write('event: wf:token\ndata: {"text":"好"}\n\n')
      res.write('event: wf:done\ndata: {"content":"你好"}\n\n')
      res.end()
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as { port: number }
    const url = `http://127.0.0.1:${port}/api/chat`

    const { mountApp } = await import('../ui-dom-mount.ts')
    const { jsx } = await import('../../ui-dom/vnode.ts')
    document.body.innerHTML = ''
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)

    const ChatDemo: any = (_init: unknown, ctx: any) => {
      const $ = ctx.ui.useChat({ url })
      return () =>
        jsx('div', {
          id: 'chat',
          children: [
            jsx('div', { id: 'msgs', children: ($.messages as UiMessage[]).map((m) => jsx('span', { key: m.id, children: m.content })) }),
            jsx('input', {
              id: 'inp',
              value: $.input,
              onInput: (e: any) => { $.input = e.target.value },
            }),
            jsx('button', { id: 'btn', onClick: () => $.send(), children: '发送' }),
          ],
        })
    }

    let app: any
    try {
      app = await mountApp(root, ChatDemo)
      const input = document.getElementById('inp') as HTMLInputElement
      input.value = '你好'
      input.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
      ;(document.getElementById('btn') as HTMLButtonElement).click()

      await waitFor(() => (document.getElementById('msgs')!.textContent ?? '').includes('你好你好'))
      const msgs = document.getElementById('msgs')!.textContent!
      assert.ok(msgs.includes('你好你好'), `DOM 应为用户+回复，实际: ${msgs}`)
    } finally {
      app?.close?.()
      await new Promise((r) => server.close(() => r()))
    }
  })
})

async function waitFor(fn: () => boolean, timeoutMs = 3000, interval = 10): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout')
    await new Promise((r) => setTimeout(r, interval))
  }
}

// ── 回归：AiChat 作为子组件（共享父 $）必须在流式事件时更新 DOM ──
// 背景：chat handle 是父组件的 $（引用恒定），props 浅比较恒等 → 三态 skip 命中，
// 子组件永不重渲染。修复：reactive 状态 __watch 订阅，AiChat 自订阅驱动自身 dirty。

describe('AiChat 子组件共享父 $ — 三态 skip 回归', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('父组件 useChat → <AiChat chat={$} />：流式 token 实时渲染到 AiChat DOM', async () => {
    const server: Server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write('event: wf:message_start\ndata: {"id":"m1"}\n\n')
      res.write('event: wf:token\ndata: {"text":"流"}\n\n')
      res.write('event: wf:token\ndata: {"text":"式"}\n\n')
      res.write('event: wf:done\ndata: {"content":"流式"}\n\n')
      res.end()
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as { port: number }
    const url = `http://127.0.0.1:${port}/api/chat`

    const { mountApp } = await import('../ui-dom-mount.ts')
    const { jsx } = await import('../../ui-dom/vnode.ts')
    const { AiChat } = await import('../../components/AiChat/AiChat.ts')

    // 前序测试 afterEach 清空了 #root：重建挂载点
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)

    // 父组件：useChat + AiChat 子组件（父自身不读 messages，仅传 chat handle）
    const Parent: any = (_init: unknown, ctx: any) => {
      const $ = ctx.ui.useChat({ url })
      return () => jsx('div', { id: 'wrap', children: [jsx(AiChat, { chat: $ })] })
    }

    let app: any
    try {
      app = await mountApp(root, Parent)
      const input = document.querySelector('.wf-aichat-input') as HTMLInputElement
      assert.ok(input, 'AiChat 应挂载输入框')
      input.value = 'hi'
      input.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
      ;(document.querySelector('.wf-aichat-inputbar button') as HTMLButtonElement).click()

      await waitFor(() => (document.querySelector('.wf-aichat-list')?.textContent ?? '').includes('流式'))
      const bubbles = document.querySelectorAll('.wf-aichat-bubble')
      assert.equal(bubbles.length, 2, 'user + assistant 气泡')
      assert.ok(bubbles[1].textContent!.includes('流式'), `assistant 气泡应含流式 token，实际: ${bubbles[1].textContent}`)
    } finally {
      app?.close?.()
      await new Promise((r) => server.close(() => r()))
    }
  })
})
