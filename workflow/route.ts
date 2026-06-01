import crypto from 'node:crypto'
import { Router } from '../router.ts'
import { createWorkflowEngine, createSSEManager, tool } from './index.ts'
import type { Tool as WfTool } from './types.ts'
import type { generateText } from '../vendor.ts'

export interface WorkflowOptions {
  tools: Record<string, WfTool<any, any>>
  model?: Parameters<typeof generateText>[0]['model']
  stream?: boolean
}

export type WorkflowHandler = (
  req: Request,
  ctx: Context,
) => WorkflowOptions | Promise<WorkflowOptions>

import type { Context } from '../types.ts'

type WorkflowNode = import('./types.ts').Node
type WorkflowDef = import('./types.ts').Workflow

export function workflow(handler: WorkflowHandler): Router {
  const r = new Router()
  const sseManager = createSSEManager()

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

  r.post('/', async (req, ctx) => {
    const options = await handler(req, ctx)
    const engine = createWorkflowEngine({
      tools: options.tools,
      model: options.model,
      sseManager: options.stream ? sseManager : undefined,
    })

    const body = await req.json() as Record<string, unknown>
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
