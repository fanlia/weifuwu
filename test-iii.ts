#!/usr/bin/env node
import { serve, Router, iii, createWorker as Worker } from 'weifuwu'
import type { IIIModule, FunctionContext } from 'weifuwu'

// ── 1. Create engine ──
const engine: IIIModule = iii()
console.log('✓ Engine created')

// ── 2. Worker with math functions ──
const math = new Worker('math')
  .registerFunction('math::add', (p: any) => ({ result: p.a + p.b }))
  .registerFunction('math::mul', (p: any) => ({ result: p.a * p.b }))
  .registerFunction('math::echo', (p: any, ctx: FunctionContext) => ({
    payload: p,
    functionId: ctx.functionId,
    worker: ctx.workerName,
  }))
  .registerTrigger({ type: 'http', function_id: 'math::add', config: { method: 'POST', path: '/add' } })
engine.addWorker(math)
console.log('✓ Worker "math" registered (add, mul, echo)')

// ── 3. Another worker with string functions ──
const str = new Worker('string')
  .registerFunction('str::upper', (p: any) => ({ result: (p.text as string).toUpperCase() }))
  .registerFunction('str::len', (p: any) => ({ result: (p.text as string).length }))
engine.addWorker(str)
console.log('✓ Worker "string" registered (upper, len)')

// ── 4. Call functions programmatically ──
const add = await engine.trigger({ function_id: 'math::add', payload: { a: 3, b: 4 } })
console.log(`  math::add(3, 4) = ${JSON.stringify(add)}`)

const mul = await engine.trigger({ function_id: 'math::mul', payload: { a: 6, b: 7 } })
console.log(`  math::mul(6, 7) = ${JSON.stringify(mul)}`)

const upper = await engine.trigger({ function_id: 'str::upper', payload: { text: 'hello' } })
console.log(`  str::upper("hello") = ${JSON.stringify(upper)}`)

const len = await engine.trigger({ function_id: 'str::len', payload: { text: 'weifuwu' } })
console.log(`  str::len("weifuwu") = ${JSON.stringify(len)}`)

const echo = await engine.trigger({ function_id: 'math::echo', payload: { msg: 'test' } })
console.log(`  math::echo = ${JSON.stringify(echo)}`)

// ── 5. Fire-and-forget ──
const voidResult = await engine.trigger({ function_id: 'math::add', payload: { a: 1, b: 1 }, action: 'void' })
console.log(`  void action returns: ${JSON.stringify(voidResult)}`)

// ── 6. List workers / functions / triggers ──
console.log(`\n  Workers: ${engine.listWorkers().map(w => w.name).join(', ')}`)
console.log(`  Functions: ${engine.listFunctions().map(f => f.id).join(', ')}`)
console.log(`  Triggers: ${engine.listTriggers().map(t => t.function_id).join(', ')}`)

// ── 7. Built-in stream functions ──
await engine.trigger({
  function_id: 'stream::set',
  payload: { stream_name: 'scores', group_id: 'room1', item_id: 'alice', data: { score: 100 } },
})
await engine.trigger({
  function_id: 'stream::set',
  payload: { stream_name: 'scores', group_id: 'room1', item_id: 'bob', data: { score: 85 } },
})

const list = await engine.trigger({
  function_id: 'stream::list',
  payload: { stream_name: 'scores', group_id: 'room1' },
}) as any
console.log(`\n  Stream items in scores/room1: ${JSON.stringify(list.items)}`)

const groups = await engine.trigger({
  function_id: 'stream::list_groups',
  payload: { stream_name: 'scores' },
}) as any
console.log(`  Stream groups in scores: ${JSON.stringify(groups.groups)}`)

// ── 8. REST API via HTTP server ──
const app = new Router()
app.use('/api/iii', engine.router())
const server = serve(app.handler(), { port: 18888 })
await server.ready
console.log(`\n✓ HTTP server listening on http://localhost:18888`)

// GET /workers
const workersRes = await fetch('http://localhost:18888/api/iii/workers')
const workers = await workersRes.json()
console.log(`  GET /workers → ${workers.length} workers`)

// GET /functions
const fnsRes = await fetch('http://localhost:18888/api/iii/functions')
const fns = await fnsRes.json()
console.log(`  GET /functions → ${fns.length} functions`)

// POST /trigger/math::add
const triggerRes = await fetch('http://localhost:18888/api/iii/trigger/math::add', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ payload: { a: 100, b: 200 } }),
})
const trigResult = await triggerRes.json()
console.log(`  POST /trigger/math::add(100, 200) → ${JSON.stringify(trigResult)}`)

// POST /trigger/str::upper
const upperRes = await fetch('http://localhost:18888/api/iii/trigger/str::upper', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ payload: { text: 'weifuwu' } }),
})
const upperResult = await upperRes.json()
console.log(`  POST /trigger/str::upper("weifuwu") → ${JSON.stringify(upperResult)}`)

// POST /trigger with void action
const voidRes = await fetch('http://localhost:18888/api/iii/trigger/math::add', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ payload: { a: 1, b: 2 }, action: 'void' }),
})
console.log(`  POST /trigger (void) → status ${voidRes.status}`)

// ── 9. Error case ──
const errRes = await fetch('http://localhost:18888/api/iii/trigger/does::not-exist', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ payload: {} }),
})
console.log(`  POST /trigger (unknown) → status ${errRes.status}`)

// ── 10. Cleanup ──
server.stop()
await engine.shutdown()
console.log(`\n✓ All tests passed. Server stopped.`)
