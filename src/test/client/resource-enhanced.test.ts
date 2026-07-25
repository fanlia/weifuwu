/**
 * Resource / Form / Lazy 增强测试
 */

import { describe, it, before, mock } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

before(setupJsdom)

const { createResource } = await import('../../client/resource.ts')
const { useForm } = await import('../../client/form.ts')
const { lazy } = await import('../../client/lazy.ts')
const { jsx } = await import('../../client/jsx-runtime.ts')

// ═════════════════════════════════════════════════════════════
// createResource
// ═════════════════════════════════════════════════════════════

describe('createResource', () => {
  it('初始状态为 loading', () => {
    const [data, state] = createResource(() => Promise.resolve('ok'))
    assert.equal(state.loading.value, true)
    assert.equal(state.error.value, undefined)
  })

  it('加载成功设置 data', async () => {
    const [data, state] = createResource(() => Promise.resolve('result'))
    await new Promise(r => setTimeout(r, 50))
    assert.equal(state.loading.value, false)
    assert.equal(data.value, 'result')
  })

  it('加载失败设置 error', async () => {
    const [data, state] = createResource(() => Promise.reject(new Error('fail')))
    await new Promise(r => setTimeout(r, 50))
    assert.equal(state.loading.value, false)
    assert.ok(state.error.value instanceof Error)
    assert.equal(state.error.value!.message, 'fail')
  })

  it('refetch 重新加载', async () => {
    let callCount = 0
    const [data, state] = createResource(() => Promise.resolve(++callCount))

    await new Promise(r => setTimeout(r, 50))
    assert.equal(data.value, 1)

    state.refetch()
    await new Promise(r => setTimeout(r, 50))
    assert.equal(data.value, 2)
  })

  it('fetcher 同步错误', async () => {
    const [data, state] = createResource(() => {
      throw new Error('sync error')
    })

    await new Promise(r => setTimeout(r, 50))
    assert.equal(state.loading.value, false)
    assert.ok(state.error.value)
  })

  it('initialValue', () => {
    const [data] = createResource(
      () => Promise.resolve('fetched'),
      { initialValue: 'init' },
    )
    assert.equal(data.value, 'init')
  })
})

// ═════════════════════════════════════════════════════════════
// useForm
// ═════════════════════════════════════════════════════════════

describe('useForm', () => {
  it('创建表单', () => {
    const form = useForm({
      initial: { name: 'Alice' },
      onSubmit: async (values) => { return values },
    })
    assert.ok(form)
    assert.equal(typeof form.field, 'function')
    assert.equal(typeof form.handleSubmit, 'function')
    assert.equal(typeof form.reset, 'function')
  })

  it('读取字段值', () => {
    const form = useForm({
      initial: { name: 'Alice', email: 'a@b.com' },
      onSubmit: async (values) => {},
    })
    // field().value 是 getter，返回 String(values[name] ?? '')
    assert.equal(form.field('name').value, 'Alice')
    assert.equal(form.field('email').value, 'a@b.com')
  })

  it('字段值来自 values 信号', () => {
    const form = useForm({
      initial: { name: 'Alice' },
      onSubmit: async (values) => {},
    })
    assert.equal(form.values.value.name, 'Alice')

    form.setValue('name', 'Bob')
    assert.equal(form.values.value.name, 'Bob')
    assert.equal(form.field('name').value, 'Bob')
  })

  it('重置', () => {
    const form = useForm({
      initial: { name: 'Alice' },
      onSubmit: async (values) => {},
    })
    form.setValue('name', 'Bob')
    assert.equal(form.values.value.name, 'Bob')

    form.reset()
    assert.equal(form.values.value.name, 'Alice')
  })

  it('提交通过 handleSubmit', async () => {
    let submitted = false
    const form = useForm({
      initial: { name: 'Alice' },
      onSubmit: async (values) => { submitted = true },
    })
    // handleSubmit 需要事件参数（含 preventDefault）
    const mockEvent = { preventDefault: () => {} } as Event
    await form.handleSubmit(mockEvent)
    assert(submitted)
  })
})

// ═════════════════════════════════════════════════════════════
// lazy
// ═════════════════════════════════════════════════════════════

describe('lazy', () => {
  it('创建 lazy 组件', () => {
    const LazyComp = lazy(() => Promise.resolve({ default: () => document.createElement('div') }))
    assert.ok(LazyComp)
    assert.equal(typeof LazyComp, 'function')
  })

  it('lazy 加载中返回占位元素', () => {
    const LazyComp = lazy(() => Promise.resolve({
      default: () => jsx('div', null, 'loaded'),
    }))
    const result = LazyComp({}, {} as any)
    assert.ok(result instanceof Node || result instanceof Element)
  })

  it('lazy 加载失败返回错误状态', () => {
    const LazyComp = lazy(() => Promise.reject(new Error('load failed')))
    const result = LazyComp({}, {} as any)
    assert.ok(result instanceof Element)
  })
})
