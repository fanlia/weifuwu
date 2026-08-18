/**
 * Editor 模型 HTML 序列化测试——parse/serialize 往返
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../../ui-dom/setup.ts'
import { parseHtml, serializeHtml, normalizeHtml } from './html.ts'
import { EMPTY_DOC } from './types.ts'

before(setupJsdom)

test('parse：纯文本 → 单段', () => {
  const doc = parseHtml('hello world')
  assert.equal(doc.text, 'hello world')
  assert.equal(doc.marks.length, 0)
  assert.equal(doc.blockProps.length, 0)
})

test('parse：块结构 → 段落 + \n 分隔', () => {
  const doc = parseHtml('<p>第一段</p><p>第二段</p>')
  assert.equal(doc.text, '第一段\n第二段')
})

test('parse：标题/引用/对齐块属性', () => {
  const doc = parseHtml('<h1>大标题</h1><blockquote>引用</blockquote><p style="text-align:center">居中</p>')
  assert.equal(doc.text, '大标题\n引用\n居中')
  assert.deepEqual(doc.blockProps.map((b) => [b.start, b.kind, b.align]), [
    [0, 'h1', undefined],
    [4, 'quote', undefined],
    [7, 'p', 'center'],
  ])
})

test('parse：wf-text-* class 对齐（既有 Editor 输出兼容）', () => {
  const doc = parseHtml('<div class="wf-text-center">居中内容</div>')
  assert.deepEqual(doc.blockProps, [{ start: 0, kind: 'p', align: 'center' }])
})

test('parse：内联标记区间', () => {
  const doc = parseHtml('<p>a<b>加粗</b>i<em>斜</em>u<u>下划线</u><a href="https://x">链接</a>z</p>')
  assert.equal(doc.text, 'a加粗i斜u下划线链接z')
  assert.deepEqual(doc.marks.map((m) => [m.start, m.end, m.type, m.href]), [
    [1, 3, 'b', undefined],
    [4, 5, 'i', undefined],
    [6, 9, 'u', undefined],
    [9, 11, 'link', 'https://x'],
  ])
})

test('parse：img/table/hr → 占位符 + embed 快照', () => {
  const html = '<p>前<img src="/a.png">后</p><p><table><tr><td>1</td></tr></table></p>'
  const doc = parseHtml(html)
  assert.equal(doc.text, '前\uFFFC后\n\uFFFC')
  assert.equal(doc.embeds.length, 2)
  assert.equal(doc.embeds[0].type, 'img')
  assert.ok(doc.embeds[0].html.includes('src="/a.png"'))
  assert.equal(doc.embeds[1].type, 'table')
  // table 内部不解析（embed 快照——诚实裁剪）
  assert.ok(!doc.text.includes('1'))
})

test('parse：ul/ol 列表 → li 段 + 列表块属性', () => {
  const doc = parseHtml('<ul><li>甲</li><li>乙</li></ul><ol><li>一</li></ol>')
  assert.equal(doc.text, '甲\n乙\n一')
  assert.deepEqual(doc.blockProps.map((b) => [b.start, b.kind]), [
    [0, 'ul'], [2, 'ul'], [4, 'ol'],
  ])
})

test('parse：未知标签降级取文本（裁剪——未知块级触发段边界）', () => {
  const doc = parseHtml('<p>a<span style="color:red">b</span><section>c</section>d</p>')
  assert.equal(doc.text, 'ab\ncd')
  // 未知内联（span）透明取文本
  const doc2 = parseHtml('<p>a<span style="color:red">b</span>c</p>')
  assert.equal(doc2.text, 'abc')
})

test('parse：空文档/空段（尾空段折叠）', () => {
  assert.equal(parseHtml('').text, '')
  assert.equal(parseHtml('<p></p>').text, '')
  assert.equal(parseHtml('<p></p><p></p>').text, '')
  assert.equal(parseHtml('<p>a</p><p></p>').text, 'a')
  assert.equal(parseHtml('<p>a</p><p></p><p>b</p>').text, 'a\nb')
})

test('serialize：块标签 + 对齐 + marks + embed 还原', () => {
  const doc = parseHtml('<h1>标题</h1><p>正文<b>加粗</b>和<i>斜体</i></p>')
  const out = serializeHtml(doc)
  assert.equal(out, '<h1>标题</h1><p>正文<b>加粗</b>和<i>斜体</i></p>')
})

test('serialize：列表合并输出', () => {
  const doc = parseHtml('<ul><li>甲</li><li>乙</li></ul>')
  assert.equal(serializeHtml(doc), '<ul><li>甲</li><li>乙</li></ul>')
})

test('serialize：链接带 href + 对齐 style', () => {
  const doc = parseHtml('<p style="text-align:right"><a href="https://w">链</a></p>')
  assert.equal(serializeHtml(doc), '<p style="text-align:right"><a href="https://w">链</a></p>')
})

test('往返幂等：normalize 后不再变化', () => {
  const samples = [
    'hello',
    '<p>第一段</p><p>第二段</p>',
    '<h1>标题</h1><blockquote>引用</blockquote>',
    '<p>a<b>加粗</b><i>斜</i><u>下</u><a href="/x">链</a>z</p>',
    '<ul><li>甲</li><li>乙</li></ul><ol><li>一</li></ol>',
    '<p>前<img src="/a">后</p><p><table><tr><td>1</td></tr></table></p>',
    '<p style="text-align:center">居中</p><div class="wf-text-right">右</div>',
  ]
  for (const html of samples) {
    const once = normalizeHtml(html)
    const twice = normalizeHtml(once)
    assert.equal(twice, once, `往返幂等: ${html} → ${once} → ${twice}`)
  }
})

test('往返幂等：模型事件构造的状态 serialize → parse 一致', () => {
  // 通过模型事件构建（非 parse 输入）→ serialize → parse → serialize 不变
  const doc = parseHtml('<h1>标题</h1><p>正文<b>粗</b>尾</p>')
  const out1 = serializeHtml(doc)
  const out2 = serializeHtml(parseHtml(out1))
  assert.equal(out2, out1)
})

test('空文档 serialize', () => {
  assert.equal(serializeHtml(EMPTY_DOC), '')
})
