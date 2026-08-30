/**
 * vdom core/diff — attrs 测试（属性精准 diff——纯函数）
 *
 * 契约：静态面值比较（只发变化键——旧有新的没有 → undefined 移除）；
 * 函数面引用比较（prev !== next 才发——prev 传递）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import { diffAttrs } from '../../client/vdom/core/diff/attrs.ts'

function run(oldProps: Record<string, unknown>, newProps: Record<string, unknown>) {
  const cmds: unknown[] = []
  diffAttrs(h('div', oldProps), h('div', newProps), 'n', (c) => cmds.push(c))
  return cmds
}

test('静态面值比较：只发变化的键（无变化零命令）', () => {
  assert.deepEqual(run({ class: 'a' }, { class: 'a' }), [], '同值不发')
  const cmds = run({ class: 'a', id: 'x' }, { class: 'b', id: 'x' })
  assert.deepEqual(cmds, [{ op: 'setProp', id: 'n', key: 'class', value: 'b' }], '只发变化键')
})

test('旧有新的没有 → setProp undefined（属性移除）', () => {
  const cmds = run({ class: 'a', title: 't' }, { class: 'a' })
  assert.deepEqual(cmds, [{ op: 'setProp', id: 'n', key: 'title', value: undefined }], '移除旧属性')
})

test('函数面：引用比较——变化才发（prev 传递——解绑重绑）', () => {
  const f1 = () => {}
  const f2 = () => {}
  assert.deepEqual(run({ onClick: f1 }, { onClick: f1 }), [], '同引用不发（零重绑）')
  const cmds = run({ onClick: f1 }, { onClick: f2 })
  assert.deepEqual(cmds, [{ op: 'setProp', id: 'n', key: 'onClick', value: f2, prev: f1 }], '引用变化发 prev')
})

test('静态 + 函数面混合（分别处理）', () => {
  const f1 = () => {}
  const f2 = () => {}
  const cmds = run({ class: 'a', onClick: f1 }, { class: 'b', onClick: f2 })
  assert.equal(cmds.length, 2, '静态变化 + 函数变化')
  assert.deepEqual(cmds[0], { op: 'setProp', id: 'n', key: 'class', value: 'b' })
  assert.deepEqual(cmds[1], { op: 'setProp', id: 'n', key: 'onClick', value: f2, prev: f1 })
})

test('children/key 不参与（剥离面）', () => {
  const cmds = run({ children: 'x' }, { children: 'y' })
  assert.deepEqual(cmds, [], 'children 不进 diffAttrs（childrenOf 处理）')
})

test('表单控件 value 特判：formControl=true 时总是发（渲染树同值也发——DOM 脱节修复）', () => {
  // DOM 值可能被用户打字直改（渲染树从未同步）——diff 旧渲染树值与新值
  // 同为 '' 时不发 → 清空场景 DOM 残留（2027-09 输入残留实证）——总是发
  // + patch 现值比较（同值零写）修复
  const cmds: unknown[] = []
  diffAttrs(
    h('input', { value: '' }), h('input', { value: '' }), 'n',
    (c) => cmds.push(c), { formControl: true },
  )
  assert.deepEqual(cmds, [{ op: 'setProp', id: 'n', key: 'value', value: '' }], 'value 键总是发（同值也发）')
  // 非表单控件（div）行为不变——无变化零命令
  const cmds2: unknown[] = []
  diffAttrs(h('div', { value: '' }), h('div', { value: '' }), 'n', (c) => cmds2.push(c))
  assert.deepEqual(cmds2, [], '非表单控件不发')
  // formControl 时其他键仍只发变化
  const cmds3: unknown[] = []
  diffAttrs(h('input', { value: 'a', class: 'x' }), h('input', { value: 'a', class: 'x' }), 'n', (c) => cmds3.push(c), { formControl: true })
  assert.deepEqual(cmds3, [{ op: 'setProp', id: 'n', key: 'value', value: 'a' }], '仅 value 总是发——class 同值不发')
})

// 浏览器测试 runner 入口标记（sideEffects 摇除防护——scripts/test-browser.ts 引用）
export const __wf_tests = (): void => {}
