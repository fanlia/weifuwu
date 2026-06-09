import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mailer } from '../mailer.ts'

describe('mailer', () => {
  it('sends via custom send function', async () => {
    const sent: any[] = []
    const m = mailer({
      send: async (opts) => { sent.push(opts) },
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
})
