import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Highlight } from './Highlight.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

function collectText(v: any): string[] {
  const out: string[] = []
  const walk = (n: any) => {
    if (n == null || typeof n === 'boolean') return
    if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return }
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (n.props?.children != null) walk(n.props.children)
  }
  walk(v)
  return out
}

describe('Highlight', () => {
  it('无命中词 → 原样文本', async () => {
    const vnode = await renderVNode(Highlight, { text: '你好世界' }, createTestCtx())!
    assert.deepEqual(collectText(vnode), ['你好世界'])
  })

  it('命中词包 <mark>', async () => {
    const vnode = await renderVNode(Highlight, { text: '搜索 张三 的结果', query: ['张三'] }, createTestCtx())!
    const marks = vnode.props.children.filter((c: any) => c?.type === 'mark')
    assert.equal(marks.length, 1)
    assert.equal(marks[0].props.children, '张三')
    assert.match(marks[0].props.class, /wf-highlight/)
  })

  it('多词命中', async () => {
    const vnode = await renderVNode(Highlight, { text: '张三 和 李四', query: ['张三', '李四'] }, createTestCtx())!
    const marks = vnode.props.children.filter((c: any) => c?.type === 'mark')
    assert.equal(marks.length, 2)
  })

  it('大小写不敏感', async () => {
    const vnode = await renderVNode(Highlight, { text: 'Hello World', query: ['hello'] }, createTestCtx())!
    const marks = vnode.props.children.filter((c: any) => c?.type === 'mark')
    assert.equal(marks[0].props.children, 'Hello')
  })

  it('无命中词 → 无 mark', async () => {
    const vnode = await renderVNode(Highlight, { text: '没有命中', query: ['xyz'] }, createTestCtx())!
    assert.ok(!vnode.props.children.some((c: any) => c?.type === 'mark'))
  })
})
