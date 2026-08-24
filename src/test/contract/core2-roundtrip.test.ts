/**
 * core2 — round-trip 准则测试（R1/R2 不变量——core2 所有测试的基准）
 *
 * 准则（AGENTS.md §2 core2 节）：
 *   R1（vnode 侧）：html2vnode(vnode2html(v)) ≡ normalizeForRoundTrip(v)
 *   R2（string 侧）：vnode2html(html2vnode(w)) ≡ w
 *
 * 本文件同时导出 assertRoundTrip helper——core2 各测试文件的构造用例
 * 必须追加该断言（"所有测试都必须满足 round-trip"的执行机制）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vnode2html, html2vnode } from '../../client/vdom/core2/html.ts'
import { resetRegistry } from '../../client/vdom/core2/registry.ts'
import { FRAG_START, FRAG_END } from '../../client/vdom/core2/dom.ts'
import { normalizeForRoundTrip } from '../../client/vdom/core2/roundtrip.ts'
import { h, Fragment, type VNodeChild } from '../../client/vdom/core2/vnode.ts'

/** round-trip 断言 helper（R1 + R2 同时验证——core2 测试通用） */
export async function assertRoundTrip(v: VNodeChild): Promise<void> {
  const html = await vnode2html(v)
  const back = html2vnode(html)
  // R1：vnode 侧——还原 ≡ 归一（可序列化面——单值归一：数组输入 → 数组）
  const expected = normalizeForRoundTrip(v)
  assert.deepEqual(back, expected,
    `R1: html2vnode(vnode2html(v)) ≡ normalize(v)\nhtml: ${html}`)
  // R2：string 侧——重序列化 ≡ 原串（单值归一后对称）
  const html2 = await vnode2html(back)
  assert.equal(html2, html, `R2: vnode2html(html2vnode(w)) ≡ w\nw: ${html}`)
}

test('R1/R2：全形态 vnode round-trip（准则基准用例）', async () => {
  const cases: VNodeChild[] = [
    'hello',
    42,
    null,
    h('div', { class: 'a' }, 'x'),
    h('div', { class: 'a', id: 'x' }, h('span', { title: 't' }, 'hi'), null, 'tail'),
    ['a', h('b', {}, 'bold'), null],
    h('ul', {}, h('li', {}, '1'), h('li', {}, '2')),
    h('div', {}, h('br', {}), h('input', { type: 'text', value: 'v' })),
    h('p', { 'data-x': 'a"b' }, 'a < b & c'),
    h('button', { disabled: true, count: 3 }, 'b'), // 非字符串属性——data-wf-types 保真
    h('div', { style: { backgroundColor: 'red', fontSize: '12px' } }, 's'),
  ]
  for (const v of cases) await assertRoundTrip(v)
})

test('R1/R2：规范 HTML 全形态 round-trip（string 侧基准）', async () => {
  const strings = [
    'plain',
    'a &lt; b &amp; c',
    `<!--wf-hole: null-->`,
    `<!--wf-hole: true-->`,
    `<div data-wf-id="root" class="a">x</div>`,
    `<div data-wf-id="root" title="a &quot;q&quot;">y</div>`,
    `<ul data-wf-id="root"><li data-wf-id="root.0">1</li><!--wf-hole: false--><li data-wf-id="root.2">2</li></ul>`,
    `<div data-wf-id="root" style="background-color:red"></div>`,
    `<!--${FRAG_START}-->a<!--${FRAG_END}-->`,
    `<!--${FRAG_START}--><br data-wf-id="root.1"/><img data-wf-id="root.2" src="a.png"/><!--${FRAG_END}-->`, // 多节点序列 = 数组锚包裹（start root.0——项 root.1/root.2）
  ]
  for (const w of strings) {
    const back = await vnode2html(html2vnode(w))
    assert.equal(back, w, `R2: ${w}`)
  }
})

