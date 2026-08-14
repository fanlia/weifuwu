/**
 * 群共识记忆（PERSONA-PLAN P4）——五层协议的记忆层补全
 *
 * 个人记忆（agent_memories）已有；群共识缺失——AI 不知道"上次群里决定过什么"。
 * P4：每 N 条消息用 LLM 提取群共识（决定/进行中/待办/背景），注入后续上下文。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { shouldGenerateGroupMemory, buildGroupMemoryLayer } from '../src/services/group-memory.ts'

describe('群共识记忆（P4）', () => {
  it('节流：每 N 条消息生成一次', () => {
    const N = 20
    assert.strictEqual(shouldGenerateGroupMemory(0, N), false, '初始不生成')
    assert.strictEqual(shouldGenerateGroupMemory(19, N), false, '未到阈值不生成')
    assert.strictEqual(shouldGenerateGroupMemory(20, N), true, '第 20 条生成')
    assert.strictEqual(shouldGenerateGroupMemory(21, N), false, '生成后不再触发')
    assert.strictEqual(shouldGenerateGroupMemory(40, N), true, '第 40 条再次生成')
  })

  it('buildGroupMemoryLayer：摘要注入格式', () => {
    const layer = buildGroupMemoryLayer('【已决定】Q3 统一用累计口径\n【待办】华东产品线分析')
    assert.ok(layer.includes('【群共识记忆】'), '段落标题')
    assert.ok(layer.includes('【已决定】Q3 统一用累计口径'), '摘要透传')
    assert.ok(layer.includes('这是群里此前讨论的结论——优先遵守'), '遵守指引')
  })

  it('buildGroupMemoryLayer：空摘要返回空', () => {
    assert.strictEqual(buildGroupMemoryLayer(''), '')
  })
})
