/**
 * core2 — vnode → HTML 字符串契约（A1 的字符串形式）
 *
 * 锁定：① 6 类型序列化（text 转义/hole 锚注释/element 嵌套/组件展开/
 * array 拼接/invalid 诊断）② 属性面（style 对象 → cssText、布尔、转义）
 * ③ void 元素自闭合 ④ **双实现互证**（vnode2dom 的 DOM 结构序列化 ≡
 * vnode2html 字符串——A1 唯一性公理的可执行验证——两个独立实现表示
 * 同一结构）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vnode2html, html2vnode, escapeHtml } from '../../client/vdom/core2/html.ts'
import { vnode2dom, HOLE_NULL, FRAG_START, FRAG_END, type DomFactory } from '../../client/vdom/core2/dom.ts'
import { resetRegistry } from '../../client/vdom/core2/registry.ts'
import { h, Fragment, type VNodeChild } from '../../client/vdom/core2/vnode.ts'

// ── fake DOM（含 serialize——innerHTML 模拟——与 vnode2html 同格式） ──

const VOID = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'])
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s: string): string => s.replace(/[&<>"']/g, (m) => ESC[m]!)

class FakeNode {
  nodeType = 0
  childNodes: FakeNode[] = []
  textContent: string | null = null
  appendChild(c: FakeNode): FakeNode { this.childNodes.push(c); return c }
}
class FakeText extends FakeNode {
  nodeType = 3
  constructor(text: string) { super(); this.textContent = text }
  serialize(): string { return esc(this.textContent ?? '') }
}
class FakeComment extends FakeNode {
  nodeType = 8
  constructor(text: string) { super(); this.textContent = text }
  serialize(): string { return `<!--${this.textContent ?? ''}-->` }
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
  serialize(): string {
    const tag = this.tagName.toLowerCase()
    const attrs = this.attributes.map((a) => ` ${a.name}="${esc(a.value)}"`).join('')
    const kids = this.childNodes.map((c) => (c as unknown as { serialize(): string }).serialize()).join('')
    return VOID.has(tag) ? `<${tag}${attrs}/>` : `<${tag}${attrs}>${kids}</${tag}>`
  }
}

const fakeDoc: DomFactory = {
  createTextNode: (t) => new FakeText(t) as unknown as Text,
  createComment: (t) => new FakeComment(t) as unknown as Comment,
  createElement: (t) => new FakeElement(t) as unknown as Element,
}

/** 双实现互证：vnode2dom 序列化 ≡ vnode2html */
async function assertConsistent(v: VNodeChild): Promise<void> {
  const nodes = await vnode2dom(v, fakeDoc)
  const domStr = nodes.map((n) => (n as unknown as { serialize(): string }).serialize()).join('')
  const htmlStr = await vnode2html(v)
  assert.equal(domStr, htmlStr, `vnode2dom 与 vnode2html 表示同一结构\n  DOM: ${domStr}\n  HTML: ${htmlStr}`)
}

test('序列化：text（HTML 转义）', async () => {
  assert.equal(await vnode2html('hello'), 'hello')
  assert.equal(await vnode2html('a < b & c > d'), 'a &lt; b &amp; c &gt; d', '文本转义')
  assert.equal(await vnode2html(42), `<!--wf-hole: text-number-->42`, 'number 文本 → tn 标记 + 字符串')
  assert.equal(await vnode2html('42'), '42', 'string 文本零标记')
  assert.equal(await vnode2html(undefined), '<!--wf-hole: undefined-->', 'undefined 独立标记')
  assert.equal(await vnode2html(null), '<!--wf-hole: null-->', 'null 标记')
})

test('序列化：hole → 值标记注释（null/true/false 区分）', async () => {
  assert.equal(await vnode2html(null), `<!--wf-hole: null-->`)
  assert.equal(await vnode2html(true), `<!--wf-hole: true-->`)
  assert.equal(await vnode2html(false), `<!--wf-hole: false-->`)
})

test('序列化：element（属性面——style 对象/布尔/属性转义）', async () => {
  assert.equal(
    await vnode2html(h('div', { class: 'a' }, 'x')),
    '<div class="a">x</div>',
  )
  assert.equal(
    await vnode2html(h('div', { style: { backgroundColor: 'red' }, disabled: true }, 'x')),
    '<div style="background-color:red" data-wf-style="{&quot;backgroundColor&quot;:&quot;red&quot;}" disabled="true" data-wf-types="{&quot;disabled&quot;:&quot;boolean&quot;}">x</div>',
    'style 对象 → cssText + data-wf-style JSON；boolean → 类型表（逆向均还原）',
  )
  // 逆向：类型表还原——disabled 恢复 boolean（非字符串）——内部标记删除
  const bt = html2vnode('<div disabled="true" data-wf-types="{&quot;disabled&quot;:&quot;boolean&quot;}">x</div>')
  assert.deepEqual(bt, h('div', { disabled: true }, 'x'), 'data-wf-types 解码：boolean 还原 + 标记删除')
  // 逆向：style 对象还原（data-wf-style——含 number 值类型）+ 标记删除
  const st = html2vnode('<div style="font-size:14" data-wf-style="{&quot;fontSize&quot;:14}">x</div>')
  assert.deepEqual(st, h('div', { style: { fontSize: 14 } }, 'x'), 'data-wf-style 解码：对象还原（值类型保真）')
  const num = html2vnode('<div n="42" data-wf-types="{&quot;n&quot;:&quot;number&quot;}">x</div>')
  assert.deepEqual(num, h('div', { n: 42 }, 'x'), 'data-wf-types 解码：number 还原')
  // 无标记的字符串属性不受影响
  assert.equal(await vnode2html(h('div', { class: 'a' }, 'x')), '<div class="a">x</div>', '纯字符串属性——零开销（无类型表）')
  assert.equal(
    await vnode2html(h('div', { title: 'a "q" & <x>' }, 'y')),
    '<div title="a &quot;q&quot; &amp; &lt;x&gt;">y</div>',
    '属性值转义（引号/&/尖括号）',
  )
})

