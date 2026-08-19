/**
 * vdom core — ref 通道测试（独立文件）
 *
 * 锁定纪律（AGENTS §5.1）：挂载 ref(el) / 卸载 ref(null)——
 * prev 引用变化先退旧（diff 重绑定正确性——内联 ref 反复触发的坑）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser } from '../../setup.ts'
import { applyRef, REF_KEY } from './ref.ts'

test('ref 挂载/卸载：ref(el) → ref(null)', () => {
  const d = testBrowser().document
  const e = d.createElement('div')
  const calls: Array<HTMLElement | null> = []
  const ref = (x: HTMLElement | null) => { calls.push(x) }
  applyRef(e, ref)                       // 挂载
  applyRef(null, null, ref)              // 卸载（prev = ref → ref(null)）
  assert.deepEqual(calls, [e, null])
})

test('ref 引用变化：旧 ref 退 null + 新 ref 接 el（diff 重绑定）', () => {
  const d = testBrowser().document
  const e = d.createElement('div')
  const calls: string[] = []
  const r1 = (x: HTMLElement | null) => { calls.push(`r1:${x === null ? 'null' : 'el'}`) }
  const r2 = (x: HTMLElement | null) => { calls.push(`r2:${x === null ? 'null' : 'el'}`) }
  applyRef(e, r1)
  applyRef(e, r2, r1)
  assert.deepEqual(calls, ['r1:el', 'r1:null', 'r2:el'], '旧 ref 退 null 后新 ref 接 el')
})

test('ref 同引用：不重复退旧（diff 幂等）', () => {
  const d = testBrowser().document
  const e = d.createElement('div')
  const calls: string[] = []
  const ref = (x: HTMLElement | null) => { calls.push(x === null ? 'null' : 'el') }
  applyRef(e, ref)
  applyRef(e, ref, ref)
  assert.deepEqual(calls, ['el'], '同引用——prev === next——不退旧不重绑')
})

test('ref 常量：REF_KEY = ref（setProp 分发键）', () => {
  assert.equal(REF_KEY, 'ref')
})

test('ref 非函数值：忽略（无回调——静默不可用由组件 warn 防护）', () => {
  const d = testBrowser().document
  const e = d.createElement('div')
  applyRef(e, 'not-a-function' as unknown as (x: HTMLElement | null) => void)
  applyRef(null, null, 'not-a-function' as unknown as (x: HTMLElement | null) => void)
  // 不抛错即可——无回调时组件层自行防护
  assert.ok(true)
})

// ── RefRegistry（全局注册表——对齐事件代理模式） ──

import { RefRegistry } from './ref.ts'

test('RefRegistry：注册 → mount 触发（insert 后查表）；unmount ref(null) 子树', () => {
  const reg = new RefRegistry()
  const calls: string[] = []
  const fn = (el: HTMLElement | null) => { calls.push(el ? `mount:${el.id}` : 'unmount') }
  const el = { id: 'x' } as unknown as HTMLElement
  reg.set('root.0', fn)
  reg.mount('root.0', el)
  assert.deepEqual(calls, ['mount:x'], 'mount 查表触发')
  reg.unmount('root.0')
  assert.deepEqual(calls, ['mount:x', 'unmount'], 'unmount → ref(null)')
  // 卸载后表已删——再 mount 不触发
  reg.mount('root.0', el)
  assert.deepEqual(calls, ['mount:x', 'unmount'])
})

test('RefRegistry：子树前缀匹配（unmount 整棵子树）', () => {
  const reg = new RefRegistry()
  const calls: string[] = []
  reg.set('root.0', () => { calls.push('a') })
  reg.set('root.0.0', () => { calls.push('b') })
  reg.set('root.1', () => { calls.push('c') })
  reg.unmount('root.0')
  assert.deepEqual(calls, ['a', 'b'], '子树 ref(null) 全部')
  reg.mount('root.1', {} as HTMLElement)
  assert.deepEqual(calls, ['a', 'b', 'c'], '兄弟子树不受影响')
})

test('RefRegistry：set prev 重绑——旧引用退 null + 新引用 mount', () => {
  const reg = new RefRegistry()
  const calls: string[] = []
  const r1 = (el: HTMLElement | null) => { calls.push(`r1:${el === null ? 'null' : 'el'}`) }
  const r2 = (el: HTMLElement | null) => { calls.push(`r2:${el === null ? 'null' : 'el'}`) }
  const el = {} as HTMLElement
  reg.set('root.0', r1)
  reg.mount('root.0', el)
  // diff 重绑（prev = r1）——旧退 null + 新注册——再 mount
  reg.set('root.0', r2, r1)
  assert.deepEqual(calls, ['r1:el', 'r1:null'], 'prev 旧引用退 null')
  reg.mount('root.0', el)
  assert.deepEqual(calls, ['r1:el', 'r1:null', 'r2:el'], '新引用 mount')
})

test('RefRegistry：move 前缀重映射（节点移动——表跟随）', () => {
  const reg = new RefRegistry()
  const calls: string[] = []
  const fn = (el: HTMLElement | null) => { calls.push(el ? 'mount' : 'unmount') }
  reg.set('root.0.2', fn)
  reg.remap('root.0.2', 'root.0.0')
  const el = {} as HTMLElement
  reg.mount('root.0.0', el)
  assert.deepEqual(calls, ['mount'], '重映射后新 id 查表命中')
})
