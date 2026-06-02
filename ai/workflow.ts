import { tool, generateText } from 'ai'
import { z } from 'zod'
import type { LanguageModel } from 'ai'

// ── Reference resolution (from old workflow/reference.ts) ──

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function getByPath(obj: unknown, path: string[]): unknown {
  let current = obj
  for (const key of path) {
    if (DANGEROUS_KEYS.has(key)) return undefined
    if (current === null || current === undefined) return undefined
    if (typeof current === 'object' && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key]
    } else { return undefined }
  }
  return current
}

function resolveRef(path: string, ctx: {
  variables: Map<string, unknown>
  nodeOutputs: Map<string, unknown>
  input: Record<string, unknown>
}): unknown {
  if (path.startsWith('$nodes.')) {
    const after = path.slice(7)
    const dot = after.indexOf('.')
    if (dot === -1) return ctx.nodeOutputs.get(after)
    const id = after.slice(0, dot)
    const propPath = after.slice(dot + 1)
    const output = ctx.nodeOutputs.get(id)
    if (output === undefined) throw new Error(`Node "${id}" has no output yet`)
    return getByPath(output, propPath.startsWith('output') ? propPath.slice(7).split('.').filter(Boolean) : propPath.split('.'))
  }
  if (path.startsWith('$var.')) {
    const name = path.slice(5)
    if (!ctx.variables.has(name)) throw new Error(`Variable "${name}" is not defined`)
    return ctx.variables.get(name)
  }
  if (path.startsWith('$input.')) return ctx.input[path.slice(7)]
  if (path === 'true') return true
  if (path === 'false') return false
  if (path === 'null') return null
  const num = Number(path)
  if (!isNaN(num) && path.trim() !== '') return num
  return path
}

function resolveValue(v: unknown, ctx: any): unknown {
  if (typeof v === 'string' && v.startsWith('$')) return resolveRef(v, ctx)
  if (Array.isArray(v)) return v.map(item => resolveValue(item, ctx))
  if (typeof v === 'object' && v !== null) {
    const result: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) result[k] = resolveValue(val, ctx)
    return result
  }
  return v
}

// ── Expression evaluation ──

function evaluateExpression(expr: string, ctx: any): unknown {
  const operators = [
    { op: '===', fn: (a: unknown, b: unknown) => a === b },
    { op: '!==', fn: (a: unknown, b: unknown) => a !== b },
    { op: '>=', fn: (a: unknown, b: unknown) => Number(a) >= Number(b) },
    { op: '<=', fn: (a: unknown, b: unknown) => Number(a) <= Number(b) },
    { op: '==', fn: (a: unknown, b: unknown) => a == b },
    { op: '!=', fn: (a: unknown, b: unknown) => a != b },
    { op: '&&', fn: (a: unknown, b: unknown) => Boolean(a) && Boolean(b) },
    { op: '||', fn: (a: unknown, b: unknown) => Boolean(a) || Boolean(b) },
    { op: '>', fn: (a: unknown, b: unknown) => Number(a) > Number(b) },
    { op: '<', fn: (a: unknown, b: unknown) => Number(a) < Number(b) },
    { op: '+', fn: (a: unknown, b: unknown) => Number(a) + Number(b) },
    { op: '-', fn: (a: unknown, b: unknown) => Number(a) - Number(b) },
    { op: '*', fn: (a: unknown, b: unknown) => Number(a) * Number(b) },
    { op: '/', fn: (a: unknown, b: unknown) => Number(a) / Number(b) },
    { op: '%', fn: (a: unknown, b: unknown) => Number(a) % Number(b) },
  ]

  let bestIdx = -1
  let bestOp: string | null = null
  let bestFn: ((a: unknown, b: unknown) => unknown) | null = null
  for (const { op, fn } of operators) {
    const idx = expr.indexOf(op)
    if (idx > 0 && (bestIdx === -1 || idx < bestIdx)) { bestIdx = idx; bestOp = op; bestFn = fn }
  }

  if (bestIdx > 0 && bestOp && bestFn) {
    const left = expr.slice(0, bestIdx).trim()
    const right = expr.slice(bestIdx + bestOp.length).trim()
    const isExpr = (s: string) => /[+\-*/%&|><=!]/.test(s) && !/^[\d.]+$/.test(s)
    const lv = isExpr(left) ? evaluateExpression(left, ctx) : /^[\d.]+$/.test(left) ? Number(left) : resolveValue(left, ctx)
    const rv = isExpr(right) ? evaluateExpression(right, ctx) : /^[\d.]+$/.test(right) ? Number(right) : resolveValue(right, ctx)
    return bestFn(lv, rv)
  }

  const trimmed = expr.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  const num = Number(trimmed)
  if (!isNaN(num) && trimmed !== '') return num
  return resolveValue(expr, ctx)
}

// ── DAG node execution ──

interface Node {
  id: string
  tool: string
  input: Record<string, unknown>
  conditions?: Array<{ test: string | boolean; body: Node[] }>
  body?: Node[]
}

interface WorkflowCtx {
  variables: Map<string, unknown>
  nodeOutputs: Map<string, unknown>
  stepCount: number
  maxSteps: number
  toolRegistry: Map<string, any>
}

