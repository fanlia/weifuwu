/**
 * AI 人格化（PERSONA-PLAN P0/P1）——成员协议纯函数测试
 *
 * 覆盖：
 * - buildRosterText：同事名单注入（AI 知道群里还有谁、各擅长什么）
 * - buildHistoryContent：发信人署名 + reply_to 引用上下文
 * - buildPersonaLayer：统一人格注入层（名单 + 协作纪律，P2 扩展点）
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { buildRosterText, buildHistoryContent, buildPersonaLayer } from '../src/services/persona.ts'
import type { RosterMember } from '../src/services/persona.ts'

describe('persona 成员协议（P0/P1）', () => {
  it('P0-2 buildRosterText：名单含人/AI 身份与专长', () => {
    const members: RosterMember[] = [
      { id: 'u1', name: '王总', type: 'user', role: 'admin' },
      { id: 'a1', name: '财务助手', type: 'ai', role: 'member', roleLabel: '财务分析', expertise: 'Excel/报表/预算' },
      { id: 'a2', name: '产品知识库', type: 'knowledge_base', role: 'member', roleLabel: '产品资料', expertise: '文档检索' },
    ]
    const text = buildRosterText(members, 'a1')
    assert.ok(text.includes('王总'), '真人成员在名单中')
    assert.ok(text.includes('人') && text.includes('管理员'), '人的类型与角色标注')
    assert.ok(text.includes('财务助手'), 'AI 成员在名单中')
    assert.ok(text.includes('财务分析'), 'AI 角色标签在名单中')
    assert.ok(text.includes('Excel/报表/预算'), 'AI 专长在名单中')
    assert.ok(text.includes('← 你'), '当前 AI 自我标注')
    assert.ok(text.includes('产品知识库'), '知识库成员也在名单中')
  })

  it('P1-1 buildHistoryContent：发信人署名', () => {
    const content = buildHistoryContent({ content: '把 Q3 报告发我', senderName: '王总' })
    assert.strictEqual(content, '[王总] 把 Q3 报告发我', '消息带 [发信人] 前缀')
  })

  it('P1-2 buildHistoryContent：reply_to 引用上下文', () => {
    const content = buildHistoryContent({
      content: '好的，马上',
      senderName: '财务助手',
      replyTo: { senderName: '王总', content: '把 Q3 报告发我' },
    })
    assert.strictEqual(content, '[财务助手]（回复 [王总] "把 Q3 报告发我"）好的，马上', '引用带原文与发信人')
  })

  it('P2-1 buildPersonaLayer：统一注入层（名单 + 纪律）', () => {
    const rosterText = buildRosterText(
      [{ id: 'a1', name: '财务助手', type: 'ai', roleLabel: '财务分析' }],
      'a1',
    )
    const layer = buildPersonaLayer({ rosterText, selfName: '财务助手' })
    assert.ok(layer.includes('【本部门成员】'), '名单段存在')
    assert.ok(layer.includes('财务分析'), '名单内容透传')
    assert.ok(layer.includes('call_agent'), '协作纪律含委托指引')
    assert.ok(layer.includes('称呼'), '协作纪律含称呼规则')
    assert.ok(layer.includes('@'), '协作纪律含被@响应规则')
    // B7（2026-08）：前缀规范——AI 不给自己加 [自己名] 前缀（双前缀实证）
    assert.ok(layer.includes('不要加 [自己名字] 前缀'), '协作纪律含前缀禁令（B7）')
  })
})
