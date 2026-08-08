import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Title, Text, Paragraph } from './Typography.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Typography', () => {
  describe('Title', () => {
    it('renders h1 default with text', () => {
      const vnode = renderVNode(Title, { children: '标题' }, mockCtx())!
      assert.equal(vnode.type, 'h1')
      assert.match(vnode.props.class, /wf-title/)
      assert.equal(vnode.props.children, '标题')
    })

    it('renders level 2-5 as h2-h5', () => {
      for (const l of [1, 2, 3, 4, 5] as const) {
        const vnode = renderVNode(Title, { level: l, children: 'x' }, mockCtx())!
        assert.equal(vnode.type, `h${l}`)
        assert.match(vnode.props.class, new RegExp(`wf-title--${l}`))
      }
    })
  })

  describe('Text', () => {
    it('renders span with text', () => {
      const vnode = renderVNode(Text, { children: '文本' }, mockCtx())!
      assert.equal(vnode.type, 'span')
      assert.match(vnode.props.class, /wf-text/)
      assert.equal(vnode.props.children, '文本')
    })

    it('applies type variant', () => {
      for (const t of ['secondary', 'success', 'warning', 'danger'] as const) {
        const vnode = renderVNode(Text, { type: t, children: 'x' }, mockCtx())!
        assert.match(vnode.props.class, new RegExp(`wf-text--${t}`))
      }
    })

    it('applies strong/underline/strikethrough', () => {
      const vnode = renderVNode(Text, { strong: true, underline: true, children: 'x' }, mockCtx())!
      assert.match(vnode.props.class, /wf-text--strong/)
      assert.match(vnode.props.class, /wf-text--underline/)
    })

    it('applies size', () => {
      const vnode = renderVNode(Text, { size: 'lg', children: 'x' }, mockCtx())!
      assert.match(vnode.props.class, /wf-text--lg/)
    })
  })

  describe('Paragraph', () => {
    it('renders p with text', () => {
      const vnode = renderVNode(Paragraph, { children: '段落' }, mockCtx())!
      assert.equal(vnode.type, 'p')
      assert.match(vnode.props.class, /wf-paragraph/)
      assert.equal(vnode.props.children, '段落')
    })

    it('applies ellipsis', () => {
      const vnode = renderVNode(Paragraph, { ellipsis: true, children: 'x' }, mockCtx())!
      assert.match(vnode.props.class, /wf-paragraph--ellipsis/)
    })

    it('applies type variant', () => {
      const vnode = renderVNode(Paragraph, { type: 'secondary', children: 'x' }, mockCtx())!
      assert.match(vnode.props.class, /wf-text--secondary/)
    })
  })
})
