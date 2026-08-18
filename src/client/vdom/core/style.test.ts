/**
 * vdom core — style 通道测试（复杂面独立验证）
 *
 * 锁定规则（AGENTS §6.4——style diff 只设不删已修）：undefined/null/false
 * 清空防残留；数字自动 px（UNITLESS 白名单除外）；CSS 变量 setProperty；
 * 字符串直通。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser } from '../setup.ts'
import { applyStyle, applyStyleValue, UNITLESS_KEYS } from './style.ts'

function el(): HTMLElement {
  return testBrowser().document.createElement('div')
}

test('对象应用 + undefined 清空（防残留——条件显隐 display 教训）', () => {
  const a = el()
  applyStyle(a, { display: 'none', width: '10px', color: 'red' })
  assert.equal(a.style.display, 'none')
  assert.equal(a.style.width, '10px')
  applyStyle(a, { display: undefined, width: null, color: false })
  assert.equal(a.style.display, '', 'undefined 清空')
  assert.equal(a.style.width, '', 'null 清空')
  assert.equal(a.style.color, '', 'false 清空')
})

test('数字自动单位：width → px；UNITLESS 白名单原样', () => {
  assert.ok(UNITLESS_KEYS.has('zIndex'))
  assert.ok(UNITLESS_KEYS.has('opacity'))
  assert.ok(UNITLESS_KEYS.has('lineHeight'))
  const a = el()
  applyStyle(a, { width: 10, marginTop: 4 })
  assert.equal(a.style.width, '10px')
  assert.equal(a.style.marginTop, '4px')
  const b = el()
  applyStyle(b, { opacity: 0.5, zIndex: 100, lineHeight: 1.5, fontWeight: 700 })
  assert.equal(b.style.opacity, '0.5', 'opacity 无单位')
  assert.equal(b.style.zIndex, '100', 'zIndex 无单位')
  assert.equal(b.style.lineHeight, '1.5', 'lineHeight 无单位')
  assert.equal(b.style.fontWeight, '700')
})

test('CSS 变量：--x 走 setProperty（el.style 直接赋值无效）', () => {
  const a = el()
  applyStyleValue(a, '--wf-cols', 3)
  assert.equal(a.style.getPropertyValue('--wf-cols'), '3')
  applyStyleValue(a, '--wf-cols', null)
  assert.equal(a.style.getPropertyValue('--wf-cols'), '', '变量移除')
})

test('字符串直通 + camelCase 键', () => {
  const a = el()
  applyStyle(a, 'color: blue')
  assert.equal(a.getAttribute('style'), 'color: blue')
  const b = el()
  applyStyle(b, { fontSize: '12px', backgroundColor: '#fff' })
  assert.equal(b.style.fontSize, '12px')
  assert.equal(b.style.backgroundColor, 'rgb(255, 255, 255)')
})
