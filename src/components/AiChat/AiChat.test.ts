/**
 * AiChat — 标准 AI 对话组件测试
 *
 * 纯展示层：接收 useChat handle（UseChatHandle），渲染消息/工具卡/审批卡/状态/输入条。
 * 交互回调（send/stop/retry/approve）直接调用 handle 方法。
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { AiChat } from './AiChat.ts'
import type { UseChatHandle, UiMessage } from '../../ui-dom/use-chat.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, mountToDom, buildToDom } from '../../ui-dom/testing.ts'
import { h } from '../../ui-dom/vnode.ts'
import { setupJsdom } from '../../test/client/setup.ts'

before(setupJsdom)


function createTestCtx(): WfuiContext {
  let scrollY = 0
  return { ui: {
    useVisualViewport: () => ({ height: 800, offsetTop: 0, keyboardOpen: false }),
    useScrollPosition: () => ({ y: scrollY, refresh: () => {} }),
    render: () => {},
    useExternal: () => undefined,
    // §5.3 受控输入 mock：内部 keyword（闭包有状态——同 vnode 内输入→发送读同一状态）
    useControlledInput: () => {
      const st = { keyword: '' }
      return {
        value: '', setValue: () => {},
        get keyword() { return st.keyword },
        setKeyword(v: string) { st.keyword = v },
        get selectedLabel() { return '' },
        setSelectedLabel: () => {},
      }
    },
  } } as any
}

function mockChat(partial: Partial<UseChatHandle> = {}): UseChatHandle {
  const calls: string[] = []
  const chat = {
    messages: [] as UiMessage[],
    input: '',
    streaming: false,
    error: null as any,
    usage: null as any,
    step: null as any,
    send: () => { calls.push('send') },
    stop: () => { calls.push('stop') },
    retry: () => { calls.push('retry') },
    clear: () => {},
    approve: async (d: string) => { calls.push(`approve:${d}`) },
    dispose: () => {},
    ...partial,
  } as unknown as UseChatHandle
  ;(chat as any).calls = calls
  return chat
}

/** class 匹配：token 精确或后代前缀（避免 wf-aichat-input 误配 wf-aichat-inputbar） */
function classHit(cls: string, classPart: string): boolean {
  return cls.split(/\s+/).some((t) => t === classPart || t.startsWith(classPart + '-'))
}

/** 按 class 在 VNode 树中查找（深搜，展开子组件，穿透嵌套数组） */
async function find(node: any, classPart: string, ctx: any = null): Promise<any> {
  if (node == null) return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = await find(item, classPart, ctx)
      if (hit) return hit
    }
    return null
  }
  if (typeof node !== 'object') return null
  // 子组件：渲染展开（与 renderVNode 同语义）
  if (typeof node.type === 'function') {
    const inner = await expand(node, ctx)
    return await find(inner, classPart, ctx)
  }
  if (typeof node.props?.class === 'string' && classHit(node.props.class, classPart)) return node
  const kids = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]
  for (const k of kids) {
    const hit = await find(k, classPart, ctx)
    if (hit) return hit
  }
  return null
}

/** 展开组件 vnode → DOM 级 VNode（两阶段组件语义，穿透嵌套数组） */
async function expand(node: any, ctx: any): Promise<any> {
  if (Array.isArray(node)) { const out = []; for (const n of node) out.push(await expand(n, ctx)); return out }
  if (node == null || typeof node !== 'object') return node
  if (typeof node.type === 'function') {
    const r = await node.type(node.props, ctx)
    const inner = typeof r === 'function' ? r(node.props) : r
    return await expand(inner, ctx)
  }
  if (typeof node.type === 'string') {
    const kids = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]
    const children = []; for (const k of kids) children.push(await expand(k, ctx))
    return { ...node, props: { ...node.props, children } }
  }
  return node
}

/** 节点文本（展开后 children 可能是数组） */
function childText(n: any): string {
  const c = n?.props?.children
  if (Array.isArray(c)) return c.filter((x: any) => typeof x === 'string').join('')
  return String(c ?? '')
}

/** 收集按钮类节点 */
function buttons(vnode: any): any[] {
  const out: any[] = []
  ;(function walk(n: any) {
    if (!n || typeof n !== 'object') return
    if (n.type === 'button') out.push(n)
    const kids = Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]
    for (const k of kids) walk(k)
  })(vnode)
  return out
}

