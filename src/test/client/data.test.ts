/**
 * weifuwu/client ctx.data 数据管道测试
 *
 * 覆盖：
 *   - get 未缓存 → fetcher 调用
 *   - 同 key 并发 → in-flight 合并（fetcher 只调用一次）
 *   - set + get → 缓存命中，fetcher 不调用
 *   - __DATA__ 种子（hydration 场景）→ 直接命中，不重跑 fetcher
 *   - has
 *   - async 工厂组件 + ctx.data.get 集成
 */

import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { h, asyncComponent } from '../../client/vnode.ts'

before(setupJsdom)

const { createApp } = await import('../../client/app.ts')

/** 等微任务 */
function flush(): Promise<void> {
  return new Promise(r => setTimeout(r, 0))
}

async function mountApp() {
  const app = createApp()
  const el = document.createElement('div')
  document.body.appendChild(el)
  const id = 'dt_' + Math.random().toString(36).slice(2)
  el.id = id
  await app.mount('#' + id, () => () => h('div', {}, 'x'))
  return { app, el }
}

describe('ctx.data 数据管道', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    delete (globalThis as any).__DATA__
  })

  it('get 未缓存 → 调用 fetcher 并返回', async () => {
    const { app } = await mountApp()
    const data = app.ctx.data!
    const val = await data.get('/api/posts/1', async () => ({ title: 'hello' }))
    assert.deepEqual(val, { title: 'hello' })
    assert.equal(data.has('/api/posts/1'), true)
  })

  it('同 key 并发 → in-flight 合并，fetcher 只执行一次', async () => {
    const { app } = await mountApp()
    const data = app.ctx.data!
    let calls = 0
    const fetcher = async () => {
      calls++
      await new Promise(r => setTimeout(r, 5))
      return { n: calls }
    }
    const [a, b, c] = await Promise.all([
      data.get('/api/slow', fetcher),
      data.get('/api/slow', fetcher),
      data.get('/api/slow', fetcher),
    ])
    assert.equal(calls, 1, '并发请求应合并为一次')
    assert.deepEqual(a, { n: 1 })
    assert.deepEqual(b, { n: 1 })
    assert.deepEqual(c, { n: 1 })
  })

  it('set + get → 缓存命中，fetcher 不调用', async () => {
    const { app } = await mountApp()
    const data = app.ctx.data!
    data.set('/api/config', { theme: 'dark' })
    let calls = 0
    const val = await data.get('/api/config', async () => {
      calls++
      return { theme: 'light' }
    })
    assert.deepEqual(val, { theme: 'dark' })
    assert.equal(calls, 0, '缓存命中不应调用 fetcher')
  })

  it('__DATA__ 种子（hydration 场景）→ 直接命中，不重跑 fetcher', async () => {
    ;(globalThis as any).__DATA__ = {
      '/api/posts/7': { title: 'SSR 数据' },
      '/api/user/1': { name: 'Alice' },
    }
    const { app } = await mountApp()
    const data = app.ctx.data!
    let calls = 0
    const post = await data.get('/api/posts/7', async () => {
      calls++
      return { title: '客户端数据' }
    })
    assert.deepEqual(post, { title: 'SSR 数据' })
    assert.equal(calls, 0, 'hydration 场景不重跑 fetcher')
    // 未种子的 key 正常 fetch
    const user = await data.get('/api/other', async () => ({ ok: true }))
    assert.deepEqual(user, { ok: true })
  })

  it('无 fetcher 且无缓存 → undefined', async () => {
    const { app } = await mountApp()
    const val = await app.ctx.data!.get('/api/none')
    assert.equal(val, undefined)
  })

  it('async 工厂组件集成：ctx.data.get 数据进视图', async () => {
    const { app } = await mountApp()
    // 预置数据（模拟 SSR 种子）
    ;(globalThis as any).__DATA__ = { '/api/profile': { name: 'Bob' } }
    // 重新 mount（读种子）
    const app2 = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'dt_integrate'
    await app2.mount('#dt_integrate', () => () => h('div', {}, 'seed'))

    const Profile = asyncComponent(async (ctx) => {
      const user = await ctx.data!.get('/api/profile', async () => ({ name: 'fetched' }))
      return () => () => h('p', { id: 'profile' }, user.name)
    })

    const app3 = createApp()
    const el3 = document.createElement('div')
    document.body.appendChild(el3)
    el3.id = 'dt_integrate2'
    await app3.mount('#dt_integrate2', () => () => h(Profile, {}))
    await flush()
    assert.equal(el3.querySelector('#profile')?.textContent, 'Bob')
    void app
  })
})
