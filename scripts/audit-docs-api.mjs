/**
 * docs API 速查覆盖守卫（docs-可学习性 W1）
 *
 * 速查表层覆盖核心主导出 ≥90%——核心面人工名单（40 项——按域）——
 * 每项在 docs/server.md §0 出现（检索——名称在速查表中可定位）——
 * 缺项 exit 1（速查表漂移防线）。
 */
const CORE = [
  // HTTP 层
  'serve', 'Router', 'HttpError', 'createMiddleware', 'cors', 'compress',
  'serveStatic', 'rateLimit', 'parseBody',
  // 响应面
  'ok', 'created', 'noContent', 'badRequest', 'unauthorized', 'forbidden',
  'notFound', 'conflict', 'unprocessable', 'tooManyRequests', 'serverError',
  'redirect', 'errorResponse',
  // ORM 面
  'shape', 'f.', 'createOrm', 'memoryAdapter', 'postgresAdapter', 'bodyOf',
  'listQuery', 'diffConsistency', 'ops', 'createTypedQuery', 'buildQuery',
  'compileSchemaDDL', 'z',
  // AI/邮件/认证
  'OpenAi', 'MemoryAi', 'createMemoryAi', 'MemoryAiServer',
  'MemoryEmail', 'createMemoryEmail', 'MemoryEmailServer',
  'userSystem', 'appAuth', 'hashPassword', 'verifyPassword', 'signToken',
  'verifyToken', 'generateRefreshToken',
  // 实时/调度/常量
  'messager', 'queue', 'scheduler', 'workflowSystem', 'ui', 'postgres',
  'redis', 'MemorySql', 'MemoryRedis', 'MemoryRedisServer',
  'MemoryPostgresServer', 'createMemoryOrm', 'WEIFUWU_USER_SCHEMA',
  'WEIFUWU_MESSAGER_SCHEMA', 'WEIFUWU_WORKFLOW_SCHEMA', 'MIGRATIONS_TABLE',
  'BUILTIN_APP_ID',
]

import { readFileSync } from 'node:fs'
const md = readFileSync('docs/server.md', 'utf8')
const sec0 = md.split('## 0. API 速查')[1]?.split('\n## 1.')[0] ?? ''
const missing = CORE.filter((name) => !sec0.includes(name))
const hit = CORE.length - missing.length
const pct = (hit / CORE.length * 100).toFixed(1)
console.log(`docs §0 速查覆盖: ${hit}/${CORE.length} (${pct}%)`)
if (missing.length > 0) {
  console.log('缺项:', missing.join(' '))
  process.exit(1)
}
if (pct < 90) {
  console.log('覆盖 < 90%——速查表需补')
  process.exit(1)
}
console.log('速查覆盖守卫 ✓')
