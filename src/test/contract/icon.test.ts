/**
 * Icon 契约——未知 name 防御（CLIENT-EXCELLENCE-PLAN A4）
 *
 * 实证：原 `PATHS[name].map` 未知 name 直接崩 renderFn（组件级 hole 降级
 * ——重试自愈循环刷错误日志——statcard demo 无效图标名实证）。
 *
 * 锁定：
 * - 未知 name → dev warn 恰一次（去重）+ fallback 圆点 path 仍渲染
 * - 已知 name → 正常 path 序列
 * - 已知 name 无 warn（零误报）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mount } from './component-harness.ts'
import { Icon } from '../../client/components/Icon/Icon.ts'

/** console.warn 拦截（返回收集数组 + restore——测试完必须恢复） */
let warnBox: string[] = []
let restoreWarn: () => void = () => {}
function captureWarn(): string[] {
  warnBox = []
  const orig = console.warn
  console.warn = (...a: unknown[]) => { warnBox.push(String(a[0])) }
  restoreWarn = () => { console.warn = orig }
  return warnBox
}

test('Icon 未知 name：fallback 圆点渲染（不崩——svg + path 仍产出）', async () => {
  const box = captureWarn()
  try {
    const h = await mount(Icon, { name: 'totally-unknown-icon' })
    const creates = h.cmds.filter((c) => c.op === 'create')
    assert.ok(creates.some((c) => c.tag === 'svg'), 'svg 根渲染（不崩——hole 降级不再触发）')
    assert.ok(creates.some((c) => c.tag === 'path'), 'fallback path 渲染')
  } finally { restoreWarn() }
})

test('Icon 未知 name：dev warn 恰一次（去重——重渲染不刷屏）', async () => {
  const box = captureWarn()
  try {
    ;(globalThis as unknown as { __WF_DEV__?: boolean }).__WF_DEV__ = true
    const h = await mount(Icon, { name: 'another-unknown' })
    const mountHits = warnBox.filter((w) => w.includes('another-unknown'))
    assert.equal(mountHits.length, 1, `mount warn 恰一次（实际 ${mountHits.length}）`)
    const before = warnBox.length
    await h.render({ name: 'another-unknown' })
    const reHits = warnBox.slice(before).filter((w) => w.includes('another-unknown'))
    assert.equal(reHits.length, 0, `重渲染零 warn（去重）`)
  } finally {
    ;(globalThis as unknown as { __WF_DEV__?: boolean }).__WF_DEV__ = undefined
    ;(globalThis as unknown as { __iconWarned?: string }).__iconWarned = undefined
    restoreWarn()
  }
})

test('Icon 已知 name：正常 path 序列（零 warn——零误报）', async () => {
  const box = captureWarn()
  try {
    ;(globalThis as unknown as { __WF_DEV__?: boolean }).__WF_DEV__ = true
    const h = await mount(Icon, { name: 'check' })
    assert.ok(h.cmds.some((c) => c.op === 'create' && c.tag === 'path'), '已知图标 path 渲染')
    assert.equal(warnBox.filter((w) => w.includes('[Icon]')).length, 0, '已知 name 零 warn')
  } finally {
    ;(globalThis as unknown as { __WF_DEV__?: boolean }).__WF_DEV__ = undefined
    restoreWarn()
  }
})
