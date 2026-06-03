import type { FunctionHandler, TriggerInput, Worker } from './types.ts'

export function createWorker(name: string): Worker {
  const functions = new Map<string, FunctionHandler>()
  const triggers = new Map<string, TriggerInput>()

  return {
    name,

    registerFunction(id: string, handler: FunctionHandler) {
      functions.set(id, handler)
      return this
    },

    unregisterFunction(id: string) {
      functions.delete(id)
      return this
    },

    registerTrigger(input: TriggerInput) {
      triggers.set(input.function_id, input)
      return this
    },

    unregisterTrigger(functionId: string) {
      triggers.delete(functionId)
      return this
    },

    getFunctions() {
      return Array.from(functions.entries()).map(([id, handler]) => ({ id, handler }))
    },

    getTriggers() {
      return Array.from(triggers.entries()).map(([id, input]) => ({ id, input }))
    },
  }
}
