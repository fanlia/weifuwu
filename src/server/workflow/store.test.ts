/**
 * workflow/store 契约：KV 显式记账（替代 edge 原语——语义全透明）
 *
 * 用户问题「邮件是否已经发送过」的答案 = store 值（用户自己查）——
 * 本组测试锁定查询/记账/失败不记账的完整语义。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { workflow } from './index.ts'
import type { WorkflowDef } from './contracts.ts'

function mem() {
  const kv = new Map<string, string>()
  return {
    kv,
    store: { get: async (k: string) => kv.get(k) ?? null, set: async (k: string, v: string) => { kv.set(k, v) } },
  }
}

function makeWf(e: { fetch?: typeof fetch; email?: { send: (m: { to: string | string[]; subject: string; body: string }) => Promise<{ ok: boolean; id?: string }> } } = {}) {
  const sent: string[] = []
  const m = mem()
  const wf = workflow({
    fetch: e.fetch ?? (async () => new Response(JSON.stringify({ items: [{ id: 1 }] }), { status: 200 })) as typeof fetch,
    email: e.email ?? { send: async (msg) => { sent.push(String(msg.to)); return { ok: true, id: 'x' } } },
    store: m.store,
  })
  return { wf, sent, kv: m.kv }
}

/** 「发一次」场景（用户显式记账——与 wfjs 源码一致的结构） */
function alertDef(): WorkflowDef {
  return {
    steps: [
      { id: 'probe', type: 'http', config: { url: 'https://api.test/stock' } },
      { id: 'sent', type: 'store', config: { op: 'get', key: 'stock:alert:sent' } },
      {
        id: 'gate', type: 'if', config: {
          when: "steps.probe.data.json.items.length > 0 && steps.sent.data !== '1'",
          then: { steps: [
            { id: 'mail', type: 'email', config: { to: 'ops@x.com', subject: '预警', body: 'x' } },
            { id: 'book', type: 'store', config: { op: 'set', key: 'stock:alert:sent', value: '1' } },
          ] },
        },
      },
    ],
  }
}

describe('store: KV 记账（「发一次」全周期）', () => {
  it('首跑：未记账 → 发送 + 记账；二次：已记账 → 不发送', async () => {
    const { wf, sent, kv } = makeWf()
    const r1 = await wf.execute(alertDef())
    assert.equal(r1.status, 'success')
    assert.equal(sent.length, 1)
    assert.equal(kv.get('stock:alert:sent'), '1')
    const r2 = await wf.execute(alertDef())
    assert.equal(r2.status, 'success')
    assert.equal(sent.length, 1, '已记账 → 不重发')
    assert.equal(r2.stepResults.sent.data, '1', '「发过吗」= store 值')
    // 清账 → 再发（故障修复后重新预警）
    kv.delete('stock:alert:sent')
    const r3 = await wf.execute(alertDef())
    assert.equal(r3.status, 'success')
    assert.equal(sent.length, 2)
  })

  it('发送失败 → 不记账 → 下次重试（at-least-once——不丢信）', async () => {
    let fail = true
    const { wf, sent, kv } = makeWf({
      email: { send: async (msg) => { if (fail) throw new Error('smtp down'); sent.push(...(Array.isArray(msg.to) ? msg.to : [msg.to])); return { ok: true } } },
    })
    const r1 = await wf.execute(alertDef())
    assert.equal(r1.status, 'error')
    assert.equal(kv.get('stock:alert:sent'), undefined, '失败不记账——下次仍可发送')
    fail = false
    const r2 = await wf.execute(alertDef())
    assert.equal(r2.status, 'success')
    assert.equal(sent.length, 1)
    assert.equal(kv.get('stock:alert:sent'), '1')
  })

  it('store 步骤未注入存储 → 明确配置错误', async () => {
    const wf = workflow({ fetch: (async () => new Response('{}', { status: 200 })) as typeof fetch })
    const r = await wf.execute({ steps: [{ id: 's', type: 'store', config: { op: 'get', key: 'k' } }] })
    assert.equal(r.status, 'error')
    assert.match(r.error ?? '', /需要存储注入/)
  })

  it('store 键值模板（{{}} 插值——与 http url 同语义）', async () => {
    const { wf } = makeWf()
    const def: WorkflowDef = {
      steps: [
        { id: 'mark', type: 'store', config: { op: 'set', key: 'base:x', value: 'x' } },
        { id: 'read', type: 'store', config: { op: 'get', key: 'base:{{steps.mark.data}}' } },
      ],
    }
    const r = await wf.execute(def)
    assert.equal(r.status, 'success')
    assert.equal(r.stepResults.read.data, 'x')
  })
})