async function executeNode(node: Node, ctx: WorkflowCtx): Promise<unknown> {
  const { tool: nodeType, input, conditions, body } = node
  ctx.stepCount++
  if (ctx.stepCount > ctx.maxSteps) throw new Error(`Step limit exceeded (${ctx.maxSteps})`)

  switch (nodeType) {
    case 'eval': {
      const expression = input.expression as string
      if (!expression) throw new Error('eval node requires "expression"')
      return { result: evaluateExpression(expression, ctx) }
    }
    case 'set': {
      const name = input.name as string
      if (!name) throw new Error('set node requires "name"')
      const value = typeof input.value === 'string' ? evaluateExpression(input.value as string, ctx) : resolveValue(input.value, ctx)
      ctx.variables.set(name, value)
      return value
    }
    case 'get': {
      const name = input.name as string
      if (!name) throw new Error('get node requires "name"')
      if (!ctx.variables.has(name)) throw new Error(`Variable "${name}" is not defined`)
      return ctx.variables.get(name)
    }
    case 'if': {
      for (const c of conditions ?? []) {
        const test = typeof c.test === 'string' ? Boolean(resolveValue(c.test, ctx)) : c.test
        if (test && c.body) {
          let last: unknown
          for (const n of c.body) {
            last = await executeNode(n, ctx)
            ctx.nodeOutputs.set(n.id, last)
          }
          return last
        }
      }
      return undefined
    }
    case 'while': {
      const conditionExpr = input.condition as string
      if (!conditionExpr) throw new Error('while node requires "condition"')
      let last: unknown
      let iters = 0
      while (iters < 1000) {
        iters++
        ctx.stepCount++
        if (ctx.stepCount > ctx.maxSteps) throw new Error(`Step limit exceeded`)
        if (!Boolean(evaluateExpression(conditionExpr, ctx))) break
        for (const n of body ?? []) {
          last = await executeNode(n, ctx)
          ctx.nodeOutputs.set(n.id, last)
        }
      }
      return last
    }
    case 'call': {
      const toolName = input.tool as string
      const args = resolveValue(input.args ?? {}, ctx) as Record<string, unknown>
      if (ctx.toolRegistry.has(toolName)) {
        const t = ctx.toolRegistry.get(toolName)!
        const parsed = t.parameters?.parse ? t.parameters.parse(args) : args
        return await t.execute!(parsed, { toolCallId: node.id })
      }
      throw new Error(`call node: tool "${toolName}" not found`)
    }
    case 'http': {
      const opts = resolveValue(input, ctx) as Record<string, unknown>
      const url = opts.url as string
      if (!url) throw new Error('http node requires "url"')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), (opts.timeout as number) ?? 30000)
      try {
        const res = await fetch(url, {
          method: (opts.method as string) ?? 'GET',
          headers: opts.headers as Record<string, string> ?? {},
          body: opts.method !== 'GET' ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal,
        })
        const ct = res.headers.get('content-type') ?? ''
        return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text() }
      } finally { clearTimeout(timer) }
    }
    default:
      throw new Error(`Unknown node type: "${nodeType}"`)
  }
}

// ── Tool ──

export function runWorkflow(opts: {
  tools?: Record<string, any>
  model?: LanguageModel
  maxSteps?: number
} = {}) {
  const toolRegistry = new Map<string, any>()
  if (opts.tools) {
    for (const [key, t] of Object.entries(opts.tools)) {
      toolRegistry.set(key, t)
    }
  }

  return tool({
    description: 'Execute a multi-step workflow. Supports eval, set, get, if, while, call, http nodes. Use $var.x for variables, $nodes.id.output for previous node results, $input.x for input parameters. Call nodes invoke registered tools.',
    inputSchema: z.object({
      goal: z.string().describe('What the workflow should accomplish'),
      nodes: z.array(z.object({
        id: z.string(),
        tool: z.string(),
        input: z.record(z.string(), z.unknown()).optional(),
        conditions: z.array(z.object({ test: z.any(), body: z.any() })).optional(),
        body: z.array(z.any()).optional(),
      })).optional().describe('Workflow nodes. Skip this and provide model for LLM to generate from goal.'),
    }),
    execute: async (input: { goal: string; nodes?: any[] }) => {
      let nodes: Node[]

      if (input.nodes && input.nodes.length > 0) {
        nodes = input.nodes as Node[]
      } else if (opts.model) {
        const toolsDesc = Object.entries(opts.tools ?? {})
          .map(([k, t]) => `- ${k}: ${(t as any).description}`).join('\n')
        const result = await (generateText as any)({
          model: opts.model!,
          system: [
            'You are a workflow generator. Given a user goal and available tools, output a workflow JSON.',
            '',
            'Available tools:',
            toolsDesc,
            '',
            'Node types: eval (expression), set (variable), get (variable), if (condition), while (loop), call (tool), http (request).',
            'Reference syntax: $var.name, $nodes.id.output, $nodes.id.output.field, $input.field',
            'Output ONLY valid JSON. No explanation, no markdown.',
          ].filter(Boolean).join('\n'),
          messages: [{ role: 'user', content: input.goal }],
        })

        const text = result.text.trim()
        const jsonStart = text.indexOf('{')
        const jsonEnd = text.lastIndexOf('}')
        if (jsonStart === -1 || jsonEnd === -1) throw new Error('LLM did not return valid JSON')
        const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1))
        nodes = parsed.nodes ?? parsed.workflow?.nodes ?? []
        if (!Array.isArray(nodes)) throw new Error('Generated workflow has no nodes array')
      } else {
        throw new Error('Provide either "nodes" or a "model" to generate the workflow from "goal"')
      }

      const ctx: WorkflowCtx = {
        variables: new Map(),
        nodeOutputs: new Map(),
        stepCount: 0,
        maxSteps: opts.maxSteps ?? 200,
        toolRegistry,
      }

      let lastOutput: unknown
      for (const n of nodes) {
        const output = await executeNode(n, ctx)
        ctx.nodeOutputs.set(n.id, output)
        lastOutput = output
      }

      return { result: lastOutput, nodeOutputs: Object.fromEntries(ctx.nodeOutputs) }
    },
  })
}
