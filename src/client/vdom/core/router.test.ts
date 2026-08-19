/**
 * vdom core — router 测试（UIRouter——Trie 匹配/params 注入 ctx）
 *
 * 契约：静态段优先 → :param → * 通配（shared Trie）；params 注入
 * ctx.params（对齐后端 Object.assign）；Request 零修改；notFound 兜底。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UIRouter, frontRequest } from './router.ts'
import type { UIContext } from '../context/UIContext.ts'

function ctx(): UIContext {
  return { params: {} } as UIContext
}

test('匹配：静态段优先于 :param（shared Trie 语义）', async () => {
  const router = new UIRouter()
  router.get('/users/me', (req, c) => new Response('me'))
  router.get('/users/:id', (req, c) => new Response(`id:${c.params?.id}`))
  const r1 = await router.resolve(frontRequest('/users/me'), ctx())
  assert.equal(await r1.text(), 'me', '静态优先')
  const r2 = await router.resolve(frontRequest('/users/42'), ctx())
  assert.equal(await r2.text(), 'id:42', ':param 匹配')
})

test('params 注入 ctx（Request 零修改——对齐后端）', async () => {
  const router = new UIRouter()
  let seenReq: Request | null = null
  let seenParams: Record<string, string> | null = null
  router.get('/posts/:year/:slug', (req, c) => {
    seenReq = req
    seenParams = c.params ?? null
    return new Response('ok')
  })
  const c = ctx()
  await router.resolve(frontRequest('/posts/2026/hello-world'), c)
  assert.deepEqual(seenParams, { year: '2026', slug: 'hello-world' }, 'params 在 ctx')
  assert.equal((seenReq as unknown as Record<string, unknown>).params, undefined, 'Request 零修改')
  assert.equal(c.params?.year, '2026', '调用方 ctx 同步')
})

test('通配 *：catch-all（params["*"] = 剩余段）', async () => {
  const router = new UIRouter()
  router.get('/static/*', (req, c) => new Response(`rest:${c.params?.['*'] ?? ''}`))
  const res = await router.resolve(frontRequest('/static/js/app.js'), ctx())
  assert.equal(await res.text(), 'rest:js/app.js')
})

test('通配兜底：精确无匹配 → 通配（SPA catch-all）', async () => {
  const router = new UIRouter()
  router.get('/dashboard/overview', () => new Response('overview'))
  router.get('*', () => new Response('spa-shell'))
  const res = await router.resolve(frontRequest('/dashboard'), ctx())
  assert.equal(await res.text(), 'spa-shell', '纯前缀节点回退通配')
})

test('notFound 兜底 + 未注册 404', async () => {
  const router = new UIRouter()
  router.get('/x', () => new Response('x'))
  router.notFound(() => new Response('not-found', { status: 404 }))
  const r1 = await router.resolve(frontRequest('/nope'), ctx())
  assert.equal(r1.status, 404)
  assert.equal(await r1.text(), 'not-found')
  const r2 = new UIRouter()
  const res = await r2.resolve(frontRequest('/x'), ctx())
  assert.equal(res.status, 404, '无 notFound → 空 404')
})

test('params 每次渲染替换（不残留旧路由键）', async () => {
  const router = new UIRouter()
  router.get('/users/:id', () => new Response('u'))
  const c = ctx()
  await router.resolve(frontRequest('/users/1'), c)
  assert.deepEqual(c.params, { id: '1' })
  // 无参路由——params 替换为空（不残留 id）
  router.get('/', () => new Response('home'))
  await router.resolve(frontRequest('/'), c)
  assert.deepEqual(c.params, {}, '无参路由 params 清空（不残留）')
})
