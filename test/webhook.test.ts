import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { webhook } from '../webhook.ts'
import type { Context } from '../types.ts'

function mkCtx(): Context {
  return { params: {}, query: {} } as Context
}

function stripeSignature(payload: string, secret: string, timestamp: number): string {
  const signed = `${timestamp}.${payload}`
  const sig = crypto.createHmac('sha256', secret).update(signed).digest('hex')
  return `t=${timestamp},v1=${sig}`
}

function githubSignature(payload: string, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`
}

function slackSignature(payload: string, secret: string, timestamp: number): string {
  const sigBase = `v0:${timestamp}:${payload}`
  return `v0=${crypto.createHmac('sha256', secret).update(sigBase).digest('hex')}`
}

describe('webhook', () => {
  describe('Stripe', () => {
    it('verifies valid Stripe signature and dispatches event', async () => {
      const wh = webhook({ stripe: { secret: 'whsec_test' } })
      const events: string[] = []

      wh.on('checkout.session.completed', (event) => {
        events.push(event.event)
      })

      const payload = JSON.stringify({
        type: 'checkout.session.completed',
        id: 'evt_123',
        data: { object: { id: 'cs_123' } },
      })
      const timestamp = Math.floor(Date.now() / 1000)
      const sig = stripeSignature(payload, 'whsec_test', timestamp)

      const res = await wh.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'stripe-signature': sig,
          },
          body: payload,
        }),
        mkCtx(),
      )
      assert.equal(res.status, 200)
      assert.deepEqual(events, ['checkout.session.completed'])
    })

    it('rejects invalid Stripe signature', async () => {
      const wh = webhook({ stripe: { secret: 'whsec_test' } })
      const payload = JSON.stringify({ type: 'checkout.session.completed' })
      const sig = stripeSignature(payload, 'wrong_secret', Math.floor(Date.now() / 1000))

      const res = await wh.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'stripe-signature': sig,
          },
          body: payload,
        }),
        mkCtx(),
      )
      assert.equal(res.status, 401)
    })

    it('rejects missing Stripe signature header', async () => {
      const wh = webhook({ stripe: { secret: 'whsec_test' } })
      const res = await wh.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          body: JSON.stringify({ type: 'test' }),
        }),
        mkCtx(),
      )
      assert.equal(res.status, 401)
    })

    it('rejects duplicate Stripe events (replay protection)', async () => {
      const wh = webhook({ stripe: { secret: 'whsec_test' } })
      let count = 0
      wh.on('*', () => { count++ })

      const payload = JSON.stringify({
        type: 'payment_intent.succeeded',
        id: 'evt_unique',
      })
      const timestamp = Math.floor(Date.now() / 1000)
      const sig = stripeSignature(payload, 'whsec_test', timestamp)

      function makeReq() {
        return new Request('http://localhost/', {
          method: 'POST',
          headers: { 'stripe-signature': sig },
          body: payload,
        })
      }

      const res1 = await wh.handler()(makeReq(), mkCtx())
      assert.equal(res1.status, 200)
      assert.equal(count, 1)

      const res2 = await wh.handler()(makeReq(), mkCtx())
      assert.equal(res2.status, 200) // still 200 (acknowledges receipt)
      assert.equal(count, 1) // handler not called again
    })
  })

  describe('GitHub', () => {
    it('verifies valid GitHub signature and dispatches event', async () => {
      const wh = webhook({ github: { secret: 'gh_secret' } })
      const events: string[] = []

      wh.on('push', (event) => {
        events.push(event.event)
      })

      const payload = JSON.stringify({ ref: 'refs/heads/main' })
      const sig = githubSignature(payload, 'gh_secret')

      const res = await wh.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-hub-signature-256': sig,
            'x-github-event': 'push',
            'x-github-delivery': 'delivery_123',
          },
          body: payload,
        }),
        mkCtx(),
      )
      assert.equal(res.status, 200)
      assert.deepEqual(events, ['push'])
    })

    it('rejects invalid GitHub signature', async () => {
      const wh = webhook({ github: { secret: 'gh_secret' } })
      const sig = githubSignature('{}', 'wrong_secret')

      const res = await wh.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          headers: { 'x-hub-signature-256': sig },
          body: '{}',
        }),
        mkCtx(),
      )
      assert.equal(res.status, 401)
    })
  })

  describe('Slack', () => {
    it('verifies valid Slack signature and dispatches event', async () => {
      const wh = webhook({ slack: { secret: 'slack_secret' } })
      const events: string[] = []

      wh.on('message', (event) => {
        events.push(event.event)
      })

      const payload = JSON.stringify({
        type: 'event_callback',
        event: { type: 'message', text: 'hello' },
        event_id: 'evt_slack_1',
      })
      const timestamp = Math.floor(Date.now() / 1000)
      const sig = slackSignature(payload, 'slack_secret', timestamp)

      const res = await wh.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-slack-signature': sig,
            'x-slack-request-timestamp': String(timestamp),
          },
          body: payload,
        }),
        mkCtx(),
      )
      assert.equal(res.status, 200)
      assert.deepEqual(events, ['message'])
    })

    it('responds to Slack URL verification challenge', async () => {
      const wh = webhook({ slack: { secret: 'slack_secret' } })
      const payload = JSON.stringify({ challenge: 'challenge_abc', type: 'url_verification' })
      const timestamp = Math.floor(Date.now() / 1000)
      const sig = slackSignature(payload, 'slack_secret', timestamp)

      const res = await wh.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          headers: {
            'x-slack-signature': sig,
            'x-slack-request-timestamp': String(timestamp),
          },
          body: payload,
        }),
        mkCtx(),
      )
      assert.equal(res.status, 200)
      const data = await res.json() as any
      assert.equal(data.challenge, 'challenge_abc')
    })

    it('rejects Slack requests older than 5 minutes', async () => {
      const wh = webhook({ slack: { secret: 'slack_secret' } })
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400 // 6.7 minutes
      const payload = JSON.stringify({ type: 'event_callback', event: { type: 'message' } })
      const sig = slackSignature(payload, 'slack_secret', oldTimestamp)

      const res = await wh.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          headers: {
            'x-slack-signature': sig,
            'x-slack-request-timestamp': String(oldTimestamp),
          },
          body: payload,
        }),
        mkCtx(),
      )
      assert.equal(res.status, 401)
    })
  })

  describe('Custom verifier', () => {
    it('supports custom verifier with event extraction', async () => {
      const wh = webhook({
        custom: [{
          name: 'myapp',
          verify: (body, headers) => headers['x-webhook-token'] === 'mytoken',
          event: (body) => (body as any).action,
        }],
      })
      const events: string[] = []
      wh.on('user.created', (event) => { events.push(event.event) })

      const payload = JSON.stringify({ action: 'user.created', id: 1 })
      const res = await wh.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          headers: { 'x-webhook-token': 'mytoken' },
          body: payload,
        }),
        mkCtx(),
      )
      assert.equal(res.status, 200)
      assert.deepEqual(events, ['user.created'])
    })
  })

  describe('Wildcard handler', () => {
    it('wildcard * receives all events', async () => {
      const wh = webhook({ stripe: { secret: 'whsec_test' } })
      const received: string[] = []
      wh.on('*', (event) => { received.push(`${event.provider}:${event.event}`) })

      const payload = JSON.stringify({ type: 'invoice.paid', id: 'evt_1' })
      const timestamp = Math.floor(Date.now() / 1000)
      const sig = stripeSignature(payload, 'whsec_test', timestamp)

      const res = await wh.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          headers: { 'stripe-signature': sig },
          body: payload,
        }),
        mkCtx(),
      )
      assert.equal(res.status, 200)
      assert.deepEqual(received, ['stripe:invoice.paid'])
    })
  })

  describe('Multiple providers', () => {
    it('handles both Stripe and GitHub on same endpoint', async () => {
      const wh = webhook({
        stripe: { secret: 'whsec_test' },
        github: { secret: 'gh_secret' },
      })
      const events: string[] = []
      wh.on('push', (e) => events.push(`github:${e.event}`))
      wh.on('charge.succeeded', (e) => events.push(`stripe:${e.event}`))

      // GitHub webhook
      const ghPayload = JSON.stringify({ ref: 'main' })
      const ghSig = githubSignature(ghPayload, 'gh_secret')
      const ghRes = await wh.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          headers: {
            'x-hub-signature-256': ghSig,
            'x-github-event': 'push',
          },
          body: ghPayload,
        }),
        mkCtx(),
      )
      assert.equal(ghRes.status, 200)
      assert.deepEqual(events, ['github:push'])

      // Stripe webhook
      const stPayload = JSON.stringify({ type: 'charge.succeeded', id: 'evt_2' })
      const stTimestamp = Math.floor(Date.now() / 1000)
      const stSig = stripeSignature(stPayload, 'whsec_test', stTimestamp)
      const stRes = await wh.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          headers: { 'stripe-signature': stSig },
          body: stPayload,
        }),
        mkCtx(),
      )
      assert.equal(stRes.status, 200)
      assert.deepEqual(events, ['github:push', 'stripe:charge.succeeded'])
    })
  })

  describe('Error handling', () => {
    it('returns 400 for empty body', async () => {
      const wh = webhook({ stripe: { secret: 'whsec_test' } })
      const res = await wh.handler()(
        new Request('http://localhost/', { method: 'POST', body: '' }),
        mkCtx(),
      )
      assert.equal(res.status, 400)
    })

    it('handler error returns 500', async () => {
      const wh = webhook({ stripe: { secret: 'whsec_test' } })
      wh.on('test.event', () => { throw new Error('handler failed') })

      const payload = JSON.stringify({ type: 'test.event', id: 'evt_err' })
      const timestamp = Math.floor(Date.now() / 1000)
      const sig = stripeSignature(payload, 'whsec_test', timestamp)

      const res = await wh.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          headers: { 'stripe-signature': sig },
          body: payload,
        }),
        mkCtx(),
      )
      assert.equal(res.status, 500)
    })

    it('returns 401 when no verifier is configured', async () => {
      const wh = webhook()
      const res = await wh.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          body: JSON.stringify({ type: 'test' }),
        }),
        mkCtx(),
      )
      assert.equal(res.status, 401)
    })
  })

  describe('Event off()', () => {
    it('removes a registered handler', async () => {
      const wh = webhook({ stripe: { secret: 'whsec_test' } })
      let count = 0
      const handler = () => { count++ }
      wh.on('test.event', handler)
      wh.off('test.event', handler)

      const payload = JSON.stringify({ type: 'test.event', id: 'evt_off' })
      const timestamp = Math.floor(Date.now() / 1000)
      const sig = stripeSignature(payload, 'whsec_test', timestamp)

      await wh.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          headers: { 'stripe-signature': sig },
          body: payload,
        }),
        mkCtx(),
      )
      assert.equal(count, 0)
    })
  })
})
