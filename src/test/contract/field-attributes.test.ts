/**
 * vdom core/field — applyAttribute 测试（attribute 通道单键应用）
 *
 * 锁定（2026-12——aria 布尔归一回归修复）：
 * - aria-* boolean → 显式 'true'/'false'（ReasoningBlock CDD 实证——v1 修复
 *   v2 迁移丢失——aria-expanded: true 落成 aria-expanded="" 读屏失效）
 * - aria-expanded=false 是有效状态——**不可 removeAttribute**（与无属性语义不同面）
 * - 既有行为回归锚：enumerated 白名单 / boolean attribute 空串 / property
 *   重定向（innerHTML/textContent/value）/ null|undefined 移除 / class / 字符串化
 *
 * 零 DOM：el 用鸭舌类型 fake（applyAttribute 只调 setAttribute/removeAttribute
 * 与 property 赋值——node 直跑）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyAttribute, ariaBoolValue } from '../../client/vdom/core/field/attributes.ts'

/** 鸭舌 fake element（记录 setAttribute/removeAttribute 调用——property 直赋直读） */
function fakeEl() {
  const attrs = new Map<string, string>()
  const calls: string[] = []
  const el: any = {
    calls,
    attrs,
    setAttribute(k: string, v: string) { attrs.set(k, v); calls.push(`set:${k}=${v}`) },
    removeAttribute(k: string) { attrs.delete(k); calls.push(`rm:${k}`) },
  }
  return el as HTMLElement & { calls: string[]; attrs: Map<string, string> }
}

test('aria 布尔归一：true → "true"（不落空字符串——读屏失效根治）', () => {
  const el = fakeEl()
  applyAttribute(el, 'aria-expanded', true)
  assert.equal(el.attrs.get('aria-expanded'), 'true', `实际: ${el.calls.join(',')}`)
})

test('aria 布尔归一：false → "false"（不可移除——状态语义保留）', () => {
  const el = fakeEl()
  applyAttribute(el, 'aria-expanded', false)
  assert.equal(el.attrs.get('aria-expanded'), 'false', '显式 false')
  assert.ok(!el.calls.some((c) => c.startsWith('rm:')), '零 removeAttribute')
})

test('aria 字符串值不受影响：aria-label 走 String 化原路径', () => {
  const el = fakeEl()
  applyAttribute(el, 'aria-label', '关闭菜单')
  assert.equal(el.attrs.get('aria-label'), '关闭菜单')
  applyAttribute(el, 'aria-expanded', 'true') // 已显式字符串——原样
  assert.equal(el.attrs.get('aria-expanded'), 'true')
})

test('ariaBoolValue 单源判定：命中/不命中两态', () => {
  assert.equal(ariaBoolValue('aria-expanded', true), 'true')
  assert.equal(ariaBoolValue('aria-checked', false), 'false')
  assert.equal(ariaBoolValue('aria-label', true), 'true', '规则简单确定：aria-* 前缀 + 布尔即归一（无效用法显式化）')
  assert.equal(ariaBoolValue('hidden', true), null, '非 aria 不命中（boolean attribute 原分支）')
  assert.equal(ariaBoolValue('aria-hidden', 'true'), null, '字符串值不命中（原样 String 化）')
  assert.equal(ariaBoolValue('aria-hidden', undefined), null, 'undefined 不命中（移除分支）')
})

test('既有回归锚：enumerated 白名单 false → 显式 "false"', () => {
  const el = fakeEl()
  applyAttribute(el, 'draggable', false)
  assert.equal(el.attrs.get('draggable'), 'false', 'enumerated 移除会落回 HTML 默认')
})

test('既有回归锚：boolean attribute（disabled）→ 空字符串 = 存在', () => {
  const el = fakeEl()
  applyAttribute(el, 'disabled', true)
  assert.equal(el.attrs.get('disabled'), '')
})

test('既有回归锚：value/innerHTML/textContent 走 property 通道', () => {
  const el = fakeEl()
  applyAttribute(el, 'value', 'hello')
  assert.equal((el as any).value, 'hello', 'property 直赋')
  assert.equal(el.attrs.size, 0, '零 attribute 写入')
})

test('既有回归锚：null/undefined 移除 + 非 aria false 移除 + class/字符串化', () => {
  const el = fakeEl()
  applyAttribute(el, 'data-x', null)
  assert.ok(el.calls.includes('rm:data-x'), 'null 移除')
  applyAttribute(el, 'title', false)
  assert.ok(el.calls.includes('rm:title'), '非 aria false 移除')
  applyAttribute(el, 'class', 'a b')
  assert.equal(el.attrs.get('class'), 'a b')
  applyAttribute(el, 'tabindex', 0)
  assert.equal(el.attrs.get('tabindex'), '0', '数字字符串化')
})
