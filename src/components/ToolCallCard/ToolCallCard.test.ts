import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ToolCallCard } from './ToolCallCard.ts'
import type { WfuiContext } from '../../client/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('ToolCallCard', () => {
  const call = { id: 'tc_1', name: 'query_weather', args: { city: '北京' } }

  it('running 状态：工具名 + 参数 + 无进度条', () => {
    const vnode = renderVNode(ToolCallCard, { call }, mockCtx())!
    assert.match(vnode.props.class, /wf-toolcall--running/)
    const header = vnode.props.children[0]
    assert.equal(header.props.children[1].props.children, 'query_weather')
  })

  it('progress 状态：显示进度条 + 消息', () => {
    const vnode = renderVNode(ToolCallCard, {
      call,
      progress: { toolCallId: 'tc_1', step: 1, total: 2, message: '查询中…', status: 'running' },
    }, mockCtx())!
    const body = vnode.props.children[1].props.children
    // progressNode 是数组 [msg, bar]（嵌套在 body 内）
    const flattened = body.flat(2)
    const bar = flattened.find((n: any) => n?.props?.class === 'wf-toolcall-bar')
    assert.ok(bar, '应有进度条')
    const fill = bar.props.children[0]
    assert.match(fill.props.style.width, /50%/)
  })

  it('result ok → ok 终态', () => {
    const vnode = renderVNode(ToolCallCard, { call, result: { id: 'tc_1', ok: true, output: { temp: 25 } } }, mockCtx())!
    assert.match(vnode.props.class, /wf-toolcall--ok/)
  })

  it('result error → error 终态 + 错误信息', () => {
    const vnode = renderVNode(ToolCallCard, {
      call,
      result: { id: 'tc_1', ok: false, error: { code: 'rejected', message: '预算不够' } },
    }, mockCtx())!
    assert.match(vnode.props.class, /wf-toolcall--error/)
    const body = vnode.props.children[1].props.children
    const err = body.find((n: any) => n?.props?.class === 'wf-toolcall-error')
    assert.match(err.props.children, /预算不够/)
  })

  it('renderArgs 自定义参数渲染', () => {
    const vnode = renderVNode(ToolCallCard, {
      call,
      renderArgs: (a) => `城市=${a.city}`,
    }, mockCtx())!
    const body = vnode.props.children[1].props.children
    assert.ok(body[0].includes('城市=北京')) // renderArgs 返回裸字符串
  })
})
