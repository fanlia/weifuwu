import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerWorker } from '../iii/register-worker.ts'

class MockWebSocket {
  static last: MockWebSocket | null = null
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  readyState: number = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onclose: ((e: any) => void) | null = null
  onmessage: ((e: any) => void) | null = null
  onerror: ((e: any) => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.last = this
  }

  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.readyState = 3
    this.onclose?.({ code: 1000, reason: '', wasClean: true })
  }

  static simulateOpen() {
    const ws = MockWebSocket.last!
    ws.readyState = 1
    ws.onopen?.()
  }

  static simulateRegistered(workerId = 'w-1') {
    MockWebSocket.simulateOpen()
    MockWebSocket.last!.onmessage?.({
      data: JSON.stringify({ type: 'registered', worker_id: workerId }),
    })
  }

  static simulateMessage(data: object) {
    MockWebSocket.last!.onmessage?.({ data: JSON.stringify(data) })
  }
}

let original: typeof WebSocket

before(() => {
  original = globalThis.WebSocket as any
  globalThis.WebSocket = MockWebSocket as any
})

after(() => {
  globalThis.WebSocket = original
})

describe('registerWorker', () => {
  let worker: ReturnType<typeof registerWorker>

  afterEach(() => {
    if (worker) worker.shutdown()
    MockWebSocket.last = null
  })

  function getWs() {
    return MockWebSocket.last!
  }

  it('creates a WebSocket connection to the given URL', () => {
    worker = registerWorker('ws://localhost:9999/iii')
    assert.equal(getWs().url, 'ws://localhost:9999/iii')
  })

  it('sends register_worker on open', () => {
    worker = registerWorker('ws://localhost:9999/iii')
    MockWebSocket.simulateOpen()
    assert.equal(getWs().sent.length, 1)
    assert.deepEqual(JSON.parse(getWs().sent[0]), { type: 'register_worker' })
  })

  it('queues messages before connected and flushes after registered', () => {
    worker = registerWorker('ws://localhost:9999/iii')
    worker.registerFunction('test::fn', async () => 'ok')
    assert.equal(getWs().sent.length, 0, 'messages queued before connection')
    MockWebSocket.simulateRegistered()
    assert.equal(getWs().sent.length, 2, 'register_worker + flush')
    assert.deepEqual(JSON.parse(getWs().sent[1]), { type: 'register_function', id: 'test::fn' })
  })

  it('registerFunction stores handler and sends message', () => {
    worker = registerWorker('ws://localhost:9999/iii')
    MockWebSocket.simulateRegistered()
    getWs().sent.length = 0
    worker.registerFunction('test::add', async (p: any) => p.a + p.b)
    assert.equal(getWs().sent.length, 1)
    assert.deepEqual(JSON.parse(getWs().sent[0]), { type: 'register_function', id: 'test::add' })
  })

  it('unregisterFunction sends unregister_function message', () => {
    worker = registerWorker('ws://localhost:9999/iii')
    MockWebSocket.simulateRegistered()
    worker.registerFunction('test::add', async () => 'ok')
    getWs().sent.length = 0
    worker.unregisterFunction('test::add')
    assert.equal(getWs().sent.length, 1)
    assert.deepEqual(JSON.parse(getWs().sent[0]), { type: 'unregister_function', id: 'test::add' })
  })

  it('registerTrigger sends register_trigger message', () => {
    worker = registerWorker('ws://localhost:9999/iii')
    MockWebSocket.simulateRegistered()
    getWs().sent.length = 0
    worker.registerTrigger({
      type: 'http',
      function_id: 'test::add',
      config: { method: 'POST', path: '/add' },
    })
    assert.equal(getWs().sent.length, 1)
    assert.deepEqual(JSON.parse(getWs().sent[0]), {
      type: 'register_trigger',
      function_id: 'test::add',
      trigger_type: 'http',
      config: { method: 'POST', path: '/add' },
    })
  })

  it('unregisterTrigger sends unregister_trigger message', () => {
    worker = registerWorker('ws://localhost:9999/iii')
    MockWebSocket.simulateRegistered()
    getWs().sent.length = 0
    worker.unregisterTrigger('test::add')
    assert.equal(getWs().sent.length, 1)
    assert.deepEqual(JSON.parse(getWs().sent[0]), {
      type: 'unregister_trigger',
      function_id: 'test::add',
    })
  })

  it('trigger runs local function directly', async () => {
    worker = registerWorker('ws://localhost:9999/iii')
    MockWebSocket.simulateRegistered()
    worker.registerFunction('test::add', async (p: any) => ({ result: p.a + p.b }))
    const result = await worker.trigger({ function_id: 'test::add', payload: { a: 2, b: 3 } })
    assert.deepEqual(result, { result: 5 })
  })

  it('trigger with void action returns undefined', async () => {
    worker = registerWorker('ws://localhost:9999/iii')
    MockWebSocket.simulateRegistered()
    worker.registerFunction('test::void', async () => {})
    const result = await worker.trigger({ function_id: 'test::void', payload: {}, action: 'void' })
    assert.equal(result, undefined)
  })

  it('trigger sends invoke for remote function and resolves on result', async () => {
    worker = registerWorker('ws://localhost:9999/iii')
    MockWebSocket.simulateRegistered()
    getWs().sent.length = 0
    const promise = worker.trigger({ function_id: 'remote::fn', payload: { x: 1 } })
    assert.equal(getWs().sent.length, 1)
    const msg = JSON.parse(getWs().sent[0])
    assert.equal(msg.type, 'invoke')
    assert.equal(msg.function_id, 'remote::fn')
    assert.ok(msg.invocation_id)
    assert.deepEqual(msg.payload, { x: 1 })

    MockWebSocket.simulateMessage({
      type: 'invoke_result',
      invocation_id: msg.invocation_id,
      result: 'done',
    })
    const result = await promise
    assert.equal(result, 'done')
  })

  it('remote invoke error rejects promise', async () => {
    worker = registerWorker('ws://localhost:9999/iii')
    MockWebSocket.simulateRegistered()
    getWs().sent.length = 0
    const promise = worker.trigger({ function_id: 'remote::fail', payload: {} })
    const msg = JSON.parse(getWs().sent[0])
    MockWebSocket.simulateMessage({
      type: 'invoke_error',
      invocation_id: msg.invocation_id,
      error: 'something went wrong',
    })
    try {
      await promise
      assert.fail('should have thrown')
    } catch (err: any) {
      assert.equal(err.message, 'something went wrong')
    }
  })

  it('handles invoke from server by running local handler', async () => {
    worker = registerWorker('ws://localhost:9999/iii')
    MockWebSocket.simulateRegistered()
    worker.registerFunction('test::echo', async (p: any) => p)
    getWs().sent.length = 0
    MockWebSocket.simulateMessage({
      type: 'invoke',
      function_id: 'test::echo',
      invocation_id: 'inv-1',
      payload: { msg: 'hi' },
    })
    await new Promise((r) => setTimeout(r, 0))
    assert.equal(getWs().sent.length, 1)
    assert.deepEqual(JSON.parse(getWs().sent[0]), {
      type: 'invoke_result',
      invocation_id: 'inv-1',
      result: { msg: 'hi' },
    })
  })

  it('sends invoke_error when local handler throws', async () => {
    worker = registerWorker('ws://localhost:9999/iii')
    MockWebSocket.simulateRegistered()
    worker.registerFunction('test::fail', async () => {
      throw new Error('boom')
    })
    getWs().sent.length = 0
    MockWebSocket.simulateMessage({
      type: 'invoke',
      function_id: 'test::fail',
      invocation_id: 'inv-2',
      payload: {},
    })
    await new Promise((r) => setTimeout(r, 0))
    assert.equal(getWs().sent.length, 1)
    assert.deepEqual(JSON.parse(getWs().sent[0]), {
      type: 'invoke_error',
      invocation_id: 'inv-2',
      error: 'boom',
    })
  })

  it('sends invoke_error when handler not found for server invoke', () => {
    worker = registerWorker('ws://localhost:9999/iii')
    MockWebSocket.simulateRegistered()
    getWs().sent.length = 0
    MockWebSocket.simulateMessage({
      type: 'invoke',
      function_id: 'nope',
      invocation_id: 'inv-3',
      payload: {},
    })
    assert.equal(getWs().sent.length, 1)
    assert.deepEqual(JSON.parse(getWs().sent[0]), {
      type: 'invoke_error',
      invocation_id: 'inv-3',
      error: 'Function "nope" not found',
    })
  })

  it('onStream registers __stream__ handler', () => {
    worker = registerWorker('ws://localhost:9999/iii')
    MockWebSocket.simulateRegistered()
    let received: any = null
    worker.onStream((data: any) => {
      received = data
    })
    MockWebSocket.simulateMessage({ type: 'stream', event: 'set', data: 'hello' })
    assert.deepEqual(received, { type: 'stream', event: 'set', data: 'hello' })
  })

  it('shutdown closes WebSocket', () => {
    worker = registerWorker('ws://localhost:9999/iii')
    MockWebSocket.simulateOpen()
    let closeCalled = false
    const origClose = getWs().close.bind(getWs())
    getWs().close = () => {
      closeCalled = true
      origClose()
    }
    worker.shutdown()
    assert.ok(closeCalled)
  })

  it('shutdown prevents reconnect', () => {
    worker = registerWorker('ws://localhost:9999/iii')
    MockWebSocket.simulateOpen()
    worker.shutdown()
    const oncloseBefore = getWs().onclose
    getWs().onclose?.({ code: 1006, reason: 'abnormal', wasClean: false })
    assert.equal(getWs().onclose, oncloseBefore, 'reconnect timer should not be set after shutdown')
  })
})
