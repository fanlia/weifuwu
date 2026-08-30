/**
 * vdom core — html 测试（commandToHtml——命令流 → HTML——流式 SSR）
 *
 * 覆盖：开/闭标签/属性转义/style 对象/void 元素/空洞注释/文本转义/
 * 流式分块/增量 setText/文档包装。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import { renderToStreamV2 } from '../../client/vdom/core/v2/integrate.ts' // v1 退役——v2 桥
import { commandToHtml, escapeHtml, htmlDocument } from '../../client/vdom/core/ssr/html.ts'

async function toHtml(tree: ReturnType<typeof h>): Promise<string> {
  const stream = renderToStreamV2(tree)
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
  assert.equal(html, '<div class="app">hello world</div>')
})

test('commandToHtml：嵌套结构（tag 栈闭合）', async () => {
  const html = await toHtml(h('div', {}, [
    h('span', {}, 'a'),
    h('section', {}, h('p', {}, 'b')),
  ]))
  assert.equal(html, '<div><span>a</span><section><p>b</p></section></div>')
})

test('commandToHtml：属性转义 + style 对象（camelCase → kebab）', async () => {
  const html = await toHtml(h('div', {
    'data-x': 'a"b<c',
    style: { fontSize: '12px', backgroundColor: '#fff', display: 'none' },
  }, 'x'))
  assert.ok(html.includes('data-x="a&quot;b&lt;c"'), '属性值转义')
  assert.ok(html.includes('style="font-size: 12px; background-color: #fff; display: none"'), 'style 对象序列化')
})

test('commandToHtml：void 元素不闭合 + boolean 属性', async () => {
  const html = await toHtml(h('div', {}, [
    h('br', {}),
    h('input', { type: 'text', disabled: true }),
  ]))
  assert.equal(html, '<div><br><input type="text" disabled=""></div>')
})

test('commandToHtml：aria 布尔归一（客户端 applyAttribute 同规则单源——v2 迁移回归修复）', async () => {
  const html = await toHtml(h('div', {}, [
    h('button', { 'aria-expanded': true }, 'open'),
    h('button', { 'aria-expanded': false }, 'closed'),
    h('button', { 'aria-expanded': 'true' }, 'string-passthrough'),
  ]))
  assert.ok(html.includes('aria-expanded="true"'), 'aria true 显式字符串（不落空串——读屏失效）')
  assert.ok(html.includes('aria-expanded="false"'), 'aria false 显式字符串（不可省略——状态语义保留）')
  assert.ok(!html.includes('aria-expanded=""'), '零空字符串形态（ReasoningBlock 实证回归）')
})

test('commandToHtml：空洞占位注释 + 文本转义', async () => {
  const html = await toHtml(h('div', {}, [
    'a<b',
    false,
    'c&d',
  ]))
  assert.equal(html, '<div>a&lt;b<!--wf-hole-->c&amp;d</div>')
})

test('commandToHtml：流式分块（TransformStream——多 chunk 拼接）', async () => {
  const stream = renderToStreamV2(h('div', {}, [h('span', {}, '1'), h('span', {}, '2')]))
  const out = stream.pipeThrough(commandToHtml())
  const reader = out.getReader()
  const chunks: string[] = []
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  assert.ok(chunks.length >= 2, '流式分块（非单块）')
  assert.equal(chunks.join(''), '<div><span>1</span><span>2</span></div>')
})

test('escapeHtml：完整转义', () => {
  assert.equal(escapeHtml('<a&"b\'>'), '&lt;a&amp;&quot;b&#39;&gt;')
})

test('htmlDocument：完整文档包装（__DATA__ 种子脚本）', () => {
  const doc = htmlDocument('<div>x</div>', { title: '页 & 标题', data: { k: 'v<1' } })
  assert.ok(doc.startsWith('<!DOCTYPE html>'))
  assert.ok(doc.includes('<title>页 &amp; 标题</title>'))
  assert.ok(doc.includes('<div id="root"><div>x</div></div>'))
  assert.ok(doc.includes('__DATA__'))
  assert.ok(doc.includes('v\\u003c1'), '种子数据转义（script 内 JSON——只转义 <——引号不破坏）')
})

// 浏览器测试 runner 入口标记（sideEffects 摇除防护——scripts/test-browser.ts 引用）
export const __wf_tests = (): void => {}
