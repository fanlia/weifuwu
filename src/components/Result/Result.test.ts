import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Result } from './Result.ts'
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

describe('Result', () => {
  it('success 状态渲染标题/描述', async () => {
    const vnode = await renderVNode(Result, { status: 'success', title: '操作成功', desc: '已保存' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-result/)
    assert.ok(collectText(vnode).includes('操作成功'))
    assert.ok(collectText(vnode).includes('已保存'))
  })

  it('各状态图标类', async () => {
    for (const s of ['success', 'error', 'warning', 'info'] as const) {
      const vnode = await renderVNode(Result, { status: s, title: 't' }, createTestCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-result--${s}`))
    }
  })

  it('extra 操作区渲染', async () => {
    const vnode = await renderVNode(Result, { status: 'success', title: 't', extra: '返回首页' }, createTestCtx())!
    assert.ok(collectText(vnode).includes('返回首页'))
  })
})
