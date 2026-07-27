import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Accordion } from './Accordion.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Accordion', () => {
  const items = [
    { key: 'a', title: '标题A', content: '内容A' },
    { key: 'b', title: '标题B', content: '内容B' },
  ]

  it('renders accordion items', () => {
    const vnode = Accordion({ items }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-accordion/)
    assert.equal(vnode.props.children.length, 2)
  })

  it('returns null when no items', () => {
    const result = Accordion({ items: [] }, mockCtx())
    assert.equal(result, null)
  })

  it('renders titles in summaries', () => {
    const vnode = Accordion({ items }, mockCtx())!
    const summary = vnode.props.children[0].props.children[0]
    assert.equal(summary.props.class, 'wf-accordion-summary')
    assert.equal(summary.props.children, '标题A')
  })

  it('renders content', () => {
    const vnode = Accordion({ items }, mockCtx())!
    const content = vnode.props.children[0].props.children[1]
    assert.equal(content.props.class, 'wf-accordion-content')
    assert.equal(content.props.children, '内容A')
  })
})
