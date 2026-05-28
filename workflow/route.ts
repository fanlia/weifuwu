import { Router } from '../router.ts'
import { createWorkflowEngine, createSSEManager } from './index.ts'
import type { Tool as WfTool } from './types.ts'
import type { generateText } from 'ai'

export function workflow(options: {
  tools: Record<string, WfTool>
  model?: Parameters<typeof generateText>[0]['model']
  stream?: boolean
}): Router {
  const r = new Router()
  const sseManager = options.stream ? createSSEManager() : undefined

  if (options.stream && sseManager) {
    r.get('/:workflowId/events', async (req, ctx) => {
      const stream = sseManager.createStream(ctx.params.workflowId)
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    })
  }

  r.post('/', async (req) => {
    const body = await req.json() as Record<string, unknown>
    const engine = createWorkflowEngine({
      tools: options.tools,
      model: options.model,
      sseManager,
    })

    type WorkflowNode = import('./types.ts').Node
    type WorkflowDef = import('./types.ts').Workflow
    let wf: WorkflowDef

    if (body.goal && options.model) {
      wf = await engine.generateWorkflow(body.goal as string)
    } else if (body.workflow) {
      wf = body.workflow as WorkflowDef
    } else if (body.nodes) {
      wf = { nodes: body.nodes as WorkflowNode[] }
    } else {
      return Response.json(
        { error: 'Provide "goal" (with model) or "workflow"/"nodes"' },
        { status: 400 },
      )
    }

    if (options.stream && sseManager) {
      const workflowId = crypto.randomUUID()
      engine.runAsync(workflowId, wf)
      return Response.json({ workflowId, eventsUrl: `/${workflowId}/events` })
    }

    const result = await engine.execute(wf)
    return Response.json({ workflow: wf, result })
  })

  return r
}
