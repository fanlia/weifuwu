import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MessageBubble } from './MessageBubble.ts'
import type { WfuiContext } from '../../client/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}
function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('MessageBubble', () => {
  it('assistant → wf-bubble--ai 类', () => {
    const vnode = renderVNode(MessageBubble, { role: 'assistant', content: '你好' }, mockCtx())!
    assert.match(vnode.props.class, /wf-bubble/)
    assert.match(vnode.props.class, /wf-bubble--ai/)
    assert.equal(vnode.props.children, '你好')
  })

  it('user → wf-bubble--own 类', () => {
    const vnode = renderVNode(MessageBubble, { role: 'user', content: '问' }, mockCtx())!
    assert.match(vnode.props.class, /wf-bubble--own/)
  })

  it('error 状态类 + role=alert', () => {
    const vnode = renderVNode(MessageBubble, { role: 'assistant', content: '失败', status: 'error' }, mockCtx())!
    assert.match(vnode.props.class, /wf-bubble--error/)
    assert.equal(vnode.props.role, 'alert')
  })

  it('streaming 状态类', () => {
    const vnode = renderVNode(MessageBubble, { role: 'assistant', content: '...', status: 'streaming' }, mockCtx())!
    assert.match(vnode.props.class, /wf-bubble--streaming/)
  })

  it('actions 渲染在气泡尾部（VNode 内容）', () => {
    const actions = { tag: 'span', props: { class: 'act' }, children: '重试' }
    const vnode = renderVNode(MessageBubble, { role: 'assistant', content: 'x', actions }, mockCtx())!
    const body = vnode.props.children
    assert.match(body.props.class, /wf-bubble-body/)
    const actWrap = body.props.children[1]
    assert.match(actWrap.props.class, /wf-bubble-actions/)
    const act = actWrap.props.children
    assert.equal(act.props.class, 'act')
  })

  it('content 支持 VNode（Markdown 组合）', () => {
    const md = { tag: 'div', props: { class: 'md' }, children: '**粗**' }
    const vnode = renderVNode(MessageBubble, { role: 'assistant', content: md }, mockCtx())!
    assert.equal(vnode.props.children, md) // 无 actions 时直接透传
  })
})
