/**
 * vdom — 弹窗相位契约（波次 6：PopupPhase 纯 reducer——时间线可回放）
 *
 * 锁定：
 * - popupPhaseReducer 迁移表全分支（open/exit/closed/disposed——幂等）
 * - 时间线回放（记录事件序列 → 重喂 reducer → 同终态——与实例一致）
 * - 退场序列（open→exit→closed）/立即关序列（open→closed）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { popupPhaseReducer, type PopupEvent, type PopupPhase } from '../../client/vdom/hooks/popup-manager.ts'

function replay(events: PopupEvent[]): PopupPhase {
  let s: PopupPhase = 'closed'
  for (const e of events) s = popupPhaseReducer(s, e)
  return s
}

test('popupPhaseReducer：open → open（任意态）', () => {
  assert.equal(popupPhaseReducer('closed', { kind: 'open' }), 'open')
  assert.equal(popupPhaseReducer('exit', { kind: 'open' }), 'open')
})

test('popupPhaseReducer：exit 仅于 open（presence 退场——幂等）', () => {
  assert.equal(popupPhaseReducer('open', { kind: 'exit' }), 'exit')
  assert.equal(popupPhaseReducer('closed', { kind: 'exit' }), 'closed', '非 open 的 exit 无迁移')
  assert.equal(popupPhaseReducer('exit', { kind: 'exit' }), 'exit')
})

test('popupPhaseReducer：closed / disposed → closed（终态幂等）', () => {
  assert.equal(popupPhaseReducer('open', { kind: 'closed' }), 'closed')
  assert.equal(popupPhaseReducer('exit', { kind: 'closed' }), 'closed')
  assert.equal(popupPhaseReducer('closed', { kind: 'closed' }), 'closed')
  assert.equal(popupPhaseReducer('open', { kind: 'disposed' }), 'closed')
})

test('时间线回放：presence 退场序列（open → exit → closed——与实例同终态）', () => {
  const events: PopupEvent[] = [{ kind: 'open' }, { kind: 'exit' }, { kind: 'closed' }, { kind: 'disposed' }]
  assert.equal(replay(events), 'closed', '回放终态 ≡ closed')
})

test('时间线回放：立即关序列（open → closed——无退场）', () => {
  const events: PopupEvent[] = [{ kind: 'open' }, { kind: 'closed' }, { kind: 'disposed' }]
  assert.equal(replay(events), 'closed')
})

test('时间线回放：关闭后重开（open → closed → open——复用句柄场景）', () => {
  const events: PopupEvent[] = [{ kind: 'open' }, { kind: 'closed' }, { kind: 'disposed' }, { kind: 'open' }]
  assert.equal(replay(events), 'open', '重开 → open（phase 可再迁）')
})
