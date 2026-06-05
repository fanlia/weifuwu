import crypto from 'node:crypto'
import type { IIIModule, IIIOptions, Worker, TriggerOptions, FunctionRegistration, TriggerRegistration, WorkerRegistration, FunctionHandler, StreamSubscription } from './types.ts'
import { createStream } from './stream.ts'
import { createWsHandler } from './ws.ts'
import { buildRouter } from './rest.ts'

export function iii(opts: IIIOptions = {}): IIIModule {
  const stream = createStream({ pg: opts.pg, redis: opts.redis, streamTTL: opts.streamTTL })

  const workers = new Map<string, WorkerRegistration>()
  const functions = new Map<string, FunctionRegistration>()
  const triggers = new Map<string, TriggerRegistration>()
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()

  function registerBuiltin(id: string, handler: FunctionHandler) {
    functions.set(id, {
      id,
      handler,
      workerId: '__iii__',
      workerName: '__iii__',
      triggers: [],
    })
  }

  registerBuiltin('stream::set', (p: any) =>
    stream.set(p.stream_name, p.group_id, p.item_id, p.data))
  registerBuiltin('stream::get', (p: any) =>
    stream.get(p.stream_name, p.group_id, p.item_id))
  registerBuiltin('stream::delete', (p: any) =>
    stream.delete(p.stream_name, p.group_id, p.item_id))
  registerBuiltin('stream::list', (p: any) =>
    stream.list(p.stream_name, p.group_id))
  registerBuiltin('stream::list_groups', (p: any) =>
    stream.list_groups(p.stream_name))
  registerBuiltin('stream::list_all', () =>
    stream.list_all())
  registerBuiltin('stream::send', (p: any) =>
    stream.send(p.stream_name, p.group_id, p.type, p.data, p.id))
  registerBuiltin('stream::update', (p: any) =>
    stream.update(p.stream_name, p.group_id, p.item_id, p.ops))

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
        }, 30000)

        pending.set(invocationId, { resolve, reject, timer })

        worker.ws!.send(JSON.stringify({
          type: 'invoke',
          invocation_id: invocationId,
          function_id: id,
          payload,
        }))
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

  function removeWorker(workerId: string) {
    const reg = workers.get(workerId)
    if (!reg) return
    for (const fn of reg.functions) functions.delete(fn.id)
    for (const t of reg.triggers) triggers.delete(t.id)
    workers.delete(workerId)
  }

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
        worker.functions = worker.functions.filter(f => f.id !== id)
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
        worker.triggers = worker.triggers.filter(t => t.function_id !== functionId)
      }
    },
    addStreamSubscriber(ws, sub: StreamSubscription) {
      stream.subscribe(ws, sub)
    },
    removeStreamSubscriber(ws) {
      stream.unsubscribe(ws)
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
        ws.send(JSON.stringify({
          type: 'invoke_error', invocation_id: invocationId,
          error: `Function "${functionId}" not found`,
        }))
        return
      }
      const ctx = { engine: module as any, functionId, workerName: fn.workerName }
      Promise.resolve(fn.handler(payload, ctx))
        .then((result) => {
          ws.send(JSON.stringify({ type: 'invoke_result', invocation_id: invocationId, result }))
        })
        .catch((err) => {
          ws.send(JSON.stringify({ type: 'invoke_error', invocation_id: invocationId, error: err.message }))
        })
    },
  })

  const module: IIIModule = {
    router: () => { const r = buildRouter(module, wsHandler); (module as any).router = () => r; return r },
    wsHandler: () => wsHandler,
    addWorker: addLocalWorker,
    removeWorker: (worker: Worker) => {
      for (const [wid, reg] of workers) {
        if (reg.name === worker.name) { removeWorker(wid); return }
      }
    },
    trigger(request: import('./types.ts').TriggerRequest) {
      const fn = functions.get(request.function_id)
      if (!fn) throw new Error(`Function "${request.function_id}" not found`)
      const ctx = { engine: module, functionId: request.function_id, workerName: fn.workerName }
      if (request.action === 'void') {
        queueMicrotask(() => fn.handler(request.payload, ctx))
        return Promise.resolve(undefined)
      }
      return Promise.resolve(fn.handler(request.payload, ctx))
    },
    listWorkers: () => Array.from(workers.values()).map(w => ({
      id: w.id, name: w.name, status: 'connected' as const,
      connectedAt: Date.now(), functionCount: w.functions.length, triggerCount: w.triggers.length,
    })),
    listFunctions: () => Array.from(functions.values()).map(f => ({
      id: f.id, workerId: f.workerId, workerName: f.workerName, triggers: f.triggers,
    })),
    listTriggers: () => Array.from(triggers.values()).map(t => ({
      id: t.id, type: t.type, function_id: t.function_id, config: t.config, workerId: t.workerId,
    })),
    migrate: async () => {
      await stream.migrate()
    },
    shutdown: async () => {
      for (const [, p] of pending) { clearTimeout(p.timer); p.reject(new Error('Engine shutting down')) }
      pending.clear()
      for (const [, reg] of workers) reg.ws?.close()
      workers.clear(); functions.clear(); triggers.clear()
      await stream.close()
    },
  }

  return module
}
