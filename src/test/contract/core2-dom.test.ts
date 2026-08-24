/**
 * core2 — vnode ⟷ DOM 双向转换契约（核心公理 A1/A2/A3——结构级——无 id）
 *
 * 锁定：① round-trip（dec(enc(v)) = v——可序列化面——字符串属性完全
 * 保真）② 单射（同位置的异 vnode → 结构可区分的 DOM）③ 组件展开区间
 * （组件 → 展开结构——逆向恢复展开）④ 保真范围（number/bool 字符串化、
 * style 对象 → cssText 字符串、事件跳过）
 *
 * 测试基座：最小 fake DOM（契约层零浏览器传统——结构断言不依赖真实
 * DOM 行为——真实浏览器由场景层覆盖）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vnode2dom, dom2vnode, dom2vnodeAll, HOLE_NULL, HOLE_TRUE, HOLE_FALSE, FRAG_START, FRAG_END, type DomFactory } from '../../client/vdom/core2/dom.ts'
import { h, Fragment, type VNodeChild } from '../../client/vdom/core2/vnode.ts'

// ── 最小 fake DOM（结构面：nodeType/childNodes/textContent/attributes） ──

class FakeNode {
  nodeType = 0
  parentNode: FakeNode | null = null
  childNodes: FakeNode[] = []
  textContent: string | null = null
  appendChild(c: FakeNode): FakeNode {
    c.parentNode = this
    this.childNodes.push(c)
    return c
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
  getAttribute(n: string): string | null {
    return this.attributes.find((x) => x.name === n)?.value ?? null
  }
}

const fakeDoc: DomFactory = {
  createTextNode: (t) => new FakeText(t) as unknown as Text,
  createComment: (t) => new FakeComment(t) as unknown as Comment,
  createElement: (t) => new FakeElement(t) as unknown as Element,
}

/** round-trip：vnode → DOM → vnode（结构相等——断言 vnode 深等） */
async function roundTrip(v: VNodeChild): Promise<VNodeChild> {
  const nodes = await vnode2dom(v, fakeDoc)
  const back = dom2vnodeAll(nodes)
  return back.length === 1 ? back[0]! : back
}

test('A1/A2：element 树 round-trip（字符串属性完全保真）', async () => {
  const v = h('div', { class: 'a', id: 'x' },
    h('span', { title: 't' }, 'hello'),
    h('b', {}, 'bold', null),
  )
  assert.deepEqual(await roundTrip(v), v, 'dec(enc(v)) = v——结构恒等')
})

test('A1/A2：text/hole 单节点 round-trip', async () => {
  assert.equal(await roundTrip('hi'), 'hi')
  assert.equal(await roundTrip(42), 42, 'number 保真（text-number 标记）')
  assert.equal(await roundTrip(undefined), undefined, 'undefined 保真（wf-hole: undefined——不再归一 null）')
  assert.equal(await roundTrip(null), null, 'null 保真')
  assert.equal(await roundTrip(true), true, 'true 保真')
  assert.equal(await roundTrip(false), false, 'false 保真')
  assert.equal(await roundTrip(null), null, 'hole → wf-hole: null 注释 → null')
  assert.equal(await roundTrip(true), true, 'hole 值保真（true 逆向恢复 true）')
  assert.equal(await roundTrip(false), false)
})

test('A1/A2：array round-trip（边界锚包裹——数组结构恢复）', async () => {
  const items: VNodeChild[] = [h('i', {}, 'a'), 'x', null, h('u', {}, 'b')]
  const back = await roundTrip(items)
  assert.deepEqual(back, items, '数组 ↔ start/end 锚包裹——逆向恢复数组（含 null 项——roundTrip 返回恢复的数组）')
})

test('A1：fragment 归一（Fragment vnode → 展开节点——无中间层）', async () => {
  const frag = h(Fragment, {}, 'a', h('span', {}, 'b'))
  const nodes = await vnode2dom(frag, fakeDoc)
  assert.equal(nodes.length, 4, 'Fragment 展开 = start 锚 + 两项 + end 锚')
  const back = dom2vnodeAll(nodes)
  assert.deepEqual(back, [['a', h('span', {}, 'b')]], '逆向恢复数组结构')
})

test('A1/A2：组件展开区间 round-trip（组件 → 展开结构——函数面不可恢复）', async () => {
  const Comp = () => () => h('div', { class: 'c' }, 'inner')
  const v = h('div', {}, h(Comp, {}))
  const back = await roundTrip(v)
  // 组件展开为 div(class=c)>inner——逆向恢复展开结构（组件引用不可序列化）
  assert.deepEqual(back, h('div', {}, h('div', { class: 'c' }, 'inner')))
})

test('A1：组件输出多根（array 输出）——展开区间多项', async () => {
  const Multi = () => () => [h('span', {}, 'a'), h('span', {}, 'b')]
  const nodes = await vnode2dom(h(Multi, {}), fakeDoc)
  assert.equal(nodes.length, 4, '组件输出数组 → start 锚 + 两项 + end 锚')
  assert.deepEqual(dom2vnodeAll(nodes), [[h('span', {}, 'a'), h('span', {}, 'b')]], '逆向恢复数组结构')
})

