/**
 * BackTop 组件契约测试——命令流级断言（零浏览器）
 *
 * 锁定（SSR 吸收失败回归防线——2027-xx 实证）：
 * - **零浏览器渲染零错误**：attach 经 ctx.browser（零全局 window/document 访问）——
 *   SSR node 环境 renderFn 不抛错（旧实现直接 window → ReferenceError →
 *   hole 降级 → 吸收失败链——showcase 审计红根因）
 * - 首帧恒隐（wf-backtop--hidden——SSR/客户端同构）
 * - onClick 不进 attrs（事件表通道）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BackTop } from './BackTop.ts'
import { mount, createTable } from '../../../test/contract/component-harness.ts'

test('SSR 环境（无浏览器）→ 渲染零错误 + 首帧恒隐（吸收同构）', async () => {
  const h = await mount(BackTop, {})
  const ct = createTable(h.cmds)
  const btns = [...ct.values()].filter((c) => c.tag === 'button')
  assert.equal(btns.length, 1, '按钮渲染（实际 ' + btns.length + '）')
  assert.ok(String(btns[0].attrs.class).includes('wf-backtop'), '容器 class')
  assert.ok(String(btns[0].attrs.class).includes('wf-backtop--hidden'), '首帧恒隐（实际: ' + btns[0].attrs.class + '）')
  assert.equal(btns[0].attrs.onClick, undefined, 'onClick 不进 attrs（事件表通道）')
})

test('重渲染零错误（SSR 首帧 → 客户端拍——无浏览器不绑定不崩溃）', async () => {
  const h = await mount(BackTop, { visibilityHeight: 100 })
  const cmds = await h.render({ visibilityHeight: 200 })
  assert.ok(Array.isArray(cmds), '重渲染命令流返回（无 throw）')
  assert.ok(!cmds.some((c) => c.op === 'create'), '无重建（复用路径）')
})
