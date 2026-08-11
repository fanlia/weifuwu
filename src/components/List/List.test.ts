import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { List } from './List.ts'
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

describe('List', () => {
  it('items + renderItem 渲染列表项', async () => {
    const vnode = await renderVNode(List, {
      items: ['a', 'b'],
      renderItem: (item: string) => item,
    }, createTestCtx())!
    assert.match(vnode.props.class, /wf-list/)
    const ul = vnode.props.children.find((c: any) => c?.props?.class === 'wf-list-body')
    assert.equal(ul.props.children.length, 2)
    assert.equal(ul.props.children[0].type, 'li')
  })

  it('分隔线模式（divided）', async () => {
    const vnode = await renderVNode(List, { items: [1, 2], renderItem: (i: number) => String(i), divided: true }, createTestCtx())!
    assert.match(vnode.props.class, /wf-list--divided/)
  })

  it('空 items → EmptyState 占位', async () => {
    const vnode = await renderVNode(List, { items: [], renderItem: (i: any) => String(i), emptyText: '暂无数据' }, createTestCtx())!
    assert.ok(collectText(vnode).includes('暂无数据'))
  })

  it('header/footer 渲染', async () => {
    const vnode = await renderVNode(List, { items: [1], renderItem: (i: number) => String(i), header: '标题', footer: '页脚' }, createTestCtx())!
    assert.ok(collectText(vnode).includes('标题'))
    assert.ok(collectText(vnode).includes('页脚'))
  })
})
