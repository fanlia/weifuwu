/**
 * 后端能力表——14 项（第一批 8 核心 + 6 补齐）。
 * 每项 = 概念 + 装配代码 + 活体端点（showcase server 真实实现）。
 * 文档素材来源：docs/server.md / data.md / realtime.md / saas.md。
 */
import type { BackendEntry } from './types.ts'

export const backend: BackendEntry[] = [
  // ── core ──
  { id: 'router', name: 'Router 与请求', group: 'core', middleware: 'ctx.route', desc: 'Trie 路由 + 路径参数 :id + 通配符 + 方法分发——showcase 自身就是活体证明', endpoint: '/api/demo/router', docsSource: 'content/guides/server-guide.md' },
  { id: 'middleware', name: 'ctx 注入链', group: 'core', middleware: 'ctx.*', desc: '中间件面注入 ctx.sql/redis/ui/api/auth/ws/limit/email/queue/cron/ai——装配即依赖注入', docsSource: 'content/guides/middleware.md' },
  { id: 'http', name: 'HTTP 原语', group: 'core', middleware: '—', desc: 'Request/Response 标准接口 + SSE + CORS + 静态服务', endpoint: '/api/demo/http', docsSource: 'content/guides/server-guide.md' },
  // ── data ──
  { id: 'sql', name: 'ctx.sql（自研 PG 协议层）', group: 'data', middleware: 'ctx.sql', desc: 'PgConnection 实现 Sql 契约——演示用 MemorySql（零 docker），文档说明换 postgres() 一行代码', endpoint: '/api/demo/sql', relatedComponents: ['Form', 'Table'], docsSource: 'content/guides/data-guide.md' },
  { id: 'redis', name: 'ctx.redis（自研 RESP 协议层）', group: 'data', middleware: 'ctx.redis', desc: 'RedisClient 实现 Redis 契约——缓存/计数/发布订阅；演示用 MemoryRedis', endpoint: '/api/demo/redis', relatedComponents: ['Table'], docsSource: 'content/guides/data-guide.md' },
  // ── realtime ──
  { id: 'ws', name: 'WebSocket', group: 'realtime', middleware: 'ctx.ws', desc: 'app.ws(path, handler)——双向实时（聊天/推送/协作）', endpoint: '/ws/echo', relatedComponents: ['AiChat'], docsSource: 'content/guides/realtime-guide.md' },
  { id: 'sse', name: 'SSE 事件流', group: 'realtime', middleware: '—', desc: 'Server-Sent Events——服务端推送（流式回复/进度/通知）；wire-fake chat 即活体', endpoint: '/api/chat', relatedComponents: ['AiChat'], docsSource: 'content/guides/realtime-guide.md' },
  // ── ai ──
  { id: 'ai', name: 'ctx.ai（chat/stream/agent/approve）', group: 'ai', middleware: 'ctx.ai', desc: 'AI 对话全链路：流式 token / 工具调用 / HITL 审批——wf: 协议对页面透明', endpoint: '/api/chat', relatedComponents: ['AiChat', 'ToolCallCard', 'ApprovalCard'], docsSource: 'docs/ai-contract.md' },
  // ── saas ──
  { id: 'limit', name: 'rateLimit（ctx.limit）', group: 'saas', middleware: 'ctx.limit', desc: '限流中间件——超额返回 429（演示端点轻阈值）', endpoint: '/api/demo/limit', docsSource: 'content/guides/saas-guide.md' },
  { id: 'auth', name: '认证（ctx.auth/user）', group: 'saas', middleware: 'ctx.auth', desc: '登录态/会话/权限——userSystem 集成', relatedComponents: ['AuthPage'], docsSource: 'content/guides/saas-guide.md' },
  { id: 'email', name: '邮件（ctx.email）', group: 'saas', middleware: 'ctx.email', desc: 'Mailer 契约——演示用内存捕获回显（mock 输出可读）', endpoint: '/api/demo/email', docsSource: 'content/guides/saas-guide.md' },
  { id: 'queue', name: '任务队列（ctx.queue）', group: 'saas', middleware: 'ctx.queue', desc: 'QueueClientModule——池命令 + 阻塞 worker（注入 Redis 模式）', endpoint: '/api/demo/queue', docsSource: 'content/guides/saas-guide.md' },
  { id: 'schedule', name: '定时任务（ctx.schedule/cron）', group: 'saas', middleware: 'ctx.schedule', desc: 'cron 表达式调度——演示：日志计数端点', endpoint: '/api/demo/cron', docsSource: 'content/guides/saas-guide.md' },
  { id: 'graphql', name: 'GraphQL', group: 'core', middleware: '—', desc: 'app.graphql(handler)——SDL + resolvers map 绑定', endpoint: '/api/demo/graphql', docsSource: 'content/guides/server-guide.md' },
]
