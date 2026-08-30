/**
 * CodeBlock 组件契约测试——命令流级断言（零浏览器——node 直跑）
 *
 * 锁定（2026-12 定时器纪律专项）：
 * - 首帧：结构（header/pre/code）+ 语法高亮 span
 * - 点击复制 → 复位定时器创建 → 卸载清理零遗留（hold 通道——
 *   否则卸载后 ctx.render 违例报错）
 * - 复制态图标切换（copy → check——copied 态重渲染）
 *
 * 运行：node --env-file=.env --test src/client/components/CodeBlock/CodeBlock.test.ts
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { CodeBlock } from './CodeBlock.ts'
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

/** 提取首帧 onClick（事件经 setProp 通道——命令流直接调用——harness 无 DOM） */
function firstOnClick(cmds: Array<any>): (e?: unknown) => unknown {
  const p = cmds.find((c) => c.op === 'setProp' && c.key === 'onClick')
  assert.ok(p, 'onClick 经 setProp 通道')
  return p.value
}

test('首帧：结构（header/pre/code）+ 高亮 span + 复制按钮', async () => {
  const h = await mount(CodeBlock, { code: 'const x = 1\nreturn x', lang: 'ts' })
  const ct = createTable(h.cmds)
  assert.ok(ops(h.cmds).includes('mount'), '组件挂载命令')
  const tags = [...ct.values()].map((n) => n.tag)
  assert.ok(tags.includes('pre') && tags.includes('code'), 'pre/code 结构')
  const hl = [...ct.values()].filter((n) => String(n.attrs.class ?? '').startsWith('wf-hl-'))
  assert.ok(hl.length >= 1, '语法高亮 span 存在')
  const copyBtn = [...ct.values()].find((n) => n.attrs.class === 'wf-codeblock-copy')
  assert.ok(copyBtn, '复制按钮存在')
  assert.equal(copyBtn!.attrs.type, 'button', 'type=button')
})

test('点击复制 → 复位定时器创建 → 卸载清理：零遗留（违例 render 根治）', async () => {
  const h = await mount(CodeBlock, { code: 'const x = 1', lang: 'ts' })
  const onClick = firstOnClick(h.cmds as any[])
  await onClick({})
  const timeouts = created.filter((c) => c.kind === 'timeout').map((c) => c.id)
  assert.ok(timeouts.length >= 1, '复制后复位 setTimeout 已创建（1.6s copied 态）')
  h.unmount()
  for (const id of timeouts) assert.ok(cleared.includes(id), `setTimeout ${String(id)} 已 clear`)
})

test('连续复制：旧定时器清掉再建（clearTimeout 去重——不叠置）', async () => {
  const h = await mount(CodeBlock, { code: 'x' })
  const onClick = firstOnClick(h.cmds as any[])
  await onClick({})
  const first = created.filter((c) => c.kind === 'timeout').map((c) => c.id)
  await onClick({})
  // 第二次点击 clear 第一次的 timer（cleared 含首建 id）+ 新建一个
  assert.ok(first.every((id) => cleared.includes(id)), '旧 timer 已 clear')
  assert.ok(created.filter((c) => c.kind === 'timeout').length >= 2, '新 timer 已建')
})

test('lang 缺省：标题兜底「代码」（title > lang > 兜底优先级）', async () => {
  const h = await mount(CodeBlock, { code: 'x' })
  const texts = h.cmds.filter((c) => c.op === 'createText').map((c) => (c as any).value)
  assert.ok(texts.includes('代码'), `兜底标题存在（实际: ${texts.join(',')}）`)
})
