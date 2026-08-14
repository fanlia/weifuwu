import { describe, it } from 'node:test'
import assert from 'node:assert'
import { riskOf, needsApproval } from '../src/services/risk-policy.ts'

describe('浏览器操作风险分级（C2 扩展）', () => {
  it('agent-browser 读取类 = medium（智能分级下需审批）', () => {
    assert.equal(riskOf('bash', { command: 'agent-browser open https://example.com' }), 'medium')
    assert.equal(riskOf('bash', { command: 'agent-browser read' }), 'medium')
    assert.equal(riskOf('bash', { command: 'agent-browser screenshot /ws/s.png' }), 'medium')
  })

  it('agent-browser 交互类 = high（点击/输入/提交必审批）', () => {
    assert.equal(riskOf('bash', { command: 'agent-browser click @e3' }), 'high')
    assert.equal(riskOf('bash', { command: 'agent-browser type @e1 "submit"' }), 'high')
    assert.equal(riskOf('bash', { command: 'agent-browser press Enter' }), 'high')
  })

  it('auto 策略：low 自动 / medium+high 审批', () => {
    assert.equal(needsApproval('auto', 'bash', { command: 'read_file' }), false)
    assert.equal(needsApproval('auto', 'bash', { command: 'agent-browser open x.com' }), true)
    assert.equal(needsApproval('auto', 'bash', { command: 'agent-browser click @e1' }), true)
  })

  it('strict 全批 / off 全放', () => {
    assert.equal(needsApproval('strict', 'bash', { command: 'ls' }), true)
    assert.equal(needsApproval('off', 'bash', { command: 'rm -rf /' }), false)
  })
})
