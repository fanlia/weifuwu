import type { Router } from '../router.ts'
import type { Redis } from '../vendor.ts'
import type { PostgresClient } from '../postgres/types.ts'

export type FunctionHandler = (
  payload: unknown,
  ctx: FunctionContext,
) => unknown | Promise<unknown>

export interface FunctionContext {
  engine: IIIModule
  functionId: string
  workerName: string
  triggerId?: string
  user?: unknown
}

export interface TriggerInput {
  type: string
  function_id: string
  config: Record<string, unknown>
}

export interface IIIOptions {
  pg?: PostgresClient
  redis?: Redis
  /** TTL in seconds for Redis stream keys. Default: 3600 (1 hour). Set to 0 for no expiration. */
  streamTTL?: number
}

export interface TriggerRequest {
  function_id: string
  payload: unknown
  action?: 'sync' | 'void'
  timeout_ms?: number
}

export interface TriggerOptions {
  action?: 'sync' | 'void'
  timeout_ms?: number
}

export interface IIIModule extends Router {
  wsHandler: () => any
  addWorker: (worker: Worker) => void
  trigger: (request: TriggerRequest) => Promise<unknown>
  removeWorker: (worker: Worker) => void
  listWorkers: () => WorkerInfo[]
  listFunctions: () => FunctionInfo[]
  listTriggers: () => TriggerInfo[]
  migrate: () => Promise<void>
  shutdown: () => Promise<void>
  /** Alias for shutdown(). */
  close: () => Promise<void>
}

export interface WorkerInfo {
  id: string
  name: string
  status: 'connected' | 'disconnected'
  connectedAt: number
  functionCount: number
  triggerCount: number
}

export interface FunctionInfo {
  id: string
  workerId: string
  workerName: string
  triggers: string[]
}

export interface TriggerInfo {
  id: string
  type: string
  function_id: string
  config: Record<string, unknown>
  workerId: string
}

export interface Worker {
  readonly name: string
  registerFunction: (id: string, handler: FunctionHandler, opts?: { description?: string }) => Worker
  unregisterFunction: (id: string) => Worker
  registerTrigger: (input: TriggerInput) => Worker
  unregisterTrigger: (functionId: string) => Worker
  getFunctions: () => { id: string; handler: FunctionHandler }[]
  getTriggers: () => { id: string; input: TriggerInput }[]
}

export interface RemoteWorker {
  registerFunction: (id: string, handler: FunctionHandler) => void
  unregisterFunction: (id: string) => void
  registerTrigger: (input: TriggerInput) => void
  unregisterTrigger: (functionId: string) => void
  trigger: (request: TriggerRequest) => Promise<unknown>
  shutdown: () => void
}

export interface FunctionRegistration {
  id: string
  handler: FunctionHandler
  workerId: string
  workerName: string
  triggers: string[]
}

export interface TriggerRegistration {
  id: string
  type: string
  function_id: string
  config: Record<string, unknown>
  workerId: string
}

export interface WorkerRegistration {
  id: string
  name: string
  ws?: WebSocket
  functions: FunctionRegistration[]
  triggers: TriggerRegistration[]
}

export type StreamUpdateOp =
  | { op: 'set'; value: unknown }
  | { op: 'merge'; value: Record<string, unknown> }
  | { op: 'increment'; value: number }
  | { op: 'decrement'; value: number }
  | { op: 'append'; value: unknown }
  | { op: 'remove' }

export interface StreamSubscription {
  stream_name: string
  group_id?: string
  item_id?: string
}
