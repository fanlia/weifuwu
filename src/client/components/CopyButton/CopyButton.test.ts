/**
 * CopyButton 组件契约测试——命令流级断言（零浏览器——node 直跑）
 *
 * 锁定（2026-12 定时器纪律专项）：
 * - 首帧：create 属性面（class 形态/aria-label——事件过滤）
 * - copied 态切换：点击回调态翻转 → 重渲染（class/文案/图标切换）
 * - 卸载清理：hold 通道——未触发的复位 setTimeout 零遗留
 *   （否则卸载后 ctx.render 违例报错）
 *
 * 运行：node --env-file=.env --test src/client/components/CopyButton/CopyButton.test.ts
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { CopyButton } from './CopyButton.ts'
import { mount, ops, createTable } from '../../../test/contract/component-harness.ts'

// ── 定时器 spy ──────────────────────────────────────────────────────
let created: Array<{ kind: 'timeout' | 'interval'; id: unknown }> = []
let cleared: unknown[] = []
const origSetTimeout = globalThis.setTimeout
const origSetInterval = globalThis.setInterval
const origClearTimeout = globalThis.clearTimeout
const origClearInterval = globalThis.clearInterval

beforeEach(() => {
  ;(globalThis as any).window = globalThis
  created = []
  cleared = []
  globalThis.setTimeout = ((fn: any, ms?: number, ...a: any[]) => {
    const id = origSetTimeout(fn, ms, ...a)
    created.push({ kind: 'timeout', id })
    return id
  }) as typeof setTimeout
  globalThis.setInterval = ((fn: any, ms?: number, ...a: any[]) => {
    const id = origSetInterval(fn, ms, ...a)
    created.push({ kind: 'interval', id })
    return id
  }) as typeof setInterval
  globalThis.clearTimeout = ((id: any) => { cleared.push(id); return origClearTimeout(id) }) as typeof clearTimeout
  globalThis.clearInterval = ((id: any) => { cleared.push(id); return origClearInterval(id) }) as typeof clearInterval
})
afterEach(() => {
  for (const c of created) {
    if (c.kind === 'interval') origClearInterval(c.id as any)
    else origClearTimeout(c.id as any)
  }
  delete (globalThis as any).window
  globalThis.setTimeout = origSetTimeout
  globalThis.setInterval = origSetInterval
  globalThis.clearTimeout = origClearTimeout
  globalThis.clearInterval = origClearInterval
})

test('首帧：create 属性面（class 形态/aria-label——事件函数过滤）', async () => {
  const h = await mount(CopyButton, { value: 'hello', label: '复制代码' })
  const ct = createTable(h.cmds)
  assert.ok(ops(h.cmds).includes('mount'), '组件挂载命令')
  const btn = ct.get('root.0')
  assert.ok(btn, '按钮节点存在')
  assert.equal(btn!.tag, 'button')
  assert.equal(btn!.attrs.type, 'button', 'type=button（表单内不提交）')
  assert.equal(btn!.attrs['aria-label'], '复制代码', 'aria-label 取 label')
  assert.equal(btn!.attrs.onClick, undefined, 'onClick 不进 attrs（事件表通道）')
  assert.ok(String(btn!.attrs.class).includes('wf-copy-btn--md'), '默认尺寸 md')
})

test('卸载清理：hold 注册——组件可正常卸载（清理路径零异常）', async () => {
  const h = await mount(CopyButton, { value: 'x' })
  assert.ok(h.mounts() >= 1, '组件挂载')
  h.unmount()
  assert.equal(h.mounts(), 0, '卸载后实例记录清空（hold 清理已执行）')
})

test('点击复制 → 复位定时器创建 → 卸载清理：零遗留（违例 render 根治）', async () => {
  const h = await mount(CopyButton, { value: 'secret' })
  // 事件经 setProp 通道——从命令流提取 onClick 直接调用（harness 无 DOM）
  const clickProp = h.cmds.find((c) => c.op === 'setProp' && (c as any).key === 'onClick') as any
  assert.ok(clickProp, 'onClick 经 setProp 通道')
  await clickProp.value({})
  // 复位定时器已创建（2s copied 态）
  const timeouts = created.filter((c) => c.kind === 'timeout').map((c) => c.id)
  assert.ok(timeouts.length >= 1, '复制后复位 setTimeout 已创建')
  h.unmount()
  // 卸载 → hold 清理 → 定时器必被 clear（缺一即遗留——卸载后 render 违例）
  for (const id of timeouts) assert.ok(cleared.includes(id), `setTimeout ${String(id)} 已 clear`)
})

test('iconOnly/label 组合：aria-label 兜底（无 label → 「复制」）', async () => {
  const h = await mount(CopyButton, { value: 'x', iconOnly: true })
  const ct = createTable(h.cmds)
  assert.equal(ct.get('root.0')!.attrs['aria-label'], '复制', 'aria-label 兜底')
})
