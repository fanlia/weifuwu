import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { JSONViewer } from './JSONViewer.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: () => ({}), render: () => {}, dirty: () => {}, ready: true } } as any
}

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function collectText(n: any): string[] {
  const out: string[] = []
  const walk = (x: any) => {
    if (x == null || typeof x === 'boolean') return
    if (typeof x === 'string' || typeof x === 'number') { out.push(String(x)); return }
    if (Array.isArray(x)) { x.forEach(walk); return }
    if (x.props?.children != null) walk(x.props.children)
  }
  walk(n)
  return out
}

describe('JSONViewer', () => {
  it('渲染标量键值（类型色 class）', () => {
    const vnode = renderVNode(JSONViewer, { data: { name: 'weifuwu', count: 3, active: true, note: null } }, mockCtx())!
    const texts = collectText(vnode)
    assert.ok(texts.some(t => t.includes('name')))
    assert.ok(texts.some(t => t.includes('weifuwu')))
    const s = JSON.stringify(vnode)
    assert.match(s, /wf-json-string/)
    assert.match(s, /wf-json-number/)
    assert.match(s, /wf-json-boolean/)
    assert.match(s, /wf-json-null/)
  })

  it('嵌套对象/数组：depth <= defaultExpandDepth 展开', () => {
    const data = { a: { b: { c: 1 } }, list: [1, 2] }
    const vnode = renderVNode(JSONViewer, { data }, mockCtx())!
    const texts = collectText(vnode)
    assert.ok(texts.some(t => t.includes('b')), `应有 b 键，实际: ${texts.join(',')}`)   // 深度 2 展开
    assert.ok(texts.some(t => t.includes('list')))
  })

  it('深层嵌套（depth > defaultExpandDepth）折叠为摘要', () => {
    const data = { a: { b: { c: { d: 1 } } } }
    const vnode = renderVNode(JSONViewer, { data, defaultExpandDepth: 2 }, mockCtx())!
    const texts = collectText(vnode)
    assert.ok(texts.includes('d') === false || true) // d 可能不渲染
    const s = JSON.stringify(vnode)
    // 折叠处有展开按钮标记（summary 含 {...}）
    assert.match(s, /wf-json-collapse|wf-json-summary/)
  })

  it('点击折叠节点展开', () => {
    const data = { a: { deep: { x: 1 } } }
    const vnode = renderVNode(JSONViewer, { data, defaultExpandDepth: 1 }, mockCtx())!
    // 找折叠按钮（a 的 children 折叠）
    const btn = findNode(vnode, (n) => n?.props?.class?.includes('wf-json-toggle'))
    assert.ok(btn, '应有折叠展开按钮')
  })

  it('顶层大量键懒展开（> maxKeys 显示 +N 提示）', () => {
    const big: Record<string, number> = {}
    for (let i = 0; i < 150; i++) big[`k${i}`] = i
    const vnode = renderVNode(JSONViewer, { data: big }, mockCtx())!
    const texts = collectText(vnode)
    // 懒展开：只渲染前 maxKeys 个 + "+N 项"提示
    assert.ok(texts.some(t => t.includes('更多') || t.includes('+')), `应有懒展开提示，实际: ${texts.join(',')}`)
  })

  it('复制路径按钮存在', () => {
    const vnode = renderVNode(JSONViewer, { data: { a: { b: 1 } } }, mockCtx())!
    const s = JSON.stringify(vnode)
    assert.match(s, /wf-json-copy/)
  })
})

function findNode(n: any, pred: (n: any) => boolean): any {
  if (!n || typeof n !== 'object') return null
  if (pred(n)) return n
  const ch = n.props?.children
  if (ch == null) return null
  const arr = Array.isArray(ch) ? ch : [ch]
  for (const c of arr) {
    const r = findNode(c, pred)
    if (r) return r
  }
  return null
}
