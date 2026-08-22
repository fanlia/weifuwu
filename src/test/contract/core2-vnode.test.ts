/**
 * core2 — vnode 类型判定契约（6 类型判别联合——classify 单一判定点）
 *
 * 锁定：① classify 全分支（text/hole/element/component/array/invalid——
 * **fragment 归一 array**：Fragment 符号 = 数组——消费点零特判）② 纯数据面
 * （vnode 零回填——key 剥离——children 原样）③ 投影规则（childrenOf/
 * slotCount——嵌套摊平——空洞保留）④ 边界（number→text 字符串化、
 * 数字 type→invalid）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classify, kindOf, h, jsx, Fragment, invalidDiagnostic,
  childrenOf, slotCount, type VNode, type VNodeChild,
} from '../../client/vdom/core2/vnode.ts'

test('classify：text（string/number 统一字符串化）', () => {
  assert.deepEqual(classify('hi'), { kind: 'text', value: 'hi' })
  assert.deepEqual(classify(42), { kind: 'text', value: '42' }, 'number → text 且字符串化（fuzz#79 教训）')
  assert.deepEqual(classify(0), { kind: 'text', value: '0' })
})

test('classify：hole（值保真——null/undefined/boolean 原样）', () => {
  assert.deepEqual(classify(null), { kind: 'hole', value: null })
  assert.deepEqual(classify(undefined), { kind: 'hole', value: null }, 'undefined 归一 null')
  assert.deepEqual(classify(false), { kind: 'hole', value: false })
  assert.deepEqual(classify(true), { kind: 'hole', value: true }, 'true/false 值保真（逆向恢复原始 vnode 状态）')
})

test('classify：element / component（type 三态中的两态）', () => {
  const el = h('div', { class: 'a' }, 'x')
  assert.deepEqual(classify(el), { kind: 'element', v: el })
  const Comp = () => () => h('span', {})
  const comp = h(Comp, {})
  assert.deepEqual(classify(comp), { kind: 'component', v: comp })
})

test('classify：fragment 归一 array（Fragment 符号 = 数组——标记不展开）', () => {
  const frag = h(Fragment, {}, 'a', 'b')
  assert.equal(classify(frag).kind, 'array', 'Fragment vnode → array kind')
  assert.deepEqual(classify(frag), { kind: 'array', items: ['a', 'b'] })
  // 嵌套 Fragment **不展开**（保持原样——消费点递归 classify 自然归一）
  const inner = h(Fragment, {}, 'x', null)
  const nested = h(Fragment, {}, inner, 'y')
  assert.deepEqual(classify(nested), { kind: 'array', items: [inner, 'y'] })
  // 但消费点递归 classify 时逐层归一（fragment = array 的递归语义）
  const c = classify(nested)
  assert.equal(c.kind, 'array')
  const c0 = classify(c.items[0])
  assert.equal(c0.kind, 'array')
  assert.deepEqual(c0, { kind: 'array', items: ['x', null] })
})

test('classify：array（嵌套保留——数组项独立——空洞保留）', () => {
  const items: VNodeChild[] = [h('span', {}), [h('b', {}), 'x'], null]
  const c = classify(items)
  assert.equal(c.kind, 'array')
  assert.deepEqual(c.items, items, '嵌套保留（消费点递归 classify——子区间锚保真层级）')
})

test('classify：invalid（数字 type / 普通对象——诊断不崩溃）', () => {
  const bad1 = { type: 123, props: {} } as unknown as VNode
  const c1 = classify(bad1)
  assert.equal(c1.kind, 'invalid')
  assert.ok(invalidDiagnostic(c1.v).includes('非法'), '诊断信息可读')
  const c2 = classify({ foo: 1 } as unknown as VNodeChild)
  assert.equal(c2.kind, 'invalid')
})

test('h：纯数据面——key 剥离进 vnode.key（props 不见 key）', () => {
  const v = h('div', { key: 'k1', id: 'x' }, 'a')
  assert.equal(v.key, 'k1')
  assert.ok(!('key' in v.props), 'key 从 props 剥离')
  assert.equal(v.props.id, 'x')
  assert.deepEqual(v.props.children, 'a', '单子节点直接存（非数组）')
  assert.equal(Object.keys(v).length, 3, 'vnode 零回填字段（type/props/key）')
})

test('h：children 形态（单/多/无——原样保留空洞与嵌套数组）', () => {
  assert.deepEqual(h('div', {}).props.children, undefined, '无子节点不存')
  assert.deepEqual(h('div', {}, 'a').props.children, 'a', '单子节点直接存')
  const kids = ['a', null, [h('span', {}), false]]
  const v = h('div', {}, ...kids as never)
  assert.deepEqual(v.props.children, kids, '多子节点存数组——空洞/嵌套数组原样（h 零转换——展开在消费侧）')
})

test('h/jsx：key 非字符串归一 null', () => {
  assert.equal(h('div', { key: 42 as never }).key, null, '数字 key 归一 null（无 key = 位置身份）')
  assert.equal(jsx('div', { id: 'a' }, 'k1').key, 'k1')
  assert.equal(jsx('div', { key: 'x' }).key, 'x', 'jsx 三参与 props.key 同源')
})

test('kindOf：与 classify 同源（6 类型全覆盖——fragment = array）', () => {
  assert.equal(kindOf('x'), 'text')
  assert.equal(kindOf(null), 'hole')
  assert.equal(kindOf(h('div', {})), 'element')
  assert.equal(kindOf(h(() => () => h('span', {}), {})), 'component')
  assert.equal(kindOf(h(Fragment, {}, 'a')), 'array')
  assert.equal(kindOf(['a', 'b']), 'array')
  assert.equal(kindOf({ type: 1, props: {} } as unknown as VNodeChild), 'invalid')
})

test('childrenOf：元素 children 读取（单一规则源——嵌套保留——空洞保留）', () => {
  assert.deepEqual(childrenOf(h('div', {})), [], '无子节点 → 空')
  assert.deepEqual(childrenOf(h('div', {}, 'a')), ['a'], '单子节点包数组')
  assert.deepEqual(childrenOf(h('div', {}, 'a', null, [h('b', {}), 'x'])), ['a', null, [h('b', {}), 'x']], '嵌套数组保留（消费点递归）')
  // Fragment vnode **不展开**（保持原样——消费点递归）
  const inner = h(Fragment, {}, 'b')
  assert.deepEqual(childrenOf(h(Fragment, {}, 'a', inner)), ['a', inner])
})

test('slotCount：投影维度（array 递归计数——Fragment 不展开但递归归一）', () => {
  assert.equal(slotCount('x'), 1)
  assert.equal(slotCount(null), 1)
  assert.equal(slotCount(h('div', {})), 1)
  assert.equal(slotCount(h(() => () => h('span', {}), {})), 1)
  // 数组占 项和 + 2（start/end 边界锚）+ 连续文本 split
  assert.equal(slotCount(['a', 'b']), 5, "['a','b'] = 2锚 + 2项 + 1 split")
  assert.equal(slotCount(['ab']), 3, "['ab'] 单文本项——无 split")
  assert.equal(slotCount([h('div', {}), null, 'x']), 5, '非连续文本——无 split')
  // 嵌套数组递归计数（含内层锚 + split）：外层2 + div1 + 内层['a',['b','c']]（2+1+2+1+1+1split=8） = 11
  assert.equal(slotCount([h('div', {}), ['a', ['b', 'c']]]), 11)
  // 嵌套 Fragment：2锚 + a1 + 内层(2+1+1+1split) + d1 = 9
  assert.equal(slotCount(h(Fragment, {}, 'a', h(Fragment, {}, 'b', 'c'), 'd')), 9)
})
