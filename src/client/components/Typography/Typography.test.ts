import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Title, Text, Paragraph } from './Typography.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */


describe('Typography', () => {
  describe('Title', () => {
    it('renders h1 default with text', async () => {
      const vnode = await renderVNode(Title, { children: '标题' }, createTestCtx())!
      assert.equal(vnode.type, 'h1')
      assert.match(vnode.props.class, /wf-title/)
      assert.equal(vnode.props.children, '标题')
    })

    it('renders level 2-5 as h2-h5', async () => {
      for (const l of [1, 2, 3, 4, 5] as const) {
        const vnode = await renderVNode(Title, { level: l, children: 'x' }, createTestCtx())!
        assert.equal(vnode.type, `h${l}`)
        assert.match(vnode.props.class, new RegExp(`wf-title--${l}`))
      }
    })
  })

  describe('Text', () => {
    it('renders span with text', async () => {
      const vnode = await renderVNode(Text, { children: '文本' }, createTestCtx())!
      assert.equal(vnode.type, 'span')
      assert.match(vnode.props.class, /wf-text/)
      assert.equal(vnode.props.children, '文本')
    })

    it('applies type variant', async () => {
      for (const t of ['secondary', 'success', 'warning', 'danger'] as const) {
        const vnode = await renderVNode(Text, { type: t, children: 'x' }, createTestCtx())!
        assert.match(vnode.props.class, new RegExp(`wf-text--${t}`))
      }
    })

    it('applies strong/underline/strikethrough', async () => {
      const vnode = await renderVNode(Text, { strong: true, underline: true, children: 'x' }, createTestCtx())!
      assert.match(vnode.props.class, /wf-text--strong/)
      assert.match(vnode.props.class, /wf-text--underline/)
    })

    it('applies size', async () => {
      const vnode = await renderVNode(Text, { size: 'lg', children: 'x' }, createTestCtx())!
      assert.match(vnode.props.class, /wf-text--lg/)
    })
  })

  describe('Paragraph', () => {
    it('renders p with text', async () => {
      const vnode = await renderVNode(Paragraph, { children: '段落' }, createTestCtx())!
      assert.equal(vnode.type, 'p')
      assert.match(vnode.props.class, /wf-paragraph/)
      assert.equal(vnode.props.children, '段落')
    })

    it('applies ellipsis', async () => {
      const vnode = await renderVNode(Paragraph, { ellipsis: true, children: 'x' }, createTestCtx())!
      assert.match(vnode.props.class, /wf-paragraph--ellipsis/)
    })

    it('applies type variant', async () => {
      const vnode = await renderVNode(Paragraph, { type: 'secondary', children: 'x' }, createTestCtx())!
      assert.match(vnode.props.class, /wf-text--secondary/)
    })
  })
})
