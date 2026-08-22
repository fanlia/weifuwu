/**
 * core2 — 转换函数族可逆性契约（A4——x2y 双事件流）
 *
 * 对每个转换对（x2y）：
 * ① apply 流应用到 x 的 DOM → 结构 ≡ vnode2dom(y)（正向唯一——A1）
 * ② reverse 流逆序应用 → 结构恢复 ≡ vnode2dom(x)（可逆——A4：
 *    "事件流 + 当前节点 → 原节点"）
 * ③ 结构比较经 dom2vnode（A2 逆向）——归一后 vnode 恒等
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vnode2dom, dom2vnodeAll, type DomFactory } from '../../client/vdom/core2/dom.ts'
import { runTransform, runEmit } from '../../client/vdom/core2/transform.ts'
import { EventApplier, type DomNode } from '../../client/vdom/core2/patch.ts'
import { h, type VNodeChild } from '../../client/vdom/core2/vnode.ts'

// ── fake DOM（DomNode 接口——可 remove/序列化） ──

class FakeNode implements DomNode {
  nodeType = 0
  parentNode: DomNode | null = null
  childNodes: DomNode[] = []
  textContent: string | null = null
  appendChild(c: DomNode): DomNode { c.parentNode = this; this.childNodes.push(c); return c }
  remove(): void {
    if (this.parentNode) {
      const i = this.parentNode.childNodes.indexOf(this)
      if (i >= 0) this.parentNode.childNodes.splice(i, 1)
      this.parentNode = null
    }
  }
}
class FakeText extends FakeNode {
  nodeType = 3
  constructor(text: string) { super(); this.textContent = text }
}
class FakeComment extends FakeNode {
  nodeType = 8
  constructor(text: string) { super(); this.textContent = text }
}
class FakeElement extends FakeNode {
  nodeType = 1
  tagName: string
  attributes: { name: string; value: string }[] = []
  constructor(tag: string) { super(); this.tagName = tag }
  setAttribute(n: string, v: string): void {
    const a = this.attributes.find((x) => x.name === n)
    if (a) a.value = v
    else this.attributes.push({ name: n, value: v })
  }
}

const fakeDoc: DomFactory = {
  createTextNode: (t) => new FakeText(t) as unknown as Text,
  createComment: (t) => new FakeComment(t) as unknown as Comment,
  createElement: (t) => new FakeElement(t) as unknown as Element,
}

function applierFor(children: unknown[]): EventApplier {
  const root = new FakeNode()
  for (const c of children) root.appendChild(c as DomNode)
  return new EventApplier(root, {
    createElement: (t) => new FakeElement(t),
    createTextNode: (t) => new FakeText(t),
    createComment: (t) => new FakeComment(t),
  })
}

/** 转换可逆性全断言：boot（emitNew 构建初始态——nodes 表登记）→ apply →
 *  y 结构；reverse 逆序 → 恢复 x 结构
 *  期望侧 = dom2vnode(vnode2dom(v))（组件自动展开——与事件流语义一致） */
async function assertTransform(x: VNodeChild, y: VNodeChild): Promise<void> {
  const expectOf = async (v: VNodeChild): Promise<VNodeChild[]> => {
    const dom = await vnode2dom(v, fakeDoc)
    return dom2vnodeAll(dom as unknown as Node[])
  }
  // 0. 初始态 = emitNew(x) 的 apply 流（事件机制构建——nodes 表登记——
  //    id 一致——不依赖手工 DOM 预置）
  const a = applierFor([])
  a.applyAll(await runEmit(x, 'root.0', 'root', 0, null))
  // 与 vnode2dom 参考结构一致（A1——emitNew ≡ vnode2dom）
  assert.deepEqual(dom2vnodeAll(a.root.childNodes as unknown as Node[]), await expectOf(x),
    `初始态（emitNew）≡ vnode2dom(x)\n${JSON.stringify(await runEmit(x, 'root.0', 'root', 0, null))}`)
  // 1. 转换双流
  const { apply, reverse } = await runTransform(x, y, 'root.0', 'root', 0, null)
  assert.ok(apply.length > 0, `转换 ${x} → ${y} 必须产生事件流`)
  // 2. apply → y 结构
  a.applyAll(apply)
  assert.deepEqual(dom2vnodeAll(a.root.childNodes as unknown as Node[]), await expectOf(y),
    `apply 后 ≡ vnode2dom(y)\napply: ${JSON.stringify(apply)}`)
  // 3. reverse 流**逆序**应用（A4 契约——f(E, yDom) = 逆序应用）→ 恢复 x
  a.applyAll([...reverse].reverse())
  assert.deepEqual(dom2vnodeAll(a.root.childNodes as unknown as Node[]), await expectOf(x),
    `reverse 逆序后恢复 x\nreverse: ${JSON.stringify(reverse)}`)
}

