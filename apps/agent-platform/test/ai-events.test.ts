/**
 * AI 事件流测试——发射/查询/桥接映射（三端打通的基础）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aiEmit, aiEvents, resetAiEvents, aiActionFromWf, subscribeAiEvents } from '../src/services/ai-events.ts'

test('ai 事件流：发射 + 查询（按 agentId/action/messageId 过滤）', () => {
  resetAiEvents()
  aiEmit('llm:start', 'agent-1', { model: 'deepseek-v4-flash', messageId: 'm1', departmentId: 'd1' })
  aiEmit('tool:call', 'agent-1', { tool: 'agent-browser', messageId: 'm1', departmentId: 'd1' })
  aiEmit('done', 'agent-1', { content: '回复内容', messageId: 'm1', departmentId: 'd1' })
  aiEmit('error', 'agent-2', { code: 'provider_error', messageId: 'm2' })

  const all = aiEvents()
  assert.equal(all.length, 4, '全部事件')
  assert.equal(all[0].entity, 'ai', 'entity 统一')

  const byAgent = aiEvents(100, { agentId: 'agent-1' })
  assert.equal(byAgent.length, 3, '按 agentId 过滤')

  const byMsg = aiEvents(100, { messageId: 'm1' })
  assert.equal(byMsg.length, 3, '按 messageId 过滤（跨层关联键）')

  const byAction = aiEvents(100, { action: 'tool:call' })
  assert.equal(byAction.length, 1, '按 action 过滤')
  assert.equal(byAction[0].payload?.tool, 'agent-browser', '工具名可查')
})

test('ai 事件流：wf:* → ai:* 映射（桥接统一命名）', () => {
  assert.equal(aiActionFromWf('wf:token'), 'token')
  assert.equal(aiActionFromWf('wf:tool_call'), 'tool:call')
  assert.equal(aiActionFromWf('wf:tool_result'), 'tool:result')
  assert.equal(aiActionFromWf('wf:done'), 'done')
  assert.equal(aiActionFromWf('wf:error'), 'error')
  assert.equal(aiActionFromWf('wf:usage'), 'usage')
})

test('ai 事件流：订阅机制（emit 同步——退订生效）', () => {
  resetAiEvents()
  const received: string[] = []
  const unsub = subscribeAiEvents((e) => received.push(e.action))
  aiEmit('step', 'a1', {})
  aiEmit('done', 'a1', {})
  unsub()
  aiEmit('error', 'a1', {})
  assert.deepEqual(received, ['step', 'done'], '订阅收到——退订后停止')
})
