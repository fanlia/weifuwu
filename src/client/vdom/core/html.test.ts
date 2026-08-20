/**
 * vdom core — html 测试（commandToHtml——命令流 → HTML——流式 SSR）
 *
 * 覆盖：开/闭标签/属性转义/style 对象/void 元素/空洞注释/文本转义/
 * 流式分块/增量 setText/文档包装。
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { h } from './vnode.ts'
import { renderToStream } from './build.ts'
import { commandToHtml, escapeHtml, htmlDocument } from './html.ts'

async function toHtml(tree: ReturnType<typeof h>): Promise<string> {
  const stream = renderToStream(tree)
  const out = stream.pipeThrough(commandToHtml())
  const reader = out.getReader()
  let html = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    html += value
  }
  return html
}

test('commandToHtml：简单元素 + 文本', async () => {
  const html = await toHtml(h('div', { class: 'app' }, 'hello world'))
  expect(html).toBe('<div class="app">hello world</div>')
})

test('commandToHtml：嵌套结构（tag 栈闭合）', async () => {
  const html = await toHtml(h('div', {}, [
    h('span', {}, 'a'),
    h('section', {}, h('p', {}, 'b')),
  ]))
  expect(html).toBe('<div><span>a</span><section><p>b</p></section></div>')
})

test('commandToHtml：属性转义 + style 对象（camelCase → kebab）', async () => {
  const html = await toHtml(h('div', {
    'data-x': 'a"b<c',
    style: { fontSize: '12px', backgroundColor: '#fff', display: 'none' },
  }, 'x'))
  expect(html.includes('data-x="a&quot;b&lt;c"'), '属性值转义').toBeTruthy()
  expect(html.includes('style="font-size: 12px; background-color: #fff; display: none"'), 'style 对象序列化').toBeTruthy()
})

test('commandToHtml：void 元素不闭合 + boolean 属性', async () => {
  const html = await toHtml(h('div', {}, [
    h('br', {}),
    h('input', { type: 'text', disabled: true }),
  ]))
  expect(html).toBe('<div><br><input type="text" disabled=""></div>')
})

test('commandToHtml：空洞占位注释 + 文本转义', async () => {
  const html = await toHtml(h('div', {}, [
    'a<b',
    false,
    'c&d',
  ]))
  expect(html).toBe('<div>a&lt;b<!--wf-hole-->c&amp;d</div>')
})

test('commandToHtml：流式分块（TransformStream——多 chunk 拼接）', async () => {
  const stream = renderToStream(h('div', {}, [h('span', {}, '1'), h('span', {}, '2')]))
  const out = stream.pipeThrough(commandToHtml())
  const reader = out.getReader()
  const chunks: string[] = []
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  expect(chunks.length >= 2, '流式分块（非单块）').toBeTruthy()
  expect(chunks.join('')).toBe('<div><span>1</span><span>2</span></div>')
})

test('escapeHtml：完整转义', () => {
  expect(escapeHtml('<a&"b\'>')).toBe('&lt;a&amp;&quot;b&#39;&gt;')
})

test('htmlDocument：完整文档包装（__DATA__ 种子脚本）', () => {
  const doc = htmlDocument('<div>x</div>', { title: '页 & 标题', data: { k: 'v<1' } })
  expect(doc.startsWith('<!DOCTYPE html>')).toBeTruthy()
  expect(doc.includes('<title>页 &amp; 标题</title>')).toBeTruthy()
  expect(doc.includes('<div id="root"><div>x</div></div>')).toBeTruthy()
  expect(doc.includes('__DATA__')).toBeTruthy()
  expect(doc.includes('v&lt;1'), '种子数据转义').toBeTruthy()
})
