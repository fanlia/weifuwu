/**
 * demo AI 提供器 — 有真实 DEEPSEEK_API_KEY 用 weifuwu/ai，否则内置 wire-fake
 *
 * wire-fake：真实 HTTP + SSE 的确定性 OpenAI 兼容端点（与测试同构，CS-04 精神），
 * 保证 `npm run demo` 无 key 也能完整走一遍 wf: 协议（ctx.ai.stream → SSE → 前端 aiStream）。
 */

import { createServer } from 'node:http'
import { ai } from 'weifuwu'
import type { AiClientModule } from 'weifuwu'

export async function demoAi(): Promise<AiClientModule> {
  if (process.env.DEEPSEEK_API_KEY) return ai()
  const fake = await startFakeProvider()
  return ai({ apiKey: 'demo-key', baseUrl: fake.url })
}

/** 确定性 OpenAI 兼容 SSE 流：逐字回显用户最后一条消息，带 tool_call 演示 */
async function startFakeProvider(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw || '{}') as { stream?: boolean; messages?: Array<{ role: string; content: string }> }

    res.writeHead(200, {
      'Content-Type': body.stream ? 'text/event-stream' : 'application/json',
    })

    if (!body.stream) {
      res.end(JSON.stringify({
        id: 'demo', model: 'demo-fake',
        choices: [{ index: 0, message: { role: 'assistant', content: '（demo，未设置 DEEPSEEK_API_KEY）' }, finish_reason: 'stop' }],
      }))
      return
    }

    const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user')?.content ?? ''
    const reply = `（demo 流式回复）你刚才说：${lastUser}`
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

    // token 逐字流（带间隔，让流式可见）
    for (const ch of reply) {
      res.write(`data: ${JSON.stringify({ id: 'demo', model: 'demo-fake', choices: [{ index: 0, delta: { content: ch }, finish_reason: null }] })}\n\n`)
      await sleep(15)
    }
    // 模拟一次工具调用（协议 §4.1：完整聚合后的 wf:tool_call 由后端发出）
    res.write(`data: ${JSON.stringify({ id: 'demo', model: 'demo-fake', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'demo_tc', type: 'function', function: { name: 'demo_tool', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] })}\n\n`)
    await sleep(30)
    // usage + [DONE]
    res.write(`data: ${JSON.stringify({ id: 'demo', model: 'demo-fake', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: reply.length, total_tokens: reply.length + 12 } })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
  })

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as { port: number }
  return {
    url: `http://127.0.0.1:${port}/v1`,
    close: () => new Promise((r) => server.close(() => r())),
  }
}
