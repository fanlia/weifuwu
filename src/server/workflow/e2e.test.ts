/**
 * workflow 端到端契约：wfjs 源码 → compileWfjs → execute → RunResult
 *
 * 三态架构闭环验证：源码视图（wfjs）与 JSON DSL（IR）同源——
 * 编译产物直接可执行，语义在真跑中验证（不只是形状匹配）。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { workflow } from './index.ts'
import { compileWfjs } from './wfjs.ts'

function makeWf(extra: { fetch?: typeof fetch } = {}) {
  const events: string[] = []
  const wf = workflow({
    fetch: extra.fetch,
    email: { send: async (m) => { events.push(`mail:${m.to}`); return { ok: true, id: 'm' } } },
    log: (line) => events.push(`${line}`),
    store: { get: async () => null, set: async () => undefined } as never,
  })
  return { wf, events }
}

describe('e2e: wfjs 编译产物真执行', () => {
  it('变量链：let/+= → assign 真跑（vars 求值）', async () => {
    const def = compileWfjs(`let n = 0\nn += 2`)
    const { wf } = makeWf()
    const r = await wf.execute(def)
    assert.equal(r.status, 'success')
    assert.equal(r.stepResults.n.data, 0)
    assert.equal(r.stepResults._assign1?.data, 2)
  })

  it('while 循环：计数到条件（maxIters 兜底内收敛）', async () => {
    const def = compileWfjs(`let page = 0\nwhile (page < 3) { page = page + 1 }`)
    const { wf } = makeWf()
    const r = await wf.execute(def)
    assert.equal(r.status, 'success')
    assert.equal(r.stepResults.page.data, 0) // 初始
    assert.deepEqual(r.stepResults._while1?.data, { iterations: 3 })
    // 循环内 assign 每轮覆盖——最终值 = 3（0+1+1+1）
    assert.equal(r.stepResults._assign1.data, 3)
  })

  it('for-of：loop.item 进模板（每轮各自求值）', async () => {
    const def = compileWfjs("for (const it of input.items) { await log({ message: `行 ${loop.item}` }) }")
    const { wf, events } = makeWf()
    const r = await wf.execute(def, { input: { items: ['a', 'b', 'c'] } })
    assert.equal(r.status, 'success')
    assert.deepEqual(events, ['行 a', '行 b', '行 c'])
    assert.deepEqual(r.stepResults._forof1?.data, { iterations: 3 })
  })

  it('return 终止：中途 return → success + 后续不执行', async () => {
    const def = compileWfjs(`await log({ message: '先' })\nreturn\nawait log({ message: '后' })`)
    const { wf, events } = makeWf()
    const r = await wf.execute(def)
    assert.equal(r.status, 'success')
    assert.deepEqual(events, ['先'])
    assert.ok(!r.stepResults._log2, 'return 后不再执行')
  })

  it('库存监控端到端（wfjs → 编译 → store 记账「发一次」）', async () => {
    const src = `import { store } from 'wf://std/store'
const res = await http({ url: 'https://api.test/stock' })
const sent = await store.get('stock:alert:sent')
if (res.json.items.length > 0 && sent !== '1') {
  await email({ to: 'ops@x.com', subject: '预警', body: res.json.items })
  await store.set('stock:alert:sent', '1')
}`
    const def = compileWfjs(src)
    const fetchOk = (async () => new Response(JSON.stringify({ items: [{ id: 1 }, { id: 2 }] }), { status: 200 })) as typeof fetch
    const kv = new Map<string, string>()
    const sent: string[] = []
    const wf = workflow({
      fetch: fetchOk,
      email: { send: async (m) => { sent.push(String(m.to)); return { ok: true, id: 'm' } } },
      store: { get: async (k) => kv.get(k) ?? null, set: async (k, v) => { kv.set(k, v) } },
    })
    // 首跑：未发过 → 发送 + 记账
    const r1 = await wf.execute(def)
    assert.equal(r1.status, 'success')
    assert.equal(sent.length, 1)
    assert.equal(kv.get('stock:alert:sent'), '1')
    // 二次跑：已记账 → 不再发送（用户显式判断——语义全透明）
    const r2 = await wf.execute(def)
    assert.equal(r2.status, 'success')
    assert.equal(sent.length, 1)
    assert.equal(r2.stepResults.sent?.data, '1')
    // 清账（如故障修复后想再发）：del 后恢复发送
    kv.delete('stock:alert:sent')
    const r3 = await wf.execute(def)
    assert.equal(sent.length, 2)
  })
})