test('序列化：嵌套 element + 空洞（childNodes 同构）', async () => {
  assert.equal(
    await vnode2html(h('ul', {}, h('li', {}, '1'), null, h('li', {}, '2'))),
    `<ul><li>1</li><!--${HOLE_NULL}--><li>2</li></ul>`,
    '空洞 → 值标记注释（不塌缩）',
  )
})

test('序列化：void 元素自闭合', async () => {
  assert.equal(await vnode2html(h('br', {})), '<br/>')
  assert.equal(await vnode2html(h('img', { src: 'a.png' })), '<img src="a.png"/>')
  assert.equal(await vnode2html(h('div', {})), '<div></div>', '非 void 空元素闭合')
})

test('序列化：array / Fragment（边界锚包裹——嵌套保留）', async () => {
  assert.equal(
    await vnode2html(['a', null, h('b', {}, 'x')]),
    `<!--${FRAG_START}-->a<!--wf-hole: null--><b>x</b><!--${FRAG_END}-->`,
  )
  assert.equal(
    await vnode2html(h(Fragment, {}, 'a', h('span', {}, 'b'))),
    `<!--${FRAG_START}-->a<span>b</span><!--${FRAG_END}-->`,
    'Fragment 与数组同形态（归一）',
  )
  assert.equal(await vnode2html(['a', ['b', 'c']]), `<!--${FRAG_START}-->a<!--${FRAG_START}-->b<!--wf-hole: split-->c<!--${FRAG_END}--><!--${FRAG_END}-->`, '嵌套数组 → 嵌套锚 + 连续文本 split（不 merge）')
})

test('序列化：组件展开（工厂 + renderFn——输出递归）', async () => {
  const Comp = () => () => h('div', { class: 'c' }, 'inner')
  assert.equal(await vnode2html(h('section', {}, h(Comp, {}))), '<section><div class="c">inner</div></section>')
  const Multi = () => () => [h('span', {}, 'a'), h('span', {}, 'b')]
  assert.equal(await vnode2html(h(Multi, {})), `<!--${FRAG_START}--><span>a</span><span>b</span><!--${FRAG_END}-->`, '多根输出 → 数组区间锚')
})

test('序列化：事件跳过（函数面——与 vnode2dom 同规则）', async () => {
  // 函数面：全局注册表引用 id（不剔除）——逆向 lookup 恢复引用
  const fn = () => {}
  resetRegistry()
  const evHtml = await vnode2html(h('button', { onClick: fn, disabled: true }, 'b'))
  assert.equal(evHtml, '<button disabled="true" data-wf-events="{&quot;onClick&quot;:&quot;e1&quot;}" data-wf-types="{&quot;disabled&quot;:&quot;boolean&quot;}">b</button>', '函数 → 注册表 id（可序列化）')
  const evBack = html2vnode(evHtml)
  assert.deepEqual(evBack, h('button', { onClick: fn, disabled: true }, 'b'), '逆向恢复函数引用（=== 恒等）——标记删除')
  assert.equal((evBack as any).props.onClick, fn, '引用恒等（同一函数对象）')
})

test('双实现互证：多种形态 DOM 结构 ≡ HTML 字符串（A1 唯一性）', async () => {
  await assertConsistent(h('div', { class: 'a' }, h('span', { title: 'x' }, 'hi'), null, 'tail'))
  await assertConsistent(['a', h('b', { style: { color: 'red' } }, 'bold'), null])
  await assertConsistent(h('ul', {}, h('li', { key: 'k1' }, '1'), h('li', {}, '2')))
  await assertConsistent(h('div', {}, h('br', {}), h('input', { type: 'text', value: 'v' })))
  await assertConsistent(h('p', { 'data-x': 'a"b' }, 'a < b'))
  await assertConsistent(h(Fragment, {}, 'x', h('i', {}, 'y'), null))
})

test('函数面：跨会话降级（注册表 reset 后 lookup 失败——显式不静默）', async () => {
  const fn = () => {}
  resetRegistry()
  const html = await vnode2html(h('button', { onClick: fn }, 'b')) // e1
  resetRegistry() // 模拟新会话——注册表清空
  const back = html2vnode(html) // lookup e1 失败
  assert.equal((back as any).props.onClick, undefined, '查不到 → 降级跳过（属性不设）')
  // 降级不破坏其余保真
  assert.deepEqual((back as any).props.children, 'b', '结构面不受影响')
})
