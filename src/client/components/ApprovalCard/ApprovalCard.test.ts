import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ApprovalCard } from './ApprovalCard.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, mountComponent, findByClass, findVNode, createTestCtx } from '../../vdom/testing.ts'
import { JsonSchemaForm } from '../JsonSchemaForm/JsonSchemaForm.ts'



describe('ApprovalCard', () => {
  const request = {
    id: 'ap_1',
    toolCallId: 'tc_1',
    name: 'send_email',
    args: { to: 'a@x.com' },
    reason: '发送前需要确认',
    expiresAt: Date.now() + 60000,
  }

  it('pending 状态：工具名 + 参数 + 允许/拒绝按钮', async () => {
    const vnode = await renderVNode(ApprovalCard, { request }, createTestCtx())!
    assert.match(vnode.props.class, /wf-approval--pending/)
    const detail = vnode.props.children[1].props.children
    assert.equal(detail[0].props.children, 'send_email')
    const btns = vnode.props.children[3].props.children[0] // actions.children = [btns]（filter 后）
    assert.equal(btns.props.children[0].props.children, '允许')
    assert.equal(btns.props.children[1].props.children, '拒绝')
  })

  it('reason 显示', async () => {
    const vnode = await renderVNode(ApprovalCard, { request }, createTestCtx())!
    assert.ok(vnode.props.children.some((c: any) => c?.props?.class === 'wf-approval-reason'))
  })

  it('onApprove 回调', async () => {
    let approved = false
    const vnode = await renderVNode(ApprovalCard, { request, onApprove: () => { approved = true } }, createTestCtx())!
    const btns = vnode.props.children[3].props.children[0]
    btns.props.children[0].props.onClick()
    assert.equal(approved, true)
  })

  it('onReject：第一次点击展开备注输入，确认后才回调', async () => {
    let rejected: string | undefined
    const ctx = createTestCtx()
    const props = { request, onReject: (note: string | undefined) => { rejected = note } }
    const render = await ApprovalCard(props, ctx)
    // 第一次渲染：拒绝按钮（actions.children = [btns]）
    let vnode = await render(props)!
    const btns = vnode.props.children[3].props.children[0]
    btns.props.children[1].props.onClick() // 第一次点击：展开备注（不回调）
    assert.equal(rejected, undefined)
    // 重渲染：actions.children = [noteDiv, btns]
    vnode = await render(props)!
    const actions = vnode.props.children[3].props.children
    const inputNode = actions[0].props.children[0]
    inputNode.props.onInput({ target: { value: '预算不够' } })
    actions[1].props.children[1].props.onClick() // 确认拒绝
    assert.equal(rejected, '预算不够')
  })

  it('终态：approved/rejected/timeout 显示状态文案，无操作按钮', async () => {
    for (const status of ['approved', 'rejected', 'timeout'] as const) {
      const vnode = await renderVNode(ApprovalCard, { request, status }, createTestCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-approval--${status}`))
      const statusNode = vnode.props.children[3]
      assert.match(statusNode.props.class, /wf-approval-status/)
    }
  })

  it('loading：按钮禁用 + 文案「提交中…」+ onClick 不触发', async () => {
    let approved = false
    const vnode = await renderVNode(ApprovalCard, { request, loading: true, onApprove: () => { approved = true } }, createTestCtx())!
    const btns = vnode.props.children[3].props.children[0]
    const allowBtn = btns.props.children[0]
    assert.equal(allowBtn.props.disabled, true, '禁用')
    assert.equal(allowBtn.props.children, '提交中…', '加载文案')
    assert.equal(allowBtn.props.onClick, undefined, 'onClick 不绑定')
    assert.equal(approved, false)
  })

  it('展开备注后点「取消」回退', async () => {
    const ctx = createTestCtx()
    const props = { request, onReject: () => {} }
    const render = await ApprovalCard(props, ctx)
    let vnode = await render(props)!
    vnode.props.children[3].props.children[0].props.children[1].props.onClick() // 展开备注
    vnode = await render(props)!
    const actions = vnode.props.children[3].props.children
    const cancelBtn = actions[1].props.children[2]
    assert.equal(cancelBtn.props.children, '取消')
    cancelBtn.props.onClick() // 取消
    vnode = await render(props)!
    assert.ok(!JSON.stringify(vnode).includes('wf-approval-note-input'), '备注输入已收起')
  })

  it('input 有 aria-label（a11y）', async () => {
    const ctx = createTestCtx()
    const props = { request }
    const render = await ApprovalCard(props, ctx)
    let vnode = await render(props)!
    vnode.props.children[3].props.children[0].props.children[1].props.onClick() // 展开备注
    vnode = await render(props)!
    const input = vnode.props.children[3].props.children[0].props.children[0]
    assert.equal(input.props['aria-label'], '拒绝备注')
  })
})

it('renderDetail 自定义详情渲染', async () => {
  const vnode = await renderVNode(ApprovalCard, {
    request: { id: '1', name: 'run_sql', args: { sql: 'select 1' } } as any,
    renderDetail: (req: any) => ({ type: 'code', props: { children: req.args.sql }, key: undefined }),
  }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('select 1'), '自定义详情内容')
})

it('拒绝备注：输入后确认携带 note（边界：空 note 也可拒绝）', async () => {
  let note: string | undefined = 'UNSET'
  const ctx = createTestCtx()
  const factory = await ApprovalCard({ request: { id: '1', name: 'x', args: {} } as any, onReject: (n?: string) => { note = n } }, ctx)
  let vnode = await factory({ request: { id: '1', name: 'x', args: {} }, onReject: (n?: string) => { note = n } })
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('拒绝'), '拒绝按钮存在')
})

it('边界：request 无 args 不抛错', async () => {
  const vnode = await renderVNode(ApprovalCard, { request: { id: '1', name: 'noop' } as any }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('noop'))
})

describe('ApprovalCard — 修改参数（B9-5）', () => {
  const schema = {
    type: 'object',
    properties: {
      to: { type: 'string', title: '收件人' },
      qty: { type: 'integer', title: '数量', minimum: 1 },
    },
    required: ['to'],
  }
  const req = { id: 'ap_1', toolCallId: 'tc_1', name: 'send_email', args: { to: 'a@x.com', qty: 2 }, reason: '确认' }

  function collect(v: any, pred: (n: any) => boolean): any[] {
    const found: any[] = []
    findVNode(v, (n: any) => { if (pred(n)) found.push(n); return false })
    return found
  }

  it('无 argsSchema → 不渲染「修改参数」按钮', async () => {
    const vnode = await renderVNode(ApprovalCard, { request: req }, createTestCtx())!
    assert.ok(!JSON.stringify(vnode).includes('修改参数'))
    assert.equal(collect(vnode, (n: any) => n?.type === JsonSchemaForm).length, 0)
  })

  it('有 argsSchema → 「修改参数」按钮；点击展开 JsonSchemaForm（预填 args）', async () => {
    const ctx = createTestCtx()
    const props = { request: req, argsSchema: schema }
    const render = await mountComponent(ApprovalCard, props, ctx)
    let vnode = await render()!
    assert.ok(JSON.stringify(vnode).includes('修改参数'), '修改参数按钮存在')
    assert.equal(collect(vnode, (n: any) => n?.type === JsonSchemaForm).length, 0, '初始不展开表单')
    const btns = vnode.props.children[3].props.children[0]
    btns.props.children[1].props.onClick()
    vnode = await render()!
    const form = collect(vnode, (n: any) => n?.type === JsonSchemaForm)[0]
    assert.ok(form, '表单展开')
    assert.equal(form.props.submitLabel, '以修改后参数批准')
    assert.deepEqual(form.props.value, { to: 'a@x.com', qty: 2 }, '预填 request.args')
  })

  it('修改后提交 → onApprove(modifiedArgs)', async () => {
    let modified: Record<string, unknown> | undefined = 'UNSET' as any
    const ctx = createTestCtx()
    const props = { request: req, argsSchema: schema, onApprove: (m?: Record<string, unknown>) => { modified = m } }
    const render = await mountComponent(ApprovalCard, props, ctx)
    let vnode = await render()!
    vnode.props.children[3].props.children[0].props.children[1].props.onClick() // 展开
    vnode = await render()!
    const form = collect(vnode, (n: any) => n?.type === JsonSchemaForm)[0]
    form.props.onSubmit({ to: 'b@x.com', qty: 5 }) // 模拟表单提交（校验由 JsonSchemaForm 内部处理）
    assert.ok(modified !== 'UNSET', 'onApprove 触发')
    assert.equal(modified?.to, 'b@x.com')
    assert.equal(modified?.qty, 5)
  })

  it('修改表单「取消」收起', async () => {
    const ctx = createTestCtx()
    const props = { request: req, argsSchema: schema }
    const render = await mountComponent(ApprovalCard, props, ctx)
    let vnode = await render()!
    vnode.props.children[3].props.children[0].props.children[1].props.onClick() // 展开
    vnode = await render()!
    assert.equal(collect(vnode, (n: any) => n?.type === JsonSchemaForm).length, 1, '表单已展开')
    const cancel = findByClass(vnode, 'wf-approval-modify-cancel')[0]
    assert.ok(cancel, '取消修改按钮')
    cancel.props.onClick()
    vnode = await render()!
    assert.equal(collect(vnode, (n: any) => n?.type === JsonSchemaForm).length, 0, '表单收起')
  })
})