test('A3：单射——同位置异 vnode → 结构可区分的 DOM', async () => {
  const n1 = await vnode2dom(h('div', { class: 'a' }, 'x'), fakeDoc)
  const n2 = await vnode2dom(h('div', { class: 'b' }, 'x'), fakeDoc)
  assert.notEqual((n1[0] as Element).getAttribute('class'), (n2[0] as Element).getAttribute('class'))
  const n3 = await vnode2dom(h('span', { class: 'a' }, 'x'), fakeDoc)
  assert.notEqual((n1[0] as Element).tagName, (n3[0] as Element).tagName)
})

test('保真范围：style 对象 → cssText + data-wf-style JSON（逆向还原对象——歧义歼灭）', async () => {
  const v = h('div', { style: { backgroundColor: 'red', fontSize: 14 } })
  const nodes = await vnode2dom(v, fakeDoc)
  const el = nodes[0] as Element
  assert.equal(el.getAttribute('style'), 'background-color:red;font-size:14', 'camelCase → kebab-case（属性面）')
  assert.equal(el.getAttribute('data-wf-style'), '{"backgroundColor":"red","fontSize":14}', 'style 对象 JSON（值类型保真）')
  const back = await roundTrip(v)
  assert.deepEqual(back, h('div', { style: { backgroundColor: 'red', fontSize: 14 } }), 'style 对象 round-trip 精确还原（含 number 值）')
  // 手写 HTML（无 data-wf-style）——style 保持字符串面（兼容）
  const str = await roundTrip(h('div', { style: 'color:red' }))
  assert.deepEqual(str, h('div', { style: 'color:red' }), '字符串 style 不受影响')
})
test('A1：hole 值编码（true/false/null 区分——注释内容）', async () => {
  const [n] = await vnode2dom(null, fakeDoc)
  assert.equal((n as unknown as FakeComment).textContent, HOLE_NULL)
  const [t] = await vnode2dom(true, fakeDoc)
  assert.equal((t as unknown as FakeComment).textContent, HOLE_TRUE)
  const [f] = await vnode2dom(false, fakeDoc)
  assert.equal((f as unknown as FakeComment).textContent, HOLE_FALSE)
})
test('A1/A2：数组边界锚（嵌套数组递归——逆向恢复层级）', async () => {
  const v: VNodeChild[] = ['a', ['b', 'c']]
  const nodes = await vnode2dom(v, fakeDoc)
  assert.deepEqual(nodes.map((n) => (n as unknown as FakeNode).nodeType), [8, 3, 8, 3, 8, 3, 8, 8], '外层锚 + 文本 + 内层锚 + b + split + c + 内层 end + 外层 end')
  const back = dom2vnodeAll(nodes)
  assert.deepEqual(back, [['a', ['b', 'c']]], '嵌套数组层级恢复')
  // roundTrip（单值归一）→ 恢复嵌套数组
  const back2 = await roundTrip(v)
  assert.deepEqual(back2, ['a', ['b', 'c']])
})

test('保真范围：事件/函数值跳过（函数表后续）', async () => {
  const fn = () => {}
  const v = h('button', { onClick: fn, disabled: true }, 'b')
  const nodes = await vnode2dom(v, fakeDoc)
  const el = nodes[0] as Element
  assert.equal(el.getAttribute('onClick'), null, '函数值不写 attribute')
  assert.equal(el.getAttribute('disabled'), 'true', 'boolean 字符串化（值面）')
  assert.equal(el.getAttribute('data-wf-types'), '{"disabled":"boolean"}', '类型表编码')
  // 逆向：类型还原 + 标记删除
  const back2 = await roundTrip(h('button', { disabled: true }, 'b'))
  assert.deepEqual(back2, h('button', { disabled: true }, 'b'), 'boolean 属性 round-trip 保真')
  // 函数面仍丢失（函数表后续）——但 boolean 类型已保真（data-wf-types）
  assert.deepEqual(await roundTrip(v), h('button', { disabled: true }, 'b'), 'round-trip：函数面丢失（已知）——boolean 类型保真（歧义已歼灭）')
})

test('A1：DOM 结构正确性（父子链/文本内容）', async () => {
  const v = h('ul', {}, h('li', {}, '1'), h('li', {}, '2'))
  const [ul] = await vnode2dom(v, fakeDoc)
  const el = ul as unknown as FakeElement
  assert.equal(el.childNodes.length, 2, '两个 li')
  assert.equal((el.childNodes[0] as unknown as FakeElement).childNodes.length, 1)
  assert.equal((el.childNodes[0]!.childNodes[0] as unknown as FakeText).textContent, '1')
})

test('A1：空洞保留（注释锚——childNodes 长度恒定——同构不变量）', async () => {
  const v = h('div', {}, 'a', null, 'b')
  const [div] = await vnode2dom(v, fakeDoc)
  const el = div as unknown as FakeElement
  assert.equal(el.childNodes.length, 3, '文本 + 锚注释 + 文本——不塌缩')
  assert.equal(el.childNodes[1]!.nodeType, 8)
  assert.equal((el.childNodes[1] as unknown as FakeComment).textContent, HOLE_NULL, 'null 值标记')
})
