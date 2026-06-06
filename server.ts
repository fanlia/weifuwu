import { serve } from './serve.ts'
import { Router } from './router.ts'
import { iii, createWorker } from './iii/index.ts'

// Create the iii engine
const engine = iii()

// Register a local worker with functions
const worker = createWorker('demo')
worker.registerFunction('demo::hello', async (payload: any) => {
  return { message: `Hello, ${payload.name || 'world'}!` }
})
worker.registerFunction('demo::echo', async (payload: any) => {
  return payload
})
worker.registerTrigger({ type: 'http', function_id: 'demo::hello', config: { method: 'POST', path: '/hello' } })
engine.addWorker(worker)

// Mount iii router onto a parent Router under /iii
const app = new Router()

// Add some top-level routes
app.get('/', () => new Response('Home'))
app.get('/health', () => Response.json({ status: 'ok' }))

// Mount iii under /iii — all iii routes are now prefixed
app.use('/iii', engine)

// Also expose iii directly at root for comparison
// app.use('/', engine)

const server = serve(app.handler(), {
  port: +process.env.PORT! || 3000,
  websocket: app.websocketHandler(),
})

await server.ready
console.log(`Server running at http://localhost:${server.port}`)
console.log('')
console.log('Top-level routes:')
console.log(`  GET  http://localhost:${server.port}/`)
console.log(`  GET  http://localhost:${server.port}/health`)
console.log('')
console.log('III routes (mounted under /iii):')
console.log(`  GET  http://localhost:${server.port}/iii/workers`)
console.log(`  GET  http://localhost:${server.port}/iii/functions`)
console.log(`  POST http://localhost:${server.port}/iii/trigger/demo::hello`)
console.log(`  WS   ws://localhost:${server.port}/iii/worker`)
