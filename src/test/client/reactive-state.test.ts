/**
 * createReactiveState — 公开响应式状态容器（P0-1 导出验证）
 *
 * 外部开发者组件外建全局 store 的入口：深度 Proxy + __watch 订阅。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createReactiveState } from '../../client/reactive.ts'

test('独立容器：顶层赋值触发 dirty + watcher', () => {
  let dirty = 0
  let watched = 0
  const $ = createReactiveState(() => dirty++)
  $.count = 1
  assert.equal($.count, 1)
  assert.equal(dirty, 1, '赋值触发 dirty')

  const unwatch = $.__watch(() => watched++)
  $.count = 2
  assert.equal(watched, 1, 'watcher 收到通知')
  assert.equal(dirty, 2)

  unwatch()
  $.count = 3
  assert.equal(watched, 1, '退订后不再通知')
})

test('独立容器：深层/数组/删除全部触发（深度 Proxy 语义）', () => {
  let dirty = 0
  const $ = createReactiveState(() => dirty++)

  $.obj = { a: 1 }
  $.obj.a = 2          // 深层
  $.arr = [1]
  $.arr.push(2)        // 数组变异
  delete $.obj.a       // 删除
  assert.equal(dirty, 5, '深层/数组/删除各触发一次')
})

test('相同值赋值不触发（引用稳定 + 值比较）', () => {
  let dirty = 0
  const $ = createReactiveState(() => dirty++)
  $.x = 1
  $.x = 1              // 同值
  assert.equal(dirty, 1, '同值赋值跳过')

  const obj = { k: 1 }
  $.ref = obj
  const first = $.ref
  $.ref = obj          // 同引用
  assert.equal(dirty, 2, '同引用赋值跳过')
  assert.equal($.ref, first, '相同底层对象返回同一 Proxy 实例')
})
