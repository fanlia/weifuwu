/**
 * 类型单源契约（AGENT-TYPES-OPTIMIZE W4）
 *
 * 锁定：
 *  - AGENT_TYPES（ui/lib/types.ts）= DB enum 五类型（新增类型漏 UI = 测试红）
 *  - creatable 语义：user 不可手动创建（UI 向导被过滤）
 *  - 后端校验/筛选无硬编码列表——消费 AGENT_TYPE_LIST 单源（GC5 白名单缺 department 歼灭）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AGENT_TYPES, AGENT_TYPE_LIST } from '../ui/lib/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = join(__dirname, '..')

test('T1: AGENT_TYPES 键集 == DB enum 五类型（schema.sql 单源）', () => {
  const schema = readFileSync(join(APP_ROOT, 'src/db/schema.sql'), 'utf-8')
  const m = schema.match(/CREATE TYPE agent_type AS ENUM \(([^)]+)\)/)
  assert.ok(m, 'schema.sql 应有 agent_type enum 定义')
  const enumTypes = m![1].split(',').map(s => s.trim().replace(/^'|'$/g, ''))
  assert.deepEqual(AGENT_TYPE_LIST, enumTypes, 'AGENT_TYPES 与 DB enum 完全一致')
})

test('T2: creatable 语义——仅 user 不可创建（向导过滤——防 user_id=null 孤儿）', () => {
  const creatable = AGENT_TYPES.filter(t => t.creatable).map(t => t.value)
  assert.deepEqual(creatable, ['ai', 'webhook', 'knowledge_base', 'department'])
})

test('T3: 后端无硬编码类型列表——agents.ts 消费单源', () => {
  const src = readFileSync(join(APP_ROOT, 'src/routes/agents.ts'), 'utf-8')
  assert.ok(src.includes('AGENT_TYPE_LIST'), 'agents.ts 应引用 AGENT_TYPE_LIST 单源')
  assert.ok(!src.includes("'ai', 'user', 'webhook', 'knowledge_base'"), '消灭硬编码白名单（G5）')
})

test('T4: 元数据完整性——五类型都有 label/icon/color/desc', () => {
  assert.equal(AGENT_TYPES.length, 5)
  for (const t of AGENT_TYPES) {
    assert.ok(t.label && t.icon && t.color && t.desc, `${t.value} 元数据完整`)
  }
})
