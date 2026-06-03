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
    assert.ok(engine.router)
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
    const result = await engine.trigger({ function_id: 'math::add', payload: { a: 1, b: 1 }, action: 'void' })
    assert.equal(result, undefined)
  })

  it('lists functions', () => {
    const fns = engine.listFunctions()
    assert.ok(fns.length >= 1)
    const mathFn = fns.find(f => f.id === 'math::add')
    assert.ok(mathFn)
    assert.equal(mathFn!.workerName, 'math')
  })

  it('lists triggers', () => {
    const trigs = engine.listTriggers()
    assert.ok(trigs.length >= 1)
    const httpTrigger = trigs.find(t => t.function_id === 'math::add')
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

  it('has built-in stream functions', () => {
    const fns = engine.listFunctions()
    const expected = ['stream::set', 'stream::get', 'stream::delete', 'stream::list',
      'stream::list_groups', 'stream::list_all', 'stream::send', 'stream::update']
    for (const id of expected) {
      assert.ok(fns.some(f => f.id === id), `missing ${id}`)
    }
  })

  it('removes a worker', () => {
    const w = createWorker('temp')
    w.registerFunction('temp::fn', async () => 'ok')
    engine.addWorker(w)

    assert.ok(engine.listFunctions().some(f => f.id === 'temp::fn'))
    engine.removeWorker(w)
    assert.ok(!engine.listFunctions().some(f => f.id === 'temp::fn'))
  })

  // ── stream tests ────────────────────────────────────────

  it('stream::set and stream::get', async () => {
    const r = await engine.trigger({
      function_id: 'stream::set',
      payload: { stream_name: 'test', group_id: 'g1', item_id: 'i1', data: { msg: 'hello' } },
    }) as any
    assert.ok(r.old_value === null)
    assert.deepEqual(r.new_value, { msg: 'hello' })

    const g = await engine.trigger({
      function_id: 'stream::get',
      payload: { stream_name: 'test', group_id: 'g1', item_id: 'i1' },
    }) as any
    assert.deepEqual(g.value, { msg: 'hello' })
  })

  it('stream::set updates existing item', async () => {
    await engine.trigger({
      function_id: 'stream::set',
      payload: { stream_name: 'test', group_id: 'g1', item_id: 'i1', data: { msg: 'world' } },
    })
    const g = await engine.trigger({
      function_id: 'stream::get',
      payload: { stream_name: 'test', group_id: 'g1', item_id: 'i1' },
    }) as any
    assert.deepEqual(g.value, { msg: 'world' })
  })

  it('stream::delete removes item', async () => {
    await engine.trigger({
      function_id: 'stream::set',
      payload: { stream_name: 'test', group_id: 'g2', item_id: 'i1', data: 'temp' },
    })
    const d = await engine.trigger({
      function_id: 'stream::delete',
      payload: { stream_name: 'test', group_id: 'g2', item_id: 'i1' },
    }) as any
    assert.equal(d.old_value, 'temp')

    const g = await engine.trigger({
      function_id: 'stream::get',
      payload: { stream_name: 'test', group_id: 'g2', item_id: 'i1' },
    }) as any
    assert.equal(g.value, null)
  })

  it('stream::get returns null for missing item', async () => {
    const g = await engine.trigger({
      function_id: 'stream::get',
      payload: { stream_name: 'test', group_id: 'missing', item_id: 'nope' },
    }) as any
    assert.equal(g.value, null)
  })

  it('stream::list returns items in a group', async () => {
    await engine.trigger({
      function_id: 'stream::set',
      payload: { stream_name: 'list-test', group_id: 'room1', item_id: 'a', data: 1 },
    })
    await engine.trigger({
      function_id: 'stream::set',
      payload: { stream_name: 'list-test', group_id: 'room1', item_id: 'b', data: 2 },
    })

    const r = await engine.trigger({
      function_id: 'stream::list',
      payload: { stream_name: 'list-test', group_id: 'room1' },
    }) as any
    assert.equal(r.items.length, 2)
    assert.ok(r.items.some((i: any) => i.item_id === 'a'))
    assert.ok(r.items.some((i: any) => i.item_id === 'b'))
  })

  it('stream::list_groups lists groups', async () => {
    const r = await engine.trigger({
      function_id: 'stream::list_groups',
      payload: { stream_name: 'list-test' },
    }) as any
    assert.ok(r.groups.includes('room1'))
  })

  it('stream::list_all lists streams', async () => {
    const r = await engine.trigger({ function_id: 'stream::list_all', payload: {} }) as any
    assert.ok(r.count >= 1)
    assert.ok(r.streams.some((s: any) => s.stream_name === 'list-test'))
  })

  it('stream::send notifies subscribers without persisting', async () => {
    let received: any = null
    const mockWs = { send: (msg: string) => { received = JSON.parse(msg) } } as any

    const { createStream } = await import('../iii/stream.ts')
    const s = createStream({})
    s.subscribe(mockWs, { stream_name: 'send-test', group_id: 'g1' })

    await s.send('send-test', 'g1', 'custom-event', { note: 'hello' })

    assert.ok(received)
    assert.equal(received.type, 'stream')
    assert.equal(received.event, 'send')
    assert.deepEqual(received.data, { type: 'custom-event', data: { note: 'hello' } })
  })

  it('stream::update with set op', async () => {
    await engine.trigger({
      function_id: 'stream::set',
      payload: { stream_name: 'update-test', group_id: 'g1', item_id: 'counter', data: { count: 0 } },
    })
    const r = await engine.trigger({
      function_id: 'stream::update',
      payload: { stream_name: 'update-test', group_id: 'g1', item_id: 'counter', ops: [{ op: 'set', value: { count: 99 } }] },
    }) as any
    assert.deepEqual(r.old_value, { count: 0 })
    assert.deepEqual(r.new_value, { count: 99 })
  })

  it('stream::update with increment/decrement ops', async () => {
    await engine.trigger({
      function_id: 'stream::set',
      payload: { stream_name: 'update-test', group_id: 'g2', item_id: 'n', data: 10 },
    })
    await engine.trigger({
      function_id: 'stream::update',
      payload: { stream_name: 'update-test', group_id: 'g2', item_id: 'n', ops: [{ op: 'increment', value: 5 }] },
    })
    const g = await engine.trigger({
      function_id: 'stream::get',
      payload: { stream_name: 'update-test', group_id: 'g2', item_id: 'n' },
    }) as any
    assert.equal(g.value, 15)
  })

  it('stream::update with merge op', async () => {
    await engine.trigger({
      function_id: 'stream::set',
      payload: { stream_name: 'update-test', group_id: 'g3', item_id: 'obj', data: { a: 1, b: 2 } },
    })
    await engine.trigger({
      function_id: 'stream::update',
      payload: { stream_name: 'update-test', group_id: 'g3', item_id: 'obj', ops: [{ op: 'merge', value: { b: 99, c: 3 } }] },
    })
    const g = await engine.trigger({
      function_id: 'stream::get',
      payload: { stream_name: 'update-test', group_id: 'g3', item_id: 'obj' },
    }) as any
    assert.deepEqual(g.value, { a: 1, b: 99, c: 3 })
  })

  it('stream::update with append op', async () => {
    await engine.trigger({
      function_id: 'stream::set',
      payload: { stream_name: 'update-test', group_id: 'g4', item_id: 'arr', data: [1, 2] },
    })
    await engine.trigger({
      function_id: 'stream::update',
      payload: { stream_name: 'update-test', group_id: 'g4', item_id: 'arr', ops: [{ op: 'append', value: 3 }] },
    })
    const g = await engine.trigger({
      function_id: 'stream::get',
      payload: { stream_name: 'update-test', group_id: 'g4', item_id: 'arr' },
    }) as any
    assert.deepEqual(g.value, [1, 2, 3])
  })

  it('stream::update with remove op', async () => {
    await engine.trigger({
      function_id: 'stream::set',
      payload: { stream_name: 'update-test', group_id: 'g5', item_id: 'x', data: 'delete-me' },
    })
    await engine.trigger({
      function_id: 'stream::update',
      payload: { stream_name: 'update-test', group_id: 'g5', item_id: 'x', ops: [{ op: 'remove' }] },
    })
    const g = await engine.trigger({
      function_id: 'stream::get',
      payload: { stream_name: 'update-test', group_id: 'g5', item_id: 'x' },
    }) as any
    assert.equal(g.value, null)
  })

  it('stream subscribe receives notifications via WS mock', async () => {
    const received: any[] = []
    const mockWs = { send: (msg: string) => { received.push(JSON.parse(msg)) } } as any

    const { createStream } = await import('../iii/stream.ts')
    const s = createStream({})
    s.subscribe(mockWs, { stream_name: 'notif-test', group_id: 'g1' })

    await s.set('notif-test', 'g1', 'item-1', { status: 'active' })
    assert.equal(received.length, 1)
    assert.equal(received[0].event, 'set')
    assert.equal(received[0].item_id, 'item-1')

    await s.delete('notif-test', 'g1', 'item-1')
    assert.equal(received.length, 2)
    assert.equal(received[1].event, 'delete')
  })

  it('stream list returns empty for unknown group', async () => {
    const r = await engine.trigger({
      function_id: 'stream::list',
      payload: { stream_name: 'no-such-stream', group_id: 'no-group' },
    }) as any
    assert.deepEqual(r.items, [])
  })

  // ── REST API ────────────────────────────────────────────

  it('triggers via REST API', async () => {
    const r = engine.router()
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
    const r = engine.router()

    const workersRes = await r.handler()(
      new Request('http://localhost/workers'),
      { params: {}, query: {} } as any,
    )
    assert.equal(workersRes.status, 200)
    const ws = await workersRes.json()
    assert.ok(Array.isArray(ws))

    const fnsRes = await r.handler()(
      new Request('http://localhost/functions'),
      { params: {}, query: {} } as any,
    )
    assert.equal(fnsRes.status, 200)
    const fns = await fnsRes.json()
    assert.ok(Array.isArray(fns))

    const trigsRes = await r.handler()(
      new Request('http://localhost/triggers'),
      { params: {}, query: {} } as any,
    )
    assert.equal(trigsRes.status, 200)
    const trigs = await trigsRes.json()
    assert.ok(Array.isArray(trigs))
  })

  it('REST trigger with void returns 202', async () => {
    const r = engine.router()
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
    const r = engine.router()
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
    await engine.shutdown()
    assert.equal(engine.listWorkers().length, 0)
    assert.equal(engine.listFunctions().length, 0)
  })
})
