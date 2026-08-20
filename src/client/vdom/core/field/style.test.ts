/**
 * vdom core — style 通道测试（复杂面独立验证）
 *
 * 锁定规则（AGENTS §6.4——style diff 只设不删已修）：undefined/null/false
 * 清空防残留；数字自动 px（UNITLESS 白名单除外）；CSS 变量 setProperty；
 * 字符串直通。
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { applyStyle, applyStyleValue, UNITLESS_KEYS } from './style.ts'

function el(): HTMLElement {
  return document.createElement('div')
}

test('对象应用 + undefined 清空（防残留——条件显隐 display 教训）', () => {
  const a = el()
  applyStyle(a, { display: 'none', width: '10px', color: 'red' })
  expect(a.style.display).toBe('none')
  expect(a.style.width).toBe('10px')
  applyStyle(a, { display: undefined, width: null, color: false })
  expect(a.style.display, 'undefined 清空').toBe('')
  expect(a.style.width, 'null 清空').toBe('')
  expect(a.style.color, 'false 清空').toBe('')
})

test('数字自动单位：width → px；UNITLESS 白名单原样', () => {
  expect(UNITLESS_KEYS.has('zIndex')).toBeTruthy()
  expect(UNITLESS_KEYS.has('opacity')).toBeTruthy()
  expect(UNITLESS_KEYS.has('lineHeight')).toBeTruthy()
  const a = el()
  applyStyle(a, { width: 10, marginTop: 4 })
  expect(a.style.width).toBe('10px')
  expect(a.style.marginTop).toBe('4px')
  const b = el()
  applyStyle(b, { opacity: 0.5, zIndex: 100, lineHeight: 1.5, fontWeight: 700 })
  expect(b.style.opacity, 'opacity 无单位').toBe('0.5')
  expect(b.style.zIndex, 'zIndex 无单位').toBe('100')
  expect(b.style.lineHeight, 'lineHeight 无单位').toBe('1.5')
  expect(b.style.fontWeight).toBe('700')
})

test('CSS 变量：--x 走 setProperty（el.style 直接赋值无效）', () => {
  const a = el()
  applyStyleValue(a, '--wf-cols', 3)
  expect(a.style.getPropertyValue('--wf-cols')).toBe('3')
  applyStyleValue(a, '--wf-cols', null)
  expect(a.style.getPropertyValue('--wf-cols'), '变量移除').toBe('')
})

test('字符串直通 + camelCase 键', () => {
  const a = el()
  applyStyle(a, 'color: blue')
  expect(a.getAttribute('style')).toBe('color: blue')
  const b = el()
  applyStyle(b, { fontSize: '12px', backgroundColor: '#fff' })
  expect(b.style.fontSize).toBe('12px')
  expect(b.style.backgroundColor).toBe('rgb(255, 255, 255)')
})
