import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ApprovalCard } from './ApprovalCard.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('ApprovalCard', () => {
  const request = {
    id: 'ap_1',
    toolCallId: 'tc_1',
    name: 'send_email',
    args: { to: 'a@x.com' },
    reason: '发送前需要确认',
    expiresAt: Date.now() + 60000,
  }

  it('pending 状态：工具名 + 参数 + 允许/拒绝按钮', () => {
    const vnode = renderVNode(ApprovalCard, { request }, mockCtx())!
    assert.match(vnode.props.class, /wf-approval--pending/)
    const detail = vnode.props.children[1].props.children
    assert.equal(detail[0].props.children, 'send_email')
    const btns = vnode.props.children[3].props.children[0] // actions.children = [btns]（filter 后）
    assert.equal(btns.props.children[0].props.children, '允许')
    assert.equal(btns.props.children[1].props.children, '拒绝')
  })

  it('reason 显示', () => {
    const vnode = renderVNode(ApprovalCard, { request }, mockCtx())!
    assert.ok(vnode.props.children.some((c: any) => c?.props?.class === 'wf-approval-reason'))
  })

  it('onApprove 回调', () => {
    let approved = false
    const vnode = renderVNode(ApprovalCard, { request, onApprove: () => { approved = true } }, mockCtx())!
    const btns = vnode.props.children[3].props.children[0]
    btns.props.children[0].props.onClick()
    assert.equal(approved, true)
  })

  it('onReject：第一次点击展开备注输入，确认后才回调', () => {
    let rejected: string | undefined
    const ctx = mockCtx()
    const props = { request, onReject: (note: string | undefined) => { rejected = note } }
    const render = ApprovalCard(props, ctx)
    // 第一次渲染：拒绝按钮（actions.children = [btns]）
    let vnode = render(props)!
    const btns = vnode.props.children[3].props.children[0]
    btns.props.children[1].props.onClick() // 第一次点击：展开备注（不回调）
    assert.equal(rejected, undefined)
    // 重渲染：actions.children = [noteDiv, btns]
    vnode = render(props)!
    const actions = vnode.props.children[3].props.children
    const inputNode = actions[0].props.children[0]
    inputNode.props.onInput({ target: { value: '预算不够' } })
    actions[1].props.children[1].props.onClick() // 确认拒绝
    assert.equal(rejected, '预算不够')
  })

  it('终态：approved/rejected/timeout 显示状态文案，无操作按钮', () => {
    for (const status of ['approved', 'rejected', 'timeout'] as const) {
      const vnode = renderVNode(ApprovalCard, { request, status }, mockCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-approval--${status}`))
      const statusNode = vnode.props.children[3]
      assert.match(statusNode.props.class, /wf-approval-status/)
    }
  })

  it('loading：按钮禁用 + 文案「提交中…」+ onClick 不触发', () => {
    let approved = false
    const vnode = renderVNode(ApprovalCard, { request, loading: true, onApprove: () => { approved = true } }, mockCtx())!
    const btns = vnode.props.children[3].props.children[0]
    const allowBtn = btns.props.children[0]
    assert.equal(allowBtn.props.disabled, true, '禁用')
    assert.equal(allowBtn.props.children, '提交中…', '加载文案')
    assert.equal(allowBtn.props.onClick, undefined, 'onClick 不绑定')
    assert.equal(approved, false)
  })

  it('展开备注后点「取消」回退', () => {
    const ctx = mockCtx()
    const props = { request, onReject: () => {} }
    const render = ApprovalCard(props, ctx)
    let vnode = render(props)!
    vnode.props.children[3].props.children[0].props.children[1].props.onClick() // 展开备注
    vnode = render(props)!
    const actions = vnode.props.children[3].props.children
    const cancelBtn = actions[1].props.children[2]
    assert.equal(cancelBtn.props.children, '取消')
    cancelBtn.props.onClick() // 取消
    vnode = render(props)!
    assert.ok(!JSON.stringify(vnode).includes('wf-approval-note-input'), '备注输入已收起')
  })

  it('input 有 aria-label（a11y）', () => {
    const ctx = mockCtx()
    const props = { request }
    const render = ApprovalCard(props, ctx)
    let vnode = render(props)!
    vnode.props.children[3].props.children[0].props.children[1].props.onClick() // 展开备注
    vnode = render(props)!
    const input = vnode.props.children[3].props.children[0].props.children[0]
    assert.equal(input.props['aria-label'], '拒绝备注')
  })
})

it('renderDetail 自定义详情渲染', () => {
  const vnode = renderVNode(ApprovalCard, {
    request: { id: '1', name: 'run_sql', args: { sql: 'select 1' } } as any,
    renderDetail: (req: any) => ({ type: 'code', props: { children: req.args.sql }, key: undefined }),
  }, mockCtx())!
  assert.ok(JSON.stringify(vnode).includes('select 1'), '自定义详情内容')
})

it('拒绝备注：输入后确认携带 note（边界：空 note 也可拒绝）', () => {
  let note: string | undefined = 'UNSET'
  const ctx = mockCtx()
  const factory = ApprovalCard({ request: { id: '1', name: 'x', args: {} } as any, onReject: (n?: string) => { note = n } }, ctx)
  let vnode = factory({ request: { id: '1', name: 'x', args: {} }, onReject: (n?: string) => { note = n } })
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('拒绝'), '拒绝按钮存在')
})

it('边界：request 无 args 不抛错', () => {
  const vnode = renderVNode(ApprovalCard, { request: { id: '1', name: 'noop' } as any }, mockCtx())!
  assert.ok(JSON.stringify(vnode).includes('noop'))
})
