/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Context } from '../types.ts'

interface WsHandlerDeps {
  registerRemoteWorker: (ws: WebSocket, name: string) => string
  unregisterRemoteWorker: (workerId: string) => void
  registerRemoteFunction: (workerId: string, id: string) => void
  unregisterRemoteFunction: (workerId: string, id: string) => void
  registerRemoteTrigger: (
    workerId: string,
    input: { type: string; function_id: string; config: Record<string, unknown> },
  ) => void
  unregisterRemoteTrigger: (workerId: string, functionId: string) => void
  handleInvokeResult: (invocationId: string, result: unknown) => void
  handleInvokeError: (invocationId: string, error: string) => void
  handleInvoke: (ws: WebSocket, invocationId: string, functionId: string, payload: unknown) => void
}

export function createWsHandler(deps: WsHandlerDeps) {
  const wsToWorkerId = new Map<WebSocket, string>()

  function getWorkerId(ws: WebSocket): string {
    return wsToWorkerId.get(ws) || ''
  }

  return {
    open(_ws: WebSocket, _ctx: Context) {},

    async message(ws: WebSocket, ctx: Context, data: string | Buffer) {
      let msg: any
      try {
        msg = JSON.parse(data.toString())
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }))
        return
      }

      switch (msg.type) {
        case 'register_worker': {
          const workerId = deps.registerRemoteWorker(ws, msg.worker_name || `remote-${Date.now()}`)
          wsToWorkerId.set(ws, workerId)
          ws.send(JSON.stringify({ type: 'registered', worker_id: workerId }))
          break
        }

        case 'register_function': {
          const workerId = getWorkerId(ws)
          if (workerId) deps.registerRemoteFunction(workerId, msg.id)
          break
        }

        case 'register_trigger': {
          const workerId = getWorkerId(ws)
          if (workerId) {
            deps.registerRemoteTrigger(workerId, {
              type: msg.input?.type || 'custom',
              function_id: msg.input?.function_id || msg.id,
              config: msg.input?.config || {},
            })
          }
          break
        }

        case 'unregister_function': {
          const workerId = getWorkerId(ws)
          if (workerId) deps.unregisterRemoteFunction(workerId, msg.id)
          break
        }

        case 'unregister_trigger': {
          const workerId = getWorkerId(ws)
          if (workerId) deps.unregisterRemoteTrigger(workerId, msg.function_id || msg.id)
          break
        }

        case 'invoke_result': {
          deps.handleInvokeResult(msg.invocation_id, msg.result)
          break
        }

        case 'invoke_error': {
          deps.handleInvokeError(msg.invocation_id, msg.error)
          break
        }

        case 'invoke': {
          deps.handleInvoke(ws, msg.invocation_id, msg.function_id, msg.payload)
          break
        }

        default:
          ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }))
      }
    },

    close(ws: WebSocket) {
      const workerId = getWorkerId(ws)
      if (workerId) {
        deps.unregisterRemoteWorker(workerId)
        wsToWorkerId.delete(ws)
      }
    },
  }
}
