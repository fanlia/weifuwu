/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Router } from '../router.ts'
import type { Closeable } from '../types.ts'
import type { PostgresClient } from '../postgres/types.ts'

/** A function handler receives a payload and returns a result. */
export type FunctionHandler = (payload: unknown, ctx: FunctionContext) => unknown | Promise<unknown>

export interface FunctionContext {
  engine: IIIModule
  functionId: string
  workerName: string
  user?: unknown
}

/** Optional metadata for a trigger — iii does NOT schedule triggers, just stores them for reference. */
export interface TriggerInput {
  type: string
  function_id: string
  config: Record<string, unknown>
}

export interface IIIOptions {
  pg?: PostgresClient
}

export interface TriggerRequest {
  function_id: string
  payload: unknown
  action?: 'sync' | 'void'
  timeout_ms?: number
}

/** III (跨进程函数调用) module — register remote workers and call functions across processes. */
export interface IIIModule extends Router, Closeable {
  wsHandler: () => any
  /** Register a local worker. Its functions become callable via trigger(). */
  addWorker: (worker: Worker) => void
  /** Call a function by ID. Returns the function's result. */
  trigger: (request: TriggerRequest) => Promise<unknown>
  /** Remove a previously registered worker. */
  removeWorker: (worker: Worker) => void
  /** List all registered workers. */
  listWorkers: () => WorkerInfo[]
  /** List all registered functions. */
  listFunctions: () => FunctionInfo[]
  /** List all registered trigger metadata. */
  listTriggers: () => TriggerInfo[]
  /** Create the database tables (currently no-op, kept for API compatibility). */
  migrate: () => Promise<void>
  /** Shutdown — reject pending invocations, disconnect all workers. */
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

/** A worker — a group of related functions. */
export interface Worker {
  readonly name: string
  /** Register a function that can be called remotely. */
  registerFunction: (
    id: string,
    handler: FunctionHandler,
    opts?: { description?: string },
  ) => Worker
  /** Unregister a function. */
  unregisterFunction: (id: string) => Worker
  /** Attach metadata (the module does NOT schedule — it's stored for introspection). */
  registerTrigger: (input: TriggerInput) => Worker
  /** Remove trigger metadata. */
  unregisterTrigger: (functionId: string) => Worker
  /** Get all registered functions. */
  getFunctions: () => { id: string; handler: FunctionHandler }[]
  /** Get all registered trigger metadata. */
  getTriggers: () => { id: string; input: TriggerInput }[]
}

/** A handle to interact with a remote worker from the client side. */
export interface RemoteWorker {
  registerFunction: (id: string, handler: FunctionHandler) => void
  unregisterFunction: (id: string) => void
  registerTrigger: (input: TriggerInput) => void
  unregisterTrigger: (functionId: string) => void
  trigger: (request: TriggerRequest) => Promise<unknown>
  close: () => void
}

// ── Internal types (not exported) ─────────────────────────────────────

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
