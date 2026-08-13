/**
 * 路由生命周期状态机（route.ts——四状态机架构·第一层）
 *
 * idle → navigating → settled；NAVIGATE_START/DONE/ERROR 查表分派。
 * 全连接测试的基础：导航状态 + 节点生命周期可统一断言。
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { createRouteController, type RouteLifecycle } from '../ui-dom/vdom2/route.ts'

test('R1: 路由转换矩阵（合法转换）', () => {
  const c = createRouteController()
  assert.equal(c.state, 'idle')
  c.navigateStart('/a')
  assert.equal(c.state, 'navigating')
  c.navigateDone('/a')
  assert.equal(c.state, 'settled')
  c.navigateStart('/b')
  assert.equal(c.state, 'navigating')
  c.navigateDone('/b')
  assert.equal(c.state, 'settled')
})

test('R2: 导航失败回退 idle', () => {
  const c = createRouteController()
  c.navigateStart('/x')
  assert.equal(c.state, 'navigating')
  c.navigateError('/x', new Error('boom'))
  assert.equal(c.state, 'idle', '导航失败 → idle（可重新导航）')
  // 失败后还能正常导航
  c.navigateStart('/y')
  assert.equal(c.state, 'navigating')
})

test('R3: 非法转换保留原状态', () => {
  const c = createRouteController()
  // idle 不能直接 DONE（未导航先完成）
  c.navigateDone('/x')
  assert.equal(c.state, 'idle', 'idle 不能 NAVIGATE_DONE')
  // settled 不能 ERROR（没有进行中的导航）
  c.navigateStart('/a')
  c.navigateDone('/a')
  assert.equal(c.state, 'settled')
  c.navigateError('/a', new Error('x'))
  assert.equal(c.state, 'settled', 'settled 不能 NAVIGATE_ERROR')
})

test('R4: 快速连续导航——中间态正确（start→start 非法保留 navigating）', () => {
  const c = createRouteController()
  c.navigateStart('/a')
  assert.equal(c.state, 'navigating')
  // 快速连续：第二个 start 在 navigating 中（第一个未 done）
  c.navigateStart('/b')
  assert.equal(c.state, 'navigating', 'navigating 中再 start 保留 navigating（串行化——过期丢弃在 serve 层）')
  c.navigateDone('/b')
  assert.equal(c.state, 'settled')
})

test('R5: 多实例隔离——每 app 一个协调器', () => {
  const a = createRouteController()
  const b = createRouteController()
  a.navigateStart('/a')
  assert.equal(a.state, 'navigating')
  assert.equal(b.state, 'idle', '实例隔离——互不影响')
})
