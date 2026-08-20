/**
 * vdom core — attribute 通道测试
 *
 * 锁定规则（AGENTS §4.0/§6.2/§6.4）：enumerated 白名单显式 'true'/'false'
 * （空字符串解析 false——Kanban 教训）；boolean attribute 空字符串=存在；
 * style 对象/undefined 清空（防残留）；null/undefined/false → removeAttribute。
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { applyAttribute, ENUMERATED_KEYS } from './attributes.ts'

function el(): HTMLElement {
  return document.createElement('div')
}

test('enumerated 白名单：draggable 显式 true/false（空字符串解析 false 的坑）', () => {
  expect(ENUMERATED_KEYS.has('draggable')).toBeTruthy()
  const a = el()
  applyAttribute(a, 'draggable', true)
  expect(a.getAttribute('draggable')).toBe('true')
  expect(a.draggable, 'el.draggable 真值（非空字符串误判）').toBe(true)
  const b = el()
  applyAttribute(b, 'draggable', false)
  expect(b.getAttribute('draggable')).toBe('false')
  expect(b.draggable).toBe(false)
})

test('boolean attribute：存在 = 空字符串（disabled/hidden 语义）', () => {
  const a = document.createElement('button') // disabled property 仅在表单元素反射
  applyAttribute(a, 'disabled', true)
  expect(a.getAttribute('disabled')).toBe('')
  expect(a.disabled, 'button.disabled property 随 attribute 存在').toBe(true)
  applyAttribute(a, 'disabled', false)
  expect(a.hasAttribute('disabled'), 'false → removeAttribute').toBe(false)
  expect(a.disabled).toBe(false)
})

test('null/undefined/false → removeAttribute；其余字符串化', () => {
  const a = el()
  applyAttribute(a, 'id', 'x1')
  expect(a.getAttribute('id')).toBe('x1')
  applyAttribute(a, 'id', null)
  expect(a.hasAttribute('id')).toBe(false)
  applyAttribute(a, 'data-n', 42)
  expect(a.getAttribute('data-n'), '数字字符串化').toBe('42')
  applyAttribute(a, 'class', 'a b')
  expect(a.getAttribute('class')).toBe('a b')
})
