import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ProgressBar } from './ProgressBar.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */


describe('ProgressBar', () => {
  it('renders progress bar', async () => {
    const vnode = await renderVNode(ProgressBar, {}, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-progress/)
  })

  it('sets width based on value', async () => {
    const vnode = await renderVNode(ProgressBar, { value: 50 }, createTestCtx())!
    const fill = vnode.props.children[0]
    assert.equal(fill.props.style.width, '50%')
  })

  it('clamps value to 0-100', async () => {
    const over = await renderVNode(ProgressBar, { value: 200 }, createTestCtx())!
    const under = await renderVNode(ProgressBar, { value: -10 }, createTestCtx())!
    assert.equal(over.props.children[0].props.style.width, '100%')
    assert.equal(under.props.children[0].props.style.width, '0%')
  })

  it('renders label when provided', async () => {
    const vnode = await renderVNode(ProgressBar, { label: '进度', value: 50 }, createTestCtx())!
    assert.equal(vnode.props.class, 'wf-progress-wrap')
    assert.equal(vnode.props.children[0].props.children, '进度')
  })

  it('renders value percentage when showValue is true', async () => {
    const vnode = await renderVNode(ProgressBar, { value: 75, showValue: true }, createTestCtx())!
    assert.equal(vnode.props.class, 'wf-progress-wrap')
    const valueEl = vnode.props.children[vnode.props.children.length - 1]
    assert.equal(valueEl.props.children, '75%')
  })
})

it('indeterminate：value 缺省 → 不确定态动画类 + 无 valuenow', async () => {
  const vnode = await renderVNode(ProgressBar, { label: '加载中' }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-progress--indeterminate'), '不确定态类')
  assert.ok(!s.includes('aria-valuenow'), '无 valuenow（不确定）')
})

it('status 变色 + size', async () => {
  const v1 = await renderVNode(ProgressBar, { value: 100, status: 'success' }, createTestCtx())!
  assert.ok(JSON.stringify(v1).includes('wf-progress-fill--success'), 'success 变体')
  const v2 = await renderVNode(ProgressBar, { value: 50, size: 'lg' }, createTestCtx())!
  assert.ok(JSON.stringify(v2).includes('wf-progress--lg'), 'lg 尺寸')
})
