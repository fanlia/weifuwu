/**
 * MemoryAiServer 传输链测试（参考 MemoryPostgresServer 的 servers.test.ts 定位）
 *
 * 起内存 AI 服务器 → **真实客户端零改动直连**：
 *   createAiClient（OpenAI 兼容 chat/stream/embed）
 *   createDashscopeMultimodal（dashscope 图片/视频）
 * ——证明「测试替身 = 协议级替身」——客户端不知道自己连的是内存。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryAiServer, type MemoryAiServerHandle } from './memory-server.ts'
import { createAiClient } from './client.ts'
import { createDashscopeMultimodal } from './multimodal.ts'

let server: MemoryAiServerHandle
let base = ''

before(async () => {
  server = await createMemoryAiServer({
    // 决策注入：带工具时回 tool_calls（协议替身是 LLM——测试控制回复内容）
    onChat: () => ({ content: '服务器回复', toolCalls: [] }),
  })
  base = `http://127.0.0.1:${server.port}`
})

after(async () => {
  await server.close()
})

test('chat 非流式：createAiClient → MemoryAiServer → ChatResponse', async () => {
  const client = createAiClient({ baseUrl: `${base}/v1`, apiKey: 'test-key', defaultModel: 'memory-ai' })
  const r = await client.chat({ messages: [{ role: 'user', content: '你好' }] })
  assert.equal(r.choices[0].message.content, '服务器回复')
})

test('stream 流式：SSE 事件序列（token/done）', async () => {
  const client = createAiClient({ baseUrl: `${base}/v1`, apiKey: 'test-key', defaultModel: 'memory-ai' })
  const events: Array<{ name: string; data: any }> = []
  const resp = client.stream({ messages: [{ role: 'user', content: '流式' }] })
  // 直接读 Response 的 SSE body——解析 wf: 事件（同框架消费端）
  const text = await resp.text()
  assert.ok(text.includes('event: wf:token'), `SSE 含 token 事件——前 200：${text.slice(0, 200)}`)
  for (const line of text.split('\n\n')) {
    const ev = line.match(/^event: (\S+)/m)?.[1]
    const dataLine = line.match(/^data: (.+)$/m)?.[1]
    if (ev && dataLine) events.push({ name: ev, data: JSON.parse(dataLine) })
  }
  const tokenEv = events.find((e) => e.name === 'wf:token')
  assert.equal(tokenEv?.data.text, '服务器回复')
  const doneEv = events.find((e) => e.name === 'wf:done')
  assert.equal(doneEv?.data.content, '服务器回复')
})

test('embedding：embedMany 数组合法（顺序保持）', async () => {
  // 明确指向 memory-server（不读 env DASHSCOPE_*——那是真实 provider）
  const client = createAiClient({
    baseUrl: `${base}/v1`, apiKey: 'test-key', defaultModel: 'memory-ai',
    embedding: { apiKey: 'test-key', baseUrl: `${base}/v1` },
  })
  const [a, b] = await client.embedMany(['库存', '视频'])
  assert.equal(a.length, 32)
  assert.deepEqual(a, await client.embedMany(['库存']).then((r) => r[0])) // 确定性
})

test('图片：dashscope 客户端 → MemoryAiServer → 占位图（URL 形态）', async () => {
  const mm = createDashscopeMultimodal({ baseUrl: base, apiKey: 'test-key' })
  const r = await mm.generateImage({ prompt: '一只猫' })
  assert.equal(r.mime, 'image/png') // 占位返回 dataUrl 形态
  assert.ok(r.dataUrl?.startsWith('data:image/png;base64,'))
})

test('视频：创建任务 → taskId → videoStatus done（全链）', async () => {
  const mm = createDashscopeMultimodal({ baseUrl: base, apiKey: 'test-key' })
  const { taskId } = await mm.createVideoTask({ prompt: '夕阳' })
  assert.equal(taskId, 'memory-task-夕阳')
  const st = await mm.videoStatus(taskId)
  assert.equal(st.status, 'done')
  assert.ok(st.url?.startsWith('memory://video/'))
})

test('不支持端点 → 404（可预测失败——诚实裁剪）', async () => {
  const res = await fetch(`${base}/v1/models`)
  assert.equal(res.status, 404)
})
