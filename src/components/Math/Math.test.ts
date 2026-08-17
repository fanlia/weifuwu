import { describe, it } from 'node:test'
import assert from 'node:assert'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'
import { Math } from './Math.ts'

function findClass(vnode: any, cls: string): any {
  if (typeof vnode?.props?.class === 'string' && vnode.props.class.includes(cls)) return vnode
  const kids = vnode?.props?.children
  if (kids) {
    const arr = Array.isArray(kids) ? kids : [kids]
    for (const k of arr) { const f = findClass(k, cls); if (f) return f }
  }
  return null
}

it('Math：上下标渲染（x^2 → sup）', async () => {
  const vnode: any = await renderVNode(Math, { tex: 'x^2' }, createTestCtx())
  assert.ok(vnode, '渲染')
  assert.ok(findClass(vnode, 'wf-math-sup'), '上标元素存在')
})

it('Math：分数渲染（frac）', async () => {
  const vnode: any = await renderVNode(Math, { tex: String.raw`\frac{1}{2}` }, createTestCtx())
  assert.ok(findClass(vnode, 'wf-math-frac'), '分数元素存在')
})

it('Math：希腊字母 + 未知命令原样（诚实裁剪）', async () => {
  const vnode: any = await renderVNode(Math, { tex: String.raw`\alpha + \unknown` }, createTestCtx())
  const texts: string[] = []
  const walk = (n: any) => {
    if (typeof n === 'string') texts.push(n)
    const kids = n?.props?.children
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(walk)
  }
  walk(vnode)
  assert.ok(texts.join('').includes('α'), '希腊字母渲染')
  assert.ok(texts.join('').includes(String.raw`\unknown`), '未知命令原样保留（诚实裁剪）')
})
