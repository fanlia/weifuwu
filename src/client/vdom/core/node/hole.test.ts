/**
 * vdom core — hole 测试（特殊值渲染——空洞占位 + 非法输入诊断）
 *
 * 锁定规则（AGENTS §4.0/§6.3——占位法）：false/null/undefined/true → 占位锚
 * （childNodes 长度恒定——同构不变量）；非法输入（对象/数字 type/未知 Symbol）
 * → 诊断占位 + warn（不崩溃不静默）；占位静态零回调（不触发补渲染）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser } from '../../setup.ts'
import { isHole, isInvalid, invalidDiagnostic, holeCommands, emitHole } from './hole.ts'
import { h } from '../vnode.ts'
import { renderToStream } from '../render.ts'
import { CommandApplier } from '../apply.ts'
import type { Command } from '../command/index.ts'

test('isHole：false/null/undefined/true 全部是空洞（无渲染值）', () => {
  assert.equal(isHole(false), true)
  assert.equal(isHole(null), true)
  assert.equal(isHole(undefined), true)
  assert.equal(isHole(true), true)
  assert.equal(isHole('text'), false)
  assert.equal(isHole(0), false, '0 是文本（渲染 "0"——0 && <X/> 红线）')
  assert.equal(isHole(h('div', {})), false)
})

test('isInvalid：对象/数字 type/未知 Symbol 是非法；正常 vnode 不是', () => {
  assert.equal(isInvalid({}), true, '裸对象——无 type')
  assert.equal(isInvalid({ type: 42 }), true, '数字 type')
  assert.equal(isInvalid(Symbol('x') as never), true, '裸 Symbol')
  assert.equal(isInvalid(h('div', {})), false)
  assert.equal(isInvalid('text'), false)
  assert.equal(isInvalid([h('span', {})]), false)
  assert.equal(isInvalid(false), false, '空洞归 hole 不归 invalid')
})

test('invalidDiagnostic：明确诊断信息（warn 提示用）', () => {
  assert.match(invalidDiagnostic({}), /object/)
  assert.match(invalidDiagnostic({ type: 42 }), /number/)
  assert.equal(invalidDiagnostic('str' as never), 'string')
})

test('holeCommands：createAnchor + insert 命令对（同构长度恒定）', () => {
  const cmds = holeCommands('a.b.2', 'a.b', 'a.b.1')
  assert.deepEqual(cmds, [
    { op: 'createAnchor', id: 'a.b.2' },
    { op: 'insert', id: 'a.b.2', parent: 'a.b', ref: 'a.b.1' },
  ])
  const withDetail = holeCommands('x', 'root', null, 'object（type: number）')
  assert.equal(withDetail[0].op === 'createAnchor' && withDetail[0].detail, 'object（type: number）')
})

test('render 集成：空洞占位 → 注释节点（DOM 同构——长度恒定）', async () => {
  const browser = testBrowser()
  const stream = renderToStream(h('div', {}, [
    h('span', {}, 'a'),
    false,
    null,
    true,
    h('i', {}, 'b'),
  ]))
  const root = browser.document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, browser.document)
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    applier.apply(value)
  }
  const div = root.querySelector('div')!
  assert.equal(div.childNodes.length, 5, '5 子项 ⟷ 5 节点（2 元素 + 3 空洞占位）')
  assert.equal(div.childNodes[0].nodeType, 1, 'span 元素')
  assert.equal(div.childNodes[1].nodeType, 8, 'false → 注释占位')
  assert.equal(div.childNodes[2].nodeType, 8, 'null → 注释占位')
  assert.equal(div.childNodes[3].nodeType, 8, 'true → 注释占位')
  assert.equal(div.childNodes[4].nodeType, 1, 'i 元素')
  assert.equal((div.childNodes[1] as Comment).textContent, 'wf-hole')
})

test('render 集成：非法输入 → 诊断占位 + warn（不崩溃不静默）', async () => {
  const browser = testBrowser()
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (m: unknown) => { warns.push(String(m)) }
  try {
    const stream = renderToStream(h('div', {}, [
      h('span', {}, 'ok'),
      { type: 42 } as never,
    ]))
    const root = browser.document.querySelector('#root') as HTMLElement
    const applier = new CommandApplier(root, browser.document)
    const reader = stream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      applier.apply(value)
    }
    assert.equal(warns.length, 1, '非法输入一次 warn')
    assert.match(warns[0], /非法子节点/)
    const div = root.querySelector('div')!
    assert.equal(div.childNodes.length, 2, '2 子项 ⟷ 2 节点（同构仍保持）')
    assert.equal((div.childNodes[1] as Comment).textContent.includes('wf-hole'), true, '诊断占位')
  } finally {
    console.warn = origWarn
  }
})
