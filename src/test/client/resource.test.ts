/**
 * weifuwu/client createResource — 异步数据资源测试
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

before(() => {
  if (typeof document !== 'undefined') return
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
  })
  const win = dom.window as any
  const g = globalThis as any
  for (const key of Object.getOwnPropertyNames(win)) {
    if (key === 'Object' || key === 'Array' || key === 'Function' ||
        key === 'String' || key === 'Number' || key === 'Boolean' ||
        key === 'Symbol' || key === 'Map' || key === 'Set' ||
        key === 'RegExp' || key === 'Promise' || key === 'Error' ||
        key === 'Date' || key === 'Math' || key === 'JSON' ||
        key === 'parseInt' || key === 'parseFloat' ||
        key === 'isNaN' || key === 'isFinite' ||
        key === 'undefined' || key === 'NaN' || key === 'Infinity') continue
    if (typeof g[key] === 'undefined') {
      try { g[key] = win[key] } catch { /* read-only, skip */ }
    }
  }
})

const { createResource } = await import('../../client/resource.ts')

describe('createResource', () => {
  it('初始状态 loading=true, data=undefined', () => {
    const [data, state] = createResource(() => new Promise(() => {}))
    assert.equal(state.loading.value, true)
    assert.equal(data.value, undefined)
    assert.equal(state.error.value, undefined)
  })

  it('使用 initialValue', () => {
    const [data, state] = createResource(
      () => new Promise(() => {}),
      { initialValue: 'cached' },
    )
    assert.equal(state.loading.value, true)
    assert.equal(data.value, 'cached')
  })

  it('fetch 成功后 data 更新, loading=false', async () => {
    const [data, state] = createResource(() => Promise.resolve('ok'))
    // load() 是同步启动但异步完成的, 需要等 microtask
    await new Promise(r => setTimeout(r, 0))
    assert.equal(data.value, 'ok')
    assert.equal(state.loading.value, false)
    assert.equal(state.error.value, undefined)
  })

  it('fetch 失败时 error 更新, loading=false', async () => {
    const [data, state] = createResource(() => Promise.reject(new Error('fail')))
    await new Promise(r => setTimeout(r, 0))
    assert.equal(state.error.value?.message, 'fail')
    assert.equal(state.loading.value, false)
    assert.equal(data.value, undefined)
  })

  it('reject 非 Error 类型时包装为 Error', async () => {
    const [data, state] = createResource(() => Promise.reject('string error'))
    await new Promise(r => setTimeout(r, 0))
    assert.ok(state.error.value instanceof Error)
    assert.equal(state.error.value?.message, 'string error')
  })

  it('refetch 重新加载', async () => {
    let count = 0
    const [data, state] = createResource(() => Promise.resolve(++count))
    await new Promise(r => setTimeout(r, 0))
    assert.equal(data.value, 1)

    state.refetch()
    assert.equal(state.loading.value, true, 'refetch 后 loading 应为 true')
    await new Promise(r => setTimeout(r, 0))
    assert.equal(data.value, 2)
    assert.equal(state.loading.value, false)
  })

  it('竞态: 旧 fetch 完成后不覆盖新 fetch 的结果', async () => {
    let resolve1!: (v: string) => void
    const p1 = new Promise<string>(r => { resolve1 = r })
    let resolve2!: (v: string) => void
    const p2 = new Promise<string>(r => { resolve2 = r })

    let callCount = 0
    const [data, state] = createResource(() => {
      callCount++
      return callCount === 1 ? p1 : p2
    })

    // 第一次 fetch (p1) 还在进行中，触发第二次 fetch (p2)
    state.refetch()

    // p2 先完成
    resolve2('second')
    await new Promise(r => setTimeout(r, 0))
    assert.equal(data.value, 'second', 'p2 先完成，data 应为 second')

    // p1 后完成 — 应被丢弃
    resolve1('first')
    await new Promise(r => setTimeout(r, 0))
    assert.equal(data.value, 'second', '旧 fetch 的结果不应覆盖新 fetch')
  })
})