const Comp = () => () => h('div', { class: 'c' }, 'inner')
const Multi = () => () => [h('span', {}, 'a'), h('span', {}, 'b')]

test('A4：hole ↔ element（条件渲染主场景——双向）', async () => {
  await assertTransform(null, h('div', { class: 'a' }, 'x', null, 'y'))
  await assertTransform(h('div', { class: 'a' }, 'x', null, 'y'), null)
})

test('A4：text ↔ element / text ↔ hole（双向）', async () => {
  await assertTransform('plain', h('span', { title: 't' }, 'x'))
  await assertTransform(h('span', { title: 't' }, 'x'), 'plain')
  await assertTransform(null, 'txt')
  await assertTransform('txt', null)
})

test('A4：element ↔ array / hole ↔ array / text ↔ array（多根区间——双向）', async () => {
  await assertTransform(h('div', {}, 'x'), ['a', h('b', {}, 'bold'), null])
  await assertTransform(['a', h('b', {}, 'bold'), null], h('div', {}, 'x'))
  await assertTransform(null, ['a', 'b'])
  await assertTransform(['a', 'b'], null)
  await assertTransform('t', ['a', null, 'b'])
  await assertTransform(['a', null, 'b'], 't')
})

test('A4：component 相关（x → 组件展开 / 组件 → x——双向）', async () => {
  await assertTransform(null, h(Comp, {}))
  await assertTransform(h(Comp, {}), null)
  await assertTransform(h('div', {}, 'x'), h(Comp, {}))
  await assertTransform(h(Comp, {}), h('p', {}, 'y'))
  await assertTransform(null, h(Multi, {}))
  await assertTransform(h(Multi, {}), 's')
})

test('A4：嵌套 element 双向（子树区间完整）', async () => {
  const x = h('ul', {}, h('li', {}, '1'), h('li', {}, '2'))
  await assertTransform(x, null)
  await assertTransform(null, x)
  const nested = h('section', {}, h('div', {}, 'a'), h('div', {}, 'b'))
  await assertTransform(nested, 'solo')
  await assertTransform('solo', nested)
})

test('转换表：同态显式 Reject（P2——无静默路径）', async () => {
  await assert.rejects(
    runTransform(h('div', {}), h('span', {}), 'root.0', 'root', 0, null),
    /同态/,
    'element → element 必须 Reject（diff 层处理）',
  )
})

test('转换表：未定义转换显式 Reject', async () => {
  // invalid → 全形态有定义（诊断让位）——验证不存在的组合不可达
  await assert.doesNotReject(runTransform({ type: 123 } as never, 'x', 'root.0', 'root', 0, null), 'invalid → text 有定义（诊断让位）')
})

test('事件流自足：reverse 不依赖旧 DOM（快照在事件流内）', async () => {
  // 从空容器开始应用 reverse——必须能重建 x（事件流携带完整信息）
  const x = h('div', { class: 'a' }, h('span', {}, 'x'), null, 'y')
  const y = 'gone'
  const { reverse } = await runTransform(x, y, 'root.0', 'root', 0, null)
  const a = applierFor([])
  a.applyAll([...reverse].reverse()) // 逆序应用——恢复旧态
  assert.deepEqual(dom2vnodeAll(a.root.childNodes as unknown as Node[]), await (async () => {
    const dom = await vnode2dom(x, fakeDoc)
    return dom2vnodeAll(dom as unknown as Node[])
  })(),
    'reverse 单独应用（空容器）→ 重建 x——事件流自足（A4）')
})
