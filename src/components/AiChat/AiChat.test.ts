/**
 * AiChat — 标准 AI 对话组件测试
 *
 * 纯展示层：接收 useChat handle（UseChatHandle），渲染消息/工具卡/审批卡/状态/输入条。
 * 交互回调（send/stop/retry/approve）直接调用 handle 方法。
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { AiChat } from './AiChat.ts'
import type { UseChatHandle, UiMessage } from '../../ui-dom/use-chat.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'


function createTestCtx(): WfuiContext {
  let scrollY = 0
  return { ui: {
    useVisualViewport: () => ({ height: 800, offsetTop: 0, keyboardOpen: false }),
    useScrollPosition: () => ({ y: scrollY, refresh: () => {} }),
    $: () => ({ expanded: {} }),
    dirty: () => {}, render: () => {},
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
function find(node: any, classPart: string, ctx: any = null): any {
  if (node == null) return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = find(item, classPart, ctx)
      if (hit) return hit
    }
    return null
  }
  if (typeof node !== 'object') return null
  // 子组件：渲染展开（与 renderVNode 同语义）
  if (typeof node.type === 'function') {
    const inner = expand(node, ctx)
    return find(inner, classPart, ctx)
  }
  if (typeof node.props?.class === 'string' && classHit(node.props.class, classPart)) return node
  const kids = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]
  for (const k of kids) {
    const hit = find(k, classPart, ctx)
    if (hit) return hit
  }
  return null
}

/** 展开组件 vnode → DOM 级 VNode（两阶段组件语义，穿透嵌套数组） */
function expand(node: any, ctx: any): any {
  if (Array.isArray(node)) return node.map((n) => expand(n, ctx))
  if (node == null || typeof node !== 'object') return node
  if (typeof node.type === 'function') {
    const r = node.type(node.props, ctx)
    const inner = typeof r === 'function' ? r(node.props) : r
    return expand(inner, ctx)
  }
  if (typeof node.type === 'string') {
    const kids = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]
    return { ...node, props: { ...node.props, children: kids.map((k) => expand(k, ctx)) } }
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
  it('空会话：渲染 empty 提示', () => {
    const chat = mockChat()
    const vnode = renderVNode(AiChat, { chat }, createTestCtx())
    const empty = find(vnode, 'wf-aichat-empty')
    assert.ok(empty, '应有空态提示')
  })

  it('消息渲染：user / assistant 气泡', () => {
    const chat = mockChat({
      messages: [
        { id: 'u1', role: 'user', content: '你好', status: 'done' },
        { id: 'a1', role: 'assistant', content: '你好！', status: 'done' },
      ],
    })
    const vnode = renderVNode(AiChat, { chat }, createTestCtx())
    const bubbles = [find(vnode, 'wf-aichat-bubble--user'), find(vnode, 'wf-aichat-bubble--assistant')]
    assert.ok(bubbles[0], '应有 user 气泡')
    assert.ok(bubbles[1], '应有 assistant 气泡')
    assert.equal(bubbles[0].props.children, '你好')
    assert.equal(bubbles[1].props.children, '你好！')
  })

  it('工具调用内嵌：渲染 ToolCallCard（call/progress/result 透传）', () => {
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
    const vnode = renderVNode(AiChat, { chat }, createTestCtx())
    const card = find(vnode, 'wf-toolcall', createTestCtx())
    assert.ok(card, '应渲染 ToolCallCard')
    const name = find(card, 'wf-toolcall-name', createTestCtx())
    assert.equal(name.props.children, 'query_weather')
    const bar = find(card, 'wf-toolcall-bar', createTestCtx())
    assert.ok(bar, 'progress 透传 → 进度条')
  })

  it('HITL 审批：渲染 ApprovalCard，onApprove → chat.approve(approved)', () => {
    const chat = mockChat({
      messages: [{
        id: 'a1', role: 'assistant', content: '', status: 'done',
        approval: { id: 'ap_1', toolCallId: 'tc_1', name: 'create_order', args: { qty: 2 } },
      }],
    })
    const vnode = renderVNode(AiChat, { chat }, createTestCtx())
    const card = find(vnode, 'wf-approval', createTestCtx())
    assert.ok(card, '应渲染 ApprovalCard')
    const approveBtn = buttons(card).find((b) => childText(b) === '允许')
    assert.ok(approveBtn, '应有允许按钮')
    approveBtn.props.onClick()
    assert.equal((chat as any).calls.at(-1), 'approve:approved')
  })

  it('输入条：非流式显示发送（onClick → send），流式显示停止（→ stop）', () => {
    const chat1 = mockChat()
    const v1 = renderVNode(AiChat, { chat: chat1 }, createTestCtx())
    const sendBtn = buttons(v1).find((b) => b.props.children === '发送')
    assert.ok(sendBtn)
    sendBtn.props.onClick()
    assert.equal((chat1 as any).calls.at(-1), 'send')

    const chat2 = mockChat({ streaming: true })
    const v2 = renderVNode(AiChat, { chat: chat2 }, createTestCtx())
    const stopBtn = buttons(v2).find((b) => b.props.children === '停止')
    assert.ok(stopBtn, '流式时应显示停止')
    stopBtn.props.onClick()
    assert.equal((chat2 as any).calls.at(-1), 'stop')
  })

  it('Enter 键 → chat.send；输入框双向绑定 chat.input', () => {
    const chat = mockChat({ input: 'hi' })
    const vnode = renderVNode(AiChat, { chat }, createTestCtx())
    const input = find(vnode, 'wf-aichat-input')
    assert.equal(input.props.value, 'hi')
    input.props.onKeyDown({ key: 'Enter' })
    assert.equal((chat as any).calls.at(-1), 'send')
    input.props.onInput({ target: { value: 'hi2' } })
    assert.equal(chat.input, 'hi2')
  })

  it('错误态：非流式显示重试按钮（→ retry），流式时不显示', () => {
    const chat = mockChat({ error: { code: 'rate_limited', message: 'too fast' } })
    const vnode = renderVNode(AiChat, { chat }, createTestCtx())
    const err = find(vnode, 'wf-aichat-error')
    assert.ok(err, '应显示错误条')
    assert.match(err.props.children, /rate_limited/)
    const retryBtn = buttons(vnode).find((b) => b.props.children === '重试')
    assert.ok(retryBtn)
    retryBtn.props.onClick()
    assert.equal((chat as any).calls.at(-1), 'retry')

    const streamingChat = mockChat({ streaming: true, error: { code: 'x', message: 'y' } })
    const v2 = renderVNode(AiChat, { chat: streamingChat }, createTestCtx())
    assert.equal(buttons(v2).some((b) => b.props.children === '重试'), false)
  })

  it('状态指示：thinking / 工具执行 / usage', () => {
    const chat = mockChat({
      step: { type: 'tool', name: 'query_weather' },
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    })
    const vnode = renderVNode(AiChat, { chat }, createTestCtx())
    const status = find(vnode, 'wf-aichat-status')
    assert.match(status.props.children, /query_weather/)
    const usage = find(vnode, 'wf-aichat-usage')
    assert.match(usage.props.children, /1→2/)
  })

  it('renderMessage 逃生舱：自定义气泡渲染', () => {
    const chat = mockChat({
      messages: [{ id: 'a1', role: 'assistant', content: 'x', status: 'done' }],
    })
    const vnode = renderVNode(AiChat, {
      chat,
      renderMessage: (m: UiMessage) => `[自定义]${m.content}`,
    }, createTestCtx())
    const bubble = find(vnode, 'wf-aichat-bubble')
    assert.equal(bubble.props.children, '[自定义]x')
  })

  it('labels 覆盖：自定义发送按钮文案', () => {
    const chat = mockChat()
    const vnode = renderVNode(AiChat, { chat, labels: { send: 'Submit' } }, createTestCtx())
    assert.ok(buttons(vnode).some((b) => b.props.children === 'Submit'))
  })
})
