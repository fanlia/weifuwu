/**
 * vdom core/diff — attrs 测试（属性精准 diff——纯函数）
 *
 * 契约：静态面值比较（只发变化键——旧有新的没有 → undefined 移除）；
 * 函数面引用比较（prev !== next 才发——prev 传递）。
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { h } from '../vnode.ts'
import { diffAttrs } from './attrs.ts'

function run(oldProps: Record<string, unknown>, newProps: Record<string, unknown>) {
  const cmds: unknown[] = []
  diffAttrs(h('div', oldProps), h('div', newProps), 'n', (c) => cmds.push(c))
  return cmds
}

test('静态面值比较：只发变化的键（无变化零命令）', () => {
  expect(run({ class: 'a' }, { class: 'a' }), '同值不发').toEqual([])
  const cmds = run({ class: 'a', id: 'x' }, { class: 'b', id: 'x' })
  expect(cmds, '只发变化键').toEqual([{ op: 'setProp', id: 'n', key: 'class', value: 'b' }])
})

test('旧有新的没有 → setProp undefined（属性移除）', () => {
  const cmds = run({ class: 'a', title: 't' }, { class: 'a' })
  expect(cmds, '移除旧属性').toEqual([{ op: 'setProp', id: 'n', key: 'title', value: undefined }])
})

test('函数面：引用比较——变化才发（prev 传递——解绑重绑）', () => {
  const f1 = () => {}
  const f2 = () => {}
  expect(run({ onClick: f1 }, { onClick: f1 }), '同引用不发（零重绑）').toEqual([])
  const cmds = run({ onClick: f1 }, { onClick: f2 })
  expect(cmds, '引用变化发 prev').toEqual([{ op: 'setProp', id: 'n', key: 'onClick', value: f2, prev: f1 }])
})

test('静态 + 函数面混合（分别处理）', () => {
  const f1 = () => {}
  const f2 = () => {}
  const cmds = run({ class: 'a', onClick: f1 }, { class: 'b', onClick: f2 })
  expect(cmds.length, '静态变化 + 函数变化').toBe(2)
  expect(cmds[0]).toEqual({ op: 'setProp', id: 'n', key: 'class', value: 'b' })
  expect(cmds[1]).toEqual({ op: 'setProp', id: 'n', key: 'onClick', value: f2, prev: f1 })
})

test('children/key 不参与（剥离面）', () => {
  const cmds = run({ children: 'x' }, { children: 'y' })
  expect(cmds, 'children 不进 diffAttrs（childrenOf 处理）').toEqual([])
})
