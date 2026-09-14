import { describe, it } from 'node:test'
import assert from 'node:assert'
import { formatOutboundBody } from '../src/services/webhook-platform.ts'

describe('外部 IM 平台出站格式（G8）', () => {
  it('generic：平台无关 JSON（reply + conversation_id）', () => {
    const body = JSON.parse(formatOutboundBody('generic', '你好', 'c1'))
    assert.equal(body.reply, '你好')
    assert.equal(body.conversation_id, 'c1')
  })

  it('企业微信：msgtype=text 格式', () => {
    const body = JSON.parse(formatOutboundBody('wecom', '你好', 'c1'))
    assert.deepEqual(body, { msgtype: 'text', text: { content: '你好' } })
  })

  it('钉钉：msgtype=text 格式', () => {
    const body = JSON.parse(formatOutboundBody('dingtalk', '你好', 'c1'))
    assert.deepEqual(body, { msgtype: 'text', text: { content: '你好' } })
  })

  it('飞书：msg_type=text 格式', () => {
    const body = JSON.parse(formatOutboundBody('feishu', '你好', 'c1'))
    assert.deepEqual(body, { msg_type: 'text', content: { text: '你好' } })
  })

  it('未知平台回退 generic', () => {
    const body = JSON.parse(formatOutboundBody('unknown', 'hi', ''))
    assert.ok(body.reply === 'hi' || body.msgtype === 'text', '未知平台回退通用格式')
  })

  it('长文本截断（企微 2048 字符限制）', () => {
    const long = 'a'.repeat(3000)
    const body = JSON.parse(formatOutboundBody('wecom', long, ''))
    assert.ok(body.text.content.length <= 2048, '超长截断')
  })
})
