/**
 * 外部 IM 入站（G8 补强）——企微/钉钉/飞书回调解析 → 部门消息流 → AI 回复回显
 *
 * 闭环：IM 群里 @机器人 → 平台回调 → 消息进绑定部门（AI 像同事回复）
 *      → AI 回复按平台格式回显（回调响应即回复）
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { parseImInbound } from '../src/services/im-inbound.ts'

describe('外部 IM 入站解析（G8 补强）', () => {
  it('企微：text 消息解析', () => {
    const r = parseImInbound('wecom', {
      ToUserName: 'corp1',
      FromUserName: 'zhangsan',
      MsgType: 'text',
      Content: '@机器人 报销流程是什么',
      MsgId: 'm1',
    })
    assert.strictEqual(r.content, '@机器人 报销流程是什么')
    assert.strictEqual(r.sender, 'zhangsan')
  })

  it('钉钉：text 消息解析', () => {
    const r = parseImInbound('dingtalk', {
      text: { content: '帮我查个数据' },
      senderNick: '李四',
      conversationId: 'cid123',
    })
    assert.strictEqual(r.content, '帮我查个数据')
    assert.strictEqual(r.sender, '李四')
  })

  it('飞书：event 结构解析（content 是 JSON 字符串）', () => {
    const r = parseImInbound('feishu', {
      event: {
        message: {
          message_id: 'om_1',
          content: '{"text":"你好，请介绍下公司"}',
        },
        sender: { sender_id: { open_id: 'ou_1' } },
      },
    })
    assert.strictEqual(r.content, '你好，请介绍下公司')
    assert.strictEqual(r.sender, 'ou_1')
  })

  it('未知平台/空内容拒绝', () => {
    assert.throws(() => parseImInbound('unknown', {}), /不支持/)
    assert.throws(() => parseImInbound('wecom', { MsgType: 'image' }), /不支持的消息类型/)
    assert.throws(() => parseImInbound('wecom', { MsgType: 'text', Content: '' }), /空/)
  })
})

describe('IM 验签（安全底线）', () => {
  it('钉钉官方验签：正确 sign 通过、错误拒绝', async () => {
    const { createHmac } = await import('node:crypto')
    const { verifyDingtalkSign } = await import('../src/services/webhook.ts')
    const secret = 'SEC123'
    const timestamp = String(Date.now())
    const payload = `${timestamp}\n${secret}`
    const sign = createHmac('sha256', secret).update(payload).digest('base64')
    assert.strictEqual(verifyDingtalkSign({}, timestamp, sign, secret), true)
    assert.strictEqual(verifyDingtalkSign({}, timestamp, 'bad', secret), false)
  })
})
