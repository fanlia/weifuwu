/**
 * email — 真实 SMTP 服务器集成测试（CS-04：docker GreenMail）
 *
 * 协议层 mock（email.test.ts）是主战场；这里是真实 SMTP 服务器兼容性背书——
 * 完整握手 + 真实接收，抓 mock 抓不到的文档外细节。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sendSmtp } from '../email/smtp.ts'

const SMTP_HOST = process.env.SMTP_HOST ?? 'localhost'
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 3025)

describe('email real SMTP (GreenMail docker)', () => {
  it('真实服务器：发送成功（含中文 subject encoded-word）', async () => {
    await sendSmtp(
      { host: SMTP_HOST, port: SMTP_PORT },
      {
        from: 'sender@x.com',
        to: ['recipient@x.com'],
        subject: '真实发送测试',
        text: 'hello from weifuwu email\n第二行',
      },
    )
    assert.ok(true)
  })

  it('多收件人 + html', async () => {
    await sendSmtp(
      { host: SMTP_HOST, port: SMTP_PORT },
      {
        from: 'sender@x.com',
        to: ['a@x.com', 'b@x.com'],
        subject: 'Multi',
        html: '<h1>html body</h1>',
      },
    )
    assert.ok(true)
  })
})
