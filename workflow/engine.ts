import type { Tool, Workflow, WorkflowContext, WorkflowState, WorkflowEngine, ExecuteOptions, SSEManager } from './types.ts'
import { executeNode } from './nodes.ts'
import { generateWorkflow as llmGenerate } from './llm.ts'
import { generateText } from 'ai'
import type { LanguageModel } from '../vendor.ts'

export function createWorkflowEngine(options: {
  tools: Record<string, Tool<any, any>>
  sseManager?: SSEManager
  model?: LanguageModel
}): WorkflowEngine {
  const toolRegistry = new Map<string, Tool<any, any>>()

  for (const [key, t] of Object.entries(options.tools)) {
    t.name = t.name || key
    toolRegistry.set(t.name, t)
  }

  const states = new Map<string, WorkflowState>()

  async function execute(workflow: Workflow, opts?: ExecuteOptions & { workflowId?: string }): Promise<unknown> {
    const ctx: WorkflowContext = {
      variables: new Map(),
      nodeOutputs: new Map(),
      functions: workflow.functions ?? {},
      stepCount: 0,
      maxSteps: opts?.maxSteps ?? 1000,
      input: opts?.initialInput ?? {},
      toolRegistry,
      sseManager: options.sseManager,
      workflowId: opts?.workflowId,
    }

    let lastOutput: unknown = undefined

    for (const node of workflow.nodes) {
      ctx.stepCount++
      if (ctx.stepCount > ctx.maxSteps) {
        throw new Error(`Step limit exceeded (${ctx.maxSteps})`)
      }

      options.sseManager?.send(ctx.workflowId ?? '', { event: 'node-start', data: { nodeId: node.id, tool: node.tool, input: node.input } })

      const output = await executeNode(node, ctx)
      ctx.nodeOutputs.set(node.id, output)
      lastOutput = output

      options.sseManager?.send(ctx.workflowId ?? '', { event: 'node-end', data: { nodeId: node.id, output } })
    }

    return lastOutput
  }

  async function runAsync(workflowId: string, workflow: Workflow, opts?: ExecuteOptions): Promise<void> {
    const state: WorkflowState = {
      workflowId,
      status: 'running',
      goal: workflow.name ?? '',
      startTime: Date.now(),
    }
    states.set(workflowId, state)

    const sse = options.sseManager
    sse?.send(workflowId, { event: 'workflow-start', data: { workflowId, goal: state.goal } })

    try {
      const result = await execute(workflow, { ...opts, workflowId })
      state.status = 'completed'
      state.result = result
      state.endTime = Date.now()
      sse?.send(workflowId, { event: 'complete', data: { result, duration: state.endTime - state.startTime } })
    } catch (err) {
      state.status = 'error'
      state.error = err instanceof Error ? err.message : String(err)
      state.endTime = Date.now()
      sse?.send(workflowId, { event: 'error', data: { error: state.error } })
    } finally {
      sse?.close(workflowId)
    }
  }

  async function generateWorkflow(goal: string): Promise<Workflow> {
    if (!options.model) {
      throw new Error('LLM model is required for generateWorkflow. Pass "model" to createWorkflowEngine.')
    }
    return llmGenerate(goal, options.tools, async (prompt) => {
      const result = await generateText({
        model: options.model!,
        system: prompt.system,
        messages: prompt.messages as any,
      })
      return { text: result.text }
    })
  }

  return {
    execute,
    runAsync,
    generateWorkflow,
    getState(workflowId: string): WorkflowState | undefined {
      return states.get(workflowId)
    },
  }
}
