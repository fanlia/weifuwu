/**
 * vdom core — hole 测试（特殊值渲染——空洞占位 + 非法输入诊断）
 *
 * 锁定规则（AGENTS §4.0/§6.3——占位法）：false/null/undefined/true → 占位锚
 * （childNodes 长度恒定——同构不变量）；非法输入（对象/数字 type/未知 Symbol）
 * → 诊断占位 + warn（不崩溃不静默）；占位静态零回调（不触发补渲染）。
 *
 * 真实浏览器（vitest browser + playwright——无 jsdom）——直接使用全局
 * document——root 由 browser-setup 注入。
 */

import { test, expect } from 'vitest'
import { isHole, isInvalid, invalidDiagnostic, holeCommands, emitHole } from './hole.ts'
import { h } from '../vnode.ts'
import { renderToStream } from '../build.ts'
import { CommandApplier } from '../patch/index.ts'
import type { Command } from '../command/index.ts'

test('isHole：false/null/undefined/true 全部是空洞（无渲染值）', () => {
  expect(isHole(false)).toBe(true)
  expect(isHole(null)).toBe(true)
  expect(isHole(undefined)).toBe(true)
  expect(isHole(true)).toBe(true)
  expect(isHole('text')).toBe(false)
  expect(isHole(0)).toBe(false) // 0 是文本（渲染 "0"——0 && <X/> 红线）
  expect(isHole(h('div', {}))).toBe(false)
})

test('isInvalid：对象/数字 type/未知 Symbol 是非法；正常 vnode 不是', () => {
  expect(isInvalid({})).toBe(true) // 裸对象——无 type
  expect(isInvalid({ type: 42 })).toBe(true) // 数字 type
  expect(isInvalid(Symbol('x') as never)).toBe(true) // 裸 Symbol
  expect(isInvalid(h('div', {}))).toBe(false)
  expect(isInvalid('text')).toBe(false)
  expect(isInvalid([h('span', {})])).toBe(false)
  expect(isInvalid(false)).toBe(false) // 空洞归 hole 不归 invalid
})

test('invalidDiagnostic：明确诊断信息（warn 提示用）', () => {
  expect(invalidDiagnostic({})).toMatch(/object/)
  expect(invalidDiagnostic({ type: 42 })).toMatch(/number/)
  expect(invalidDiagnostic('str' as never)).toBe('string')
})

test('holeCommands：createAnchor + insert 命令对（同构长度恒定）', () => {
  const cmds = holeCommands('a.b.2', 'a.b', 'a.b.1')
  expect(cmds).toEqual([
    { op: 'createAnchor', id: 'a.b.2' },
    { op: 'insert', id: 'a.b.2', parent: 'a.b', ref: 'a.b.1' },
  ])
  const withDetail = holeCommands('x', 'root', null, 'object（type: number）')
  expect(withDetail[0].op === 'createAnchor' && withDetail[0].detail).toBe('object（type: number）')
})

test('render 集成：空洞占位 → 注释节点（DOM 同构——长度恒定）', async () => {
  const stream = renderToStream(h('div', {}, [
    h('span', {}, 'a'),
    false,
    null,
    true,
    h('i', {}, 'b'),
  ]))
  const root = document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, document)
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    applier.apply(value)
  }
  const div = root.querySelector('div')!
  expect(div.childNodes.length).toBe(5) // 5 子项 ⟷ 5 节点（2 元素 + 3 空洞占位）
  expect(div.childNodes[0].nodeType).toBe(1) // span 元素
  expect(div.childNodes[1].nodeType).toBe(8) // false → 注释占位
  expect(div.childNodes[2].nodeType).toBe(8) // null → 注释占位
  expect(div.childNodes[3].nodeType).toBe(8) // true → 注释占位
  expect(div.childNodes[4].nodeType).toBe(1) // i 元素
  expect((div.childNodes[1] as Comment).textContent).toBe('wf-hole')
})

test('render 集成：非法输入 → 诊断占位 + warn（不崩溃不静默）', async () => {
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (m: unknown) => { warns.push(String(m)) }
  try {
    const stream = renderToStream(h('div', {}, [
      h('span', {}, 'ok'),
      { type: 42 } as never,
    ]))
    const root = document.querySelector('#root') as HTMLElement
    const applier = new CommandApplier(root, document)
    const reader = stream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      applier.apply(value)
    }
    expect(warns.length).toBe(1) // 非法输入一次 warn
    expect(warns[0]).toMatch(/非法子节点/)
    const div = root.querySelector('div')!
    expect(div.childNodes.length).toBe(2) // 2 子项 ⟷ 2 节点（同构仍保持）
    expect((div.childNodes[1] as Comment).textContent.includes('wf-hole')).toBe(true) // 诊断占位
  } finally {
    console.warn = origWarn
  }
})

// emitHole 引用保持（直接导入的 API 面——编译期验证）
void emitHole
void (null as unknown as Command)
