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
    edgeStore: { data: new Map<string, string>() } as never,
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

  it('库存监控端到端（wfjs → 编译 → edge 发一次）', async () => {
    const src = `const res = await http({ url: 'https://api.test/stock' })
if once (res.json.items.length > 0) {
  await email({ to: 'ops@x.com', subject: '预警', body: res.json.items })
}`
    const def = compileWfjs(src)
    const fetchOk = (async () => new Response(JSON.stringify({ items: [{ id: 1 }, { id: 2 }] }), { status: 200 })) as typeof fetch
    const store = new Map<string, string>()
    const sent: string[] = []
    const wf = workflow({
      fetch: fetchOk,
      email: { send: async (m) => { sent.push(String(m.to)); return { ok: true, id: 'm' } } },
      edgeStore: { get: async (k) => store.get(k) ?? null, set: async (k, v) => { store.set(k, v) } },
    })
    // 首跑：发送
    const r1 = await wf.execute(def)
    assert.equal(r1.status, 'success')
    assert.equal(sent.length, 1)
    // 二次跑：静默不重发（edge 状态保持）——email 步骤在 then 子链外不执行
    const r2 = await wf.execute(def)
    assert.equal(r2.status, 'success')
    assert.equal(sent.length, 1)
    assert.deepEqual(r2.stepResults._if1?.data, { satisfied: true, fired: false })
  })
})
