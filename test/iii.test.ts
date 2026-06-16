import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { iii } from '../iii/client.ts'
import { createWorker } from '../iii/worker.ts'
import type { IIIModule } from '../iii/types.ts'

describe('iii', () => {
  let engine: IIIModule

  it('creates an engine', () => {
    engine = iii()
    assert.ok(engine)
    assert.ok(engine.handler)
    assert.ok(engine.trigger)
    assert.ok(engine.addWorker)
  })

  it('registers a local worker with function and trigger', () => {
    const w = createWorker('math')
    w.registerFunction('math::add', async (payload: any) => {
      return { c: payload.a + payload.b }
    })
    w.registerTrigger({
      type: 'http',
      function_id: 'math::add',
      config: { method: 'POST', path: '/add' },
    })
    engine.addWorker(w)

    const workers = engine.listWorkers()
    assert.equal(workers.length, 1)
    assert.equal(workers[0].name, 'math')
  })

  it('triggers a local function synchronously', async () => {
    const result = await engine.trigger({ function_id: 'math::add', payload: { a: 2, b: 3 } })
    assert.deepEqual(result, { c: 5 })
  })

  it('triggers with void action returns undefined', async () => {
    const result = await engine.trigger({
      function_id: 'math::add',
      payload: { a: 1, b: 1 },
      action: 'void',
    })
    assert.equal(result, undefined)
  })

  it('lists functions', () => {
    const fns = engine.listFunctions()
    assert.ok(fns.length >= 1)
    const mathFn = fns.find((f) => f.id === 'math::add')
    assert.ok(mathFn)
    assert.equal(mathFn!.workerName, 'math')
  })

  it('lists triggers', () => {
    const trigs = engine.listTriggers()
    assert.ok(trigs.length >= 1)
    const httpTrigger = trigs.find((t) => t.function_id === 'math::add')
    assert.ok(httpTrigger)
    assert.equal(httpTrigger!.type, 'http')
  })

  it('lists workers', () => {
    const ws = engine.listWorkers()
    assert.ok(ws.length >= 1)
    assert.equal(ws[0].name, 'math')
  })

  it('throws for non-existent function', async () => {
    try {
      await engine.trigger({ function_id: 'does::not-exist', payload: {} })
      assert.fail('should have thrown')
    } catch (err: any) {
      assert.ok(err.message.includes('does::not-exist'))
    }
  })

  it('throws on duplicate function registration', () => {
    const w2 = createWorker('math2')
    w2.registerFunction('math::add', async () => ({}))
    assert.throws(() => engine.addWorker(w2), {
      message: /math::add/,
    })
  })

  it('removes a worker', () => {
    const w = createWorker('temp')
    w.registerFunction('temp::fn', async () => 'ok')
    engine.addWorker(w)

    assert.ok(engine.listFunctions().some((f) => f.id === 'temp::fn'))
    engine.removeWorker(w)
    assert.ok(!engine.listFunctions().some((f) => f.id === 'temp::fn'))
  })

  // ── REST API ────────────────────────────────────────────

  it('triggers via REST API', async () => {
    const r = engine
    const res = await r.handler()(
      new Request('http://localhost/trigger/math::add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: { a: 10, b: 20 } }),
      }),
      { params: { functionId: 'math::add' }, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body, { c: 30 })
  })

  it('REST API lists workers/functions/triggers', async () => {
    const r = engine

    const workersRes = await r.handler()(new Request('http://localhost/workers'), {
      params: {},
      query: {},
    } as any)
    assert.equal(workersRes.status, 200)
    const ws = await workersRes.json()
    assert.ok(Array.isArray(ws))

    const fnsRes = await r.handler()(new Request('http://localhost/functions'), {
      params: {},
      query: {},
    } as any)
    assert.equal(fnsRes.status, 200)
    const fns = await fnsRes.json()
    assert.ok(Array.isArray(fns))

    const trigsRes = await r.handler()(new Request('http://localhost/triggers'), {
      params: {},
      query: {},
    } as any)
    assert.equal(trigsRes.status, 200)
    const trigs = await trigsRes.json()
    assert.ok(Array.isArray(trigs))
  })

  it('REST trigger with void returns 202', async () => {
    const r = engine
    const res = await r.handler()(
      new Request('http://localhost/trigger/math::add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: { a: 1, b: 2 }, action: 'void' }),
      }),
      { params: { functionId: 'math::add' }, query: {} } as any,
    )
    assert.equal(res.status, 202)
  })

  it('REST trigger with non-existent function returns 500', async () => {
    const r = engine
    const res = await r.handler()(
      new Request('http://localhost/trigger/nope::fn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: {} }),
      }),
      { params: { functionId: 'nope::fn' }, query: {} } as any,
    )
    assert.equal(res.status, 500)
    const body = await res.json()
    assert.ok(body.error)
  })

  it('shutdown cleans up', async () => {
    await engine.close()
    assert.equal(engine.listWorkers().length, 0)
    assert.equal(engine.listFunctions().length, 0)
  })
})
