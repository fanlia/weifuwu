/**
 * scroll-lock 基础设施测试 — lock/unlock 计数配对 + 下溢防护 + style 还原
 */

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

setupJsdom()

import { lockScroll, unlockScroll } from '../../client/scroll-lock.ts'

beforeEach(() => {
  document.body.style.overflow = ''
  document.body.style.position = ''
  document.body.style.top = ''
  document.body.style.width = ''
})

test('lock/unlock 配对：锁定时 body.overflow=hidden，解锁后还原', () => {
  assert.equal(document.body.style.overflow, '')
  lockScroll()
  assert.equal(document.body.style.overflow, 'hidden')
  unlockScroll()
  assert.equal(document.body.style.overflow, '')
})

test('嵌套 lock：计数，只在最后一次 unlock 还原', () => {
  lockScroll()
  lockScroll()
  assert.equal(document.body.style.overflow, 'hidden')
  // 第一次 unlock 不还原（仍有持有者）
  unlockScroll()
  assert.equal(document.body.style.overflow, 'hidden')
  // 第二次 unlock 才还原
  unlockScroll()
  assert.equal(document.body.style.overflow, '')
})

test('下溢防护：未锁定时 unlock 是 no-op（不走负数）', () => {
  // 未调 lock 直接 unlock——不应抛、不应改 style、scrollTo 不触发
  assert.doesNotThrow(() => unlockScroll())
  assert.equal(document.body.style.overflow, '')
  // 之后正常 lock 仍生效
  lockScroll()
  assert.equal(document.body.style.overflow, 'hidden')
  unlockScroll()
  assert.equal(document.body.style.overflow, '')
})

test('下溢防护：unlock 多于 lock 后，计数归零不破坏后续配对', () => {
  lockScroll()
  unlockScroll()
  // 多 unlock 一次（错误使用）
  unlockScroll()
  unlockScroll()
  // 再 lock/unlock 仍正常
  lockScroll()
  assert.equal(document.body.style.overflow, 'hidden')
  unlockScroll()
  assert.equal(document.body.style.overflow, '')
})

test('保留原有 overflow 值：还原时恢复自定义值', () => {
  document.body.style.overflow = 'auto'
  lockScroll()
  assert.equal(document.body.style.overflow, 'hidden')
  unlockScroll()
  assert.equal(document.body.style.overflow, 'auto')
})
