import type { WorkflowContext } from './types.ts'

function getByPath(obj: unknown, path: string[]): unknown {
  let current = obj
  for (const key of path) {
    if (current === null || current === undefined) return undefined
    if (typeof current === 'object' && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  return current
}

export function resolveRef(path: string, ctx: WorkflowContext): unknown {
  if (path.startsWith('$nodes.')) {
    const afterNodes = path.slice(7)
    const dotIdx = afterNodes.indexOf('.')
    if (dotIdx === -1) {
      return ctx.nodeOutputs.get(afterNodes)
    }
    const id = afterNodes.slice(0, dotIdx)
    const propPath = afterNodes.slice(dotIdx + 1)
    const output = ctx.nodeOutputs.get(id)
    if (output === undefined) {
      throw new Error(`Node "${id}" has no output yet`)
    }
    if (propPath.startsWith('output')) {
      return getByPath(output, propPath.slice(7).split('.').filter(Boolean))
    }
    return getByPath(output, propPath.split('.'))
  }

  if (path.startsWith('$var.')) {
    const name = path.slice(5)
    if (!ctx.variables.has(name)) {
      throw new Error(`Variable "${name}" is not defined`)
    }
    return ctx.variables.get(name)
  }

  if (path.startsWith('$input.')) {
    const key = path.slice(7)
    return ctx.input[key]
  }

  if (path === 'true') return true
  if (path === 'false') return false
  if (path === 'null') return null

  const num = Number(path)
  if (!isNaN(num) && path.trim() !== '') return num

  return path
}

export function resolveValue(v: unknown, ctx: WorkflowContext): unknown {
  if (typeof v === 'string' && v.startsWith('$')) {
    return resolveRef(v, ctx)
  }
  if (Array.isArray(v)) {
    return v.map(item => resolveValue(item, ctx))
  }
  if (typeof v === 'object' && v !== null) {
    const result: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      result[k] = resolveValue(val, ctx)
    }
    return result
  }
  return v
}
