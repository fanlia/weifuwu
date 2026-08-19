import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Steps } from './Steps.ts'
import { Icon } from '../Icon/Icon.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'

/** Call component and get VNode (two-phase compat) */



describe('Steps', () => {
  const items = [
    { key: 'a', label: '第一步' },
    { key: 'b', label: '第二步' },
    { key: 'c', label: '第三步' },
  ]

  it('renders step items', async () => {
    const vnode = await renderVNode(Steps, { items }, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-steps/)
    assert.equal(vnode.props.children.length, 3)
  })

  it('renders step labels', async () => {
    const vnode = await renderVNode(Steps, { items }, createTestCtx())!
    assert.equal(vnode.props.children[0].props.children[1].props.children, '第一步')
  })

  it('marks done steps with checkmark', async () => {
    const vnode = await renderVNode(Steps, { items, current: 1 }, createTestCtx())!
    // step 0 should be done (check icon)
    const num0 = vnode.props.children[0].props.children[0]
    assert.equal(num0.props.children.type, Icon, '完成步骤应渲染 check 图标')
  })

  it('marks current step', async () => {
    const vnode = await renderVNode(Steps, { items, active: 'b' }, createTestCtx())!
    assert.match(vnode.props.children[1].props.class, /wf-step--current/)
  })
})

it('current 索引模式（推导 activeKey）', async () => {
  const items = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }]
  const vnode = await renderVNode(Steps, { items, current: 1 }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-step--current'), 'current 项类')
})

it('aria-current=step（当前步骤语义）', async () => {
  const items = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]
  const vnode = await renderVNode(Steps, { items, current: 0 }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('"aria-current":"step"'), 'aria-current=step')
})

it('description 渲染', async () => {
  const items = [{ key: 'a', label: 'A', description: '第一步说明' }]
  const vnode = await renderVNode(Steps, { items }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('第一步说明'), '描述渲染')
})

it('空 items 安全', async () => {
  const vnode = await renderVNode(Steps, { items: [] }, createTestCtx())!
  assert.ok(vnode, '空步骤渲染')
})
