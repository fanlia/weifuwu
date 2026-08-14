import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PageHeader } from './PageHeader.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('PageHeader', () => {
  it('renders title', async () => {
    const vnode = await renderVNode(PageHeader, { title: '用户管理' }, createTestCtx())!
    const left = vnode.props.children[0]
    const h2 = left.props.children[0]
    assert.equal(h2.props.children, '用户管理')
  })

  it('renders subtitle when provided', async () => {
    const vnode = await renderVNode(PageHeader, { title: '用户管理', sub: '管理所有用户' }, createTestCtx())!
    const left = vnode.props.children[0]
    const sub = left.props.children[1]
    assert.equal(sub.props.children, '管理所有用户')
  })

  it('renders actions when provided', async () => {
    const vnode = await renderVNode(PageHeader, { title: '用户管理', children: '按钮' }, createTestCtx())!
    const actionsEl = vnode.props.children[1]
    assert.equal(actionsEl.props.class, 'wf-page-head-actions')
    assert.equal(actionsEl.props.children, '按钮')
  })
})

it('display 变体类（title 元素上）', async () => {
  const vnode = await renderVNode(PageHeader, { title: '标题', display: true }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('wf-page-title--display'), 'display 档标题类')
})

it('children 内容区渲染', async () => {
  const vnode = await renderVNode(PageHeader, { title: '标题', children: '操作区' }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('操作区'))
})

it('无 title 安全', async () => {
  const vnode = await renderVNode(PageHeader, {}, createTestCtx())!
  assert.ok(vnode, '空页头渲染')
})