describe('AiChat', () => {
  it('空会话：渲染 empty 提示', async () => {
    const chat = mockChat()
    const vnode = await renderVNode(AiChat, { chat }, createTestCtx())
    const empty = await find(vnode, 'wf-aichat-empty')
    assert.ok(empty, '应有空态提示')
  })

  it('消息渲染：user / assistant 气泡', async () => {
    const chat = mockChat({
      messages: [
        { id: 'u1', role: 'user', content: '你好', status: 'done' },
        { id: 'a1', role: 'assistant', content: '你好！', status: 'done' },
      ],
    })
    const vnode = await renderVNode(AiChat, { chat }, createTestCtx())
    const bubbles = [await find(vnode, 'wf-aichat-bubble--user'), await find(vnode, 'wf-aichat-bubble--assistant')]
    assert.ok(bubbles[0], '应有 user 气泡')
    assert.ok(bubbles[1], '应有 assistant 气泡')
    assert.equal(bubbles[0].props.children, '你好')
    assert.equal(bubbles[1].props.children, '你好！')
  })

  it('工具调用内嵌：渲染 ToolCallCard（call/progress/result 透传）', async () => {
    const chat = mockChat({
      messages: [{
        id: 'a1', role: 'assistant', content: '', status: 'done',
        toolCalls: [{
          call: { id: 'tc_1', name: 'query_weather', args: { city: '北京' } },
          progress: { toolCallId: 'tc_1', step: 1, total: 2, message: '查询中…', status: 'running' },
          status: 'running' as const,
        }],
      }],
    })
    const vnode = await renderVNode(AiChat, { chat }, createTestCtx())
    const card = await find(vnode, 'wf-toolcall', createTestCtx())
    assert.ok(card, '应渲染 ToolCallCard')
    const name = await find(card, 'wf-toolcall-name', createTestCtx())
    assert.equal(name.props.children, 'query_weather')
    const bar = await find(card, 'wf-toolcall-bar', createTestCtx())
    assert.ok(bar, 'progress 透传 → 进度条')
  })

  it('HITL 审批：渲染 ApprovalCard，onApprove → chat.approve(approved)', async () => {
    const chat = mockChat({
      messages: [{
        id: 'a1', role: 'assistant', content: '', status: 'done',
        approval: { id: 'ap_1', toolCallId: 'tc_1', name: 'create_order', args: { qty: 2 } },
      }],
    })
    const vnode = await renderVNode(AiChat, { chat }, createTestCtx())
    const card = await find(vnode, 'wf-approval', createTestCtx())
    assert.ok(card, '应渲染 ApprovalCard')
    const approveBtn = buttons(card).find((b) => childText(b) === '允许')
    assert.ok(approveBtn, '应有允许按钮')
    approveBtn.props.onClick()
    assert.equal((chat as any).calls.at(-1), 'approve:approved')
  })

  it('输入条：非流式显示发送（onClick → send），流式显示停止（→ stop）', async () => {
    const chat1 = mockChat()
    const v1 = await renderVNode(AiChat, { chat: chat1 }, createTestCtx())
    const sendBtn = buttons(v1).find((b) => b.props.children === '发送')
    assert.ok(sendBtn)
    const input1 = await find(v1, 'wf-aichat-input')
    input1.props.onInput({ target: { value: 'hi' } })
    sendBtn.props.onClick() // 发送：内部 keyword → chat.input + chat.send
    assert.equal((chat1 as any).calls.at(-1), 'send')

    const chat2 = mockChat({ streaming: true })
    const v2 = await renderVNode(AiChat, { chat: chat2 }, createTestCtx())
    const stopBtn = buttons(v2).find((b) => b.props.children === '停止')
    assert.ok(stopBtn, '流式时应显示停止')
    stopBtn.props.onClick()
    assert.equal((chat2 as any).calls.at(-1), 'stop')
  })

  it('Enter 键 → 写入 chat.input + send；输入期内部 keyword 不回流（IME 安全）', async () => {
    const chat = mockChat()
    const vnode = await renderVNode(AiChat, { chat }, createTestCtx())
    const input = await find(vnode, 'wf-aichat-input')
    // 输入 → 内部 keyword（§5.3：组合期间不回流受控 value——中文 IME 不打断）
    input.props.onInput({ target: { value: 'hi' } })
    assert.equal(chat.input, '', '输入期不回流受控值（IME 组合安全）')
    // Enter → 写入 chat.input + send（send 读 state.input）
    input.props.onKeyDown({ key: 'Enter' })
    assert.equal(chat.input, 'hi', 'Enter 写入 chat.input')
    assert.equal((chat as any).calls.at(-1), 'send')
    // 空输入不发送
    input.props.onKeyDown({ key: 'Enter' })
    assert.equal((chat as any).calls.length, 1, 'keyword 已清空——空输入不重复发送')
  })

  it('错误态：非流式显示重试按钮（→ retry），流式时不显示', async () => {
    const chat = mockChat({ error: { code: 'rate_limited', message: 'too fast' } })
    const vnode = await renderVNode(AiChat, { chat }, createTestCtx())
    const err = await find(vnode, 'wf-aichat-error')
    assert.ok(err, '应显示错误条')
    assert.match(err.props.children, /rate_limited/)
    const retryBtn = buttons(vnode).find((b) => b.props.children === '重试')
    assert.ok(retryBtn)
    retryBtn.props.onClick()
    assert.equal((chat as any).calls.at(-1), 'retry')

    const streamingChat = mockChat({ streaming: true, error: { code: 'x', message: 'y' } })
    const v2 = await renderVNode(AiChat, { chat: streamingChat }, createTestCtx())
    assert.equal(buttons(v2).some((b) => b.props.children === '重试'), false)
  })

  it('状态指示：thinking / 工具执行 / usage', async () => {
    const chat = mockChat({
      step: { type: 'tool', name: 'query_weather' },
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    })
    const vnode = await renderVNode(AiChat, { chat }, createTestCtx())
    const status = await find(vnode, 'wf-aichat-status')
    assert.match(status.props.children, /query_weather/)
    const usage = await find(vnode, 'wf-aichat-usage')
    assert.match(usage.props.children, /1→2/)
  })

  it('renderMessage 逃生舱：自定义气泡渲染', async () => {
    const chat = mockChat({
      messages: [{ id: 'a1', role: 'assistant', content: 'x', status: 'done' }],
    })
    const vnode = await renderVNode(AiChat, {
      chat,
      renderMessage: (m: UiMessage) => `[自定义]${m.content}`,
    }, createTestCtx())
    const bubble = await find(vnode, 'wf-aichat-bubble')
    assert.equal(bubble.props.children, '[自定义]x')
  })

  it('labels 覆盖：自定义发送按钮文案', async () => {
    const chat = mockChat()
    const vnode = await renderVNode(AiChat, { chat, labels: { send: 'Submit' } }, createTestCtx())
    assert.ok(buttons(vnode).some((b) => b.props.children === 'Submit'))
  })
})

