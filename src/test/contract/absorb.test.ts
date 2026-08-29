/**
 * vdom v2 — SSR 吸收契约测试（波次 4：状态机流化——纯 reducer + 事件时间线）
 *
 * 锁定：
 * - absorbReducer 迁移表全分支（begin/next matched/next 耗尽/end 剩余/end 空/
 *   end 于非 consuming no-op/reset 任意）
 * - AbsorbState：事件时间线（begin→next→end 序列——相位单源 scan 折叠）
 * - failed$ 派生（next 耗尽 / end remaining>0 两径）
 * - 时间线回放（记录事件序列 → 重喂 reducer → 同终态——与相位一致）
 * - next 违例（非 consuming）→ console.error + null + 无迁移事件
 * - reset 恢复非吸收态（queue 弃用）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AbsorbState, absorbReducer, type AbsorbEvent } from '../../client/vdom/core/ssr/absorb.ts'

async function collect<T>(obs: { subscribe(o: { next(v: T): void }): void }): Promise<T[]> {
  const out: T[] = []
  obs.subscribe({ next: (v) => out.push(v) })
  return out
}

// ── reducer 纯函数（迁移表全分支） ─────────────────────────

test('absorbReducer：begin —— 任意 → consuming', () => {
  assert.equal(absorbReducer('inactive', { kind: 'begin' }), 'consuming')
  assert.equal(absorbReducer('failed', { kind: 'begin' }), 'consuming', 'begin 无条件（幂等——现状）')
})

test('absorbReducer：next matched → consuming；耗尽 → failed', () => {
  assert.equal(absorbReducer('consuming', { kind: 'next', matched: true }), 'consuming')
  assert.equal(absorbReducer('consuming', { kind: 'next', matched: false }), 'failed')
})

test('absorbReducer：end —— consuming 无剩余 → inactive；有剩余 → failed；非 consuming → no-op', () => {
  assert.equal(absorbReducer('consuming', { kind: 'end', remaining: 0 }), 'inactive', '正常收尾')
  assert.equal(absorbReducer('consuming', { kind: 'end', remaining: 3 }), 'failed', 'mismatch（SSR 多于命令）')
  assert.equal(absorbReducer('inactive', { kind: 'end', remaining: 0 }), 'inactive', '未 begin 的 end = 合法 no-op（procDone 无条件）')
  assert.equal(absorbReducer('failed', { kind: 'end', remaining: 0 }), 'failed', 'failed 后 end no-op')
})

test('absorbReducer：reset —— 任意 → inactive', () => {
  assert.equal(absorbReducer('consuming', { kind: 'reset' }), 'inactive')
  assert.equal(absorbReducer('failed', { kind: 'reset' }), 'inactive')
})

// ── AbsorbState 实例（假节点对象——无 DOM） ─────────────────

/** 假元素节点（nodeType/tagName 面——next 消费所需） */
function fakeEl(tag: string): unknown {
  return { nodeType: 1, tagName: tag.toUpperCase(), childNodes: [] }
}

test('AbsorbState：事件时间线（begin → next 命中 ×2 → end 剩余 0 —— 相位 inactive）', async () => {
  const a = new AbsorbState()
  const events = await collect<AbsorbEvent>(a.events$)
  const container = { childNodes: [fakeEl('div'), fakeEl('span')] } as unknown as HTMLElement
  a.begin(container)
  assert.equal(a.phase, 'consuming', 'begin → consuming（折叠写回）')
  assert.ok(a.next('element', 'div'), '命中 div')
  assert.ok(a.next('element', 'span'), '命中 span')
  a.end()
  assert.equal(a.phase, 'inactive', 'end 剩余 0 → inactive')
  assert.deepEqual(events.map((e) => e.kind), ['begin', 'next', 'next', 'end'], '完整时间线')
})

test('AbsorbState：跳过不匹配（SSR 额外注释/空白）——不产生事件——继续匹配', async () => {
  const a = new AbsorbState()
  const events = await collect<AbsorbEvent>(a.events$)
  const container = { childNodes: [{ nodeType: 8, childNodes: [] }, fakeEl('b')] } as unknown as HTMLElement
  a.begin(container)
  assert.ok(a.next('element', 'b'), '跳过注释后命中 b')
  assert.deepEqual(events.map((e) => e.kind), ['begin', 'next'], '跳过无事件（只记迁移）')
})

