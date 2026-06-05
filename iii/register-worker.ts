import type { FunctionHandler, TriggerInput, TriggerRequest } from './types.ts'

const genId = () => globalThis.crypto.randomUUID()

export function registerWorker(url: string) {
  let ws: WebSocket | null = null
  let connected = false
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let intentionalClose = false

  const handlers = new Map<string, FunctionHandler>()
  const pendingQueue: object[] = []
  const pendingInvocations = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  const registeredFunctionIds = new Set<string>()
  const registeredTriggers = new Set<string>()

  let resolveReady: (() => void) | null = null
  let ready: Promise<void> | null = null

  function send(msg: object) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    } else {
      pendingQueue.push(msg)
    }
  }

  function flushPending() {
    for (const msg of pendingQueue) {
      ws?.send(JSON.stringify(msg))
    }
    pendingQueue.length = 0
  }

  function connect() {
    if (intentionalClose) return

    ws = new WebSocket(url)
    ready = new Promise((resolve) => { resolveReady = resolve })

    ws.onopen = () => {
      reconnectAttempt = 0
      send({ type: 'register_worker' })
    }

    ws.onmessage = (event: MessageEvent) => {
      let msg: any
      try {
        msg = JSON.parse(event.data as string)
      } catch {
        return
      }

      switch (msg.type) {
        case 'registered': {
          connected = true
          flushPending()
          resolveReady?.()
          break
        }

        case 'invoke': {
          const handler = handlers.get(msg.function_id)
          if (!handler) {
            ws?.send(JSON.stringify({
              type: 'invoke_error',
              invocation_id: msg.invocation_id,
              error: `Function "${msg.function_id}" not found`,
            }))
            return
          }
          Promise.resolve(handler(msg.payload, {} as any))
            .then((result) => {
              ws?.send(JSON.stringify({
                type: 'invoke_result', invocation_id: msg.invocation_id, result,
              }))
            })
            .catch((err) => {
              ws?.send(JSON.stringify({
                type: 'invoke_error', invocation_id: msg.invocation_id, error: err.message,
              }))
            })
          break
        }

        case 'invoke_result': {
          const p = pendingInvocations.get(msg.invocation_id)
          if (p) {
            clearTimeout(p.timer)
            p.resolve(msg.result)
            pendingInvocations.delete(msg.invocation_id)
          }
          break
        }

        case 'invoke_error': {
          const p = pendingInvocations.get(msg.invocation_id)
          if (p) {
            clearTimeout(p.timer)
            p.reject(new Error(msg.error))
            pendingInvocations.delete(msg.invocation_id)
          }
          break
        }

        case 'stream': {
          const handler = handlers.get('__stream__')
          if (handler) handler(msg, {} as any)
          break
        }
      }
    }

    ws.onclose = () => {
      connected = false
      if (!intentionalClose) {
        const delay = Math.min(1000 * 2 ** reconnectAttempt, 30000)
        reconnectAttempt++
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    ws.onerror = () => {}
  }

  connect()

  return {
    registerFunction(id: string, handler: FunctionHandler) {
      handlers.set(id, handler)
      registeredFunctionIds.add(id)
      send({ type: 'register_function', id })
    },

    unregisterFunction(id: string) {
      handlers.delete(id)
      registeredFunctionIds.delete(id)
      send({ type: 'unregister_function', id })
    },

    registerTrigger(input: TriggerInput) {
      registeredTriggers.add(JSON.stringify(input))
      send({ type: 'register_trigger', function_id: input.function_id, trigger_type: input.type, config: input.config })
    },

    unregisterTrigger(functionId: string) {
      for (const key of registeredTriggers) {
        try { const parsed = JSON.parse(key); if (parsed.function_id === functionId) { registeredTriggers.delete(key); break } } catch {}
      }
      send({ type: 'unregister_trigger', function_id: functionId })
    },

    trigger(request: TriggerRequest) {
      const fn = handlers.get(request.function_id)
      if (fn) {
        const ctx = { engine: {} as any, functionId: request.function_id, workerName: 'local' }
        if (request.action === 'void') {
          queueMicrotask(() => fn(request.payload, ctx))
          return Promise.resolve(undefined)
        }
        return Promise.resolve(fn(request.payload, ctx))
      }

      return new Promise((resolve, reject) => {
        const invocationId = genId()
        const timer = setTimeout(() => {
          pendingInvocations.delete(invocationId)
          reject(new Error(`Invocation timed out for "${request.function_id}"`))
        }, request.timeout_ms || 30000)

        pendingInvocations.set(invocationId, { resolve, reject, timer })
        send({
          type: 'invoke',
          invocation_id: invocationId,
          function_id: request.function_id,
          payload: request.payload,
        })
      })
    },

    onStream(handler: (data: any) => void) {
      handlers.set('__stream__', handler as FunctionHandler)
    },

    shutdown() {
      intentionalClose = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
      ws = null
    },
  }
}
