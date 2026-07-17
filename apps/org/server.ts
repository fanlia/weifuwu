/**
 * Org server — Enterprise AI Collaboration Platform
 *
 * 依赖链：postgres() → user() → messager() → org()
 * AI 对话：需要安装 @ai-sdk/openai + 配置 DEEPSEEK_API_KEY
 *
 * ```bash
 * docker compose up -d
 * node --env-file=.env apps/org/server.ts
 * # → http://localhost:3001
 * ```
 */

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WebSocketHandler, WebSocket, Context } from 'weifuwu'
import { serve, Router, cors, logger, ui, postgres, user, messager, org, kb } from 'weifuwu'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = new Router()

// ── 基础设施中间件 ──

app.use(cors())
app.use(logger())
app.use(ui())
app.use(postgres())
app.use(user())
app.use(messager())
app.use(kb())
app.use(org())

// ── 静态资源 ──

app.get('/static/app.js', async (req, ctx) => ctx.ui.js(resolve(__dirname, 'src', 'main.tsx')))
app.get('/static/style.css', async (req, ctx) => ctx.ui.css(resolve(__dirname, 'public', 'style.css')))

// ── WebSocket — 加入所有会话的房间，广播消息 ──

const wsHandler: WebSocketHandler = {
  async open(ws: WebSocket, ctx: Context) {
    ws.send(JSON.stringify({ type: 'system', body: '🟢 已连接到 Org' }))
    try {
      for (const c of await ctx.messager.getConversations()) {
        ctx.ws.join(`conversation:${c.id}`)
      }
    } catch { /* 用户可能还没有会话 */ }
  },
  message(_ws: WebSocket, _ctx: Context, _data: string | Buffer) {
    // 消息通过 REST API 发送，WebSocket 仅用于广播
  },
}
app.ws('/ws', wsHandler)

// ── 认证 ──

app.post('/api/register', async (req, ctx) => {
  try {
    const result = await ctx.userModule.register(await req.json())
    return Response.json(result, { status: 201 })
  } catch (e: any) {
    console.error('REGISTER ERROR:', e.message)
    return Response.json({ error: e.message }, { status: 400 })
  }
})

app.post('/api/login', async (req, ctx) => {
  try {
    const { email, password } = await req.json()
    const result = await ctx.userModule.login(email, password)
    if (!result) return new Response('Unauthorized', { status: 401 })
    return Response.json(result)
  } catch (e: any) {
    console.error('LOGIN ERROR:', e.message)
    return Response.json({ error: e.message }, { status: 400 })
  }
})

app.get('/api/me', async (req, ctx) => {
  if (!ctx.user) return new Response('Unauthorized', { status: 401 })
  return Response.json(ctx.user)
})

// ── 消息 API（Chat 组件依赖）──

app.post('/api/messages', async (req: Request, ctx: Context) => {
  const { conversationId, body } = await req.json()
  if (!conversationId || !body) return new Response('Missing fields', { status: 400 })

  const msg = await ctx.messager.sendMessage(conversationId, body)

  // WebSocket 广播
  try { ctx.ws.sendRoom(`conversation:${conversationId}`, { ...msg, conversation_id: conversationId }) } catch {}

  return Response.json(msg, { status: 201 })
})

app.get('/api/conversations/:id/messages', async (req: Request, ctx: Context) => {
  const url = new URL(req.url)
  const opts: any = {}
  if (url.searchParams.get('before')) opts.before = url.searchParams.get('before')!
  if (url.searchParams.get('limit')) opts.limit = parseInt(url.searchParams.get('limit')!)

  const messages = await ctx.messager.getMessages(ctx.params.id, opts)
  return Response.json(messages)
})

// ── AI Agent 对话（SSE 流式响应）──

