/**
 * vdom core — property 通道测试
 *
 * 锁定规则（AGENTS §4.0）：value/checked 等走 DOM property（setAttribute 不更新
 * 输入值/勾选态）；白名单判断；ref 特殊通道（挂载 el / 卸载 null——prev 清理）。
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { applyProperty, isPropertyKey, PROPERTY_KEYS } from './props.ts'

function doc(): Document {
  return document
}

test('property 白名单：value/checked/disabled 等', () => {
  expect(isPropertyKey('value')).toBeTruthy()
  expect(isPropertyKey('checked')).toBeTruthy()
  expect(isPropertyKey('disabled')).toBeTruthy()
  expect(isPropertyKey('innerHTML')).toBeTruthy()
  expect(!isPropertyKey('class'), 'class 走 attribute 通道').toBeTruthy()
  expect(!isPropertyKey('id')).toBeTruthy()
  expect(!isPropertyKey('data-x')).toBeTruthy()
})

test('input value 走 property（setAttribute 不更新输入值的坑）', () => {
  const d = doc()
  const input = d.createElement('input')
  applyProperty(input, 'value', 'hello')
  expect(input.value, 'property 赋值生效').toBe('hello')
  input.setAttribute('value', 'attr')
  expect(input.value, 'setAttribute 不覆盖 property 值').toBe('hello')
})

test('checked 勾选态（property 语义）', () => {
  const d = doc()
  const cb = d.createElement('input')
  cb.type = 'checkbox'
  applyProperty(cb, 'checked', true)
  expect(cb.checked).toBe(true)
  applyProperty(cb, 'checked', false)
  expect(cb.checked).toBe(false)
})
