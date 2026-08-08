import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Result } from './Result.ts'
import type { WfuiContext } from '../../client/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}
function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}
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
  it('success 状态渲染标题/描述', () => {
    const vnode = renderVNode(Result, { status: 'success', title: '操作成功', desc: '已保存' }, mockCtx())!
    assert.match(vnode.props.class, /wf-result/)
    assert.ok(collectText(vnode).includes('操作成功'))
    assert.ok(collectText(vnode).includes('已保存'))
  })

  it('各状态图标类', () => {
    for (const s of ['success', 'error', 'warning', 'info'] as const) {
      const vnode = renderVNode(Result, { status: s, title: 't' }, mockCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-result--${s}`))
    }
  })

  it('extra 操作区渲染', () => {
    const vnode = renderVNode(Result, { status: 'success', title: 't', extra: '返回首页' }, mockCtx())!
    assert.ok(collectText(vnode).includes('返回首页'))
  })
})
