/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * iii — distributed function execution engine.
 *
 * Register workers (local or remote via WebSocket) and call their functions
 * across processes. No message queue, no scheduler — just function invocation.
 *
 * ```ts
 * import { iii, createWorker } from 'weifuwu'
 *
 * const engine = iii()
 * const w = createWorker('orders')
 *   .registerFunction('orders::create', async (payload) => {
 *     return db.query('INSERT INTO orders ...', [payload.items])
 *   })
 * engine.addWorker(w)
 *
 * // Call the function
 * const result = await engine.trigger({
 *   function_id: 'orders::create',
 *   payload: { items: ['apple'] },
 * })
 * ```
 */
import crypto from 'node:crypto'
import type {
  IIIModule,
  IIIOptions,
  Worker,
  FunctionRegistration,
  TriggerRegistration,
  WorkerRegistration,
  FunctionHandler,
} from './types.ts'
import { createWsHandler } from './ws.ts'
import { buildRouter } from './rest.ts'

export function iii(_opts: IIIOptions = {}): IIIModule {
  const workers = new Map<string, WorkerRegistration>()
  const functions = new Map<string, FunctionRegistration>()
  const triggers = new Map<string, TriggerRegistration>()
  const pending = new Map<
    string,
    {
      resolve: (v: unknown) => void
      reject: (e: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()

  // ── Local worker registration ──────────────────────────────────────

  function addLocalWorker(worker: Worker) {
    const workerId = crypto.randomUUID()
    const reg: WorkerRegistration = {
      id: workerId,
      name: worker.name,
      functions: [],
      triggers: [],
    }

    for (const fn of worker.getFunctions()) {
      if (functions.has(fn.id)) {
        const existing = functions.get(fn.id)!
        throw new Error(`Function "${fn.id}" already registered by worker "${existing.workerName}"`)
      }

      const triggerIds: string[] = []
      for (const t of worker.getTriggers()) {
        if (t.input.function_id === fn.id) {
          const tid = crypto.randomUUID()
          triggers.set(tid, {
            id: tid,
            type: t.input.type,
            function_id: t.input.function_id,
            config: t.input.config,
            workerId,
          })
          reg.triggers.push(triggers.get(tid)!)
          triggerIds.push(tid)
        }
      }

      const fnReg: FunctionRegistration = {
        id: fn.id,
        handler: fn.handler,
        workerId,
        workerName: worker.name,
        triggers: triggerIds,
      }
      functions.set(fn.id, fnReg)
      reg.functions.push(fnReg)
    }

    workers.set(workerId, reg)
  }

  // ── Remote worker function registration (from WS) ──────────────────

  function addRemoteFunction(workerId: string, id: string) {
    const worker = workers.get(workerId)
    if (!worker) return

    const handler: FunctionHandler = async (payload) => {
      if (!worker.ws) throw new Error(`Worker "${worker.name}" disconnected`)

      const invocationId = crypto.randomUUID()
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(invocationId)
          reject(new Error(`Invocation timed out for "${id}"`))
        }, 30_000)

        pending.set(invocationId, { resolve, reject, timer })

        worker.ws!.send(
          JSON.stringify({
            type: 'invoke',
            invocation_id: invocationId,
            function_id: id,
            payload,
          }),
        )
      })
    }

    const fnReg = {
      id,
      handler,
      workerId,
      workerName: worker.name,
      triggers: [],
    }
    functions.set(id, fnReg)
    worker.functions.push(fnReg)
  }

  // ── Worker removal ─────────────────────────────────────────────────

  function removeWorker(workerId: string) {
    const reg = workers.get(workerId)
    if (!reg) return
    for (const fn of reg.functions) functions.delete(fn.id)
    for (const t of reg.triggers) triggers.delete(t.id)
    workers.delete(workerId)
  }

  // ── WS handler ─────────────────────────────────────────────────────

  let engineRef: any = null

  const wsHandler = createWsHandler({
    registerRemoteWorker(ws, name) {
      const id = crypto.randomUUID()
      workers.set(id, { id, name, ws, functions: [], triggers: [] })
      return id
    },
    unregisterRemoteWorker(workerId) {
      removeWorker(workerId)
    },
    registerRemoteFunction(workerId, id) {
      addRemoteFunction(workerId, id)
    },
    registerRemoteTrigger(workerId, input) {
      const tid = crypto.randomUUID()
      const reg: TriggerRegistration = { id: tid, ...input, workerId }
      triggers.set(tid, reg)
      const worker = workers.get(workerId)
      if (worker) worker.triggers.push(reg)
    },
    unregisterRemoteFunction(workerId, id) {
      functions.delete(id)
      const worker = workers.get(workerId)
      if (worker) {
        worker.functions = worker.functions.filter((f) => f.id !== id)
      }
    },
    unregisterRemoteTrigger(workerId, functionId) {
      for (const [tid, t] of triggers) {
        if (t.function_id === functionId && t.workerId === workerId) {
          triggers.delete(tid)
          break
        }
      }
      const worker = workers.get(workerId)
      if (worker) {
        worker.triggers = worker.triggers.filter((t) => t.function_id !== functionId)
      }
    },
    handleInvokeResult(invocationId, result) {
      const p = pending.get(invocationId)
      if (p) {
        clearTimeout(p.timer)
        p.resolve(result)
        pending.delete(invocationId)
      }
    },
    handleInvokeError(invocationId, error) {
      const p = pending.get(invocationId)
      if (p) {
        clearTimeout(p.timer)
        p.reject(new Error(error))
        pending.delete(invocationId)
      }
    },
    handleInvoke(ws, invocationId, functionId, payload) {
      const fn = functions.get(functionId)
      if (!fn) {
        ws.send(
          JSON.stringify({
            type: 'invoke_error',
            invocation_id: invocationId,
            error: `Function "${functionId}" not found`,
          }),
        )
        return
      }
      const ctx = { engine: engineRef, functionId, workerName: fn.workerName }
      Promise.resolve(fn.handler(payload, ctx))
        .then((result) => {
          ws.send(JSON.stringify({ type: 'invoke_result', invocation_id: invocationId, result }))
        })
        .catch((err) => {
          ws.send(
            JSON.stringify({
              type: 'invoke_error',
              invocation_id: invocationId,
              error: err.message,
            }),
          )
        })
    },
  })

  // ── Public API ─────────────────────────────────────────────────────

  function removeWorkerByName(worker: Worker) {
    for (const [wid, reg] of workers) {
      if (reg.name === worker.name) {
        removeWorker(wid)
        return
      }
    }
  }

  function trigger(request: import('./types.ts').TriggerRequest): Promise<unknown> {
    const fn = functions.get(request.function_id)
    if (!fn) return Promise.reject(new Error(`Function "${request.function_id}" not found`))
    const ctx = { engine: engineRef, functionId: request.function_id, workerName: fn.workerName }
    if (request.action === 'void') {
      queueMicrotask(() => fn.handler(request.payload, ctx))
      return Promise.resolve(undefined)
    }
    return Promise.resolve(fn.handler(request.payload, ctx))
  }

  function listWorkers() {
    return Array.from(workers.values()).map((w) => ({
      id: w.id,
      name: w.name,
      status: 'connected' as const,
      connectedAt: Date.now(),
      functionCount: w.functions.length,
      triggerCount: w.triggers.length,
    }))
  }

  function listFunctions() {
    return Array.from(functions.values()).map((f) => ({
      id: f.id,
      workerId: f.workerId,
      workerName: f.workerName,
      triggers: f.triggers,
    }))
  }

  function listTriggers() {
    return Array.from(triggers.values()).map((t) => ({
      id: t.id,
      type: t.type,
      function_id: t.function_id,
      config: t.config,
      workerId: t.workerId,
    }))
  }

  const routerMethods = { listWorkers, listFunctions, listTriggers, trigger }
  const r = buildRouter(routerMethods as any, wsHandler)
  engineRef = r

  const mod = r as IIIModule
  mod.wsHandler = () => wsHandler
  mod.addWorker = addLocalWorker
  mod.removeWorker = removeWorkerByName
  mod.trigger = trigger
  mod.listWorkers = listWorkers
  mod.listFunctions = listFunctions
  mod.listTriggers = listTriggers
  mod.migrate = async () => {}
  mod.close = async () => {
    for (const [, p] of pending) {
      clearTimeout(p.timer)
      p.reject(new Error('Engine shutting down'))
    }
    pending.clear()
    for (const [, reg] of workers) reg.ws?.close()
    workers.clear()
    functions.clear()
    triggers.clear()
  }
  return mod
}
