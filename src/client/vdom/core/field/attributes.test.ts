/**
 * vdom core — attribute 通道测试
 *
 * 锁定规则（AGENTS §4.0/§6.2/§6.4）：enumerated 白名单显式 'true'/'false'
 * （空字符串解析 false——Kanban 教训）；boolean attribute 空字符串=存在；
 * style 对象/undefined 清空（防残留）；null/undefined/false → removeAttribute。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser } from '../../setup.ts'
import { applyAttribute, ENUMERATED_KEYS } from './attributes.ts'

function el(): HTMLElement {
  return testBrowser().document.createElement('div')
}

test('enumerated 白名单：draggable 显式 true/false（空字符串解析 false 的坑）', () => {
  assert.ok(ENUMERATED_KEYS.has('draggable'))
  const a = el()
  applyAttribute(a, 'draggable', true)
  assert.equal(a.getAttribute('draggable'), 'true')
  assert.equal(a.draggable, true, 'el.draggable 真值（非空字符串误判）')
  const b = el()
  applyAttribute(b, 'draggable', false)
  assert.equal(b.getAttribute('draggable'), 'false')
  assert.equal(b.draggable, false)
})

test('boolean attribute：存在 = 空字符串（disabled/hidden 语义）', () => {
  const a = testBrowser().document.createElement('button')
  applyAttribute(a, 'disabled', true)
  assert.equal(a.getAttribute('disabled'), '')
  assert.equal(a.disabled, true, 'button.disabled property 随 attribute 存在')
  applyAttribute(a, 'disabled', false)
  assert.equal(a.hasAttribute('disabled'), false, 'false → removeAttribute')
  assert.equal(a.disabled, false)
})

test('null/undefined/false → removeAttribute；其余字符串化', () => {
  const a = el()
  applyAttribute(a, 'id', 'x1')
  assert.equal(a.getAttribute('id'), 'x1')
  applyAttribute(a, 'id', null)
  assert.equal(a.hasAttribute('id'), false)
  applyAttribute(a, 'data-n', 42)
  assert.equal(a.getAttribute('data-n'), '42', '数字字符串化')
  applyAttribute(a, 'class', 'a b')
  assert.equal(a.getAttribute('class'), 'a b')
})
