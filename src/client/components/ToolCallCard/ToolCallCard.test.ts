import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ToolCallCard } from './ToolCallCard.ts'
import { Icon } from '../Icon/Icon.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'



describe('ToolCallCard', () => {
  const call = { id: 'tc_1', name: 'query_weather', args: { city: '北京' } }

  it('running 状态：工具名 + 参数 + 无进度条', async () => {
    const vnode = await renderVNode(ToolCallCard, { call }, createTestCtx())!
    assert.match(vnode.props.class, /wf-toolcall--running/)
    const header = vnode.props.children[0]
    assert.equal(header.props.children[1].props.children, 'query_weather')
  })

  it('progress 状态：显示进度条 + 消息', async () => {
    const vnode = await renderVNode(ToolCallCard, {
      call,
      progress: { toolCallId: 'tc_1', step: 1, total: 2, message: '查询中…', status: 'running' },
    }, createTestCtx())!
    const body = vnode.props.children[1].props.children
    // progressNode 是数组 [msg, bar]（嵌套在 body 内）
    const flattened = body.flat(2)
    const bar = flattened.find((n: any) => n?.props?.class === 'wf-toolcall-bar')
    assert.ok(bar, '应有进度条')
    const fill = bar.props.children[0]
    assert.match(fill.props.style.width, /50%/)
  })

  it('result ok → ok 终态', async () => {
    const vnode = await renderVNode(ToolCallCard, { call, result: { id: 'tc_1', ok: true, output: { temp: 25 } } }, createTestCtx())!
    assert.match(vnode.props.class, /wf-toolcall--ok/)
  })

  it('result error → error 终态 + 错误信息', async () => {
    const vnode = await renderVNode(ToolCallCard, {
      call,
      result: { id: 'tc_1', ok: false, error: { code: 'rejected', message: '预算不够' } },
    }, createTestCtx())!
    assert.match(vnode.props.class, /wf-toolcall--error/)
    const body = vnode.props.children[1].props.children
    const err = body.find((n: any) => n?.props?.class === 'wf-toolcall-error')
    assert.match(err.props.children, /预算不够/)
  })

  it('renderArgs 自定义参数渲染', async () => {
    const vnode = await renderVNode(ToolCallCard, {
      call,
      renderArgs: (a) => `城市=${a.city}`,
    }, createTestCtx())!
    const body = vnode.props.children[1].props.children
    assert.ok(body[0].includes('城市=北京')) // renderArgs 返回裸字符串
  })
})

it('状态图标渲染 Icon 组件而非名称文本（P3——"settings"/"check" 曾以文本泄漏）', async () => {
  const vnode = await renderVNode(ToolCallCard, { call: { id: '1', name: 'query', args: {} }, result: { id: '1', ok: true, output: {} } }, createTestCtx())!
  const iconSpan = vnode.props.children[0].props.children[0]
  assert.equal(iconSpan.props.class.includes('wf-toolcall-icon'), true)
  const icon = iconSpan.props.children
  assert.equal(icon.type, Icon, '图标必须是 Icon VNode')
  assert.equal(icon.props.name, 'check')
})

it('pending 初始态（无 status）', async () => {
  const vnode = await renderVNode(ToolCallCard, { call: { id: 't1', name: 'query_db', args: {} } }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('query_db'), '工具名渲染')
})

it('工具名渲染（name 展示）', async () => {
  const vnode = await renderVNode(ToolCallCard, { call: { id: 't1', name: 'query_weather', args: { city: '北京' } }, status: 'running' }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('query_weather'), '工具名')
  assert.ok(s.includes('北京'), '参数渲染')
})