test('R1：保真范围边界——归一后 round-trip 恒等（style 对象/事件/数字/布尔）', async () => {
  // style 对象 → 字符串（归一期望）
  await assertRoundTrip(h('div', { style: { color: 'red' } }, 'x'))
  // 事件函数剔除（归一期望——函数不在序列化面）
  await assertRoundTrip(h('button', { onClick: () => {}, disabled: true }, 'b'))
  // number → 字符串
  await assertRoundTrip(42)
  // key 剔除（HTML 面不编码）
  await assertRoundTrip(h('li', { key: 'k1' }, '1'))
})

test('R1：组件展开结构与 Fragment 展开——round-trip 到展开数组（符号面不参与）', async () => {
  // 组件展开后的树（已展开——函数面不参与）
  await assertRoundTrip(h('div', {}, h('div', { class: 'c' }, 'inner')))
  // Fragment 展开（归一后 = 数组——锚包裹）
  const fragHtml = await vnode2html(h(Fragment, {}, 'a', 'b'))
  assert.equal(fragHtml, `<!--${FRAG_START}-->a<!--wf-hole: split-->b<!--${FRAG_END}-->`, '连续文本 split 锚（不 merge——array 节点类型保真）')
  await assertRoundTrip(h(Fragment, {}, 'a', 'b'))
})

test('R1/R2：文本面值类型完备（number/undefined/元素 children split——A3 单射）', async () => {
  const cases: VNodeChild[] = [
    // 元素 children 连续 string——split 分隔（不 merge——与 'ab' 区分）
    h('div', {}, 'a', 'b'),
    h('div', {}, 'ab'),
    // 元素 children number 文本——tn 标记
    h('div', {}, 42),
    h('div', {}, 'x', 42, 'y'),
    // undefined 独立保真（与 null 区分）
    h('div', {}, undefined),
    h('div', {}, null),
    h('div', {}, 'a', undefined, 'b'),
    // 数组 number 混合（tn 与 split 协同）
    [42, 'a'],
    ['a', 42],
    [42, 42],
    ['a', 42, 'b'],
  ]
  for (const v of cases) {
    const html = await vnode2html(v)
    const back = html2vnode(html)
    assert.deepEqual(back, normalizeForRoundTrip(v), `R1 恒等: ${html}`)
    // R2（单值/数组两侧）
    if (Array.isArray(v)) {
      assert.equal(await vnode2html(back), html, `R2 恒等: ${html}`)
    } else {
      assert.equal(await vnode2html(back), html, `R2 恒等: ${html}`)
    }
  }
  // A3 单射：不同 vnode → 可区分 DOM
  const a = await vnode2html(h('div', {}, 'a', 'b'))
  const b = await vnode2html(h('div', {}, 'ab'))
  assert.notEqual(a, b, "'a','b' 与 'ab' 的 DOM 可区分（split）")
  assert.notEqual(await vnode2html(h('div', {}, undefined)), await vnode2html(h('div', {}, null)), 'undefined 与 null 可区分')
  assert.notEqual(await vnode2html(h('div', {}, 42)), await vnode2html(h('div', {}, '42')), 'number 与 string 可区分（tn）')
})

test('R1/R2：普通对象/数组属性值保真（data-wf-props——[object Object] 歧义歼灭）', async () => {
  const cases: VNodeChild[] = [
    h('div', { data: { a: 1, nested: { b: 'x', c: true } } }),
    h('div', { items: [1, '2', { c: 3 }, null] }),
    h('div', { meta: {}, count: 3, flag: true, title: 't' }), // 混合面（对象 + 类型表 + 字符串）
    h('div', { deep: { arr: [[1, 2], ['a']], obj: { n: 42 } } }),
  ]
  for (const v of cases) {
    const html = await vnode2html(v)
    const back = html2vnode(html)
    assert.deepEqual(back, normalizeForRoundTrip(v), `R1 恒等: ${html}`)
    assert.equal(await vnode2html(back), html, `R2 恒等: ${html}`)
  }
  // 属性面显示（兼容）+ 标记 JSON
  const html = await vnode2html(h('div', { data: { a: 1 } }))
  assert.equal(html, '<div data-wf-id="root" data="[object Object]" data-wf-props="{&quot;data&quot;:{&quot;a&quot;:1}}"></div>', '属性面 String + data-wf-props JSON')
  // 逆向：对象还原 + 标记删除
  const back = html2vnode(html)
  assert.deepEqual(back, h('div', { data: { a: 1 } }), '对象精确还原（含 number 值）——标记删除')
  // A3 单射：对象属性 vs 字符串属性可区分
  assert.notEqual(html, await vnode2html(h('div', { data: '[object Object]' })), '对象与字符串可区分（data-wf-props）')
  // 空对象属性（{} 保真——不再丢）
  assert.deepEqual(html2vnode(await vnode2html(h('div', { meta: {} }))), h('div', { meta: {} }), '空对象保真')
})

