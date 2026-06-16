export { iii } from './client.ts'
export { createWorker } from './worker.ts'
export { registerWorker } from './register-worker.ts'
export type {
  IIIModule,
  IIIOptions,
  Worker,
  WorkerInfo,
  FunctionInfo,
  TriggerInfo,
  FunctionHandler,
  FunctionContext,
  TriggerInput,
  RemoteWorker,
} from './types.ts'

// stream.ts was removed in v0.25 — iii is now focused on function invocation only.
// For streaming data, use Redis directly or the queue module.
