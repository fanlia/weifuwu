/**
 * 三端事件契约测试——中央订阅器 + 响应式动作
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aiEmit, resetAiEvents } from '../src/services/ai-events.ts'
import { sandboxEmit, resetSandboxEvents, sandboxEvents } from '../src/sandbox/events.ts'
import { onEvent, startEventContracts, resetContracts } from '../src/services/event-contracts.ts'

test('事件契约：AI 浏览器工具调用 → 沙盒预热信号（warm:hint）', () => {
  resetAiEvents(); resetSandboxEvents(); resetContracts()
  // 注册契约（测试版——直接注册 browser warm 动作）
  onEvent('ai', 'tool:call', (e) => {
    const tool = String(e.payload?.tool ?? e.payload?.name ?? '')
    if (!tool.includes('agent-browser') && !tool.includes('browser')) return
    sandboxEmit('warm:hint', undefined, { requestId: e.payload?.requestId, tool })
  })
  startEventContracts()
  aiEmit('tool:call', 'agent-1', { tool: 'agent-browser', requestId: 'r-1' })
  aiEmit('tool:call', 'agent-1', { tool: 'bash', requestId: 'r-2' }) // 非浏览器——不预热
  const hints = sandboxEvents(100, { action: 'warm:hint' })
  assert.equal(hints.length, 1, '浏览器工具调用触发预热信号——实际 ' + hints.length)
  assert.equal(hints[0].payload?.requestId, 'r-1', '预热带 requestId（跨层关联）')
})

test('事件契约：谓词过滤 + once（一次性契约）', () => {
  resetAiEvents(); resetContracts()
  let hits = 0
  onEvent('ai', 'done', () => { hits++ }, { once: true })
  startEventContracts()
  aiEmit('done', 'a1', {})
  aiEmit('done', 'a1', {})
  assert.equal(hits, 1, 'once 契约只执行一次')
})
