import type { z } from 'zod'

export type NodeType = 'eval' | 'set' | 'get' | 'if' | 'while' | 'call' | 'http'

export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string
  description: string
  inputSchema: z.ZodSchema<TInput>
  execute: (input: TInput, ctx: ToolContext) => Promise<TOutput>
}

export interface ToolContext {
  workflowId?: string
  nodeId: string
  onStream?: (event: StreamEvent) => Promise<void>
}

export interface StreamEvent {
  type: string
  chunk?: string
  accumulated?: string
  [key: string]: unknown
}

export interface Node {
  id: string
  tool: NodeType | string
  input: Record<string, unknown>
  conditions?: Condition[]
  body?: Node[]
}

export interface Condition {
  test: string | boolean
  body: Node[]
}

export interface Workflow {
  name?: string
  nodes: Node[]
  functions?: Record<string, SubWorkflow>
}

export interface SubWorkflow {
  inputSchema: Record<string, unknown>
  workflow: { nodes: Node[] }
}

export interface WorkflowState {
  workflowId: string
  status: 'running' | 'completed' | 'error'
  goal: string
  result?: unknown
  error?: string
  startTime: number
  endTime?: number
}

export interface SSEEvent {
  event: string
  data: unknown
}

export interface ExecuteOptions {
  initialInput?: Record<string, unknown>
  maxSteps?: number
}

export interface WorkflowContext {
  variables: Map<string, unknown>
  nodeOutputs: Map<string, unknown>
  functions: Record<string, SubWorkflow>
  stepCount: number
  maxSteps: number
  input: Record<string, unknown>
  toolRegistry: Map<string, Tool>
  sseManager?: SSEManager
  workflowId?: string
  onNodeEvent?: (event: SSEEvent) => void
}

export interface SSEManager {
  createStream: (workflowId: string) => ReadableStream<Uint8Array>
  send: (workflowId: string, event: SSEEvent) => void
  close: (workflowId: string) => void
}

export interface EngineOptions {
  tools: Record<string, Tool>
  model?: unknown
  sseManager?: SSEManager
}

export interface WorkflowEngine {
  execute: (workflow: Workflow, options?: ExecuteOptions) => Promise<unknown>
  getState: (workflowId: string) => WorkflowState | undefined
  runAsync: (workflowId: string, workflow: Workflow, options?: ExecuteOptions) => Promise<void>
  generateWorkflow: (goal: string) => Promise<Workflow>
}
