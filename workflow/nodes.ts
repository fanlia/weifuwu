import type { Node, WorkflowContext } from './types.ts'
import { resolveValue } from './reference.ts'

export type NodeExecutor = (
  node: Node,
  ctx: WorkflowContext,
) => Promise<unknown>

function evaluateExpression(expr: string, ctx: WorkflowContext): unknown {
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

  // Find the operator with the lowest precedence match (last in list) that appears in expr
  let bestIdx = -1
  let bestOp: string | null = null
  let bestFn: ((a: unknown, b: unknown) => unknown) | null = null

  for (const { op, fn } of operators) {
    const idx = expr.indexOf(op)
    if (idx > 0 && (bestIdx === -1 || idx < bestIdx)) {
      bestIdx = idx
      bestOp = op
      bestFn = fn
    }
  }

  function resolveOperand(raw: string): unknown {
    const trimmed = raw.trim()
    if (/^[\d.]+$/.test(trimmed)) return Number(trimmed)
    // Recurse for sub-expressions
    const subIdx = operators.findIndex(({ op }) => trimmed.includes(op))
    if (subIdx !== -1) return evaluateExpression(trimmed, ctx)
    return resolveValue(trimmed, ctx)
  }

  if (bestIdx > 0 && bestOp && bestFn) {
    const leftRaw = expr.slice(0, bestIdx).trim()
    const rightRaw = expr.slice(bestIdx + bestOp.length).trim()
    const left = resolveOperand(leftRaw)
    const right = resolveOperand(rightRaw)
    return bestFn(left, right)
  }

  const trimmed = expr.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  const num = Number(trimmed)
  if (!isNaN(num) && trimmed !== '') return num

  return resolveValue(expr, ctx)
}

export async function executeEval(node: Node, ctx: WorkflowContext): Promise<unknown> {
  const expression = node.input.expression as string
  if (!expression) throw new Error('eval node requires "expression" field')
  const result = evaluateExpression(expression, ctx)
  return { result }
}

export async function executeSet(node: Node, ctx: WorkflowContext): Promise<unknown> {
  const name = node.input.name as string
  const value = node.input.value
  if (!name) throw new Error('set node requires "name" field')

  let resolved: unknown
  if (typeof value === 'string') {
    resolved = evaluateExpression(value, ctx)
  } else {
    resolved = resolveValue(value ?? null, ctx)
  }

  ctx.variables.set(name, resolved)
  return resolved
}

export async function executeGet(node: Node, ctx: WorkflowContext): Promise<unknown> {
  const name = node.input.name as string
  if (!name) throw new Error('get node requires "name" field')
  if (!ctx.variables.has(name)) {
    throw new Error(`Variable "${name}" is not defined`)
  }
  return ctx.variables.get(name)
}

export async function executeIf(node: Node, ctx: WorkflowContext): Promise<unknown> {
  const conditions = node.conditions ?? []
  for (const condition of conditions) {
    const test = typeof condition.test === 'string'
      ? Boolean(resolveValue(condition.test, ctx))
      : condition.test

    if (test && condition.body) {
      let lastOutput: unknown = undefined
      for (const bodyNode of condition.body) {
        lastOutput = await executeNode(bodyNode, ctx)
      }
      return lastOutput
    }
  }
  return undefined
}

export async function executeWhile(node: Node, ctx: WorkflowContext): Promise<unknown> {
  const conditionExpr = node.input.condition as string
  if (!conditionExpr) throw new Error('while node requires "condition" field')

  let lastOutput: unknown = undefined
  let iterations = 0
  const maxIterations = 1000

  while (iterations < maxIterations) {
    iterations++
    ctx.stepCount++
    if (ctx.stepCount > ctx.maxSteps) {
      throw new Error(`Step limit exceeded (${ctx.maxSteps})`)
    }

    const condition = Boolean(evaluateExpression(conditionExpr, ctx))
    if (!condition) break

    for (const bodyNode of node.body ?? []) {
      lastOutput = await executeNode(bodyNode, ctx)
    }
  }

  return lastOutput
}

export async function executeCall(node: Node, ctx: WorkflowContext): Promise<unknown> {
  const toolName = node.input.tool as string
  const args = node.input.args as Record<string, unknown> ?? {}

  if (toolName && ctx.toolRegistry.has(toolName)) {
    const tool = ctx.toolRegistry.get(toolName)!
    const resolvedInput = resolveValue(args, ctx) as Record<string, unknown>
    const parsed = tool.inputSchema.parse(resolvedInput)

    return tool.execute(parsed, {
      nodeId: node.id,
      workflowId: ctx.workflowId,
      onStream: async (event) => {
        if (ctx.sseManager && ctx.workflowId) {
          ctx.sseManager.send(ctx.workflowId, { event: 'llm-stream', data: { nodeId: node.id, ...event } })
        }
      },
    })
  }

  const functionName = node.input.function as string
  if (functionName && ctx.functions[functionName]) {
    const fn = ctx.functions[functionName]!
    const prevFunctions = ctx.functions
    const prevInput = ctx.input

    ctx.input = resolveValue(args, ctx) as Record<string, unknown>

    let lastOutput: unknown = undefined
    for (const bodyNode of fn.workflow.nodes) {
      lastOutput = await executeNode(bodyNode, ctx)
    }

    ctx.input = prevInput
    return lastOutput
  }

  throw new Error(`call node: tool "${toolName ?? functionName}" not found`)
}

export async function executeHttp(node: Node, ctx: WorkflowContext): Promise<unknown> {
  const input = resolveValue(node.input, ctx) as Record<string, unknown>
  const url = input.url as string
  if (!url) throw new Error('http node requires "url" field')

  const controller = new AbortController()
  const timeout = (input.timeout as number) ?? 30000
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const fetchInit: RequestInit = {
      method: (input.method as string) ?? 'GET',
      headers: input.headers as Record<string, string> ?? {},
      signal: controller.signal,
    }

    if (input.body && fetchInit.method !== 'GET') {
      fetchInit.body = JSON.stringify(input.body)
    }

    const response = await fetch(url, fetchInit)
    const contentType = response.headers.get('content-type') ?? ''
    const body = contentType.includes('application/json')
      ? await response.json()
      : await response.text()

    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    }
  } finally {
    clearTimeout(timer)
  }
}

const executors: Record<string, NodeExecutor> = {
  eval: executeEval,
  set: executeSet,
  get: executeGet,
  if: executeIf,
  while: executeWhile,
  call: executeCall,
  http: executeHttp,
}

export async function executeNode(node: Node, ctx: WorkflowContext): Promise<unknown> {
  const executor = executors[node.tool]
  if (!executor) {
    throw new Error(`Unknown node type: "${node.tool}"`)
  }
  return executor(node, ctx)
}
