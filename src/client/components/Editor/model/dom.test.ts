/**
 * Editor DOM 桥测试——offset ↔ Range 双向（含嵌入占位符）
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../../vdom/setup.ts'
import { parseHtml, serializeHtml } from './html.ts'
import { applyEdit } from './apply.ts'
import { rangeToOffsets, offsetsToRange, selectionOffsets, setSelectionOffsets, isEmbedElement } from './dom.ts'

before(setupJsdom)

function mount(html: string): HTMLElement {
  const el = document.createElement('div')
  el.contentEditable = 'true'
  el.innerHTML = html
  document.body.appendChild(el)
  return el
}

function sel(el: HTMLElement, start: number, end: number): void {
  setSelectionOffsets(el, start, end)
}

test('文本节点 offset ↔ Range 往返', () => {
  const el = mount('hello world')
  // 选择 "lo wo"（offset 3-8）
  sel(el, 3, 8)
  const sel2 = selectionOffsets(el)
  assert.deepEqual(sel2, { start: 3, end: 8 })
})

test('跨元素 offset（b 标签内）', () => {
  const el = mount('ab<b>cd</b>ef')
  // "bcd" = offset 1-4
  sel(el, 1, 4)
  assert.deepEqual(selectionOffsets(el), { start: 1, end: 4 })
  // "de" = offset 3-5
  sel(el, 3, 5)
  assert.deepEqual(selectionOffsets(el), { start: 3, end: 5 })
})

test('嵌入元素占位符 offset（img = 1）', () => {
  const el = mount('ab<img src="x">cd')
  // 全选：a b img c d = 5
  sel(el, 0, 5)
  assert.deepEqual(selectionOffsets(el), { start: 0, end: 5 })
  // 选择 img（offset 2-3）
  sel(el, 2, 3)
  assert.deepEqual(selectionOffsets(el), { start: 2, end: 3 })
  // 选择 "c"（offset 3-4）
  sel(el, 3, 4)
  assert.deepEqual(selectionOffsets(el), { start: 3, end: 4 })
})

test('多段 + 嵌入（\n 分段）', () => {
  const el = mount('第一行\n第二行')
  sel(el, 3, 6)
  assert.deepEqual(selectionOffsets(el), { start: 3, end: 6 })
})

test('末尾 offset（选择到结尾）', () => {
  const el = mount('hello')
  sel(el, 5, 5)
  assert.deepEqual(selectionOffsets(el), { start: 5, end: 5 })
})

test('模型往返：serialize → DOM → offset 操作一致', () => {
  // 模型构建文档 → serialize → 挂载 → 选区 offset 与模型 offset 对应
  let doc = parseHtml('<p>标题</p><p>正文<b>加粗</b></p>')
  doc = applyEdit(doc, { type: 'text-insert', at: 2, text: '新' })
  const html = serializeHtml(doc)
  const el = mount(html)
  // 模型文本 "标题新\n正文加粗"——选择 "新\n正"（offset 2-5）
  sel(el, 2, 5)
  assert.deepEqual(selectionOffsets(el), { start: 2, end: 5 })
})

test('embed 元素判定', () => {
  assert.equal(isEmbedElement(document.createElement('img')), true)
  assert.equal(isEmbedElement(document.createElement('table')), true)
  assert.equal(isEmbedElement(document.createElement('hr')), true)
  assert.equal(isEmbedElement(document.createElement('b')), false)
  assert.equal(isEmbedElement(document.createElement('span')), false)
})

test('越界 clamp 到末尾', () => {
  const el = mount('abc')
  const range = offsetsToRange(el, 10, 10)
  assert.ok(range)
  assert.equal(range.startContainer.textContent, 'abc')
})
