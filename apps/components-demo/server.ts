import { serve, Router, ui } from 'weifuwu'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdir, readFile } from 'node:fs/promises'

// 基于 server.ts 自身位置解析路径，不依赖 CWD
const __dirname = dirname(fileURLToPath(import.meta.url))

const app = new Router()
app.use(ui())

// ── 确定性 wire-fake：无 API key 也能完整走 wf: 协议（AiChat 演示）──
// 真实 HTTP + SSE，不 mock 网络层（CS-04 精神）
app.post('/api/chat', async (req: Request): Promise<Response> => {
  const { messages, mode } = await req.json()
  const lastUser = [...(messages ?? [])].reverse().find((m: any) => m.role === 'user')?.content ?? '世界'
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (name: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      push('wf:message_start', { id: `demo-${Date.now()}` })

      if (mode === 'agent') {
        // agent 演示：工具调用 → 进度 → HITL 审批（挂起 3s 后按「已批准」继续）
        push('wf:step', { type: 'llm' })
        push('wf:tool_call', { id: 'tc_demo', name: 'query_weather', args: { city: '北京' } })
        push('wf:step', { type: 'tool', toolCallId: 'tc_demo', name: 'query_weather' })
        push('wf:tool_progress', { toolCallId: 'tc_demo', step: 1, total: 2, message: '查询 北京…', status: 'running' })
        push('wf:approval_request', { id: 'ap_demo', toolCallId: 'tc_demo', name: 'query_weather', args: { city: '北京' }, reason: '（演示）工具执行前需要审批' })
        setTimeout(() => {
          push('wf:tool_result', { id: 'tc_demo', ok: true, output: { city: '北京', temp: 25, desc: '晴' } })
          const answer = '（demo）北京 25°C，晴。'
          for (let i = 0; i < answer.length; i += 2) {
            push('wf:token', { text: answer.slice(i, i + 2) })
          }
          push('wf:usage', { prompt_tokens: 20, completion_tokens: answer.length })
          push('wf:done', { content: answer, usage: { prompt_tokens: 20, completion_tokens: answer.length } })
          controller.close()
        }, 3000)
        return
      }

      const reply = `（demo 流式回复）你刚才说：${lastUser}`
      let i = 0
      const timer = setInterval(() => {
        if (i >= reply.length) {
          clearInterval(timer)
          push('wf:done', { content: reply, usage: { prompt_tokens: 12, completion_tokens: reply.length } })
          controller.close()
          return
        }
        push('wf:token', { text: reply.slice(i, i + 2) }) // 逐 2 字流式
        i += 2
      }, 120)
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
})

// HITL 审批响应（协议 §4.5：POST 上行）
app.post('/api/approve', async (req: Request): Promise<Response> => {
  await req.json()
  return Response.json({ ok: true })
})

app.get('/app.js', (req, ctx) => ctx.ui.js(resolve(__dirname, 'src', 'main.tsx')))

// 组件库 CSS（dev：从 src 运行时聚合——免构建——与 scripts/build.mjs 同逻辑）
app.get('/components.css', async (req, ctx) => {
  const root = resolve(__dirname, '..', '..')
  const layoutSrc = resolve(root, 'src', 'layout')
  // layout @import 合并（与 build.mjs mergeLayoutCss 同逻辑——@layer tokens/base/layout/utilities）
  const entry = await readFile(resolve(layoutSrc, 'weifuwu-layout.css'), 'utf-8')
  const layoutChunks: string[] = []
  for (const line of entry.split('\n')) {
    const m = line.match(/@import\s+['"]([^'"]+)['"]/)
    if (m) {
      const content = (await readFile(resolve(layoutSrc, m[1]), 'utf-8')).replace(/@import\s+['"][^'"]+['"]\s*;?\s*\n?/g, '').trim()
      layoutChunks.push(`@layer layout {\n${content}\n}`)
    }
  }
  let css = '@layer tokens, base, layout, utilities, components;\n\n' + layoutChunks.join('\n\n')
  css += '\n@layer components {\n'
  const dirs = await readdir(resolve(root, 'src', 'components'), { withFileTypes: true })
  for (const d of dirs.filter((x) => x.isDirectory())) {
    try {
      css += await readFile(resolve(root, 'src', 'components', d.name, `${d.name}.css`), 'utf-8') + '\n'
    } catch { /* 无 CSS 组件跳过 */ }
  }
  css += '}\n'
  return new Response(css, { headers: { 'Content-Type': 'text/css' } })
})

app.get('/*', async (req, ctx) => ctx.ui.html`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/components.css">
  <title>weifuwu/components cheatsheet</title>
</head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>
`)

serve(app, { port: 3100 })
console.log('http://localhost:3000')
