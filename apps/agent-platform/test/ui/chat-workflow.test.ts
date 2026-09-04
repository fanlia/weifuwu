/**
 * 对话生成→执行链 e2e（AI-REBUILD——MemoryAiServer 协议替身实战）
 *
 * 全链真实（仅 LLM 决策由协议替身注入——工具真执行/真落库/真引擎）：
 *   聊天页用户消息 → agent 循环（createAiClient 经 DEEPSEEK_BASE_URL 连
 *   MemoryAiServer）→ onChat 注入 create_workflow 决策 → 工具真执行
 *   （compileGate 落库）→ 第二轮注入 run_workflow（tool_result 提取 id）→
 *   引擎真执行（demo 接口）→ 文本回复 → UI 工具条两段呈现。
 *
 * 独立 server spawn（LLM 确定性不污染 shared 单例——DEEPSEEK_BASE_URL 专用）。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { createMemoryAiServer, type MemoryAiServerHandle } from '../../../../src/server/ai/memory-server.ts'
import {
  registerTenant, apiAs, openAgentPage, waitForBodyText, injectAuth,
  type AgentServer, type TenantAuth,
} from './shared.ts'
import { spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync } from 'node:fs'

// ── MemoryAiServer（LLM 决策替身——有状态三回合） ────────────────
let llm: MemoryAiServerHandle
let server: AgentServer
let browser: Browser
let owner: TenantAuth
let deptId = ''

const WFJS_TPL = `const res = await http({ url: 'http://localhost:39218/api/demo/stock?stock=3' })
const count = res.json.items.length
if (count > 0) { await log({ message: \`缺货 \${count} 件\` }) }`

function chatReply(messages: any[]): { content: string; toolCalls: any[] } {
  // 回合判定：tool content 是**再转义 JSON 字符串**（"id" 形态）——用 uuid 模式匹配
  // （wf 主键为 uuid——比引号转义稳）；run 结果含 result 字段（转义后 \"result\"）
  let wfId = ''
  for (const m of messages) {
    if (m.role === 'tool') {
      const c = String(m.content ?? '')
      const m1 = c.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
      if (m1 && !wfId) wfId = m1[0]
    }
  }
  const hasRunResult = messages.some((m: any) => m.role === 'tool' && String(m.content ?? '').includes('\\"result\\"'))
  if (hasRunResult) return { content: '库存检查工作流已创建并执行成功——缺货详情见上方工具结果', toolCalls: [] }
  if (wfId) {
    return {
      content: '',
      toolCalls: [{ id: 'tc-run', type: 'function', function: { name: 'run_workflow', arguments: JSON.stringify({ workflow_id: wfId, args: '{}' }) } }],
    }
  }
  return {
    content: '',
    toolCalls: [{ id: 'tc-create', type: 'function', function: { name: 'create_workflow', arguments: JSON.stringify({ name: '库存巡检', description: '对话生成', wfjs: WFJS_TPL }) } }],
  }
}

before(async () => {
  llm = await createMemoryAiServer({ onChat: (params: any) => chatReply(params.messages as any[]), port: 0 })
  // 独立 spawn（不占 shared 单例——LLM 确定性隔离）
  server = await startIsolated({ LLM_BASE: `http://127.0.0.1:${llm.port}` })
  browser = await chromium.launch()
  owner = await registerTenant(server.base, 'chatwf')
  const dept = await apiAs(server.base, owner, '/api/departments', {
    method: 'POST', body: JSON.stringify({ name: '对话生成部' }),
  })
  deptId = dept.department.id
  // AI Agent 创建 + **加入部门成员**（自动回复触发条件：department_members 行——
  // type='ai' 创建 API 不自动加成员——只有 type='department' 经理才自动）
  const agentRec = await apiAs(server.base, owner, '/api/agents', {
    method: 'POST', body: JSON.stringify({ type: 'ai', name: '编排助手', model: 'deepseek-v4-flash', description: 'workflow 编排' }),
  })
  await apiAs(server.base, owner, `/api/departments/${deptId}/members`, {
    method: 'POST', body: JSON.stringify({ agent_id: agentRec.agent.id }),
  })
})

after(async () => {
  await browser?.close()
  server?.stop()
  await llm.close()
})

/** 独立 agent-platform server（env 覆盖 LLM 指向——退出时 SIGTERM 立即死——无优雅关闭窗口） */
function startIsolated(extras: Record<string, string>): Promise<AgentServer> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn('node', ['--env-file=.env', 'server.ts'], {
      cwd: new URL('../../', import.meta.url).pathname,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PORT: '39218',
        POSTGRES_MEMORY: '1',
        WF_TEST_HOOKS: '1',
        ADMIN_TEST_PASSWORD: 'admin123',
        DATABASE_POOL_MAX: '8',
        RATE_LIMIT_MAX: '100000',
        REGISTER_LIMIT_MAX: '100000',
        DEEPSEEK_BASE_URL: `${extras.LLM_BASE}/v1`,
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_MODEL: 'memory-ai',
        ...extras,
      },
    })
    const base = `http://localhost:39218`
    const deadline = Date.now() + 30_000
    const t = setInterval(async () => {
      try {
        const r = await fetch(`${base}/api/ops`, { signal: AbortSignal.timeout(1000) })
        if (r.status < 500) {
          clearInterval(t)
          writeFileSync('/tmp/ap-chatwf-server.pid', String(child.pid))
          resolve({ base, stop: () => { try { child.kill('SIGTERM') } catch {} } })
        }
      } catch { /* 未起——继续 */ }
      if (Date.now() > deadline) { clearInterval(t); reject(new Error('隔离 server 启动超时（30s）——39218')) }
    }, 300)
  })
}

test('对话生成→执行链：创建 → 执行 → 工具条两段 + API 核对（manual/success）', async () => {
  const page = await browser!.newPage()
  await injectAuth(page, owner as any)
  await openAgentPage(page, server.base, `/chat/${deptId}`)
  await waitForBodyText(page, /发送/)
  // @ 定向单 agent（部门创建自动建经理 agent——两个 AI 并发回复会污染断言）
  await page.fill('textarea, input[type="text"]', '@编排助手 帮我创建库存监控工作流，然后运行一下')
  await page.click('button:has-text("发送")')

  // 工具条两段：create workflow → run workflow（toolLabel——未注册名 = 下划线转空格）
  await waitForBodyText(page, /create workflow|create_workflow/, 20_000)
  await waitForBodyText(page, /run workflow|run_workflow/, 20_000)
  await waitForBodyText(page, /已创建并执行成功/, 20_000)

  // API 核对（数据真实落库——非脚本注入）
  const list = await apiAs(server.base, owner as any, '/api/workflows')
  const wf = (list.workflows ?? []).find((w: any) => w.name === '库存巡检')
  assert.ok(wf, '工作流已落库')
  const detail = await apiAs(server.base, owner as any, `/api/workflows/${wf.id}`)
  assert.ok(detail, '详情可查')
  // 运行记录（对话触发链——run_workflow 真执行——trigger='chat'）
  assert.equal(wf.last_run?.status, 'success', `最近运行 success——实际 ${JSON.stringify(wf.last_run)}`)
  assert.equal(wf.last_run?.trigger, 'chat', `trigger=chat（对话链）——实际 ${wf.last_run?.trigger}`)
  await page.close()
})
