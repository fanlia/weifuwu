/**
 * workflow edge（「发一次」去重）+ ai/email 适配器契约测试
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { workflow, evaluateEdge, type EdgeStore, type WorkflowDef } from './index.ts'

const fetchOk = (async () => new Response(JSON.stringify({ items: [{ price: 100 }] }), { status: 200 })) as typeof fetch

function memStore(): EdgeStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, get: async (k) => data.get(k) ?? null, set: async (k, v) => { data.set(k, v) } }
}

// 用户示例场景：每分钟查 HTTP → 有数据 → 生成邮件 → 发一次
const alertDef: WorkflowDef = {
  id: 'stock-monitor',
  name: '库存监控',
  steps: [
    // "有数据" = 数组非空（JS 语义：length > 0）
    { id: 'probe', type: 'http', config: { url: 'https://api.test/stock' } },
    { id: 'gate', type: 'if', config: { when: 'steps.probe.data.json.items.length > 0', edge: true } },
    { id: 'mail', type: 'email', config: { to: 'ops@x.com', subject: '预警', body: '{{steps.probe.data.json.items}}' } },
  ],
}

describe('edge: evaluateEdge 纯函数四态', () => {
  it('首次 true → fire；持续 true → 静默', () => {
    assert.deepEqual(evaluateEdge(null, true), { fired: true, next: '1' })
    assert.deepEqual(evaluateEdge('1', true), { fired: false, next: '1' })
  })
  it('变假 → 解除武装；再 true → 再 fire', () => {
    assert.deepEqual(evaluateEdge('1', false), { fired: false, next: '0' })
    assert.deepEqual(evaluateEdge('0', false), { fired: false, next: '0' })
    assert.deepEqual(evaluateEdge('0', true), { fired: true, next: '1' })
  })
})

describe('edge: 集成（「发一次预警」全周期）', () => {
  it('首跑 fire 发信 → 持续 true 静默 → 变假解除 → 再 true 再发', async () => {
    const store = memStore()
    const sent: string[] = []
    const wf = workflow({
      fetch: fetchOk,
      edgeStore: store,
      email: { send: async (m) => { sent.push(m.to.join(',')) ; return { ok: true, id: 'm1' } } },
    })
    // 1. 有数据上升沿 → 发信
    const r1 = await wf.execute(alertDef)
    assert.equal(r1.status, 'success')
    assert.deepEqual(r1.executed, ['probe', 'gate', 'mail'])
    assert.deepEqual(r1.stepResults.gate.data, { satisfied: true, fired: true })
    assert.equal(sent.length, 1)
    // 2. 数据持续 → 静默（不重发）
    const r2 = await wf.execute(alertDef)
    assert.equal(r2.status, 'skipped')
    assert.equal(r2.executed.length, 2)
    assert.deepEqual(r2.stepResults.gate.data, { satisfied: true, fired: false })
    assert.equal(sent.length, 1, '持续为真期间不重发')
    // 3. 数据消失 → 解除武装
    const wfEmpty = workflow({
      fetch: (async () => new Response(JSON.stringify({ items: [] }), { status: 200 })) as typeof fetch,
      edgeStore: store,
      email: { send: async (m) => { sent.push(m.to.join(',')) ; return { ok: true, id: 'm2' } } },
    })
    const r3 = await wfEmpty.execute(alertDef)
    assert.equal(r3.status, 'skipped')
    assert.equal(store.data.get('wf:edge:stock-monitor:gate'), '0')
    // 4. 数据恢复 → 再次上升沿 → 再发
    const r4 = await wf.execute(alertDef)
    assert.equal(r4.status, 'success')
    assert.equal(sent.length, 2)
  })
  it('无 edge 存储且配置 edge → 明确配置错误', async () => {
    const wf = workflow({ fetch: fetchOk })
    const r = await wf.execute(alertDef)
    assert.equal(r.status, 'error')
    assert.match(r.error!, /未注入 edge 存储/)
  })
})

describe('ai 步骤', () => {
  it('注入适配器 → prompt 插值 + 输出 text', async () => {
    const calls: { messages: { role: string; content: string }[] }[] = []
    const wf = workflow({
      fetch: fetchOk,
      ai: { chat: async (p) => { calls.push(p); return { content: '生成完毕' } } },
    })
    const r = await wf.execute({
      steps: [
        { id: 'p', type: 'http', config: { url: 'x' } },
        { id: 'g', type: 'ai', config: { prompt: '数据：{{steps.p.data.text}}', system: '你是监控员' } },
      ],
    })
    assert.equal(r.status, 'success')
    assert.equal(r.stepResults.g.data.text, '生成完毕')
    assert.deepEqual(calls[0].messages, [
      { role: 'system', content: '你是监控员' },
      { role: 'user', content: '数据：{"items":[{"price":100}]}' },
    ])
  })
  it('无适配器 → 明确错误（不静默跳过）', async () => {
    const wf = workflow({ fetch: fetchOk })
    const r = await wf.execute({ steps: [{ id: 'g', type: 'ai', config: { prompt: 'x' } }] })
    assert.equal(r.status, 'error')
    assert.match(r.error!, /未注入 ai 适配器/)
  })
  it('dry 模式打桩（不调用 LLM）', async () => {
    let called = false
    const wf = workflow({ fetch: fetchOk, ai: { chat: async () => { called = true; return { content: 'x' } } } })
    const r = await wf.execute({ steps: [{ id: 'g', type: 'ai', config: { prompt: 'x' } }] }, { mode: 'dry' })
    assert.equal(called, false)
    assert.deepEqual(r.stepResults.g, { ok: true, dry: true })
  })
})

describe('email 步骤', () => {
  it('live 发送（to 逗号分割 + subject/body 插值）', async () => {
    const sent: { to: string; subject: string; body: string }[] = []
    const wf = workflow({
      fetch: fetchOk,
      email: { send: async (m) => { sent.push(m as never); return { ok: true, id: 'e1' } } },
    })
    const r = await wf.execute({
      steps: [
        { id: 'p', type: 'http', config: { url: 'x' } },
        { id: 'm', type: 'email', config: { to: 'a@x.com, b@x.com', subject: '价格 {{steps.p.data.json.items[0].price}}', body: '数量 {{steps.p.data.json.items.length}}' } },
      ],
    })
    assert.equal(r.status, 'success')
    assert.deepEqual(r.stepResults.m, { ok: true, data: { id: 'e1' } })
    assert.deepEqual(sent[0], { to: ['a@x.com', 'b@x.com'], subject: '价格 100', body: '数量 1' })
  })
  it('dry 打桩不真发；validate 缺 to 报错', async () => {
    let called = false
    const wf = workflow({ fetch: fetchOk, email: { send: async () => { called = true; return { ok: true } } } })
    const r = await wf.execute({ steps: [{ id: 'm', type: 'email', config: { to: 'a@x.com' } }] }, { mode: 'dry' })
    assert.equal(called, false)
    assert.deepEqual(r.stepResults.m, { ok: true, dry: true })
    const v = wf.validate({ steps: [{ id: 'm', type: 'email', config: { subject: 'x' } }] })
    assert.equal(v.ok, false)
    assert.match(v.errors[0].message, /必填/)
  })
})