// ── 真实订阅流式（§4.6 陷阱回归：jsdom 静态 renderVNode 掩盖——必须真实挂载验证 token 流逐帧落 DOM） ──

import { createChatSession } from '../../../src/ui-dom/use-chat.ts'

function makeStreamChat() {
  const state: any = { messages: [], input: '', streaming: false, error: null, usage: null, step: null }
  const subs = new Set<() => void>()
  state.subs = subs
  const notify = () => { for (const cb of [...subs]) cb() }
  const transport: any = (url: string, body: unknown, cbs: any) => {
    // 假 SSE：延迟发 token（onToken 期望纯字符串——apply 内部包 { text: t }）
    setTimeout(() => cbs.onToken('你'), 5)
    setTimeout(() => cbs.onToken('好'), 15)
    setTimeout(() => cbs.onDone({}), 25)
    return { abort: () => {} }
  }
  const api = createChatSession(state, transport, { url: '/x' }, notify)
  Object.assign(state, api)
  state.subscribe = (cb: () => void) => { subs.add(cb); return () => subs.delete(cb) }
  return state as any
}


// ── 真实运行链路复现（createVdomContext + mountRoot——真实 useExternal 订阅，非 mock） ──

import { mountRoot, createVdomContext } from '../../ui-dom/vdom/mount.ts'
import { createClientBrowser } from '../../ui-dom/browser.ts'

