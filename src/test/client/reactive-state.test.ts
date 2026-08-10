/**
 * createReactiveState — 公开响应式状态容器（P0-1 导出验证）
 *
 * 外部开发者组件外建全局 store 的入口：深度 Proxy + __watch 订阅。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { createReactiveState } from '../../ui-dom/reactive.ts'
const browser = createClientBrowser()

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

test('Set 存 $：方法调用触发 dirty 且 this 正确（DiffView 教训回归）', () => {
  let dirtyCount = 0
  const $ = createReactiveState(() => { dirtyCount++ })
  const before = dirtyCount
  $.expanded = new Set<string>()
  assert.equal(dirtyCount, before + 1, '赋值触发')
  // Set 方法调用（此前 TypeError：Proxy 包装破坏 Set.prototype.has this）
  $.expanded.add('svc')
  assert.equal(dirtyCount, before + 2, 'add 触发 dirty')
  assert.ok($.expanded.has('svc'), 'has 工作（this 正确）')
  $.expanded.delete('svc')
  assert.equal(dirtyCount, before + 3, 'delete 触发 dirty')
  assert.equal($.expanded.size, 0)
})

test('Map 存 $：set/get 方法调用触发 dirty', () => {
  let dirtyCount = 0
  const $ = createReactiveState(() => { dirtyCount++ })
  const before = dirtyCount
  $.cache = new Map<string, number>()
  $.cache.set('a', 1)
  assert.equal($.cache.get('a'), 1)
  assert.equal(dirtyCount, before + 2, '赋值 + map.set 均触发')
})

test('Date 存 $：返回原引用（不包装）', () => {
  let dirtyCount = 0
  const $ = createReactiveState(() => { dirtyCount++ })
  const d = new Date()
  $.start = d
  assert.equal($.start, d, 'Date 返回原引用（无 Proxy）')
  assert.equal($.start instanceof Date, true)
})

test('$ 缓存原型链隔离：子组件 ui 继承 root 时 $ 必须独立（AppShell 折叠根因回归）', () => {
  // 模拟 render.ts 的 childCtx.ui = Object.create(rootUi) + _selfId/_selfVNode
  const rootUi = { _selfId: '_wf_root', _selfVNode: { _id: '_wf_root' } }
  rootUi._$cache = createReactiveState(() => { /* root 的 dirty */ })

  // child 继承 root——若 $() 用 truthy 判断会拿到 root 的 $（原型链污染）
  const childUi = Object.create(rootUi)
  childUi._selfId = '_wf_child'
  childUi._selfVNode = { _id: '_wf_child' }

  // 模拟 ui.ts $()：必须 own property 判断
  let resolvedChild: string | null = null
  if (!Object.prototype.hasOwnProperty.call(childUi, '_$cache')) {
    childUi._$cache = createReactiveState(() => {
      resolvedChild = childUi._selfVNode?._id ?? childUi._selfId
    })
  }

  // child 的 $ 独立于 root——赋值只触发 child 的 dirty
  childUi._$cache.count = 1
  assert.equal(resolvedChild, '_wf_child', 'child 的 $ 必须解析到 child 自身')
  assert.notEqual(childUi._$cache, rootUi._$cache, '$ 缓存必须隔离（own property）')
  // root 的 $ 不受影响
  rootUi._$cache.x = 1
  assert.equal(rootUi._$cache.count, undefined, 'child 赋值不影响 root')
})
