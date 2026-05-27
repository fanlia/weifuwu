import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveRef, resolveValue } from '../../workflow/reference.ts'
import type { WorkflowContext } from '../../workflow/types.ts'

function makeCtx(overrides?: Partial<WorkflowContext>): WorkflowContext {
  return {
    variables: new Map([['count', 42]]),
    nodeOutputs: new Map([['fetch', { status: 200, body: { title: 'hello' } }]]),
    functions: {},
    stepCount: 0,
    maxSteps: 1000,
    input: { userId: 'u123' },
    toolRegistry: new Map(),
    ...overrides,
  }
}

describe('resolveRef', () => {
  it('resolves $var reference', () => {
    assert.equal(resolveRef('$var.count', makeCtx()), 42)
  })

  it('resolves $nodes.output', () => {
    const result = resolveRef('$nodes.fetch.output', makeCtx()) as any
    assert.equal(result.status, 200)
  })

  it('resolves $nodes.output.body.title', () => {
    assert.equal(resolveRef('$nodes.fetch.output.body.title', makeCtx()), 'hello')
  })

  it('resolves $input reference', () => {
    assert.equal(resolveRef('$input.userId', makeCtx()), 'u123')
  })

  it('resolves literal values', () => {
    assert.equal(resolveRef('true', makeCtx()), true)
    assert.equal(resolveRef('false', makeCtx()), false)
    assert.equal(resolveRef('null', makeCtx()), null)
    assert.equal(resolveRef('42', makeCtx()), 42)
    assert.equal(resolveRef('hello', makeCtx()), 'hello')
  })

  it('throws on undefined variable', () => {
    assert.throws(() => resolveRef('$var.nonexistent', makeCtx()))
  })

  it('throws on undefined node', () => {
    assert.throws(() => resolveRef('$nodes.nonexistent.output', makeCtx()))
  })
})

describe('resolveValue', () => {
  it('resolves string $ref', () => {
    assert.equal(resolveValue('$var.count', makeCtx()), 42)
  })

  it('passes through non-ref values', () => {
    assert.equal(resolveValue(100, makeCtx()), 100)
    assert.equal(resolveValue('plain', makeCtx()), 'plain')
  })

  it('resolves arrays recursively', () => {
    const result = resolveValue(['$var.count', 1, '$nodes.fetch.output.status'], makeCtx())
    assert.deepEqual(result, [42, 1, 200])
  })

  it('resolves objects recursively', () => {
    const result = resolveValue({ a: '$var.count', b: { c: '$nodes.fetch.output.body.title' } }, makeCtx())
    assert.deepEqual(result, { a: 42, b: { c: 'hello' } })
  })
})