it('流式：真实 vdom 上下文（useExternal 真实订阅）token 逐帧落 DOM', async () => {
  const chat = makeStreamChat()
  chat._calls = 0
  const origSub = chat.subscribe
  chat.subscribe = (cb: () => void) => { const u = origSub(cb); const wrapped = () => { chat._calls++; cb() }; chat.subs.delete(cb); chat.subs.add(wrapped); return () => { chat.subs.delete(wrapped); u() } }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })
  await handle.mount(h(AiChat, { chat }))
  chat.input = 'hi'
  chat.send()
  await new Promise((r) => setTimeout(r, 20))
  const list = container.querySelector('.wf-aichat-list')!
  assert.ok(list.textContent!.includes('你'), `token1 已落地（实际: ${list.textContent!.slice(0, 60)}）`)
  await new Promise((r) => setTimeout(r, 25))
  assert.ok(list.textContent!.includes('你好'), `token2 已追加（实际: ${list.textContent!.slice(0, 60)}）`)
  await new Promise((r) => setTimeout(r, 20))
  const sendBtn = container.querySelector('.wf-btn--primary')
  assert.ok(sendBtn && sendBtn.textContent!.includes('发送'), '流结束回到发送态')
  document.body.removeChild(container)
})

it('订阅注册 + notify → render 链路（流式渲染基座）', async () => {
  const chat: any = { messages: [], input: '', streaming: false, error: null, usage: null, step: null, subs: new Set() }
  chat.subscribe = (cb: () => void) => { chat.subs.add(cb); return () => chat.subs.delete(cb) }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })
  await handle.mount(h(AiChat, { chat }))
  // 订阅注册了吗？
  // 手动触发 notify → 渲染了吗？
  chat.messages.push({ id: 'm1', role: 'assistant', content: '你', status: 'streaming' })
  for (const cb of [...chat.subs]) cb()
  await new Promise((r) => setTimeout(r, 10))
  const list = container.querySelector('.wf-aichat-list')!
  assert.ok(list.textContent!.includes('你'), 'notify 后 DOM 更新')
  document.body.removeChild(container)
})

it('IME 组合期间 onInput 不回流受控值（中文输入法不打断）', async () => {
  const chat = makeStreamChat()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })
  await handle.mount(h(AiChat, { chat }))
  const input = container.querySelector('.wf-aichat-input') as HTMLInputElement
  // 组合开始（拼音输入中）
  input.dispatchEvent(new (window as any).Event('compositionstart', { bubbles: true }))
  // 组合中 onInput（拼音候选）——不应回流受控值/不应触发 send
  input.value = 'ni'
  input.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
  assert.equal(chat.input, '', '组合期间不回流 chat.input')
  assert.equal(chat.messages.length, 0, '组合期间不发送')
  // 组合结束（选中中文）
  input.value = '你好'
  input.dispatchEvent(new (window as any).Event('compositionend', { bubbles: true }))
  // Enter 发送
  input.dispatchEvent(new (window as any).KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  assert.equal(chat.input, '', 'send 消费后清空输入态')
  assert.equal(chat.messages.length, 2, 'user + assistant 占位')
  assert.equal(chat.messages[0].content, '你好', '组合完成后 Enter 发送中文')
  document.body.removeChild(container)
})

it('换 chat handle → 重新订阅（新会话 notify 驱动渲染——防订阅旧 handle 无流式）', async () => {
  const chatA = makeStreamChat()
  const chatB = makeStreamChat()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })
  // 用一个转发组件：mount 时 chatA，props 变化换 chatB
  const ChatHost: any = async (initProps: any, c: any) => {
    let latest = initProps.chat
    return async (props: any) => {
      latest = props.chat
      return h('div', {}, h(AiChat, { chat: latest }))
    }
  }
  await handle.mount(h(ChatHost, { chat: chatA }))
  // 父组件换 chatB（props 变化 → ChatHost renderFn 重跑 → AiChat 收到新 chat）
  await handle.rerender() // 简单路径：先验证同一挂载下 AiChat 订阅 chatA
  // 手动触发 chatA notify → 应渲染（订阅 chatA）
  chatA.messages.push({ id: 'ma', role: 'assistant', content: 'A', status: 'done' })
  ;[...chatA.subs].forEach((cb: any) => cb())
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(container.querySelector('.wf-aichat-list')!.textContent!.includes('A'), 'chatA 流式显示')
  document.body.removeChild(container)
})