test('R1/R2：key 保真（data-wf-key——vnode 顶层字段——含特殊字符）', async () => {
  for (const key of ['a', 'a.b', 'ka', '100', 'x%y', 'a.b.c']) {
    const v = h('li', { key }, 'item')
    await assertRoundTrip(v) // R1：key 还原 + R2：data-wf-key 重序列化
  }
  // 无 key 零开销
  assert.equal(await vnode2html(h('li', {}, 'x')), '<li data-wf-id="root">x</li>', '无 key 不加标记')
  // A3：key 与无 key 可区分
  assert.notEqual(await vnode2html(h('li', { key: 'a' }, 'x')), await vnode2html(h('li', {}, 'x')), 'key 保真可区分')
})

test('id 层：data-wf-id 位置参数（确定性——槽位推进与事件流一致）', async () => {
  // 嵌套 + 空洞 + 数组——id 路径验证
  const html = await vnode2html(
    h('div', {}, h('section', {}, h('p', {}, 'x'), null), ['a', h('b', {}, 'y')]),
  )
  assert.equal(
    html,
    '<div data-wf-id="root"><section data-wf-id="root.0"><p data-wf-id="root.0.0">x</p><!--wf-hole: null--></section>' +
    '<!--wf-hole: fragment-start-->a<b data-wf-id="root.1.2">y</b><!--wf-hole: fragment-end--></div>',
    'id 路径：section root.0（内部 p root.0.0）——数组兄弟槽 root.1（start root.1.0——a root.1.1——b root.1.2）',
  )
  // 逆向：id 标记删除（vnode 面干净——位置是渲染状态）
  const back = html2vnode(html)
  assert.equal((back as any).props['data-wf-id'], undefined, 'id 标记不进 vnode 面')
})

test('R1/R2：组件符号面注册表化（A2 对组件成立——props/children/key 完整保真）', async () => {
  const Inner = () => () => h('span', { class: 'i' }, 'inner')
  const Card = () => (props: Record<string, unknown>) =>
    h('div', { class: 'card' }, (props as any).title, h(Inner, {}))
  const fn = () => {}
  resetRegistry()
  const v = h(Card, {
    title: 'T',
    count: 3,
    flag: true,
    style: { color: 'red' },
    data: { nested: { x: 1 } },
    onClick: fn,
    key: 'card.1',
  }, h('b', {}, 'child'))
  // R1：逆向恢复组件 vnode（props 全类型 + children + key——=== 组件函数）
  const html = await vnode2html(v)
  const back = html2vnode(html)
  assert.deepEqual(back, normalizeForRoundTrip(v), '组件 vnode 精确恢复（A2 对组件成立）')
  assert.equal((back as any).type, Card, '组件函数同一引用（===）')
  assert.equal((back as any).props.onClick, fn, '函数 props 引用恒等')
  assert.equal((back as any).key, 'card.1', 'key 保真')
  assert.deepEqual((back as any).props.children, h('b', {}, 'child'), 'children 原声明恢复（非展开痕迹）')
  // R2：重序列化恒等
  assert.equal(await vnode2html(back), html, 'R2 恒等（组件）')
  // 多根输出组件——边界（展开结构——不标记）
  const Multi = () => () => [h('span', {}, 'a'), h('span', {}, 'b')]
  resetRegistry()
  const m = await vnode2html(h(Multi, {}))
  assert.ok(!m.includes('data-wf-component'), '多根输出不标记（边界——展开结构）')
})