test('AbsorbState：next 耗尽 → failed$ 事件（failed 相位——后续 next 违例）', async () => {
  const a = new AbsorbState()
  let failedN = 0
  a.failed$.subscribe({ next: () => failedN++ })
  const container = { childNodes: [fakeEl('div')] } as unknown as HTMLElement
  a.begin(container)
  assert.ok(a.next('element', 'div'), '命中')
  assert.equal(a.next('element', 'span'), null, '队列耗尽 → null')
  assert.equal(a.phase, 'failed', '耗尽 → failed')
  assert.equal(failedN, 1, 'failed$ 事件一次')
})

test('AbsorbState：end 剩余 = mismatch → failed$（SSR 多于命令）', async () => {
  const a = new AbsorbState()
  let failedN = 0
  a.failed$.subscribe({ next: () => failedN++ })
  const container = { childNodes: [fakeEl('div'), fakeEl('span')] } as unknown as HTMLElement
  a.begin(container)
  assert.ok(a.next('element', 'div'), '只消费 div')
  a.end()
  assert.equal(a.phase, 'failed', '剩余 span → failed')
  assert.equal(failedN, 1, 'failed$ 事件（mismatch 径）')
})

test('AbsorbState：next 违例（非 consuming）→ console.error + null + 无迁移事件', async () => {
  const a = new AbsorbState()
  const events = await collect<AbsorbEvent>(a.events$)
  const errs: string[] = []
  const orig = console.error
  console.error = (m: unknown) => { errs.push(String(m)) }
  try {
    assert.equal(a.next('element', 'div'), null, '违例 → null（不抛）')
  } finally { console.error = orig }
  assert.ok(errs.some((e) => e.includes('违例')), '违例报错（audit 可见）')
  assert.equal(events.length, 0, '无迁移事件')
})

test('AbsorbState：reset 恢复非吸收态（queue 弃用——相位 inactive——后续 create 走新建）', async () => {
  const a = new AbsorbState()
  const container = { childNodes: [fakeEl('div')] } as unknown as HTMLElement
  a.begin(container)
  assert.equal(a.next('element', 'span'), null, 'tag 不符 → 跳过 → 耗尽 → failed')
  assert.equal(a.phase, 'failed')
  a.reset()
  assert.equal(a.phase, 'inactive', 'reset → inactive')
  assert.equal(a.queue, null, 'queue 弃用')
})

// ── 时间线回放（记录 → 重喂 → 同终态） ─────────────────────

test('时间线回放：记录事件序列 → 重喂 absorbReducer → 同终态', async () => {
  const a = new AbsorbState()
  const events: AbsorbEvent[] = []
  a.events$.subscribe({ next: (e) => events.push(e) })
  const container = { childNodes: [fakeEl('div'), fakeEl('span')] } as unknown as HTMLElement
  a.begin(container)
  a.next('element', 'div')
  a.next('element', 'span')
  a.end()
  assert.equal(a.phase, 'inactive')
  // 回放：同一事件序列重喂 reducer——终态一致（时间线即日志——回放语义）
  let played = 'inactive' as 'inactive' | 'consuming' | 'failed'
  for (const e of events) played = absorbReducer(played, e)
  assert.equal(played, a.phase, '回放终态 ≡ 实例终态')
})

test('时间线回放：failed 序列（next 耗尽）——重喂 → failed', async () => {
  const a = new AbsorbState()
  const events: AbsorbEvent[] = []
  a.events$.subscribe({ next: (e) => events.push(e) })
  const container = { childNodes: [fakeEl('div')] } as unknown as HTMLElement
  a.begin(container)
  a.next('element', 'div')
  assert.equal(a.next('element', 'span'), null)
  assert.equal(a.phase, 'failed')
  let played = 'inactive' as 'inactive' | 'consuming' | 'failed'
  for (const e of events) played = absorbReducer(played, e)
  assert.equal(played, 'failed', '回放终态 ≡ failed')
})