app.post('/api/agents/:id/chat', async (req: Request, ctx: Context) => {
  const agentId = ctx.params.id
  const { conversationId, messages: history } = await req.json()

  // 查找 Agent
  const agent = await ctx.org.getAgent(agentId)
  if (!agent) return new Response('Agent not found', { status: 404 })
  if (agent.kind !== 'ai') return new Response('Not an AI agent', { status: 400 })

  // 获取 AI 配置
  const config = (agent.ai_config || {}) as Record<string, any>
  const systemPrompt = config.systemPrompt || 'You are a helpful assistant.'
  const temperature = config.temperature ?? 0.7
  const maxTokens = config.maxTokens ?? 2048

  // 使用 DeepSeek API（OpenAI 兼容接口）
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return new Response('DEEPSEEK_API_KEY not configured', { status: 500 })

  // 获取部门 ID（从 conversation 反查 department）
  let deptId = ''
  if (conversationId) {
    try {
      // 通过 conversation_id 反查 department
      const sql = (ctx as any).sql
      const [row] = await sql.unsafe(
        'SELECT id FROM departments WHERE conversation_id = $1',
        [conversationId],
      )
      if (row) deptId = row.id
    } catch {}
  }

  // RAG — 检索知识库
  let ragContext = ''
  if (deptId) {
    try {
      const lastMsg = history?.[history.length - 1]?.content || ''
      if (lastMsg) {
        const results = await ctx.kb.search(lastMsg, {
          filter: { department_id: deptId },
          limit: 3,
          minScore: 0.3,
        })
        if (results.length > 0) {
          ragContext = '\n\n参考以下内部知识库信息来回答用户问题：\n' +
            results.map((r: any, i: number) => `[${i + 1}] ${r.content}`).join('\n')
        }
      }
    } catch {}
  }

  // SSE 流式响应 — 直接用 fetch 调用 DeepSeek API
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const messages = [
          { role: 'system', content: systemPrompt + ragContext },
          ...(history || []),
        ]

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
          }),
          signal: req.signal,
        })

        if (!response.ok) {
          const err = await response.text()
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'error', error: `API error: ${response.status} ${err}` })}\n\n`
          ))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          return
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let fullText = ''
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const json = JSON.parse(line.slice(6))
                const content = json.choices?.[0]?.delta?.content || ''
                if (content) {
                  fullText += content
                  controller.enqueue(encoder.encode(
                    `data: ${JSON.stringify({ type: 'text', content })}\n\n`
                  ))
                }
              } catch {}
            }
          }
        }

        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'done', fullText })}\n\n`
        ))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))

        // 保存 AI 回答到会话
        if (fullText && conversationId) {
          await ctx.messager.sendMessage(conversationId, `**${agent.name}**: ${fullText}`)
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`
        ))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } finally {
        try { controller.close() } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})

// ── Org CRUD API ──

// Tenant
app.get('/api/tenants', async (req, ctx) => Response.json(await ctx.org.listTenants()))
app.post('/api/tenants', async (req, ctx) => Response.json(await ctx.org.createTenant(await req.json()), { status: 201 }))
app.get('/api/tenants/:id', async (req, ctx) => {
  const t = await ctx.org.getTenant(ctx.params.id)
  return t ? Response.json(t) : new Response('Not found', { status: 404 })
})
app.put('/api/tenants/:id', async (req, ctx) => {
  const t = await ctx.org.updateTenant(ctx.params.id, await req.json())
  return t ? Response.json(t) : new Response('Not found', { status: 404 })
})
app.delete('/api/tenants/:id', async (req, ctx) => {
  const ok = await ctx.org.deleteTenant(ctx.params.id)
  return ok ? new Response(null, { status: 204 }) : new Response('Not found', { status: 404 })
})

// Company
app.get('/api/tenants/:id/companies', async (req, ctx) => Response.json(await ctx.org.listCompanies(ctx.params.id)))
app.post('/api/tenants/:id/companies', async (req, ctx) => Response.json(await ctx.org.createCompany(ctx.params.id, await req.json()), { status: 201 }))
app.get('/api/companies/:id', async (req, ctx) => {
  const c = await ctx.org.getCompany(ctx.params.id)
  return c ? Response.json(c) : new Response('Not found', { status: 404 })
})
app.put('/api/companies/:id', async (req, ctx) => {
  const c = await ctx.org.updateCompany(ctx.params.id, await req.json())
  return c ? Response.json(c) : new Response('Not found', { status: 404 })
})
app.delete('/api/companies/:id', async (req, ctx) => {
  const ok = await ctx.org.deleteCompany(ctx.params.id)
  return ok ? new Response(null, { status: 204 }) : new Response('Not found', { status: 404 })
})

// Department
app.get('/api/companies/:id/departments', async (req, ctx) => Response.json(await ctx.org.listDepartments(ctx.params.id)))
app.post('/api/companies/:id/departments', async (req, ctx) => Response.json(await ctx.org.createDepartment(ctx.params.id, await req.json()), { status: 201 }))
app.get('/api/departments/:id', async (req, ctx) => {
  const d = await ctx.org.getDepartment(ctx.params.id)
  return d ? Response.json(d) : new Response('Not found', { status: 404 })
})
app.put('/api/departments/:id', async (req, ctx) => {
  const d = await ctx.org.updateDepartment(ctx.params.id, await req.json())
  return d ? Response.json(d) : new Response('Not found', { status: 404 })
})
app.delete('/api/departments/:id', async (req, ctx) => {
  const ok = await ctx.org.deleteDepartment(ctx.params.id)
  return ok ? new Response(null, { status: 204 }) : new Response('Not found', { status: 404 })
})

// Agent
app.get('/api/agents', async (req, ctx) => Response.json(await ctx.org.listAgents()))
app.post('/api/agents', async (req, ctx) => Response.json(await ctx.org.createAgent(await req.json()), { status: 201 }))
app.get('/api/agents/:id', async (req, ctx) => {
  const a = await ctx.org.getAgent(ctx.params.id)
  return a ? Response.json(a) : new Response('Not found', { status: 404 })
})
app.put('/api/agents/:id', async (req, ctx) => {
  const a = await ctx.org.updateAgent(ctx.params.id, await req.json())
  return a ? Response.json(a) : new Response('Not found', { status: 404 })
})
app.delete('/api/agents/:id', async (req, ctx) => {
  const ok = await ctx.org.deleteAgent(ctx.params.id)
  return ok ? new Response(null, { status: 204 }) : new Response('Not found', { status: 404 })
})

// Department-Agent binding
app.get('/api/departments/:id/agents', async (req, ctx) => Response.json(await ctx.org.listDepartmentAgents(ctx.params.id)))
app.post('/api/departments/:id/agents', async (req, ctx) => {
  const { agentId, role } = await req.json()
  await ctx.org.addAgentToDepartment(ctx.params.id, agentId, role)
  return Response.json({ ok: true }, { status: 201 })
})
app.delete('/api/departments/:id/agents/:aid', async (req, ctx) => {
  const ok = await ctx.org.removeAgentFromDepartment(ctx.params.id, ctx.params.aid)
  return ok ? new Response(null, { status: 204 }) : new Response('Not found', { status: 404 })
})

// ── 知识库（KB）API ──

// 导入文档到部门知识库
app.post('/api/departments/:id/kb/import', async (req: Request, ctx: Context) => {
  const { title, content, source } = await req.json()
  if (!title || !content) return new Response('Missing title or content', { status: 400 })

  const result = await ctx.kb.importText(title, content, {
    source: source || undefined,
    metadata: { department_id: ctx.params.id },
  })
  return Response.json(result, { status: 201 })
})

// 搜索部门知识库
app.post('/api/departments/:id/kb/search', async (req: Request, ctx: Context) => {
  const { query } = await req.json()
  if (!query) return new Response('Missing query', { status: 400 })

  const results = await ctx.kb.search(query, {
    filter: { department_id: ctx.params.id },
    limit: 5,
    minScore: 0.3,
  })
  return Response.json(results)
})

// 列出部门知识库文档
app.get('/api/departments/:id/kb/documents', async (req: Request, ctx: Context) => {
  const docs = await ctx.kb.list()
  // 过滤属于该部门的文档
  const filtered = docs.filter((d: any) => d.metadata?.department_id === ctx.params.id)
  return Response.json(filtered)
})

// 删除知识库文档
app.delete('/api/kb/documents/:id', async (req: Request, ctx: Context) => {
  const ok = await ctx.kb.delete(ctx.params.id)
  return ok ? new Response(null, { status: 204 }) : new Response('Not found', { status: 404 })
})

// ── SPA 入口 ──

for (const p of ['/', '/tenant/:tenantId', '/tenant/:tenantId/company/:companyId', '/tenant/:tenantId/company/:companyId/dept/:deptId']) {
  app.get(p, async (req: Request, ctx: Context): Promise<Response> => ctx.ui.html`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="/static/style.css">
      <title>Org — Enterprise AI Collaboration</title>
    </head>
    <body class="bg-gray-50">
      <div id="root"></div>
      <script type="module" src="/static/app.js"></script>
    </body>
    </html>
  `)
}

serve(app, { port: 3001 })
console.log('🚀 Org server running at http://localhost:3001')
