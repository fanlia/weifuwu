/**
 * weifuwu/client lazy — 懒加载组件测试
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

const { lazy } = await import('../../client/lazy.ts')
const { jsx } = await import('../../client/jsx-runtime.ts')

function fakeCtx() {
  return { route: { path: '/', params: {}, query: {}, hash: '', component: null, data: {}, loading: false }, app: { navigate: () => {} }, provide() {}, inject() { return null }, ws: null as any }
}

describe('lazy', () => {
  it('加载中显示默认占位符', async () => {
    let resolve!: (mod: any) => void
    const promise = new Promise<any>(r => { resolve = r })
    const LazyComp = lazy(() => promise)

    const el = LazyComp({}, fakeCtx() as any) as HTMLElement
    assert.equal(el.style.display, 'contents')
    assert.equal(el.textContent?.trim(), '加载中...')
    resolve({ default: (_p: any, _c: any) => jsx('div', {}, 'loaded!') })
    await promise
  })

  it('加载成功后自动切换为真实组件', async () => {
    let resolve!: (mod: any) => void
    const promise = new Promise<any>(r => { resolve = r })
    const LazyComp = lazy(() => promise)

    const el = LazyComp({}, fakeCtx() as any) as HTMLElement
    assert.equal(el.textContent?.trim(), '加载中...')

    resolve({ default: (_p: any, _c: any) => jsx('span', { id: 'done' }, 'hello') })
    await promise

    // effect 是同步的，promise 的 .then 执行后 tick 变化 → effect 重渲染
    const done = el.querySelector('#done')
    assert.ok(done, '已加载的组件应出现在 DOM 中')
    assert.equal(done?.textContent, 'hello')
  })

  it('加载失败显示错误信息', async () => {
    let reject!: (e: Error) => void
    const promise = new Promise<any>((_, r) => { reject = r })
    const LazyComp = lazy(() => promise)

    const el = LazyComp({}, fakeCtx() as any) as HTMLElement
    reject(new Error('network error'))
    await promise.catch(() => {})

    assert.ok(el.textContent?.includes('network error'), '应显示错误消息')
    assert.ok(el.textContent?.includes('组件加载失败'))
  })

  it('支持自定义 fallback', () => {
    const LazyComp = lazy(() => new Promise(() => {}), {
      fallback: () => jsx('div', { class: 'spinner' }, 'loading...'),
    })

    const el = LazyComp({}, fakeCtx() as any) as HTMLElement
    const spinner = el.querySelector('.spinner')
    assert.ok(spinner)
    assert.equal(spinner?.textContent, 'loading...')
  })

  it('支持自定义 errorFallback', async () => {
    let reject!: (e: Error) => void
    const promise = new Promise<any>((_, r) => { reject = r })
    const LazyComp = lazy(() => promise, {
      errorFallback: () => jsx('div', { class: 'err-badge' }, '出错啦'),
    })

    const el = LazyComp({}, fakeCtx() as any) as HTMLElement
    reject(new Error('fail'))
    await promise.catch(() => {})

    const badge = el.querySelector('.err-badge')
    assert.ok(badge)
    assert.equal(badge?.textContent, '出错啦')
  })

  it('加载完成后再次渲染返回已缓存组件（不重新加载）', async () => {
    let loadCount = 0
    let resolve!: (mod: any) => void
    const promise = new Promise<any>(r => { resolve = r })
    const LazyComp = lazy(() => {
      loadCount++
      return promise
    })

    // 第一次渲染
    const el1 = LazyComp({}, fakeCtx() as any) as HTMLElement
    resolve({ default: (_p: any, _c: any) => jsx('p', {}, 'cached') })
    await promise

    // 第二次渲染（组件已加载，不应再调 loader）
    const el2 = LazyComp({}, fakeCtx() as any) as HTMLElement
    assert.equal(loadCount, 1, 'loader 应只调用一次')
    assert.equal(el2.textContent, 'cached')
  })
})
