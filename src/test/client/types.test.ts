/**
 * weifuwu/client types — extendCtx 测试
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extendCtx } from '../../client/types.ts'
import type { WfuiContext } from '../../client/types.ts'

describe('extendCtx', () => {
  it('合并新字段到 ctx', () => {
    const ctx: WfuiContext = { existing: 'val' }
    const result = extendCtx(ctx, { newKey: 42 })
    assert.equal(result.existing, 'val')
    assert.equal(result.newKey, 42)
  })

  it('通过原型链继承原 ctx', () => {
    const ctx: WfuiContext = { key1: 'a', key2: 'b' }
    const result = extendCtx(ctx, { key3: 'c' })
    assert.equal(result.key1, 'a')
    assert.equal(result.key2, 'b')
    assert.equal(result.key3, 'c')
  })

  it('新字段覆盖原字段', () => {
    const ctx: WfuiContext = { key: 'old' }
    const result = extendCtx(ctx, { key: 'new' })
    assert.equal(result.key, 'new')
  })

  it('不修改原 ctx', () => {
    const ctx: WfuiContext = { original: true }
    const copy = { ...ctx }
    extendCtx(ctx, { added: 'val' })
    assert.deepEqual(ctx, copy)
    assert.equal((ctx as any).added, undefined)
  })

  it('返回新对象', () => {
    const ctx: WfuiContext = {}
    const result = extendCtx(ctx, {})
    assert.notEqual(result, ctx)
  })
})
