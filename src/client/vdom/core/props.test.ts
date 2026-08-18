/**
 * vdom core — property 通道测试
 *
 * 锁定规则（AGENTS §4.0）：value/checked 等走 DOM property（setAttribute 不更新
 * 输入值/勾选态）；白名单判断；ref 特殊通道（挂载 el / 卸载 null——prev 清理）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser } from '../setup.ts'
import { applyProperty, applyRef, isPropertyKey, PROPERTY_KEYS } from './props.ts'

function doc(): Document {
  return testBrowser().document
}

test('property 白名单：value/checked/disabled 等', () => {
  assert.ok(isPropertyKey('value'))
  assert.ok(isPropertyKey('checked'))
  assert.ok(isPropertyKey('disabled'))
  assert.ok(isPropertyKey('innerHTML'))
  assert.ok(!isPropertyKey('class'), 'class 走 attribute 通道')
  assert.ok(!isPropertyKey('id'))
  assert.ok(!isPropertyKey('data-x'))
})

test('input value 走 property（setAttribute 不更新输入值的坑）', () => {
  const d = doc()
  const input = d.createElement('input')
  applyProperty(input, 'value', 'hello')
  assert.equal(input.value, 'hello', 'property 赋值生效')
  input.setAttribute('value', 'attr')
  assert.equal(input.value, 'hello', 'setAttribute 不覆盖 property 值')
})

test('checked 勾选态（property 语义）', () => {
  const d = doc()
  const cb = d.createElement('input')
  cb.type = 'checkbox'
  applyProperty(cb, 'checked', true)
  assert.equal(cb.checked, true)
  applyProperty(cb, 'checked', false)
  assert.equal(cb.checked, false)
})

test('ref：挂载回调 el + 卸载回调 null（prev 清理——引用变化先退旧）', () => {
  const d = doc()
  const e = d.createElement('div')
  const calls: Array<HTMLElement | null> = []
  const ref = (x: HTMLElement | null) => { calls.push(x) }
  applyRef(e, ref)                       // 挂载
  applyRef(null, null, ref)              // 卸载（prev = ref → ref(null)）
  assert.deepEqual(calls, [e, null])
})

test('ref：引用变化——旧 ref 退 null + 新 ref 接 el', () => {
  const d = doc()
  const e = d.createElement('div')
  const calls: string[] = []
  const r1 = (x: HTMLElement | null) => { calls.push(`r1:${x === null ? 'null' : 'el'}`) }
  const r2 = (x: HTMLElement | null) => { calls.push(`r2:${x === null ? 'null' : 'el'}`) }
  applyRef(e, r1)
  applyRef(e, r2, r1)
  assert.deepEqual(calls, ['r1:el', 'r1:null', 'r2:el'], '旧 ref 退 null 后新 ref 接 el')
})
