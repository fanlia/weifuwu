import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyWfEvent } from '../ui/lib/wf-events.ts'
import type { ChatMessage } from '../ui/lib/types.ts'

/** wf 协议状态机契约测试（2027-09——从 961 行页面闭包抽出——node 直跑） */
function msg(id = 'm1', patch: Partial<ChatMessage> = {}): ChatMessage {
  return { id, sender_id: 'bot', sender_name: 'AI', sender_type: 'ai', content: '', msg_type: 'text', created_at: new Date().toISOString(), status: 'idle', tools: [], ...patch }
}

test('wf:step tool——占位自愈（工具型回复无 llm 前置——消息不存在即创建 generating）', () => {
  const r = applyWfEvent([], { type: 'wf:step', messageId: 'm1', agentId: 'bot', agentName: '财务助手', stepType: 'tool', name: 'read_csv', args: { path: 'x.csv' } })
  assert.equal(r.msgs.length, 1, '占位创建')
  assert.equal(r.msgs[0]?.id, 'm1')
  assert.equal(r.msgs[0]?.status, 'generating')
  assert.equal(r.msgs[0]?.sender_name, '财务助手')
  const tool = r.msgs[0]?.tools?.[0]
  assert.equal(tool?.name, 'read_csv')
  assert.equal(tool?.status, 'running')
  assert.deepEqual(tool?.args, { path: 'x.csv' })
  assert.deepEqual(r.working, [{ agentId: 'bot', on: true }], '呼吸灯 on')
})

test('wf:step llm——状态推进 thinking（消息已存在——非降级）', () => {
  const r = applyWfEvent([msg('m1', { status: 'generating' })], { type: 'wf:step', messageId: 'm1', stepType: 'llm' })
  assert.equal(r.msgs[0]?.status, 'thinking')
})

test('wf:step llm——complete 不降级（token 已到——done 后无重复 llm step 干扰）', () => {
  const r = applyWfEvent([msg('m1', { status: 'complete', content: '完成' })], { type: 'wf:step', messageId: 'm1', stepType: 'llm' })
  assert.equal(r.msgs[0]?.status, 'complete')
})

test('wf:token——累积拼接 + generating（消息引用不变则原地不可变更新——新引用）', () => {
  const base = msg('m1', { content: '你好' })
  const r = applyWfEvent([base], { type: 'wf:token', messageId: 'm1', text: '世界' })
  assert.equal(r.msgs[0]?.content, '你好世界')
  assert.equal(r.msgs[0]?.status, 'generating')
  assert.notEqual(r.msgs[0], base, '不可变更新——新引用（渲染管线剪枝）')
})

test('wf:token——complete 后到达（乱序/超时后残留）不降级不追加状态', () => {
  const r = applyWfEvent([msg('m1', { status: 'complete', content: '完成' })], { type: 'wf:token', messageId: 'm1', text: 'x' })
  assert.equal(r.msgs[0]?.content, '完成x')
  assert.equal(r.msgs[0]?.status, 'complete')
})

test('wf:tool_result——running 工具落定 done（B1 契约：ok=true → done）', () => {
  const base = msg('m1', { tools: [{ name: 'read_csv', args: null, status: 'running' }] as ChatMessage['tools'] })
  const r = applyWfEvent([base], { type: 'wf:tool_result', messageId: 'm1', name: 'read_csv', ok: true, result: { rows: 3 } })
  assert.equal(r.msgs[0]?.tools?.[0]?.status, 'done')
  assert.deepEqual(r.msgs[0]?.tools?.[0]?.result, { rows: 3 })
})

test('wf:tool_result——失败显式 error（非静默完成——知识库检索失败视觉可见）', () => {
  const base = msg('m1', { tools: [{ name: 'kb_search', args: null, status: 'running' }] as ChatMessage['tools'] })
  const r = applyWfEvent([base], { type: 'wf:tool_result', messageId: 'm1', name: 'kb_search', ok: false, error: '索引不可用' })
  assert.equal(r.msgs[0]?.tools?.[0]?.status, 'error')
  assert.match(String(r.msgs[0]?.tools?.[0]?.result), /执行失败：索引不可用/)
})

test('wf:tool_result——同名 running 去重（step tool 已存在 running——不追加）', () => {
  const base = msg('m1', { tools: [{ name: 'read_csv', args: null, status: 'running' }] as ChatMessage['tools'] })
  const r = applyWfEvent([base], { type: 'wf:step', messageId: 'm1', stepType: 'tool', name: 'read_csv', args: null })
  assert.equal(r.msgs[0]?.tools?.length, 1, '同名 running 不重复追加')
})

test('wf:done——落定 complete + content + usage（终态）', () => {
  const r = applyWfEvent([msg('m1', { content: '流式内容', status: 'generating' })], { type: 'wf:done', messageId: 'm1', content: '最终内容', usage: { total_tokens: 123 } })
  assert.equal(r.msgs[0]?.content, '最终内容')
  assert.equal(r.msgs[0]?.status, 'complete')
  assert.deepEqual(r.msgs[0]?.usage, { total_tokens: 123 })
  assert.deepEqual(r.working, [{ agentId: 'ai', on: false }], '呼吸灯 off')
})

test('wf:error——内容空则占位「⚠️ AI 回复失败」+ error 态（有内容保留原文）', () => {
  const r1 = applyWfEvent([msg('m1', { content: '' })], { type: 'wf:error', messageId: 'm1' })
  assert.equal(r1.msgs[0]?.content, '⚠️ AI 回复失败')
  assert.equal(r1.msgs[0]?.status, 'error')
  const r2 = applyWfEvent([msg('m1', { content: '已写一半' })], { type: 'wf:error', messageId: 'm1' })
  assert.equal(r2.msgs[0]?.content, '已写一半')
})

test('wf:done 缺 content——保留流式内容（超时/异常时最后一拍不丢）', () => {
  const r = applyWfEvent([msg('m1', { content: '半截', status: 'generating' })], { type: 'wf:done', messageId: 'm1' })
  assert.equal(r.msgs[0]?.content, '半截')
})
