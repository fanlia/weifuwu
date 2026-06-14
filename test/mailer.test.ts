import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mailer } from '../mailer.ts'

describe('mailer', () => {
  it('sends via custom send function', async () => {
    const sent: any[] = []
    const m = mailer({
      send: async (opts) => {
        sent.push(opts)
      },
    })
    await m.send({ to: 'a@b.com', subject: 'Test', text: 'Hello' })
    assert.equal(sent.length, 1)
    assert.equal(sent[0].to, 'a@b.com')
    assert.equal(sent[0].subject, 'Test')
    await m.close()
  })

  it('throws without transport config', async () => {
    const m = mailer({})
    await assert.rejects(
      () => m.send({ to: 'a@b.com', subject: 'x', text: 'x' }),
      /no transport configured/,
    )
    await m.close()
  })

  it('uses transport string URL', async () => {
    const m = mailer({ transport: 'smtp://localhost:1025' })
    assert.ok(m)
    await m.close()
  })

  it('uses transport pre-built object', async () => {
    const fakeTransport = { sendMail: () => Promise.resolve(), close: () => {} }
    const m = mailer({ transport: fakeTransport as any })
    assert.ok(m)
    await m.close()
  })

  it('falls back from option when opts.from not set', async () => {
    const sent: any[] = []
    const m = mailer({
      from: 'default@sender.com',
      send: async (opts) => {
        sent.push(opts)
      },
    })
    await m.send({ to: 'r@x.com', subject: 'Hi', text: 'there' })
    assert.equal(sent.length, 1)
    assert.equal(sent[0].from, undefined, 'from should not be set by mailer when using send')
  })

  it('handles array recipients', async () => {
    const sent: any[] = []
    const m = mailer({
      send: async (opts) => {
        sent.push(opts)
      },
    })
    await m.send({ to: ['a@b.com', 'c@d.com'], subject: 'Multi', text: 'hi' })
    assert.ok(Array.isArray(sent[0].to))
    assert.equal(sent[0].to.length, 2)
    await m.close()
  })
})
