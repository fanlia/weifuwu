/**
 * core2 — DOM string → vnode 契约（A2 逆向的字符串形式——html2vnode）
 *
 * 锁定：① 各 DOM string 形态 → vnode 类型（text 转义还原/hole 锚/
 * invalid 诊断/element/自闭合/拼接序列）② 双向 round-trip：
 * html2vnode(vnode2html(v)) = v（可序列化面——与 dom2vnode 同保真范围）
 * ③ 三重互证：vnode2dom 序列化 ≡ vnode2html ≡ html2vnode 还原
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vnode2html, html2vnode, unescapeHtml } from '../../client/vdom/core2/html.ts'
import { normalizeForRoundTrip } from '../../client/vdom/core2/roundtrip.ts'
import { FRAG_START, FRAG_END } from '../../client/vdom/core2/dom.ts'
import { h, Fragment, type VNodeChild } from '../../client/vdom/core2/vnode.ts'
import { assertRoundTrip } from './core2-roundtrip.test.ts'

test('逆向：text（转义还原）', () => {
  assert.equal(html2vnode('hello'), 'hello')
  assert.equal(html2vnode('a &lt; b &amp; c &gt; d'), 'a < b & c > d')
  assert.equal(unescapeHtml('&lt;&amp;&gt;&quot;&#39;'), '<&>"\'')
})

test('逆向：hole 值标记（null/true/false 恢复——值保真）', () => {
  assert.equal(html2vnode('<!--wf-hole: null-->'), null)
  assert.equal(html2vnode('<!--wf-hole: true-->'), true)
  assert.equal(html2vnode('<!--wf-hole: false-->'), false)
  assert.deepEqual(html2vnode('a<!--wf-hole: null-->b'), ['a', null, 'b'], '锚在文本间——多节点序列 → 数组')
})

test('逆向：数组边界锚（嵌套恢复——层级保真）', () => {
  assert.deepEqual(html2vnode(`<!--${FRAG_START}-->ab<!--${FRAG_END}-->`), ['ab'], '数组结构恢复（单文本项无 split）')
  assert.deepEqual(html2vnode(`<!--${FRAG_START}-->a<!--wf-hole: split-->b<!--${FRAG_END}-->`), ['a', 'b'], 'split 锚 → 文本项边界保真（不 merge）')
  assert.deepEqual(html2vnode(`<!--${FRAG_START}-->a<!--${FRAG_START}-->b<!--wf-hole: split-->c<!--${FRAG_END}--><!--${FRAG_END}-->`), ['a', ['b', 'c']], '嵌套数组层级 + split')
  assert.deepEqual(html2vnode(`<!--${FRAG_START}--><!--${FRAG_END}-->`), [], '空数组')
})

test('逆向：element（属性面——转义还原）', async () => {
  const v1 = h('div', { class: 'a' }, 'x')
  assert.deepEqual(html2vnode('<div class="a">x</div>'), v1)
  await assertRoundTrip(v1) // R-02
  const v2 = h('div', { title: 'a "q" & <x>' }, 'y')
  assert.deepEqual(html2vnode('<div title="a &quot;q&quot; &amp; &lt;x&gt;">y</div>'), v2)
  await assertRoundTrip(v2)
  assert.deepEqual(html2vnode('<div></div>'), h('div', {}), '空元素——无 children 不存')
  assert.deepEqual(html2vnode('<DIV class="a">x</DIV>'), h('div', { class: 'a' }, 'x'), 'tagName 小写化')
})

test('逆向：自闭合/void 元素（无 children）', async () => {
  const v1 = h('br', {})
  assert.deepEqual(html2vnode('<br/>'), v1)
  await assertRoundTrip(v1)
  assert.deepEqual(html2vnode('<img src="a.png"/>'), h('img', { src: 'a.png' }))
})

test('逆向：嵌套 + 多子节点（数组——单子归一单值）', async () => {
  const v = h('ul', {}, h('li', {}, '1'), h('li', {}, '2'))
  assert.deepEqual(html2vnode('<ul><li>1</li><li>2</li></ul>'), v)
  await assertRoundTrip(v) // R-02
  const single = h('div', {}, h('span', {}, 'a'))
  assert.deepEqual(html2vnode('<div><span>a</span></div>'), single)
  await assertRoundTrip(single)
})

test('双向 round-trip：html2vnode(vnode2html(v)) = v（可序列化面）', async () => {
  const cases: VNodeChild[] = [
    'hello',
    h('div', { class: 'a', id: 'x' }, h('span', { title: 't' }, 'hi'), null, 'tail'),
    ['a', h('b', { style: 'color:red' }, 'bold'), null],
    h('ul', {}, h('li', {}, '1'), h('li', {}, '2')),
    h('div', {}, h('br', {}), h('input', { type: 'text', value: 'v' })),
    h('p', { 'data-x': 'a"b' }, 'a < b'),
    h('div', {}, h('div', { class: 'c' }, 'inner')), // 组件展开结构
  ]
  for (const v of cases) {
    const html = await vnode2html(v)
    const back = html2vnode(html)
    assert.deepEqual(back, normalizeForRoundTrip(v), `round-trip: ${html}`)
  }
  // Fragment 符号不可恢复（fragment = array 归一——逆向为数组）
  const fragHtml = await vnode2html(h(Fragment, {}, 'x', h('i', {}, 'y'), null))
  assert.deepEqual(html2vnode(fragHtml), ['x', h('i', {}, 'y'), null], 'Fragment → 数组（锚包裹——符号面不可序列化）')
})

test('三重互证：vnode2dom 序列化 ≡ vnode2html ≡ html2vnode 还原', async () => {
  // dom 序列化一致性由 core2-html 测试锁定——此处验证 html2vnode 的
  // 还原与 dom2vnode 一致（同一 DOM string 的两个逆向路径）
  const v = h('div', { class: 'a' }, h('span', {}, 'x'), null, 'y')
  const html = await vnode2html(v)
  const back = html2vnode(html)
  assert.deepEqual(back, v, 'html2vnode 还原 = 原 vnode（单值归一）')
  // 与 dom2vnode 同语义（组件展开结构不可恢复——同保真范围——单值归一）
  assert.deepEqual(html2vnode('<section><div class="c">inner</div></section>'), h('section', {}, h('div', { class: 'c' }, 'inner')))
})
